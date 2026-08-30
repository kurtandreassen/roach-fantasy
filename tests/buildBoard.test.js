const { buildBoard } = require('../src/rankings/buildBoard');

describe('buildBoard', () => {
  const sample = [
    { name: 'Elite RB', pos: 'RB', team: 'AAA', ecr: 2, tier: 1, adp: 2, sd: '1.0', bye: '6' },
    { name: 'Elite WR', pos: 'WR', team: 'BBB', ecr: 1, tier: 1, adp: 1, sd: '0.8', bye: '7' },
    { name: 'Uncertain RB', pos: 'RB', team: 'CCC', ecr: 40, tier: 5, adp: 60, sd: '15.0', bye: '9' },
    { name: 'Uncertain TE', pos: 'TE', team: 'DDD', ecr: 41, tier: 5, adp: 45, sd: '15.0', bye: '10' },
    { name: 'Late K', pos: 'K', team: 'EEE', ecr: 200, tier: 10, adp: 210, sd: '8.0', bye: '11' },
  ];

  it('never moves a locked (low-disagreement) pick', () => {
    const board = buildBoard(sample);
    const eliteRb = board.find((p) => p.name === 'Elite RB');
    const eliteWr = board.find((p) => p.name === 'Elite WR');
    // sd < 4 => zero adjustment => roachRank order matches ecr order
    expect(eliteWr.roachRank).toBeLessThan(eliteRb.roachRank);
  });

  it('nudges RB up and TE down when disagreement is high', () => {
    const board = buildBoard(sample);
    const rb = board.find((p) => p.name === 'Uncertain RB');
    const te = board.find((p) => p.name === 'Uncertain TE');
    // RB started at ecr 40, TE at ecr 41 (RB already ahead) — after the
    // positive RB nudge and negative TE nudge the gap should widen.
    expect(te.roachScore - rb.roachScore).toBeGreaterThan(te.ecr - rb.ecr);
  });

  it('assigns every player a unique roachRank', () => {
    const board = buildBoard(sample);
    const ranks = board.map((p) => p.roachRank);
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it('computes valueGap as adp minus roachRank', () => {
    const board = buildBoard(sample);
    for (const p of board) {
      if (p.adp != null) {
        expect(p.valueGap).toBe(p.adp - p.roachRank);
      }
    }
  });
});
