import { describe, expect, it } from "vite-plus/test";

import type { JsonValue } from "@murugappan/utils/json.ts";
import { admitFrame } from "#src/modules/chat/chat-frames.ts";

const stored = [{ id: "m1", role: "assistant", parts: [{ type: "text", text: "Hi" }] }];

function chatRequest(body: JsonValue): string {
  return JSON.stringify({
    type: "cf_agent_use_chat_request",
    init: { method: "POST", body: JSON.stringify(body) }
  });
}

const resume = '{"type":"cf_agent_stream_resume_request"}';
const resumeAck = '{"type":"cf_agent_stream_resume_ack","id":"r1"}';

describe("admitFrame", () => {
  it.each([
    ["a binary frame", new ArrayBuffer(4), { kind: "drop" }],
    ["a resume request", resume, { kind: "forward", frame: resume }],
    ["a resume ack", resumeAck, { kind: "forward", frame: resumeAck }],
    [
      "a chat request with an invalid body and no id",
      chatRequest({ messages: [], trigger: "submit-message" }),
      { kind: "drop" }
    ]
  ])("admits %s as the matching admission", (_, message, expected) => {
    expect(admitFrame({ message, stored })).toEqual(expected);
  });
});
