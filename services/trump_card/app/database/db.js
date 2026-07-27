/**
 * db.js — dual-mode database layer
 * SQLite  : when DATABASE_URL is absent  → EC2 / local dev
 * PostgreSQL : when DATABASE_URL is set  → EKS + RDS
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import { migrate } from './migrate.js';

const here = dirname(fileURLToPath(import.meta.url));
const USE_PG = !!process.env.DATABASE_URL;

// ─── PostgreSQL ───────────────────────────────────────────────────────────────
let pool = null;
if (USE_PG) {
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
  });
  const schema = readFileSync(join(here, 'schema.pg.sql'), 'utf8');
  await pool.query(schema);
  console.log('[db] PostgreSQL (RDS) connected');
}

// ─── SQLite ───────────────────────────────────────────────────────────────────
let sqlite = null;
if (!USE_PG) {
  const dbPath = process.env.EC_DB || join(here, '..', '..', 'electron-card.db');
  sqlite = new DatabaseSync(dbPath);
  sqlite.exec('PRAGMA journal_mode = WAL');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
  migrate(sqlite);
  console.log('[db] SQLite connected:', dbPath);
}

// ─── Convert ? to $1 $2 for PostgreSQL ───────────────────────────────────────
function toPositional(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// ─── Core async helpers ───────────────────────────────────────────────────────
export async function query(sql, params = []) {
  if (USE_PG) {
    const { rows } = await pool.query(toPositional(sql), params);
    return rows;
  }
  return sqlite.prepare(sql).all(...params);
}

export async function queryOne(sql, params = []) {
  if (USE_PG) {
    const { rows } = await pool.query(toPositional(sql), params);
    return rows[0] ?? null;
  }
  return sqlite.prepare(sql).get(...params) ?? null;
}

export async function run(sql, params = []) {
  if (USE_PG) {
    const pgSql = /^\s*INSERT/i.test(sql) && !/RETURNING/i.test(sql)
      ? toPositional(sql) + ' RETURNING id'
      : toPositional(sql);
    const result = await pool.query(pgSql, params);
    return { lastInsertRowid: result.rows[0]?.id ?? null, changes: result.rowCount };
  }
  const info = sqlite.prepare(sql).run(...params);
  return { lastInsertRowid: info.lastInsertRowid, changes: info.changes };
}

export async function tx(fn) {
  if (USE_PG) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const origQuery = pool.query.bind(pool);
      pool.query = (...args) => client.query(...args);
      const result = await fn();
      pool.query = origQuery;
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  sqlite.exec('BEGIN');
  try {
    const result = await fn();
    sqlite.exec('COMMIT');
    return result;
  } catch (e) {
    sqlite.exec('ROLLBACK');
    throw e;
  }
}

// ─── stmts — async wrappers matching original API ────────────────────────────
export const stmts = {
  Users: {
    create:      { run: (u, e, h, g) => run(`INSERT INTO users(username,email,password_hash,is_guest) VALUES(?,?,?,?)`, [u, e, h, g ?? 0]) },
    byId:        { get: (id) => queryOne(`SELECT * FROM users WHERE id = ?`, [id]) },
    byLogin:     { get: (l) => queryOne(`SELECT * FROM users WHERE lower(username) = lower(?) OR lower(email) = lower(?)`, [l, l]) },
    byUsername:  { get: (u) => queryOne(`SELECT * FROM users WHERE lower(username) = lower(?)`, [u]) },
    byEmail:     { get: (e) => queryOne(`SELECT * FROM users WHERE lower(email) = lower(?)`, [e]) },
    byReset:     { get: (t) => queryOne(`SELECT * FROM users WHERE reset_token = ?`, [t]) },
    setReset:    { run: (t, ex, id) => run(`UPDATE users SET reset_token=?,reset_expires=? WHERE id=?`, [t, ex, id]) },
    clearReset:  { run: (h, id) => run(`UPDATE users SET password_hash=?,reset_token=NULL,reset_expires=NULL WHERE id=?`, [h, id]) },
    upgradeGuest:{ run: (u, e, h, id) => run(`UPDATE users SET username=?,email=?,password_hash=?,is_guest=0 WHERE id=?`, [u, e, h, id]) },
    search:      { all: (q, myId) => query(`SELECT id,username FROM users WHERE lower(username) LIKE lower(?) AND id != ? AND is_guest=0 LIMIT 20`, [q, myId]) },
  },
  Matches: {
    insert:      { run: (uid, cid, res, sac, sbd, str, tr, lc, cc, dur, diff, pa, data, mode, rc) =>
                     run(`INSERT INTO matches(user_id,client_id,result,score_ac,score_bd,stranded,trump,largest_collection,collections_count,duration_ms,difficulty,played_at,data,mode,room_code) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                         [uid, cid, res, sac, sbd, str, tr, lc, cc, dur, diff, pa, data, mode, rc]) },
    byUser:      { all: (uid, lim, off) => query(`SELECT * FROM matches WHERE user_id=? ORDER BY played_at DESC LIMIT ? OFFSET ?`, [uid, lim, off]) },
    countByUser: { get: (uid) => queryOne(`SELECT COUNT(*) as count FROM matches WHERE user_id=?`, [uid]) },
    byClientId:  { get: (uid, cid) => queryOne(`SELECT id FROM matches WHERE user_id=? AND client_id=?`, [uid, cid]) },
  },
  Friendships: {
    create:      { run: (rid, aid) => run(`INSERT INTO friendships(requester_id,addressee_id) VALUES(?,?)`, [rid, aid]) },
    accept:      { run: (id) => run(`UPDATE friendships SET status='accepted' WHERE id=?`, [id]) },
    remove:      { run: (id) => run(`DELETE FROM friendships WHERE id=?`, [id]) },
    between:     { get: (a, b) => queryOne(`SELECT * FROM friendships WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)`, [a, b, b, a]) },
    pending:     { all: (uid) => query(`SELECT f.*,u.username as requester_name FROM friendships f JOIN users u ON u.id=f.requester_id WHERE f.addressee_id=? AND f.status='pending'`, [uid]) },
    list:        { all: (uid) => query(`SELECT f.*,u.username,u.id as friend_id FROM friendships f JOIN users u ON u.id=CASE WHEN f.requester_id=? THEN f.addressee_id ELSE f.requester_id END WHERE (f.requester_id=? OR f.addressee_id=?) AND f.status='accepted'`, [uid, uid, uid]) },
  },
  Rooms: {
    create:      { run: (code, hid) => run(`INSERT INTO rooms(code,host_id) VALUES(?,?)`, [code, hid]) },
    byCode:      { get: (c) => queryOne(`SELECT * FROM rooms WHERE code=?`, [c]) },
    byId:        { get: (id) => queryOne(`SELECT * FROM rooms WHERE id=?`, [id]) },
    close:       { run: (id) => run(`UPDATE rooms SET status='closed' WHERE id=?`, [id]) },
    setLocked:   { run: (l, id) => run(`UPDATE rooms SET locked=? WHERE id=?`, [l, id]) },
    setBots:     { run: (b, id) => run(`UPDATE rooms SET bots=? WHERE id=?`, [b, id]) },
    transferHost:{ run: (uid, id) => run(`UPDATE rooms SET host_id=? WHERE id=?`, [uid, id]) },
  },
  RoomPlayers: {
    join:        { run: (rid, uid, seat) => run(`INSERT INTO room_players(room_id,user_id,seat) VALUES(?,?,?) ON CONFLICT DO NOTHING`, [rid, uid, seat]) },
    leave:       { run: (rid, uid) => run(`DELETE FROM room_players WHERE room_id=? AND user_id=?`, [rid, uid]) },
    setReady:    { run: (r, rid, uid) => run(`UPDATE room_players SET ready=? WHERE room_id=? AND user_id=?`, [r, rid, uid]) },
    changeSeat:  { run: (s, rid, uid) => run(`UPDATE room_players SET seat=? WHERE room_id=? AND user_id=?`, [s, rid, uid]) },
    list:        { all: (rid) => query(`SELECT rp.*,u.username FROM room_players rp JOIN users u ON u.id=rp.user_id WHERE rp.room_id=?`, [rid]) },
    bySeat:      { get: (rid, seat) => queryOne(`SELECT * FROM room_players WHERE room_id=? AND seat=?`, [rid, seat]) },
    byUser:      { get: (uid) => queryOne(`SELECT rp.*,r.code FROM room_players rp JOIN rooms r ON r.id=rp.room_id WHERE rp.user_id=? AND r.status='open'`, [uid]) },
  },
  Notifications: {
    create:      { run: (uid, type, payload) => run(`INSERT INTO notifications(user_id,type,payload) VALUES(?,?,?)`, [uid, type, payload]) },
    list:        { all: (uid) => query(`SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50`, [uid]) },
    markRead:    { run: (id, uid) => run(`UPDATE notifications SET read=1 WHERE id=? AND user_id=?`, [id, uid]) },
    markAllRead: { run: (uid) => run(`UPDATE notifications SET read=1 WHERE user_id=?`, [uid]) },
    unread:      { get: (uid) => queryOne(`SELECT COUNT(*) as n FROM notifications WHERE user_id=? AND read=0`, [uid]) },
  },
};

// Legacy named exports some files may use
export const Notifs = stmts.Notifications;
export const db = sqlite;

export default { query, queryOne, run, tx, stmts };