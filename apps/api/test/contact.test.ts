import { describe, expect, it } from "vitest";
import { z } from "zod";

import { CONTACT_LIMITS } from "@murugappan/contracts/api/contact.ts";
import type { JsonValue } from "@murugappan/utils/json.ts";
import { apiClient, fetchWorker, readJson, recordingEmail, type JsonBody } from "./fixtures";

let lastIp = 0;
const nextIp = () => `203.0.113.${100 + ++lastIp}`;

const contactApi = (recording?: { email: SendEmail }) =>
  apiClient({ ip: nextIp(), env: { email: recording?.email } }).api.v1.contact;

/** For bodies the typed client cannot send. */
const postRaw = (body: JsonValue) =>
  fetchWorker("/api/v1/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ip: nextIp()
  });

async function rejectedFields(res: JsonBody & { status: number }) {
  expect(res.status).toBe(422);
  const { error } = await readJson(res, Issues);
  return error.details.map(d => d.field);
}

const Issues = z.object({
  error: z.object({ details: z.array(z.object({ field: z.string(), issue: z.string() })) })
});

describe("POST /api/contact body parsing", () => {
  const valid = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    company: "Analytical Engines Ltd",
    message: "We are hiring a senior backend engineer for a healthcare data platform."
  };
  const minimal = { email: valid.email, message: valid.message };

  it.each([
    ["only email and message", minimal],
    [
      "surrounding whitespace, trimmed",
      { email: `  ${valid.email}  `, message: `  ${valid.message}  ` }
    ],
    ["blank optional fields, dropped", { ...valid, name: "   ", company: "" }]
  ])("accepts %s and emails the cleaned message", async (_, raw) => {
    const email = recordingEmail();
    const res = await contactApi(email).$post({ json: raw });
    expect(res.status).toBe(202);
    expect(email.sent.map(m => m.text)).toEqual([
      [
        "Name:    (not given)",
        "Email:   ada@example.com",
        "Company: (not given)",
        "Source:  POST /api/contact",
        "",
        "--- Message ---",
        valid.message
      ].join("\n")
    ]);
  });

  it("emails every field of a complete request sent with dryRun false", async () => {
    const email = recordingEmail();
    const res = await contactApi(email).$post({ json: { ...valid, dryRun: false } });
    expect(res.status).toBe(202);
    expect(email.sent.map(m => m.text)).toEqual([
      [
        "Name:    Ada Lovelace",
        "Email:   ada@example.com",
        "Company: Analytical Engines Ltd",
        "Source:  POST /api/contact",
        "",
        "--- Message ---",
        valid.message
      ].join("\n")
    ]);
  });

  it.each([
    ["an email with no @", { ...minimal, email: "not-an-email" }, ["email"]],
    ["an email with no TLD", { ...minimal, email: "a@b" }, ["email"]],
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
    ]
  ])("rejects %s with 422, naming the field", async (_, raw, fields) => {
    expect(await rejectedFields(await contactApi().$post({ json: raw }))).toEqual(fields);
  });

  it.each<[string, JsonValue, string[]]>([
    ["a non-boolean dryRun", { ...valid, dryRun: "yes" }, ["dryRun"]],
    ["a string body", "hello", ["body"]],
    ["a null body", null, ["body"]],
    ["an array body", [], ["body"]],
    ["a missing email", { message: valid.message }, ["email"]],
    ["a non-string email", { ...minimal, email: 42 }, ["email"]],
    ["a non-string name", { ...valid, name: 42 }, ["name"]]
  ])("rejects %s with 422, naming the field", async (_, raw, fields) => {
    expect(await rejectedFields(await postRaw(raw))).toEqual(fields);
  });
});
