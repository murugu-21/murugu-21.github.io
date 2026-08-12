// Intercom-style chat widget. Framework-free; shared by the portfolio and the
// blog (the blog imports this module via a relative path). Loaded lazily on
// idle by ChatWidget.astro so it never affects initial page load.
import {nanoid} from "nanoid";
import {PartySocket} from "partysocket";

import type {ServerMessage} from "../../../worker/protocol";
import "./chat.css";

const ROOM_KEY = "chatRoomId";
const TOOLTIP_KEY = "chatTooltipSeen";
const MAX_LENGTH = 1000;

const CHAT_ICON =
  '<svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M256 32C114.6 32 0 125.1 0 240c0 49.6 21.4 95 57 130.7C44.5 421.1 2.7 466 2.2 466.5c-2.2 2.3-2.8 5.7-1.5 8.7S4.8 480 8 480c66.3 0 116-31.8 140.6-51.4 32.7 12.3 69 19.4 107.4 19.4 141.4 0 256-93.1 256-208S397.4 32 256 32z"/></svg>';

const CLOSE_ICON =
  '<svg viewBox="0 0 352 512" fill="currentColor" aria-hidden="true"><path d="M242.7 256l100.1-100.1c12.3-12.3 12.3-32.2 0-44.5l-22.2-22.2c-12.3-12.3-32.2-12.3-44.5 0L176 189.3 75.9 89.2c-12.3-12.3-32.2-12.3-44.5 0L9.2 111.5c-12.3 12.3-12.3 32.2 0 44.5L109.3 256 9.2 356.1c-12.3 12.3-12.3 32.2 0 44.5l22.2 22.2c12.3 12.3 32.2 12.3 44.5 0L176 322.7l100.1 100.1c12.3 12.3 32.2 12.3 44.5 0l22.2-22.2c12.3-12.3 12.3-32.2 0-44.5L242.7 256z"/></svg>';

function roomId(): string {
  let id = localStorage.getItem(ROOM_KEY);
  if (!id) {
    id = nanoid();
    localStorage.setItem(ROOM_KEY, id);
  }
  return id;
}

