-- Visitor context per chat room: the country and IP Cloudflare resolved for
-- the connection that opened it. Mirrors the `visitor_*` keys ChatRoom keeps
-- in its own `meta` table; one row per room, refreshed on every reconnect, so
-- the dash shows where a conversation came from without joining transcripts.
--
-- Same permissive stance as messages: writes are fire-and-forget (the
-- .catch() in recordVisitor() logs and moves on), so a constraint that starts
-- rejecting rows would lose the datum silently. Both context columns are
-- nullable because the Worker only forwards the headers it actually has —
-- local dev has neither.
CREATE TABLE IF NOT EXISTS rooms (
  room_id TEXT PRIMARY KEY,
  country TEXT,
  ip TEXT,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
