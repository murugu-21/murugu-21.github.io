import { describe, expect, it } from "vitest";

import { isMissingObject, tokenValid } from "./r2.ts";

describe("cf output", () => {
  it("tells an absent object from other get failures", () => {
    expect(isMissingObject("✘ [ERROR] The specified key does not exist. [code: 10007]")).toBe(true);
    expect(isMissingObject("✘ [ERROR] Authentication error [code: 10000]")).toBe(false);
  });

  it("trusts only an API-checked token as a login", () => {
    expect(tokenValid('{"authenticated":true,"tokenValid":true}')).toBe(true);
    expect(tokenValid('{"authenticated":true}')).toBe(false);
    expect(tokenValid("You are not logged in.")).toBe(false);
  });
});
