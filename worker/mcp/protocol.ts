// Protocol versions handed to the SDK, the server name, and the Origin check (the SDK
// only offers a hostname allowlist).

export const LATEST_PROTOCOL_VERSION = "2026-07-28";
// Newest first. `initialize` falls back to the first entry.
export const LEGACY_PROTOCOL_VERSIONS: readonly string[] = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26"
];
export const SUPPORTED_PROTOCOL_VERSIONS: string[] = [
  LATEST_PROTOCOL_VERSION,
  ...LEGACY_PROTOCOL_VERSIONS
];

export const SERVER_NAME = "murugappan.dev";

/**
 * DNS-rebinding guard. The server is public with no ambient credentials, so any
 * web origin is allowed; an opaque "null", `file:`, app schemes and garbage are not.
 */
export function isAllowedOrigin(origin: string | null): boolean {
  if (origin === null) return true; // a non-browser client sends no Origin header
  try {
    const { protocol } = new URL(origin);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
