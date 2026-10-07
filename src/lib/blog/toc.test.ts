import { describe, expect, it } from "vitest";

import { TOC_LINE_SLACK, activeIndex, tocEntries } from "./toc";

const heading = (
  depth: number,
  text: string,
  slug = text.toLowerCase().replaceAll(/\s+/g, "-")
) => ({
  depth,
  text,
  slug
});

describe("tocEntries", () => {
  it("keeps h2 and h3 and drops every other level", () => {
    const entries = tocEntries([
      heading(1, "Title"),
      heading(2, "Intro"),
      heading(3, "Setup"),
      heading(4, "Deep")
    ]);
    expect(entries.map(e => e.text)).toEqual(["Intro", "Setup"]);
  });

  it("drops headings with no text, like a bare ## used as a separator", () => {
    const entries = tocEntries([
      heading(2, "", ""),
      heading(2, "Intro"),
      heading(2, "   ", "-1"),
      heading(2, "End")
    ]);
    expect(entries.map(e => e.slug)).toEqual(["intro", "end"]);
  });

  it("returns nothing when fewer than two headings remain", () => {
    expect(tocEntries([heading(2, "Only")])).toEqual([]);
    expect(tocEntries([heading(2, "", ""), heading(2, "Only")])).toEqual([]);
    expect(tocEntries([heading(2, "Only"), heading(2, "Next")]).map(e => e.text)).toEqual([
      "Only",
      "Next"
    ]);
  });
});

describe("activeIndex", () => {
  // post.css parks a jumped-to heading at 80px; the line sits the slack below.
  const LINE = 80 + TOC_LINE_SLACK;

  it("is nothing before the first heading reaches the line", () => {
    expect(activeIndex([200, 900], LINE, false)).toBe(-1);
  });

  it("is the last heading whose top has reached the line", () => {
    expect(activeIndex([-400, 40, 600], LINE, false)).toBe(1);
  });

  it("treats a heading sitting exactly on the line as reached (a hash jump lands it there)", () => {
    expect(activeIndex([-400, LINE, 600], LINE, false)).toBe(1);
  });

  it("does not count a heading one pixel below the line", () => {
    expect(activeIndex([-400, LINE + 1, 600], LINE, false)).toBe(0);
  });

  it("is the last heading once the page is scrolled to its end", () => {
    expect(activeIndex([-400, -100, 500], LINE, true)).toBe(2);
  });

  it("never counts a heading without a box (Infinity top) as reached", () => {
    expect(activeIndex([-400, Infinity, 600], LINE, false)).toBe(0);
  });
});
