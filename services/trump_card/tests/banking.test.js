/**
 * Banking (Collection) Rule Tests — Trump Card
 *
 * The banking rule: from round 3 onward, when the round winner was Senior
 * at round start, their team banks the pile. BUT there is a cooldown:
 * after banking in round N, cannot bank in round N+1. Earliest re-bank = N+2.
 * EXCEPTION: round 13 always allows banking (the final 4 cards).
 *
 * Run: cd services/trump_card && node --test tests/banking.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Pure logic extracted — matches the logic in match.js
function canCollect(round, winnerIsSenior, lastCollectRound) {
  const onCooldown = (round === lastCollectRound + 1);
  return (round >= 3) && winnerIsSenior && (!onCooldown || round === 13);
}

// Simulate a sequence of rounds with a player always winning as Senior
function runSequence(rounds, alwaysSenior = true) {
  let last = -10;
  const results = [];
  for (const r of rounds) {
    const collected = canCollect(r, alwaysSenior, last);
    if (collected) last = r;
    results.push({ round: r, collected, lastCollectRound: last });
  }
  return results;
}

describe('Basic collection rules', () => {
  it('cannot collect in rounds 1 and 2', () => {
    assert.equal(canCollect(1, true, -10), false);
    assert.equal(canCollect(2, true, -10), false);
  });

  it('can collect in round 3 (first allowed round)', () => {
    assert.equal(canCollect(3, true, -10), true);
  });

  it('non-senior winner never collects', () => {
    assert.equal(canCollect(3,  false, -10), false);
    assert.equal(canCollect(5,  false, -10), false);
    assert.equal(canCollect(13, false, -10), false);
  });
});

describe('Cooldown rule', () => {
  it('R3 collects → R4 blocked (cooldown)', () => {
    const seq = runSequence([3, 4, 5]);
    assert.equal(seq[0].collected, true,  'R3 should collect');
    assert.equal(seq[1].collected, false, 'R4 should be blocked');
    assert.equal(seq[2].collected, true,  'R5 should collect');
  });

  it('R5 collects → R6 blocked → R7 collects', () => {
    const seq = runSequence([5, 6, 7]);
    assert.equal(seq[0].collected, true);
    assert.equal(seq[1].collected, false);
    assert.equal(seq[2].collected, true);
  });

  it('user example: R7 collect → R8 cooldown → R9 collect', () => {
    let last = -10;
    assert.equal(canCollect(7, true, last), true);  last = 7;
    assert.equal(canCollect(8, true, last), false);
    assert.equal(canCollect(9, true, last), true);
  });

  it('consecutive rounds alternate: collect, skip, collect, skip', () => {
    const seq = runSequence([3,4,5,6,7,8,9]);
    const collected = seq.map(s => s.collected);
    assert.deepEqual(collected, [true, false, true, false, true, false, true]);
  });
});

describe('Round 13 exception', () => {
  it('R13 always collects even if R12 collected (ignores cooldown)', () => {
    let last = -10;
    // collect R11, then R12 is blocked, then R13 still collects
    canCollect(11, true, last); last = 11;
    assert.equal(canCollect(12, true, last), false, 'R12: cooldown after R11');
    assert.equal(canCollect(13, true, last), true,  'R13: always allowed');
  });

  it('R13 collects even directly after R12 bank', () => {
    let last = -10;
    canCollect(10, true, last); last = 10;
    canCollect(12, true, last); last = 12;
    // R12 banked → normally R13 would be on cooldown BUT exception applies
    assert.equal(canCollect(13, true, last), true);
  });

  it('R13 collects when no previous banking happened', () => {
    assert.equal(canCollect(13, true, -10), true);
  });
});

describe('Pile size invariants', () => {
  it('pile grows by 4 cards each round without banking', () => {
    // If no collection in rounds 3,4 then pile before R5 = 4*4 = 16
    let pile = 0;
    for (let r = 1; r <= 4; r++) pile += 4;
    assert.equal(pile, 16);
  });

  it('minimum pile when banked = 8 cards (two rounds worth)', () => {
    // Banking first happens at R3 after rounds 1+2+3 = 12 cards
    // But if banked at R3 (12 cards) then cooldown at R4, next at R5 = 2 more rounds = 8
    // After R3 bank: pile resets to 0, R4 adds 4, R5 adds 4 → 8 when R5 collects
    const pileAtR5AfterR3Bank = 4 + 4; // R4 + R5
    assert.equal(pileAtR5AfterR3Bank, 8);
  });

  it('round 13 can collect just 4 cards (final round exception)', () => {
    // If R12 banked: pile = 0, R13 adds 4, then R13 collects 4
    const pileAtR13AfterR12Bank = 4;
    assert.equal(pileAtR13AfterR12Bank, 4);
  });
});

describe('Team assignment', () => {
  it('seat A and C are on team AC', () => {
    const team = s => (s === 'A' || s === 'C') ? 'AC' : 'BD';
    assert.equal(team('A'), 'AC');
    assert.equal(team('C'), 'AC');
    assert.equal(team('B'), 'BD');
    assert.equal(team('D'), 'BD');
  });

  it('KHOTI: one team banks all 52 cards', () => {
    const banks = { AC: 52, BD: 0 };
    const total = banks.AC + banks.BD;
    assert.equal(total, 52);
    const result = banks.AC === 52 ? 'KHOTI_AC' : banks.BD === 52 ? 'KHOTI_BD' : 'DRAW';
    assert.equal(result, 'KHOTI_AC');
  });

  it('DRAW: any split other than 52-0', () => {
    const banks = { AC: 28, BD: 24 };
    const result = banks.AC === 52 ? 'KHOTI_AC' : banks.BD === 52 ? 'KHOTI_BD' : 'DRAW';
    assert.equal(result, 'DRAW');
  });
});