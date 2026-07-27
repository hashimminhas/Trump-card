import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { stmts } from '../database/db.js';

const r = Router();
const JWT_SECRET = process.env.EC_JWT_SECRET || 'dev-secret';
const sign = (id) => jwt.sign({ id }, JWT_SECRET, { expiresIn: '30d' });

/* ── helpers ── */
function safe(u) {
  const { password_hash, reset_token, reset_expires, ...pub } = u;
  return pub;
}

/* ── POST /api/register ── */
r.post('/register', async (req, res) => {
  const { username, email, password } = req.body ?? {};
  if (!username || !email || !password)
    return res.status(400).json({ error: 'username, email and password are required.' });
  if (username.length < 3 || username.length > 20)
    return res.status(400).json({ error: 'Username must be 3–20 characters.' });
  if (!/^[a-zA-Z0-9_]+$/.test(username))
    return res.status(400).json({ error: 'Username may only contain letters, digits and underscores.' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  try {
    if (await stmts.Users.byUsername.get(username))
      return res.status(409).json({ error: 'Username already taken.' });
    if (await stmts.Users.byEmail.get(email))
      return res.status(409).json({ error: 'Email already registered.' });

    const hash = await bcrypt.hash(password, 10);
    const { lastInsertRowid } = await stmts.Users.create.run(username, email, hash, 0);
    const user = await stmts.Users.byId.get(lastInsertRowid);
    res.status(201).json({ token: sign(user.id), user: safe(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── POST /api/login ── */
r.post('/login', async (req, res) => {
  const { login, password } = req.body ?? {};
  if (!login || !password)
    return res.status(400).json({ error: 'login and password are required.' });

  try {
    const user = await stmts.Users.byLogin.get(login);
    if (!user) return res.status(401).json({ error: 'Invalid credentials.' });
    if (user.is_guest) return res.status(401).json({ error: 'Guest accounts cannot log in with a password.' });
    if (!await bcrypt.compare(password, user.password_hash))
      return res.status(401).json({ error: 'Invalid credentials.' });
    res.json({ token: sign(user.id), user: safe(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── GET /api/me ── */
r.get('/me', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { id } = jwt.verify(auth.slice(7), JWT_SECRET);
    const user = await stmts.Users.byId.get(id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ user: safe(user) });
  } catch {
    res.status(401).json({ error: 'Invalid token.' });
  }
});

/* ── POST /api/forgot ── */
r.post('/forgot', async (req, res) => {
  const { email } = req.body ?? {};
  if (!email) return res.status(400).json({ error: 'email is required.' });
  try {
    const user = await stmts.Users.byEmail.get(email);
    if (!user) return res.json({ ok: true });
    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + 3600_000).toISOString();
    await stmts.Users.setReset.run(token, expires, user.id);
    console.log(`[forgot] reset token for ${email}: ${token}`);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── POST /api/reset ── */
r.post('/reset', async (req, res) => {
  const { token, password } = req.body ?? {};
  if (!token || !password) return res.status(400).json({ error: 'token and password are required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  try {
    const user = await stmts.Users.byReset.get(token);
    if (!user || new Date(user.reset_expires) < new Date())
      return res.status(400).json({ error: 'Invalid or expired reset token.' });
    const hash = await bcrypt.hash(password, 10);
    await stmts.Users.clearReset.run(hash, user.id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── POST /api/guest ── */
r.post('/guest', async (req, res) => {
  try {
    const username = 'Guest-' + Math.floor(Math.random() * 90000 + 10000);
    const email = `${username.toLowerCase()}@guest.local`;
    const hash = await bcrypt.hash(crypto.randomUUID(), 4);
    const { lastInsertRowid } = await stmts.Users.create.run(username, email, hash, 1);
    const user = await stmts.Users.byId.get(lastInsertRowid);
    res.status(201).json({ token: sign(user.id), user: safe(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── POST /api/guest/upgrade ── */
r.post('/guest/upgrade', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });
  const { username, email, password } = req.body ?? {};
  if (!username || !email || !password)
    return res.status(400).json({ error: 'username, email and password are required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  try {
    const { id } = jwt.verify(auth.slice(7), JWT_SECRET);
    const user = await stmts.Users.byId.get(id);
    if (!user || !user.is_guest) return res.status(400).json({ error: 'Not a guest account.' });

    if (await stmts.Users.byUsername.get(username))
      return res.status(409).json({ error: 'Username already taken.' });
    if (await stmts.Users.byEmail.get(email))
      return res.status(409).json({ error: 'Email already registered.' });

    const hash = await bcrypt.hash(password, 10);
    await stmts.Users.upgradeGuest.run(username, email, hash, id);
    const updated = await stmts.Users.byId.get(id);
    res.json({ token: sign(id), user: safe(updated) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

export default r;