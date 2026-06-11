import jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.EC_JWT_SECRET || 'dev-secret-change-me';
const EXPIRES = '30d';

export function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: EXPIRES });
}

export function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

/** Express middleware: requires `Authorization: Bearer <token>` */
export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  const payload = token && verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Not authenticated' });
  req.user = payload; // { id, username }
  next();
}
