// Where the browser blocks storage (Chrome's "block all cookies", some private modes) even
// reading localStorage throws, so reads come back null and writes are dropped.

import type { SiteStorageKey } from "./privacy";

export function readStored(key: SiteStorageKey): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored({ key, value }: { key: SiteStorageKey; value: string }): void {
  try {
    localStorage.setItem(key, value);
  } catch {}
}
