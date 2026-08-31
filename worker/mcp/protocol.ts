// JSON-RPC framing and Streamable HTTP request validation for the MCP endpoint,
// per the 2026-07-28 revision of the specification.
//
// Two eras are served on one endpoint, which the spec explicitly allows
// ("Versioning: Backward Compatibility with Initialization-Based Versions"):
//
//   modern (2026-07-28+) — stateless. Every request carries its protocol
//     version, client info and capabilities in `params._meta`, mirrored into
//     HTTP headers that the server MUST validate against the body. Results
//     carry `resultType`.
//   legacy (2025-11-25 and earlier) — the `initialize` handshake. Still what
//     most deployed clients speak, so it is answered too. No session is minted:
//     this server holds no per-connection state either way.
//
// The era is chosen by how the client opens: a request carrying modern
// per-request `_meta` is served as modern, anything else as legacy.

export const LATEST_PROTOCOL_VERSION = "2026-07-28";
export const MODERN_PROTOCOL_VERSIONS = [LATEST_PROTOCOL_VERSION] as const;
// Newest first — the first entry is what `initialize` falls back to.
export const LEGACY_PROTOCOL_VERSIONS = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26"
] as const;
export const SUPPORTED_PROTOCOL_VERSIONS: string[] = [
  ...MODERN_PROTOCOL_VERSIONS,
  ...LEGACY_PROTOCOL_VERSIONS
];

export const SERVER_NAME = "murugappan.dev";

// `_meta` keys reserved by the specification.
export const META_PROTOCOL_VERSION = "io.modelcontextprotocol/protocolVersion";
export const META_CLIENT_INFO = "io.modelcontextprotocol/clientInfo";
export const META_CLIENT_CAPABILITIES =
  "io.modelcontextprotocol/clientCapabilities";
export const META_SERVER_INFO = "io.modelcontextprotocol/serverInfo";

// JSON-RPC 2.0 standard codes plus the MCP-reserved sub-range (-32020..-32099).
export const JSON_RPC_PARSE_ERROR = -32700;
export const JSON_RPC_INVALID_REQUEST = -32600;
export const JSON_RPC_METHOD_NOT_FOUND = -32601;
export const JSON_RPC_INVALID_PARAMS = -32602;
export const MCP_HEADER_MISMATCH = -32020;
export const MCP_UNSUPPORTED_PROTOCOL_VERSION = -32022;

export type JsonRpcId = string | number;

export type JsonRpcMessage = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
};

export type RpcFailure = {
  /** HTTP status the transport requires for this failure. */
  status: number;
  code: number;
  message: string;
  data?: unknown;
};

export function parseMessage(
  raw: unknown
): {ok: true; message: JsonRpcMessage} | {ok: false; failure: RpcFailure} {
  // "The body of the HTTP POST MUST be a single JSON-RPC request or
  // notification" — a batch array is not a valid body on this transport.
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      failure: {
        status: 400,
        code: JSON_RPC_INVALID_REQUEST,
        message:
          "The request body must be a single JSON-RPC request or notification object. Batches and arrays are not supported on the Streamable HTTP transport."
      }
    };
  }
  const msg = raw as Record<string, unknown>;
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return {
      ok: false,
      failure: {
        status: 400,
        code: JSON_RPC_INVALID_REQUEST,
        message: 'A JSON-RPC message needs "jsonrpc": "2.0" and a "method".'
      }
    };
  }
  if (
    msg.id !== undefined &&
    typeof msg.id !== "string" &&
    typeof msg.id !== "number"
  ) {
    return {
      ok: false,
      failure: {
        status: 400,
        code: JSON_RPC_INVALID_REQUEST,
        message: 'The "id" of a JSON-RPC request must be a string or a number.'
      }
    };
  }
  return {
    ok: true,
    message: {
      jsonrpc: "2.0",
      ...(msg.id === undefined ? {} : {id: msg.id as JsonRpcId}),
      method: msg.method,
      params:
        typeof msg.params === "object" &&
        msg.params !== null &&
        !Array.isArray(msg.params)
          ? (msg.params as Record<string, unknown>)
          : undefined
    }
  };
}

/** True when the client is speaking the per-request-metadata era. */
export function isModernRequest(message: JsonRpcMessage): boolean {
  const meta = message.params?._meta;
  if (typeof meta !== "object" || meta === null) return false;
  return (
    typeof (meta as Record<string, unknown>)[META_PROTOCOL_VERSION] === "string"
  );
}

const BASE64_SENTINEL = /^=\?base64\?(.*)\?=$/;

