/* Phase 3B migrations - idempotent; runs from db.js BEFORE statements are prepared. */
export function migrate(db) {
  const hasColumn = (table, col) =>
    db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col);

  if (!hasColumn('users', 'is_guest')) db.exec(`ALTER TABLE users ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0`);
  if (!hasColumn('users', 'reset_token')) db.exec(`ALTER TABLE users ADD COLUMN reset_token TEXT`);
  if (!hasColumn('users', 'reset_expires')) db.exec(`ALTER TABLE users ADD COLUMN reset_expires TEXT`);
  if (!hasColumn('rooms', 'locked')) db.exec(`ALTER TABLE rooms ADD COLUMN locked INTEGER NOT NULL DEFAULT 0`);
  if (!hasColumn('rooms', 'bots')) db.exec(`ALTER TABLE rooms ADD COLUMN bots TEXT NOT NULL DEFAULT '{}'`);
  if (!hasColumn('matches', 'mode')) db.exec(`ALTER TABLE matches ADD COLUMN mode TEXT NOT NULL DEFAULT 'solo'`);
  if (!hasColumn('matches', 'room_code')) db.exec(`ALTER TABLE matches ADD COLUMN room_code TEXT`);

  db.exec(`CREATE TABLE IF NOT EXISTS notifications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    payload    TEXT NOT NULL DEFAULT '{}',
    read       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read, created_at DESC)`);
}
