import type { ModelMessage } from "ai";
import { describe, expect, it } from "vite-plus/test";

import { buildMessages } from "#src/modules/chat/prompt.ts";

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
