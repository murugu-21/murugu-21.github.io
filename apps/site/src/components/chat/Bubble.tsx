import { cva } from "class-variance-authority";
import { Fragment } from "react";

import type { JarvisMessage } from "@murugappan/contracts/chat.ts";
import { messageText } from "@murugappan/utils/ui-message.ts";

export type Bubble = { id: string; kind: "user" | "assistant" | "system"; text: string };

export function toBubbles(messages: JarvisMessage[]): Bubble[] {
  return messages.flatMap(message => {
    const text = messageText(message);
    const bubbles: Bubble[] =
      text && message.role !== "system"
        ? [{ id: message.id, kind: message.role === "user" ? "user" : "assistant", text }]
        : [];
    for (const [i, part] of message.parts.entries()) {
      if (part.type !== "data-notice") continue;
      bubbles.push({ id: `${message.id}:${i}`, kind: "system", text: part.data.text });
    }
    return bubbles;
  });
}

// Split keeps captured URLs at odd indexes.
const URL_SPLIT = /(https?:\/\/[^\s]+)/;

// The prompt forbids markdown but [label](url) still slips through; flatten to "label: url".
const MD_LINK = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;

function renderWithLinks(raw: string) {
  const text = raw.replaceAll(MD_LINK, (_m, label: string, url: string) =>
    label ? `${label}: ${url}` : url
  );
  return text.split(URL_SPLIT).map((part, i) => {
    if (i % 2 === 0) return part;
    const trailing = /[.,!?;:)]+$/.exec(part)?.[0] ?? "";
    const url = trailing ? part.slice(0, -trailing.length) : part;
    return (
      // oxlint-disable-next-line react/no-array-index-key -- the pieces of one message's text, which never reorder
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

const bubble = cva(
  "max-w-4/5 rounded-xl px-3 py-2 text-sm leading-normal wrap-break-word whitespace-pre-wrap",
  {
    variants: {
      kind: {
        user: "self-end rounded-br-sm bg-primary text-primary-foreground",
        assistant: "self-start rounded-bl-sm bg-muted text-foreground",
        system: "self-center bg-transparent text-center text-xs text-muted-foreground"
      } satisfies Record<Bubble["kind"], string>
    }
  }
);

export function BubbleView({ kind, text }: Omit<Bubble, "id">) {
  return <div className={bubble({ kind })}>{renderWithLinks(text)}</div>;
}
