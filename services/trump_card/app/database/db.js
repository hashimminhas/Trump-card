import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { migrate } from './migrate.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.EC_DB || join(here, '..', '..', 'electron-card.db');

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
migrate(db); // apply 3B migrations before any statements are prepared

/** Run fn inside a transaction. */
export function tx(fn) {
  db.exec('BEGIN');
  try { const out = fn(); db.exec('COMMIT'); return out; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

/* ---------- users ---------- */
export const Users = {
  create: db.prepare(`INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)`),
  byUsername: db.prepare(`SELECT * FROM users WHERE username = ?`),
  byEmail: db.prepare(`SELECT * FROM users WHERE email = ?`),
  byId: db.prepare(`SELECT id, username, email, created_at, is_guest FROM users WHERE id = ?`),
  byLogin: db.prepare(`SELECT * FROM users WHERE username = ? OR email = ?`),
  search: db.prepare(`SELECT id, username, created_at FROM users WHERE username LIKE ? AND is_guest = 0 LIMIT 10`),
  createGuest: db.prepare(`INSERT INTO users (username, email, password_hash, is_guest) VALUES (?, ?, ?, 1)`),
  upgradeGuest: db.prepare(`UPDATE users SET username = ?, email = ?, password_hash = ?, is_guest = 0 WHERE id = ? AND is_guest = 1`),
  setReset: db.prepare(`UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?`),
  byReset: db.prepare(`SELECT * FROM users WHERE reset_token = ? AND reset_expires > datetime('now')`),
  setPassword: db.prepare(`UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?`)
};

/* ---------- matches ---------- */
export const Matches = {
  insert: db.prepare(`
    INSERT OR IGNORE INTO matches
      (user_id, client_id, result, score_ac, score_bd, stranded, trump,
       largest_collection, collections_count, duration_ms, difficulty, played_at, data, mode, room_code)
    VALUES (@user_id, @client_id, @result, @score_ac, @score_bd, @stranded, @trump,
            @largest_collection, @collections_count, @duration_ms, @difficulty, @played_at, @data, @mode, @room_code)`),
  listByUser: db.prepare(`
    SELECT id, client_id, result, score_ac, score_bd, stranded, trump,
           largest_collection, collections_count, duration_ms, difficulty, played_at
    FROM matches WHERE user_id = ? ORDER BY played_at DESC LIMIT 200`),
  fullByUser: db.prepare(`SELECT data FROM matches WHERE user_id = ? ORDER BY played_at DESC LIMIT 200`),
  one: db.prepare(`SELECT * FROM matches WHERE id = ? AND user_id = ?`),
  stats: db.prepare(`
    SELECT COUNT(*) AS matches,
           SUM(CASE WHEN result != 'DRAW' THEN 1 ELSE 0 END) AS khoti,
           SUM(CASE WHEN result = 'KHOTI_AC' THEN 1 ELSE 0 END) AS my_wins,
           SUM(CASE WHEN result = 'DRAW' THEN 1 ELSE 0 END) AS draws,
           MAX(largest_collection) AS largest_collection,
           SUM(collections_count) AS total_collections,
           AVG(duration_ms) AS avg_duration
    FROM matches WHERE user_id = ?`),
  favoriteTrump: db.prepare(`
    SELECT trump, COUNT(*) AS n FROM matches WHERE user_id = ?
    GROUP BY trump ORDER BY n DESC LIMIT 1`)
};

/* ---------- friendships ---------- */
export const Friends = {
  between: db.prepare(`
    SELECT * FROM friendships
    WHERE (requester_id = @a AND addressee_id = @b) OR (requester_id = @b AND addressee_id = @a)`),
  create: db.prepare(`INSERT INTO friendships (requester_id, addressee_id) VALUES (?, ?)`),
  accept: db.prepare(`UPDATE friendships SET status = 'accepted' WHERE id = ? AND addressee_id = ?`),
  remove: db.prepare(`DELETE FROM friendships WHERE id = ? AND (requester_id = ? OR addressee_id = ?)`),
  byId: db.prepare(`SELECT * FROM friendships WHERE id = ?`),
  listAccepted: db.prepare(`
    SELECT f.id AS friendship_id, u.id AS user_id, u.username
    FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.requester_id = @me THEN f.addressee_id ELSE f.requester_id END
    WHERE (f.requester_id = @me OR f.addressee_id = @me) AND f.status = 'accepted'`),
  listIncoming: db.prepare(`
    SELECT f.id AS friendship_id, u.id AS user_id, u.username
    FROM friendships f JOIN users u ON u.id = f.requester_id
    WHERE f.addressee_id = ? AND f.status = 'pending'`),
  listOutgoing: db.prepare(`
    SELECT f.id AS friendship_id, u.id AS user_id, u.username
    FROM friendships f JOIN users u ON u.id = f.addressee_id
    WHERE f.requester_id = ? AND f.status = 'pending'`)
};

/* ---------- rooms ---------- */
export const Rooms = {
  create: db.prepare(`INSERT INTO rooms (code, host_id) VALUES (?, ?)`),
  byCode: db.prepare(`SELECT * FROM rooms WHERE code = ?`),
  close: db.prepare(`UPDATE rooms SET status = 'closed' WHERE id = ?`),
  setHost: db.prepare(`UPDATE rooms SET host_id = ? WHERE id = ?`),
  players: db.prepare(`
    SELECT rp.seat, rp.ready, u.id AS user_id, u.username, u.is_guest
    FROM room_players rp JOIN users u ON u.id = rp.user_id
    WHERE rp.room_id = ? ORDER BY rp.seat`),
  addPlayer: db.prepare(`INSERT INTO room_players (room_id, user_id, seat) VALUES (?, ?, ?)`),
  removePlayer: db.prepare(`DELETE FROM room_players WHERE room_id = ? AND user_id = ?`),
  playerIn: db.prepare(`SELECT * FROM room_players WHERE room_id = ? AND user_id = ?`),
  setReady: db.prepare(`UPDATE room_players SET ready = ? WHERE room_id = ? AND user_id = ?`),
  anyRoomOf: db.prepare(`
    SELECT r.* FROM rooms r JOIN room_players rp ON rp.room_id = r.id
    WHERE rp.user_id = ? AND r.status IN ('open','playing')`),
  setLocked: db.prepare(`UPDATE rooms SET locked = ? WHERE id = ?`),
  setBots: db.prepare(`UPDATE rooms SET bots = ? WHERE id = ?`),
  setStatus: db.prepare(`UPDATE rooms SET status = ? WHERE id = ?`),
  setSeat: db.prepare(`UPDATE room_players SET seat = ?, ready = 0 WHERE room_id = ? AND user_id = ?`)
};

/* ---------- notifications ---------- */
export const Notifs = {
  create: db.prepare(`INSERT INTO notifications (user_id, type, payload) VALUES (?, ?, ?)`),
  list: db.prepare(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 40`),
  unread: db.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0`),
  markAll: db.prepare(`UPDATE notifications SET read = 1 WHERE user_id = ?`),
  markOne: db.prepare(`UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`)
};
