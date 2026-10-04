// JSON-RPC framing and Streamable HTTP validation (MCP 2026-07-28). A request
// with per-request `_meta` is served as modern (stateless, headers mirrored
// from the body); anything else as legacy `initialize`. No sessions either way.

import { z } from "zod";

import { JsonObject, lenient } from "../../utils/json";

export const LATEST_PROTOCOL_VERSION = "2026-07-28";
const MODERN_PROTOCOL_VERSIONS: readonly string[] = [LATEST_PROTOCOL_VERSION];
// Newest first. `initialize` falls back to the first entry.
export const LEGACY_PROTOCOL_VERSIONS: readonly string[] = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26"
];
export const SUPPORTED_PROTOCOL_VERSIONS: string[] = [
  ...MODERN_PROTOCOL_VERSIONS,
  ...LEGACY_PROTOCOL_VERSIONS
];

export const SERVER_NAME = "murugappan.dev";

// `_meta` keys reserved by the specification.
const META_PROTOCOL_VERSION = "io.modelcontextprotocol/protocolVersion";
const META_CLIENT_CAPABILITIES = "io.modelcontextprotocol/clientCapabilities";
export const META_SERVER_INFO = "io.modelcontextprotocol/serverInfo";

// JSON-RPC 2.0 standard codes plus the MCP-reserved sub-range (-32020..-32099).
export const JSON_RPC_PARSE_ERROR = -32700;
export const JSON_RPC_INVALID_REQUEST = -32600;
export const JSON_RPC_METHOD_NOT_FOUND = -32601;
export const JSON_RPC_INVALID_PARAMS = -32602;
const MCP_HEADER_MISMATCH = -32020;
const MCP_UNSUPPORTED_PROTOCOL_VERSION = -32022;

const JsonRpcId = z.union([z.string(), z.number()]);
export type JsonRpcId = z.infer<typeof JsonRpcId>;

const JsonRpcMessage = z.object({
  jsonrpc: z.literal("2.0"),
  id: JsonRpcId.optional(),
  method: z.string(),
  // Non-object params are dropped; each method validates the fields it reads.
  params: lenient(JsonObject)
});
export type JsonRpcMessage = z.infer<typeof JsonRpcMessage>;

export type RpcFailure = {
  /** HTTP status the transport requires for this failure. */
  status: number;
  code: number;
  message: string;
  data?: unknown;
};

function invalidRequest(message: string): { ok: false; failure: RpcFailure } {
  return { ok: false, failure: { status: 400, code: JSON_RPC_INVALID_REQUEST, message } };
}

export function parseMessage(
  raw: unknown
): { ok: true; message: JsonRpcMessage } | { ok: false; failure: RpcFailure } {
  const parsed = JsonRpcMessage.safeParse(raw);
  if (parsed.success) return { ok: true, message: parsed.data };

  const { issues } = parsed.error;
  // The transport forbids batch arrays.
  if (issues.some(issue => issue.path.length === 0)) {
    return invalidRequest(
      "The request body must be a single JSON-RPC request or notification object. Batches and arrays are not supported on the Streamable HTTP transport."
    );
  }
  const failed = new Set(issues.map(issue => issue.path[0]));
  if (failed.has("jsonrpc") || failed.has("method")) {
    return invalidRequest('A JSON-RPC message needs "jsonrpc": "2.0" and a "method".');
  }
  // `id` is all that is left: `params` falls back instead of failing.
  return invalidRequest('The "id" of a JSON-RPC request must be a string or a number.');
}

function metaOf(message: JsonRpcMessage): Record<string, unknown> {
  return JsonObject.safeParse(message.params?._meta).data ?? {};
}

export function isModernRequest(message: JsonRpcMessage): boolean {
  return typeof metaOf(message)[META_PROTOCOL_VERSION] === "string";
}

const BASE64_SENTINEL = /^=\?base64\?(.*)\?=$/;

