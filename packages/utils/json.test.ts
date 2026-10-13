import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { JsonRecord, jsonString, lenient } from "@murugappan/utils/json.ts";

describe("jsonString", () => {
  const Payload = jsonString(z.object({ n: z.number() }));

  it("decodes JSON text and validates the result", () => {
    expect(Payload.safeParse('{"n":1}').data).toEqual({ n: 1 });
    expect(Payload.safeParse('{"n":"1"}').success).toBe(false);
  });

  it("reports text that is not JSON as an issue instead of throwing", () => {
    const result = Payload.safeParse("{oops");
    expect(result.error?.issues.map(i => i.message)).toEqual(["must be valid JSON"]);
  });
});

describe("JsonRecord", () => {
  it("accepts a JSON object whose properties may be undefined at any depth, and nothing else", () => {
    const value = { a: undefined, b: { c: undefined, d: [1, "two", null, { e: true }] } };
    expect(JsonRecord.parse(value)).toStrictEqual({
      a: undefined,
      b: { c: undefined, d: [1, "two", null, { e: true }] }
    });
    expect([[1], null, { d: new Date(0) }].map(v => JsonRecord.safeParse(v).success)).toEqual([
      false,
      false,
      false
    ]);
    expect(JsonRecord.safeParse([1]).error?.issues.map(i => i.message)).toEqual([
      "must be a JSON object"
    ]);
  });
});

describe("lenient", () => {
  it("drops a value that fails the schema instead of failing the parse", () => {
    const Shape = z.object({ page: lenient(z.string().startsWith("/")) });
    expect(Shape.parse({ page: "/blog" })).toEqual({ page: "/blog" });
    expect(Shape.parse({ page: "blog" })).toEqual({});
  });
});
