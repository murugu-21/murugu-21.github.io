import type { UIMessage } from "ai";
import { z } from "zod";

export const MAX_MESSAGE_LENGTH = 1000;

// Browsers can't set headers on a WebSocket, so the widget sends its Turnstile token in the query.
export const TURNSTILE_TOKEN_PARAM = "cf-turnstile-response";

export const GREETING =
  "Hi, I'm Jarvis, Murugappan's AI assistant. Ask me about his experience, " +
  "projects, or blog posts, or tell me about an opportunity for him.";

export type ChatHistoryEntry = { role: "user" | "assistant"; content: string };

const ToolName = z.enum(["fetch_page", "capture_opportunity"]);
export type ToolName = z.infer<typeof ToolName>;

const Activity = z.object({ name: ToolName, detail: z.string().optional() });
export type Activity = z.infer<typeof Activity>;

const Notice = z.object({ kind: z.enum(["limit", "error"]), text: z.string() });
export type Notice = z.infer<typeof Notice>;

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

export const JARVIS_DATA_SCHEMAS = { activity: Activity, notice: Notice };

export type JarvisMessage = UIMessage<unknown, { activity: Activity; notice: Notice }>;
