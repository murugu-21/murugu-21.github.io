import { env, runInDurableObject } from "cloudflare:test";
import { assert, describe, expect, it, vi } from "vitest";

import { ChatRoom, parseClientMessage } from "../chat-room";
import {
  GREETING,
  MAX_MESSAGE_LENGTH,
  parseServerMessage,
  parseVisitorContext,
  type ServerMessage,
  toolFrame,
  VISITOR_COUNTRY_HEADER,
  VISITOR_IP_HEADER
} from "../protocol";
import { connectRoom, recordingEmail, testEnv, visitorMeta } from "./fixtures";

describe("ChatRoom storage", () => {
  it("seeds the greeting exactly once on first connect", async () => {
    await connectRoom("room-greet");
    // A reconnect must not seed again.
    const { history } = await connectRoom("room-greet");
    expect(parseServerMessage(history)).toEqual({
      type: "history",
      messages: [{ role: "assistant", content: GREETING }]
    });
  });

  it("records the visitor's country and IP, keeping first-seen across reconnects", async () => {
    const meta = async (headers: Record<string, string>) => {
      const { stub } = await connectRoom("room-visitor", headers);
      return await runInDurableObject(stub, visitorMeta);
    };

    const first = await meta({ "CF-IPCountry": "IN", "CF-Connecting-IP": "203.0.113.7" });
    expect(first).toMatchObject({
      visitor_country: "IN",
      visitor_ip: "203.0.113.7"
    });

    const second = await meta({ "CF-IPCountry": "DE" });
    expect(second.visitor_country).toBe("DE"); // the latest country wins
    expect(second.visitor_ip).toBe("203.0.113.7"); // but a missing value never erases one
    expect(second.visitor_first_seen).toBe(first.visitor_first_seen);
    expect(Number(second.visitor_last_seen)).toBeGreaterThanOrEqual(
      Number(first.visitor_last_seen)
    );
  });

  it("mirrors one rooms row per room to D1, refreshed on reconnect", async () => {
    const room = "room-mirror";

    type RoomRow = {
      country: string | null;
      ip: string | null;
      first_seen: number;
      last_seen: number;
    };
    // The room writes fire-and-forget, so poll; match on expected values because
    // the previous row is already there.
    const mirrored = (expected: Partial<RoomRow>) =>
      vi.waitFor(
        async () => {
          const found = await env.CHAT_DB.prepare(
            `SELECT country, ip, first_seen, last_seen FROM rooms WHERE room_id = ?`
          )
            .bind(room)
            .first<RoomRow>();
          assert(found, "no rooms row yet");
          expect(found).toMatchObject(expected);
          return found;
        },
        { timeout: 2000, interval: 5 }
      );

    await connectRoom(room, { "CF-IPCountry": "IN", "CF-Connecting-IP": "203.0.113.9" });
    const first = await mirrored({ country: "IN", ip: "203.0.113.9" });

    // A reconnect without an IP refreshes the country and last_seen, but must
    // not erase the address already known.
    await connectRoom(room, { "CF-IPCountry": "DE" });
    const second = await mirrored({ country: "DE", ip: "203.0.113.9" });
    expect(second.first_seen).toBe(first.first_seen);
    expect(second.last_seen).toBeGreaterThanOrEqual(first.last_seen);
  });
});

describe("ChatRoom leads", () => {
  it("emails the owner about a lead once per room", async () => {
    const stub = env.ChatRoom.get(env.ChatRoom.idFromName("room-lead"));
    await runInDurableObject(stub, async (instance: ChatRoom) => {
      instance.onStart();
      const { email, sent } = recordingEmail();
      Object.assign(instance, { env: testEnv({ email }) });
      const lead = { contact: "a@b.c", summary: "Staff role" };
      await instance["emailLeadOnce"](lead);
      await instance["emailLeadOnce"](lead);
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe("inbox@example.com");
    });
  });
});

