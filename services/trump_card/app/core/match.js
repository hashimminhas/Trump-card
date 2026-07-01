/* =====================================================
   Phase 3B - authoritative multiplayer match manager.

   One Match instance per playing room. The server owns the
   deck, hands, turns, timers, and every rule check. Clients
   send intents (choose_trump / play_card); the server
   validates against the actual game state and broadcasts
   results. Invalid actions are rejected with match_error.

   Anti-cheat by construction:
   - hands live only on the server; snapshots are personalized
   - card ownership, turn ownership, follow-suit, trump rules,
     ace restriction, and collection are all server-validated
===================================================== */

import {
  SEATS, TEAM, mulberry32, newDeck, shuffle, sameCard,
  legalMoves, trickWinner, botPick, botTrumpChoice, freshMemory
} from './gameEngine.js';
import { Matches } from '../database/db.js';

const TURN_MS = Number(process.env.EC_TURN_MS || 60000);   // human turn timer
const BOT_MS = Number(process.env.EC_BOT_MS || 1700);      // bot think time
const PAUSE_RESOLVE = Number(process.env.EC_PAUSE_MS || 1900); // winner-highlight pause
const GAP = Number(process.env.EC_GAP_MS || 1500);             // between-round gap

const DBG = !!process.env.EC_DEBUG;
const dlog = (...a) => DBG && console.log('[match]', ...a);
const matches = new Map(); // roomCode -> Match
export const matchFor = code => matches.get(code) || null;
export const matchOfUser = userId => {
  for (const m of matches.values()) if (m.userSeat(userId)) return m;
  return null;
};

export class Match {
  /**
   * @param room    row from rooms table
   * @param seating { A:{userId,username}|{bot:'normal'|'hard'|'easy'}, B:…, C:…, D:… }
   * @param io      socket.io server
   * @param onEnd   callback(roomCode) when the match finishes
   */
  constructor(room, seating, io, onEnd) {
    this.code = room.code;
    this.io = io;
    this.onEnd = onEnd;
    this.seating = seating;
    this.connected = new Set(SEATS.filter(s => !seating[s].bot)); // optimistic; sockets confirm
    this.seq = 0;
    this.timers = { turn: null, bot: null, flow: null };
    this.t0 = Date.now();

    const seed = (Date.now() ^ (Math.random() * 0xFFFFFFF)) >>> 0;
    const dealerIdx = Math.floor(Math.random() * 4);
    this.M = {
      seed, rng: mulberry32(seed),
      dealer: SEATS[dealerIdx],
      chooser: SEATS[(dealerIdx + 1) % 4],
      trump: null,
      hands: { A: [], B: [], C: [], D: [] },
      round: 0, senior: null, seniorAtStart: null,
      leadSuit: null, trick: [],
      pile: [], banks: { AC: [], BD: [] },
      lastCollectRound: -10,
      aceLock: null, aceRule: true,
      rounds: [], collections: [], misdeals: 0,
      mem: freshMemory(),
      phase: 'dealing', turn: null, turnDeadline: null,
      over: false
    };
    matches.set(this.code, this);
    this.deal();
  }

  /* ---------- helpers ---------- */
  userSeat(userId) {
    return SEATS.find(s => this.seating[s].userId === userId) || null;
  }
  isBot(seat) { return !!this.seating[seat].bot; }
  room() { return `room:${this.code}`; }
  emit(event, payload) { this.io.to(this.room()).emit(event, payload); }
  clearTimers() { for (const k of Object.keys(this.timers)) { clearTimeout(this.timers[k]); this.timers[k] = null; } }

