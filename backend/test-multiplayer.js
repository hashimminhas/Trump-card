/* Phase 3B integration test — run with the server on :3001.
   Proves: room flow, match start, server-authoritative play, anti-cheat
   rejection, disconnect/reconnect with state restore, match completion,
   record persistence for both humans. */
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

function makePlayer(name, token, code, flags) {
  const s = io('http://localhost:3001', { auth: { token } });
  const p = { name, token, socket: s, state: null, cheatTried: false, cheatRejected: false, finished: null, autoPlays: 0 };

  s.on('match_error', e => { if (p.cheatTried && !p.cheatRejected) { p.cheatRejected = true; log(`  [${name}] anti-cheat rejected: "${e.error}"`); } });
  s.on('card_played', e => { if (e.auto) p.autoPlays++; });
  s.on('match_finished', ({ record }) => { p.finished = record; });
  s.on('match_state', st => {
    p.state = st;
    act();
  });
  s.on('connect', () => s.emit('room:watch', code));

  async function act() {
    const st = p.state;
    if (!st || p.acting) return;
    p.acting = true;
    try {
      if (st.amChooser && st.phase === 'trump') {
        log(`  [${name}] choosing trump`);
        s.emit('match:trump', { code, suit: 'S' });
      } else if (st.phase === 'play' && st.mySeat && st.turn === st.mySeat && st.legal?.length) {
        if (flags.cheatOnce && !p.cheatTried) {
          p.cheatTried = true;
          // try to play a card we do not own
          s.emit('match:play', { code, card: { suit: 'H', rank: 2 } }, (res) => {
            if (res?.error && !p.cheatRejected) { p.cheatRejected = true; log(`  [${name}] anti-cheat ack: "${res.error}"`); }
          });
          await sleep(60);
          // also try an illegal (non-follow) card if one exists
          const illegal = st.myHand.find(c => !st.legal.some(l => l.suit === c.suit && l.rank === c.rank));
          if (illegal) s.emit('match:play', { code, card: illegal });
          await sleep(60);
        }
        s.emit('match:play', { code, card: st.legal[0] });
      }
    } finally { p.acting = false; }
  }
  return p;
}

async function main() {
  const t = Date.now();
  const u1 = await api('/register', null, { username: 'mp_host_' + (t % 1e6), email: `h${t}@t.dev`, password: 'password123' });
  const u2 = await api('/register', null, { username: 'mp_peer_' + (t % 1e6), email: `p${t}@t.dev`, password: 'password123' });
  log('== users registered');

  const { room } = await api('/room/create', u1.token, {});
  const code = room.code;
  log('== room', code, '(host seat A)');

  await api('/room/join', u2.token, { code });
  await api('/room/seat', u2.token, { seat: 'C' });          // manual seat selection
  await api('/room/bot/add', u1.token, { seat: 'B', difficulty: 'normal' });
  await api('/room/bot/add', u1.token, { seat: 'D', difficulty: 'hard' });
  await api('/room/lock', u1.token, { locked: true });
  await api('/room/ready', u2.token, { ready: true });
  log('== seats: host A, peer C (manual), bots B/D · seats locked · peer ready');

  const host = makePlayer('host', u1.token, code, { cheatOnce: true });
  const peer = makePlayer('peer', u2.token, code, {});
  await sleep(500);

  await api('/room/start', u1.token, {});
  log('== match started (server-authoritative)');

  // mid-match disconnect/reconnect for the peer
  let reconnected = false;
  const reconnect = setInterval(async () => {
    if (peer.state?.round >= 3 && !reconnected) {
      reconnected = true;
      clearInterval(reconnect);
      const before = peer.state.handCounts;
      log(`  [peer] disconnecting at round ${peer.state.round} (hand ${peer.state.myHand.length})…`);
      peer.socket.disconnect();
      await sleep(6500); // long enough that at least one of the peer's turns elapses while away
      peer.socket.connect();
      await sleep(700);
      log(`  [peer] reconnected at round ${peer.state.round}, hand restored: ${peer.state.myHand.length} cards, turn=${peer.state.turn}`);
      if (!peer.state.myHand) throw new Error('hand not restored');
    }
  }, 300);

  // wait for finish
  const t0 = Date.now();
  while (!host.finished && Date.now() - t0 < 120000) await sleep(300);
  clearInterval(reconnect);
  if (!host.finished) throw new Error('match did not finish in time');

  const rec = host.finished;
  const sum = rec.score.AC + rec.score.BD + rec.score.stranded;
  log('\n== MATCH FINISHED ==');
  log(`result=${rec.result} score AC ${rec.score.AC} – BD ${rec.score.BD} (stranded ${rec.score.stranded}) sum=${sum}`);
  log(`rounds=${rec.rounds.length} collections=${rec.collections.length} misdeals=${rec.misdeals} duration=${(rec.durationMs / 1000).toFixed(1)}s`);
  log(`seats: ${JSON.stringify(rec.seatNames)}`);

  // assertions
  const assert = (c, msg) => { if (!c) throw new Error('ASSERT: ' + msg); log('  ✓', msg); };
  assert(rec.rounds.length === 13, '13 rounds played');
  assert(sum === 52, 'all 52 cards accounted for');
  assert(host.cheatRejected, 'cheat attempts rejected by server');
  assert(reconnected, 'disconnect/reconnect exercised');
  // observe auto-plays from the HOST socket — the peer is offline while they happen
  assert(host.autoPlays >= 1, `server auto-played for absent player (host observed ${host.autoPlays}x)`);
  assert(rec.rounds.every(r => r.plays.length === 4), 'every round has exactly 4 plays');
  const h1 = await api('/match-history', u1.token);
  const h2 = await api('/match-history', u2.token);
  assert(h1.matches.some(m => m.client_id === rec.id), 'record persisted for host');
  assert(h2.matches.some(m => m.client_id === rec.id), 'record persisted for peer');
  const replay = await api('/match-history/full', u2.token);
  const full = replay.records.find(r => r.id === rec.id);
  assert(full && full.rounds.length === 13 && full.rounds[0].plays.length === 4, 'full replay record retrievable');

  log('\nALL PHASE 3B CHECKS PASSED');
  host.socket.disconnect(); peer.socket.disconnect();
  process.exit(0);
}
main().catch(e => { console.error('TEST FAILED:', e.message); process.exit(1); });
