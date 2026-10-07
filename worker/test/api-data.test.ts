// The parsers behind the read and write endpoints: the prerendered dataset,
// the prerendered post list and the contact form body.
import { describe, expect, it } from "vitest";

import { CONTACT_LIMITS } from "#contracts/api/contact.ts";
import { parseContactRequest } from "#worker/api/contact.ts";
import { loadDataset, loadPosts, parseDataset } from "#worker/api/store.ts";
import { postMarkdownPath } from "#worker/api/posts.ts";
import { DATASET, fakeAssets, fakeFetcher } from "./fixtures";

describe("parseDataset", () => {
  it("accepts the built dataset and rejects one missing a collection", () => {
    expect(parseDataset(JSON.parse(JSON.stringify(DATASET)))).toEqual(DATASET);
    const { experience: _dropped, ...rest } = DATASET;
    expect(parseDataset(rest)).toBeNull();
  });
});

describe("loadDataset", () => {
  it("reads the prerendered dataset, and is null for a broken artifact or a failing binding", async () => {
    expect(await loadDataset(fakeAssets())).toEqual(DATASET);
    expect(await loadDataset(fakeAssets({ "/api/dataset.json": "{truncated" }))).toBeNull();
    expect(await loadDataset(fakeAssets({ "/api/dataset.json": null }))).toBeNull();
    const failing = fakeFetcher(() => Promise.reject(new Error("binding down")));
    expect(await loadDataset(failing)).toBeNull();
  });
});

describe("loadPosts", () => {
  it("reads the prerendered post list, and is empty for a broken artifact or a failing binding", async () => {
    expect((await loadPosts(fakeAssets())).map(p => p.slug)).toEqual([
      "cloud-agnostic-rate-limiting",
      "coin-change-problem"
    ]);
    expect(await loadPosts(fakeAssets({ "/api/posts.json": "[{truncated" }))).toEqual([]);
    expect(await loadPosts(fakeAssets({ "/api/posts.json": '[{"slug":"Bad Slug"}]' }))).toEqual([]);
    expect(await loadPosts(fakeAssets({ "/api/posts.json": null }))).toEqual([]);
    const failing = fakeFetcher(() => Promise.reject(new Error("binding down")));
    expect(await loadPosts(failing)).toEqual([]);
  });
});

describe("postMarkdownPath", () => {
  it.each([
    ["coin-change-problem", "/blog/coin-change-problem/index.md"],
    // Anything but a kebab-case token is rejected.
    ["../secrets", null],
    ["Mixed_Case", null],
    ["", null]
  ])("maps %j to %j", (slug, path) => {
    expect(postMarkdownPath(slug)).toBe(path);
  });
});

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
