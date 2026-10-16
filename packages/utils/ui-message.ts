import type { UIMessage } from "ai";

export function messageText(message: Pick<UIMessage, "parts">): string {
  return message.parts
    .flatMap(part => (part.type === "text" ? [part.text] : []))
    .join("\n")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}