describe("parseServerMessage", () => {
  it.each<ServerMessage>([
    { type: "history", messages: [{ role: "assistant", content: GREETING }] },
    { type: "visitor", text: "hi" },
    { type: "delta", text: "hel" },
    toolFrame("fetch_page", "https://murugappan.dev/blog/x/"),
    toolFrame("capture_opportunity"),
    { type: "done" },
    { type: "limit", message: "budget" },
    { type: "error", message: "oops" }
  ])("round-trips a $type frame the room sends", frame => {
    expect(parseServerMessage(JSON.stringify(frame))).toEqual(frame);
  });

  it("accepts a delta frame and rejects frames the room never sends", () => {
    expect(parseServerMessage('{"type":"delta","text":"hel"}')).toEqual({
      type: "delta",
      text: "hel"
    });
    for (const frame of [
      { type: "nope" },
      { type: "delta" },
      { type: "tool", name: "rm_rf" },
      { type: "history", messages: [{ role: "x", content: "" }] }
    ]) {
      const raw = JSON.stringify(frame);
      expect(parseServerMessage(raw), raw).toBeNull();
    }
  });
});

describe("parseClientMessage", () => {
  it("accepts a valid chat message, trimmed, and rejects anything else", () => {
    const msg = parseClientMessage(JSON.stringify({ type: "chat", text: "  hi there  " }));
    expect(msg).toEqual({ type: "chat", text: "hi there" });
    for (const [label, raw] of [
      ["binary frame", new ArrayBuffer(8)],
      ["malformed JSON", "{nope"],
      ["unknown type", JSON.stringify({ type: "ping" })],
      ["missing text", JSON.stringify({ type: "chat" })],
      ["blank text", JSON.stringify({ type: "chat", text: "   " })],
      ["oversized text", JSON.stringify({ type: "chat", text: "x".repeat(MAX_MESSAGE_LENGTH + 1) })]
    ] satisfies [string, string | ArrayBuffer][]) {
      expect(parseClientMessage(raw), label).toBeNull();
    }
  });

  it("accepts a valid page path and drops invalid ones", () => {
    expect(
      parseClientMessage(JSON.stringify({ type: "chat", text: "hi", page: "/blog/react/" }))?.page
    ).toBe("/blog/react/");
    for (const bad of ["blog/react", "https://evil.example/x", "/a b", "x"]) {
      expect(
        parseClientMessage(JSON.stringify({ type: "chat", text: "hi", page: bad }))?.page
      ).toBeUndefined();
    }
  });
});

describe("parseVisitorContext", () => {
  it("returns the country and IP the edge attached, trimmed", () => {
    const headers = new Headers({
      [VISITOR_COUNTRY_HEADER]: " IN ",
      [VISITOR_IP_HEADER]: " 203.0.113.7 "
    });
    expect(parseVisitorContext(headers)).toEqual({
      country: "IN",
      ip: "203.0.113.7"
    });
  });

  it("treats a missing or blank header as unknown, and null when both are", () => {
    const ipOnly = new Headers({
      [VISITOR_COUNTRY_HEADER]: "  ",
      [VISITOR_IP_HEADER]: "203.0.113.7"
    });
    expect(parseVisitorContext(ipOnly)).toEqual({ country: null, ip: "203.0.113.7" });
    expect(parseVisitorContext(new Headers())).toBeNull();
    expect(parseVisitorContext(new Headers({ [VISITOR_COUNTRY_HEADER]: "  " }))).toBeNull();
  });

  it("caps a forged value instead of storing it whole", () => {
    const headers = new Headers({ [VISITOR_IP_HEADER]: "x".repeat(200) });
    expect(parseVisitorContext(headers)?.ip).toHaveLength(64);
  });
});

describe("toolFrame", () => {
  it("reports a page fetch as the site path, not the full url", () => {
    expect(toolFrame("fetch_page", "https://murugappan.dev/blog/react/")).toEqual({
      type: "tool",
      name: "fetch_page",
      detail: "/blog/react/"
    });
  });

  it("omits the detail when the url is missing or unparseable", () => {
    expect(toolFrame("fetch_page", null)).toEqual({
      type: "tool",
      name: "fetch_page"
    });
    expect(toolFrame("fetch_page", "not a url")).toEqual({
      type: "tool",
      name: "fetch_page"
    });
  });

  it("never carries a detail for a capture — contact details stay server-side", () => {
    expect(toolFrame("capture_opportunity")).toEqual({
      type: "tool",
      name: "capture_opportunity"
    });
  });
});
