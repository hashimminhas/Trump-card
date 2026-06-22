/* Use-case smoke test: auth + room setup.
   Run with the backend server on :3001.
   Covers: register, guest access, /me, room create, join, seat change, bot add, lock, and room lookup. */
import assert from 'node:assert/strict';

const BASE = process.env.EC_BASE_URL || 'http://localhost:3001/api';
const log = (...args) => console.log(...args);

async function api(path, token, json, method) {
  const res = await fetch(BASE + path, {
    method: method || (json ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: json ? JSON.stringify(json) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path}: ${data.error}`);
  return data;
}

async function main() {
  const stamp = Date.now();
  const suffix = String(stamp % 1e6);

  const host = await api('/register', null, {
    username: `uc_host_${suffix}`,
    email: `uc_host_${stamp}@t.dev`,
    password: 'password123'
  });
  const peer = await api('/register', null, {
    username: `uc_peer_${suffix}`,
    email: `uc_peer_${stamp}@t.dev`,
    password: 'password123'
  });
  const guest = await api('/guest', null, {});

  const me = await api('/me', host.token);
  assert.equal(me.user.username, host.user.username, '/me returns the authenticated user');
  assert.match(guest.user.username, /^Guest-\d{5}$/u, 'guest account is minted');

  const { room } = await api('/room/create', guest.token, {});
  const code = room.code;
  assert.equal(room.players.length, 1, 'guest host is seated in A');

  await api('/room/join', peer.token, { code });
  await api('/room/seat', peer.token, { seat: 'C' });
  await api('/room/bot/add', guest.token, { seat: 'B', difficulty: 'hard' });
  await api('/room/lock', guest.token, { locked: true });

  const fresh = await api(`/room/${code}`, host.token);
  assert.equal(fresh.room.code, code, 'room can be fetched by code');
  assert.equal(fresh.room.locked, true, 'room lock state is persisted');
  assert.equal(fresh.room.players.find(p => p.userId === peer.user.id)?.seat, 'C', 'peer moved to seat C');
  assert.equal(fresh.room.bots.B, 'hard', 'bot was added to seat B');
  assert.equal(fresh.room.players.find(p => p.userId === guest.user.id)?.seat, 'A', 'guest remains host in seat A');

  log('\nALL USE-CASE SMOKE CHECKS PASSED');
}

main().catch(err => {
  console.error('TEST FAILED:', err.message);
  process.exit(1);
});