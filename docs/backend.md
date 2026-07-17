# Backend Reference

Technical reference for the API, database, sockets, and environment configuration.

---

## Project Layout

```
services/trump_card/
  app/
    main.js                   Express + Socket.io entry point
    metrics.js                Prometheus metrics (prom-client)
    middleware/auth.js        JWT verification middleware
    routers/
      auth.js                 register, login, guest, forgot, reset
      profile.js              profile, match history, user search
      friends.js              friend requests, accept, remove
      rooms.js                create, join, leave, ready, seat, bots
      notifications.js        notification center
    core/
      match.js                per-room authoritative Match manager
      gameEngine.js           rules + bots (1:1 port of client engine)
    database/
      db.js                   node:sqlite + prepared statements
      migrate.js              idempotent migrations, runs at boot
      schema.sql              users, matches, friendships, rooms, notifications
    websockets/
      sockets.js              Socket.io: presence, room channels, friend notifications

apps/web/src/
  screens/                    Login, Register, Hub, Profile, Friends, Rooms, Lobby, Play
  game/                       engine.js, template.js, game.css
  auth/AuthContext.tsx         session management
  api.ts                      fetch wrapper with JWT
  socket.ts                   Socket.io client singleton
```

---

## API

### Auth

```
POST /api/register            {username, email, password}   → {token, user}
POST /api/login               {login, password}             → {token, user}
GET  /api/me
POST /api/forgot              {email}
POST /api/reset               {token, password}
POST /api/guest                                             → {token, user}
POST /api/guest/upgrade       {username, email, password}   → {token, user}
```

### Profile & Matches

```
GET  /api/profile
GET  /api/profile/:username
GET  /api/users/search?q=
GET  /api/match-history
GET  /api/match-history/full
POST /api/matches
POST /api/matches/import      {records:[...]}
```

### Friends

```
GET    /api/friends
POST   /api/friends/request   {username}
POST   /api/friends/accept    {id}
DELETE /api/friends/:id
```

### Rooms

```
POST /api/room/create
POST /api/room/join           {code}
GET  /api/room/:code
POST /api/room/leave
POST /api/room/ready          {ready}
POST /api/room/seat           {seat}
POST /api/room/lock           {locked}
POST /api/room/kick           {userId}
POST /api/room/transfer       {userId}
POST /api/room/close
POST /api/room/bot/add        {seat, difficulty}
POST /api/room/bot/remove     {seat}
POST /api/room/invite         {username}
POST /api/room/start
```

### Notifications

```
GET  /api/notifications
POST /api/notifications/read  {id?}
```

### Observability

```
GET  /api/health              → {ok: true}
GET  /api/metrics             Prometheus text format (scraped by Prometheus server)
```

---

## Socket Events

**Client → server:**
- `room:watch(code)` / `room:unwatch(code)`
- `presence:set('online'|'in_match')`
- `match:trump` — choose trump suit
- `match:play` — play a card
- `ping:rtt` — latency probe

**Server → client (room channel):**
- `match_started`, `match_state`, `match_finished`, `match_error`
- `card_played`, `turn_changed`, `round_finished`
- `collection_triggered`, `senior_changed`, `match_event`

**Server → client (global):**
- `user_connected` / `user_disconnected`
- `friends_changed`, `room_state`, `room_joined`, `room_left`

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `EC_JWT_SECRET` | required | JWT signing secret |
| `EC_DB` | `trump-card.db` | SQLite database path |
| `PORT` | `3001` | Server port |
| `EC_TURN_MS` | `60000` | Human turn timer (ms) |
| `EC_BOT_MS` | `1700` | Bot think time (ms) |
| `EC_PAUSE_MS` | `1900` | Winner-highlight pause (ms) |
| `EC_GAP_MS` | `1500` | Between-round gap (ms) |

---

## Tests

```bash
cd services/trump_card

# Unit tests — no server needed
npm test

# Integration tests — server must be running on :3001
npm run test:rooms
npm run test:social

# Full multiplayer flow (two socket clients + two bots, full match)
node tests/test-multiplayer.js

# Guest mode flow
node tests/test-guest.js
```