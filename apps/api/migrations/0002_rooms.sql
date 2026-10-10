-- Mirrors the `visitor_*` keys ChatRoom keeps, one row per room. Permissive like messages, for
-- the same reason. Both context columns are nullable because the Worker only forwards the
-- headers it has, and local dev has neither.
CREATE TABLE IF NOT EXISTS rooms (
  room_id TEXT PRIMARY KEY,
  country TEXT,
  ip TEXT,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