  /* ---------- personalized state (never leak hands) ---------- */
  snapshot(forUserId = null) {
    const M = this.M;
    const seat = forUserId ? this.userSeat(forUserId) : null;
    const base = {
      seq: ++this.seq,
      code: this.code,
      phase: M.phase, round: M.round,
      trump: M.trump, dealer: M.dealer, chooser: M.chooser,
      senior: M.senior, seniorAtStart: M.seniorAtStart,
      turn: M.turn, turnDeadline: M.turnDeadline,
      leadSuit: M.leadSuit,
      trick: M.trick,
      pile: M.pile.length,
      banks: { AC: M.banks.AC.length, BD: M.banks.BD.length },
      handCounts: Object.fromEntries(SEATS.map(s => [s, M.hands[s].length])),
      aceLock: M.aceLock,
      collections: M.collections,
      roundsDone: M.rounds.length,
      players: Object.fromEntries(SEATS.map(s => [s, {
        username: this.seating[s].bot ? `BOT ${s}` : this.seating[s].username,
        bot: this.seating[s].bot || null,
        connected: this.seating[s].bot ? true : this.connected.has(s)
      }])),
      mySeat: seat
    };
    if (seat) {
      base.myHand = M.hands[seat];
      base.legal = (M.phase === 'play' && M.turn === seat) ? legalMoves(M, seat) : [];
      base.amChooser = M.phase === 'trump' && M.chooser === seat;
      if (base.amChooser) base.chooserCards = M.hands[seat]; // first five during selection
    }
    return base;
  }
  /** Push a personalized snapshot to every connected human + a hand-less one to spectators. */
  sync() {
    for (const s of SEATS) {
      const p = this.seating[s];
      if (!p.bot && p.userId) this.io.to(`user:${p.userId}`).emit('match_state', this.snapshot(p.userId));
    }
    this.io.to(`spect:${this.code}`).emit('match_state', this.snapshot(null));
  }

  /* ---------- dealing & trump ---------- */
  deal() {
    const M = this.M;
    M.phase = 'dealing'; M.trump = null; M.mem = freshMemory();
    const order = []; const di = SEATS.indexOf(M.dealer);
    for (let i = 1; i <= 4; i++) order.push(SEATS[(di + i) % 4]);
    const deck = shuffle(newDeck(), M.rng);
    M.hands = { A: [], B: [], C: [], D: [] };
    let ptr = 0;
    for (const s of order) for (let k = 0; k < 5; k++) M.hands[s].push(deck[ptr++]);
    this._restOfDeck = deck.slice(ptr);

    M.phase = 'trump';
    dlog(this.code, 'deal: dealer', M.dealer, 'chooser', M.chooser, 'misdeals', M.misdeals, 'chooserIsBot', this.isBot(M.chooser));
    this.emit('match_event', { type: 'dealing', dealer: M.dealer, chooser: M.chooser, misdeals: M.misdeals });
    if (this.isBot(M.chooser)) {
      this.timers.flow = setTimeout(() => this.applyTrump(M.chooser, botTrumpChoice(M, M.chooser)), BOT_MS);
    } else {
      M.turn = M.chooser;
      M.turnDeadline = Date.now() + TURN_MS;
      this.timers.turn = setTimeout(() => {
        if (this.M.phase === 'trump') this.applyTrump(M.chooser, botTrumpChoice(M, M.chooser), true);
      }, TURN_MS);
    }
    this.sync();
  }

  applyTrump(seat, suit, auto = false) {
    const M = this.M;
    dlog(this.code, 'applyTrump', seat, suit, 'auto', auto, 'phase', M.phase);
    if (M.phase !== 'trump') return { error: 'Trump already chosen.' };
    if (seat !== M.chooser) return { error: 'Only the Trump Chooser may pick.' };
    if (!['S', 'H', 'D', 'C'].includes(suit)) return { error: 'Invalid suit.' };
    this.clearTimers();
    M.turn = null; M.turnDeadline = null; // chooser's trump-timer turn must not leak into play phase
    M.trump = suit;
    // final deal +4 +4
    const order = []; const di = SEATS.indexOf(M.dealer);
    for (let i = 1; i <= 4; i++) order.push(SEATS[(di + i) % 4]);
    let ptr = 0;
    for (let w = 0; w < 2; w++) for (const s of order) for (let k = 0; k < 4; k++) M.hands[s].push(this._restOfDeck[ptr++]);
    this.emit('match_event', { type: 'trump_chosen', seat, suit, auto });

    // validation: every player must hold a trump
    const bad = SEATS.find(s => !M.hands[s].some(c => c.suit === M.trump));
    if (bad) {
      M.misdeals++;
      this.emit('match_event', { type: 'misdeal', seat: bad, count: M.misdeals });
      this.timers.flow = setTimeout(() => this.deal(), GAP + 700);
      this.sync();
      return { ok: true };
    }
    M.senior = M.chooser;
    M.phase = 'play';
    this.emit('senior_changed', { seat: M.senior, initial: true });
    this.timers.flow = setTimeout(() => this.startRound(), GAP);
    this.sync();
    return { ok: true };
  }

