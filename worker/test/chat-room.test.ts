import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";

import { ChatRoom } from "../chat-room";
import { GREETING, VISITOR_COUNTRY_HEADER, VISITOR_IP_HEADER } from "../protocol";

// `ConnectionContext` is only the upgrade request to the room; importing one
// URL keeps every call site honest about that.
function connectContext(headers: Record<string, string> = {}): { request: Request } {
  return {
    request: new Request("https://example.com/parties/chat-room/x", { headers })
  };
}

function visitorMeta(instance: ChatRoom): Record<string, unknown> {
  return Object.fromEntries(
    instance.ctx.storage.sql
      .exec(`SELECT key, value FROM meta WHERE key LIKE 'visitor_%'`)
      .toArray()
      .map(r => [r.key as string, r.value])
  );
}

describe("ChatRoom storage", () => {
  it("seeds the greeting exactly once on first connect", async () => {
    const stub = env.ChatRoom.get(env.ChatRoom.idFromName("room-greet"));
    await runInDurableObject(stub, async (instance: ChatRoom) => {
      instance.onStart();
      const sent: string[] = [];
      const conn = { send: (d: string) => sent.push(d) } as never;
      const ctx = connectContext();
      instance.onConnect(conn, ctx);
      instance.onConnect(conn, ctx); // reconnect must not seed again
      const rows = instance.ctx.storage.sql
        .exec(`SELECT role, content FROM messages ORDER BY id ASC`)
        .toArray();
      expect(rows).toEqual([{ role: "assistant", content: GREETING }]);
      // both history frames include the greeting
      const last = JSON.parse(sent[1]);
      expect(last.messages).toEqual([{ role: "assistant", content: GREETING }]);
    });
  });

  it("creates tables on start and persists/reads messages in order", async () => {
    const stub = env.ChatRoom.get(env.ChatRoom.idFromName("room-a"));
    await runInDurableObject(stub, async (instance: ChatRoom) => {
      instance.onStart();
      instance.ctx.storage.sql.exec(
        `INSERT INTO messages (role, content, created_at) VALUES ('user', 'q', 1), ('assistant', 'a', 2)`
      );
      const rows = instance.ctx.storage.sql
        .exec(`SELECT role, content FROM messages ORDER BY id ASC`)
        .toArray();
      expect(rows).toEqual([
        { role: "user", content: "q" },
        { role: "assistant", content: "a" }
      ]);
    });
  });

  it("stores leads and enforces the lead_captured dedupe key", async () => {
    const stub = env.ChatRoom.get(env.ChatRoom.idFromName("room-b"));
    await runInDurableObject(stub, async (instance: ChatRoom) => {
      instance.onStart();
      instance.ctx.storage.sql.exec(
        `INSERT INTO leads (name, contact, summary, created_at) VALUES (NULL, 'a@b.c', 's', 1)`
      );
      instance.ctx.storage.sql.exec(
        `INSERT INTO meta (key, value) VALUES ('lead_captured', 'now')`
      );
      expect(() =>
        instance.ctx.storage.sql.exec(
          `INSERT INTO meta (key, value) VALUES ('lead_captured', 'again')`
        )
      ).toThrow();
      const leads = instance.ctx.storage.sql.exec(`SELECT contact FROM leads`).toArray();
      expect(leads).toEqual([{ contact: "a@b.c" }]);
    });
  });

  it("records the visitor's country and IP, keeping first-seen across reconnects", async () => {
    const stub = env.ChatRoom.get(env.ChatRoom.idFromName("room-visitor"));
    await runInDurableObject(stub, async (instance: ChatRoom) => {
      instance.onStart();
      const conn = { send: () => {} } as never;
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
      const conn = { send: () => {} } as never;
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
        instance.onConnect({ send: () => {} } as never, connectContext(headers));
      });

    type RoomRow = {
      country: string | null;
      ip: string | null;
      first_seen: number;
      last_seen: number;
    };
    // Fire-and-forget on the room's side, so retry until the write lands —
    // against the expected values, because the previous row is already there.
    const mirrored = (expected: Partial<RoomRow>) =>
      vi.waitFor(
        async () => {
          const found = await env.CHAT_DB.prepare(
            `SELECT country, ip, first_seen, last_seen FROM rooms WHERE room_id = ?`
          )
            .bind(room)
            .first<RoomRow>();
          expect(found).toMatchObject(expected);
          return found as RoomRow;
        },
        { timeout: 2000 }
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
