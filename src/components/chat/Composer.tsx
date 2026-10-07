import { useEffect, useRef } from "react";
import { Send } from "lucide-react";

import { MAX_MESSAGE_LENGTH } from "#contracts/chat.ts";
import { Button } from "#src/components/ui/button.tsx";
import { Textarea } from "#src/components/ui/textarea.tsx";

type ComposerProps = { disabled: boolean; onSend: (text: string) => void };

/** The message box. A draft it can't send yet, while a turn runs, stays put. */
export function Composer({ disabled, onSend }: ComposerProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const submit = () => {
    const el = inputRef.current;
    const text = el?.value.trim();
    if (!el || !text || disabled) return;
    onSend(text);
    el.value = "";
  };

  // Desktop only: on phones autofocus pops the keyboard and hides the greeting.
  useEffect(() => {
    if (window.matchMedia("(min-width: 640px)").matches) inputRef.current?.focus();
  }, []);

  return (
    <form
      className="flex w-full items-end gap-2"
      onSubmit={e => {
        e.preventDefault();
        submit();
      }}
    >
      <Textarea
        ref={inputRef}
        id="chat-input"
        name="message"
        rows={1}
        maxLength={MAX_MESSAGE_LENGTH}
        placeholder="Ask a question…"
        aria-label="Your message"
        autoComplete="off"
        onKeyDown={e => {
          // isComposing: the Enter that commits an IME candidate must not send.
          if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
          e.preventDefault();
          submit();
        }}
        // Textarea's field-sizing-content grows it with the text; max-h-30 caps it at ~5 lines.
        className="max-h-30 min-h-0 resize-none overflow-x-hidden bg-secondary"
      />
      <Button type="submit" size="icon" aria-label="Send" disabled={disabled}>
        <Send />
      </Button>
    </form>
  );
}