/**
 * Header values that cannot be represented as plain ASCII arrive Base64-encoded
 * behind the `=?base64?…?=` sentinel; the spec requires servers to decode
 * before comparing against the body.
 */
export function decodeHeaderValue(value: string): string | null {
  const match = value.match(BASE64_SENTINEL);
  if (!match) return value;
  try {
    // atob gives Latin-1 bytes; the sentinel wraps UTF-8, so re-decode them.
    const bytes = Uint8Array.from(atob(match[1]), c => c.charCodeAt(0));
    return new TextDecoder("utf-8", {fatal: true, ignoreBOM: false}).decode(
      bytes
    );
  } catch {
    return null;
  }
}

const NAME_REQUIRED_METHODS = new Set([
  "tools/call",
  "resources/read",
  "prompts/get"
]);

function headerMismatch(message: string): RpcFailure {
  return {status: 400, code: MCP_HEADER_MISMATCH, message};
}

/**
 * The transport's header/body agreement rules. Mirrored headers let
 * intermediaries route without parsing the body, so a disagreement between the
 * two is a security problem, not a nicety — hence 400 + HeaderMismatch.
 */
export function validateModernHeaders(
  message: JsonRpcMessage,
  headers: {get(name: string): string | null}
): RpcFailure | null {
  const meta = (message.params?._meta ?? {}) as Record<string, unknown>;

  const versionHeader = headers.get("MCP-Protocol-Version");
  if (!versionHeader) {
    return headerMismatch(
      "Header mismatch: the required MCP-Protocol-Version header is missing."
    );
  }
  if (versionHeader !== meta[META_PROTOCOL_VERSION]) {
    return headerMismatch(
      `Header mismatch: MCP-Protocol-Version header value '${versionHeader}' does not match the body value '${String(meta[META_PROTOCOL_VERSION])}'.`
    );
  }

  const methodHeader = headers.get("Mcp-Method");
  if (!methodHeader) {
    return headerMismatch(
      "Header mismatch: the required Mcp-Method header is missing."
    );
  }
  if (methodHeader !== message.method) {
    return headerMismatch(
      `Header mismatch: Mcp-Method header value '${methodHeader}' does not match the body value '${message.method}'.`
    );
  }

  if (NAME_REQUIRED_METHODS.has(message.method)) {
    const bodyName = message.params?.name ?? message.params?.uri ?? undefined;
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
  }

  return null;
}

/** The `_meta` fields the spec marks required on every modern request. */
export function validateModernMeta(message: JsonRpcMessage): RpcFailure | null {
  const meta = (message.params?._meta ?? {}) as Record<string, unknown>;
  const capabilities = meta[META_CLIENT_CAPABILITIES];
  if (
    typeof capabilities !== "object" ||
    capabilities === null ||
    Array.isArray(capabilities)
  ) {
    return {
      status: 400,
      code: JSON_RPC_INVALID_PARAMS,
      message: `Invalid params: '_meta.${META_CLIENT_CAPABILITIES}' is required on every request and must be an object.`
    };
  }
  return null;
}

export function checkModernVersion(message: JsonRpcMessage): RpcFailure | null {
  const requested = ((message.params?._meta ?? {}) as Record<string, unknown>)[
    META_PROTOCOL_VERSION
  ] as string;
  if ((MODERN_PROTOCOL_VERSIONS as readonly string[]).includes(requested))
    return null;
  return {
    status: 400,
    code: MCP_UNSUPPORTED_PROTOCOL_VERSION,
    message: `Unsupported protocol version '${requested}' for a request carrying per-request metadata. Supported versions: ${SUPPORTED_PROTOCOL_VERSIONS.join(", ")}.`,
    data: {supported: SUPPORTED_PROTOCOL_VERSIONS, requested}
  };
}

/**
 * Origin validation is required to blunt DNS-rebinding attacks against local
 * MCP servers. This server is public, unauthenticated and carries no ambient
 * credentials, so any *web* origin is legitimate — browser-based agents are a
 * supported client. What is rejected is an Origin that is not a web origin at
 * all (`null` from an opaque context, a `file:` or app scheme, or an
 * unparseable value), which no ordinary client sends.
 */
export function isAllowedOrigin(origin: string | null): boolean {
  if (origin === null) return true; // non-browser client: no Origin header
  try {
    const {protocol} = new URL(origin);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** The legacy version to answer `initialize` with. */
export function negotiateLegacyVersion(requested: unknown): string {
  return typeof requested === "string" &&
    (LEGACY_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : LEGACY_PROTOCOL_VERSIONS[0];
}
