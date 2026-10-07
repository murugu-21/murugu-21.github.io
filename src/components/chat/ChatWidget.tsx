// Jarvis chat island, shared by the portfolio and blog via ChatWidget.astro.
import { Suspense, useEffect, useRef, useState } from "react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { safeValidateUIMessages } from "ai";
import { z } from "zod";
import { nanoid } from "nanoid";
import { Download, EllipsisVertical, MessageCircle, RotateCcw, X } from "lucide-react";

import { ERROR_NOTICE, GREETING, type Activity, type JarvisMessage } from "#contracts/chat.ts";
import { ActivityRow } from "./ActivityRow";
import { BubbleView, toBubbles, type Bubble } from "./Bubble";
import { Composer } from "./Composer";
import { Button } from "#src/components/ui/button.tsx";
import { Card, CardFooter, CardHeader } from "#src/components/ui/card.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "#src/components/ui/dropdown-menu.tsx";
import { ScrollArea } from "#src/components/ui/scroll-area.tsx";
import { cn } from "#src/lib/utils.ts";
import { track, reportError } from "#src/lib/analytics.ts";

const ROOM_KEY = "chatRoomId";
const TOOLTIP_KEY = "chatTooltipSeen";

// Each steers Jarvis toward a strong grounded answer without selling.
const STARTERS = [
  "What's the most impactful thing he's shipped?",
  "How has he used LLMs in production?",
  "Summarize his experience in 30 seconds"
];

/** What the panel waits on. Only an idle room takes a message. */
type Phase =
  | { kind: "loading" }
  | { kind: "idle" }
  // Before the reply's prose, or on a tool step after it; null until a tool starts.
  | { kind: "working"; activity: Activity | null }
  | { kind: "replying" };

// The room's data parts arrive over the network, so they're parsed, not trusted.
const DATA_SCHEMAS = {
  activity: z.object({
    name: z.enum(["fetch_page", "capture_opportunity"]),
    detail: z.string().optional()
  }),
  notice: z.object({ kind: z.enum(["limit", "error"]), text: z.string() })
};

// A running turn shows its latest tool step or prose, whichever came last.
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
  let id = localStorage.getItem(ROOM_KEY);
  if (!id) {
    id = nanoid();
    localStorage.setItem(ROOM_KEY, id);
  }
  return id;
}

