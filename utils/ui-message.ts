import type { UIMessage } from "ai";

/** A message's prose. Each step of a reply is its own text part. */
export function messageText(message: Pick<UIMessage, "parts">): string {
  return message.parts
    .flatMap(part => (part.type === "text" ? [part.text] : []))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
