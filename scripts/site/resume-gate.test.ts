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
  it("passes a resume with every ATS token on at most two pages", () => {
    const pdf = { path: "/dist/resume.pdf", bytes: 167_731, text: RESUME };
    expect(checkResume({ ...pdf, pageCount: 2 })).toBe(
      "[generate-resume] wrote /dist/resume.pdf (163.8 KB, 2 pages); ATS gate passed, all 9 required tokens found"
    );
    expect(checkResume({ ...pdf, pageCount: 1 })).toContain("(163.8 KB, 1 page);");
    expect(checkResume({ ...pdf, pageCount: null })).toContain("(163.8 KB, ? pages);");
  });

  it("fails the build on a missing token or a third page", () => {
    const pdf = { path: "/dist/resume.pdf", bytes: 1024 };
    expect(() =>
      checkResume({
        ...pdf,
        text: RESUME.replace("SKILLS", "Tools").replace("$300k", "a lot"),
        pageCount: 2
      })
    ).toThrow('ATS gate FAILED: missing tokens "SKILLS", "$300k"');
    expect(() => checkResume({ ...pdf, text: RESUME, pageCount: 3 })).toThrow(
      "page gate FAILED: 3 pages (max 2)"
    );
  });
});
