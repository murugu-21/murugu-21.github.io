// Where the browser blocks storage (Chrome's "block all cookies", some private modes) even
// reading localStorage throws, so reads come back null and writes are dropped.

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored({ key, value }: { key: string; value: string }): void {
  try {
    localStorage.setItem(key, value);
  } catch {}
}
