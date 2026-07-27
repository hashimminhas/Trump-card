-- Trump Card PostgreSQL schema

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_guest      INTEGER NOT NULL DEFAULT 0,
  reset_token   TEXT,
  reset_expires TEXT,
  created_at    TEXT NOT NULL DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS matches (
  id                 SERIAL PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id          TEXT NOT NULL,
  result             TEXT NOT NULL,
  score_ac           INTEGER NOT NULL,
  score_bd           INTEGER NOT NULL,
  stranded           INTEGER NOT NULL DEFAULT 0,
  trump              TEXT NOT NULL,
  largest_collection INTEGER NOT NULL DEFAULT 0,
  collections_count  INTEGER NOT NULL DEFAULT 0,
  duration_ms        INTEGER,
  difficulty         TEXT,
  played_at          TEXT NOT NULL,
  data               TEXT NOT NULL,
  mode               TEXT NOT NULL DEFAULT 'solo',
  room_code          TEXT,
  UNIQUE(user_id, client_id)
);
CREATE INDEX IF NOT EXISTS idx_matches_user ON matches(user_id, played_at DESC);

CREATE TABLE IF NOT EXISTS friendships (
  id           SERIAL PRIMARY KEY,
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   TEXT NOT NULL DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')),
  UNIQUE(requester_id, addressee_id)
);

CREATE TABLE IF NOT EXISTS rooms (
  id         SERIAL PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  host_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'open',
  locked     INTEGER NOT NULL DEFAULT 0,
  bots       TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS room_players (
  room_id   INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seat      TEXT NOT NULL,
  ready     INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')),
  PRIMARY KEY (room_id, user_id),
  UNIQUE (room_id, seat)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  payload    TEXT NOT NULL DEFAULT '{}',
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read, created_at DESC);