export type ToolCall = {name: string; arguments: string};

export type Usage = {promptTokens: number; completionTokens: number};

export type StreamResult = {
  content: string;
  toolCalls: ToolCall[];
  usage: Usage | null;
};

type PartialToolCall = {name: string; arguments: string};

function asArgString(args: unknown): string {
  return typeof args === "string" ? args : JSON.stringify(args ?? {});
}

export async function consumeSse(
  stream: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void
): Promise<StreamResult> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  const incremental: PartialToolCall[] = [];
  const whole: ToolCall[] = [];
  let buffer = "";
  let content = "";
  let usage: Usage | null = null;

  const handleLine = (line: string): void => {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (payload === "" || payload === "[DONE]") return;
    let data: {
      response?: unknown;
      tool_calls?: unknown;
      usage?: {prompt_tokens?: unknown; completion_tokens?: unknown};
      choices?: {
        delta?: {
          content?: unknown;
          tool_calls?: {
            index?: number;
            function?: {name?: string; arguments?: string};
          }[];
        };
      }[];
    };
    try {
      data = JSON.parse(payload);
    } catch {
      return;
    }

    // Usage arrives on the final event (both API shapes use snake_case).
    if (
      typeof data.usage?.prompt_tokens === "number" &&
      typeof data.usage?.completion_tokens === "number"
    ) {
      usage = {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens
      };
    }

    const delta =
      typeof data.response === "string"
        ? data.response
        : data.choices?.[0]?.delta?.content;
    if (typeof delta === "string" && delta.length > 0) {
      content += delta;
      onDelta(delta);
    }

    for (const tc of data.choices?.[0]?.delta?.tool_calls ?? []) {
      const i = tc.index ?? 0;
      incremental[i] ??= {name: "", arguments: ""};
      if (tc.function?.name) incremental[i].name = tc.function.name;
      if (tc.function?.arguments)
        incremental[i].arguments += tc.function.arguments;
    }

    if (Array.isArray(data.tool_calls)) {
      for (const tc of data.tool_calls as {
        name?: string;
        arguments?: unknown;
        function?: {name?: string; arguments?: unknown};
      }[]) {
        const name = tc.name ?? tc.function?.name ?? "";
        if (name)
          whole.push({
            name,
            arguments: asArgString(tc.arguments ?? tc.function?.arguments)
          });
      }
    }
  };

  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, {stream: true});
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events)
      for (const line of event.split("\n")) handleLine(line);
  }
  for (const line of buffer.split("\n")) handleLine(line);

  return {
    content,
    toolCalls: [...incremental.filter(t => t && t.name), ...whole],
    usage
  };
}
