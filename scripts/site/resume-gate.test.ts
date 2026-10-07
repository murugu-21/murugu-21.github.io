import { describe, expect, it } from "vitest";

import { checkResume } from "./resume-gate.ts";

const RESUME = [
  "Murugappan M · murugu2001@gmail.com",
  "PROFESSIONAL SUMMARY Backend engineer.",
  "SKILLS TypeScript, Node.js",
  "EXPERIENCE Software Engineer II. Kept 95%+ of syncs on time and saved $300k a year.",
  "EDUCATION B.E."
].join("\n");

describe("checkResume", () => {
  it("passes a resume with every ATS token on at most two pages, or an unknown count", () => {
    expect(checkResume({ text: RESUME, pageCount: 2 })).toBe(9);
    expect(checkResume({ text: RESUME, pageCount: null })).toBe(9);
  });

  it("fails the build on a missing token or a third page", () => {
    expect(() =>
      checkResume({
        text: RESUME.replace("SKILLS", "Tools").replace("$300k", "a lot"),
        pageCount: 2
      })
    ).toThrow('ATS gate FAILED: missing tokens "SKILLS", "$300k"');
    expect(() => checkResume({ text: RESUME, pageCount: 3 })).toThrow(
      "page gate FAILED: 3 pages (max 2)"
    );
  });
});
