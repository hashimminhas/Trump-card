import { Router } from 'express';
import { Users, Matches } from '../database/db.js';
import { requireAuth, rejectGuests } from '../middleware/auth.js';

const r = Router();

function statsFor(userId) {
  const s = Matches.stats.get(userId) || {};
  const fav = Matches.favoriteTrump.get(userId);
  const matches = s.matches || 0;
  return {
    matches,
    khoti: s.khoti || 0,
    myWins: s.my_wins || 0,
    draws: s.draws || 0,
    winPct: matches ? Math.round(((s.my_wins || 0) / matches) * 100) : 0,
    favoriteTrump: fav ? fav.trump : null,
    largestCollection: s.largest_collection || 0,
    totalCollections: s.total_collections || 0,
    avgDurationMs: s.avg_duration ? Math.round(s.avg_duration) : null
  };
}

/* Own profile */
r.get('/profile', requireAuth, (req, res) => {
  const user = Users.byId.get(req.user.id);
  res.json({ user, stats: statsFor(req.user.id) });
});

/* Public profile by username */
r.get('/profile/:username', requireAuth, (req, res) => {
  const u = Users.byUsername.get(req.params.username);
  if (!u) return res.status(404).json({ error: 'No such user.' });
  res.json({
    user: { id: u.id, username: u.username, created_at: u.created_at },
    stats: statsFor(u.id)
  });
});

/* User search (for friends) */
r.get('/users/search', requireAuth, (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ users: [] });
  const users = Users.search.all(`%${q}%`).filter(u => u.id !== req.user.id);
  res.json({ users });
});

/* ---------- Cloud save ---------- */

/* Lightweight history list */
r.get('/match-history', requireAuth, (req, res) => {
  res.json({ matches: Matches.listByUser.all(req.user.id) });
});

/* Full records (the game seeds its local cache from this) */
r.get('/match-history/full', requireAuth, (req, res) => {
  const rows = Matches.fullByUser.all(req.user.id);
  res.json({ records: rows.map(x => JSON.parse(x.data)) });
});

/* Save one completed match record (idempotent on client_id) */
r.post('/matches', requireAuth, rejectGuests, (req, res) => {
  const rec = req.body;
  if (!rec || !rec.id || !rec.result || !rec.score || !Array.isArray(rec.rounds))
    return res.status(400).json({ error: 'Malformed match record.' });
  const cols = Array.isArray(rec.collections) ? rec.collections : [];
  Matches.insert.run({
    user_id: req.user.id,
    client_id: String(rec.id),
    result: String(rec.result),
    score_ac: rec.score.AC | 0,
    score_bd: rec.score.BD | 0,
    stranded: rec.score.stranded | 0,
    trump: String(rec.trump || '?'),
    largest_collection: cols.length ? Math.max(...cols.map(c => c.cards | 0)) : 0,
    collections_count: cols.length,
    duration_ms: rec.durationMs ?? null,
    difficulty: rec.difficulty ?? null,
    played_at: rec.date || new Date().toISOString(),
    data: JSON.stringify(rec),
    mode: rec.mode === 'online' ? 'online' : 'solo',
    room_code: rec.roomCode || null
  });
  res.json({ ok: true });
});

/* Bulk import (one-time sync of pre-account localStorage history) */
r.post('/matches/import', requireAuth, rejectGuests, (req, res) => {
  const records = Array.isArray(req.body?.records) ? req.body.records : [];
  let saved = 0;
  for (const rec of records.slice(0, 500)) {
    if (!rec?.id || !rec?.result || !rec?.score || !Array.isArray(rec?.rounds)) continue;
    const cols = Array.isArray(rec.collections) ? rec.collections : [];
    const info = Matches.insert.run({
      user_id: req.user.id,
      client_id: String(rec.id),
      result: String(rec.result),
      score_ac: rec.score.AC | 0,
      score_bd: rec.score.BD | 0,
      stranded: rec.score.stranded | 0,
      trump: String(rec.trump || '?'),
      largest_collection: cols.length ? Math.max(...cols.map(c => c.cards | 0)) : 0,
      collections_count: cols.length,
      duration_ms: rec.durationMs ?? null,
      difficulty: rec.difficulty ?? null,
      played_at: rec.date || new Date().toISOString(),
      data: JSON.stringify(rec),
      mode: rec.mode === 'online' ? 'online' : 'solo',
      room_code: rec.roomCode || null
    });
    saved += info.changes;
  }
  res.json({ ok: true, saved });
});

export default r;
