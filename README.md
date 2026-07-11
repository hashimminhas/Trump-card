# Trump Card

> Charge the pile. Hold the Senior seat. Sweep all 52 ,or it's a draw.

A custom strategic 4-player card game with full online multiplayer, bots, replays, and statistics. Built with React + Node.js.

Full rules: [docs/game-rules.md](docs/game-rules.md)

---

## Features

- **Single-player** with Easy / Normal / Hard bots and a 60-second turn timer
- **Online multiplayer** with room codes, friend invites, and spectator mode
- **Reconnect** - drop mid-match and your seat is held; rejoin with your full hand restored
- **Guest mode** - play instantly with no account; upgrade later and keep your history
- **Match replays** - every match (solo and online) is recorded and replayable move-for-move
- **Statistics** - win rates, average collection size, favorite trump suit, match duration
- **Accessibility** - color-blind deck (diamonds blue, clubs green), reduced motion, larger text
- **Keyboard support** - left/right to select a card, Enter to play

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | React 18 + TypeScript + Vite |
| Backend | Node.js + Express + Socket.io |
| Database | SQLite via Node's built-in `node:sqlite` (zero native deps) |
| Auth | JWT (30-day tokens) + bcryptjs |
| CI/CD | GitHub Actions - test, build, security scan, publish to `ghcr.io` |

---

## Running Locally

Requires **Node 22+**.

```bash
# Backend
cd services/trump_card && npm install
npm run dev            # API + sockets on :3001

# Frontend (separate terminal)
cd apps/web && npm install
npm run dev             # Vite on :5173, proxies /api and /socket.io
```

Set `EC_JWT_SECRET` in production. The database is created automatically inside `services/trump_card/` (override the path with `EC_DB`).

### Running the test suite

```bash
cd services/trump_card
npm test                # banking + engine (pure logic, no server needed)
npm run test:rooms      # requires the server running - see tests/rooms.test.js header
npm run test:social     # requires the server running - see tests/social.test.js header
```

### Running with Docker

```bash
cd infra/docker
docker compose up --build
# Game:        http://localhost
# API health:  http://localhost:3001/api/health
```

---

## Documentation

- [Game Rules](docs/game-rules.md) - full rules, the Senior seat, collections, KHOTI
- [Backend](docs/backend.md) - API reference, database schema, environment variables
- [Multiplayer](docs/multiplayer.md) - room/match architecture, socket events, reconnect, guest mode

---

## Roadmap

Ranked mode, leaderboards, and tournaments. The spectator channel, deterministic match records, and per-room match instances are the foundations they will build on.