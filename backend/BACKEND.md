# Electron Card - Backend Reference

Technical reference for the API, database, sockets, project layout, and environment configuration.

---

## Project Layout

```
backend/
  src/schema.sql        users, matches, friendships, rooms, room_players
  src/db.js             node:sqlite + prepared statements + tx()
  src/auth.js           JWT sign/verify + requireAuth middleware
  src/migrate.js        idempotent migrations, runs at boot
  src/match.js          per-room authoritative Match manager
  src/gameEngine.js     rules + bots (1:1 port of the client engine)
  src/sockets.js        authed Socket.io: presence map, room channels, friend notifications
  src/server.js         Express wiring + static SPA serving
  src/routes/
    auth.js             POST /register /login /forgot /reset /guest /guest/upgrade - GET /me
    profile.js          GET /profile[/:username] - match history - cloud save - import - user search
    friends.js          GET /friends - request / accept / remove
    rooms.js            create / join / leave / ready - GET /room/:code

frontend/
  src/game/             Phase 2 build, rules untouched
    template.js           game DOM
    game.css              game styles
    engine.js             game logic as mountElectronGame(root, {cloud, onExit})
  src/screens/          Login - Register - Hub - Profile - Friends - Rooms - Lobby - Play
  src/auth/             AuthContext (login/register/logout, session restore)
  src/api.ts            fetch wrapper with JWT
  src/socket.ts         Socket.io client singleton
```

---

## API

### Auth

```
POST /api/register            {username, email, password}        -> {token, user}
POST /api/login               {login, password}                  -> {token, user}
GET  /api/me
POST /api/forgot              {email}
POST /api/reset               {token, password}
POST /api/guest                                                   -> {token, user}
POST /api/guest/upgrade       {username, email, password}        -> {token, user}
```

### Profile & Matches

```
GET  /api/profile             -> {user, stats}
GET  /api/profile/:username
GET  /api/users/search?q=
GET  /api/match-history       (light rows)
GET  /api/match-history/full  (full records for the game engine)
POST /api/matches             (save one record)
POST /api/matches/import      {records:[...]}
```

### Friends

```
GET    /api/friends           -> {friends(+presence), incoming, outgoing}
POST   /api/friends/request   {username}
POST   /api/friends/accept    {id}
DELETE /api/friends/:id
```

### Rooms

```
POST /api/room/create         -> {room}  (6-char code, host seated at A)
POST /api/room/join           {code}    (seats fill A->C->B->D: partner first)
GET  /api/room/:code
POST /api/room/leave
POST /api/room/ready          {ready}
POST /api/room/seat           {seat}             manual seat selection
POST /api/room/lock           {locked}           host: lock/unlock seats
POST /api/room/kick           {userId}           host
POST /api/room/transfer       {userId}           host: transfer host role
POST /api/room/close                             host
POST /api/room/bot/add        {seat,difficulty}  host (easy|normal|hard)
POST /api/room/bot/remove     {seat}             host
POST /api/room/invite         {username}         invite a friend (sends notification)
POST /api/room/start                             host: begin the authoritative match
```

### Notifications

```
GET  /api/notifications       -> {notifications, unread}
POST /api/notifications/read  {id?}   one or all
```

---

## Socket Events

**Client to server:**
- `room:watch(code)` - subscribe to room state updates
- `room:unwatch(code)` - unsubscribe
- `presence:set('online'|'in_match')` - set your presence status
- `match:trump` - choose trump suit (validated server-side)
- `match:play` - play a card (validated server-side)
- `ping:rtt` - latency probe, ack immediately

**Server to client (room channel):**
- `match_started` - match has begun, includes personalized snapshot
- `match_state` - full personalized snapshot after every mutation (sequence-numbered)
- `card_played` - semantic event for animation
- `turn_changed` - whose turn it is
- `round_finished` - round summary
- `collection_triggered` - a team banked the pile
- `senior_changed` - Senior seat changed hands
- `match_event` - dealing / trump_chosen / misdeal / round_start / player_disconnected / player_reconnected
- `match_finished` - match over, includes full record
- `match_error` - invalid intent rejected

**Server to client (global):**
- `user_connected` / `user_disconnected` - friend presence
- `presence` - presence update
- `friends_changed` - friend list updated
- `room_state` / `room_joined` / `room_left` / `player_ready` - lobby updates

---

## How Cloud Save Works

The game routes all persistence through a storage wrapper. The cloud adapter injects into that wrapper without rewriting game logic:

1. On opening **Play**, any pre-account localStorage history is bulk-imported once (`POST /api/matches/import`, idempotent on the record's own id).
2. The server's full records (`GET /api/match-history/full`) seed the game's local cache - history, reports, statistics, and replays all work across devices.
3. Every finished match is written locally **and** `POST /api/matches` (write-through). Hot columns (result, scores, trump, largest collection, duration) are extracted for SQL-side statistics; the full JSON record powers replays.

---

## Guest Mode

Guests are first-class players. `POST /api/guest` mints a real (flagged) server identity with a silent JWT in one click - rooms, sockets, authoritative matches, anti-cheat, and reconnect all work unchanged.

The only difference is persistence: the server never stores guest match history. The final record arrives via `match_finished` and the client stores it locally (capped at 10 matches, oldest deleted first).

`POST /api/guest/upgrade` converts the guest in place (same user id, room membership survives) and the client imports its local history to the cloud. Nothing is lost.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `EC_JWT_SECRET` | (required in prod) | JWT signing secret |
| `EC_DB` | `backend/electron-card.db` | SQLite database file path |
| `PORT` | `3001` | Server port |
| `EC_TURN_MS` | `60000` | Human turn timer in ms |
| `EC_BOT_MS` | `1700` | Bot think time in ms |
| `EC_PAUSE_MS` | `1900` | Winner-highlight pause in ms |
| `EC_GAP_MS` | `1500` | Between-round gap in ms |

---

## Migrations

`backend/src/migrate.js` runs automatically at boot before any prepared statements are created. It is idempotent - safe to run against any existing database version.

---

## Integration Tests

```bash
# Multiplayer: two socket clients + two bots play a full match.
# Asserts anti-cheat, reconnect, and record persistence.
node backend/test-multiplayer.js

# Guest mode: guest host + registered peer + two bots.
# Asserts guest room creation, local-only history, cloud copy for registered player,
# and the upgrade -> import -> stats flow.
node backend/test-guest.js
```

Both tests require the server running on `:3001`.
