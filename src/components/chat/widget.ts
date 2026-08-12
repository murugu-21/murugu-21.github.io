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
    <button class="chat-launcher" aria-label="Chat with Murugappan's AI assistant" aria-expanded="false">${CHAT_ICON}</button>
    <div class="chat-panel" role="dialog" aria-label="Chat with Murugappan's AI assistant">
      <div class="chat-header">
        <h2>Ask me about Murugappan</h2>
        <p>AI assistant — answers from this site's content</p>
      </div>
      <div class="chat-messages" aria-live="polite"></div>
      <form class="chat-form">
        <input type="text" maxlength="${MAX_LENGTH}" placeholder="Ask a question…" aria-label="Your message" />
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

  const addBubble = (kind: "user" | "assistant" | "system", text: string) => {
    const el = document.createElement("div");
    el.className = `chat-bubble ${kind}`;
    el.textContent = text;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  };

  const greetIfEmpty = () => {
    if (messagesEl.childElementCount === 0) {
      addBubble(
        "assistant",
        "Hi! I'm Murugappan's AI assistant. Ask me about his experience, projects, or blog posts — or tell me about an opportunity for him."
      );
    }
  };

  const handleServerMessage = (msg: ServerMessage) => {
    switch (msg.type) {
      case "history":
        messagesEl.innerHTML = "";
        for (const m of msg.messages) addBubble(m.role, m.content);
        greetIfEmpty();
        break;
      case "delta":
        if (!streamEl) streamEl = addBubble("assistant", "");
        streamEl.textContent += msg.text;
        messagesEl.scrollTop = messagesEl.scrollHeight;
        break;
      case "done":
        streamEl = null;
        sendBtn.disabled = false;
        break;
      case "limit":
      case "error":
        streamEl = null;
        sendBtn.disabled = false;
        addBubble("system", msg.message);
        break;
    }
  };

  const connect = () => {
    if (socket) return;
    socket = new PartySocket({
      host: window.location.host,
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
      sendBtn.disabled = false;
    });
  };

  launcher.addEventListener("click", () => {
    const open = panel.classList.toggle("open");
    launcher.innerHTML = open ? CLOSE_ICON : CHAT_ICON;
    launcher.setAttribute("aria-expanded", String(open));
    tooltip?.remove();
    if (open) {
      connect();
      greetIfEmpty();
      input.focus();
    }
  });

  form.addEventListener("submit", e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !socket || socket.readyState !== WebSocket.OPEN) return;
    addBubble("user", text);
    socket.send(JSON.stringify({type: "chat", text}));
    input.value = "";
    sendBtn.disabled = true;
  });

  // Quiet one-time tooltip.
  let tooltip: HTMLDivElement | null = null;
  if (!localStorage.getItem(TOOLTIP_KEY)) {
    localStorage.setItem(TOOLTIP_KEY, "1");
    tooltip = document.createElement("div");
    tooltip.className = "chat-tooltip";
    tooltip.textContent = "Ask me anything about Murugappan";
    root.appendChild(tooltip);
    setTimeout(() => tooltip?.classList.add("fade"), 5000);
    setTimeout(() => tooltip?.remove(), 5700);
  }
}

const mount = document.getElementById("chat-widget-root");
if (mount) initChatWidget(mount);
