import { Suspense, useEffect, useEffectEvent, useRef, useState, type ComponentProps } from "react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { safeValidateUIMessages } from "ai";
import { z } from "zod";
import { nanoid } from "nanoid";
import { Download, EllipsisVertical, MessageCircle, RotateCcw, X } from "lucide-react";

import {
  ERROR_NOTICE,
  GREETING,
  type Activity,
  type JarvisMessage
} from "@murugappan/contracts/chat.ts";
import { ActivityRow } from "./ActivityRow";
import { BubbleView, toBubbles, type Bubble } from "./Bubble";
import { Composer } from "./Composer";
import { Button } from "#src/components/ui/button.tsx";
import { Card, CardFooter, CardHeader } from "#src/components/ui/card.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogTitle,
  DialogTrigger
} from "#src/components/ui/dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "#src/components/ui/dropdown-menu.tsx";
import { ScrollArea } from "#src/components/ui/scroll-area.tsx";
import { cn } from "#src/lib/utils.ts";
import { track, reportError } from "#src/lib/analytics.ts";
import { readStored, writeStored } from "#src/lib/storage.ts";

const ROOM_KEY = "chatRoomId";
const TOOLTIP_KEY = "chatTooltipSeen";

const STARTERS = [
  "What's the most impactful thing he's shipped?",
  "How has he used LLMs in production?",
  "Summarize his experience in 30 seconds"
];

type Phase =
  | { kind: "loading" }
  | { kind: "idle" }
  | { kind: "working"; activity: Activity | null }
  | { kind: "replying" };

const DATA_SCHEMAS = {
  activity: z.object({
    name: z.enum(["fetch_page", "capture_opportunity"]),
    detail: z.string().optional()
  }),
  notice: z.object({ kind: z.enum(["limit", "error"]), text: z.string() })
};

function turnPhase(last: JarvisMessage | undefined): Phase {
  if (last?.role !== "assistant") return { kind: "working", activity: null };
  const tail = last.parts.findLast(
    part => part.type === "data-activity" || (part.type === "text" && part.text.trim() !== "")
  );
  if (tail?.type === "text") return { kind: "replying" };
  return { kind: "working", activity: tail?.type === "data-activity" ? tail.data : null };
}

