/* Phase 3C integration test — guest multiplayer.
   Guest host + registered peer + two bots play a full authoritative match.
   Asserts: guests can create/join/play rooms; both receive the final record
   over the socket; the record persists to the registered account's cloud
   history but NOT the guest's (guests keep history locally). */
import { io } from 'socket.io-client';

const BASE = 'http://localhost:3001/api';
const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(path, token, json, method) {
  const res = await fetch(BASE + path, {
    method: method || (json ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: json ? JSON.stringify(json) : undefined
  });
  const d = await res.json();
  if (!res.ok) throw new Error(`${path}: ${d.error}`);
  return d;
}

function autoPlayer(name, token, code) {
  const s = io('http://localhost:3001', { auth: { token } });
  const p = { name, socket: s, state: null, finished: null };
  s.on('match_finished', ({ record }) => { p.finished = record; });
  s.on('match_state', st => {
    p.state = st;
    if (st.amChooser && st.phase === 'trump') s.emit('match:trump', { code, suit: 'H' });
    else if (st.phase === 'play' && st.mySeat && st.turn === st.mySeat && st.legal?.length)
      s.emit('match:play', { code, card: st.legal[0] });
  });
  s.on('connect', () => s.emit('room:watch', code));
  return p;
}

async function main() {
  const t = Date.now();
  // 1. brand-new visitor clicks "Play as Guest" — no email, no password
  const g = await api('/guest', null, {});
  log(`== guest created: ${g.user.username} (is_guest=${g.user.is_guest})`);

  // 2. guest creates a room immediately
  const { room } = await api('/room/create', g.token, {});
  const code = room.code;
  log(`== guest created room ${code} · invite link: /room/${code}`);

  // 3. a registered friend joins with the code
  const u = await api('/register', null, { username: 'reg_' + (t % 1e6), email: `reg${t}@t.dev`, password: 'password123' });
  await api('/room/join', u.token, { code });
  await api('/room/bot/add', g.token, { seat: 'B', difficulty: 'normal' });
  await api('/room/bot/add', g.token, { seat: 'D', difficulty: 'hard' });
  await api('/room/ready', u.token, { ready: true });
  log('== registered peer joined; bots seated; ready');

  // 4. both play
  const guest = autoPlayer('guest', g.token, code);
  const reg = autoPlayer('reg', u.token, code);
  await sleep(500);
  await api('/room/start', g.token, {});
  log('== guest host started the match');

  const t0 = Date.now();
  while ((!guest.finished || !reg.finished) && Date.now() - t0 < 120000) await sleep(300);
  if (!guest.finished) throw new Error('match did not finish');

  const rec = guest.finished;
  const sum = rec.score.AC + rec.score.BD + rec.score.stranded;
  log(`\n== finished: ${rec.result} AC ${rec.score.AC}–${rec.score.BD} BD (stranded ${rec.score.stranded})`);

  const assert = (c, msg) => { if (!c) throw new Error('ASSERT: ' + msg); log('  ✓', msg); };
  assert(rec.rounds.length === 13 && sum === 52, 'full valid match (13 rounds, 52 cards)');
  assert(reg.finished && reg.finished.id === rec.id, 'both players received the final record (guest keeps it locally)');

  const gh = await api('/match-history', g.token);
  const rh = await api('/match-history', u.token);
  assert(!gh.matches.some(m => m.client_id === rec.id), 'guest has NO cloud copy (local-only by design)');
  assert(rh.matches.some(m => m.client_id === rec.id), 'registered player HAS the cloud copy');

  // 5. upgrade path: guest becomes real, local history imports, cloud unlocks
  const up = await api('/guest/upgrade', g.token, { username: 'upg_' + (t % 1e6), email: `upg${t}@t.dev`, password: 'password123' });
  await api('/matches/import', up.token, { records: [rec] }); // what the client does with localStorage
  const uh = await api('/match-history', up.token);
  assert(uh.matches.some(m => m.client_id === rec.id), 'after upgrade, local history imported to cloud');
  const prof = await api('/profile', up.token);
  assert(prof.stats.matches === 1, 'upgraded profile stats computed from preserved history');

  log('\nALL PHASE 3C CHECKS PASSED');
  guest.socket.disconnect(); reg.socket.disconnect();
  process.exit(0);
}
main().catch(e => { console.error('TEST FAILED:', e.message); process.exit(1); });
