const path = require('path');
const { loadSeason, resolveTeams, pickOrderCorrelation, spearman } = require('../src/draftHistory/parseHistory');

const DATA_DIR = path.join(__dirname, '..', 'data', 'draft-history');

describe('parseHistory', () => {
  it('parses all 192 picks from a full season file', () => {
    const picks = loadSeason(DATA_DIR, 2023);
    expect(picks).toHaveLength(192);
    expect(picks[0].round).toBe(1);
    expect(picks[0].overallPick).toBe(1);
    expect(picks[191].round).toBe(16);
  });

  it('parses totalFpts/activeFpts when present', () => {
    const picks = loadSeason(DATA_DIR, 2023);
    expect(picks[0].totalFpts).toBeGreaterThan(0);
  });

  it('handles years with no FPTS columns without crashing', () => {
    const picks = loadSeason(DATA_DIR, 2024);
    expect(picks).toHaveLength(192);
    expect(picks[0].totalFpts).toBeNull();
  });

  it('finds a real negative correlation between pick order and points', () => {
    const picks = loadSeason(DATA_DIR, 2023);
    const rho = pickOrderCorrelation(picks);
    expect(rho).toBeLessThan(-0.3);
    expect(rho).toBeGreaterThan(-0.7);
  });

  it('resolveTeams correctly splits multi-word team names', () => {
    const picks = loadSeason(DATA_DIR, 2023).slice(0, 12);
    const teamNames = ['Malachi Crunch', 'Suq Madiq', 'Mike Hunt Smells', 'Dez Nuts', 'Team Rollaway',
      'Nicaraguan Crab Sandwich', "Jerry's Nub", 'Billy A', 'Frank Thomas', 'Appleseed', 'BuzzKill', 'BYE WEEK'];
    const resolved = resolveTeams(picks, teamNames);
    const buzzkillPick = resolved.find((p) => p.team === 'BuzzKill');
    expect(buzzkillPick).toBeDefined();
    expect(buzzkillPick.player).toContain('Diggs');
  });
});

describe('spearman', () => {
  it('returns 1 for a perfectly increasing relationship', () => {
    expect(spearman([[1, 1], [2, 2], [3, 3], [4, 4]])).toBeCloseTo(1, 5);
  });
  it('returns -1 for a perfectly decreasing relationship', () => {
    expect(spearman([[1, 4], [2, 3], [3, 2], [4, 1]])).toBeCloseTo(-1, 5);
  });
});
