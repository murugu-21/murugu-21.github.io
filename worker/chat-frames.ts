import type { WSMessage } from "agents";
import { z } from "zod";

import { jsonString, lenient } from "#utils/json.ts";
import { MAX_MESSAGE_LENGTH } from "#contracts/chat.ts";

// Frames that can't start a model call or touch stored messages, passed through as sent.
const PASSTHROUGH_FRAMES = new Set([
  "cf_agent_stream_resume_request",
  "cf_agent_stream_resume_ack",
  "cf_agent_chat_request_cancel"
]);

const FrameType = jsonString(z.looseObject({ type: z.string(), id: lenient(z.string()) }));

const ChatRequest = jsonString(
  z.object({
    type: z.literal("cf_agent_use_chat_request"),
    id: z.string().min(1).max(100),
    init: z.object({
      method: z.literal("POST"),
      body: jsonString(
        z.object({
          // Only the newest message is read; the room's stored history replaces the rest.
          messages: z.array(z.unknown()).min(1),
          trigger: z.literal("submit-message"),
          // The visitor's current site path; never persisted. A malformed one is dropped.
          page: lenient(z.string().regex(/^\/[^\s]{0,199}$/))
        })
      )
    })
  })
);

const UserMessage = z.object({
  id: z.string().min(1).max(100),
  role: z.literal("user"),
  parts: z.tuple([
    z.object({ type: z.literal("text"), text: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH) })
  ])
});

/** What the room does with an incoming socket frame. */
export type Admission =
  | { kind: "forward"; frame: string }
  | { kind: "reject"; id: string }
  | { kind: "drop" };

const DROP: Admission = { kind: "drop" };

/**
 * AIChatAgent trusts the client's whole transcript: it persists whatever history a frame
 * carries and runs turns for tool results. This lets through a new visitor message, rebased
 * on the stored history, and the resume and cancel frames. Everything else is dropped.
 */
export function admitFrame({
  message,
  stored
}: {
  message: WSMessage;
  stored: readonly { id: string }[];
}): Admission {
  const frame = FrameType.safeParse(message).data;
  if (typeof message !== "string" || !frame) return DROP;
  if (PASSTHROUGH_FRAMES.has(frame.type)) return { kind: "forward", frame: message };
  if (frame.type !== "cf_agent_use_chat_request") return DROP;

  const request = ChatRequest.safeParse(message).data;
  const { messages, page } = request?.init.body ?? {};
  const latest = UserMessage.safeParse(messages?.at(-1)).data;
  if (!request || !latest || stored.some(m => m.id === latest.id)) {
    return frame.id ? { kind: "reject", id: frame.id } : DROP;
  }
  return {
    kind: "forward",
    frame: JSON.stringify({
      type: request.type,
      id: request.id,
      init: {
        method: "POST",
        body: JSON.stringify({
          messages: [...stored, latest],
          trigger: "submit-message",
          page
        })
      }
    })
  };
}
