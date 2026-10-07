// The wire contract shared with the chat widget, so it stays free of runtime dependencies
// that would ship in the client bundle.
import type { UIMessage } from "ai";

export const MAX_MESSAGE_LENGTH = 1000;

// The widget shows it above every conversation; rooms never store it.
export const GREETING =
  "Hi, I'm Jarvis, Murugappan's AI assistant. Ask me about his experience, " +
  "projects, or blog posts, or tell me about an opportunity for him.";

export type ChatHistoryEntry = { role: "user" | "assistant"; content: string };

// Tools the widget knows how to narrate in its activity row.
export type ToolName = "fetch_page" | "capture_opportunity";

/** The tool a turn is running. The widget owns the wording. */
export type Activity = { name: ToolName; detail?: string };

/** What the room says instead of a reply: the spend limit, or a failure. */
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

/**
 * A Jarvis message: text parts, plus `activity` parts where a tool step began
 * and a `notice` part. Tool inputs and results never reach the client.
 */
export type JarvisMessage = UIMessage<unknown, { activity: Activity; notice: Notice }>;

/** A message's prose. Each step of a reply is its own text part. */
export function messageText(message: Pick<UIMessage, "parts">): string {
  return message.parts
    .flatMap(part => (part.type === "text" ? [part.text] : []))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Only a page fetch has a detail. A capture's input is the visitor's name and contact details.
export function fetchActivity(url: string): Activity {
  try {
    return { name: "fetch_page", detail: new URL(url).pathname };
  } catch {
    return { name: "fetch_page" };
  }
}
