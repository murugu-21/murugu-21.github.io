import type { UIMessageChunk } from "ai";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";
import { z } from "zod";

import { ChatWidget } from "./ChatWidget.tsx";

const Frame = z.object({
  type: z.string(),
  id: z.string().optional(),
  probeId: z.string().optional(),
  init: z.object({ body: z.string() }).optional()
});

type ServerFrame =
  | { type: "cf_agent_stream_resume_none"; probeId?: string; reason: "idle" }
  | { type: "cf_agent_use_chat_response"; id: string; body: string; done?: true; error?: true }
  | { type: "cf_agent_stream_resuming"; id: string };

class FakeRoom {
  readonly requests: unknown[] = [];
  readonly sockets = new Set<FakeSocket>();
  private turn = "";

  constructor(readonly name: string) {}

  receive(raw: string) {
    const frame = Frame.parse(JSON.parse(raw));
    if (frame.type === "cf_agent_stream_resume_request")
      this.push({ type: "cf_agent_stream_resume_none", probeId: frame.probeId, reason: "idle" });
    if (frame.type === "cf_agent_use_chat_request" && frame.id && frame.init) {
      this.turn = frame.id;
      this.requests.push(JSON.parse(frame.init.body));
    }
  }

  stream(chunks: UIMessageChunk[], turn = this.turn) {
    for (const chunk of chunks)
      this.push({ type: "cf_agent_use_chat_response", id: turn, body: JSON.stringify(chunk) });
  }

  finish(turn = this.turn) {
    this.push({ type: "cf_agent_use_chat_response", id: turn, body: "", done: true });
  }

  fail() {
    this.push({ type: "cf_agent_use_chat_response", id: this.turn, body: "boom", error: true });
  }

  resumeElsewhere(turn: string) {
    this.push({ type: "cf_agent_stream_resuming", id: turn });
  }

  dropSockets() {
    for (const socket of this.sockets) socket.drop();
  }

  private push(frame: ServerFrame) {
    for (const socket of this.sockets) socket.deliver(JSON.stringify(frame));
  }
}

const rooms = new Map<string, FakeRoom>();
const connections: URL[] = [];
let refusals = 0;

class FakeSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  readyState = FakeSocket.CONNECTING;
  binaryType: BinaryType = "blob";
  private readonly room: FakeRoom;

  constructor(url: string | URL) {
    super();
    connections.push(new URL(url));
    const name = /^\/agents\/chat-room\/([^/]+)$/.exec(new URL(url).pathname)?.[1];
    if (!name) throw new Error(`the widget connected to ${String(url)}, not a chat room`);
    this.room = rooms.get(name) ?? new FakeRoom(name);
    rooms.set(name, this.room);
    // PartySocket attaches its listeners right after constructing the socket.
    queueMicrotask(() => {
      if (this.readyState !== FakeSocket.CONNECTING) return;
      if (refusals > 0) {
        refusals -= 1;
        this.refuse();
        return;
      }
      this.readyState = FakeSocket.OPEN;
      this.room.sockets.add(this);
      this.dispatchEvent(new Event("open"));
    });
  }

  send(data: string) {
    this.room.receive(data);
  }

  close() {
    this.readyState = FakeSocket.CLOSED;
    this.room.sockets.delete(this);
  }

  deliver(data: string) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }

  drop() {
    this.close();
    this.dispatchEvent(new CloseEvent("close", { code: 1006 }));
  }

  // A browser reports a refused upgrade as an error, then a 1006 close.
  private refuse() {
    this.readyState = FakeSocket.CLOSED;
    this.dispatchEvent(new Event("error"));
    this.dispatchEvent(new CloseEvent("close", { code: 1006 }));
  }
}

const LAUNCHER = "Chat with Jarvis, Murugappan's AI assistant";
const histories = new Map<string, () => Promise<Response>>();
const fetched: string[] = [];
const events: string[] = [];

const prose = (text: string): UIMessageChunk[] => [
  { type: "text-start", id: "t" },
  { type: "text-delta", id: "t", delta: text },
  { type: "text-end", id: "t" }
];

const reply = (text: string): UIMessageChunk[] => [
  { type: "start", messageId: "reply" },
  ...prose(text)
];

const lastRoom = () => {
  const room = [...rooms.values()].at(-1);
  if (!room) throw new Error("the widget never connected");
  return room;
};

const input = () => page.getByRole("textbox", { name: "Your message" });
const sendButton = () => page.getByRole("button", { name: "Send" });

function holdHistory() {
  localStorage.setItem("chatRoomId", "slow");
  const { promise, resolve } = Promise.withResolvers<void>();
  histories.set("slow", () => promise.then(() => Response.json([])));
  return () => resolve();
}

