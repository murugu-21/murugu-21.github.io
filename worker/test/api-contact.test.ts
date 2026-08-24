import {describe, expect, it} from "vitest";

import {CONTACT_LIMITS, parseContactRequest} from "../api/contact";

const valid = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  company: "Analytical Engines Ltd",
  message:
    "We are hiring a senior backend engineer for a healthcare data platform."
};

function issues(raw: unknown): string[] {
  const result = parseContactRequest(raw);
  if (result.ok) throw new Error("expected the request to be rejected");
  return result.issues.map(i => i.field);
}

describe("parseContactRequest", () => {
  it("accepts a complete request", () => {
    const result = parseContactRequest(valid);
    expect(result).toEqual({ok: true, value: valid, dryRun: false});
  });

  it("accepts a request with only email and message", () => {
    const result = parseContactRequest({
      email: valid.email,
      message: valid.message
    });
    expect(result).toEqual({
      ok: true,
      value: {email: valid.email, message: valid.message},
      dryRun: false
    });
  });

  it("trims surrounding whitespace", () => {
    const result = parseContactRequest({
      email: "  ada@example.com  ",
      message: `  ${valid.message}  `
    });
    expect(result).toEqual({
      ok: true,
      value: {email: "ada@example.com", message: valid.message},
      dryRun: false
    });
  });

  it("reports a dryRun request separately from the message itself", () => {
    expect(parseContactRequest({...valid, dryRun: true})).toEqual({
      ok: true,
      value: valid,
      dryRun: true
    });
  });

  it("rejects a non-boolean dryRun", () => {
    expect(issues({...valid, dryRun: "yes"})).toEqual(["dryRun"]);
  });

  it("rejects a body that is not an object", () => {
    expect(issues("hello")).toEqual(["body"]);
    expect(issues(null)).toEqual(["body"]);
    expect(issues([])).toEqual(["body"]);
  });

  it("rejects a missing or malformed email", () => {
    expect(issues({message: valid.message})).toEqual(["email"]);
    expect(issues({email: "not-an-email", message: valid.message})).toEqual([
      "email"
    ]);
    expect(issues({email: "a@b", message: valid.message})).toEqual(["email"]);
  });

  it("rejects a message that is too short or too long", () => {
    expect(issues({email: valid.email, message: "hi"})).toEqual(["message"]);
    expect(
      issues({
        email: valid.email,
        message: "x".repeat(CONTACT_LIMITS.message.max + 1)
      })
    ).toEqual(["message"]);
  });

  it("reports every invalid field at once", () => {
    expect(issues({email: "nope", message: "hi"})).toEqual([
      "email",
      "message"
    ]);
  });

  it("rejects an over-long name or company", () => {
    expect(
      issues({...valid, name: "x".repeat(CONTACT_LIMITS.name + 1)})
    ).toEqual(["name"]);
    expect(
      issues({...valid, company: "x".repeat(CONTACT_LIMITS.company + 1)})
    ).toEqual(["company"]);
  });

  it("drops optional fields that are blank rather than reporting them", () => {
    const result = parseContactRequest({...valid, name: "   ", company: ""});
    expect(result).toEqual({
      ok: true,
      value: {email: valid.email, message: valid.message},
      dryRun: false
    });
  });

  it("rejects a non-string field", () => {
    expect(issues({email: 42, message: valid.message})).toEqual(["email"]);
    expect(issues({...valid, name: 42})).toEqual(["name"]);
  });
});
