import { generateText } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { deepseek, fetchDeepseekBalance } from "#src/modules/chat/deepseek.client.ts";
import { stubDeepseekBalance } from "#test/fixtures.ts";

afterEach(() => vi.unstubAllGlobals());

describe("deepseek", () => {
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

    expect(text).toBe("Hello.");
    expect(seen).toEqual([
      {
        url: "https://api.deepseek.com/chat/completions",
        auth: "Bearer sk-live",
        model: "deepseek-flash"
      }
    ]);
  });
});

describe("fetchDeepseekBalance", () => {
  it("reads is_available and the USD balance, ignoring other currencies", async () => {
    stubDeepseekBalance({
      is_available: true,
      balance_infos: [
        { currency: "CNY", total_balance: "7.00" },
        { currency: "USD", total_balance: "1.99" }
      ]
    });
    const balance = await fetchDeepseekBalance("sk-test");
    // total_balance is a decimal string in the API response, not a number.
    expect(balance).toEqual({ available: true, totalUsd: 1.99 });
  });

  it("reports zero when there is no USD row", async () => {
    stubDeepseekBalance({ is_available: true, balance_infos: [] });
    const balance = await fetchDeepseekBalance("sk-test");
    expect(balance).toEqual({ available: true, totalUsd: 0 });
  });

  it("throws on a non-OK response", async () => {
    stubDeepseekBalance({}, 401);
    await expect(fetchDeepseekBalance("sk-test")).rejects.toThrow("401");
  });
});
