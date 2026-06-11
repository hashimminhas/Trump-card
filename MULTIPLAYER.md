# Electron Card — Phase 3B: Multiplayer Architecture

## Principle: the server is the game

Phase 1/2 proved the rules client-side; Phase 3B moves authority to the server. The rules
engine (`backend/src/gameEngine.js`) is a 1:1 port of the proven client engine — pure
functions over a match state: legality (follow-suit, ace restriction), trick winner,
Senior, collection, KHOTI, plus the Easy/Normal/Hard bot brains with shared card memory.

`backend/src/match.js` owns one `Match` instance per playing room:

- **One deck, shuffled once on the server** (seeded PRNG; the seed is in the saved record).
- Hands exist **only in server memory**. Snapshots are *personalized*: you receive your own
  hand and (on your turn) your legal moves; everyone else is a card count. Spectators get
  a hand-less snapshot. Cheating by inspection is impossible because the data never leaves.
- Clients send **intents** (`match:trump`, `match:play`); the server validates card
  ownership, turn ownership, follow-suit, trump rules, ace restriction, and phase before
  committing. Invalid intents return `match_error` and change nothing.
- **Turn timer lives on the server** (60s, `EC_TURN_MS`). On expiry — or if the player is
  disconnected — the server plays their lowest legal card. A match can never stall.
- Bots fill any seat (`EC_BOT_MS` think time) using the same brains as single-player.
- Misdeal validation (a player with zero trumps) automatically reshuffles and redeals.

## State synchronization

Every mutation emits two things to the room channel:

1. A semantic **event** for animation/toasts: `card_played`, `turn_changed`,
   `round_finished`, `collection_triggered`, `senior_changed`, `match_event`
   (dealing / trump_chosen / misdeal / round_start / player_disconnected /
   player_reconnected), `match_finished`.
2. A fresh **`match_state` snapshot** (sequence-numbered) per connected human, personalized,
   plus a public one to the spectator channel. Clients are renderers: they can rebuild the
   entire UI from any single snapshot, so missed events are harmless.

## Reconnect

Sockets authenticate with the JWT. On any connection the server checks whether that user is
seated in a live match; if so it rejoins them to the room channel, marks the seat connected,
and pushes `match_started` + a full personalized snapshot — hand, turn, timers, everything.
This survives refresh, tab close, network drops, and device switches. While absent, the
seat is reserved and the turn timer auto-plays.

## Match records & replay

On finish the server builds a record **in the exact same format** as single-player matches
(rounds → plays → winner/collection/totals, plus seat names, mode `online`, room code) and
persists it to *every human participant's* account. That means the existing Phase 2 replay
system reproduces online matches move-for-move with zero new code — open Play → Match
history on any device.

## Rooms & lobby

Rooms persist in SQLite (host, seats, ready, lock flag, bots JSON, status open/playing).
Manual seat selection (`POST /room/seat`), host seat-locking, host controls (kick, transfer
host, close room, add/remove bot per seat with difficulty), friend invites (notification +
one-tap join), and spectators. Start requires all four seats covered (players or bots) and
every non-host human ready.

## Notifications & presence

A persistent notification center (SQLite `notifications` table) stores friend requests,
acceptances, and room invites; `notify` pushes them live. Presence (`online` / `in_match` /
`offline`) is in-memory, broadcast to friends, and set automatically by match lifecycle.

## Deferred 3A items — now done

Forgot/reset password (timed single-use tokens; dev mode returns the link, production plugs
an email provider into `sendResetEmail`), friend notifications, host controls, manual seats.

## Tuning knobs (env)

`EC_TURN_MS` human turn timer (60000) · `EC_BOT_MS` bot think (1700) ·
`EC_PAUSE_MS` winner-highlight pause (1900) · `EC_GAP_MS` between-round gap (1500) ·
`EC_JWT_SECRET` · `EC_DB` · `PORT`

## Verified by integration test

`backend/test-multiplayer.js` (run with the server up) plays a complete match with two
socket clients + two bots and asserts: 13 rounds, 52 cards accounted for, forged-card and
illegal-suit plays rejected, mid-match disconnect → reconnect with exact hand restoration,
server auto-play for the absent player, and replay records persisted to both accounts.
