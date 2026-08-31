// Jarvis chat widget — React island on vendored shadcn/ui primitives, shared
// by the portfolio and the blog (the blog imports ./mount via a relative
// path). Idle-mounted by ChatWidget.astro so it never affects initial load.
import React, {useEffect, useRef, useState} from "react";
import {nanoid} from "nanoid";
import {PartySocket} from "partysocket";
import {
  Download,
  EllipsisVertical,
  MessageCircle,
  RotateCcw,
  Send,
  X
} from "lucide-react";

import {GREETING, type ServerMessage} from "../../../worker/protocol";
import {ActivityRow, type Activity} from "./ActivityRow";
import {Button} from "../ui/button";
import {Card, CardFooter, CardHeader} from "../ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../ui/dropdown-menu";
import {Input} from "../ui/input";
import {ScrollArea} from "../ui/scroll-area";
import {cn} from "../../lib/utils";
import "./chat.css";

const ROOM_KEY = "chatRoomId";
const TOOLTIP_KEY = "chatTooltipSeen";
const MAX_LENGTH = 1000;

// Shown as tappable chips while the conversation is empty. Subtle by design:
// each steers Jarvis toward a strong grounded answer without selling.
const STARTERS = [
  "What's the most impactful thing he's shipped?",
  "How has he used LLMs in production?",
  "Summarize his experience in 30 seconds"
];

type Bubble = {kind: "user" | "assistant" | "system"; text: string};

function roomId(): string {
  let id = localStorage.getItem(ROOM_KEY);
  if (!id) {
    id = nanoid();
    localStorage.setItem(ROOM_KEY, id);
  }
  return id;
}

// Render bare URLs in message text as real links (Jarvis replies in plain
// text; the system prompt tells it to include full URLs). Split keeps the
// captured URLs at odd indexes; trailing punctuation stays outside the link.
const URL_SPLIT = /(https?:\/\/[^\s]+)/;

// The prompt forbids markdown, but models still slip [label](url) through
// sometimes — flatten it to "label: url" so the linkifier below handles it.
const MD_LINK = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;

function renderWithLinks(raw: string) {
  const text = raw.replace(MD_LINK, (_m, label, url) =>
    label ? `${label}: ${url}` : url
  );
  return text.split(URL_SPLIT).map((part, i) => {
    if (i % 2 === 0) return part;
    const trailing = /[.,!?;:)]+$/.exec(part)?.[0] ?? "";
    const url = trailing ? part.slice(0, -trailing.length) : part;
    return (
      <React.Fragment key={i}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-current underline underline-offset-2 hover:opacity-80"
        >
          {url}
        </a>
        {trailing}
      </React.Fragment>
    );
  });
}

