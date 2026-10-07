import { describe, expect, it } from "vitest";
import { z } from "zod";

import { jsonString, lenient } from "#utils/json.ts";

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

describe("lenient", () => {
  it("drops a value that fails the schema instead of failing the parse", () => {
    const Shape = z.object({ page: lenient(z.string().startsWith("/")) });
    expect(Shape.parse({ page: "/blog" })).toEqual({ page: "/blog" });
    expect(Shape.parse({ page: "blog" })).toEqual({});
  });
});
