import { Server } from 'socket.io';
import { verifyToken } from './auth.js';
import { Friends, Notifs } from './db.js';
import { matchFor, matchOfUser } from './match.js';

/**
 * Phase 3B socket layer.
 *
 * Client -> server:
 *   room:watch   (code)         join a room channel you belong to / host
 *   room:unwatch (code)
 *   spect:watch  (code)         watch a match as spectator (no hands ever sent)
 *   spect:unwatch(code)
 *   presence:set (status)       'online' | 'in_match'
 *   match:trump  ({code,suit}, ack)   choose trump (validated server-side)
 *   match:play   ({code,card}, ack)   play a card  (validated server-side)
 *   match:state  ({code})       request a fresh personalized snapshot (reconnect/resync)
 *   ping:rtt     (ts, ack)      latency probe — ack immediately
 *
 * Server -> client:
 *   user_connected / user_disconnected / presence    (friends)
 *   friends_changed                                  (refetch friends)
 *   notify {…notification}                           (notification center push)
 *   room_state / room_joined / room_left / player_ready / seat_changed / kicked / room_closed
 *   match_started {code}
 *   match_state   (personalized snapshot, seq-numbered)
 *   match_event   {type: dealing | trump_chosen | misdeal | round_start |
 *                        player_disconnected | player_reconnected | aborted}
 *   card_played / turn_changed / round_finished / collection_triggered / senior_changed / match_finished
 *   match_error   {error}       rejected invalid action
 */

let io = null;
const sockets = new Map();   // userId -> Set<socketId>
const presence = new Map();  // userId -> 'online' | 'in_match'

export function presenceOf(userId) { return presence.get(userId) || 'offline'; }
export function notifyUser(userId, event, payload) { if (io) io.to(`user:${userId}`).emit(event, payload); }
export function roomBroadcast(code, event, payload) { if (io) io.to(`room:${code}`).emit(event, payload); }
export function getIO() { return io; }

/** Persist + push a notification (notification center). */
export function pushNotification(userId, type, payload = {}) {
  const info = Notifs.create.run(userId, type, JSON.stringify(payload));
  notifyUser(userId, 'notify', {
    id: Number(info.lastInsertRowid), type, payload,
    read: 0, created_at: new Date().toISOString()
  });
}

function friendIdsOf(userId) {
  return Friends.listAccepted.all({ me: userId }).map(f => f.user_id);
}
function tellFriends(userId, event, payload) {
  for (const fid of friendIdsOf(userId)) notifyUser(fid, event, payload);
}

export function initSockets(httpServer) {
  io = new Server(httpServer, { cors: { origin: true } });

  io.use((socket, next) => {
    const payload = verifyToken(socket.handshake.auth?.token || '');
    if (!payload) return next(new Error('unauthorized'));
    socket.user = payload;
    next();
  });

  io.on('connection', (socket) => {
    const { id: userId, username } = socket.user;
    socket.join(`user:${userId}`);

    const set = sockets.get(userId) || new Set();
    set.add(socket.id);
    sockets.set(userId, set);
    if (set.size === 1) {
      presence.set(userId, 'online');
      tellFriends(userId, 'user_connected', { userId, username });
      tellFriends(userId, 'presence', { userId, status: 'online' });
    }

    /* ---- reconnect restore: if mid-match, rejoin channel + push state ---- */
    const live = matchOfUser(userId);
    if (live) {
      socket.join(`room:${live.code}`);
      live.markConnected(userId, true);
      socket.emit('match_started', { code: live.code });
      socket.emit('match_state', live.snapshot(userId));
      presence.set(userId, 'in_match');
      tellFriends(userId, 'presence', { userId, status: 'in_match' });
    }

    /* ---- channels ---- */
    socket.on('room:watch', c => socket.join(`room:${String(c).toUpperCase()}`));
    socket.on('room:unwatch', c => socket.leave(`room:${String(c).toUpperCase()}`));
    socket.on('spect:watch', c => {
      const code = String(c).toUpperCase();
      socket.join(`spect:${code}`);
      const m = matchFor(code);
      if (m) socket.emit('match_state', m.snapshot(null));
    });
    socket.on('spect:unwatch', c => socket.leave(`spect:${String(c).toUpperCase()}`));

    /* ---- presence ---- */
    socket.on('presence:set', (status) => {
      if (status !== 'online' && status !== 'in_match') return;
      presence.set(userId, status);
      tellFriends(userId, 'presence', { userId, status });
    });

    /* ---- latency probe ---- */
    socket.on('ping:rtt', (ts, ack) => { if (typeof ack === 'function') ack(ts); });

    /* ---- match actions: the server validates everything ---- */
    socket.on('match:trump', (data, ack) => {
      const m = matchFor(String(data?.code || '').toUpperCase());
      const seat = m && m.userSeat(userId);
      const res = !m ? { error: 'No such match.' }
        : !seat ? { error: 'You are not seated in this match.' }
        : m.applyTrump(seat, data.suit);
      if (res?.error) socket.emit('match_error', res);
      if (typeof ack === 'function') ack(res);
    });

    socket.on('match:play', (data, ack) => {
      const m = matchFor(String(data?.code || '').toUpperCase());
      const seat = m && m.userSeat(userId);
      const res = !m ? { error: 'No such match.' }
        : !seat ? { error: 'You are not seated in this match.' }
        : m.applyPlay(seat, data.card);
      if (res?.error) socket.emit('match_error', res);
      if (typeof ack === 'function') ack(res);
    });

    socket.on('match:state', (data) => {
      const m = matchFor(String(data?.code || '').toUpperCase());
      if (!m) return;
      socket.emit('match_state', m.userSeat(userId) ? m.snapshot(userId) : m.snapshot(null));
    });

    /* ---- disconnect ---- */
    socket.on('disconnect', () => {
      const s = sockets.get(userId);
      if (s) { s.delete(socket.id); if (!s.size) sockets.delete(userId); }
      if (!sockets.has(userId)) {
        presence.delete(userId);
        const m = matchOfUser(userId);
        if (m) m.markConnected(userId, false);   // seat reserved; timers keep the match alive
        tellFriends(userId, 'user_disconnected', { userId });
        tellFriends(userId, 'presence', { userId, status: 'offline' });
      }
    });
  });

  return io;
}
