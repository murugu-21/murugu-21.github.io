import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";

import { fetchDeepseekBalance } from "#worker/ai.ts";
import { buildMessages, MAX_HISTORY_MESSAGES } from "#worker/prompt.ts";

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
    expect(messages).toHaveLength(1 + MAX_HISTORY_MESSAGES);
    expect(messages.at(-1)?.content).toBe("m49");
  });
});