async function openChat() {
  await page.getByRole("button", { name: LAUNCHER }).click();
  await expect.element(sendButton()).toBeEnabled();
}

beforeEach(() => {
  vi.stubGlobal("WebSocket", FakeSocket);
  localStorage.clear();
  rooms.clear();
  connections.length = 0;
  refusals = 0;
  histories.clear();
  fetched.length = 0;
  events.length = 0;
  globalThis.posthog = {
    capture: (event: string) => events.push(event),
    captureException: () => events.push("exception"),
    register: () => {}
  };
  vi.spyOn(window, "fetch").mockImplementation(async request => {
    const url = request instanceof Request ? request.url : String(request);
    fetched.push(url);
    const room = /\/agents\/chat-room\/([^/]+)\/get-messages$/.exec(url)?.[1] ?? "";
    return (await histories.get(room)?.()) ?? Response.json([]);
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await page.viewport(414, 896);
  vi.useRealTimers();
  globalThis.posthog = undefined;
});

it("sends a question with Enter and streams the reply after the tool step", async () => {
  await render(<ChatWidget />);
  await openChat();

  await userEvent.type(input(), "  Where does he work?  {Enter}");

  const room = lastRoom();
  await expect.poll(() => room.requests).toHaveLength(1);
  expect(room.requests[0]).toMatchObject({
    trigger: "submit-message",
    page: "/",
    messages: [{ role: "user", parts: [{ type: "text", text: "Where does he work?" }] }]
  });
  await expect.element(input()).toHaveValue("");
  await expect.element(sendButton()).toBeDisabled();
  await expect.element(page.getByText("Jarvis is typing")).toBeInTheDocument();

  await userEvent.type(input(), "And before that?{Enter}");
  await expect.element(input()).toHaveValue("And before that?");

  room.stream([
    { type: "start", messageId: "a1" },
    { type: "data-activity", data: { name: "fetch_page", detail: "/experience/" } }
  ]);
  await expect.element(page.getByText("Reading experience…")).toBeVisible();

  room.stream(prose("At MedMe Health."));
  await expect.element(page.getByText("At MedMe Health.")).toBeVisible();
  await expect.element(page.getByText("Jarvis is typing")).not.toBeInTheDocument();
  await expect.element(sendButton()).toBeDisabled();
  room.finish();

  await expect.element(sendButton()).toBeEnabled();
  expect(room.requests).toHaveLength(1);
  expect(events).toEqual(["chat_open", "chat_message_sent"]);
});

it("sends a multi-line message with the button", async () => {
  await render(<ChatWidget />);
  await openChat();

  await userEvent.type(input(), "one{Shift>}{Enter}{/Shift}two");
  await sendButton().click();

  await expect.poll(() => lastRoom().requests).toHaveLength(1);
  expect(lastRoom().requests[0]).toMatchObject({
    messages: [{ parts: [{ type: "text", text: "one\ntwo" }] }]
  });
  await expect.element(input()).toHaveValue("");
});

it("keeps one room per page load, and can start over, when the browser blocks storage", async () => {
  // Chrome's "block all cookies" makes the localStorage getter itself throw.
  vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  });
  await render(<ChatWidget />);
  await expect.element(page.getByText("Ask Jarvis anything about Murugappan")).toBeVisible();
  await openChat();

  await userEvent.type(input(), "Hi{Enter}");
  await expect.poll(() => lastRoom().requests).toHaveLength(1);
  lastRoom().stream(reply("Hello."));
  lastRoom().finish();
  await expect.element(page.getByText("Hello.")).toBeVisible();

  await page.getByRole("button", { name: "Close chat" }).click();
  await openChat();
  await expect.element(page.getByText("Hello.")).toBeVisible();
  expect(rooms.size).toBe(1);

  await page.getByRole("button", { name: "Conversation options" }).click();
  await page.getByRole("menuitem", { name: "Start over" }).click();
  await page.getByRole("button", { name: "Start over" }).click();
  await expect.element(page.getByText("Hello.")).not.toBeInTheDocument();
  await expect.poll(() => rooms.size).toBe(2);
});

it("a starter question sends itself and the starters give way to the conversation", async () => {
  await render(<ChatWidget />);
  await openChat();

  await page.getByRole("button", { name: "How has he used LLMs in production?" }).click();

  await expect.poll(() => lastRoom().requests).toHaveLength(1);
  expect(lastRoom().requests[0]).toMatchObject({
    messages: [{ parts: [{ type: "text", text: "How has he used LLMs in production?" }] }]
  });
  lastRoom().stream(reply("He built Jarvis."));
  lastRoom().finish();
  await expect.element(page.getByText("He built Jarvis.")).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "What's the most impactful thing he's shipped?" }))
    .not.toBeInTheDocument();
  expect(events).toEqual(["chat_open", "chat_starter_click", "chat_message_sent"]);
});

