import { describe, expect, it } from "vitest";

import { accentTitle } from "./accent";

describe("accentTitle", () => {
  it("wraps the last word in the accent span", () => {
    expect(accentTitle("Work Experience")).toBe('Work <span class="accent">Experience</span>');
  });

  it("skips trailing emoji to accent the last word with letters", () => {
    expect(accentTitle("Open Source 🛠️")).toBe('Open <span class="accent">Source</span> 🛠️');
  });

  it("escapes HTML in every word", () => {
    expect(accentTitle("R&D <b>")).toBe('R&amp;D <span class="accent">&lt;b&gt;</span>');
  });

  it("leaves a title without letters unwrapped", () => {
    expect(accentTitle("2024")).toBe("2024");
  });
});
