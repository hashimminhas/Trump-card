# Electron Card - Phase 3C

Fully synchronized online multiplayer. The server owns the deck, hands, turns, timers, and every
rule check; clients only render. All Phase 1/2 game rules and features are preserved - the complete
single-player game still runs unmodified inside the React shell, and online matches save replays
in the exact same format.

See **MULTIPLAYER.md** for the architecture and the complete socket event reference.

## What's new in 3C - Guest mode & room accessibility

- **Play as Guest** on the sign-in screen: one click mints a lightweight server identity
  (`Guest-48372`-style, no email, no password, flagged `is_guest`) and a silent JWT - so rooms,
  sockets, authoritative matches, anti-cheat, and reconnect all work for guests **unchanged**.
  The identity is stored locally (`ec.guest`) and resumes on return visits.
- **Guest persistence is local**: single-player and online match records, replays, reports,
  statistics, and settings live in the browser, capped at the **10 most recent matches**
  (oldest deleted first). The server never stores guest match history.
- **Room link sharing**: the lobby shows *Copy code* and *Copy invite link*
  (`/room/ABX72Q`). Opening an invite link while signed out shows Login / Sign Up /
  **Play as Guest**, and guests are seated instantly on arrival - no account wall.
- **Guest limitations** (enforced server-side with friendly upsell messages): no friends list,
  no friend invites, no cloud history, no cross-device sync, no account recovery.
- **Account upgrade**: *Create account* converts the guest **in place** (same user id -
  room membership survives), then the client imports its local history to the cloud:
  matches, statistics, and replays are preserved.
- New endpoints: `POST /api/guest`, `POST /api/guest/upgrade {username,email,password}`.
- New test: `backend/test-guest.js` - guest host + registered peer + two bots play a full
  match; asserts guest room creation/joining, local-only guest history, cloud copy for the
  registered player, and the upgrade → import → stats flow.
- Fixed a race where a human trump chooser's turn marker leaked into the play phase,
  allowing a round-0 trick that could stall the match (also the cause of a rare 3B test flake).

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Backend | Node.js + Express |
| Database | SQLite via Node's built-in `node:sqlite` (zero native deps) |
| Auth | JWT (30-day tokens) + bcryptjs password hashing |
| Realtime | Socket.io (presence + room channels) |

## Running it

Requires **Node 22+** (for the built-in SQLite module).

```bash
# 1. install
cd backend  && npm install
cd ../frontend && npm install

# 2. development (two terminals)
cd backend  && npm run dev      # API + sockets on :3001
cd frontend && npm run dev      # Vite on :5173, proxies /api and /socket.io

# 3. production (single process)
cd frontend && npm run build
cd ../backend && npm start      # serves the built SPA + API on :3001
```

Set `EC_JWT_SECRET` in production. The database file is created automatically
(`backend/electron-card.db`; override with `EC_DB`).

## What's new in 3B

- **Authoritative multiplayer**: `backend/src/gameEngine.js` (rules + bots ported 1:1) and
  `backend/src/match.js` (per-room Match: one server shuffle, personalized snapshots, server-side
  60s turn timer with auto-play, misdeal redeal, anti-cheat validation of ownership / turn /
  follow-suit / ace restriction).
- **Reconnect**: refresh or drop mid-match → seat reserved, auto-rejoin with full hand/turn restore.
- **Lobby 2.0**: manual seat selection, host controls (lock seats, kick, transfer host, close room,
  add/remove bots with difficulty), friend invites, ping indicator, spectate.
- **Spectator mode**: watch live matches; spectators never receive hands.
- **Notification center**: persistent friend requests / acceptances / room invites + live push,
  bell with unread badge, one-tap invite join.
- **Password reset**: `POST /api/forgot` + `POST /api/reset` (dev returns the link; production
  plugs an email provider into `sendResetEmail`).
