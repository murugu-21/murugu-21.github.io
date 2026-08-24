import {describe, expect, it} from "vitest";

import {apiError, DOCS_URL} from "../api/errors";

describe("apiError", () => {
  it("returns a JSON body with code, message, hint and docs link", async () => {
    const res = apiError({
      status: 404,
      code: "not_found",
      message: "No endpoint at /api/nope.",
      hint: "See the OpenAPI spec for the endpoint list."
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toMatch(/^application\/json/);
    expect(await res.json()).toEqual({
      error: {
        code: "not_found",
        message: "No endpoint at /api/nope.",
        hint: "See the OpenAPI spec for the endpoint list.",
        documentation_url: DOCS_URL
      }
    });
  });

  it("includes per-field details when given", async () => {
    const res = apiError({
      status: 422,
      code: "invalid_request",
      message: "The request body is not valid.",
      hint: "Fix the listed fields and retry.",
      details: [{field: "email", issue: "must be a valid email address"}]
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as {error: {details: unknown}};
    expect(body.error.details).toEqual([
      {field: "email", issue: "must be a valid email address"}
    ]);
  });

  it("passes extra headers through", () => {
    const res = apiError({
      status: 429,
      code: "rate_limited",
      message: "Too many requests.",
      hint: "Retry tomorrow.",
      headers: {"Retry-After": "3600"}
    });
    expect(res.headers.get("Retry-After")).toBe("3600");
  });
});