  /* ---------- rounds ---------- */
  startRound() {
    const M = this.M;
    M.round++;
    M.seniorAtStart = M.senior;
    M.leadSuit = null; M.trick = [];
    M.turn = M.senior;
    this.emit('match_event', { type: 'round_start', round: M.round, lead: M.senior });
    this.armTurn();
    this.sync();
  }

  armTurn() {
    const M = this.M;
    this.clearTimers();
    const seat = M.turn;
    dlog(this.code, 'armTurn', seat, this.isBot(seat) ? 'bot' : 'human');
    if (this.isBot(seat)) {
      M.turnDeadline = null;
      this.timers.bot = setTimeout(() => {
        const card = botPick(M, seat, this.seating[seat].bot);
        this.applyPlay(seat, card, false, true);
      }, BOT_MS);
    } else {
      M.turnDeadline = Date.now() + TURN_MS;
      this.emit('turn_changed', { seat, deadline: M.turnDeadline });
      this.timers.turn = setTimeout(() => {
        // timeout (or disconnected): auto-play lowest legal - match always continues
        const legal = legalMoves(M, seat);
        const low = [...legal].sort((a, b) =>
          ((a.suit === M.trump ? 100 : 0) + a.rank) - ((b.suit === M.trump ? 100 : 0) + b.rank))[0];
        this.applyPlay(seat, low, true, true);
      }, TURN_MS);
    }
  }

  /** Validate and apply a card play. All anti-cheat checks live here. */
  applyPlay(seat, card, auto = false, internal = false) {
    const M = this.M;
    dlog(this.code, 'applyPlay', seat, card && (card.suit + card.rank), 'auto', auto, 'turn', M.turn, 'phase', M.phase);
    if (M.over || M.phase !== 'play') return { error: 'No round in progress.' };
    if (M.turn !== seat) return { error: 'Not your turn.' };
    if (!internal && this.isBot(seat)) return { error: 'That seat is a bot.' };
    const owned = M.hands[seat].find(c => sameCard(c, card));
    if (!owned) return { error: "You don't hold that card." };
    const legal = legalMoves(M, seat);
    if (!legal.some(c => sameCard(c, owned))) {
      const why = M.trick.length === 0 ? 'Ace restriction blocks that lead.' : 'You must follow the lead suit.';
      return { error: why };
    }
    this.clearTimers();

    // commit
    M.hands[seat] = M.hands[seat].filter(c => !sameCard(c, owned));
    if (M.trick.length > 0 && owned.suit !== M.leadSuit) M.mem.voids[seat][M.leadSuit] = true;
    M.mem.played.push(owned);
    if (owned.suit === M.trump) M.mem.trumps++;
    M.trick.push({ seat, card: owned });
    if (M.trick.length === 1) {
      M.leadSuit = owned.suit;
      if (owned.rank !== 14) M.aceLock = null;
    }
    this.emit('card_played', { seat, card: owned, auto, trickLen: M.trick.length });

    if (M.trick.length < 4) {
      const idx = SEATS.indexOf(seat);
      M.turn = SEATS[(idx + 1) % 4];
      this.armTurn();
    } else {
      M.turn = null; M.turnDeadline = null;
      this.timers.flow = setTimeout(() => this.resolveRound(), PAUSE_RESOLVE);
    }
    this.sync();
    return { ok: true };
  }

