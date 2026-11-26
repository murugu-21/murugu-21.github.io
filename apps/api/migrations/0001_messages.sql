-- Mirror of every ChatRoom's transcript for browsing in the Cloudflare dashboard, since rooms
-- aren't enumerable. The Durable Object's own SQLite stays the source of truth.
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  room_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS messages_room_created
  ON messages (room_id, created_at);
