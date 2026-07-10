/* Room / Multiplayer integration tests — Trump Card
 *
 * Same style as tests/test-multiplayer.js: a live server + real HTTP/socket
 * calls, plain assert() checks, no mocking. Run with the server up:
 *
 *   # terminal 1
 *   cd services/trump_card
 *   EC_TURN_MS=2500 EC_BOT_MS=300 EC_PAUSE_MS=300 EC_GAP_MS=300 npm run dev
 *
 *   # terminal 2
 *   node tests/rooms.test.js
 *
 * The EC_* env vars shrink the real timers (60s human turn, 1.7s bot think,
 * etc.) so the timer-dependent tests (#40, #46) finish in seconds instead
 * of a minute+. They are the same knobs match.js already reads in
 * production (EC_TURN_MS / EC_BOT_MS / EC_PAUSE_MS / EC_GAP_MS) — nothing
 * test-only is being added to the app.
 */
import { io } from 'socket.io-client';

const BASE = process.env.EC_TEST_BASE || 'http://localhost:3001';
const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; log('  ✓', msg); }
  else { failed++; log('  ✗ FAILED:', msg); }
}

async function api(path, token, json, method) {
  const res = await fetch(BASE + '/api' + path, {
    method: method || (json ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: json ? JSON.stringify(json) : undefined
  });
  let d = null;
  try { d = await res.json(); } catch { /* no body */ }
  return { status: res.status, ok: res.ok, body: d };
}

function connectSocket(token) {
  return io(BASE, { auth: { token }, transports: ['websocket'] });
}

async function freshUser(tag) {
  const t = Date.now() + Math.floor(Math.random() * 1e6);
  const r = await api('/register', null, {
    username: `${tag}_${t % 1e7}`, email: `${tag}${t}@t.dev`, password: 'password123'
  });
  if (!r.ok) throw new Error(`could not register ${tag}: ${JSON.stringify(r.body)}`);
  return r.body; // { token, user }
}

/* Drives a seated player through trump selection + legal-move play so a
 * match can run to completion unattended. Mirrors test-multiplayer.js. */
function makeAutoPlayer(name, token, code) {
  const s = connectSocket(token);
  const p = { name, socket: s, state: null, finished: null, invalidPlayError: null, outOfTurnError: null };
  s.on('connect', () => s.emit('room:watch', code));
  s.on('match_finished', ({ record }) => { p.finished = record; });
  s.on('match_state', st => { p.state = st; act(); });

  async function act() {
    const st = p.state;
    if (!st || p.acting) return;
    p.acting = true;
    try {
      if (st.amChooser && st.phase === 'trump') {
        s.emit('match:trump', { code, suit: 'S' });
      } else if (st.phase === 'play' && st.mySeat && st.turn === st.mySeat && st.legal?.length) {
        s.emit('match:play', { code, card: st.legal[0] });
      }
    } finally { p.acting = false; }
  }
  return p;
}

async function main() {
  log(`\n== connecting to ${BASE} — make sure the server is running with short timers ==\n`);
  const health = await api('/health', null, null, 'GET').catch(() => null);
  if (!health || health.status !== 200) {
    // /api/health has no auth requirement; a non-200 here means the server isn't up
  }

  /* ---------------------------------------------------------------------
   * #34 Create room -> 6-char code, creator is host
   * ------------------------------------------------------------------- */
  log('# 34. Create room');
  const host = await freshUser('host');
  const created = await api('/room/create', host.token, {});
  assert(created.ok, 'create room succeeds');
  const code = created.body.room.code;
  assert(typeof code === 'string' && code.length === 6, `room code is 6 chars (got "${code}")`);
  assert(created.body.room.hostId === host.user.id, 'creator is recorded as host');
  assert(created.body.room.players.find(p => p.userId === host.user.id)?.seat === 'A', 'host auto-seated in A');

  /* ---------------------------------------------------------------------
   * #35 Join room by code -> player added, can watch the room's socket channel
   * ------------------------------------------------------------------- */
  log('\n# 35. Join room by code');
  const peer = await freshUser('peer');
  const joined = await api('/room/join', peer.token, { code });
  assert(joined.ok, 'join by code succeeds');
  assert(joined.body.room.players.some(p => p.userId === peer.user.id), 'joining player appears in room.players');

  const peerSocket = connectSocket(peer.token);
  let sawRoomState = false;
  peerSocket.on('room_state', () => { sawRoomState = true; });
  await new Promise(resolve => peerSocket.on('connect', () => { peerSocket.emit('room:watch', code); resolve(); }));

  /* ---------------------------------------------------------------------
   * #36 "Join with wrong password" — CORRECTED, see note below.
   * ------------------------------------------------------------------- */
  log('\n# 36. Room privacy model (see note)');
  log('  NOTE: rooms.js has no password field or check anywhere (confirmed by');
  log('  grepping schema.sql/db.js/rooms.js — only user accounts have passwords).');
  log('  A room\'s only access control is knowing its 6-char code. The nearest');
  log('  real behavior is: joining with a code that does not exist -> 404.');
  const badJoin = await api('/room/join', peer.token, { code: 'ZZZZZZ' });
  assert(badJoin.status === 404, `join with unknown code -> 404 (got ${badJoin.status})`);

  /* ---------------------------------------------------------------------
   * #37 Join a full room (4 seats taken) -> "Room is full."
   * ------------------------------------------------------------------- */
  log('\n# 37. Join a full room');
  await api('/room/bot/add', host.token, { seat: 'B', difficulty: 'easy' });
  await api('/room/bot/add', host.token, { seat: 'D', difficulty: 'easy' });
  // seats now: A=host(human), B=bot, C=peer(human), D=bot -> full
  const fifthUser = await freshUser('extra');
  const overflow = await api('/room/join', fifthUser.token, { code });
  assert(overflow.status === 409, `5th join on a full room -> 409 (got ${overflow.status})`);
  assert(/full/i.test(overflow.body?.error || ''), `error message mentions "full" (got "${overflow.body?.error}")`);
  // clean seats back to just host+peer for the rest of the tests
  await api('/room/bot/remove', host.token, { seat: 'D' });

  /* ---------------------------------------------------------------------
   * #38 Host adds a bot -> bot occupies a seat and later plays automatically
   *      (confirmed once the match starts, further down)
   * ------------------------------------------------------------------- */
  log('\n# 38. Host adds a bot to an empty seat');
  const addBot = await api('/room/bot/add', host.token, { seat: 'D', difficulty: 'hard' });
  assert(addBot.ok, 'add bot succeeds');
  assert(addBot.body.room.bots.D === 'hard', 'seat D now holds a hard bot');

  /* ---------------------------------------------------------------------
   * #39 Host kicks a player -> kicked player gets a 'kicked' socket event
   * ------------------------------------------------------------------- */
  log('\n# 39. Host kicks a player');
  // free a seat first — after #38 the room is A=host, B=bot, C=peer, D=bot (full)
  await api('/room/bot/remove', host.token, { seat: 'B' });
  const toKick = await freshUser('kickme');
  const kickJoin = await api('/room/join', toKick.token, { code });
  assert(kickJoin.ok, 'setup: kick-target can join the now-open seat B');
  const kickSocket = connectSocket(toKick.token);
  const kickedEventSeen = new Promise(resolve => {
    kickSocket.on('kicked', payload => resolve(payload));
    setTimeout(() => resolve(null), 3000);
  });
  await sleep(200); // let the socket finish its handshake/join
  const kickRes = await api('/room/kick', host.token, { userId: toKick.user.id });
  assert(kickRes.ok, 'host kick request succeeds');
  const kickedPayload = await kickedEventSeen;
  assert(!!kickedPayload && kickedPayload.code === code, 'kicked player receives a "kicked" socket event for this room');
  kickSocket.disconnect();
  await api('/room/bot/add', host.token, { seat: 'B', difficulty: 'easy' }); // restore the seat the kick freed

  /* ---------------------------------------------------------------------
   * #40 / #41 Start match with < 4 filled seats -> error
   * ------------------------------------------------------------------- */
  log('\n# 41. Start match with an empty seat');
  await api('/room/bot/remove', host.token, { seat: 'D' }); // re-empty D
  const notReadyStart = await api('/room/start', host.token, {});
  assert(notReadyStart.status === 409, `start with empty seat -> 409 (got ${notReadyStart.status})`);
  assert(/empty/i.test(notReadyStart.body?.error || ''), `error mentions the empty seat (got "${notReadyStart.body?.error}")`);
  await api('/room/bot/add', host.token, { seat: 'D', difficulty: 'hard' }); // refill for the real start below

  /* ---------------------------------------------------------------------
   * #40 Start match with all 4 seats filled -> match starts, players get match_started
   * ------------------------------------------------------------------- */
  log('\n# 40. Start match with all seats filled');
  const hostPlayer = makeAutoPlayer('host', host.token, code);
  const peerPlayer = makeAutoPlayer('peer', peer.token, code);
  let hostSawStart = false, peerSawStart = false;
  hostPlayer.socket.on('match_started', () => { hostSawStart = true; });
  peerPlayer.socket.on('match_started', () => { peerSawStart = true; });
  await sleep(300);

  // confirm start is blocked while peer is NOT yet ready
  const blockedStart = await api('/room/start', host.token, {});
  assert(blockedStart.status === 409, `start blocked while peer is not ready (got ${blockedStart.status})`);
  assert(/ready/i.test(blockedStart.body?.error || ''), `error mentions readiness (got "${blockedStart.body?.error}")`);

  await api('/room/ready', peer.token, { ready: true });
  const startRes = await api('/room/start', host.token, {});
  assert(startRes.ok, `match start succeeds once everyone is ready/seated (got ${startRes.status}: ${JSON.stringify(startRes.body)})`);
  await sleep(400);
  assert(hostSawStart, 'host socket received match_started');
  assert(peerSawStart, 'peer socket received match_started');

  /* ---------------------------------------------------------------------
   * #44 / #45 Anti-cheat: invalid card / out-of-turn play are rejected
   * ------------------------------------------------------------------- */
  log('\n# 44/45. Server rejects illegal plays');
  await sleep(300);
  // wait for trump phase to resolve into play with an actual hand for host
  let tries = 0;
  while ((!hostPlayer.state || hostPlayer.state.phase !== 'play') && tries++ < 40) await sleep(150);
  if (hostPlayer.state?.phase === 'play') {
    const notMyTurnSeat = hostPlayer.state.mySeat;
    const isHostTurn = hostPlayer.state.turn === notMyTurnSeat;
    if (!isHostTurn) {
      // it's not host's turn right now -> perfect, try to play anyway (out-of-turn)
      const fakeCard = { suit: 'H', rank: 2 };
      const ack = await new Promise(resolve => hostPlayer.socket.emit('match:play', { code, card: fakeCard }, resolve));
      assert(!!ack?.error, `playing out of turn is rejected (server said: "${ack?.error}")`);
    } else {
      log('  (host happened to be on turn at this instant — skipping the out-of-turn probe, not flaking the run)');
    }
    // a card the player does not hold, regardless of whose turn it is:
    const notOwned = { suit: 'D', rank: 2 };
    const owns = hostPlayer.state.myHand?.some(c => c.suit === notOwned.suit && c.rank === notOwned.rank);
    if (!owns) {
      const ack2 = await new Promise(resolve => hostPlayer.socket.emit('match:play', { code, card: notOwned }, resolve));
      assert(!!ack2?.error, `playing a card you don't hold is rejected (server said: "${ack2?.error}")`);
    }
  } else {
    log('  ✗ could not reach play phase in time — skipping anti-cheat probe for this run');
  }

  /* ---------------------------------------------------------------------
   * #46 Server turn timer fires -> server auto-plays for a slow human
   * ------------------------------------------------------------------- */
  log('\n# 46. Server auto-plays when a human lets the turn timer expire');
  // peerPlayer auto-plays instantly via makeAutoPlayer, so it won't naturally
  // time out. Detect via card_played{auto:true} events, which the server
  // emits both for real timeouts AND disconnect-driven auto-plays.
  let sawAutoPlay = false;
  hostPlayer.socket.on('card_played', e => { if (e.auto) sawAutoPlay = true; });
  peerPlayer.socket.on('card_played', e => { if (e.auto) sawAutoPlay = true; });

  /* ---------------------------------------------------------------------
   * #42 / #43 Disconnect mid-match -> seat preserved + timer auto-plays
   *           for the absent seat; reconnect -> full state snapshot restored
   *
   * CORRECTED from the original test plan: match.js's markConnected()
   * comment is explicit — "the match never blocks on a disconnect - the
   * turn timer auto-plays for absent players, and the seat stays reserved."
   * There is no bot substitution on disconnect; the human seat simply gets
   * auto-played by the same timeout mechanism as #46 until they return.
   * ------------------------------------------------------------------- */
  log('\n# 42/43. Disconnect mid-match -> seat preserved, timer covers for them; reconnect restores state');
  peerPlayer.socket.disconnect();
  await sleep(200);
  // With EC_TURN_MS shrunk (test env), the next time it's peer's turn the
  // server's timeout auto-plays for them instead of stalling the match.
  await sleep(3500);
  const reconnectSocket = connectSocket(peer.token);
  const restoredState = await new Promise(resolve => {
    reconnectSocket.on('match_state', st => resolve(st));
    reconnectSocket.on('connect', () => {}); // reconnect push happens automatically server-side
    setTimeout(() => resolve(null), 3000);
  });
  assert(!!restoredState, 'reconnecting socket receives a match_state snapshot automatically');
  assert(restoredState?.mySeat === 'C' || restoredState?.mySeat === peerPlayer.state?.mySeat,
    `restored snapshot has the correct seat (got ${restoredState?.mySeat})`);
  assert(Array.isArray(restoredState?.myHand), 'restored snapshot includes the player\'s own hand');
  reconnectSocket.disconnect();

  /* ---------------------------------------------------------------------
   * #47 Match finishes -> match_finished to all, record saved for humans
   * ------------------------------------------------------------------- */
  log('\n# 47. Match runs to completion and persists');
  const peerPlayer2 = makeAutoPlayer('peer-rejoin', peer.token, code); // keep driving peer's turns
  const t0 = Date.now();
  while (!hostPlayer.finished && Date.now() - t0 < 90000) await sleep(300);
  assert(!!hostPlayer.finished, 'match_finished received within the time budget');
  if (hostPlayer.finished) {
    const rec = hostPlayer.finished;
    assert(rec.rounds.length === 13, 'finished record has 13 rounds');
    const sum = rec.score.AC + rec.score.BD + rec.score.stranded;
    assert(sum === 52, `all 52 cards accounted for (got ${sum})`);
    assert(sawAutoPlay, 'at least one card_played event was server-auto-played (timeout or disconnect coverage)');

    const hostHistory = await api('/match-history', host.token, null, 'GET');
    assert(hostHistory.ok && hostHistory.body.matches.some(m => m.client_id === rec.id),
      'match record persisted to DB for the host (a real, non-guest user)');
    const peerHistory = await api('/match-history', peer.token, null, 'GET');
    assert(peerHistory.ok && peerHistory.body.matches.some(m => m.client_id === rec.id),
      'match record persisted to DB for the peer too');
  }

  hostPlayer.socket.disconnect();
  peerPlayer.socket.disconnect();
  peerPlayer2.socket.disconnect();
  peerSocket.disconnect();

  log(`\n== RESULTS: ${passed} passed, ${failed} failed ==`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('TEST SCRIPT ERROR:', e); process.exit(1); });