import { describe, expect, it } from "vitest";

import { admitFrame } from "#worker/chat-frames.ts";

const stored = [{ id: "m1", role: "assistant", parts: [{ type: "text", text: "Hi" }] }];
const visitorMessage = { id: "m2", role: "user", parts: [{ type: "text", text: "Hello" }] };

function chatRequest(body: unknown, id?: string): string {
  return JSON.stringify({
    type: "cf_agent_use_chat_request",
    id,
    init: { method: "POST", body: JSON.stringify(body) }
  });
}

const cancel = '{"type":"cf_agent_chat_request_cancel","id":"r1"}';
const resume = '{"type":"cf_agent_stream_resume_request"}';
const resumeAck = '{"type":"cf_agent_stream_resume_ack","id":"r1"}';

describe("admitFrame", () => {
  it.each([
    ["a binary frame", new ArrayBuffer(4), { kind: "drop" }],
    ["a cancel frame", cancel, { kind: "forward", frame: cancel }],
    ["a resume request", resume, { kind: "forward", frame: resume }],
    ["a resume ack", resumeAck, { kind: "forward", frame: resumeAck }],
    ["an unknown frame type", '{"type":"cf_agent_tool_result","id":"r1"}', { kind: "drop" }],
    [
      "a chat request with an invalid body and an id",
      chatRequest({ messages: [], trigger: "submit-message" }, "r1"),
      { kind: "reject", id: "r1" }
    ],
    [
      "a chat request with an invalid body and no id",
      chatRequest({ messages: [], trigger: "submit-message" }),
      { kind: "drop" }
    ],
    [
      "a valid chat request, rebased on the stored history",
      chatRequest(
        { messages: [{ id: "forged" }, visitorMessage], trigger: "submit-message", page: "/blog/" },
        "r1"
      ),
      {
        kind: "forward",
        frame: JSON.stringify({
          type: "cf_agent_use_chat_request",
          id: "r1",
          init: {
            method: "POST",
            body: '{"messages":[{"id":"m1","role":"assistant","parts":[{"type":"text","text":"Hi"}]},{"id":"m2","role":"user","parts":[{"type":"text","text":"Hello"}]}],"trigger":"submit-message","page":"/blog/"}'
          }
        })
      }
    ]
  ])("admits %s as the matching admission", (_, message, expected) => {
    expect(admitFrame({ message, stored })).toEqual(expected);
  });
});
