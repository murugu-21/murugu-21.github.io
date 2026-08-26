import {TOOLS, type ModelMessage} from "./prompt";
import {consumeSse, type StreamResult, type Usage} from "./sse";

// DeepSeek V4-Flash is the only chat provider. It replaced Workers AI
// (2026-08-27), which was slow enough to be visible in the widget and whose
// free neuron allocation cut replies off mid-stream.
export const DEEPSEEK_MODEL = "deepseek-v4-flash";
export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

// Thrown by runDeepseekExchange so callers can tell "out of credit" (gate the
// widget politely) from a genuine fault (apologise and let them retry).
export class DeepseekError extends Error {
  constructor(readonly status: number) {
    super(`deepseek request failed: ${status}`);
    this.name = "DeepseekError";
  }
}

// DeepSeek answers a spent account with 402 Insufficient Balance. It is the
// authoritative signal — the cached balance below can be stale or, if the
// balance endpoint is unreachable, never fetched at all.
export function isInsufficientBalance(err: unknown): boolean {
  return err instanceof DeepseekError && err.status === 402;
}

export type DeepseekBalance = {available: boolean; totalUsd: number};

// GET /user/balance on the same key that pays for chat. `is_available` is
// DeepSeek's own verdict on whether the account can serve requests; the
// dollar figure is returned as a decimal *string* per currency.
export async function fetchDeepseekBalance(
  apiKey: string,
  fetcher: typeof fetch = fetch
): Promise<DeepseekBalance> {
  const res = await fetcher(`${DEEPSEEK_BASE_URL}/user/balance`, {
    headers: {authorization: `Bearer ${apiKey}`}
  });
  if (!res.ok) throw new DeepseekError(res.status);
  const body = (await res.json()) as {
    is_available?: unknown;
    balance_infos?: {currency?: unknown; total_balance?: unknown}[];
  };
  const usd = body.balance_infos?.find(b => b.currency === "USD");
  const totalUsd = Number(usd?.total_balance);
  return {
    available: body.is_available === true,
    totalUsd: Number.isFinite(totalUsd) ? totalUsd : 0
  };
}

// When the API omits usage, fall back to a chars/4 heuristic; stringifying
// the messages overestimates slightly, which errs on the safe side for the
// spend budget.
function estimateUsage(messages: ModelMessage[], content: string): Usage {
  return {
    promptTokens: Math.ceil(JSON.stringify(messages).length / 4),
    completionTokens: Math.ceil(content.length / 4)
  };
}

// One exchange against DeepSeek's OpenAI-compatible chat completions
// endpoint. The request/response shapes are the strict OpenAI dialect the
// rest of the worker already speaks, so consumeSse parses the stream
// unchanged.
export async function runDeepseekExchange(
  apiKey: string,
  messages: ModelMessage[],
  onDelta: (text: string) => void,
  fetcher: typeof fetch = fetch
): Promise<StreamResult> {
  const res = await fetcher(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages,
      tools: TOOLS,
      stream: true,
      stream_options: {include_usage: true},
      // V4-Flash thinks by default and its reasoning counts against any
      // output cap: under the old max_tokens: 800 a grounded question burned
      // the whole budget on `reasoning_content` (which this worker drops) and
      // returned an empty reply. Concierge answers need none of it.
      thinking: {type: "disabled"}
      // No max_tokens: it bounded the Workers AI neuron cost per call, and on
      // a paid API it only risked truncating a long answer mid-sentence.
      // Reply length is governed by the prompt, and spend by the account
      // balance the RateLimiter checks.
    })
  });
  if (!res.ok || !res.body) throw new DeepseekError(res.status);
  const result = await consumeSse(res.body, onDelta);
  result.usage ??= estimateUsage(messages, result.content);
  return result;
}
