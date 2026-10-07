import { describe, expect, it } from "vitest";

import { isMissingObject } from "./r2.ts";

describe("wrangler output", () => {
  it("tells an absent object from other get failures", () => {
    expect(isMissingObject("✘ [ERROR] The specified key does not exist.")).toBe(true);
    expect(isMissingObject("✘ [ERROR] Authentication error [code: 10000]")).toBe(false);
  });
});
