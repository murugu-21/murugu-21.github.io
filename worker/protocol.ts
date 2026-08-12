export const MAX_MESSAGE_LENGTH = 1000;

export type ClientMessage = {type: "chat"; text: string};

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
  return {type: "chat", text};
}
