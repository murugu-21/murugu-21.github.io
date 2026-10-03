// The wire contract shared with the chat widget, so it stays free of runtime dependencies
// that would ship in the client bundle.

export const MAX_MESSAGE_LENGTH = 1000;

// Shared: the ChatRoom persists it as each room's first message, and the
// widget shows it when the socket can't deliver history.
export const GREETING =
  "Hi, I'm Jarvis — Murugappan's AI assistant. Ask me about his experience, " +
  "projects, or blog posts — or tell me about an opportunity for him.";

export type ChatHistoryEntry = { role: "user" | "assistant"; content: string };

// Set on the WebSocket upgrade by server.ts, which strips client-sent copies,
// because a Durable Object never sees `request.cf`.
export const VISITOR_COUNTRY_HEADER = "x-visitor-country";
export const VISITOR_IP_HEADER = "x-visitor-ip";

type VisitorContext = { country: string | null; ip: string | null };

export function parseVisitorContext(headers: Headers): VisitorContext | null {
  const country = cleanHeader(headers.get(VISITOR_COUNTRY_HEADER));
  const ip = cleanHeader(headers.get(VISITOR_IP_HEADER));
  if (!country && !ip) return null;
  return { country, ip };
}

// The cap only has to stop a forged value from bloating a row.
function cleanHeader(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 64) : null;
}

// Tools the widget knows how to narrate in its activity row.
export type ToolName = "fetch_page" | "capture_opportunity";

export type ServerMessage =
  | { type: "history"; messages: ChatHistoryEntry[] }
  // Another tab's user message; the sender renders its own optimistically.
  | { type: "visitor"; text: string }
  | { type: "delta"; text: string }
  // Ephemeral: never persisted, cleared by the next delta/done/limit/error.
  | { type: "tool"; name: ToolName; detail?: string }
  | { type: "done" }
  | { type: "limit"; message: string }
  | { type: "error"; message: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isHistoryEntry = (value: unknown): value is ChatHistoryEntry =>
  isRecord(value) &&
  (value.role === "user" || value.role === "assistant") &&
  typeof value.content === "string";

/** Decodes a socket frame from the room, or null for anything off-contract. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== "string") return null;
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(msg)) return null;
  switch (msg.type) {
    case "history":
      return Array.isArray(msg.messages) && msg.messages.every(isHistoryEntry)
        ? { type: "history", messages: msg.messages }
        : null;
    case "visitor":
    case "delta":
      return typeof msg.text === "string" ? { type: msg.type, text: msg.text } : null;
    case "tool":
      if (msg.name !== "fetch_page" && msg.name !== "capture_opportunity") return null;
      return typeof msg.detail === "string"
        ? { type: "tool", name: msg.name, detail: msg.detail }
        : { type: "tool", name: msg.name };
    case "done":
      return { type: "done" };
    case "limit":
    case "error":
      return typeof msg.message === "string" ? { type: msg.type, message: msg.message } : null;
    default:
      return null;
  }
}

// The widget owns the wording. A capture never gets `detail`: its arguments
// are the visitor's name and contact details.
export function toolFrame(name: ToolName, url?: string | null): ServerMessage {
  if (name !== "fetch_page" || !url) return { type: "tool", name };
  try {
    return { type: "tool", name, detail: new URL(url).pathname };
  } catch {
    return { type: "tool", name };
  }
}
