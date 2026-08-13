import {describe, expect, it} from "vitest";

import {
  buildMessages,
  CAPTURE_TOOL,
  MAX_HISTORY_MESSAGES,
  MODEL_ID
} from "../prompt";

describe("prompt", () => {
  it("pins the chosen model", () => {
    expect(MODEL_ID).toBe("@cf/qwen/qwen3-30b-a3b-fp8");
  });

  it("declares the capture_opportunity tool with required contact and summary", () => {
    expect(CAPTURE_TOOL.function.name).toBe("capture_opportunity");
    expect(CAPTURE_TOOL.function.parameters.required).toEqual([
      "contact",
      "summary"
    ]);
    expect(Object.keys(CAPTURE_TOOL.function.parameters.properties)).toEqual([
      "name",
      "contact",
      "summary"
    ]);
  });

  it("puts grounding into a single system message followed by history", () => {
    const messages = buildMessages("GROUNDING", [
      {role: "user", content: "hi"},
      {role: "assistant", content: "hello"}
    ]);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("GROUNDING");
    expect(messages.slice(1)).toEqual([
      {role: "user", content: "hi"},
      {role: "assistant", content: "hello"}
    ]);
  });

  it("appends an ephemeral page-context system message when page is given", () => {
    const messages = buildMessages(
      "g",
      [{role: "user", content: "hi"}],
      "/blog/react/"
    );
    const last = messages.at(-1);
    expect(last?.role).toBe("system");
    expect(last?.content).toContain("https://murugappan.dev/blog/react/");
    // and without page, no trailing system message
    const plain = buildMessages("g", [{role: "user", content: "hi"}]);
    expect(plain.at(-1)?.role).toBe("user");
  });

  it("clips history to the most recent MAX_HISTORY_MESSAGES", () => {
    const history = Array.from({length: 50}, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `m${i}`
    }));
    const messages = buildMessages("g", history);
    expect(messages).toHaveLength(1 + MAX_HISTORY_MESSAGES);
    expect(messages.at(-1)?.content).toBe("m49");
  });
});
