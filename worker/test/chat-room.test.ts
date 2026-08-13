import {env, runInDurableObject} from "cloudflare:test";
import {describe, expect, it} from "vitest";

import {ChatRoom} from "../chat-room";
import {GREETING} from "../protocol";

describe("ChatRoom storage", () => {
  it("seeds the greeting exactly once on first connect", async () => {
    const stub = env.ChatRoom.get(env.ChatRoom.idFromName("room-greet"));
    await runInDurableObject(stub, async (instance: ChatRoom) => {
      instance.onStart();
      const sent: string[] = [];
      const conn = {send: (d: string) => sent.push(d)} as never;
      instance.onConnect(conn);
      instance.onConnect(conn); // reconnect must not seed again
      const rows = instance.ctx.storage.sql
        .exec(`SELECT role, content FROM messages ORDER BY id ASC`)
        .toArray();
      expect(rows).toEqual([{role: "assistant", content: GREETING}]);
      // both history frames include the greeting
      const last = JSON.parse(sent[1]);
      expect(last.messages).toEqual([{role: "assistant", content: GREETING}]);
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
        {role: "user", content: "q"},
        {role: "assistant", content: "a"}
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
      const leads = instance.ctx.storage.sql
        .exec(`SELECT contact FROM leads`)
        .toArray();
      expect(leads).toEqual([{contact: "a@b.c"}]);
    });
  });
});
