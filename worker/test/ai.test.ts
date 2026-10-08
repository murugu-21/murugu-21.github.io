import { generateText, type ModelMessage } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { deepseek, fetchDeepseekBalance } from "#worker/ai.ts";
import { buildMessages } from "#worker/prompt.ts";

describe("deepseek", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls DeepSeek's chat API with the key and the chosen model, Flash by default", async () => {
    const seen: { url: string; auth: string | null; model: string }[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const { model } = z.object({ model: z.string() }).parse(await request.json());
      seen.push({ url: request.url, auth: request.headers.get("Authorization"), model });
      return Response.json({
        id: "c1",
        created: 0,
        model,
        choices: [
          { index: 0, message: { role: "assistant", content: "Hello." }, finish_reason: "stop" }
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      });
    });

    const { text } = await generateText({ model: deepseek({ apiKey: "sk-live" }), prompt: "hi" });
    await generateText({ model: deepseek({ apiKey: "k", model: "deepseek-pro" }), prompt: "hi" });

    expect(text).toBe("Hello.");
    expect(seen).toEqual([
      {
        url: "https://api.deepseek.com/chat/completions",
        auth: "Bearer sk-live",
        model: "deepseek-flash"
      },
      { url: "https://api.deepseek.com/chat/completions", auth: "Bearer k", model: "deepseek-pro" }
    ]);
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
    expect(messages).toHaveLength(21);
    expect(messages.at(-1)?.content).toBe("m49");
  });
});
