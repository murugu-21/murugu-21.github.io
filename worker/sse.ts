import { z } from "zod";

import { jsonString, lenient } from "../utils/json";

// Upstream chunks are untrusted: a malformed field or array element is dropped, not fatal to
// the stream.

const ToolCallDelta = z.object({
  index: lenient(z.number()),
  id: lenient(z.string()),
  function: lenient(z.object({ name: lenient(z.string()), arguments: lenient(z.string()) }))
});

const Choice = z.object({
  delta: lenient(
    z.object({
      content: lenient(z.string()),
      tool_calls: lenient(z.array(lenient(ToolCallDelta)))
    })
  )
});

const SseChunk = jsonString(
  z.object({
    usage: lenient(z.object({ prompt_tokens: z.number(), completion_tokens: z.number() })),
    choices: lenient(z.array(lenient(Choice)))
  })
);

// `id` is synthesized when missing: the tool-result message must reference it.
export type ToolCall = { id: string; name: string; arguments: string };

export type Usage = { promptTokens: number; completionTokens: number };

export type StreamResult = {
  content: string;
  toolCalls: ToolCall[];
  usage: Usage | null;
};

/** Reads a decoded SSE stream (pipe bytes through a TextDecoderStream first). */
export async function consumeSse(
  stream: ReadableStream<string>,
  onDelta: (text: string) => void
): Promise<StreamResult> {
  const reader = stream.getReader();
  const toolCalls: ToolCall[] = [];
  let buffer = "";
  let content = "";
  let usage: Usage | null = null;

  const handleLine = (line: string): void => {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (payload === "" || payload === "[DONE]") return;
    const data = SseChunk.safeParse(payload).data;
    if (!data) return;

    // Usage arrives on the final event.
    if (data.usage) {
      usage = {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens
      };
    }

    const delta = data.choices?.[0]?.delta?.content;
    if (delta) {
      content += delta;
      onDelta(delta);
    }

    for (const tc of data.choices?.[0]?.delta?.tool_calls ?? []) {
      if (!tc) continue;
      const i = tc.index ?? 0;
      toolCalls[i] ??= { id: "", name: "", arguments: "" };
      if (tc.id) toolCalls[i].id = tc.id;
      if (tc.function?.name) toolCalls[i].name = tc.function.name;
      if (tc.function?.arguments) toolCalls[i].arguments += tc.function.arguments;
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) for (const line of event.split("\n")) handleLine(line);
  }
  for (const line of buffer.split("\n")) handleLine(line);

  return {
    content,
    toolCalls: toolCalls
      .filter(t => t && t.name)
      .map((t, i) => ({ ...t, id: t.id || `call_${i}` })),
    usage
  };
}
