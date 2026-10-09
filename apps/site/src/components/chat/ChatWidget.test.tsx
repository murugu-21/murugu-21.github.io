import type { UIMessageChunk } from "ai";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { z } from "zod";

import { ChatWidget } from "./ChatWidget.tsx";

const Frame = z.object({
  type: z.string(),
  id: z.string().optional(),
  probeId: z.string().optional(),
  init: z.object({ body: z.string() }).optional()
});

// The Worker's ChatRoom as the widget's socket sees it: resume probes find no
// stream, and each chat request is recorded so the test can stream the reply.
class FakeRoom extends EventTarget {
  readonly agent = "chat-room";
  readonly requests: unknown[] = [];
  private turn = "";

  constructor(
    readonly name: string,
    readonly host: string
  ) {
    super();
  }

  getHttpUrl() {
    return `http://${this.host}/agents/chat-room/${this.name}`;
  }

  send(raw: string) {
    const frame = Frame.parse(JSON.parse(raw));
    if (frame.type === "cf_agent_stream_resume_request")
      this.push({ type: "cf_agent_stream_resume_none", probeId: frame.probeId, reason: "idle" });
    if (frame.type === "cf_agent_use_chat_request" && frame.id && frame.init) {
      this.turn = frame.id;
      this.requests.push(JSON.parse(frame.init.body));
    }
    return true;
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

  // A turn another tab started, which this socket only observes.
  resumeElsewhere(turn: string) {
    this.push({ type: "cf_agent_stream_resuming", id: turn });
  }

  private push(data: object) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(data) }));
  }
}

const { rooms } = vi.hoisted(() => ({ rooms: new Map<string, FakeRoom>() }));

vi.mock("agents/react", () => ({
  useAgent: ({ name, host }: { name: string; host: string }) => {
    const room = rooms.get(name) ?? new FakeRoom(name, host);
    rooms.set(name, room);
    return room;
  }
}));

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

async function openChat() {
  await page.getByRole("button", { name: LAUNCHER }).click();
  await expect.element(sendButton()).toBeEnabled();
}

beforeEach(() => {
  localStorage.clear();
  rooms.clear();
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

  // A second message is refused while the turn runs, and stays in the composer.
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
  expect(rooms.size).toBe(2);
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

  expect(fetched).toEqual(["http://chat.example.com/agents/chat-room/returning/get-messages"]);
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
  localStorage.setItem("chatRoomId", "slow");
  let release = () => {};
  histories.set("slow", () => new Promise(resolve => (release = () => resolve(Response.json([])))));
  const starter = page.getByRole("button", { name: "How has he used LLMs in production?" });

  await render(<ChatWidget />);
  await page.getByRole("button", { name: LAUNCHER }).click();
  await expect.element(page.getByRole("dialog")).toBeVisible();
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

// Desktop: on a phone the modal panel covers the launcher and hides it from assistive tech.
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

  // Escape closes it too, and hands focus back to the launcher.
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

  // Sending instead of answering dismisses the question.
  await restart();
  await userEvent.type(input(), "One more thing{Enter}");
  await expect.element(page.getByText("Start a new conversation?")).not.toBeInTheDocument();
  await expect.poll(() => lastRoom().requests).toHaveLength(1);

  await restart();
  await page.getByRole("button", { name: "Start over" }).click();

  await expect.element(page.getByText("Old question")).not.toBeInTheDocument();
  await expect.element(sendButton()).toBeEnabled();
  expect(rooms.size).toBe(2);
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
  // Checked synchronously after two frames, by which the hint's effect would
  // have committed: a polling matcher would wait out the hint's own fade.
  await new Promise(requestAnimationFrame);
  await new Promise(requestAnimationFrame);
  expect(page.getByRole("button", { name: LAUNCHER }).query()).not.toBeNull();
  expect(hint.query()).toBeNull();
});
