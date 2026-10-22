import type { UIMessage } from "ai";

export const MAX_MESSAGE_LENGTH = 1000;

// Browsers can't set headers on a WebSocket, so the widget sends its Turnstile token in the query.
export const TURNSTILE_TOKEN_PARAM = "cf-turnstile-response";

export const GREETING =
  "Hi, I'm Jarvis, Murugappan's AI assistant. Ask me about his experience, " +
  "projects, or blog posts, or tell me about an opportunity for him.";

export type ChatHistoryEntry = { role: "user" | "assistant"; content: string };

export type ToolName = "fetch_page" | "capture_opportunity";

export type Activity = { name: ToolName; detail?: string };

export type Notice = { kind: "limit" | "error"; text: string };

export const LIMIT_NOTICE: Notice = {
  kind: "limit",
  text:
    "I've hit my chat budget for now. Please reach Murugappan directly " +
    "through the social links on this site instead."
};

export const ERROR_NOTICE: Notice = {
  kind: "error",
  text: "Something went wrong on my end. Please try again."
};

export type JarvisMessage = UIMessage<unknown, { activity: Activity; notice: Notice }>;
