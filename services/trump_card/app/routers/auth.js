import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { Users } from '../database/db.js';
import { signToken, requireAuth } from '../middleware/auth.js';

const r = Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

r.post('/register', (req, res) => {
  const { username, email, password } = req.body || {};
  if (!USERNAME_RE.test(username || ''))
    return res.status(400).json({ error: 'Username must be 3–20 letters, numbers, or underscores.' });
  if (!EMAIL_RE.test(email || ''))
    return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!password || password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (Users.byUsername.get(username))
    return res.status(409).json({ error: 'That username is taken.' });
  if (Users.byEmail.get(email))
    return res.status(409).json({ error: 'That email is already registered.' });

  const hash = bcrypt.hashSync(password, 10);
  const info = Users.create.run(username, email, hash);
  const user = Users.byId.get(info.lastInsertRowid);
  res.json({ token: signToken(user), user });
});

r.post('/login', (req, res) => {
  const { login, password } = req.body || {};
  const row = Users.byLogin.get(login || '', login || '');
  if (!row || !bcrypt.compareSync(password || '', row.password_hash))
    return res.status(401).json({ error: 'Wrong username/email or password.' });
  const user = { id: row.id, username: row.username, email: row.email, created_at: row.created_at };
  res.json({ token: signToken(user), user });
});

/* ---------- guest mode (Phase 3C) ----------
   A guest is a lightweight server identity: generated name, no email,
   no password, flagged is_guest. The silent JWT makes every existing
   system (sockets, rooms, authoritative matches, reconnect) work
   unchanged. Guest match history stays in the browser. */
r.post('/guest', (req, res) => {
  let username, tries = 0;
  do {
    username = 'Guest-' + String(Math.floor(10000 + Math.random() * 90000));
    tries++;
  } while (Users.byUsername.get(username) && tries < 50);
  if (Users.byUsername.get(username)) return res.status(500).json({ error: 'Could not allocate a guest id.' });
  const email = username.toLowerCase() + '@guest.local';      // satisfies UNIQUE NOT NULL, never used
  const hash = bcrypt.hashSync('guest:' + Math.random().toString(36), 6); // unusable password
  const info = Users.createGuest.run(username, email, hash);
  const user = Users.byId.get(info.lastInsertRowid);
  res.json({ token: signToken(user), user });
});

/* Convert a guest into a real account - same user id, so any room
   membership survives. The client then imports its local history. */
r.post('/guest/upgrade', requireAuth, (req, res) => {
  if (!req.user.isGuest) return res.status(400).json({ error: 'This account is not a guest.' });
  const { username, email, password } = req.body || {};
  if (!USERNAME_RE.test(username || ''))
    return res.status(400).json({ error: 'Username must be 3–20 letters, numbers, or underscores.' });
  if (!EMAIL_RE.test(email || ''))
    return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!password || password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  const u1 = Users.byUsername.get(username);
  if (u1 && u1.id !== req.user.id) return res.status(409).json({ error: 'That username is taken.' });
  if (Users.byEmail.get(email)) return res.status(409).json({ error: 'That email is already registered.' });
  const info = Users.upgradeGuest.run(username, email, bcrypt.hashSync(password, 10), req.user.id);
  if (!info.changes) return res.status(400).json({ error: 'Upgrade failed.' });
  const user = Users.byId.get(req.user.id);
  res.json({ token: signToken(user), user });
});

/* ---------- password reset (deferred from 3A) ----------
   Dev mode returns the reset link directly; production should
   email it instead (plug a provider into sendResetEmail). */
function sendResetEmail(user, link) {
  console.log(`[reset] ${user.email} -> ${link}`);
}

r.post('/forgot', (req, res) => {
  const u = Users.byEmail.get(String(req.body?.email || ''));
  // Always answer 200 - never reveal whether an email exists.
  if (u) {
    const token = crypto.randomBytes(24).toString('hex');
    const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    Users.setReset.run(token, expires, u.id);
    const link = `/reset/${token}`;
    sendResetEmail(u, link);
    if (process.env.NODE_ENV !== 'production') return res.json({ ok: true, devLink: link });
  }
  res.json({ ok: true });
});

r.post('/reset', (req, res) => {
  const { token, password } = req.body || {};
  if (!password || password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  const u = Users.byReset.get(String(token || ''));
  if (!u) return res.status(400).json({ error: 'Reset link is invalid or has expired.' });
  Users.setPassword.run(bcrypt.hashSync(password, 10), u.id);
  res.json({ ok: true });
});

r.get('/me', requireAuth, (req, res) => {
  const user = Users.byId.get(req.user.id);
  if (!user) return res.status(401).json({ error: 'Account no longer exists.' });
  res.json({ user });
});

export default r;