export function initChatWidget(root: HTMLElement): void {
  root.innerHTML = `
    <button class="chat-launcher" aria-label="Chat with Jarvis, Murugappan's AI assistant" aria-expanded="false">${CHAT_ICON}</button>
    <div class="chat-panel" role="dialog" aria-label="Chat with Jarvis, Murugappan's AI assistant">
      <div class="chat-header">
        <h2>Chat with Jarvis</h2>
        <p>Murugappan's AI assistant — answers from this site</p>
      </div>
      <div class="chat-messages" aria-live="polite"></div>
      <form class="chat-form">
        <input type="text" id="chat-input" name="message" maxlength="${MAX_LENGTH}" placeholder="Ask a question…" aria-label="Your message" />
        <button type="submit">Send</button>
      </form>
    </div>`;

  const launcher = root.querySelector<HTMLButtonElement>(".chat-launcher")!;
  const panel = root.querySelector<HTMLDivElement>(".chat-panel")!;
  const messagesEl = root.querySelector<HTMLDivElement>(".chat-messages")!;
  const form = root.querySelector<HTMLFormElement>(".chat-form")!;
  const input = form.querySelector<HTMLInputElement>("input")!;
  const sendBtn = form.querySelector<HTMLButtonElement>("button")!;

  let socket: PartySocket | null = null;
  let streamEl: HTMLDivElement | null = null;
  let typingEl: HTMLDivElement | null = null;

  const addBubble = (kind: "user" | "assistant" | "system", text: string) => {
    const el = document.createElement("div");
    el.className = `chat-bubble ${kind}`;
    el.textContent = text;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  };

  const showTyping = () => {
    const el = document.createElement("div");
    el.className = "chat-bubble assistant typing";
    el.innerHTML = "<span></span><span></span><span></span>";
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    typingEl = el;
  };

  const hideTyping = () => {
    typingEl?.remove();
    typingEl = null;
  };

  const greetIfEmpty = () => {
    if (messagesEl.childElementCount === 0) {
      addBubble(
        "assistant",
        "Hi, I'm Jarvis — Murugappan's AI assistant. Ask me about his experience, projects, or blog posts — or tell me about an opportunity for him."
      );
    }
  };

  // Until the first history frame arrives the panel shows the typing dots as
  // a loading state instead of an optimistic greeting — rendering the greeting
  // early meant returning visitors saw it flash and get wiped by the replay.
  let historyLoaded = false;
  let offlineGreetTimer: ReturnType<typeof setTimeout> | null = null;

  const handleServerMessage = (msg: ServerMessage) => {
    switch (msg.type) {
      case "history": {
        historyLoaded = true;
        if (offlineGreetTimer) {
          clearTimeout(offlineGreetTimer);
          offlineGreetTimer = null;
        }
        typingEl = null;
        streamEl = null;
        // Build off-DOM and swap in one paint — no clear-then-grow jank.
        const frag = document.createDocumentFragment();
        for (const m of msg.messages) {
          const el = document.createElement("div");
          el.className = `chat-bubble ${m.role}`;
          el.textContent = m.content;
          frag.appendChild(el);
        }
        messagesEl.replaceChildren(frag);
        greetIfEmpty();
        messagesEl.scrollTop = messagesEl.scrollHeight;
        break;
      }
      case "delta":
        hideTyping();
        if (!streamEl) streamEl = addBubble("assistant", "");
        streamEl.textContent += msg.text;
        messagesEl.scrollTop = messagesEl.scrollHeight;
        break;
      case "done":
        hideTyping();
        streamEl = null;
        sendBtn.disabled = false;
        break;
      case "limit":
      case "error":
        hideTyping();
        streamEl = null;
        sendBtn.disabled = false;
        addBubble("system", msg.message);
        break;
    }
  };

  const connect = (): PartySocket => {
    if (socket) return socket;
    socket = new PartySocket({
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
      hideTyping();
      sendBtn.disabled = false;
    });
    return socket;
  };

  launcher.addEventListener("click", () => {
    const open = panel.classList.toggle("open");
    launcher.innerHTML = open ? CLOSE_ICON : CHAT_ICON;
    launcher.setAttribute("aria-expanded", String(open));
    tooltip?.remove();
    if (open) {
      connect();
      if (!historyLoaded && !typingEl) {
        showTyping();
        // Offline/failure fallback: if no history frame lands, settle into
        // the greeting rather than dots forever (sends still buffer).
        offlineGreetTimer ??= setTimeout(() => {
          offlineGreetTimer = null;
          if (!historyLoaded) {
            hideTyping();
            greetIfEmpty();
          }
        }, 4000);
      }
      input.focus();
    }
  });

  form.addEventListener("submit", e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    // PartySocket buffers sends while CONNECTING/reconnecting and flushes on
    // open — don't gate on readyState or messages get silently dropped
    // during the (re)connect window.
    const ws = socket ?? connect();
    addBubble("user", text);
    showTyping();
    ws.send(JSON.stringify({type: "chat", text}));
    input.value = "";
    sendBtn.disabled = true;
  });

  // Quiet one-time tooltip.
  let tooltip: HTMLDivElement | null = null;
  if (!localStorage.getItem(TOOLTIP_KEY)) {
    localStorage.setItem(TOOLTIP_KEY, "1");
    tooltip = document.createElement("div");
    tooltip.className = "chat-tooltip";
    tooltip.textContent = "Ask Jarvis anything about Murugappan";
    root.appendChild(tooltip);
    setTimeout(() => tooltip?.classList.add("fade"), 5000);
    setTimeout(() => tooltip?.remove(), 5700);
  }
}

const mount = document.getElementById("chat-widget-root");
if (mount) initChatWidget(mount);
