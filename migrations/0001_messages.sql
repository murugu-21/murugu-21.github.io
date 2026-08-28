-- Analytics mirror of every ChatRoom's transcript. The Durable Object's own
-- SQLite (worker/chat-room.ts, onStart) stays the serving source of truth —
-- this table exists only so chats are browsable in the Cloudflare dash, since
-- rooms aren't enumerable and there is no other global view.
--
-- `room_id` is the DO name, so it is the one column the DO's table doesn't
-- have. Everything else mirrors ChatRoom.persist().
--
-- Deliberately permissive: no CHECK on `role` and no foreign keys. Mirror
-- writes are fire-and-forget (the .catch() in persist() logs and moves on), so
-- a constraint that starts rejecting rows would fail silently and lose
-- transcripts rather than surface an error.
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