function transcriptScroll(): "fits" | "top" | "bottom" | "between" {
  const viewport = document.querySelector('[data-slot="scroll-area-viewport"]');
  if (!(viewport instanceof HTMLElement)) throw new Error("the transcript isn't open");
  const { scrollTop, scrollHeight, clientHeight } = viewport;
  if (scrollHeight <= clientHeight) return "fits";
  if (scrollTop === 0) return "top";
  return scrollTop + clientHeight >= scrollHeight - 1 ? "bottom" : "between";
}

it("follows the loading dots, keeps the greeting in view above the starters, then follows the reply to its end", async () => {
  const short = document.createElement("style");
  short.textContent = '[data-slot="scroll-area-viewport"] { height: 30px; }';
  document.head.append(short);
  const release = holdHistory();

  try {
    await render(<ChatWidget />);
    await page.getByRole("button", { name: LAUNCHER }).click();
    await expect.element(page.getByRole("dialog")).toBeVisible();
    await expect.poll(transcriptScroll).toBe("bottom");

    release();
    await expect.element(sendButton()).toBeEnabled();
    await expect.poll(transcriptScroll).toBe("top");

    await userEvent.type(input(), "Tell me everything{Enter}");
    await expect.poll(() => lastRoom().requests).toHaveLength(1);
    const lines = Array.from({ length: 30 }, (_, i) => `Line ${i + 1}.`);
    lastRoom().stream(reply(lines.join("\n")));
    await expect.element(page.getByText(/Line 30\./)).toBeInTheDocument();
    await expect.poll(transcriptScroll).toBe("bottom");
    lastRoom().finish();
    await expect.element(sendButton()).toBeEnabled();
    expect(transcriptScroll()).toBe("bottom");
  } finally {
    short.remove();
  }
});

it("resumes a returning visitor's room with its links and notices", async () => {
  localStorage.setItem("chatRoomId", "returning");
  histories.set("returning", async () =>
    Response.json([
      { id: "u1", role: "user", parts: [{ type: "text", text: "Any links?" }] },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "See [his blog](https://murugappan.dev/blog/) or https://github.com/murugu-21."
          }
        ]
      },
      {
        id: "a2",
        role: "assistant",
        parts: [{ type: "data-notice", data: { kind: "limit", text: "Out of budget for now." } }]
      }
    ])
  );

  await render(<ChatWidget host="chat.example.com" />);
  await openChat();

  expect(fetched).toEqual(["https://chat.example.com/agents/chat-room/returning/get-messages"]);
  await expect.element(page.getByText("Any links?")).toBeVisible();
  await expect.element(page.getByText("Out of budget for now.")).toBeVisible();
  await expect
    .element(page.getByRole("link", { name: "https://murugappan.dev/blog/" }))
    .toHaveAttribute("href", "https://murugappan.dev/blog/");
  await expect
    .element(page.getByRole("link", { name: "https://github.com/murugu-21" }))
    .toHaveAttribute("href", "https://github.com/murugu-21");
  await expect
    .element(
      page.getByText("See his blog: https://murugappan.dev/blog/ or https://github.com/murugu-21.")
    )
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "How has he used LLMs in production?" }))
    .not.toBeInTheDocument();
});

const stale = { id: "u1", role: "user", parts: [{ type: "text", text: "Stale question" }] };

it.each([
  ["a server error", async () => Response.json([stale], { status: 500 })],
  [
    "a malformed part",
    async () =>
      Response.json([
        stale,
        { id: "a", role: "assistant", parts: [{ type: "data-notice", data: {} }] }
      ])
  ],
  ["a network failure", async () => Promise.reject(new TypeError("offline"))]
])("starts a fresh conversation when the history load hits %s", async (_label, load) => {
  localStorage.setItem("chatRoomId", "broken");
  histories.set("broken", load);

  await render(<ChatWidget />);
  await openChat();

  await expect
    .element(page.getByRole("button", { name: "How has he used LLMs in production?" }))
    .toBeVisible();
  await expect.element(page.getByText("Stale question")).not.toBeInTheDocument();
});

