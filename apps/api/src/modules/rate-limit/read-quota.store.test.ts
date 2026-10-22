import { beforeEach, describe, expect, it } from "vite-plus/test";

import { READ_QUOTA } from "@murugappan/contracts/api/quotas.ts";
import { resetReadWindows, takeReadSlot } from "#src/modules/rate-limit/read-quota.store.ts";
import { visitorKey } from "#src/modules/rate-limit/visitor-key.ts";

beforeEach(() => resetReadWindows());

describe("takeReadSlot", () => {
  const now = 1_000_000;

  it("spends one slot per call and counts down", () => {
    expect(takeReadSlot(visitorKey("1.1.1.1"), now)).toMatchObject({
      allowed: true,
      remaining: 599
    });
    expect(takeReadSlot(visitorKey("1.1.1.1"), now)).toMatchObject({
      allowed: true,
      remaining: 598
    });
  });

  it("counts each client separately", () => {
    takeReadSlot(visitorKey("1.1.1.1"), now);
    expect(takeReadSlot(visitorKey("2.2.2.2"), now)).toMatchObject({
      remaining: 599
    });
  });

  it("refuses once the window's quota is spent, and says for how long", () => {
    for (let i = 0; i < READ_QUOTA.quota; i++) takeReadSlot(visitorKey("3.3.3.3"), now);
    const blocked = takeReadSlot(visitorKey("3.3.3.3"), now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetSeconds).toBe(60);
  });

  it("counts down the reset as the window elapses", () => {
    takeReadSlot(visitorKey("4.4.4.4"), now);
    const later = takeReadSlot(visitorKey("4.4.4.4"), now + 30_000);
    expect(later.resetSeconds).toBe(30);
  });

  it("starts a fresh window once the old one has passed", () => {
    for (let i = 0; i < READ_QUOTA.quota; i++) takeReadSlot(visitorKey("5.5.5.5"), now);
    expect(takeReadSlot(visitorKey("5.5.5.5"), now).allowed).toBe(false);
    const next = takeReadSlot(visitorKey("5.5.5.5"), now + READ_QUOTA.windowSeconds * 1000 + 1);
    expect(next.allowed).toBe(true);
    expect(next.remaining).toBe(599);
  });

  it("forgets the longest-tracked clients first under a flood of distinct addresses", () => {
    const visitor = (i: number) => visitorKey(`10.0.${i >> 8}.${i & 255}`);
    for (let i = 0; i < 20_002; i++) takeReadSlot(visitor(i), now);

    expect(takeReadSlot(visitor(0), now).remaining).toBe(599);
    expect(takeReadSlot(visitor(20_001), now).remaining).toBe(598);
  });
});
