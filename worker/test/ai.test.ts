import {describe, expect, it} from "vitest";

import {runDeepseekExchange, runModelExchange} from "../ai";
import {CAPTURE_TOOL, MODEL_ID} from "../prompt";

function sseStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode(e));
      controller.close();
    }
  });
}

describe("runModelExchange", () => {
  it("requests the pinned model with streaming, tools and the given messages", async () => {
    let captured: {model?: string; options?: Record<string, unknown>} = {};
    const ai = {
      run: async (model: string, options: Record<string, unknown>) => {
        captured = {model, options};
        return sseStream(['data: {"response":"hi"}\n\n']);
      }
    };
    const result = await runModelExchange(
      ai,
      [{role: "user", content: "yo"}],
      () => {}
    );
    expect(captured.model).toBe(MODEL_ID);
    expect(captured.options).toMatchObject({
      stream: true,
      tools: [CAPTURE_TOOL]
    });
    expect(result.content).toBe("hi");
  });

  it("handles a non-stream chat-completions body", async () => {
    const ai = {
      run: async () => ({
        choices: [
          {
            message: {
              content: "sure",
              tool_calls: [
                {
                  function: {
                    name: "capture_opportunity",
                    arguments: '{"contact":"a@b.c","summary":"s"}'
                  }
                }
              ]
            }
          }
        ]
      })
    };
    const deltas: string[] = [];
    const result = await runModelExchange(ai, [], t => deltas.push(t));
    expect(result.content).toBe("sure");
    expect(deltas).toEqual(["sure"]);
    expect(result.toolCalls).toEqual([
      {
        id: "call_0",
        name: "capture_opportunity",
        arguments: '{"contact":"a@b.c","summary":"s"}'
      }
    ]);
  });

  it("handles a non-stream response/tool_calls body", async () => {
    const ai = {
      run: async () => ({
        response: "ok",
        tool_calls: [
          {name: "capture_opportunity", arguments: {contact: "x", summary: "y"}}
        ]
      })
    };
    const result = await runModelExchange(ai, [], () => {});
    expect(result.content).toBe("ok");
    expect(result.toolCalls[0].name).toBe("capture_opportunity");
    expect(JSON.parse(result.toolCalls[0].arguments)).toEqual({
      contact: "x",
      summary: "y"
    });
  });
});

describe("runDeepseekExchange", () => {
  function sseResponse(events: string[]): Response {
    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream({
        start(controller) {
          for (const e of events) controller.enqueue(encoder.encode(e));
          controller.close();
        }
      }),
      {status: 200}
    );
  }

  it("sends an OpenAI chat-completions request and parses the stream", async () => {
    let captured: {url: string; init: RequestInit} | null = null;
    const fetcher = (async (
      url: string | URL | Request,
      init?: RequestInit
    ) => {
      captured = {url: String(url), init: init!};
      return sseResponse([
        'data: {"choices":[{"delta":{"content":"hi there"}}]}\n\n',
        'data: {"choices":[],"usage":{"prompt_tokens":2100,"completion_tokens":12}}\n\n',
        "data: [DONE]\n\n"
      ]);
    }) as typeof fetch;

    const deltas: string[] = [];
    const result = await runDeepseekExchange(
      "sk-test",
      [{role: "user", content: "hello"}],
      t => deltas.push(t),
      fetcher
    );

    expect(captured!.url).toBe("https://api.deepseek.com/chat/completions");
    const headers = captured!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk-test");
    const body = JSON.parse(captured!.init.body as string);
    expect(body.model).toBe("deepseek-v4-flash");
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({include_usage: true});
    expect(body.tools[0].function.name).toBe("capture_opportunity");

    expect(result.content).toBe("hi there");
    expect(deltas).toEqual(["hi there"]);
    expect(result.usage).toEqual({promptTokens: 2100, completionTokens: 12});
  });

  it("throws on a non-ok response", async () => {
    const fetcher = (async () =>
      new Response("nope", {status: 402})) as typeof fetch;
    await expect(
      runDeepseekExchange("sk-test", [], () => {}, fetcher)
    ).rejects.toThrow("deepseek request failed: 402");
  });
});
