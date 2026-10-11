import { READ_QUOTA } from "@murugappan/contracts/api/quotas.ts";

export type ReadSlot = {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
};

type Window = { resetAt: number; used: number };

// Fixed windows in the isolate, not a DO, because a cross-region round trip per read costs more
// than the limit is worth. So the ceiling is per edge location, as /developers/ documents.
const windows = new Map<string, Window>();

// Caps memory under a flood of distinct addresses; insertion order drops the oldest first.
const MAX_TRACKED_CLIENTS = 20_000;

function prune(now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
  if (windows.size <= MAX_TRACKED_CLIENTS) return;
  const excess = windows.size - MAX_TRACKED_CLIENTS;
  let dropped = 0;
  for (const key of windows.keys()) {
    windows.delete(key);
    if (++dropped >= excess) break;
  }
}

export function takeReadSlot(client: string, now = Date.now()): ReadSlot {
  const windowMs = READ_QUOTA.windowSeconds * 1000;
  let window = windows.get(client);
  if (!window || window.resetAt <= now) {
    prune(now);
    window = { resetAt: now + windowMs, used: 0 };
    windows.set(client, window);
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

/** Test seam: drop every tracked window. */
export function resetReadWindows(): void {
  windows.clear();
}
