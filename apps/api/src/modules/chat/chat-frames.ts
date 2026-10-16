import type { WSMessage } from "agents";
import { z } from "zod";

import { MAX_MESSAGE_LENGTH } from "@murugappan/contracts/chat.ts";
import { jsonString, lenient } from "@murugappan/utils/json.ts";

const PASSTHROUGH_FRAMES: ReadonlySet<string> = new Set([
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
          messages: z.array(z.unknown()).min(1),
          trigger: z.literal("submit-message"),
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
  if (message instanceof ArrayBuffer || ArrayBuffer.isView(message)) return DROP;
  const frame = FrameType.safeParse(message).data;
  if (frame && PASSTHROUGH_FRAMES.has(frame.type)) return { kind: "forward", frame: message };
  if (frame?.type !== "cf_agent_use_chat_request") return DROP;

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
