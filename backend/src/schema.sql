-- Electron Card — Phase 3A schema (SQLite)

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per completed match, owned by the account that played it.
-- `data` holds the full match record JSON (rounds, plays, collections) -> powers replay.
-- Hot columns are extracted for cheap aggregate statistics.
CREATE TABLE IF NOT EXISTS matches (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id          TEXT NOT NULL,             -- the game's own record id (dedupe key)
  result             TEXT NOT NULL,             -- DRAW | KHOTI_AC | KHOTI_BD
  score_ac           INTEGER NOT NULL,
  score_bd           INTEGER NOT NULL,
  stranded           INTEGER NOT NULL DEFAULT 0,
  trump              TEXT NOT NULL,             -- S | H | D | C
  largest_collection INTEGER NOT NULL DEFAULT 0,
  collections_count  INTEGER NOT NULL DEFAULT 0,
  duration_ms        INTEGER,
  difficulty         TEXT,
  played_at          TEXT NOT NULL,
  data               TEXT NOT NULL,             -- full JSON record
  UNIQUE(user_id, client_id)
);
CREATE INDEX IF NOT EXISTS idx_matches_user ON matches(user_id, played_at DESC);

-- Friendship request/edge. status: pending | accepted
CREATE TABLE IF NOT EXISTS friendships (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(requester_id, addressee_id)
);

-- Private rooms. status: open | closed
CREATE TABLE IF NOT EXISTS rooms (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT NOT NULL UNIQUE,
  host_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS room_players (
  room_id   INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seat      TEXT NOT NULL,            -- A | B | C | D  (A+C vs B+D)
  ready     INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (room_id, user_id),
  UNIQUE (room_id, seat)
);
