const { optimizeLineup } = require('../src/coach/lineupOptimizer');

function player(name, pos, score) {
  return { name, pos, score };
}

describe('optimizeLineup', () => {
  it('fills all 10 starting slots when the roster is deep enough', () => {
    const roster = [
      player('QB1', 'QB', 20), player('QB2', 'QB', 15),
      player('RB1', 'RB', 25), player('RB2', 'RB', 20), player('RB3', 'RB', 15),
      player('WR1', 'WR', 22), player('WR2', 'WR', 21), player('WR3', 'WR', 14),
      player('TE1', 'TE', 12), player('TE2', 'TE', 8),
      player('K1', 'K', 9),
      player('DST1', 'DST', 7),
    ];
    const { starters, bench } = optimizeLineup(roster);
    expect(starters).toHaveLength(10);
    expect(bench).toHaveLength(2);
  });

  it('fills the flex slots with the best remaining eligible players', () => {
    const roster = [
      player('QB1', 'QB', 20),
      player('RB1', 'RB', 30), player('RB2', 'RB', 28), player('RB3', 'RB', 26),
      player('WR1', 'WR', 25), player('WR2', 'WR', 24), player('WR3', 'WR', 23),
      player('TE1', 'TE', 10),
      player('K1', 'K', 9),
      player('DST1', 'DST', 7),
    ];
    const { slots } = optimizeLineup(roster);
    // dedicated RB/WR filled with the top 2 each, so the 3rd-best RB and WR
    // compete for the two flex spots against TE1 (score 10) — RB3 (26) and
    // WR3 (23) should both beat TE1 into the flexes.
    const flexNames = [...slots['WR/TE'], ...slots['RB/WR/TE']].map((p) => p.name);
    expect(flexNames).toEqual(expect.arrayContaining(['RB3', 'WR3']));
  });

  it('never starts the same player twice', () => {
    const roster = [
      player('QB1', 'QB', 20),
      player('RB1', 'RB', 25), player('RB2', 'RB', 20),
      player('WR1', 'WR', 22), player('WR2', 'WR', 21),
      player('TE1', 'TE', 12),
      player('K1', 'K', 9),
      player('DST1', 'DST', 7),
    ];
    const { starters } = optimizeLineup(roster);
    const names = starters.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('leaves a slot empty rather than erroring when the roster is short a position', () => {
    const roster = [player('QB1', 'QB', 20)];
    const { starters, slots } = optimizeLineup(roster);
    expect(starters).toHaveLength(1);
    expect(slots.RB).toHaveLength(0);
  });
});
