CREATE TABLE IF NOT EXISTS rooms (
  room_id TEXT PRIMARY KEY,
  country TEXT,
  ip TEXT,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
