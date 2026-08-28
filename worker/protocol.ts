export const MAX_MESSAGE_LENGTH = 1000;

// Jarvis's opener. Lives in the shared protocol module because both sides
// need it: the ChatRoom DO seeds it as the first persisted message of every
// room (so history replays and transcript downloads include it), and the
// widget falls back to it when the socket can't deliver history (offline).
export const GREETING =
  "Hi, I'm Jarvis — Murugappan's AI assistant. Ask me about his experience, " +
  "projects, or blog posts — or tell me about an opportunity for him.";

// `page` is the site path the visitor is on when they send the message —
// optional context, never persisted, validated to a plain absolute path.
export type ClientMessage = {type: "chat"; text: string; page?: string};

const PAGE_PATH = /^\/[^\s]{0,199}$/;

export type ChatHistoryEntry = {role: "user" | "assistant"; content: string};

// Tools the widget knows how to narrate in its activity row.
export type ToolName = "fetch_page" | "capture_opportunity";

export type ServerMessage =
  | {type: "history"; messages: ChatHistoryEntry[]}
  // Echo of another tab's user message (the sending tab renders its own
  // bubble optimistically and is excluded from this broadcast).
  | {type: "visitor"; text: string}
  | {type: "delta"; text: string}
  // Live tool activity, so the visitor can see what Jarvis is doing mid-turn.
  // Ephemeral: never persisted, cleared by the next delta/done/limit/error.
  | {type: "tool"; name: ToolName; detail?: string}
  | {type: "done"}
  | {type: "limit"; message: string}
  | {type: "error"; message: string};

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
  const page =
    typeof msg.page === "string" && PAGE_PATH.test(msg.page)
      ? msg.page
      : undefined;
  return {type: "chat", text, page};
}

// The frame for one tool call. Only the semantic event crosses the socket —
// the widget owns the wording. `detail` is the site path of a page fetch (the
// full url is noise in a 320px row); a capture never gets one, because its
// arguments are the visitor's own name and contact details.
export function toolFrame(name: ToolName, url?: string | null): ServerMessage {
  if (name !== "fetch_page" || !url) return {type: "tool", name};
  try {
    return {type: "tool", name, detail: new URL(url).pathname};
  } catch {
    return {type: "tool", name};
  }
}
