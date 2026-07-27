import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { stmts } from '../database/db.js';

const JWT_SECRET = process.env.EC_JWT_SECRET || 'dev-secret';

// In-memory presence: userId -> Set of socketIds
const presence = new Map();
// In-memory room watches: code -> Set of socketIds
const roomWatchers = new Map();

function addPresence(userId, socketId) {
  if (!presence.has(userId)) presence.set(userId, new Set());
  presence.get(userId).add(socketId);
}

function removePresence(userId, socketId) {
  presence.get(userId)?.delete(socketId);
  if (presence.get(userId)?.size === 0) presence.delete(userId);
}

function isOnline(userId) {
  return (presence.get(userId)?.size ?? 0) > 0;
}

export function initSockets(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
  });

  // ── Auth middleware ──────────────────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token
        || socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) return next(new Error('No token'));
      const { id } = jwt.verify(token, JWT_SECRET);
      const user = await stmts.Users.byId.get(id);
      if (!user) return next(new Error('User not found'));
      socket.user = user;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // ── Connection ───────────────────────────────────────────────────────────────
  io.on('connection', async (socket) => {
    const { user } = socket;
    addPresence(user.id, socket.id);
    socket.join(`user:${user.id}`);

    // Broadcast online status to friends
    broadcastPresenceToFriends(io, user.id, 'online');

    // ── Presence ──────────────────────────────────────────────────────────────
    socket.on('presence:set', (status) => {
      socket.data.status = status;
      broadcastPresenceToFriends(io, user.id, status);
    });

    // ── Room watching ─────────────────────────────────────────────────────────
    socket.on('room:watch', (code) => {
      if (!roomWatchers.has(code)) roomWatchers.set(code, new Set());
      roomWatchers.get(code).add(socket.id);
      socket.join(`room:${code}`);
    });

    socket.on('room:unwatch', (code) => {
      roomWatchers.get(code)?.delete(socket.id);
      socket.leave(`room:${code}`);
    });

    // ── RTT ping ──────────────────────────────────────────────────────────────
    socket.on('ping:rtt', (cb) => {
      if (typeof cb === 'function') cb();
    });

    // ── Match events (trump, play) ────────────────────────────────────────────
    socket.on('match:trump', async (data) => {
      try {
        const rp = await stmts.RoomPlayers.byUser.get(user.id);
        if (!rp) return;
        io.to(`room:${rp.code}`).emit('match:trump', { userId: user.id, ...data });
      } catch (e) { console.error(e); }
    });

    socket.on('match:play', async (data) => {
      try {
        const rp = await stmts.RoomPlayers.byUser.get(user.id);
        if (!rp) return;
        io.to(`room:${rp.code}`).emit('match:play', { userId: user.id, ...data });
      } catch (e) { console.error(e); }
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      removePresence(user.id, socket.id);
      if (!isOnline(user.id)) {
        broadcastPresenceToFriends(io, user.id, 'offline');
      }
    });
  });

  return io;
}

async function broadcastPresenceToFriends(io, userId, status) {
  try {
    const friends = await stmts.Friendships.list.all(userId);
    for (const f of friends) {
      const friendId = f.friend_id ?? (f.requester_id === userId ? f.addressee_id : f.requester_id);
      io.to(`user:${friendId}`).emit('user_presence', { userId, status });
    }
  } catch (e) { console.error('[presence]', e); }
}

export function notifyUser(io, userId, event, data) {
  io.to(`user:${userId}`).emit(event, data);
}

export function notifyRoom(io, code, event, data) {
  io.to(`room:${code}`).emit(event, data);
}