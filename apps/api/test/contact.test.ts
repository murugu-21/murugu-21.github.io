import { describe, expect, it } from "vitest";

import { CONTACT_LIMITS } from "@murugappan/contracts/api/contact.ts";
import { parseContactRequest } from "#src/api/contact.ts";

describe("parseContactRequest", () => {
  const valid = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    company: "Analytical Engines Ltd",
    message: "We are hiring a senior backend engineer for a healthcare data platform."
  };
  const minimal = { email: valid.email, message: valid.message };

  it("accepts a complete request", () => {
    expect(parseContactRequest(valid)).toEqual({ ok: true, value: valid, dryRun: false });
  });

  it.each([
    ["only email and message", minimal],
    [
      "surrounding whitespace, trimmed",
      { email: `  ${valid.email}  `, message: `  ${valid.message}  ` }
    ],
    ["blank optional fields, dropped", { ...valid, name: "   ", company: "" }]
  ])("accepts %s", (_, raw) => {
    expect(parseContactRequest(raw)).toEqual({ ok: true, value: minimal, dryRun: false });
  });

  it("reports a dryRun request separately from the message itself", () => {
    expect(parseContactRequest({ ...valid, dryRun: true })).toEqual({
      ok: true,
      value: valid,
      dryRun: true
    });
  });

  it.each<[string, unknown, string[]]>([
    ["a non-boolean dryRun", { ...valid, dryRun: "yes" }, ["dryRun"]],
    ["a string body", "hello", ["body"]],
    ["a null body", null, ["body"]],
    ["an array body", [], ["body"]],
    ["a missing email", { message: valid.message }, ["email"]],
    ["an email with no @", { ...minimal, email: "not-an-email" }, ["email"]],
    ["an email with no TLD", { ...minimal, email: "a@b" }, ["email"]],
    ["a non-string email", { ...minimal, email: 42 }, ["email"]],
    ["a too-short message", { ...minimal, message: "hi" }, ["message"]],
    [
      "a too-long message",
      { ...minimal, message: "x".repeat(CONTACT_LIMITS.message.max + 1) },
      ["message"]
    ],
    ["an over-long name", { ...valid, name: "x".repeat(CONTACT_LIMITS.name + 1) }, ["name"]],
    [
      "an over-long company",
      { ...valid, company: "x".repeat(CONTACT_LIMITS.company + 1) },
      ["company"]
    ],
    ["a non-string name", { ...valid, name: 42 }, ["name"]]
  ])("rejects %s", (_, raw, fields) => {
    expect(parseContactRequest(raw)).toMatchObject({
      ok: false,
      issues: fields.map(field => ({ field }))
    });
  });
});
