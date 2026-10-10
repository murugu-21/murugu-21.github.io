import { describe, expect, it } from "vitest";

import { resumeProblems } from "./resume-gate.ts";

const RESUME = [
  "Murugappan M · murugu2001@gmail.com",
  "PROFESSIONAL SUMMARY Backend engineer.",
  "SKILLS TypeScript, Node.js",
  "EXPERIENCE SWE 2. Kept 95%+ of syncs on time and saved $300k a year.",
  "EDUCATION B.E."
].join("\n");

describe("resumeProblems", () => {
  it("passes every ATS token on two pages, and flags a third page", () => {
    expect(resumeProblems({ text: RESUME, pageCount: 2 })).toEqual([]);
    expect(resumeProblems({ text: RESUME, pageCount: 3 })).toEqual([
      "page gate FAILED: 3 pages (max 2)"
    ]);
  });

  it("reports each missing token and a third page", () => {
    expect(
      resumeProblems({
        text: RESUME.replace("SKILLS", "Tools").replace("$300k", "a lot"),
        pageCount: 3
      })
    ).toEqual([
      'ATS gate FAILED: missing tokens "SKILLS", "$300k"',
      "page gate FAILED: 3 pages (max 2)"
    ]);
  });
});
