/* Social + Profile + Guest + Auth-middleware integration tests — Trump Card
 * Same style as tests/rooms.test.js: live server, real HTTP + socket.io
 * calls, plain assert() checks, no mocking.
 *
 * Run (two terminals):
 *   # terminal 1
 *   cd services/trump_card
 *   npm run start:fast        (see package.json — no --watch, short timers)
 *
 *   # terminal 2
 *   node tests/social.test.js
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
function connectSocket(token) { return io(BASE, { auth: { token }, transports: ['websocket'] }); }
async function freshUser(tag) {
  const t = Date.now() + Math.floor(Math.random() * 1e6);
  const r = await api('/register', null, { username: `${tag}_${t % 1e7}`, email: `${tag}${t}@t.dev`, password: 'password123' });
  if (!r.ok) throw new Error(`could not register ${tag}: ${JSON.stringify(r.body)}`);
  return r.body; // { token, user }
}
async function freshGuest() {
  const r = await api('/guest', null, {});
  if (!r.ok) throw new Error(`could not mint guest: ${JSON.stringify(r.body)}`);
  return r.body;
}
function waitFor(socket, event, ms = 3000) {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve(null), ms);
    socket.once(event, payload => { clearTimeout(t); resolve(payload); });
  });
}

async function main() {
  log(`\n== connecting to ${BASE} ==\n`);

  /* =======================================================================
   * UC-56  JWT authentication middleware
   * ===================================================================== */
  log('# 56. JWT authentication middleware');
  const noAuth = await api('/profile', null, null, 'GET');
  assert(noAuth.status === 401, `protected route with no token -> 401 (got ${noAuth.status})`);

  const garbage = await api('/profile', 'not-a-real-jwt', null, 'GET');
  assert(garbage.status === 401, `protected route with a garbage token -> 401 (got ${garbage.status})`);

  const alice = await freshUser('alice');
  const validAuth = await api('/profile', alice.token, null, 'GET');
  assert(validAuth.ok, `protected route with a valid token -> 200 (got ${validAuth.status})`);

  /* =======================================================================
   * UC-48 / UC-51  Friends list, presence, notification bell
   * ===================================================================== */
  log('\n# 48/51. Friend request -> notification -> accept -> presence');
  const bob = await freshUser('bob');

  const req1 = await api('/friends/request', alice.token, { username: bob.user.username });
  assert(req1.ok, 'alice sends bob a friend request');

  const dupe = await api('/friends/request', alice.token, { username: bob.user.username });
  assert(dupe.status === 409, `duplicate friend request -> 409 (got ${dupe.status})`);

  const selfFriend = await api('/friends/request', alice.token, { username: alice.user.username });
  assert(selfFriend.status === 400, `requesting yourself -> 400 (got ${selfFriend.status})`);

  const bobFriends1 = await api('/friends', bob.token, null, 'GET');
  assert(bobFriends1.ok, "bob can view /friends");
  const incoming = bobFriends1.body.incoming.find(f => f.username === alice.user.username);
  assert(!!incoming, "bob's incoming list contains alice's request");

  const bobNotifs1 = await api('/notifications', bob.token, null, 'GET');
  assert(bobNotifs1.body.unread >= 1, `bob has an unread notification (got ${bobNotifs1.body.unread})`);
  const friendReqNotif = bobNotifs1.body.notifications.find(n => n.type === 'friend_request');
  assert(!!friendReqNotif && friendReqNotif.payload.from === alice.user.username,
    'the unread notification is a friend_request from alice');

  // live push: bob's socket should receive a 'notify' event in real time too
  const bobSocket = connectSocket(bob.token);
  await waitFor(bobSocket, 'connect');
  const carol = await freshUser('carol');
  const livePushPromise = waitFor(bobSocket, 'notify');
  await api('/friends/request', carol.token, { username: bob.user.username });
  const livePush = await livePushPromise;
  assert(!!livePush && livePush.type === 'friend_request', 'notification bell receives a live socket push, not just polling');

  const acceptRes = await api('/friends/accept', bob.token, { id: incoming.friendship_id });
  assert(acceptRes.ok, 'bob accepts alice\'s request');

  const aliceFriends = await api('/friends', alice.token, null, 'GET');
  const bobAsFriend = aliceFriends.body.friends.find(f => f.username === bob.user.username);
  assert(!!bobAsFriend, "alice's friends list now includes bob");
  // NOTE: bob's socket was already connected above (for the live-push
  // notification test), so by this point he is genuinely online — there's
  // no "offline" moment left to check in this flow. Presence itself is
  // proven live below by both a positive (connected) and negative
  // (disconnected) read straight from sockets.js's own presence map.
  assert(bobAsFriend.status === 'online', `bob shows online since his socket is connected (got "${bobAsFriend.status}")`);

  bobSocket.disconnect();
  await sleep(200); // let the server process the disconnect event
  const aliceFriendsAfterDisconnect = await api('/friends', alice.token, null, 'GET');
  const bobOffline = aliceFriendsAfterDisconnect.body.friends.find(f => f.username === bob.user.username);
  assert(bobOffline.status === 'offline', `bob shows offline after his socket disconnects (got "${bobOffline.status}")`);

  const bobSocket2 = connectSocket(bob.token);
  await waitFor(bobSocket2, 'connect');
  await sleep(150);
  const aliceFriends2 = await api('/friends', alice.token, null, 'GET');
  const bobOnline = aliceFriends2.body.friends.find(f => f.username === bob.user.username);
  assert(bobOnline.status === 'online', `bob shows online once his socket is connected (got "${bobOnline.status}")`);

  // notification bell mark-read
  const markRead = await api('/notifications/read', bob.token, {});
  assert(markRead.ok, 'mark-all-read succeeds');
  const bobNotifs2 = await api('/notifications', bob.token, null, 'GET');
  assert(bobNotifs2.body.unread === 0, `unread count is 0 after marking read (got ${bobNotifs2.body.unread})`);

  /* =======================================================================
   * UC-49  Unfriend (and: decline a pending request uses the same route)
   * ===================================================================== */
  log('\n# 49. Unfriend / decline');
  const unfriendRes = await api(`/friends/${bobAsFriend.friendship_id}`, alice.token, null, 'DELETE');
  assert(unfriendRes.ok, 'alice removes bob as a friend');
  const aliceFriends3 = await api('/friends', alice.token, null, 'GET');
  assert(!aliceFriends3.body.friends.some(f => f.username === bob.user.username), 'bob no longer appears in alice\'s friends list');

  // decline scenario: carol -> bob is still pending (from the live-push test above)
  const bobFriends2 = await api('/friends', bob.token, null, 'GET');
  const carolPending = bobFriends2.body.incoming.find(f => f.username === carol.user.username);
  assert(!!carolPending, 'setup: carol\'s request to bob is still pending');
  const declineRes = await api(`/friends/${carolPending.friendship_id}`, bob.token, null, 'DELETE');
  assert(declineRes.ok, 'bob declines carol\'s pending request via the same DELETE route');
  const bobFriends3 = await api('/friends', bob.token, null, 'GET');
  assert(!bobFriends3.body.incoming.some(f => f.username === carol.user.username), 'declined request no longer appears as incoming');

  // a third party cannot delete a friendship they are not part of
  const dave = await freshUser('dave');
  const req2 = await api('/friends/request', alice.token, { username: dave.user.username });
  const aliceOutgoing = await api('/friends', alice.token, null, 'GET');
  const daveFriendshipId = aliceOutgoing.body.outgoing.find(f => f.username === dave.user.username)?.friendship_id;
  const eve = await freshUser('eve');
  const wrongDelete = await api(`/friends/${daveFriendshipId}`, eve.token, null, 'DELETE');
  assert(wrongDelete.status === 403, `unrelated user deleting someone else's friendship -> 403 (got ${wrongDelete.status})`);

  /* =======================================================================
   * UC-50  Invite a friend to a room
   * ===================================================================== */
  log('\n# 50. Invite friend to room');
  // make alice & dave actual friends first (dave accepts alice's pending req above)
  const daveIncoming = (await api('/friends', dave.token, null, 'GET')).body.incoming.find(f => f.username === alice.user.username);
  await api('/friends/accept', dave.token, { id: daveIncoming.friendship_id });

  const room = await api('/room/create', alice.token, {});
  const code = room.body.room.code;
  const daveSocket = connectSocket(dave.token);
  await waitFor(daveSocket, 'connect');
  const invitePushPromise = waitFor(daveSocket, 'notify');
  const inviteRes = await api('/room/invite', alice.token, { username: dave.user.username });
  assert(inviteRes.ok, 'alice invites dave to her room');
  const invitePush = await invitePushPromise;
  assert(!!invitePush && invitePush.type === 'room_invite' && invitePush.payload.code === code,
    'dave receives a live room_invite notification pointing at the right room code');

  const inviteUnknownUser = await api('/room/invite', alice.token, { username: 'no_such_user_xyz' });
  assert(inviteUnknownUser.status === 404, `inviting a nonexistent username -> 404 (got ${inviteUnknownUser.status})`);

  /* =======================================================================
   * UC-52  View profile (own + public)
   * ===================================================================== */
  log('\n# 52. View profile');
  const ownProfile = await api('/profile', alice.token, null, 'GET');
  assert(ownProfile.ok, 'own profile loads');
  assert(ownProfile.body.user.username === alice.user.username, 'own profile has the right username');
  assert('email' in ownProfile.body.user, 'own profile includes email');
  assert(!('password_hash' in ownProfile.body.user), 'own profile never leaks password_hash');
  const stats = ownProfile.body.stats;
  for (const field of ['matches', 'khoti', 'myWins', 'draws', 'winPct', 'favoriteTrump', 'largestCollection', 'totalCollections', 'avgDurationMs']) {
    assert(field in stats, `stats object includes "${field}"`);
  }
  log('  NOTE: the app does not return an explicit "losses" count — only matches,');
  log('  myWins, draws, and khoti. Losses would have to be derived client-side');
  log('  as (matches - myWins - draws), which is not exactly right either since');
  log('  khoti overlaps with wins. Worth deciding if you want a real losses field.');

  const publicProfile = await api(`/profile/${bob.user.username}`, alice.token, null, 'GET');
  assert(publicProfile.ok, "viewing someone else's profile by username succeeds");
  assert(!('email' in publicProfile.body.user), "another user's email is not exposed on their public profile");

  const missingProfile = await api('/profile/no_such_user_xyz', alice.token, null, 'GET');
  assert(missingProfile.status === 404, `profile for a nonexistent username -> 404 (got ${missingProfile.status})`);

  /* =======================================================================
   * UC-53  "Change password" — CORRECTED, see note below
   * ===================================================================== */
  log('\n# 53. Password reset (there is no separate "change password" route)');
  log('  NOTE: profile.js has no authenticated change-password endpoint that');
  log('  takes a current + new password. The only way to change a password is');
  log('  the forgot/reset token flow in auth.js (POST /forgot -> POST /reset).');
  log('  Testing the flow that actually exists instead of one that does not.');
  const forgotRes = await api('/forgot', null, { email: alice.user.email });
  assert(forgotRes.ok, 'POST /forgot for a real email succeeds');
  assert(typeof forgotRes.body.devLink === 'string', 'dev mode returns a devLink instead of actually emailing');
  const resetToken = forgotRes.body.devLink.split('/reset/')[1];
  assert(!!resetToken, 'a reset token can be extracted from the dev link');

  const forgotUnknown = await api('/forgot', null, { email: 'nobody_xyz@nowhere.dev' });
  assert(forgotUnknown.ok, 'POST /forgot for an unknown email still returns 200 (no account enumeration)');
  assert(!forgotUnknown.body.devLink, 'no devLink is returned for an email that has no account');

  const badReset = await api('/reset', null, { token: 'not-a-real-token', password: 'newpassword123' });
  assert(badReset.status === 400, `reset with an invalid token -> 400 (got ${badReset.status})`);

  const resetRes = await api('/reset', null, { token: resetToken, password: 'newpassword123' });
  assert(resetRes.ok, 'reset with a valid token succeeds');

  const loginOld = await api('/login', null, { login: alice.user.username, password: 'password123' });
  assert(loginOld.status === 401, 'logging in with the OLD password now fails');
  const loginNew = await api('/login', null, { login: alice.user.username, password: 'newpassword123' });
  assert(loginNew.ok, 'logging in with the NEW password succeeds');
  alice.token = loginNew.body.token; // keep using a valid token for the rest of the run

  /* =======================================================================
   * UC-54  Match history (cloud)
   * ===================================================================== */
  log('\n# 54. Match history (cloud save)');
  const fakeRecord = {
    id: 'social_test_' + Date.now(), date: new Date().toISOString(),
    result: 'DRAW', score: { AC: 28, BD: 24, stranded: 0 },
    rounds: Array.from({ length: 13 }, (_, i) => ({ n: i + 1 })),
    collections: [{ round: 3, cards: 12 }], trump: 'S', durationMs: 60000, difficulty: 'normal'
  };
  const saveRes = await api('/matches', alice.token, fakeRecord);
  assert(saveRes.ok, 'saving a completed match record succeeds');

  const historyList = await api('/match-history', alice.token, null, 'GET');
  assert(historyList.ok && historyList.body.matches.some(m => m.client_id === fakeRecord.id), 'saved match appears in /match-history');

  const historyFull = await api('/match-history/full', alice.token, null, 'GET');
  const fullRec = historyFull.body.records.find(r => r.id === fakeRecord.id);
  assert(!!fullRec && fullRec.rounds.length === 13, 'the full record is retrievable and intact via /match-history/full');

  const malformedSave = await api('/matches', alice.token, { id: 'bad' /* missing result/score/rounds */ });
  assert(malformedSave.status === 400, `saving a malformed record -> 400 (got ${malformedSave.status})`);

  /* =======================================================================
   * UC-55  Guest constraints
   * ===================================================================== */
  log('\n# 55. Guest constraints');
  const guest = await freshGuest();
  assert(!!guest.user.is_guest, 'a minted guest is flagged is_guest');

  const guestFriendsList = await api('/friends', guest.token, null, 'GET');
  assert(guestFriendsList.status === 403, `guest hitting /friends -> 403 (got ${guestFriendsList.status})`);

  const guestFriendReq = await api('/friends/request', guest.token, { username: alice.user.username });
  assert(guestFriendReq.status === 403, `guest sending a friend request -> 403 (got ${guestFriendReq.status})`);

  const guestSaveMatch = await api('/matches', guest.token, fakeRecord);
  assert(guestSaveMatch.status === 403, `guest saving a match to the cloud -> 403 (got ${guestSaveMatch.status})`);

  const guestRoom = await api('/room/create', guest.token, {});
  assert(guestRoom.ok, 'guest CAN create a room (matches the app\'s intent)');

  const guestInvite = await api('/room/invite', guest.token, { username: alice.user.username });
  assert(guestInvite.status === 403, `guest trying to invite a friend to a room -> 403 (got ${guestInvite.status})`);

  const guestOwnProfile = await api('/profile', guest.token, null, 'GET');
  assert(guestOwnProfile.ok, 'guest can view their own profile');

  const guestViewsOther = await api(`/profile/${alice.user.username}`, guest.token, null, 'GET');
  assert(guestViewsOther.ok, "CORRECTION: guests CAN view other users' public profiles — no rejectGuests on GET /profile/:username");

  const guestNotifs = await api('/notifications', guest.token, null, 'GET');
  assert(guestNotifs.ok, 'CORRECTION: /notifications has no guest block either — a guest can call it (it will just be empty for them)');

  log(`\n== RESULTS: ${passed} passed, ${failed} failed ==`);
  bobSocket2.disconnect(); daveSocket.disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('TEST SCRIPT ERROR:', e); process.exit(1); });