function downloadTranscript(bubbles: Bubble[]) {
  track("chat_transcript_download");
  const lines = [
    `Jarvis: ${GREETING}`,
    // The room's notices aren't part of the conversation.
    ...bubbles
      .filter(b => b.kind !== "system")
      .map(b => `${b.kind === "user" ? "You" : "Jarvis"}: ${b.text}`)
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

type PanelProps = {
  bubbles: Bubble[];
  phase: Phase;
  onSend: (text: string) => void;
  onClose: () => void;
  onRestart: () => void;
};

function ChatPanel({ bubbles, phase, onSend, onClose, onRestart }: PanelProps) {
  const [confirmRestart, setConfirmRestart] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const send = (text: string) => {
    setConfirmRestart(false);
    onSend(text);
  };

  // Stick to the bottom, except on a fresh conversation where the greeting must
  // stay visible above overflowing starter chips.
  useEffect(() => {
    const v = viewportRef.current;
    if (!v) return;
    const fresh = bubbles.every(b => b.kind === "system");
    v.scrollTop = fresh ? 0 : v.scrollHeight;
  }, [bubbles, phase]);

  // Body scroll lock while the panel is full-screen (mobile).
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => document.documentElement.classList.toggle("chat-panel-locked", mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      document.documentElement.classList.remove("chat-panel-locked");
    };
  }, []);

  // Until the visitor says anything; the greeting doesn't count.
  const showStarters = phase.kind === "idle" && bubbles.every(b => b.kind !== "user");

  const headerBtn =
    "size-8 rounded-lg text-primary-foreground hover:bg-white/15 hover:text-primary-foreground [&_svg:not([class*='size-'])]:size-4.5";

  return (
    <Card
      role="dialog"
      aria-label="Chat with Jarvis, Murugappan's AI assistant"
      className="fixed right-7.5 bottom-22.5 z-1001 h-130 max-h-[calc(100vh-120px)] w-92.5 max-w-[calc(100vw-24px)] overflow-hidden rounded-[14px] shadow-2xl max-sm:top-0 max-sm:right-0 max-sm:bottom-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-auto max-sm:max-w-none max-sm:rounded-none max-sm:border-0"
    >
      <CardHeader className="flex-row items-center gap-1 bg-primary py-3 text-primary-foreground">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Chat with Jarvis</h2>
          <p className="text-xs opacity-90">Murugappan's AI assistant, answering from this site</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={headerBtn}
              aria-label="Conversation options"
            >
              <EllipsisVertical />
            </Button>
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
        <Button
          variant="ghost"
          size="icon"
          className={headerBtn}
          aria-label="Close chat"
          onClick={onClose}
        >
          <X />
        </Button>
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
          {bubbles.map((b, i) => (
            <BubbleView key={i} kind={b.kind} text={b.text} />
          ))}
          {phase.kind === "loading" && (
            <div className="flex items-center gap-1 self-start rounded-xl rounded-bl-sm bg-muted p-3">
              <span className="chat-dot" />
              <span className="chat-dot" />
              <span className="chat-dot" />
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
                  className="h-auto rounded-full border-primary/40 px-3 py-1.5 text-left text-[13px] font-normal whitespace-normal text-foreground hover:border-primary"
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
        <Composer disabled={phase.kind !== "idle"} onSend={send} />
      </CardFooter>
    </Card>
  );
}

type SessionProps = {
  room: string;
  host: string;
  open: boolean;
  onClose: () => void;
  onRestart: () => void;
};

// Owns the room's socket, so it stays mounted while the panel is closed.
function ChatSession({ room, host, open, onClose, onRestart }: SessionProps) {
  const [awaitingReply, setAwaitingReply] = useState(false);
  const agent = useAgent({ agent: "chat-room", name: room, host });
  const { messages, sendMessage, status, isServerStreaming } = useAgentChat<unknown, JarvisMessage>(
    {
      agent,
      dataPartSchemas: DATA_SCHEMAS,
      getInitialMessages: loadHistory,
      // The room ignores client-sent history anyway.
      syncMessagesToServer: false,
      // `page` lets "this post"/"this page" resolve.
      body: () => ({ page: window.location.pathname }),
      onData: part => {
        // PII: never send message text to PostHog.
        if (part.type === "data-notice")
          track(part.data.kind === "limit" ? "chat_limit" : "chat_error");
      },
      onError: err => {
        track("chat_error");
        reportError(err, { surface: "chat" });
      }
    }
  );

  // On a fresh socket the hook's resume probe can mark the chat ready while this
  // tab's first message is in flight, until the reply's first part streams in.
  // isServerStreaming covers a turn another tab started.
  const last = messages.at(-1);
  const replyStarted = last?.role === "assistant" && last.parts.length > 0;
  const busy =
    status === "submitted" ||
    status === "streaming" ||
    isServerStreaming ||
    (awaitingReply && status !== "error" && !replyStarted);

  const bubbles = toBubbles(messages);
  if (status === "error") bubbles.push({ kind: "system", text: ERROR_NOTICE.text });

  const onSend = (text: string) => {
    setAwaitingReply(true);
    track("chat_message_sent");
    void sendMessage({ text });
  };

  if (!open) return null;
  return (
    <ChatPanel
      bubbles={bubbles}
      phase={busy ? turnPhase(last) : { kind: "idle" }}
      onSend={onSend}
      onClose={onClose}
      onRestart={onRestart}
    />
  );
}

// `host` is PUBLIC_CHAT_HOST; unset means the page's own origin.
export function ChatWidget({ host }: { host?: string }) {
  const [open, setOpen] = useState(false);
  // Read from localStorage on first open, so the server render never needs it.
  const [room, setRoom] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<"hidden" | "shown" | "fading">("hidden");
  const launcherRef = useRef<HTMLButtonElement | null>(null);

  const openPanel = () => {
    setOpen(true);
    setRoom(current => current ?? roomId());
    setTooltip("hidden");
    track("chat_open");
  };

  const toggleOpen = () => {
    if (!open) return openPanel();
    setOpen(false);
    setTooltip("hidden");
  };

  // A fresh room rather than clearing this one, so the old conversation stays intact for the owner.
  const restart = () => {
    track("chat_restart");
    const next = nanoid();
    localStorage.setItem(ROOM_KEY, next);
    setRoom(next);
  };

  // Honour a launcher tap recorded by src/directives/interaction.ts while this bundle loaded.
  useEffect(() => {
    const island = launcherRef.current?.closest("astro-island");
    if (!(island instanceof HTMLElement) || !island.dataset.openOnHydrate) return;
    delete island.dataset.openOnHydrate;
    openPanel();
  }, []);

  // One-time quiet tooltip.
  useEffect(() => {
    if (localStorage.getItem(TOOLTIP_KEY)) return;
    localStorage.setItem(TOOLTIP_KEY, "1");
    // setState-in-effect on purpose: a lazy initializer reading localStorage
    // would make the server and hydration renders disagree.
    // oxlint-disable-next-line react/set-state-in-effect
    setTooltip("shown");
    const fade = setTimeout(() => setTooltip("fading"), 5000);
    const gone = setTimeout(() => setTooltip("hidden"), 5700);
    return () => {
      clearTimeout(fade);
      clearTimeout(gone);
    };
  }, []);

  const loadingPanel = (
    <ChatPanel
      bubbles={[]}
      phase={{ kind: "loading" }}
      onSend={() => {}}
      onClose={toggleOpen}
      onRestart={restart}
    />
  );

  return (
    <>
      <Button
        className="fixed right-7.5 bottom-5 z-1000 size-14 rounded-full shadow-lg [&_svg:not([class*='size-'])]:size-6"
        aria-label="Chat with Jarvis, Murugappan's AI assistant"
        aria-expanded={open}
        onClick={toggleOpen}
        ref={launcherRef}
      >
        {open ? <X /> : <MessageCircle />}
      </Button>

      {tooltip !== "hidden" && (
        <div
          className={cn(
            "fixed right-24 bottom-8 z-1000 rounded-[10px] border bg-background px-3 py-2 text-sm text-foreground shadow-lg transition-opacity duration-600",
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
            onClose={toggleOpen}
            onRestart={restart}
          />
        </Suspense>
      )}
    </>
  );
}
