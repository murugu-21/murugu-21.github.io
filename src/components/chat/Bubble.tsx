// One line of the chat transcript, from a visitor, Jarvis or the room.
import { Fragment } from "react";

import type { JarvisMessage } from "#contracts/chat.ts";
import { messageText } from "#utils/ui-message.ts";
import { cn } from "#src/lib/utils.ts";

export type Bubble = { kind: "user" | "assistant" | "system"; text: string };

// The room's `notice` parts (the spend limit, a failure) render as system lines.
export function toBubbles(messages: JarvisMessage[]): Bubble[] {
  return messages.flatMap(message => {
    const text = messageText(message);
    const bubbles: Bubble[] =
      text && message.role !== "system"
        ? [{ kind: message.role === "user" ? "user" : "assistant", text }]
        : [];
    for (const part of message.parts) {
      if (part.type === "data-notice") bubbles.push({ kind: "system", text: part.data.text });
    }
    return bubbles;
  });
}

// Split keeps captured URLs at odd indexes; trailing punctuation stays outside the link.
const URL_SPLIT = /(https?:\/\/[^\s]+)/;

// The prompt forbids markdown but [label](url) still slips through; flatten to "label: url".
const MD_LINK = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;

function renderWithLinks(raw: string) {
  const text = raw.replace(MD_LINK, (_m, label: string, url: string) =>
    label ? `${label}: ${url}` : url
  );
  return text.split(URL_SPLIT).map((part, i) => {
    if (i % 2 === 0) return part;
    const trailing = /[.,!?;:)]+$/.exec(part)?.[0] ?? "";
    const url = trailing ? part.slice(0, -trailing.length) : part;
    return (
      <Fragment key={i}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-current underline underline-offset-2 hover:opacity-80"
        >
          {url}
        </a>
        {trailing}
      </Fragment>
    );
  });
}

const BUBBLE_STYLES: Record<Bubble["kind"], string> = {
  user: "self-end rounded-br-sm bg-primary text-primary-foreground",
  assistant: "self-start rounded-bl-sm bg-muted text-foreground",
  system: "self-center bg-transparent text-center text-xs text-muted-foreground"
};

export function BubbleView({ kind, text }: Bubble) {
  return (
    <div
      className={cn(
        "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-[1.45] whitespace-pre-wrap wrap-break-word",
        BUBBLE_STYLES[kind]
      )}
    >
      {renderWithLinks(text)}
    </div>
  );
}
