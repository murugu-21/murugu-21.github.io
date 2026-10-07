import { describe, expect, it } from "vitest";

import { isMissingObject, r2Args, tokenValid } from "./r2.ts";

describe("r2Args", () => {
  it("names the audio bucket, and the local state that astro dev serves with --local", () => {
    expect(r2Args({ verb: "get", key: "blog/breeze/react.json", local: false })).toEqual([
      "cf",
      "r2",
      "objects",
      "get",
      "blog/breeze/react.json",
      "--bucket-name",
      "murugappan-dev-audio"
    ]);
    expect(
      r2Args({ verb: "put", key: "blog/breeze/react.mp3", local: true, extra: ["--file", "a.mp3"] })
    ).toEqual([
      "cf",
      "r2",
      "objects",
      "put",
      "blog/breeze/react.mp3",
      "--bucket-name",
      "murugappan-dev-audio",
      "--file",
      "a.mp3",
      "--local",
      "--persist-to",
      ".cloudflare/state"
    ]);
  });
});

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
