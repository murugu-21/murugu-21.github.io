import { assert, describe, expect, it } from "vitest";

import { fetchDeepseekBalance, isInsufficientBalance, runDeepseekExchange } from "../ai";
import { buildMessages, MAX_HISTORY_MESSAGES, type ModelMessage } from "../prompt";
import { consumeSse } from "../sse";

function sseStream(events: string[]): ReadableStream<string> {
  return new ReadableStream({
    start(controller) {
      for (const e of events) controller.enqueue(e);
      controller.close();
    }
  });
}

describe("runDeepseekExchange", () => {
  it("sends an OpenAI chat-completions request and parses the stream", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetcher: typeof fetch = async (url, init) => {
      calls.push({ url: new Request(url).url, init: init ?? {} });
      return new Response(
        [
          'data: {"choices":[{"delta":{"content":"hi there"}}]}\n\n',
          'data: {"choices":[],"usage":{"prompt_tokens":2100,"completion_tokens":12}}\n\n',
          "data: [DONE]\n\n"
        ].join("")
      );
    };

    const deltas: string[] = [];
    const result = await runDeepseekExchange({
      apiKey: "sk-test",
      messages: [{ role: "user", content: "hello" }],
      onDelta: t => deltas.push(t),
      fetcher
    });

    const [captured] = calls;
    assert(captured, "no request was sent");
    expect(captured.url).toBe("https://api.deepseek.com/chat/completions");
    expect(new Headers(captured.init.headers).get("authorization")).toBe("Bearer sk-test");
    assert(typeof captured.init.body === "string", "request body is not a JSON string");
    const body: unknown = JSON.parse(captured.init.body);
    expect(body).toHaveProperty("stream", true);
    expect(body).toHaveProperty("stream_options", { include_usage: true });
    // Reasoning sharpens tool selection; with no max_tokens it can't starve the reply.
    expect(body).toHaveProperty("thinking", { type: "enabled" });
    // Truncating a concierge answer mid-sentence is worse than the tokens it
    // saves; length is the prompt's job and spend is the RateLimiter's.
    expect(body).not.toHaveProperty("max_tokens");
    expect(body).toHaveProperty(["tools", 0, "function", "name"], "capture_opportunity");

    expect(result.content).toBe("hi there");
    expect(deltas).toEqual(["hi there"]);
    expect(result.usage).toEqual({ promptTokens: 2100, completionTokens: 12 });
  });

  it("rejects a non-ok response, flagging only a 402 as an exhausted balance", async () => {
    const failing =
      (status: number): typeof fetch =>
      async () =>
        new Response("no", { status });
    const error = (status: number) =>
      runDeepseekExchange({
        apiKey: "sk-test",
        messages: [],
        onDelta: () => {},
        fetcher: failing(status)
      }).then(
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
    return async () => new Response(JSON.stringify(body), { status });
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
  it("accumulates deltas split across reads", async () => {
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

  it("skips malformed JSON lines without dying", async () => {
    const result = await consumeSse(
      sseStream(["data: {broken\n\n", 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n']),
      () => {}
    );
    expect(result.content).toBe("ok");
  });
});

describe("buildMessages", () => {
  it("puts grounding into a single system message followed by history", () => {
    const history: ModelMessage[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" }
    ];
    const messages = buildMessages("GROUNDING", history);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("GROUNDING");
    expect(messages.slice(1)).toEqual(history);
  });

  it("appends a page-context system message only when a page is given", () => {
    const history: ModelMessage[] = [{ role: "user", content: "hi" }];
    const last = buildMessages("g", history, "/blog/react/").at(-1);
    expect(last?.role).toBe("system");
    expect(last?.content).toContain("https://murugappan.dev/blog/react/");
    expect(buildMessages("g", history).at(-1)?.role).toBe("user");
  });

  it("clips history to the most recent MAX_HISTORY_MESSAGES", () => {
    const history = Array.from({ length: 50 }, (_, i): ModelMessage => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `m${i}`
    }));
    const messages = buildMessages("g", history);
    expect(messages).toHaveLength(1 + MAX_HISTORY_MESSAGES);
    expect(messages.at(-1)?.content).toBe("m49");
  });
});
