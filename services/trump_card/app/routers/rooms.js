import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { stmts } from '../database/db.js';

const r = Router();
r.use(requireAuth);

function randomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function formatRoom(room, players) {
  return {
    room: {
      id: room.id,
      code: room.code,
      status: room.status,
      locked: room.locked,
      bots: typeof room.bots === 'string' ? JSON.parse(room.bots || '{}') : (room.bots ?? {}),
      hostId: room.host_id,
      createdAt: room.created_at,
      players: players.map(p => ({
        userId: p.user_id,
        username: p.username,
        seat: p.seat,
        ready: !!p.ready,
        joinedAt: p.joined_at,
      })),
    }
  };
}

function takenSeats(players, bots) {
  return new Set([
    ...players.map(p => p.seat),
    ...Object.keys(bots),
  ]);
}

/* ── POST /api/room/create ── */
r.post('/room/create', async (req, res) => {
  try {
    const existing = await stmts.RoomPlayers.byUser.get(req.user.id);
    if (existing) return res.status(409).json({ error: 'Already in a room.' });

    let code, tries = 0;
    do { code = randomCode(); tries++; } while (await stmts.Rooms.byCode.get(code) && tries < 10);

    const { lastInsertRowid: roomId } = await stmts.Rooms.create.run(code, req.user.id);
    await stmts.RoomPlayers.join.run(roomId, req.user.id, 'A');

    const room = await stmts.Rooms.byCode.get(code);
    const players = await stmts.RoomPlayers.list.all(roomId);
    res.status(201).json(formatRoom(room, players));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── POST /api/room/join ── */
r.post('/room/join', async (req, res) => {
  const { code } = req.body ?? {};
  if (!code) return res.status(400).json({ error: 'code required.' });
  try {
    const room = await stmts.Rooms.byCode.get(code.toUpperCase());
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (room.status !== 'open') return res.status(409).json({ error: 'Room is closed.' });
    if (room.locked) return res.status(403).json({ error: 'Room is locked.' });

    const existing = await stmts.RoomPlayers.byUser.get(req.user.id);
    if (existing) return res.status(409).json({ error: 'Already in a room.' });

    const players = await stmts.RoomPlayers.list.all(room.id);
    const bots = JSON.parse(room.bots || '{}');
    const taken = takenSeats(players, bots);
    if (taken.size >= 4) return res.status(409).json({ error: 'Room is full.' });

    const seat = ['A', 'C', 'B', 'D'].find(s => !taken.has(s));
    await stmts.RoomPlayers.join.run(room.id, req.user.id, seat);

    const updatedPlayers = await stmts.RoomPlayers.list.all(room.id);
    res.json(formatRoom(room, updatedPlayers));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── GET /api/room/:code ── */
r.get('/room/:code', async (req, res) => {
  try {
    const room = await stmts.Rooms.byCode.get(req.params.code.toUpperCase());
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    const players = await stmts.RoomPlayers.list.all(room.id);
    res.json(formatRoom(room, players));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── POST /api/room/leave ── */
r.post('/room/leave', async (req, res) => {
  try {
    const rp = await stmts.RoomPlayers.byUser.get(req.user.id);
    if (!rp) return res.status(404).json({ error: 'Not in a room.' });
    await stmts.RoomPlayers.leave.run(rp.room_id, req.user.id);

    const remaining = await stmts.RoomPlayers.list.all(rp.room_id);
    if (remaining.length === 0) {
      await stmts.Rooms.close.run(rp.room_id);
    } else {
      const room = await stmts.Rooms.byId.get(rp.room_id);
      if (room?.host_id === req.user.id && remaining[0]) {
        await stmts.Rooms.transferHost.run(remaining[0].user_id, rp.room_id);
      }
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── POST /api/room/ready ── */
r.post('/room/ready', async (req, res) => {
  const { ready } = req.body ?? {};
  try {
    const rp = await stmts.RoomPlayers.byUser.get(req.user.id);
    if (!rp) return res.status(404).json({ error: 'Not in a room.' });
    await stmts.RoomPlayers.setReady.run(ready ? 1 : 0, rp.room_id, req.user.id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── POST /api/room/seat ── */
r.post('/room/seat', async (req, res) => {
  const { seat } = req.body ?? {};
  if (!['A', 'B', 'C', 'D'].includes(seat))
    return res.status(400).json({ error: 'Invalid seat.' });
  try {
    const rp = await stmts.RoomPlayers.byUser.get(req.user.id);
    if (!rp) return res.status(404).json({ error: 'Not in a room.' });
    const taken = await stmts.RoomPlayers.bySeat.get(rp.room_id, seat);
    if (taken && taken.user_id !== req.user.id)
      return res.status(409).json({ error: 'Seat taken.' });
    await stmts.RoomPlayers.changeSeat.run(seat, rp.room_id, req.user.id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── POST /api/room/lock ── */
r.post('/room/lock', async (req, res) => {
  const { locked } = req.body ?? {};
  try {
    const rp = await stmts.RoomPlayers.byUser.get(req.user.id);
    if (!rp) return res.status(404).json({ error: 'Not in a room.' });
    const room = await stmts.Rooms.byId.get(rp.room_id);
    if (room?.host_id !== req.user.id) return res.status(403).json({ error: 'Not the host.' });
    await stmts.Rooms.setLocked.run(locked ? 1 : 0, room.id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── POST /api/room/kick ── */
r.post('/room/kick', async (req, res) => {
  const { userId } = req.body ?? {};
  try {
    const rp = await stmts.RoomPlayers.byUser.get(req.user.id);
    if (!rp) return res.status(404).json({ error: 'Not in a room.' });
    const room = await stmts.Rooms.byId.get(rp.room_id);
    if (room?.host_id !== req.user.id) return res.status(403).json({ error: 'Not the host.' });
    await stmts.RoomPlayers.leave.run(rp.room_id, userId);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── POST /api/room/transfer ── */
r.post('/room/transfer', async (req, res) => {
  const { userId } = req.body ?? {};
  try {
    const rp = await stmts.RoomPlayers.byUser.get(req.user.id);
    if (!rp) return res.status(404).json({ error: 'Not in a room.' });
    const room = await stmts.Rooms.byId.get(rp.room_id);
    if (room?.host_id !== req.user.id) return res.status(403).json({ error: 'Not the host.' });
    await stmts.Rooms.transferHost.run(userId, room.id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── POST /api/room/close ── */
r.post('/room/close', async (req, res) => {
  try {
    const rp = await stmts.RoomPlayers.byUser.get(req.user.id);
    if (!rp) return res.status(404).json({ error: 'Not in a room.' });
    const room = await stmts.Rooms.byId.get(rp.room_id);
    if (room?.host_id !== req.user.id) return res.status(403).json({ error: 'Not the host.' });
    await stmts.Rooms.close.run(room.id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── POST /api/room/bot/add ── */
r.post('/room/bot/add', async (req, res) => {
  const { seat, difficulty } = req.body ?? {};
  if (!['A', 'B', 'C', 'D'].includes(seat))
    return res.status(400).json({ error: 'Invalid seat.' });
  if (!['easy', 'normal', 'hard'].includes(difficulty))
    return res.status(400).json({ error: 'difficulty must be easy, normal or hard.' });
  try {
    const rp = await stmts.RoomPlayers.byUser.get(req.user.id);
    if (!rp) return res.status(404).json({ error: 'Not in a room.' });
    const room = await stmts.Rooms.byId.get(rp.room_id);
    if (room?.host_id !== req.user.id) return res.status(403).json({ error: 'Not the host.' });

    // Check no human is in that seat
    const humanInSeat = await stmts.RoomPlayers.bySeat.get(rp.room_id, seat);
    if (humanInSeat) return res.status(409).json({ error: 'A human already occupies that seat.' });

    const bots = JSON.parse(room.bots || '{}');
    bots[seat] = difficulty;
    await stmts.Rooms.setBots.run(JSON.stringify(bots), room.id);

    const freshRoom = await stmts.Rooms.byId.get(room.id);
    const players = await stmts.RoomPlayers.list.all(room.id);
    res.json(formatRoom(freshRoom, players));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── POST /api/room/bot/remove ── */
r.post('/room/bot/remove', async (req, res) => {
  const { seat } = req.body ?? {};
  if (!['A', 'B', 'C', 'D'].includes(seat))
    return res.status(400).json({ error: 'Invalid seat.' });
  try {
    const rp = await stmts.RoomPlayers.byUser.get(req.user.id);
    if (!rp) return res.status(404).json({ error: 'Not in a room.' });
    const room = await stmts.Rooms.byId.get(rp.room_id);
    if (room?.host_id !== req.user.id) return res.status(403).json({ error: 'Not the host.' });
    const bots = JSON.parse(room.bots || '{}');
    delete bots[seat];
    await stmts.Rooms.setBots.run(JSON.stringify(bots), room.id);

    const freshRoom = await stmts.Rooms.byId.get(room.id);
    const players = await stmts.RoomPlayers.list.all(room.id);
    res.json(formatRoom(freshRoom, players));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── POST /api/room/invite ── */
r.post('/room/invite', async (req, res) => {
  const { username } = req.body ?? {};
  try {
    const rp = await stmts.RoomPlayers.byUser.get(req.user.id);
    if (!rp) return res.status(404).json({ error: 'Not in a room.' });
    const target = await stmts.Users.byUsername.get(username);
    if (!target) return res.status(404).json({ error: 'User not found.' });
    await stmts.Notifications.create.run(
      target.id, 'room_invite',
      JSON.stringify({ from: req.user.id, username: req.user.username, code: rp.code })
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ── POST /api/room/start ── */
r.post('/room/start', async (req, res) => {
  try {
    const rp = await stmts.RoomPlayers.byUser.get(req.user.id);
    if (!rp) return res.status(404).json({ error: 'Not in a room.' });
    const room = await stmts.Rooms.byId.get(rp.room_id);
    if (room?.host_id !== req.user.id) return res.status(403).json({ error: 'Not the host.' });
    const players = await stmts.RoomPlayers.list.all(room.id);
    const bots = JSON.parse(room.bots || '{}');
    const taken = takenSeats(players, bots);
    if (taken.size < 4) return res.status(400).json({ error: 'Need 4 players.' });
    res.json({ ok: true, code: room.code });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

export default r;