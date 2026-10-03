import { z } from "zod";

import { lenient } from "./json";
import { TOOLS, type ModelMessage } from "./prompt";
import { consumeSse, type StreamResult, type Usage } from "./sse";

// Always the current Flash generation. Before swapping it, run `bun run test:capture`:
// some models narrate a lead capture without calling capture_opportunity, losing the lead.
export const DEEPSEEK_MODEL = "deepseek-flash";
export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

class DeepseekError extends Error {
  constructor(readonly status: number) {
    super(`deepseek request failed: ${status}`);
    this.name = "DeepseekError";
  }
}

// 402 Insufficient Balance is authoritative; the cached balance can be stale.
export function isInsufficientBalance(err: unknown): boolean {
  return err instanceof DeepseekError && err.status === 402;
}

export type DeepseekBalance = { available: boolean; totalUsd: number };

// `total_balance` arrives as a decimal string per currency.
const BalanceResponse = z.object({
  is_available: lenient(z.boolean()),
  balance_infos: lenient(
    z.array(
      lenient(z.object({ currency: z.string(), total_balance: z.union([z.string(), z.number()]) }))
    )
  )
});

export async function fetchDeepseekBalance(
  apiKey: string,
  fetcher: typeof fetch = fetch
): Promise<DeepseekBalance> {
  const res = await fetcher(`${DEEPSEEK_BASE_URL}/user/balance`, {
    headers: { authorization: `Bearer ${apiKey}` }
  });
  if (!res.ok) throw new DeepseekError(res.status);
  const body = BalanceResponse.parse(await res.json());
  const usd = body.balance_infos?.find(b => b?.currency === "USD");
  const totalUsd = Number(usd?.total_balance);
  return {
    available: body.is_available === true,
    totalUsd: Number.isFinite(totalUsd) ? totalUsd : 0
  };
}

// chars/4 fallback when the API omits usage; overestimates, which is safe for
// the spend budget.
function estimateUsage(messages: ModelMessage[], content: string): Usage {
  return {
    promptTokens: Math.ceil(JSON.stringify(messages).length / 4),
    completionTokens: Math.ceil(content.length / 4)
  };
}

export async function runDeepseekExchange({
  apiKey,
  messages,
  onDelta,
  fetcher = fetch
}: {
  apiKey: string;
  messages: ModelMessage[];
  onDelta: (text: string) => void;
  fetcher?: typeof fetch;
}): Promise<StreamResult> {
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
      stream_options: { include_usage: true },
      // Reasoning improves tool-call choice; consumeSse drops its deltas.
      // No max_tokens: reasoning can exhaust a cap and return an empty reply.
      thinking: { type: "enabled" }
    })
  });
  if (!res.ok || !res.body) throw new DeepseekError(res.status);
  const result = await consumeSse(res.body.pipeThrough(new TextDecoderStream()), onDelta);
  result.usage ??= estimateUsage(messages, result.content);
  return result;
}