it("holds the composer and the starters until the room's history arrives", async () => {
  const release = holdHistory();
  const starter = page.getByRole("button", { name: "How has he used LLMs in production?" });

  await render(<ChatWidget />);
  await page.getByRole("button", { name: LAUNCHER }).click();
  await expect.element(page.getByRole("dialog")).toBeVisible();
  await expect.poll(() => fetched).toHaveLength(1);
  await expect.element(sendButton()).toBeDisabled();
  expect(starter.query()).toBeNull();

  release();
  await expect.element(starter).toBeVisible();
  await expect.element(sendButton()).toBeEnabled();
});

it.each([
  ["unset", undefined],
  ["empty", ""]
])("connects to the page's own origin when PUBLIC_CHAT_HOST is %s", async (_label, host) => {
  localStorage.setItem("chatRoomId", "here");

  await render(<ChatWidget host={host} />);
  await openChat();

  expect(fetched).toEqual([`http://${location.host}/agents/chat-room/here/get-messages`]);
});

it("ignores a blank message and the Enter that commits an IME candidate", async () => {
  await render(<ChatWidget />);
  await openChat();

  await userEvent.type(input(), "   {Enter}");
  await userEvent.fill(input(), "こんにちは");
  input()
    .element()
    .dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true })
    );
  await expect.element(input()).toHaveValue("こんにちは");

  await userEvent.keyboard("{Enter}");
  await expect.poll(() => lastRoom().requests).toHaveLength(1);
  expect(lastRoom().requests[0]).toMatchObject({
    messages: [{ parts: [{ type: "text", text: "こんにちは" }] }]
  });
});

it.each([
  { kind: "limit", text: "I've hit my chat budget for now.", event: "chat_limit" },
  { kind: "error", text: "Something went wrong on my end.", event: "chat_error" }
])("shows and counts the room's $kind notice", async ({ kind, text, event }) => {
  await render(<ChatWidget />);
  await openChat();
  await userEvent.type(input(), "Hi{Enter}");
  await expect.poll(() => lastRoom().requests).toHaveLength(1);

  lastRoom().stream([
    { type: "start", messageId: "a1" },
    { type: "data-notice", data: { kind, text } }
  ]);
  lastRoom().finish();

  await expect.element(page.getByText(text)).toBeVisible();
  await expect.element(sendButton()).toBeEnabled();
  expect(events).toEqual(["chat_open", "chat_message_sent", event]);
});

it("says something went wrong when the turn fails, and lets the visitor retry", async () => {
  await render(<ChatWidget />);
  await openChat();
  await userEvent.type(input(), "Hi{Enter}");
  await expect.poll(() => lastRoom().requests).toHaveLength(1);

  lastRoom().fail();

  await expect
    .element(page.getByText("Something went wrong on my end. Please try again."))
    .toBeVisible();
  await expect.element(sendButton()).toBeEnabled();
  expect(events).toEqual(["chat_open", "chat_message_sent", "chat_error", "exception"]);

  await userEvent.type(input(), "Hi again{Enter}");
  await expect.poll(() => lastRoom().requests).toHaveLength(2);
});

it("waits while another tab's turn streams into the same room", async () => {
  await render(<ChatWidget />);
  await openChat();
  const starter = page.getByRole("button", { name: "How has he used LLMs in production?" });
  await expect.element(starter).toBeVisible();

  lastRoom().resumeElsewhere("other-tab");
  await expect.element(sendButton()).toBeDisabled();
  await expect.element(starter).not.toBeInTheDocument();

  lastRoom().stream(reply("Answer for the other tab."), "other-tab");
  lastRoom().finish("other-tab");
  await expect.element(page.getByText("Answer for the other tab.")).toBeVisible();
  await expect.element(sendButton()).toBeEnabled();
});

it("closing by button, launcher or Escape keeps the conversation, and focus returns to the launcher", async () => {
  await page.viewport(1024, 768);
  await render(<ChatWidget />);
  const launcher = page.getByRole("button", { name: LAUNCHER });
  await openChat();
  await expect.element(launcher).toHaveAttribute("aria-expanded", "true");
  await userEvent.type(input(), "Remember me{Enter}");
  await expect.poll(() => lastRoom().requests).toHaveLength(1);

  await page.getByRole("button", { name: "Close chat" }).click();
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  await expect.element(launcher).toHaveAttribute("aria-expanded", "false");

  await launcher.click();
  await expect.element(page.getByText("Remember me")).toBeVisible();
  await launcher.click();
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();

  await launcher.click();
  await expect.element(page.getByText("Remember me")).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  await expect.element(launcher).toHaveFocus();
  expect(fetched).toHaveLength(1);
});