- **Migrations**: `backend/src/migrate.js` runs automatically at boot - safe on 3A databases.
- **Integration test**: `backend/test-multiplayer.js` plays a full match over real sockets and
  asserts anti-cheat, reconnect, and record persistence.

## Layout

```
backend/
  src/schema.sql        users, matches, friendships, rooms, room_players
  src/db.js             node:sqlite + prepared statements + tx()
  src/auth.js           JWT sign/verify + requireAuth middleware
  src/routes/auth.js    POST /register /login · GET /me
  src/routes/profile.js GET /profile[/​:username] · match history · cloud save · import · user search
  src/routes/friends.js GET /friends · request / accept / remove
  src/routes/rooms.js   create / join / leave / ready · GET /room/:code
  src/sockets.js        authed Socket.io: presence map, room channels, friend notifications
  src/server.js         Express wiring + static SPA serving
frontend/
  src/game/             THE GAME - Phase 2 build, rules untouched
    template.js           game DOM (verbatim)
    game.css              game styles (verbatim)
    engine.js             game logic wrapped as mountElectronGame(root, {cloud, onExit})
  src/screens/          Login · Register · Hub · Profile · Friends · Rooms · Lobby · Play
  src/auth/             AuthContext (login/register/logout, session restore)
  src/api.ts            fetch wrapper with JWT
  src/socket.ts         Socket.io client singleton
```

## How cloud save works

The game already routed all persistence through a storage wrapper, so Phase 3A injects a
**cloud adapter** instead of rewriting anything:

1. On opening **Play**, any pre-account localStorage history is bulk-imported once
   (`POST /api/matches/import`, idempotent on the record's own id).
2. The server's full records (`GET /api/match-history/full`) seed the game's local cache -
   history, reports, statistics, and replays all work across devices.
3. Every finished match is written locally **and** `POST /api/matches` (write-through).
   Hot columns (result, scores, trump, largest collection, duration) are extracted for
   SQL-side statistics; the full JSON record powers replays.

## API

```
POST /api/register            {username, email, password} → {token, user}
POST /api/login               {login, password}           → {token, user}
GET  /api/me
GET  /api/profile             → {user, stats}
GET  /api/profile/:username
GET  /api/users/search?q=
GET  /api/match-history       (light rows)
GET  /api/match-history/full  (full records for the game)
POST /api/matches             (save one record)
POST /api/matches/import      {records:[…]}
GET  /api/friends             → {friends(+presence), incoming, outgoing}
POST /api/friends/request     {username}
POST /api/friends/accept      {id}
DELETE /api/friends/:id
POST /api/room/create         → {room}  (6-char code, host seated at A)
POST /api/room/join           {code}    (seats fill A→C→B→D: partner first)
GET  /api/room/:code
POST /api/room/leave
POST /api/room/ready          {ready}
POST /api/room/seat           {seat}            manual seat selection
POST /api/room/lock           {locked}          host: lock/unlock seats
POST /api/room/kick           {userId}          host
POST /api/room/transfer       {userId}          host: transfer host
POST /api/room/close                            host
POST /api/room/bot/add        {seat,difficulty} host (easy|normal|hard)
POST /api/room/bot/remove     {seat}            host
POST /api/room/invite         {username}        invite a friend (notification)
POST /api/room/start                            host: begin the authoritative match
POST /api/forgot              {email}
POST /api/reset               {token, password}
GET  /api/notifications       → {notifications, unread}
POST /api/notifications/read  {id?}             one or all
```

## Socket events

Client → server: `room:watch(code)` · `room:unwatch(code)` · `presence:set('online'|'in_match')`
Server → client: `user_connected` · `user_disconnected` · `presence` · `friends_changed` ·
`room_state` · `room_joined` · `room_left` · `player_ready`

The game emits `in_match` presence when a match starts and `online` when it ends -
friends see "in match" live.

## Next (Phase 3B follow-ups)

Ranked mode, leaderboards, and tournaments - the spectator channel, deterministic records,
and per-room match instances are the foundations they'll build on.
