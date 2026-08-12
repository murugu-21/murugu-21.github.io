import {CAPTURE_TOOL, MODEL_ID, type ModelMessage} from "./prompt";
import {consumeSse, type StreamResult, type ToolCall} from "./sse";

export type AiLike = {
  run(model: string, options: Record<string, unknown>): Promise<unknown>;
};

function asArgString(args: unknown): string {
  return typeof args === "string" ? args : JSON.stringify(args ?? {});
}

export async function runModelExchange(
  ai: AiLike,
  messages: ModelMessage[],
  onDelta: (text: string) => void
): Promise<StreamResult> {
  const res = await ai.run(MODEL_ID, {
    messages,
    tools: [CAPTURE_TOOL],
    stream: true,
    max_tokens: 800
  });

  if (res instanceof ReadableStream) {
    return consumeSse(res as ReadableStream<Uint8Array>, onDelta);
  }

  // Some model/tool combinations answer with a plain JSON body even when
  // stream: true was requested — normalize both documented shapes. Both
  // `tool_calls` shapes share this element type so `tc.name`/`tc.arguments`
  // are always valid to read, whichever shape actually supplied them.
  type RawToolCall = {
    name?: string;
    arguments?: unknown;
    function?: {name?: string; arguments?: unknown};
  };
  const body = res as {
    response?: string;
    tool_calls?: RawToolCall[];
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
    .map(tc => ({
      name: tc.function?.name ?? tc.name ?? "",
      arguments: asArgString(tc.function?.arguments ?? tc.arguments)
    }))
    .filter(tc => tc.name);
  return {content, toolCalls};
}