it("starting over moves to a new room once confirmed", async () => {
  localStorage.setItem("chatRoomId", "old");
  histories.set("old", async () =>
    Response.json([{ id: "u1", role: "user", parts: [{ type: "text", text: "Old question" }] }])
  );
  await render(<ChatWidget />);
  await openChat();
  await expect.element(page.getByText("Old question")).toBeVisible();

  const restart = async () => {
    await page.getByRole("button", { name: "Conversation options" }).click();
    await page.getByRole("menuitem", { name: "Start over" }).click();
  };
  await restart();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect.element(page.getByText("Start a new conversation?")).not.toBeInTheDocument();
  await expect.element(page.getByText("Old question")).toBeVisible();

  await restart();
  await userEvent.type(input(), "One more thing{Enter}");
  await expect.element(page.getByText("Start a new conversation?")).not.toBeInTheDocument();
  await expect.poll(() => lastRoom().requests).toHaveLength(1);

  await restart();
  await page.getByRole("button", { name: "Start over" }).click();

  await expect.element(page.getByText("Old question")).not.toBeInTheDocument();
  await expect.element(sendButton()).toBeEnabled();
  await expect.poll(() => rooms.size).toBe(2);
  expect(localStorage.getItem("chatRoomId")).toBe(lastRoom().name);
  expect(events).toEqual(["chat_open", "chat_message_sent", "chat_restart"]);
});

it("downloads the transcript without the room's notices", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
  localStorage.setItem("chatRoomId", "saved");
  histories.set("saved", async () =>
    Response.json([
      { id: "u1", role: "user", parts: [{ type: "text", text: "Where?" }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "Toronto." }] },
      {
        id: "a2",
        role: "assistant",
        parts: [{ type: "data-notice", data: { kind: "error", text: "A notice." } }]
      }
    ])
  );
  const blobs: Blob[] = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation(blob => {
    if (blob instanceof Blob) blobs.push(blob);
    return "blob:transcript";
  });
  const saved: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    saved.push(this.download);
  });

  await render(<ChatWidget />);
  await openChat();
  await expect.element(page.getByText("Toronto.")).toBeVisible();
  await page.getByRole("button", { name: "Conversation options" }).click();
  await page.getByRole("menuitem", { name: "Download transcript" }).click();

  expect(saved).toEqual(["jarvis-chat-2026-10-07.txt"]);
  expect(events).toEqual(["chat_open", "chat_transcript_download"]);
  const body = await blobs[0]?.text();
  expect(body).toMatch(
    /^Chat with Jarvis on murugappan\.dev\n2026-10-07\n\nJarvis: Hi, I'm Jarvis/
  );
  expect(body).toMatch(/\n\nYou: Where\?\n\nJarvis: Toronto\.\n$/);
});

const pageOverflow = () => getComputedStyle(document.body).overflow;

it("on a phone the open panel locks page scroll and leaves the keyboard down", async () => {
  await render(<ChatWidget />);
  await openChat();

  expect(pageOverflow()).toBe("hidden");
  await expect.element(input()).not.toHaveFocus();

  await page.getByRole("button", { name: "Close chat" }).click();
  await expect.poll(pageOverflow).toBe("visible");
  await expect.element(page.getByRole("button", { name: LAUNCHER })).toHaveFocus();
});

it("keeps an unsent draft when the screen crosses the phone breakpoint while open", async () => {
  await render(<ChatWidget />);
  await openChat();
  await userEvent.type(input(), "half a thought");

  await page.viewport(1024, 768);
  await expect.element(input()).toHaveValue("half a thought");
  await page.viewport(414, 896);
  await expect.element(input()).toHaveValue("half a thought");
});

it("on a desktop the open panel focuses the composer and leaves the page scrollable", async () => {
  await page.viewport(1024, 768);
  await render(<ChatWidget />);
  await openChat();

  await expect.element(input()).toHaveFocus();
  expect(pageOverflow()).toBe("visible");
});

it("opens on hydration when the visitor tapped the launcher while the bundle loaded", async () => {
  const island = document.createElement("astro-island");
  island.dataset.openOnHydrate = "true";
  document.body.append(island);

  try {
    await render(<ChatWidget />, { container: island });

    await expect.element(page.getByRole("dialog")).toBeVisible();
    expect(island.dataset.openOnHydrate).toBeUndefined();
    expect(events).toEqual(["chat_open"]);
  } finally {
    island.remove();
  }
});

