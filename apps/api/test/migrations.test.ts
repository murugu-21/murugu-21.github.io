import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { assert, expect, it } from "vite-plus/test";

declare const __D1_MIGRATIONS__: Parameters<typeof applyD1Migrations>[1];

const DAY = 86_400_000;

it("backfills IPv4 visitor keys and erases IPs and keys last seen over 30 days ago", async () => {
  const visitorKeyMigration = __D1_MIGRATIONS__.findIndex(
    migration => migration.name === "0003_rooms_visitor_key.sql"
  );
  assert(visitorKeyMigration > 0, "0003_rooms_visitor_key.sql not found");
  await env.CHAT_DB.exec("DROP TABLE rooms");
  await applyD1Migrations(
    env.CHAT_DB,
    __D1_MIGRATIONS__.slice(0, visitorKeyMigration),
    "replayed_migrations"
  );
  const now = Date.now();
  const seed = env.CHAT_DB.prepare(
    "INSERT INTO rooms (room_id, ip, first_seen, last_seen) VALUES (?, ?, ?, ?)"
  );
  await env.CHAT_DB.batch([
    seed.bind("ipv4-recent", "203.0.113.9", now - 2 * DAY, now - DAY),
    seed.bind("ipv4-old", "198.51.100.7", now - 40 * DAY, now - 31 * DAY),
    seed.bind("ipv6-recent", "2001:db8::1", now - 2 * DAY, now - DAY),
    seed.bind("ipv6-mapped", "::ffff:203.0.113.9", now - 2 * DAY, now - DAY),
    seed.bind("ipv6-old", "2001:db8::2", now - 40 * DAY, now - 31 * DAY),
    seed.bind("edge-kept", "203.0.113.10", now - 40 * DAY, now - 30 * DAY + 60_000),
    seed.bind("edge-erased", "203.0.113.11", now - 40 * DAY, now - 30 * DAY - 60_000),
    seed.bind("no-ip", null, now - 2 * DAY, now - DAY)
  ]);

  await applyD1Migrations(env.CHAT_DB, __D1_MIGRATIONS__, "replayed_migrations");

  const { results } = await env.CHAT_DB.prepare(
    "SELECT room_id, ip, visitor_key FROM rooms ORDER BY room_id"
  ).all();
  expect(results).toEqual([
    { room_id: "edge-erased", ip: null, visitor_key: null },
    { room_id: "edge-kept", ip: "203.0.113.10", visitor_key: "203.0.113.10" },
    { room_id: "ipv4-old", ip: null, visitor_key: null },
    { room_id: "ipv4-recent", ip: "203.0.113.9", visitor_key: "203.0.113.9" },
    { room_id: "ipv6-mapped", ip: "::ffff:203.0.113.9", visitor_key: null },
    { room_id: "ipv6-old", ip: null, visitor_key: null },
    { room_id: "ipv6-recent", ip: "2001:db8::1", visitor_key: null },
    { room_id: "no-ip", ip: null, visitor_key: null }
  ]);
});
