import { beforeEach, describe, expect, it } from "vite-plus/test";

import { READ_QUOTA } from "@murugappan/contracts/api/quotas.ts";
import { resetReadWindows, takeReadSlot } from "#src/modules/rate-limit/read-quota.store.ts";

beforeEach(() => resetReadWindows());

describe("takeReadSlot", () => {
  const now = 1_000_000;

  it("spends one slot per call and counts down", () => {
    expect(takeReadSlot("1.1.1.1", now)).toMatchObject({
      allowed: true,
      remaining: 599
    });
    expect(takeReadSlot("1.1.1.1", now)).toMatchObject({
      allowed: true,
      remaining: 598
    });
  });

  it("counts each client separately", () => {
    takeReadSlot("1.1.1.1", now);
    expect(takeReadSlot("2.2.2.2", now)).toMatchObject({
      remaining: 599
    });
  });

  it("refuses once the window's quota is spent, and says for how long", () => {
    for (let i = 0; i < READ_QUOTA.quota; i++) takeReadSlot("3.3.3.3", now);
    const blocked = takeReadSlot("3.3.3.3", now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetSeconds).toBe(60);
  });

  it("counts down the reset as the window elapses", () => {
    takeReadSlot("4.4.4.4", now);
    const later = takeReadSlot("4.4.4.4", now + 30_000);
    expect(later.resetSeconds).toBe(30);
  });

  it("starts a fresh window once the old one has passed", () => {
    for (let i = 0; i < READ_QUOTA.quota; i++) takeReadSlot("5.5.5.5", now);
    expect(takeReadSlot("5.5.5.5", now).allowed).toBe(false);
    const next = takeReadSlot("5.5.5.5", now + READ_QUOTA.windowSeconds * 1000 + 1);
    expect(next.allowed).toBe(true);
    expect(next.remaining).toBe(599);
  });

  it("forgets the longest-tracked clients first under a flood of distinct addresses", () => {
    const flood = Array.from({ length: 20_002 }, (_, i) => `flood-${i}`);
    for (const client of flood) takeReadSlot(client, now);

    // flood-0 was dropped, so it starts over; flood-20001 is still counting.
    expect(takeReadSlot("flood-0", now).remaining).toBe(599);
    expect(takeReadSlot("flood-20001", now).remaining).toBe(598);
  });
});