it("introduces the launcher once, then fades the hint away", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const hint = page.getByText("Ask Jarvis anything about Murugappan");
  const first = await render(<ChatWidget />);
  await expect.element(hint).toBeVisible();
  await expect.element(hint).not.toHaveClass("opacity-0");

  await vi.advanceTimersByTimeAsync(5000);
  await expect.element(hint).toHaveClass("opacity-0");
  await vi.advanceTimersByTimeAsync(700);
  await expect.element(hint).not.toBeInTheDocument();

  await first.unmount();
  await render(<ChatWidget />);
  await new Promise(requestAnimationFrame);
  await new Promise(requestAnimationFrame);
  expect(page.getByRole("button", { name: LAUNCHER }).query()).not.toBeNull();
  expect(hint.query()).toBeNull();
});

function stubSolvingTurnstile(solveMs: number) {
  let issued = 0;
  vi.stubGlobal("turnstile", {
    render: (_: HTMLElement, options: { callback: (token: string) => void }) => {
      issued += 1;
      const token = `token-${issued}`;
      setTimeout(() => options.callback(token), solveMs);
      return token;
    },
    remove: () => {}
  });
}

const tokens = () => connections.map(url => url.searchParams.get("cf-turnstile-response"));

function stubManualTurnstile() {
  const pendingSolves: (() => void)[] = [];
  vi.stubGlobal("turnstile", {
    render: (_: HTMLElement, options: { sitekey: string; callback: (token: string) => void }) => {
      const token = `${options.sitekey}-token-${pendingSolves.length + 1}`;
      pendingSolves.push(() => options.callback(token));
      return `widget-${pendingSolves.length}`;
    },
    remove: () => {}
  });
  return pendingSolves;
}

async function openWithTurnstile(pendingSolves: (() => void)[]) {
  await page.getByRole("button", { name: LAUNCHER }).click();
  await expect.poll(() => pendingSolves).toHaveLength(1);
  pendingSolves[0]?.();
}

it("reconnects with a fresh Turnstile token while the conversation and the composer stay put", async () => {
  await page.viewport(1024, 768);
  const pendingSolves = stubManualTurnstile();
  await render(<ChatWidget turnstileSiteKey="site-key" />);
  await openWithTurnstile(pendingSolves);
  await expect.element(sendButton()).toBeEnabled();
  expect(tokens()).toEqual(["site-key-token-1"]);

  await userEvent.type(input(), "Hi{Enter}");
  await expect.poll(() => lastRoom().requests).toHaveLength(1);
  lastRoom().stream(reply("Hello."));
  lastRoom().finish();
  await expect.element(page.getByText("Hello.")).toBeVisible();
  await userEvent.type(input(), "Still there?");

  lastRoom().dropSockets();
  await expect.poll(() => pendingSolves).toHaveLength(2);
  await expect.element(page.getByText("Hello.")).toBeVisible();
  await expect.element(input()).toHaveFocus();
  await expect.element(sendButton()).toBeDisabled();
  await userEvent.keyboard("{Enter}");
  await expect.element(input()).toHaveValue("Still there?");

  pendingSolves[1]?.();
  await expect.poll(tokens).toEqual(["site-key-token-1", "site-key-token-2"]);
  await expect.element(sendButton()).toBeEnabled();
  await expect.element(page.getByText("Hello.")).toBeVisible();
  await expect.element(input()).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  await expect.poll(() => lastRoom().requests).toHaveLength(2);
  expect(lastRoom().requests[1]).toMatchObject({
    messages: [{}, {}, { role: "user", parts: [{ type: "text", text: "Still there?" }] }]
  });
});

it("keeps a fresh conversation's starters on screen, but not clickable, while it reconnects", async () => {
  const pendingSolves = stubManualTurnstile();
  const starter = page.getByRole("button", { name: "How has he used LLMs in production?" });
  await render(<ChatWidget turnstileSiteKey="site-key" />);
  await openWithTurnstile(pendingSolves);
  await expect.element(starter).toBeEnabled();

  lastRoom().dropSockets();
  await expect.poll(() => pendingSolves).toHaveLength(2);
  await expect.element(starter).toBeDisabled();

  pendingSolves[1]?.();
  await starter.click();
  await expect.poll(() => lastRoom().requests).toHaveLength(1);
});

it("loads Turnstile only once the visitor opens the chat", async () => {
  const appended: string[] = [];
  vi.spyOn(document.head, "append").mockImplementation((...nodes) => {
    for (const node of nodes) if (node instanceof HTMLScriptElement) appended.push(node.src);
  });
  await render(<ChatWidget turnstileSiteKey="site-key" />);
  expect(appended).toEqual([]);

  await page.getByRole("button", { name: LAUNCHER }).click();
  await expect
    .poll(() => appended)
    .toEqual(["https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"]);
});

