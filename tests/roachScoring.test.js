const { computeRoachPoints, buildRoachProjections } = require('../src/rankings/roachScoring');

describe('computeRoachPoints', () => {
  it('scores a pure rusher/receiver correctly under Roach rules (0.1/yd, 6pt TD, 1pt rec)', () => {
    // 1000 rush yds, 10 rush TD, 50 rec, 500 rec yds, 5 rec TD
    const stats = { 24: 1000, 25: 10, 53: 50, 42: 500, 43: 5 };
    const pts = computeRoachPoints(stats, 'RB');
    // rush: 100 + 60 = 160; rec: 50 + 50 + 30 = 130; total 290
    expect(pts).toBeCloseTo(290, 1);
  });

  it('scores passing at 1pt/25yds, 4pt TD, -1 INT', () => {
    const stats = { 3: 4000, 4: 30, 20: 10 };
    const pts = computeRoachPoints(stats, 'QB');
    // 4000/25=160, 30*4=120, -10 => 270
    expect(pts).toBeCloseTo(270, 1);
  });

  it('scores a kicker on the flat base only (2/FG, 1/XP)', () => {
    const stats = { 83: 25, 86: 35 };
    const pts = computeRoachPoints(stats, 'K');
    expect(pts).toBeCloseTo(25 * 2 + 35, 1);
  });

  it('returns null for DST (not enough category data to score honestly)', () => {
    expect(computeRoachPoints({ 96: 40 }, 'DST')).toBeNull();
  });

  it('returns null when stats are missing entirely', () => {
    expect(computeRoachPoints(null, 'RB')).toBeNull();
  });
});

describe('buildRoachProjections', () => {
  it('builds a name-keyed lookup with Roach-scored points', () => {
    const espnPlayers = [
      { n: 'Test Runner', pos: 'RB', 24: 1000, 25: 10 },
      { n: 'Test Kicker', pos: 'K', 83: 20, 86: 30 },
    ];
    const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
    const lookup = buildRoachProjections(espnPlayers, norm);
    expect(lookup.get('testrunner').proj).toBeCloseTo(160, 1);
    expect(lookup.get('testkicker').proj).toBeCloseTo(70, 1);
  });
});