  resolveRound() {
    const M = this.M;
    const win = trickWinner(M, M.trick);
    dlog(this.code, 'resolve R' + M.round, 'winner', win.seat);
    M.trick.forEach(p => M.pile.push(p.card));

    let collected = false, gained = 0;
    const onCooldown = (M.round === M.lastCollectRound + 1);

    // New rule: if a collection happened in round 12, then round 13 is
    // automatically collected by whoever was Senior at the start of round 13.
    const forceSeniorCollect = (M.round === 13 && M.lastCollectRound === 12);

    const canCollect = !forceSeniorCollect && (M.round >= 3) && (win.seat === M.seniorAtStart) && (!onCooldown || M.round === 13);
    if (forceSeniorCollect) {
      collected = true;
      gained = M.pile.length;
      // award to the team that was Senior at the start of this round
      M.banks[TEAM(M.seniorAtStart)].push(...M.pile);
      M.collections.push({ round: M.round, seat: M.seniorAtStart, team: TEAM(M.seniorAtStart), cards: gained });
      M.pile = [];
      M.lastCollectRound = M.round;
    } else if (canCollect) {
      collected = true;
      gained = M.pile.length;
      M.banks[TEAM(win.seat)].push(...M.pile);
      M.collections.push({ round: M.round, seat: win.seat, team: TEAM(win.seat), cards: gained });
      M.pile = [];
      M.lastCollectRound = M.round;
    }

    M.rounds.push({
      n: M.round, lead: M.seniorAtStart, leadSuit: M.leadSuit,
      plays: M.trick.map(p => ({ seat: p.seat, card: p.card })),
      winner: win.seat, winCard: win.card, collected,
      pileAfter: M.pile.length,
      totals: { AC: M.banks.AC.length, BD: M.banks.BD.length }
    });

    if (M.aceRule) {
      if (win.card.rank === 14 && M.round + 1 < 11) M.aceLock = win.seat;
      else if (M.round + 1 >= 11) M.aceLock = null;
    }
    const seniorChanged = M.senior !== win.seat;
    M.senior = win.seat;

    this.emit('round_finished', {
      round: M.round, winner: win.seat, winCard: win.card,
      why: win.card.suit === M.trump ? 'highest trump' : 'highest of lead suit',
      collected, gained, pileAfter: M.pile.length,
      banks: { AC: M.banks.AC.length, BD: M.banks.BD.length }
    });
    if (collected) this.emit('collection_triggered', { seat: win.seat, team: TEAM(win.seat), cards: gained, round: M.round });
    if (seniorChanged) this.emit('senior_changed', { seat: win.seat, initial: false });

    M.trick = []; M.leadSuit = null;
    if (M.round >= 13) {
      this.timers.flow = setTimeout(() => this.finish(), GAP);
    } else {
      this.timers.flow = setTimeout(() => this.startRound(), collected ? GAP + 800 : GAP);
    }
    this.sync();
  }

  finish() {
    const M = this.M;
    dlog(this.code, 'FINISH');
    M.over = true; M.phase = 'finished';
    this.clearTimers();
    const ac = M.banks.AC.length, bd = M.banks.BD.length, stranded = M.pile.length;
    let result = 'DRAW';
    if (ac === 52) result = 'KHOTI_AC';
    if (bd === 52) result = 'KHOTI_BD';

    const record = {
      id: 'mp' + Date.now(), date: new Date().toISOString(), seed: M.seed,
      dealer: M.dealer, chooser: M.chooser, trump: M.trump,
      result, score: { AC: ac, BD: bd, stranded },
      collections: M.collections, rounds: M.rounds, misdeals: M.misdeals,
      aceRule: M.aceRule, difficulty: 'online', durationMs: Date.now() - this.t0,
      mode: 'online', roomCode: this.code,
      seatNames: Object.fromEntries(SEATS.map(s => [s, this.seating[s].bot ? `BOT (${this.seating[s].bot})` : this.seating[s].username]))
    };
    // persist for every human participant - replays reproduce the match exactly
    const cols = record.collections;
    for (const s of SEATS) {
      const p = this.seating[s];
      if (p.bot || !p.userId || p.isGuest) continue; // guests keep history locally, not in the cloud
      Matches.insert.run({
        user_id: p.userId, client_id: record.id,
        result, score_ac: ac, score_bd: bd, stranded,
        trump: M.trump,
        largest_collection: cols.length ? Math.max(...cols.map(c => c.cards)) : 0,
        collections_count: cols.length,
        duration_ms: record.durationMs, difficulty: 'online',
        played_at: record.date, data: JSON.stringify(record),
        mode: 'online', room_code: this.code
      });
    }
    this.emit('match_finished', { record });
    this.sync();
    matches.delete(this.code);
    this.onEnd && this.onEnd(this.code);
  }

  /* ---------- connection lifecycle ---------- */
  markConnected(userId, on) {
    const seat = this.userSeat(userId);
    if (!seat) return;
    if (on) this.connected.add(seat); else this.connected.delete(seat);
    this.emit('match_event', { type: on ? 'player_reconnected' : 'player_disconnected', seat });
    this.sync();
    // NOTE: the match never blocks on a disconnect - the turn timer
    // auto-plays for absent players, and the seat stays reserved.
  }

  abort(reason) {
    this.clearTimers();
    this.emit('match_event', { type: 'aborted', reason });
    matches.delete(this.code);
    this.onEnd && this.onEnd(this.code);
  }
}
