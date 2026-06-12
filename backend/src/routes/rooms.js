import { Router } from 'express';
import { tx, Rooms, Users } from '../db.js';
import { requireAuth } from '../auth.js';
import { roomBroadcast, notifyUser, pushNotification, getIO } from '../sockets.js';
import { Match, matchFor } from '../match.js';
import { SEATS } from '../gameEngine.js';

const r = Router();
r.use(requireAuth);

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  let c = '';
  for (let i = 0; i < 6; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}
const SEAT_ORDER = ['A', 'C', 'B', 'D'];
const botsOf = room => { try { return JSON.parse(room.bots || '{}'); } catch { return {}; } };

export function roomState(room) {
  const players = Rooms.players.all(room.id);
  const bots = botsOf(room);
  return {
    code: room.code,
    status: room.status,
    locked: !!room.locked,
    hostId: room.host_id,
    players: players.map(p => ({
      userId: p.user_id, username: p.username, seat: p.seat,
      ready: !!p.ready, isHost: p.user_id === room.host_id, guest: !!p.is_guest
    })),
    bots,
    inMatch: !!matchFor(room.code)
  };
}
const sync = room => roomBroadcast(room.code, 'room_state', roomState(room));

function leaveCurrentRoom(userId) {
  const cur = Rooms.anyRoomOf.get(userId);
  if (!cur) return;
  if (cur.status === 'playing') return; // can't leave a live match's room record (seat reserved)
  Rooms.removePlayer.run(cur.id, userId);
  const left = Rooms.players.all(cur.id);
  if (!left.length) Rooms.close.run(cur.id);
  else if (cur.host_id === userId) Rooms.setHost.run(left[0].user_id, cur.id);
  const fresh = Rooms.byCode.get(cur.code);
  if (fresh && fresh.status !== 'closed') { sync(fresh); roomBroadcast(cur.code, 'room_left', { userId }); }
}

/* ---------- create / join / leave / get ---------- */
r.post('/room/create', (req, res) => {
  leaveCurrentRoom(req.user.id);
  const code = tx(() => {
    let c; for (;;) { c = newCode(); if (!Rooms.byCode.get(c)) break; }
    const info = Rooms.create.run(c, req.user.id);
    Rooms.addPlayer.run(info.lastInsertRowid, req.user.id, 'A');
    return c;
  });
  res.json({ room: roomState(Rooms.byCode.get(code)) });
});

r.post('/room/join', (req, res) => {
  const code = String(req.body?.code || '').toUpperCase().trim();
  const room = Rooms.byCode.get(code);
  if (!room || room.status === 'closed') return res.status(404).json({ error: 'No open room with that code.' });
  const already = Rooms.playerIn.get(room.id, req.user.id);
  if (room.status === 'playing' && !already) return res.status(409).json({ error: 'Match in progress — join as spectator instead.' });
  if (!already) {
    const players = Rooms.players.all(room.id);
    const bots = botsOf(room);
    const taken = new Set([...players.map(p => p.seat), ...Object.keys(bots)]);
    const seat = SEAT_ORDER.find(s => !taken.has(s));
    if (!seat) return res.status(409).json({ error: 'Room is full.' });
    leaveCurrentRoom(req.user.id);
    Rooms.addPlayer.run(room.id, req.user.id, seat);
  }
  const state = roomState(room);
  sync(room);
  roomBroadcast(code, 'room_joined', { userId: req.user.id, username: req.user.username });
  res.json({ room: state });
});

