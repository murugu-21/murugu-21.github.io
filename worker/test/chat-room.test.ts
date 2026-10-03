import { env, runInDurableObject } from "cloudflare:test";
import { assert, describe, expect, it, vi } from "vitest";

import { ChatRoom, parseClientMessage } from "../chat-room";
import {
  GREETING,
  MAX_MESSAGE_LENGTH,
  parseVisitorContext,
  toolFrame,
  VISITOR_COUNTRY_HEADER,
  VISITOR_IP_HEADER
} from "../protocol";
import { recordingEmail, testEnv, visitorMeta } from "./fixtures";

// `ConnectionContext` is only the upgrade request to the room.
function connectContext(headers: Record<string, string> = {}): { request: Request } {
  return {
    request: new Request("https://example.com/parties/chat-room/x", { headers })
  };
}

// onConnect only ever calls send() on the connection.
const fakeConnection = (sent: string[] = []) =>
  ({ send: (d: string) => void sent.push(d) }) as never;

describe("ChatRoom storage", () => {
  it("seeds the greeting exactly once on first connect", async () => {
    const stub = env.ChatRoom.get(env.ChatRoom.idFromName("room-greet"));
    await runInDurableObject(stub, async (instance: ChatRoom) => {
      instance.onStart();
      const sent: string[] = [];
      const conn = fakeConnection(sent);
      const ctx = connectContext();
      instance.onConnect(conn, ctx);
      // A reconnect must not seed again.
      instance.onConnect(conn, ctx);
      const rows = instance.ctx.storage.sql
        .exec(`SELECT role, content FROM messages ORDER BY id ASC`)
        .toArray();
      expect(rows).toEqual([{ role: "assistant", content: GREETING }]);
      expect(JSON.parse(sent[1]).messages).toEqual([{ role: "assistant", content: GREETING }]);
    });
  });

  it("records the visitor's country and IP, keeping first-seen across reconnects", async () => {
    const stub = env.ChatRoom.get(env.ChatRoom.idFromName("room-visitor"));
    await runInDurableObject(stub, async (instance: ChatRoom) => {
      instance.onStart();
      const conn = fakeConnection();
      const connect = (headers: Record<string, string>) =>
        instance.onConnect(conn, connectContext(headers));

      connect({
        [VISITOR_COUNTRY_HEADER]: "IN",
        [VISITOR_IP_HEADER]: "203.0.113.7"
      });
      const first = visitorMeta(instance);
      expect(first).toMatchObject({
        visitor_country: "IN",
        visitor_ip: "203.0.113.7"
      });

      connect({ [VISITOR_COUNTRY_HEADER]: "DE" });
      const second = visitorMeta(instance);
      expect(second.visitor_country).toBe("DE"); // the latest country wins
      expect(second.visitor_ip).toBe("203.0.113.7"); // but a missing value never erases one
      expect(second.visitor_first_seen).toBe(first.visitor_first_seen);
      expect(Number(second.visitor_last_seen)).toBeGreaterThanOrEqual(
        Number(first.visitor_last_seen)
      );
    });
  });

  it("writes nothing when the upgrade carries no visitor context", async () => {
    const stub = env.ChatRoom.get(env.ChatRoom.idFromName("room-anon"));
    await runInDurableObject(stub, async (instance: ChatRoom) => {
      instance.onStart();
      const conn = fakeConnection();
      instance.onConnect(conn, connectContext());
      expect(visitorMeta(instance)).toEqual({});
    });
  });

  it("mirrors one rooms row per room to D1, refreshed on reconnect", async () => {
    const room = "room-mirror";
    const stub = env.ChatRoom.get(env.ChatRoom.idFromName(room));
    const connect = (headers: Record<string, string>) =>
      runInDurableObject(stub, async (instance: ChatRoom) => {
        instance.onStart();
        instance.onConnect(fakeConnection(), connectContext(headers));
      });

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

    await connect({
      [VISITOR_COUNTRY_HEADER]: "IN",
      [VISITOR_IP_HEADER]: "203.0.113.9"
    });
    const first = await mirrored({ country: "IN", ip: "203.0.113.9" });

    // A reconnect without an IP refreshes the country and last_seen, but must
    // not erase the address already known.
    await connect({ [VISITOR_COUNTRY_HEADER]: "DE" });
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

describe("parseClientMessage", () => {
  it("accepts a valid chat message and trims it", () => {
    const msg = parseClientMessage(JSON.stringify({ type: "chat", text: "  hi there  " }));
    expect(msg).toEqual({ type: "chat", text: "hi there" });
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

  it.each<[string, string | ArrayBuffer]>([
    ["binary frames", new ArrayBuffer(8)],
    ["malformed JSON", "{nope"],
    ["unknown types", JSON.stringify({ type: "ping" })],
    ["missing text", JSON.stringify({ type: "chat" })],
    ["blank text", JSON.stringify({ type: "chat", text: "   " })],
    ["oversized text", JSON.stringify({ type: "chat", text: "x".repeat(MAX_MESSAGE_LENGTH + 1) })]
  ])("rejects %s", (_label, raw) => {
    expect(parseClientMessage(raw)).toBeNull();
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

  it("keeps the half it has when the other header is missing", () => {
    const headers = new Headers({ [VISITOR_IP_HEADER]: "203.0.113.7" });
    expect(parseVisitorContext(headers)).toEqual({ country: null, ip: "203.0.113.7" });
  });

  it("returns null when the edge learned nothing (or sent blanks)", () => {
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
