import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { stmts } from '../database/db.js';

const r = Router();
r.use(requireAuth);

/* ── GET /api/friends ── */
r.get('/friends', async (req, res) => {
  try {
    const friends = await stmts.Friendships.list.all(req.user.id);
    const pending = await stmts.Friendships.pending.all(req.user.id);
    res.json({ friends, pending });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── POST /api/friends/request ── */
r.post('/friends/request', async (req, res) => {
  const { username } = req.body ?? {};
  if (!username) return res.status(400).json({ error: 'username required.' });
  try {
    const target = await stmts.Users.byUsername.get(username);
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'Cannot friend yourself.' });

    const existing = await stmts.Friendships.between.get(req.user.id, target.id);
    if (existing) return res.status(409).json({ error: 'Request already exists.' });

    await stmts.Friendships.create.run(req.user.id, target.id);
    await stmts.Notifications.create.run(
      target.id, 'friend_request',
      JSON.stringify({ from: req.user.id, username: req.user.username })
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── POST /api/friends/accept ── */
r.post('/friends/accept', async (req, res) => {
  const { id } = req.body ?? {};
  if (!id) return res.status(400).json({ error: 'id required.' });
  try {
    const friendship = await stmts.Friendships.between.get(req.user.id, id);
    if (!friendship || friendship.addressee_id !== req.user.id)
      return res.status(403).json({ error: 'Not authorized.' });
    await stmts.Friendships.accept.run(friendship.id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── DELETE /api/friends/:id ── */
r.delete('/friends/:id', async (req, res) => {
  try {
    const friendship = await stmts.Friendships.between.get(req.user.id, parseInt(req.params.id));
    if (!friendship) return res.status(404).json({ error: 'Friendship not found.' });
    if (friendship.requester_id !== req.user.id && friendship.addressee_id !== req.user.id)
      return res.status(403).json({ error: 'Not authorized.' });
    await stmts.Friendships.remove.run(friendship.id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

export default r;