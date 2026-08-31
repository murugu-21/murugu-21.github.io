import {describe, expect, it} from "vitest";

import {
  fetchDeepseekBalance,
  isInsufficientBalance,
  runDeepseekExchange
} from "../ai";

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
    // Reasoning is on: it sharpens tool selection, and with no max_tokens it
    // can no longer starve the reply.
    expect(body.thinking).toEqual({type: "enabled"});
    // Truncating a concierge answer mid-sentence is worse than the tokens it
    // saves; length is the prompt's job and spend is the RateLimiter's.
    expect(body.max_tokens).toBeUndefined();
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

describe("fetchDeepseekBalance", () => {
  function json(body: unknown, status = 200): typeof fetch {
    return (async () =>
      new Response(JSON.stringify(body), {status})) as typeof fetch;
  }

  it("reads is_available and the USD balance", async () => {
    const balance = await fetchDeepseekBalance(
      "sk-test",
      json({
        is_available: true,
        balance_infos: [
          {currency: "CNY", total_balance: "7.00"},
          {currency: "USD", total_balance: "1.99"}
        ]
      })
    );
    // total_balance is a decimal string in the API response, not a number.
    expect(balance).toEqual({available: true, totalUsd: 1.99});
  });

  it("reports zero when there is no USD row", async () => {
    const balance = await fetchDeepseekBalance(
      "sk-test",
      json({is_available: true, balance_infos: []})
    );
    expect(balance).toEqual({available: true, totalUsd: 0});
  });

  it("throws on a non-OK response", async () => {
    await expect(
      fetchDeepseekBalance("sk-test", json({}, 401))
    ).rejects.toThrow("401");
  });
});

describe("isInsufficientBalance", () => {
  it("recognises a 402 from an exchange and nothing else", async () => {
    const failing = (status: number) =>
      (async () => new Response("no", {status})) as typeof fetch;

    const err = await runDeepseekExchange(
      "sk-test",
      [],
      () => {},
      failing(402)
    ).catch((e: unknown) => e);
    expect(isInsufficientBalance(err)).toBe(true);

    const other = await runDeepseekExchange(
      "sk-test",
      [],
      () => {},
      failing(500)
    ).catch((e: unknown) => e);
    expect(isInsufficientBalance(other)).toBe(false);
    expect(isInsufficientBalance(new Error("402"))).toBe(false);
  });
});
