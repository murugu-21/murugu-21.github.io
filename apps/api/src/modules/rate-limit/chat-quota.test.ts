import { describe, expect, it } from "vite-plus/test";

import { takeToken } from "#src/modules/rate-limit/chat-quota.ts";

const policy = { capacity: 3, msPerToken: 1000 };

describe("takeToken", () => {
  it("takes one token from a full bucket", () => {
    expect(takeToken({ bucket: { tokens: 3, refilledAt: 5000 }, now: 5000, policy })).toEqual({
      taken: true,
      bucket: { tokens: 2, refilledAt: 5000 }
    });
  });

  it("refuses an empty bucket without changing it", () => {
    expect(takeToken({ bucket: { tokens: 0.5, refilledAt: 5000 }, now: 5400, policy })).toEqual({
      taken: false
    });
  });

  it("earns tokens back at the policy's rate, up to capacity", () => {
    expect(takeToken({ bucket: { tokens: 0, refilledAt: 5000 }, now: 6500, policy })).toEqual({
      taken: true,
      bucket: { tokens: 0.5, refilledAt: 6500 }
    });
    expect(takeToken({ bucket: { tokens: 1, refilledAt: 0 }, now: 60_000, policy })).toEqual({
      taken: true,
      bucket: { tokens: 2, refilledAt: 60_000 }
    });
  });
});