it("keeps retrying a refused socket after each successful open", async () => {
  stubSolvingTurnstile(0);
  refusals = 4;
  await render(<ChatWidget turnstileSiteKey="site-key" />);
  await openChat();

  refusals = 3;
  lastRoom().dropSockets();
  await expect.element(sendButton()).toBeDisabled();
  await expect.element(sendButton()).toBeEnabled();
  expect(tokens()).toEqual(Array.from({ length: 9 }, (_, i) => `token-${i + 1}`));
  await expect.element(page.getByText("Something went wrong on my end.")).not.toBeInTheDocument();
});

it("retries each refusal with a fresh token while Turnstile is slow to solve", async () => {
  stubSolvingTurnstile(4000);
  refusals = 2;
  await render(<ChatWidget turnstileSiteKey="site-key" />);
  await page.getByRole("button", { name: LAUNCHER }).click();

  await expect.element(sendButton(), { timeout: 20_000 }).toBeEnabled();
  expect(tokens()).toEqual(["token-1", "token-2", "token-3"]);
});

it("gives up on a socket the Worker keeps refusing, says chat is unavailable and reports it once", async () => {
  refusals = Number.POSITIVE_INFINITY;
  vi.stubGlobal("turnstile", {
    render: (_: HTMLElement, options: { "error-callback": (code: string) => void }) => {
      options["error-callback"]("110200");
      return "widget";
    },
    remove: () => {}
  });
  const reported: string[] = [];
  globalThis.posthog = {
    capture: () => {},
    captureException: (err: Error) => reported.push(err.message),
    register: () => {}
  };
  await render(<ChatWidget turnstileSiteKey="site-key" />);
  await page.getByRole("button", { name: LAUNCHER }).click();

  await expect
    .element(page.getByText("Something went wrong on my end. Please try again."))
    .toBeVisible();
  await expect.element(sendButton()).toBeDisabled();
  expect(connections).toHaveLength(5);
  // Outlasts the 3 s first retry PartySocket would schedule if the connection hadn't stopped.
  await new Promise(resolve => setTimeout(resolve, 4000));
  expect(connections).toHaveLength(5);
  expect(reported).toEqual(["Turnstile failed with 110200"]);
});

type ChallengeOptions = {
  appearance: string;
  callback: (token: string) => void;
  "error-callback": (code: string) => void;
  "before-interactive-callback": () => void;
  "after-interactive-callback": () => void;
};

type CheckOutcome = (options: ChallengeOptions, token: string) => void;
const PASSES_WITHOUT_A_CLICK = "passes without a click";

const solves: CheckOutcome = (options, token) => {
  options["after-interactive-callback"]();
  options.callback(token);
};

function stubChallengingTurnstile(
  outcomes: (CheckOutcome | typeof PASSES_WITHOUT_A_CLICK)[] = [solves]
) {
  const appearances: string[] = [];
  const checkboxes = new Map<string, HTMLInputElement>();
  let rendered = 0;
  vi.stubGlobal("turnstile", {
    render: (container: HTMLElement, options: ChallengeOptions) => {
      appearances.push(options.appearance);
      const outcome = outcomes[rendered] ?? solves;
      rendered += 1;
      const token = `solved-${rendered}`;
      if (outcome === PASSES_WITHOUT_A_CLICK) {
        options.callback(token);
        return token;
      }
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.setAttribute("aria-label", "Verify you are human");
      checkbox.addEventListener("change", () => outcome(options, token));
      container.append(checkbox);
      checkboxes.set(token, checkbox);
      options["before-interactive-callback"]();
      return token;
    },
    remove: (widgetId: string) => checkboxes.get(widgetId)?.remove()
  });
  return appearances;
}

const panel = () => page.getByRole("dialog", { name: "Chat with Jarvis" });
const humanCheck = () => panel().getByRole("checkbox", { name: "Verify you are human" });
const checkStatus = () => panel().getByRole("status");

it("shows Turnstile's interactive check inside the phone's modal panel and waits for the visitor", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const appearances = stubChallengingTurnstile();
  await render(<ChatWidget turnstileSiteKey="site-key" />);
  await page.getByRole("button", { name: LAUNCHER }).click();

  await expect.element(checkStatus()).toHaveTextContent("Quick check before we chat");
  await expect.element(humanCheck()).toBeVisible();
  expect(appearances).toEqual(["interaction-only"]);
  await vi.advanceTimersByTimeAsync(60_000);
  await expect.element(humanCheck()).toBeVisible();
  await expect.element(sendButton()).toBeDisabled();

  await humanCheck().click();
  await expect.element(sendButton()).toBeEnabled();
  expect(tokens()).toEqual(["solved-1"]);
  await expect.element(checkStatus()).toHaveTextContent("");
  await expect.element(input()).not.toHaveFocus();
});

