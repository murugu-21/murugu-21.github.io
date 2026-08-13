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

export type ServerMessage =
  | {type: "history"; messages: ChatHistoryEntry[]}
  | {type: "delta"; text: string}
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