// The hook's default loader rejects when offline, which would crash the island.
async function loadHistory({ url }: { url?: string }): Promise<JarvisMessage[]> {
  if (!url) return [];
  try {
    const endpoint = new URL(url);
    endpoint.pathname += "/get-messages";
    endpoint.search = "";
    const res = await fetch(endpoint);
    if (!res.ok) return [];
    const parsed = await safeValidateUIMessages<JarvisMessage>({
      messages: await res.json(),
      dataSchemas: DATA_SCHEMAS
    });
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function roomId(): string {
  const saved = readStored(ROOM_KEY);
  if (saved) return saved;
  const id = nanoid();
  writeStored({ key: ROOM_KEY, value: id });
  return id;
}

function downloadTranscript(bubbles: Bubble[]) {
  track("chat_transcript_download");
  const lines = [
    `Jarvis: ${GREETING}`,
    ...bubbles.flatMap(b =>
      b.kind === "system" ? [] : [`${b.kind === "user" ? "You" : "Jarvis"}: ${b.text}`]
    )
  ];
  const date = new Date().toISOString().slice(0, 10);
  const body = `Chat with Jarvis on murugappan.dev\n${date}\n\n${lines.join("\n\n")}\n`;
  const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `jarvis-chat-${date}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

const isPhone = () => window.matchMedia("(max-width: 639px)").matches;

function focusInChat(launcher: HTMLElement | null): boolean {
  const active = document.activeElement;
  return (
    !active ||
    active === document.body ||
    active === launcher ||
    active.closest('[data-slot="dialog-content"]') !== null
  );
}

function HeaderButton(props: ComponentProps<typeof Button>) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8 rounded-lg text-primary-foreground hover:bg-white/15 hover:text-primary-foreground [&_svg:not([class*='size-'])]:size-5"
      {...props}
    />
  );
}

const startersShown = (bubbles: Bubble[], phase: Phase) =>
  phase.kind === "idle" && bubbles.every(b => b.kind !== "user");

type PanelProps = {
  bubbles: Bubble[];
  phase: Phase;
  onSend: (text: string) => void;
  onRestart: () => void;
};

function ChatPanel({ bubbles, phase, onSend, onRestart }: PanelProps) {
  const [phone] = useState(isPhone);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const send = (text: string) => {
    setConfirmRestart(false);
    onSend(text);
  };

  useEffect(() => {
    const v = viewportRef.current;
    if (!v) return;
    v.scrollTop = startersShown(bubbles, phase) ? 0 : v.scrollHeight;
  }, [bubbles, phase]);

  const showStarters = startersShown(bubbles, phase);

  return (
    <>
      {/* Radix locks page scroll from the overlay, which renders only while modal (phones). */}
      <DialogOverlay />
      <DialogContent
        asChild
        onInteractOutside={e => e.preventDefault()}
        onOpenAutoFocus={e => {
          if (!phone) e.preventDefault();
        }}
        // The loading panel's content unmounts while the chat stays open, and Radix would
        // move focus to the launcher then; closePanel returns focus itself.
        onCloseAutoFocus={e => e.preventDefault()}
      >
        <Card
          // oxlint-disable-next-line tailwindcss/no-arbitrary-value -- the panel clears the launcher below it and a 12px edge on each side; viewport minus a length has no default
          className="fixed right-8 bottom-24 z-50 h-130 max-h-[calc(100vh-120px)] w-96 max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl shadow-2xl max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-auto max-sm:max-w-none max-sm:rounded-none max-sm:border-0"
        >
          <CardHeader className="flex-row items-center gap-1 bg-primary py-3 text-primary-foreground">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-semibold">Chat with Jarvis</DialogTitle>
              <DialogDescription className="text-xs opacity-90">
                Murugappan's AI assistant, answering from this site
              </DialogDescription>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <HeaderButton aria-label="Conversation options">
                  <EllipsisVertical />
                </HeaderButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setConfirmRestart(true)}>
                  <RotateCcw /> Start over
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => downloadTranscript(bubbles)}>
                  <Download /> Download transcript
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DialogClose asChild>
              <HeaderButton aria-label="Close chat">
                <X />
              </HeaderButton>
            </DialogClose>
          </CardHeader>

          {confirmRestart && (
            <div className="flex items-center justify-between gap-2 border-b bg-muted/50 px-3 py-2">
              <span className="text-xs text-muted-foreground">Start a new conversation?</span>
              <div className="flex gap-1.5">
                <Button size="sm" className="h-7 px-2.5 text-xs" onClick={onRestart}>
                  Start over
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setConfirmRestart(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <ScrollArea className="min-h-0 flex-1" viewportRef={viewportRef}>
            {/* PII: replay masks inputs but not bubbles, so mask the transcript
                (data-ph-mask is the maskTextSelector in lib/analytics.ts). */}
            <div className="flex flex-col gap-2 p-3" aria-live="polite" data-ph-mask="true">
              <BubbleView kind="assistant" text={GREETING} />
              {bubbles.map(b => (
                <BubbleView key={b.id} kind={b.kind} text={b.text} />
              ))}
              {phase.kind === "loading" && (
                <div className="flex items-center gap-1 self-start rounded-xl rounded-bl-sm bg-muted p-3">
                  {[0, 1, 2].map(i => (
                    <span
                      key={i}
                      // oxlint-disable-next-line tailwindcss/no-arbitrary-value -- staggers the three dots; Tailwind has no animation-delay utility
                      className="size-1.5 animate-chat-dot rounded-full bg-muted-foreground nth-2:[animation-delay:0.2s] nth-3:[animation-delay:0.4s] motion-reduce:animate-none"
                    />
                  ))}
                </div>
              )}
              {phase.kind === "working" && <ActivityRow activity={phase.activity} />}
              {showStarters && (
                <div className="mt-1 flex flex-col items-start gap-2">
                  {STARTERS.map(q => (
                    <Button
                      key={q}
                      variant="outline"
                      size="sm"
                      className="h-auto rounded-full border-primary/40 px-3 py-1.5 text-left text-xs font-normal whitespace-normal text-foreground hover:border-primary"
                      onClick={() => {
                        track("chat_starter_click");
                        send(q);
                      }}
                    >
                      {q}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>

          <CardFooter className="border-t p-2.5">
            {/* oxlint-disable-next-line jsx-a11y/no-autofocus -- the visitor opened the panel to type into it. Not on phones: focusing pops the keyboard over the greeting. */}
            <Composer disabled={phase.kind !== "idle"} autoFocus={!phone} onSend={send} />
          </CardFooter>
        </Card>
      </DialogContent>
    </>
  );
}

type SessionProps = {
  room: string;
  host: string;
  open: boolean;
  onRestart: () => void;
};

function ChatSession({ room, host, open, onRestart }: SessionProps) {
  const [awaitingReply, setAwaitingReply] = useState(false);
  const agent = useAgent({ agent: "chat-room", name: room, host });
  const { messages, sendMessage, status, isServerStreaming } = useAgentChat<unknown, JarvisMessage>(
    {
      agent,
      dataPartSchemas: DATA_SCHEMAS,
      getInitialMessages: loadHistory,
      syncMessagesToServer: false,
      body: () => ({ page: window.location.pathname }),
      onData: part => {
        if (part.type === "data-notice")
          track(part.data.kind === "limit" ? "chat_limit" : "chat_error");
      },
      onError: err => {
        track("chat_error");
        reportError(err, { surface: "chat" });
      }
    }
  );

  const last = messages.at(-1);
  const replyStarted = last?.role === "assistant" && last.parts.length > 0;
  const busy =
    status === "submitted" ||
    status === "streaming" ||
    isServerStreaming ||
    (awaitingReply && status !== "error" && !replyStarted);

  const bubbles = toBubbles(messages);
  if (status === "error") bubbles.push({ id: "error", kind: "system", text: ERROR_NOTICE.text });

  const onSend = (text: string) => {
    setAwaitingReply(true);
    // PII: never send message text to PostHog.
    track("chat_message_sent");
    void sendMessage({ text });
  };

  if (!open) return null;
  return (
    <ChatPanel
      bubbles={bubbles}
      phase={busy ? turnPhase(last) : { kind: "idle" }}
      onSend={onSend}
      onRestart={onRestart}
    />
  );
}

export function ChatWidget({ host }: { host?: string }) {
  const [open, setOpen] = useState(false);
  // Fixed while open: Radix remounts the panel when `modal` flips, which would drop the draft.
  const [modal, setModal] = useState(false);
  const [room, setRoom] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<"hidden" | "shown" | "fading">("hidden");
  const launcherRef = useRef<HTMLButtonElement | null>(null);

  const openPanel = () => {
    setModal(isPhone());
    setOpen(true);
    setRoom(current => current ?? roomId());
    setTooltip("hidden");
    track("chat_open");
  };

  const closePanel = () => {
    const refocus = focusInChat(launcherRef.current);
    setOpen(false);
    setTooltip("hidden");
    // After the panel unmounts, since a phone modal's focus trap would pull focus back in.
    if (refocus) requestAnimationFrame(() => launcherRef.current?.focus());
  };

  const restart = () => {
    track("chat_restart");
    const next = nanoid();
    writeStored({ key: ROOM_KEY, value: next });
    setRoom(next);
  };

  const openOnHydrate = useEffectEvent(() => {
    const island = launcherRef.current?.closest("astro-island");
    if (!(island instanceof HTMLElement) || !island.dataset.openOnHydrate) return;
    delete island.dataset.openOnHydrate;
    openPanel();
  });
  useEffect(() => openOnHydrate(), []);

  useEffect(() => {
    if (readStored(TOOLTIP_KEY)) return;
    writeStored({ key: TOOLTIP_KEY, value: "1" });
    // oxlint-disable-next-line react/set-state-in-effect -- localStorage is client-only, so reading it during render would break hydration
    setTooltip("shown");
    const fade = setTimeout(() => setTooltip("fading"), 5000);
    const gone = setTimeout(() => setTooltip("hidden"), 5700);
    return () => {
      clearTimeout(fade);
      clearTimeout(gone);
    };
  }, []);

  const loadingPanel = (
    <ChatPanel bubbles={[]} phase={{ kind: "loading" }} onSend={() => {}} onRestart={restart} />
  );

  return (
    <Dialog open={open} onOpenChange={next => (next ? openPanel() : closePanel())} modal={modal}>
      <DialogTrigger asChild>
        <Button
          className="fixed right-8 bottom-5 z-40 size-14 rounded-full shadow-lg [&_svg:not([class*='size-'])]:size-6"
          aria-label="Chat with Jarvis, Murugappan's AI assistant"
          ref={launcherRef}
        >
          {open ? <X /> : <MessageCircle />}
        </Button>
      </DialogTrigger>

      {tooltip !== "hidden" && (
        <div
          className={cn(
            "fixed right-24 bottom-8 z-40 rounded-lg border bg-background px-3 py-2 text-sm text-foreground shadow-lg transition-opacity duration-500",
            tooltip === "fading" && "opacity-0"
          )}
        >
          Ask Jarvis anything about Murugappan
        </div>
      )}

      {room && (
        // The hook suspends while it loads the room's history.
        <Suspense fallback={open && loadingPanel}>
          <ChatSession
            key={room}
            room={room}
            host={host || window.location.host}
            open={open}
            onRestart={restart}
          />
        </Suspense>
      )}
    </Dialog>
  );
}
