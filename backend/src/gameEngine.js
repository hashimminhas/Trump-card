/* =====================================================
   Server-side Electron Card rules engine (Phase 3B).
   Pure functions + bot brains, ported 1:1 from the proven
   client engine. The server is the single source of truth;
   clients only render.
===================================================== */

export const SEATS = ['A', 'B', 'C', 'D'];
export const TEAM = s => (s === 'A' || s === 'C') ? 'AC' : 'BD';
export const SUITS = ['S', 'H', 'D', 'C'];

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function newDeck() {
  const d = [];
  for (const s of SUITS) for (let r = 2; r <= 14; r++) d.push({ suit: s, rank: r });
  return d;
}
export function shuffle(d, rng) {
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
export const sameCard = (a, b) => a && b && a.suit === b.suit && a.rank === b.rank;

/* ---------- rules (operate on a match state M) ---------- */
export function legalMoves(M, seat) {
  const hand = M.hands[seat];
  if (M.trick.length === 0) {
    if (M.aceRule && M.aceLock === seat && M.round < 11) {
      const non = hand.filter(c => c.rank !== 14);
      if (non.length) return non;            // only-aces edge case: all legal
    }
    return hand.slice();
  }
  const follow = hand.filter(c => c.suit === M.leadSuit);
  return follow.length ? follow : hand.slice();
}
export function beats(M, a, b) {
  if (a.suit === M.trump && b.suit !== M.trump) return true;
  if (a.suit !== M.trump && b.suit === M.trump) return false;
  if (a.suit === b.suit) return a.rank > b.rank;
  return false;
}
export function trickWinner(M, trick) {
  let best = trick[0];
  for (let i = 1; i < trick.length; i++) if (beats(M, trick[i].card, best.card)) best = trick[i];
  return best;
}
export const strength = (M, c) => (c.suit === M.trump ? 100 : 0) + c.rank;

/* ---------- bot brains (Normal + Hard, with shared memory) ---------- */
export function freshMemory() {
  return { played: [], trumps: 0, voids: { A: {}, B: {}, C: {}, D: {} } };
}
function memSeen(M, suit, rank, seat) {
  return M.mem.played.some(c => c.suit === suit && c.rank === rank) ||
         M.hands[seat].some(c => c.suit === suit && c.rank === rank);
}
function isBoss(M, card, seat) {
  for (let r = card.rank + 1; r <= 14; r++) if (!memSeen(M, card.suit, r, seat)) return false;
  return true;
}
function oppVoidIn(M, seat, suit) {
  return SEATS.some(o => TEAM(o) !== TEAM(seat) && M.mem.voids[o][suit]);
}
function trumpsOutside(M, seat) {
  const mine = M.hands[seat].filter(c => c.suit === M.trump).length;
  return 13 - M.mem.trumps - mine;
}
const lowestOf = (M, arr) => [...arr].sort((a, b) => strength(M, a) - strength(M, b))[0];
const highestOf = (M, arr) => [...arr].sort((a, b) => strength(M, b) - strength(M, a))[0];
function dumpCard(M, seat, legal) {
  const nt = legal.filter(c => c.suit !== M.trump);
  const pool = nt.length ? nt : legal;
  const nonBoss = pool.filter(c => !isBoss(M, c, seat));
  return lowestOf(M, nonBoss.length ? nonBoss : pool);
}

export function botPick(M, seat, difficulty = 'normal') {
  const legal = legalMoves(M, seat);
  if (legal.length === 1) return legal[0];
  if (difficulty === 'easy') return botEasy(M, seat, legal);
  if (difficulty === 'hard') return botHard(M, seat, legal);
  return botNormal(M, seat, legal);
}
function botEasy(M, seat, legal) {
  if (Math.random() < .35) return legal[Math.floor(Math.random() * legal.length)];
  if (M.trick.length === 0) return lowestOf(M, legal);
  const win = trickWinner(M, M.trick);
  if (TEAM(win.seat) === TEAM(seat)) return lowestOf(M, legal);
  const winners = legal.filter(c => beats(M, c, win.card));
  if (winners.length && Math.random() < .55) return lowestOf(M, winners);
  return lowestOf(M, legal);
}
function botNormal(M, seat, legal) {
  const asc = [...legal].sort((a, b) => strength(M, a) - strength(M, b));
  if (M.trick.length === 0) {
    if (M.round >= 3 && M.pile.length >= 8) return highestOf(M, legal);
    const strongNT = legal.filter(c => c.suit !== M.trump && c.rank >= 13);
    if (strongNT.length) return highestOf(M, strongNT);
    const nt = asc.filter(c => c.suit !== M.trump);
    return nt.length ? nt[0] : asc[0];
  }
  const win = trickWinner(M, M.trick);
  if (TEAM(win.seat) === TEAM(seat)) return dumpCard(M, seat, legal);
  const winners = legal.filter(c => beats(M, c, win.card)).sort((a, b) => strength(M, a) - strength(M, b));
  return winners.length ? winners[0] : dumpCard(M, seat, legal);
}
function botHard(M, seat, legal) {
  const stage = M.round <= 2 ? 'early' : (M.round <= 9 ? 'mid' : 'late');
  if (M.trick.length === 0) {
    const stake = M.pile.length + 4;
    const bosses = legal.filter(c => isBoss(M, c, seat));
    const safeBosses = bosses.filter(c => c.suit === M.trump || !oppVoidIn(M, seat, c.suit));
    if (M.round >= 3) {
      if (safeBosses.length) return stake >= 12 ? highestOf(M, safeBosses) : lowestOf(M, safeBosses);
      const myTr = legal.filter(c => c.suit === M.trump);
      if (myTr.length && trumpsOutside(M, seat) > 0 && isBoss(M, highestOf(M, myTr), seat) && stake >= 8)
        return highestOf(M, myTr);
      if (stake >= 12) return highestOf(M, legal);
      const safeLow = legal.filter(c => c.suit !== M.trump && !oppVoidIn(M, seat, c.suit));
      return safeLow.length ? lowestOf(M, safeLow) : dumpCard(M, seat, legal);
    }
    const nb = legal.filter(c => !isBoss(M, c, seat) && c.suit !== M.trump);
    return nb.length ? lowestOf(M, nb) : dumpCard(M, seat, legal);
  }
  const win = trickWinner(M, M.trick);
  const partnerWinning = TEAM(win.seat) === TEAM(seat);
  const last = M.trick.length === 3;
  const lead = M.trick[0].seat;
  const oppCollecting = M.round >= 3 && TEAM(lead) !== TEAM(seat);
  const stake = M.pile.length + 4;
  if (partnerWinning) {
    if (last || win.card.rank >= 12 || isBoss(M, win.card, seat)) return dumpCard(M, seat, legal);
    const winners = legal.filter(c => beats(M, c, win.card) && c.suit === M.leadSuit);
    if (winners.length && !oppCollecting && stage !== 'early' && stake >= 12 && TEAM(lead) !== TEAM(seat))
      return lowestOf(M, winners);
    return dumpCard(M, seat, legal);
  }
  const winners = legal.filter(c => beats(M, c, win.card)).sort((a, b) => strength(M, a) - strength(M, b));
  if (winners.length) {
    if (oppCollecting) return winners[0];
    if (stage === 'early' && isBoss(M, winners[0], seat) && winners[0].rank >= 13 && stake <= 8 && !last)
      return dumpCard(M, seat, legal);
    return winners[0];
  }
  return dumpCard(M, seat, legal);
}
export function botTrumpChoice(M, seat) {
  const five = M.hands[seat];
  let best = null, bs = -1;
  for (const s of SUITS) {
    const cs = five.filter(c => c.suit === s);
    const sc = cs.length * 20 + cs.reduce((a, c) => a + c.rank, 0);
    if (sc > bs) { bs = sc; best = s; }
  }
  return best;
}
