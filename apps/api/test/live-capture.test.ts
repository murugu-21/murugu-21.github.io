import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import {
  chatRequest,
  noticesIn,
  openRoom,
  recordingEmail,
  replyText,
  roomName,
  streamedChunks,
  testEnv,
  userMessage
} from "./fixtures";

const LiveEnv = z.object({ LIVE_DEEPSEEK_API_KEY: z.string() });

const CONTACT = "dana.okafor@northlane.io";

const VISITOR_TURNS = [
  "hey, are you available for contract work?",
  "we need a senior TS/Node engineer for a 3 month contract, starting October, remote.",
  `I'm Dana Okafor, ${CONTACT}. Can you pass this to Murugappan?`
];

describe("lead capture against the live model", { tags: ["live"] }, () => {
  it("emails the owner the lead with the visitor's contact", async () => {
    const { LIVE_DEEPSEEK_API_KEY } = LiveEnv.parse(env);
    const { socket, frames, stub } = await openRoom(roomName("live-capture"));
    const { email, sent } = recordingEmail();
    await runInDurableObject(stub, instance => {
      Object.assign(instance, {
        env: {
          ...testEnv({ email }),
          DEEPSEEK_API_KEY: LIVE_DEEPSEEK_API_KEY
        }
      });
    });

    const transcript: string[] = [];
    for (const [i, text] of VISITOR_TURNS.entries()) {
      socket.send(chatRequest({ id: `r${i}`, messages: [userMessage({ id: `u${i}`, text })] }));
      const chunks = await streamedChunks(frames, `r${i}`, { timeout: 45_000 });
      const notices = noticesIn(chunks);
      const noticeText = notices.length ? ` ${JSON.stringify(notices)}` : "";
      transcript.push(`visitor: ${text}`, `jarvis: ${replyText(chunks)}${noticeText}`);
    }

    const report = transcript.join("\n");
    expect(
      sent.map(m => m.to),
      report
    ).toEqual(["inbox@example.com"]);
    const contactLine = sent[0]?.text?.split("\n").find(line => line.startsWith("Contact:"));
    expect(contactLine, report).toContain(CONTACT);
  });
});
