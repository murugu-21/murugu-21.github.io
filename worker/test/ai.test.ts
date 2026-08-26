import {describe, expect, it} from "vitest";

import {runDeepseekExchange} from "../ai";
import {TOOLS} from "../prompt";

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
    // V4-Flash reasoning would eat the whole max_tokens budget and leave the
    // visitor with an empty reply.
    expect(body.thinking).toEqual({type: "disabled"});
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
