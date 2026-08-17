import {MODEL_ID, TOOLS, type ModelMessage} from "./prompt";
import {
  consumeSse,
  toolCallId,
  type StreamResult,
  type ToolCall,
  type Usage
} from "./sse";

export type AiLike = {
  run(model: string, options: Record<string, unknown>): Promise<unknown>;
};

// Paid overflow model, used only when the free Workers AI neuron allocation
// is spent (BYOK — the Worker calls DeepSeek's OpenAI-compatible API
// directly). ~$0.0004 per grounded exchange at V4-Flash list prices.
export const DEEPSEEK_MODEL = "deepseek-v4-flash";
export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

function asArgString(args: unknown): string {
  return typeof args === "string" ? args : JSON.stringify(args ?? {});
}

// When the API omits usage, fall back to a chars/4 heuristic; stringifying
// the messages overestimates slightly, which errs on the safe side for the
// neuron budget.
function estimateUsage(messages: ModelMessage[], content: string): Usage {
  return {
    promptTokens: Math.ceil(JSON.stringify(messages).length / 4),
    completionTokens: Math.ceil(content.length / 4)
  };
}

export async function runModelExchange(
  ai: AiLike,
  messages: ModelMessage[],
  onDelta: (text: string) => void
): Promise<StreamResult> {
  const res = await ai.run(MODEL_ID, {
    messages,
    tools: TOOLS,
    stream: true,
    max_tokens: 800
  });

  if (res instanceof ReadableStream) {
    const result = await consumeSse(res as ReadableStream<Uint8Array>, onDelta);
    result.usage ??= estimateUsage(messages, result.content);
    return result;
  }

  // Some model/tool combinations answer with a plain JSON body even when
  // stream: true was requested — normalize both documented shapes. Both
  // `tool_calls` shapes share this element type so `tc.name`/`tc.arguments`
  // are always valid to read, whichever shape actually supplied them.
  type RawToolCall = {
    id?: string;
    name?: string;
    arguments?: unknown;
    function?: {name?: string; arguments?: unknown};
  };
  const body = res as {
    response?: string;
    tool_calls?: RawToolCall[];
    usage?: {prompt_tokens?: unknown; completion_tokens?: unknown};
    choices?: {
      message?: {
        content?: string;
        tool_calls?: RawToolCall[];
      };
    }[];
  };
  const content = body.response ?? body.choices?.[0]?.message?.content ?? "";
  if (content) onDelta(content);
  const rawCalls =
    body.tool_calls ?? body.choices?.[0]?.message?.tool_calls ?? [];
  const toolCalls: ToolCall[] = rawCalls
    .map((tc, i) => ({
      id: toolCallId(tc.id, i),
      name: tc.function?.name ?? tc.name ?? "",
      arguments: asArgString(tc.function?.arguments ?? tc.arguments)
    }))
    .filter(tc => tc.name);
  const usage: Usage =
    typeof body.usage?.prompt_tokens === "number" &&
    typeof body.usage?.completion_tokens === "number"
      ? {
          promptTokens: body.usage.prompt_tokens,
          completionTokens: body.usage.completion_tokens
        }
      : estimateUsage(messages, content);
  return {content, toolCalls, usage};
}

// Same contract as runModelExchange, but against DeepSeek's OpenAI-compatible
// chat completions endpoint. The request/response shapes are the strict
// OpenAI dialect the rest of the worker already speaks, so consumeSse parses
// the stream unchanged.
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
      max_tokens: 800
    })
  });
  if (!res.ok || !res.body) {
    throw new Error(`deepseek request failed: ${res.status}`);
  }
  const result = await consumeSse(res.body, onDelta);
  result.usage ??= estimateUsage(messages, result.content);
  return result;
}
