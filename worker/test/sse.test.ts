import {describe, expect, it} from "vitest";

import {consumeSse} from "../sse";

function sseStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode(e));
      controller.close();
    }
  });
}

describe("consumeSse", () => {
  it("accumulates response-shape deltas and reports them", async () => {
    const deltas: string[] = [];
    const result = await consumeSse(
      sseStream([
        'data: {"response":"Hel"}\n\n',
        'data: {"response":"lo"}\n\ndata: [DONE]\n\n'
      ]),
      t => deltas.push(t)
    );
    expect(result.content).toBe("Hello");
    expect(deltas).toEqual(["Hel", "lo"]);
    expect(result.toolCalls).toEqual([]);
    expect(result.usage).toBeNull();
  });

  it("captures usage from the final event", async () => {
    const result = await consumeSse(
      sseStream([
        'data: {"response":"hi"}\n\n',
        'data: {"response":"","usage":{"prompt_tokens":1200,"completion_tokens":34}}\n\n',
        "data: [DONE]\n\n"
      ]),
      () => {}
    );
    expect(result.usage).toEqual({promptTokens: 1200, completionTokens: 34});
  });

  it("accumulates chat-completions deltas split across reads", async () => {
    const chunk = 'data: {"choices":[{"delta":{"content":"wor"}}]}\n\n';
    const result = await consumeSse(
      sseStream([
        chunk.slice(0, 20),
        chunk.slice(20),
        'data: {"choices":[{"delta":{"content":"ld"}}]}\n\n'
      ]),
      () => {}
    );
    expect(result.content).toBe("world");
  });

  it("assembles incremental tool_call fragments by index", async () => {
    const result = await consumeSse(
      sseStream([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"capture_opportunity","arguments":""}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"contact\\":"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"a@b.c\\"}"}}]}}]}\n\n'
      ]),
      () => {}
    );
    expect(result.toolCalls).toEqual([
      {
        id: "call_0",
        name: "capture_opportunity",
        arguments: '{"contact":"a@b.c"}'
      }
    ]);
  });

  it("preserves provider-sent OpenAI tool call ids", async () => {
    const result = await consumeSse(
      sseStream([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_abc123","function":{"name":"capture_opportunity","arguments":"{}"}}]}}]}\n\n'
      ]),
      () => {}
    );
    expect(result.toolCalls[0].id).toBe("call_abc123");
  });

  it("collects whole tool_calls arrays (non-incremental shape)", async () => {
    const result = await consumeSse(
      sseStream([
        'data: {"tool_calls":[{"name":"capture_opportunity","arguments":{"contact":"x@y.z","summary":"role"}}]}\n\n'
      ]),
      () => {}
    );
    expect(result.toolCalls).toEqual([
      {
        id: "call_0",
        name: "capture_opportunity",
        arguments: '{"contact":"x@y.z","summary":"role"}'
      }
    ]);
  });

  it("skips malformed JSON lines without dying", async () => {
    const result = await consumeSse(
      sseStream(["data: {broken\n\n", 'data: {"response":"ok"}\n\n']),
      () => {}
    );
    expect(result.content).toBe("ok");
  });
});
