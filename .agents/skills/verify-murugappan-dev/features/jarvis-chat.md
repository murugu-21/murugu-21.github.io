# Jarvis chat

Every portfolio and blog page has a floating launcher that opens Jarvis, an AI assistant that answers from the site's content and can take an opportunity's contact details.

## Sub-features

- `chat-open` opens the panel from the launcher, with a greeting, three starter questions and a composer.
- `chat-menu` offers `Start over` (with a confirmation) and `Download transcript`.
- `chat-close` closes the panel from its header.
- `chat-send` sends a typed message or a starter and streams a reply.

## How to get to it (user POV)

- Choose the round launcher at the bottom right of any page.
- Choose a starter question in the open panel.
- Type in the `Your message` box and choose `Send`, or press Enter.

## Driving it with chrome-devtools

Preconditions:

- A page on `http://localhost:8791/` or `/blog/` in this run's isolated context.
- `E="$RUN/evidence/jarvis-chat"; mkdir -p "$E"`.
- For `chat-send` only, the user's go-ahead for a stated number of turns, and `DEEPSEEK_API_KEY` in `apps/api/.dev.vars`.

Steps:

- **`chat-open`.** `take_snapshot`, then `click` the button named `Chat with Jarvis, Murugappan's AI assistant`. `wait_for text: ["What's the most impactful thing he's shipped?"]` succeeds within 15 s. The snapshot shows a dialog named `Chat with Jarvis`, buttons `Conversation options`, `Close chat` and `Send`, and a focused textbox named `Your message`. `take_screenshot filePath: "$E/chat-open.png"`. `grep '/agents/chat-room/' "$RUN/worker.log"` shows a `get-messages` `200` and a `101 Switching Protocols`, which proves the socket reached this instance.
- **`chat-menu`.** `click` `Conversation options`. Menu items `Start over` and `Download transcript` appear. `press_key key: "Escape"` closes the menu. To prove `Start over`, read `evaluate_script () => localStorage.getItem("chatRoomId")` first, then `click` the menu's `Start over` and re-snapshot. A bar reading `Start a new conversation?` appears with `Start over` and `Cancel` buttons. `click` the bar's `Start over`, and `chatRoomId` now differs from the first read.
- **`chat-close`.** Re-snapshot and `click` `Close chat`. The dialog leaves the snapshot, and the launcher no longer reports `expanded`.
- **`chat-send`.** `fill` `Your message` with a question and `click` `Send`. A user bubble appears and the reply streams into the polite live region.

## Gotchas

- The widget hydrates on the first `pointerdown`, `keydown`, `touchstart`, `wheel` or `pointermove`. `evaluate_script` with `el.click()` fires none of them and the panel never opens. Use the `click` tool.
- While the options menu is open, the rest of the panel leaves the a11y tree and old uids fail. Press Escape and re-snapshot first.
- A starter button sends immediately, so it's billed like a typed message.
- Opening the panel logs `/agents/chat-room/`, so a `worker.log` hit doesn't prove a send.
- A build made without Launch's blanked `PUBLIC_CHAT_HOST` points the widget at the `.env` host (the user's `:8787`). If `worker.log` shows no `/agents/` request after opening the panel, rebuild per Launch.
- `bun run test:live` checks the model, prompt, chat room and lead email through a room socket, not the widget, and bills three turns.
- Messages live in this run's `--persist-to` state, and the room id in the browser's `localStorage` (`chatRoomId`). A reused isolated context keeps the old id but finds an empty room in a new run.
