import { describe, expect, it } from "vitest";

import { fetchDeepseekBalance, isInsufficientBalance, runDeepseekExchange } from "../ai";
import { buildMessages, CAPTURE_TOOL, MAX_HISTORY_MESSAGES } from "../prompt";
import { consumeSse } from "../sse";

function sseStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode(e));
      controller.close();
    }
  });
}

describe("runDeepseekExchange", () => {
  it("sends an OpenAI chat-completions request and parses the stream", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), init: init! };
      return new Response(
        sseStream([
          'data: {"choices":[{"delta":{"content":"hi there"}}]}\n\n',
          'data: {"choices":[],"usage":{"prompt_tokens":2100,"completion_tokens":12}}\n\n',
          "data: [DONE]\n\n"
        ])
      );
    }) as typeof fetch;

    const deltas: string[] = [];
    const result = await runDeepseekExchange(
      "sk-test",
      [{ role: "user", content: "hello" }],
      t => deltas.push(t),
      fetcher
    );

    expect(captured!.url).toBe("https://api.deepseek.com/chat/completions");
    const headers = captured!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk-test");
    const body = JSON.parse(captured!.init.body as string);
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
    // Reasoning sharpens tool selection; with no max_tokens it can't starve the reply.
    expect(body.thinking).toEqual({ type: "enabled" });
    // Truncating a concierge answer mid-sentence is worse than the tokens it
    // saves; length is the prompt's job and spend is the RateLimiter's.
    expect(body.max_tokens).toBeUndefined();
    expect(body.tools[0].function.name).toBe("capture_opportunity");

    expect(result.content).toBe("hi there");
    expect(deltas).toEqual(["hi there"]);
    expect(result.usage).toEqual({ promptTokens: 2100, completionTokens: 12 });
  });

  it("rejects a non-ok response, flagging only a 402 as an exhausted balance", async () => {
    const failing = (status: number) =>
      (async () => new Response("no", { status })) as typeof fetch;
    const error = (status: number) =>
      runDeepseekExchange("sk-test", [], () => {}, failing(status)).then(
        () => expect.unreachable(),
        (e: unknown) => e
      );

    expect(isInsufficientBalance(await error(402))).toBe(true);
    expect(isInsufficientBalance(await error(500))).toBe(false);
    expect(isInsufficientBalance(new Error("402"))).toBe(false);
  });
});

describe("fetchDeepseekBalance", () => {
  function json(body: unknown, status = 200): typeof fetch {
    return (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
  }

  it("reads is_available and the USD balance, ignoring other currencies", async () => {
    const balance = await fetchDeepseekBalance(
      "sk-test",
      json({
        is_available: true,
        balance_infos: [
          { currency: "CNY", total_balance: "7.00" },
          { currency: "USD", total_balance: "1.99" }
        ]
      })
    );
    // total_balance is a decimal string in the API response, not a number.
    expect(balance).toEqual({ available: true, totalUsd: 1.99 });
  });

  it("reports zero when there is no USD row", async () => {
    const balance = await fetchDeepseekBalance(
      "sk-test",
      json({ is_available: true, balance_infos: [] })
    );
    expect(balance).toEqual({ available: true, totalUsd: 0 });
  });

  it("throws on a non-OK response", async () => {
    await expect(fetchDeepseekBalance("sk-test", json({}, 401))).rejects.toThrow("401");
  });
});

describe("consumeSse", () => {
  it("accumulates response-shape deltas and reports them", async () => {
    const deltas: string[] = [];
    const result = await consumeSse(
      sseStream(['data: {"response":"Hel"}\n\n', 'data: {"response":"lo"}\n\ndata: [DONE]\n\n']),
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
    expect(result.usage).toEqual({ promptTokens: 1200, completionTokens: 34 });
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
      { id: "call_0", name: "capture_opportunity", arguments: '{"contact":"a@b.c"}' }
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

describe("buildMessages", () => {
  it("puts grounding into a single system message followed by history", () => {
    const history = [
      { role: "user" as const, content: "hi" },
      { role: "assistant" as const, content: "hello" }
    ];
    const messages = buildMessages("GROUNDING", history);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("GROUNDING");
    expect(messages.slice(1)).toEqual(history);
  });

  it("appends a page-context system message only when a page is given", () => {
    const history = [{ role: "user" as const, content: "hi" }];
    const last = buildMessages("g", history, "/blog/react/").at(-1);
    expect(last?.role).toBe("system");
    expect(last?.content).toContain("https://murugappan.dev/blog/react/");
    expect(buildMessages("g", history).at(-1)?.role).toBe("user");
  });

  it("clips history to the most recent MAX_HISTORY_MESSAGES", () => {
    const history = Array.from({ length: 50 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `m${i}`
    }));
    const messages = buildMessages("g", history);
    expect(messages).toHaveLength(1 + MAX_HISTORY_MESSAGES);
    expect(messages.at(-1)?.content).toBe("m49");
  });
});

describe("CAPTURE_TOOL", () => {
  // parseLeadArguments rejects a call missing either field.
  it("requires contact and summary", () => {
    expect(CAPTURE_TOOL.function.parameters.required).toEqual(["contact", "summary"]);
  });
});
