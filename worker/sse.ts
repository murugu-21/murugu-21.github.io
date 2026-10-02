// `id` is synthesized when missing: the tool-result message must reference it.
export type ToolCall = { id: string; name: string; arguments: string };

export type Usage = { promptTokens: number; completionTokens: number };

export type StreamResult = {
  content: string;
  toolCalls: ToolCall[];
  usage: Usage | null;
};

function toolCallId(id: unknown, index: number): string {
  return typeof id === "string" && id.length > 0 ? id : `call_${index}`;
}

export async function consumeSse(
  stream: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void
): Promise<StreamResult> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  const toolCalls: ToolCall[] = [];
  let buffer = "";
  let content = "";
  let usage: Usage | null = null;

  const handleLine = (line: string): void => {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (payload === "" || payload === "[DONE]") return;
    let data: {
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
      choices?: {
        delta?: {
          content?: unknown;
          tool_calls?: {
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }[];
        };
      }[];
    };
    try {
      data = JSON.parse(payload);
    } catch {
      return;
    }

    // Usage arrives on the final event.
    if (
      typeof data.usage?.prompt_tokens === "number" &&
      typeof data.usage?.completion_tokens === "number"
    ) {
      usage = {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens
      };
    }

    const delta = data.choices?.[0]?.delta?.content;
    if (typeof delta === "string" && delta.length > 0) {
      content += delta;
      onDelta(delta);
    }

    for (const tc of data.choices?.[0]?.delta?.tool_calls ?? []) {
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
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) for (const line of event.split("\n")) handleLine(line);
  }
  for (const line of buffer.split("\n")) handleLine(line);

  return {
    content,
    toolCalls: toolCalls
      .filter(t => t && t.name)
      .map((t, i) => ({ ...t, id: toolCallId(t.id, i) })),
    usage
  };
}
