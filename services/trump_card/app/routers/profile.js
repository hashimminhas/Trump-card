import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { stmts } from '../database/db.js';

const r = Router();

/* ── GET /api/profile ── own profile */
r.get('/profile', requireAuth, async (req, res) => {
  try {
    const user = await stmts.Users.byId.get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const { password_hash, reset_token, reset_expires, ...pub } = user;
    res.json({ user: pub });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── GET /api/profile/:username ── public profile */
r.get('/profile/:username', requireAuth, async (req, res) => {
  try {
    const user = await stmts.Users.byUsername.get(req.params.username);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const { password_hash, reset_token, reset_expires, email, ...pub } = user;
    res.json({ user: pub });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── GET /api/users/search?q= ── */
r.get('/users/search', requireAuth, async (req, res) => {
  const q = (req.query.q ?? '').trim();
  if (!q) return res.json({ users: [] });
  try {
    const users = await stmts.Users.search.all(`%${q}%`, req.user.id);
    res.json({ users: users.map(u => ({ id: u.id, username: u.username })) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── GET /api/match-history ── paginated */
r.get('/match-history', requireAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = parseInt(req.query.offset) || 0;
  try {
    const matches = await stmts.Matches.byUser.all(req.user.id, limit, offset);
    const total = await stmts.Matches.countByUser.get(req.user.id);
    res.json({ matches, total: total?.count ?? 0 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── GET /api/match-history/full ── all matches, no pagination */
r.get('/match-history/full', requireAuth, async (req, res) => {
  try {
    const matches = await stmts.Matches.byUser.all(req.user.id, 10000, 0);
    res.json({ matches });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── POST /api/matches ── save a single match */
r.post('/matches', requireAuth, async (req, res) => {
  const m = req.body;
  if (!m?.id) return res.status(400).json({ error: 'match id required.' });
  try {
    const exists = await stmts.Matches.byClientId.get(req.user.id, m.id);
    if (exists) return res.json({ ok: true, duplicate: true });
    await stmts.Matches.insert.run(
      req.user.id, m.id, m.result, m.score_ac, m.score_bd,
      m.stranded ? 1 : 0, m.trump,
      m.largest_collection ?? 0, m.collections_count ?? 0,
      m.duration_ms ?? null, m.difficulty ?? null,
      m.played_at ?? new Date().toISOString(),
      JSON.stringify(m), m.mode ?? 'solo', m.room_code ?? null
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── POST /api/matches/import ── bulk import */
r.post('/matches/import', requireAuth, async (req, res) => {
  const { records } = req.body ?? {};
  if (!Array.isArray(records)) return res.status(400).json({ error: 'records array required.' });
  let imported = 0;
  let skipped = 0;
  try {
    for (const m of records) {
      if (!m?.id) { skipped++; continue; }
      const exists = await stmts.Matches.byClientId.get(req.user.id, m.id);
      if (exists) { skipped++; continue; }
      await stmts.Matches.insert.run(
        req.user.id, m.id, m.result, m.score_ac, m.score_bd,
        m.stranded ? 1 : 0, m.trump,
        m.largest_collection ?? 0, m.collections_count ?? 0,
        m.duration_ms ?? null, m.difficulty ?? null,
        m.played_at ?? new Date().toISOString(),
        JSON.stringify(m), m.mode ?? 'solo', m.room_code ?? null
      );
      imported++;
    }
    res.json({ ok: true, imported, skipped });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

export default r;