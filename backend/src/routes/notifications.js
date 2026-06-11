import { Router } from 'express';
import { Notifs } from '../db.js';
import { requireAuth } from '../auth.js';

const r = Router();
r.use(requireAuth);

r.get('/notifications', (req, res) => {
  const rows = Notifs.list.all(req.user.id).map(n => ({ ...n, payload: JSON.parse(n.payload || '{}') }));
  res.json({ notifications: rows, unread: Notifs.unread.get(req.user.id).n });
});
r.post('/notifications/read', (req, res) => {
  if (req.body?.id) Notifs.markOne.run(req.body.id | 0, req.user.id);
  else Notifs.markAll.run(req.user.id);
  res.json({ ok: true });
});

export default r;