function BubbleView({kind, text}: Bubble) {
  return (
    <div
      className={cn(
        "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-[1.45] whitespace-pre-wrap break-words",
        kind === "user" &&
          "self-end rounded-br-sm bg-primary text-primary-foreground",
        kind === "assistant" &&
          "self-start rounded-bl-sm bg-muted text-foreground",
        kind === "system" &&
          "self-center bg-transparent text-center text-xs text-muted-foreground"
      )}
    >
      {renderWithLinks(text)}
    </div>
  );
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [stream, setStream] = useState<string | null>(null);
  // `typing` is the plain three dots, used for one thing only: the initial
  // history load. Everything mid-turn goes through the activity row.
  const [typing, setTyping] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [sending, setSending] = useState(false);
  const [greeted, setGreeted] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [tooltip, setTooltip] = useState<"hidden" | "shown" | "fading">(
    "hidden"
  );

  const socketRef = useRef<PartySocket | null>(null);
  // Mirrors for the socket handlers, which outlive any single render.
  const historyLoadedRef = useRef(false);
  const streamRef = useRef<string | null>(null);
  const greetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const commitStream = () => {
    const text = streamRef.current;
    streamRef.current = null;
    setStream(null);
    if (text) setBubbles(b => [...b, {kind: "assistant", text}]);
  };

  const handleServerMessage = (msg: ServerMessage) => {
    switch (msg.type) {
      case "history":
        historyLoadedRef.current = true;
        if (greetTimerRef.current) {
          clearTimeout(greetTimerRef.current);
          greetTimerRef.current = null;
        }
        setTyping(false);
        setWaiting(false);
        setActivity(null);
        streamRef.current = null;
        setStream(null);
        // One state swap = one paint, same as the old replaceChildren fix.
        // The server seeds the greeting as the room's first message, so it
        // arrives inside history — the local `greeted` bubble is only the
        // offline fallback and must clear once real history lands.
        setBubbles(msg.messages.map(m => ({kind: m.role, text: m.content})));
        setGreeted(false);
        break;
      case "visitor":
        // Another tab of this room sent a message — mirror it here.
        setBubbles(b => [...b, {kind: "user", text: msg.text}]);
        break;
      case "delta": {
        // Left-trim the first chunk — Qwen's no-think mode leads with blank
        // lines; keep showing the typing dots until real text arrives.
        const text =
          streamRef.current === null ? msg.text.replace(/^\s+/, "") : msg.text;
        if (streamRef.current === null && text === "") break;
        setTyping(false);
        // Real text is arriving — the row has nothing left to explain.
        setWaiting(false);
        setActivity(null);
        streamRef.current = (streamRef.current ?? "") + text;
        setStream(streamRef.current);
        break;
      }
      case "tool":
        // A tool round can start after some text has already streamed, so the
        // row comes back rather than only ever showing before the first token.
        setActivity({name: msg.name, detail: msg.detail});
        setWaiting(true);
        break;
      case "done":
        setTyping(false);
        setWaiting(false);
        setActivity(null);
        commitStream();
        setSending(false);
        break;
      case "limit":
      case "error":
        setTyping(false);
        setWaiting(false);
        setActivity(null);
        commitStream();
        setSending(false);
        setBubbles(b => [...b, {kind: "system", text: msg.message}]);
        break;
    }
  };

  const connect = (): PartySocket => {
    if (socketRef.current) return socketRef.current;
    const socket = new PartySocket({
      host: import.meta.env.PUBLIC_CHAT_HOST || window.location.host,
      party: "chat-room",
      room: roomId()
    });
    socket.addEventListener("message", event => {
      try {
        handleServerMessage(JSON.parse(event.data as string) as ServerMessage);
      } catch {
        /* ignore malformed frames */
      }
    });
    socket.addEventListener("close", () => {
      setTyping(false);
      setWaiting(false);
      setActivity(null);
      setSending(false);
    });
    socketRef.current = socket;
    return socket;
  };

  // Until the first history frame arrives the panel shows the typing dots as
  // a loading state; if nothing lands in 4s (offline / worker down), settle
  // into the greeting instead of dots forever (sends still buffer).
  const beginLoading = () => {
    if (historyLoadedRef.current) return;
    setTyping(true);
    greetTimerRef.current ??= setTimeout(() => {
      greetTimerRef.current = null;
      if (!historyLoadedRef.current) {
        setTyping(false);
        setGreeted(true);
      }
    }, 4000);
  };

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    setTooltip("hidden");
    if (next) {
      connect();
      beginLoading();
    }
  };

  const sendText = (raw: string) => {
    const text = raw.trim();
    if (!text || sending) return;
    // PartySocket buffers sends while CONNECTING/reconnecting and flushes on
    // open — don't gate on readyState or messages get silently dropped.
    const ws = connect();
    setBubbles(b => [...b, {kind: "user", text}]);
    setWaiting(true);
    setActivity(null);
    setSending(true);
    setConfirmRestart(false);
    // Include the page the visitor is on — the room feeds it to the model as
    // ephemeral context so "this post"/"this page" resolve correctly.
    ws.send(
      JSON.stringify({type: "chat", text, page: window.location.pathname})
    );
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const el = inputRef.current;
    if (!el) return;
    sendText(el.value);
    el.value = "";
  };

  const restart = () => {
    socketRef.current?.close();
    socketRef.current = null;
    localStorage.setItem(ROOM_KEY, nanoid());
    historyLoadedRef.current = false;
    streamRef.current = null;
    setBubbles([]);
    setStream(null);
    setTyping(false);
    setWaiting(false);
    setActivity(null);
    setSending(false);
    setGreeted(false);
    setConfirmRestart(false);
    connect();
    beginLoading();
  };

  const transcript = bubbles.filter(b => b.kind !== "system");

  const download = () => {
    const lines = transcript.map(
      b => `${b.kind === "user" ? "You" : "Jarvis"}: ${b.text}`
    );
    if (greeted) lines.unshift(`Jarvis: ${GREETING}`);
    const date = new Date().toISOString().slice(0, 10);
    const body = `Chat with Jarvis — murugappan.dev\n${date}\n\n${lines.join("\n\n")}\n`;
    const url = URL.createObjectURL(new Blob([body], {type: "text/plain"}));
    const a = document.createElement("a");
    a.href = url;
    a.download = `jarvis-chat-${date}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // One-time quiet tooltip.
  useEffect(() => {
    if (localStorage.getItem(TOOLTIP_KEY)) return;
    localStorage.setItem(TOOLTIP_KEY, "1");
    // Deliberately setState-in-effect: this island is client:idle, so it is
    // server-rendered and then hydrated, and localStorage is unreadable in
    // both of those passes. Seeding "shown" from a lazy initializer instead
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

  // Keep the newest message in view — except on a fresh conversation, where
  // the greeting (top) must stay visible even if the starter chips overflow
  // a keyboard-shrunken mobile viewport.
  useEffect(() => {
    const v = viewportRef.current;
    if (!v) return;
    const fresh = stream === null && bubbles.every(b => b.kind !== "user");
    v.scrollTop = fresh ? 0 : v.scrollHeight;
  }, [bubbles, stream, typing, waiting, activity, greeted, open]);

  // Body scroll lock while the panel is full-screen (mobile).
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () =>
      document.documentElement.classList.toggle(
        "chat-panel-locked",
        mq.matches
      );
    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      document.documentElement.classList.remove("chat-panel-locked");
    };
  }, [open]);

  // Autofocus only on desktop: on phones it pops the keyboard the instant
  // the panel opens, halving the viewport and hiding the greeting.
  useEffect(() => {
    if (open && window.matchMedia("(min-width: 640px)").matches) {
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(
    () => () => {
      socketRef.current?.close();
      if (greetTimerRef.current) clearTimeout(greetTimerRef.current);
    },
    []
  );

  // Starters show until the visitor has said anything — the greeting seeded
  // by the server (or the offline fallback) doesn't count as conversation.
  const showStarters =
    (greeted || bubbles.length > 0) &&
    bubbles.every(b => b.kind !== "user") &&
    stream === null &&
    !typing &&
    !sending;

  const headerBtn =
    "size-8 rounded-lg text-primary-foreground hover:bg-white/15 hover:text-primary-foreground [&_svg:not([class*='size-'])]:size-[18px]";

  return (
    <>
      <Button
        className="fixed right-[30px] bottom-5 z-[1000] size-14 rounded-full shadow-lg [&_svg:not([class*='size-'])]:size-6"
        aria-label="Chat with Jarvis, Murugappan's AI assistant"
        aria-expanded={open}
        onClick={toggleOpen}
      >
        {open ? <X /> : <MessageCircle />}
      </Button>

      {tooltip !== "hidden" && (
        <div
          className={cn(
            "fixed right-24 bottom-8 z-[1000] rounded-[10px] border bg-background px-3 py-2 text-sm text-foreground shadow-lg transition-opacity duration-[600ms]",
            tooltip === "fading" && "opacity-0"
          )}
        >
          Ask Jarvis anything about Murugappan
        </div>
      )}

      {open && (
        <Card
          role="dialog"
          aria-label="Chat with Jarvis, Murugappan's AI assistant"
          className="fixed right-[30px] bottom-[90px] z-[1001] h-[520px] max-h-[calc(100vh-120px)] w-[370px] max-w-[calc(100vw-24px)] overflow-hidden rounded-[14px] shadow-2xl max-sm:top-0 max-sm:right-0 max-sm:bottom-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-auto max-sm:max-w-none max-sm:rounded-none max-sm:border-0"
        >
          <CardHeader className="flex-row items-center gap-1 bg-primary py-3 text-primary-foreground">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold">Chat with Jarvis</h2>
              <p className="text-xs opacity-90">
                Murugappan's AI assistant — answers from this site
              </p>
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
                <DropdownMenuItem
                  disabled={transcript.length === 0 && !greeted}
                  onSelect={download}
                >
                  <Download /> Download transcript
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              className={headerBtn}
              aria-label="Close chat"
              onClick={toggleOpen}
            >
              <X />
            </Button>
          </CardHeader>

          {confirmRestart && (
            <div className="flex items-center justify-between gap-2 border-b bg-muted/50 px-3 py-2">
              <span className="text-xs text-muted-foreground">
                Start a new conversation?
              </span>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={restart}
                >
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
            <div className="flex flex-col gap-2 p-3" aria-live="polite">
              {greeted && <BubbleView kind="assistant" text={GREETING} />}
              {bubbles.map((b, i) => (
                <BubbleView key={i} kind={b.kind} text={b.text} />
              ))}
              {stream !== null && <BubbleView kind="assistant" text={stream} />}
              {typing && (
                <div className="flex items-center gap-1 self-start rounded-xl rounded-bl-sm bg-muted p-3">
                  <span className="chat-dot" />
                  <span className="chat-dot" />
                  <span className="chat-dot" />
                </div>
              )}
              {waiting && <ActivityRow activity={activity} />}
              {showStarters && (
                <div className="mt-1 flex flex-col items-start gap-2">
                  {STARTERS.map(q => (
                    <Button
                      key={q}
                      variant="outline"
                      size="sm"
                      className="h-auto rounded-full border-primary/40 px-3 py-1.5 text-left text-[13px] font-normal whitespace-normal text-foreground hover:border-primary"
                      onClick={() => sendText(q)}
                    >
                      {q}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>

          <CardFooter className="border-t p-2.5">
            <form className="flex w-full gap-2" onSubmit={onSubmit}>
              <Input
                ref={inputRef}
                id="chat-input"
                name="message"
                maxLength={MAX_LENGTH}
                placeholder="Ask a question…"
                aria-label="Your message"
                autoComplete="off"
                className="bg-secondary"
              />
              <Button
                type="submit"
                size="icon"
                aria-label="Send"
                disabled={sending}
              >
                <Send />
              </Button>
            </form>
          </CardFooter>
        </Card>
      )}
    </>
  );
}
