import { Router } from 'express';
import { Users, Friends } from '../db.js';
import { requireAuth, rejectGuests } from '../auth.js';
import { presenceOf, notifyUser, pushNotification } from '../sockets.js';

const r = Router();
r.use(requireAuth);

r.get('/friends', rejectGuests, (req, res) => {
  const me = req.user.id;
  const friends = Friends.listAccepted.all({ me }).map(f => ({
    ...f, status: presenceOf(f.user_id)
  }));
  res.json({
    friends,
    incoming: Friends.listIncoming.all(me),
    outgoing: Friends.listOutgoing.all(me)
  });
});

r.post('/friends/request', rejectGuests, (req, res) => {
  const target = Users.byUsername.get(String(req.body?.username || ''));
  if (!target) return res.status(404).json({ error: 'No such user.' });
  if (target.id === req.user.id) return res.status(400).json({ error: "You can't befriend yourself." });
  const existing = Friends.between.get({ a: req.user.id, b: target.id });
  if (existing) {
    return res.status(409).json({
      error: existing.status === 'accepted' ? 'Already friends.' : 'A request already exists between you.'
    });
  }
  Friends.create.run(req.user.id, target.id);
  notifyUser(target.id, 'friends_changed', {});
  pushNotification(target.id, 'friend_request', { from: req.user.username });
  res.json({ ok: true });
});

r.post('/friends/accept', rejectGuests, (req, res) => {
  const f = Friends.byId.get(req.body?.id | 0);
  if (!f || f.addressee_id !== req.user.id || f.status !== 'pending')
    return res.status(404).json({ error: 'No such pending request.' });
  Friends.accept.run(f.id, req.user.id);
  notifyUser(f.requester_id, 'friends_changed', {});
  pushNotification(f.requester_id, 'friend_accepted', { from: req.user.username });
  res.json({ ok: true });
});

r.delete('/friends/:id', rejectGuests, (req, res) => {
  const f = Friends.byId.get(req.params.id | 0);
  if (!f) return res.status(404).json({ error: 'Not found.' });
  const info = Friends.remove.run(f.id, req.user.id, req.user.id);
  if (!info.changes) return res.status(403).json({ error: 'Not yours to remove.' });
  notifyUser(f.requester_id === req.user.id ? f.addressee_id : f.requester_id, 'friends_changed', {});
  res.json({ ok: true });
});

export default r;
