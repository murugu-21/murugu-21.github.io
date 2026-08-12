import {describe, expect, it} from "vitest";

import worker, {ChatRoom, RateLimiter} from "../server";

describe("worker entry", () => {
  it("exports a fetch handler and both Durable Object classes", () => {
    expect(typeof worker.fetch).toBe("function");
    expect(typeof ChatRoom).toBe("function");
    expect(typeof RateLimiter).toBe("function");
  });
});