/** Decodes the `=?base64?…?=` sentinel for non-ASCII header values; null if invalid. */
function decodeHeaderValue(value: string): string | null {
  const match = value.match(BASE64_SENTINEL);
  if (!match) return value;
  try {
    // atob gives Latin-1 bytes; the sentinel wraps UTF-8, so re-decode them.
    const bytes = Uint8Array.from(atob(match[1]), c => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return null;
  }
}

const NAME_REQUIRED_METHODS = new Set(["tools/call", "resources/read", "prompts/get"]);

function headerMismatch(message: string): RpcFailure {
  return { status: 400, code: MCP_HEADER_MISMATCH, message };
}

/** Intermediaries route on the mirrored headers, so a body mismatch is a 400. */
export function validateModernHeaders(
  message: JsonRpcMessage,
  headers: { get(name: string): string | null }
): RpcFailure | null {
  const meta = metaOf(message);

  const versionHeader = headers.get("MCP-Protocol-Version");
  if (!versionHeader) {
    return headerMismatch("Header mismatch: the required MCP-Protocol-Version header is missing.");
  }
  if (versionHeader !== meta[META_PROTOCOL_VERSION]) {
    return headerMismatch(
      `Header mismatch: MCP-Protocol-Version header value '${versionHeader}' does not match the body value '${String(meta[META_PROTOCOL_VERSION])}'.`
    );
  }

  const methodHeader = headers.get("Mcp-Method");
  if (!methodHeader) {
    return headerMismatch("Header mismatch: the required Mcp-Method header is missing.");
  }
  if (methodHeader !== message.method) {
    return headerMismatch(
      `Header mismatch: Mcp-Method header value '${methodHeader}' does not match the body value '${message.method}'.`
    );
  }

  if (!NAME_REQUIRED_METHODS.has(message.method)) return null;

  const bodyName = message.params?.name ?? message.params?.uri;
  const nameHeader = headers.get("Mcp-Name");
  if (!nameHeader) {
    return headerMismatch(
      `Header mismatch: the Mcp-Name header is required on ${message.method} requests.`
    );
  }
  const decoded = decodeHeaderValue(nameHeader);
  if (decoded === null) {
    return headerMismatch(
      "Header mismatch: the Mcp-Name header is not valid Base64-sentinel-encoded UTF-8."
    );
  }
  if (decoded !== bodyName) {
    return headerMismatch(
      `Header mismatch: Mcp-Name header value '${decoded}' does not match the body value '${String(bodyName)}'.`
    );
  }
  return null;
}

export function validateModernMeta(message: JsonRpcMessage): RpcFailure | null {
  const capabilities = metaOf(message)[META_CLIENT_CAPABILITIES];
  if (!JsonObject.safeParse(capabilities).success) {
    return {
      status: 400,
      code: JSON_RPC_INVALID_PARAMS,
      message: `Invalid params: '_meta.${META_CLIENT_CAPABILITIES}' is required on every request and must be an object.`
    };
  }
  return null;
}

export function checkModernVersion(message: JsonRpcMessage): RpcFailure | null {
  // isModernRequest guarantees a string.
  const requested = String(metaOf(message)[META_PROTOCOL_VERSION]);
  if (MODERN_PROTOCOL_VERSIONS.includes(requested)) return null;
  return {
    status: 400,
    code: MCP_UNSUPPORTED_PROTOCOL_VERSION,
    message: `Unsupported protocol version '${requested}' for a request carrying per-request metadata. Supported versions: ${SUPPORTED_PROTOCOL_VERSIONS.join(", ")}.`,
    data: { supported: SUPPORTED_PROTOCOL_VERSIONS, requested }
  };
}

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

export function negotiateLegacyVersion(requested: unknown): string {
  return typeof requested === "string" && LEGACY_PROTOCOL_VERSIONS.includes(requested)
    ? requested
    : LEGACY_PROTOCOL_VERSIONS[0];
}
