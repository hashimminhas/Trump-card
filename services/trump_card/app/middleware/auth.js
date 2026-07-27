import jwt from 'jsonwebtoken';
import { stmts } from '../database/db.js';

const JWT_SECRET = process.env.EC_JWT_SECRET || 'dev-secret';

export async function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { id } = jwt.verify(auth.slice(7), JWT_SECRET);
    const user = await stmts.Users.byId.get(id);
    if (!user) return res.status(401).json({ error: 'User not found.' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token.' });
  }
}