it("hands focus back to the composer only when a solved check on the desktop panel held it", async () => {
  await page.viewport(1024, 768);
  stubChallengingTurnstile([solves, PASSES_WITHOUT_A_CLICK]);
  await render(<ChatWidget turnstileSiteKey="site-key" />);
  await page.getByRole("button", { name: LAUNCHER }).click();

  await expect.element(humanCheck()).toBeVisible();
  humanCheck().element().focus();
  await expect.element(humanCheck()).toHaveFocus();
  await humanCheck().click();

  await expect.element(sendButton()).toBeEnabled();
  await expect.element(input()).toHaveFocus();

  const options = page.getByRole("button", { name: "Conversation options" });
  options.element().focus();
  lastRoom().dropSockets();
  await expect.poll(tokens).toEqual(["solved-1", "solved-2"]);
  await expect.element(sendButton()).toBeEnabled();
  await expect.element(options).toHaveFocus();
});

it("times out 15 s after a clicked check goes quiet, then asks again", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  stubChallengingTurnstile([options => options["after-interactive-callback"]()]);
  refusals = 1;
  await render(<ChatWidget turnstileSiteKey="site-key" />);
  await page.getByRole("button", { name: LAUNCHER }).click();
  await humanCheck().click();

  await vi.advanceTimersByTimeAsync(14_000);
  expect(connections).toEqual([]);
  await vi.advanceTimersByTimeAsync(1_000);
  await expect.poll(tokens).toEqual([null]);
  await humanCheck().click();
  await expect.element(sendButton()).toBeEnabled();
  expect(tokens()).toEqual([null, "solved-2"]);
});

it("clears the check line when the check fails and the retry passes unseen", async () => {
  stubChallengingTurnstile([
    options => options["error-callback"]("600010"),
    PASSES_WITHOUT_A_CLICK
  ]);
  refusals = 1;
  await render(<ChatWidget turnstileSiteKey="site-key" />);
  await page.getByRole("button", { name: LAUNCHER }).click();
  await expect.element(checkStatus()).toHaveTextContent("Quick check before we chat");
  await humanCheck().click();

  await expect.element(sendButton()).toBeEnabled();
  expect(tokens()).toEqual([null, "solved-2"]);
  await expect.element(checkStatus()).toHaveTextContent("");
});

it("asks for the check again when the visitor closes the panel mid-check and reopens it", async () => {
  stubChallengingTurnstile();
  await render(<ChatWidget turnstileSiteKey="site-key" />);
  await page.getByRole("button", { name: LAUNCHER }).click();
  await expect.element(humanCheck()).toBeVisible();

  await userEvent.keyboard("{Escape}");
  await expect.element(panel()).not.toBeInTheDocument();
  await page.getByRole("button", { name: LAUNCHER }).click();

  await humanCheck().click();
  await expect.element(sendButton()).toBeEnabled();
  expect(tokens()).toEqual(["solved-2"]);
});

it("waits for the panel to reopen before fetching a token for a socket that dropped while closed", async () => {
  const pendingSolves = stubManualTurnstile();
  await render(<ChatWidget turnstileSiteKey="site-key" />);
  await openWithTurnstile(pendingSolves);
  await expect.element(sendButton()).toBeEnabled();
  await userEvent.keyboard("{Escape}");
  await expect.element(panel()).not.toBeInTheDocument();

  lastRoom().dropSockets();
  await new Promise(resolve => setTimeout(resolve, 500));
  expect(pendingSolves).toHaveLength(1);

  await page.getByRole("button", { name: LAUNCHER }).click();
  await expect.poll(() => pendingSolves).toHaveLength(2);
  pendingSolves[1]?.();
  await expect.element(sendButton()).toBeEnabled();
  expect(tokens()).toEqual(["site-key-token-1", "site-key-token-2"]);
});

it("gives up on a Turnstile that never answers after 15 s and retries with a fresh token", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const pendingSolves = stubManualTurnstile();
  refusals = 1;
  await render(<ChatWidget turnstileSiteKey="site-key" />);
  await page.getByRole("button", { name: LAUNCHER }).click();

  await vi.advanceTimersByTimeAsync(14_999);
  await expect.element(sendButton()).toBeDisabled();
  expect(pendingSolves).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  await expect.poll(() => pendingSolves).toHaveLength(2);
  pendingSolves[1]?.();
  await expect.poll(tokens).toEqual([null, "site-key-token-2"]);
  await expect.element(sendButton()).toBeEnabled();
});
