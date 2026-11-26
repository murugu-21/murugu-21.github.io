import { READ_QUOTA } from "@murugappan/contracts/api/quotas.ts";
import type { VisitorKey } from "#src/modules/rate-limit/visitor-key.ts";

export type ReadSlot = {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
};

type Window = { resetAt: number; used: number };

export const READ_LIMIT_MESSAGE = `More than ${READ_QUOTA.quota} read requests in ${READ_QUOTA.windowSeconds} seconds from this client.`;

const perIsolateWindows = new Map<VisitorKey, Window>();

const MAX_TRACKED_CLIENTS = 20_000;

function prune(now: number): void {
  for (const [key, window] of perIsolateWindows) {
    if (window.resetAt <= now) perIsolateWindows.delete(key);
  }
  if (perIsolateWindows.size <= MAX_TRACKED_CLIENTS) return;
  const excess = perIsolateWindows.size - MAX_TRACKED_CLIENTS;
  let dropped = 0;
  for (const key of perIsolateWindows.keys()) {
    perIsolateWindows.delete(key);
    if (++dropped >= excess) break;
  }
}

export function takeReadSlot(visitor: VisitorKey, now = Date.now()): ReadSlot {
  const windowMs = READ_QUOTA.windowSeconds * 1000;
  let window = perIsolateWindows.get(visitor);
  if (!window || window.resetAt <= now) {
    prune(now);
    window = { resetAt: now + windowMs, used: 0 };
    perIsolateWindows.set(visitor, window);
  }
  const resetSeconds = Math.ceil((window.resetAt - now) / 1000);
  if (window.used >= READ_QUOTA.quota) return { allowed: false, remaining: 0, resetSeconds };
  window.used++;
  return {
    allowed: true,
    remaining: READ_QUOTA.quota - window.used,
    resetSeconds
  };
}

export function resetStore(): void {
  perIsolateWindows.clear();
}
