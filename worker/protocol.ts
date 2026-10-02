export const MAX_MESSAGE_LENGTH = 1000;

// Shared: the ChatRoom persists it as each room's first message, and the
// widget shows it when the socket can't deliver history.
export const GREETING =
  "Hi, I'm Jarvis — Murugappan's AI assistant. Ask me about his experience, " +
  "projects, or blog posts — or tell me about an opportunity for him.";

// `page` is the visitor's current site path; never persisted.
export type ClientMessage = { type: "chat"; text: string; page?: string };

const PAGE_PATH = /^\/[^\s]{0,199}$/;

export type ChatHistoryEntry = { role: "user" | "assistant"; content: string };

// Set on the WebSocket upgrade by server.ts, which strips client-sent copies,
// because a Durable Object never sees `request.cf`.
export const VISITOR_COUNTRY_HEADER = "x-visitor-country";
export const VISITOR_IP_HEADER = "x-visitor-ip";

export type VisitorContext = { country: string | null; ip: string | null };

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

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== "string") return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const msg = data as Record<string, unknown>;
  if (msg.type !== "chat" || typeof msg.text !== "string") return null;
  const text = msg.text.trim();
  if (text.length === 0 || text.length > MAX_MESSAGE_LENGTH) return null;
  const page = typeof msg.page === "string" && PAGE_PATH.test(msg.page) ? msg.page : undefined;
  return { type: "chat", text, page };
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
