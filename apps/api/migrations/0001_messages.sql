-- Mirror of every ChatRoom's transcript for browsing in the Cloudflare dashboard, since rooms
-- aren't enumerable. The Durable Object's own SQLite stays the source of truth.
--
-- No CHECK on `role` and no foreign keys: mirror writes are fire-and-forget, so a constraint
-- that starts rejecting rows would lose transcripts silently.
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  room_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Reading one room's transcript in order is the only query this table serves.
CREATE INDEX IF NOT EXISTS messages_room_created
  ON messages (room_id, created_at);
