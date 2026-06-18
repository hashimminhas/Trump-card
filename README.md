# Trump Card

> Charge the pile. Hold the Senior seat. Sweep all 52 - or it's a draw.

A custom strategic 4-player card game with full online multiplayer, bots, replays, and statistics. Built with React + Node.js.

---

## What is Trump Card?

Trump Card is a trick-taking card game for exactly four players split into two teams. It is not a point game - there are no scores to chase round by round. The only way to win is to bank every single card in the deck. Anything less is a draw.

The tension comes from a shared central pile. Every round's four cards charge the pile, but a team can only claim it by holding the Senior seat at exactly the right moment. Lose the Senior seat and the pile resets the clock on collection.

---

## Teams

| Team | Seats | Position |
|------|-------|----------|
| AC | A (you) + C (partner) | opposite sides of the table |
| BD | B + D (opponents) | opposite sides of the table |

Partners sit across from each other. You and C are always on the same team.

---

## Before the Match Starts

One player is chosen as the Trump Chooser. They see their first five cards and pick the trump suit for the entire match. The Trump Chooser starts as the **Senior**.

Every player must hold at least one trump card. If any player holds zero trumps after the deal, it is a **misdeal** - the deck is reshuffled and re-dealt automatically.

---

## How Rounds Work

Thirteen rounds are played. Each round:

1. The Senior leads by playing any card face-up.
2. Every other player follows in turn order.
3. **You must follow the lead suit if you have it.** You may only play a different suit if you have no cards of the lead suit.
4. The round winner is determined:
   - If any trump cards were played, the highest trump wins.
   - If no trump was played, the highest card of the lead suit wins.
5. The round winner becomes the new **Senior** and leads the next round.

---

## The Senior Seat

The Senior seat is the most important position in the game. It determines:

- Who leads the next round.
- Whether a collection can happen.

Winning a round always passes the Senior seat to you. Losing a round means giving it up.

---

## The Pile and Collections

Every four cards played in a round go into the central pile - nobody owns them yet.

**From Round 3 onward**, a collection can happen:

> If the player who **started** the round as Senior also **wins** that round, their team banks the entire pile.

When a team banks the pile, those cards are theirs permanently and the pile resets to zero.

**Rounds 1 and 2 can never trigger a collection**, no matter what happens.

---

## The Ace Restriction

If you win a round by playing an **Ace**, you cannot lead an Ace on the very next round.

The restriction lifts as soon as any non-Ace card is led in that following round (by you or anyone).

The Ace restriction never applies from **Round 11 onward**.

---

## KHOTI - The Only Way to Win

A team wins by achieving **KHOTI**: banking all 52 cards.

There is no partial victory. If both teams have banked at least one card, or if any cards are stranded in the pile when the match ends, the result is a **draw**.

This means:
- A 48-4 card split is a draw.
- A 52-0 sweep is KHOTI.
- Cards left in the pile at the end belong to no one - they count against both teams.

---

## Quick Example

| Round | Senior at Start | Round Winner | Collection? |
|-------|----------------|--------------|-------------|
| 1 | A | B | No (Rounds 1-2 never collect) |
| 2 | B | B | No (Rounds 1-2 never collect) |
| 3 | B | B | Yes - BD banks the pile |
| 4 | B | C | No - Senior (B) didn't win |
| 5 | C | C | Yes - AC banks the pile |

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

## Running Locally

Requires **Node 22+**.

```bash
# Install
cd backend   && npm install
cd ../frontend && npm install

# Development (two terminals)
cd backend   && npm run dev    # API + sockets on :3001
cd frontend  && npm run dev    # Vite on :5173, proxies /api and /socket.io

# Production (single process)
cd frontend  && npm run build
cd ../backend && npm start     # serves the built SPA + API on :3001
```

Set `EC_JWT_SECRET` in production. The database is created automatically at `backend/electron-card.db` (override with `EC_DB`).

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | React 18 + TypeScript + Vite |
| Backend | Node.js + Express |
| Database | SQLite via Node's built-in `node:sqlite` (zero native deps) |
| Auth | JWT (30-day tokens) + bcryptjs |
| Realtime | Socket.io (presence + room channels) |

---

## Documentation

- [MULTIPLAYER.md](MULTIPLAYER.md) - Multiplayer architecture, socket events, reconnect, guest mode
- [BACKEND.md](BACKEND.md) - Full API reference, database schema, environment variables, project layout

---

## Roadmap

Ranked mode, leaderboards, and tournaments. The spectator channel, deterministic match records, and per-room match instances are the foundations they will build on.