r.get('/room/:code', (req, res) => {
  const room = Rooms.byCode.get(String(req.params.code).toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found.' });
  res.json({ room: roomState(room) });
});

r.post('/room/leave', (req, res) => {
  leaveCurrentRoom(req.user.id);
  res.json({ ok: true });
});

r.post('/room/ready', (req, res) => {
  const room = Rooms.anyRoomOf.get(req.user.id);
  if (!room || room.status !== 'open') return res.status(404).json({ error: 'You are not in an open room.' });
  Rooms.setReady.run(req.body?.ready ? 1 : 0, room.id, req.user.id);
  sync(room);
  roomBroadcast(room.code, 'player_ready', { userId: req.user.id, ready: !!req.body?.ready });
  res.json({ room: roomState(room) });
});

/* ---------- manual seat selection ---------- */
r.post('/room/seat', (req, res) => {
  const room = Rooms.anyRoomOf.get(req.user.id);
  if (!room || room.status !== 'open') return res.status(404).json({ error: 'You are not in an open room.' });
  if (room.locked && room.host_id !== req.user.id) return res.status(403).json({ error: 'Seats are locked by the host.' });
  const seat = String(req.body?.seat || '').toUpperCase();
  if (!SEATS.includes(seat)) return res.status(400).json({ error: 'Invalid seat.' });
  const players = Rooms.players.all(room.id);
  if (players.some(p => p.seat === seat && p.user_id !== req.user.id))
    return res.status(409).json({ error: 'Seat occupied.' });
  if (botsOf(room)[seat]) return res.status(409).json({ error: 'A bot holds that seat — host can remove it.' });
  Rooms.setSeat.run(seat, room.id, req.user.id);
  const fresh = Rooms.byCode.get(room.code);
  sync(fresh);
  roomBroadcast(room.code, 'seat_changed', { userId: req.user.id, seat });
  res.json({ room: roomState(fresh) });
});

/* ---------- host controls ---------- */
function asHost(req, res) {
  const room = Rooms.anyRoomOf.get(req.user.id);
  if (!room || room.status !== 'open') { res.status(404).json({ error: 'You are not in an open room.' }); return null; }
  if (room.host_id !== req.user.id) { res.status(403).json({ error: 'Host only.' }); return null; }
  return room;
}

r.post('/room/lock', (req, res) => {
  const room = asHost(req, res); if (!room) return;
  Rooms.setLocked.run(req.body?.locked ? 1 : 0, room.id);
  const fresh = Rooms.byCode.get(room.code); sync(fresh);
  res.json({ room: roomState(fresh) });
});

r.post('/room/kick', (req, res) => {
  const room = asHost(req, res); if (!room) return;
  const target = req.body?.userId | 0;
  if (target === req.user.id) return res.status(400).json({ error: "You can't kick yourself." });
  if (!Rooms.playerIn.get(room.id, target)) return res.status(404).json({ error: 'Player not in room.' });
  Rooms.removePlayer.run(room.id, target);
  notifyUser(target, 'kicked', { code: room.code });
  const fresh = Rooms.byCode.get(room.code); sync(fresh);
  roomBroadcast(room.code, 'room_left', { userId: target });
  res.json({ room: roomState(fresh) });
});

r.post('/room/transfer', (req, res) => {
  const room = asHost(req, res); if (!room) return;
  const target = req.body?.userId | 0;
  if (!Rooms.playerIn.get(room.id, target)) return res.status(404).json({ error: 'Player not in room.' });
  Rooms.setHost.run(target, room.id);
  const fresh = Rooms.byCode.get(room.code); sync(fresh);
  res.json({ room: roomState(fresh) });
});

r.post('/room/close', (req, res) => {
  const room = asHost(req, res); if (!room) return;
  Rooms.close.run(room.id);
  roomBroadcast(room.code, 'room_closed', {});
  res.json({ ok: true });
});

r.post('/room/bot/add', (req, res) => {
  const room = asHost(req, res); if (!room) return;
  const seat = String(req.body?.seat || '').toUpperCase();
  const diff = ['easy', 'normal', 'hard'].includes(req.body?.difficulty) ? req.body.difficulty : 'normal';
  if (!SEATS.includes(seat)) return res.status(400).json({ error: 'Invalid seat.' });
  const players = Rooms.players.all(room.id);
  if (players.some(p => p.seat === seat)) return res.status(409).json({ error: 'A player holds that seat.' });
  const bots = botsOf(room); bots[seat] = diff;
  Rooms.setBots.run(JSON.stringify(bots), room.id);
  const fresh = Rooms.byCode.get(room.code); sync(fresh);
  res.json({ room: roomState(fresh) });
});

r.post('/room/bot/remove', (req, res) => {
  const room = asHost(req, res); if (!room) return;
  const seat = String(req.body?.seat || '').toUpperCase();
  const bots = botsOf(room); delete bots[seat];
  Rooms.setBots.run(JSON.stringify(bots), room.id);
  const fresh = Rooms.byCode.get(room.code); sync(fresh);
  res.json({ room: roomState(fresh) });
});

/* ---------- friend invites ---------- */
r.post('/room/invite', (req, res) => {
  if (req.user.isGuest) return res.status(403).json({ error: 'Friend invites need an account — share the room code or link instead.' });
  const room = Rooms.anyRoomOf.get(req.user.id);
  if (!room || room.status !== 'open') return res.status(404).json({ error: 'You are not in an open room.' });
  const target = Users.byUsername.get(String(req.body?.username || ''));
  if (!target) return res.status(404).json({ error: 'No such user.' });
  pushNotification(target.id, 'room_invite', { code: room.code, from: req.user.username });
  res.json({ ok: true });
});

/* ---------- start match (host) ---------- */
r.post('/room/start', (req, res) => {
  const room = asHost(req, res); if (!room) return;
  if (matchFor(room.code)) return res.status(409).json({ error: 'Match already running.' });
  const players = Rooms.players.all(room.id);
  const bots = botsOf(room);
  const seating = {};
  for (const s of SEATS) {
    const p = players.find(x => x.seat === s);
    if (p) seating[s] = { userId: p.user_id, username: p.username, isGuest: !!p.is_guest };
    else if (bots[s]) seating[s] = { bot: bots[s] };
    else return res.status(409).json({ error: `Seat ${s} is empty — fill it with a player or a bot.` });
  }
  const notReady = players.filter(p => p.user_id !== room.host_id && !p.ready);
  if (notReady.length) return res.status(409).json({ error: 'All players must be ready.' });

  Rooms.setStatus.run('playing', room.id);
  const fresh = Rooms.byCode.get(room.code);
  sync(fresh);
  new Match(fresh, seating, getIO(), (code) => {
    const rr = Rooms.byCode.get(code);
    if (rr) {
      Rooms.setStatus.run('open', rr.id);
      // clear ready flags for a rematch
      for (const p of Rooms.players.all(rr.id)) Rooms.setReady.run(0, rr.id, p.user_id);
      sync(Rooms.byCode.get(code));
    }
  });
  roomBroadcast(room.code, 'match_started', { code: room.code });
  res.json({ ok: true });
});

export default r;
