const fs = require('fs');
const path = require('path');

const TRENDS_PATH = path.join(__dirname, '..', 'data', 'state', 'weekly-trends.json');
const COACH_STATE_PATH = path.join(__dirname, '..', 'data', 'state', 'coach-state.json');

beforeEach(() => {
  if (fs.existsSync(TRENDS_PATH)) fs.unlinkSync(TRENDS_PATH);
  if (fs.existsSync(COACH_STATE_PATH)) fs.unlinkSync(COACH_STATE_PATH);
  jest.resetModules();
});
afterAll(() => {
  if (fs.existsSync(TRENDS_PATH)) fs.unlinkSync(TRENDS_PATH);
  if (fs.existsSync(COACH_STATE_PATH)) fs.unlinkSync(COACH_STATE_PATH);
});

// A minimal board: roachRank determines value (lower = better). Positions
// chosen so surplus/gap math is easy to reason about by hand.
const board = [
  { name: 'My QB1', pos: 'QB', roachRank: 5, proj: 300 },
  { name: 'My RB1', pos: 'RB', roachRank: 8, proj: 250 },
  { name: 'My RB2', pos: 'RB', roachRank: 20, proj: 180 },
  { name: 'My RB3', pos: 'RB', roachRank: 60, proj: 90 },
  { name: 'My RB4', pos: 'RB', roachRank: 65, proj: 85 },
  { name: 'My RB5', pos: 'RB', roachRank: 70, proj: 80 }, // 5th RB -> surplus beyond threshold 4
  { name: 'My WR1', pos: 'WR', roachRank: 10, proj: 240 },
  { name: 'My TE1', pos: 'TE', roachRank: 100, proj: 60 }, // weak TE = my gap
  { name: 'My K1', pos: 'K', roachRank: 150, proj: 90 },
  { name: 'My DST1', pos: 'DST', roachRank: 160, proj: 80 },

  { name: 'Rival QB1', pos: 'QB', roachRank: 6, proj: 295 },
  { name: 'Rival RB1', pos: 'RB', roachRank: 90, proj: 60 }, // Rival's only RB, weak -> their gap
  { name: 'Rival WR1', pos: 'WR', roachRank: 11, proj: 235 },
  { name: 'Rival TE1', pos: 'TE', roachRank: 15, proj: 150 }, // Rival's best TE, better than mine
  { name: 'Rival TE2', pos: 'TE', roachRank: 40, proj: 100 },
  { name: 'Rival TE3', pos: 'TE', roachRank: 45, proj: 95 }, // 3rd TE -> surplus for Rival (threshold 2)
  { name: 'Rival K1', pos: 'K', roachRank: 155, proj: 88 },
  { name: 'Rival DST1', pos: 'DST', roachRank: 165, proj: 78 },
];

function seedTrends(trendStore) {
  trendStore.recordWeek(1, {
    BuzzKill: [
      { name: 'My QB1', pos: 'QB', points: 20 },
      { name: 'My RB1', pos: 'RB', points: 15 },
      { name: 'My RB2', pos: 'RB', points: 10 },
      { name: 'My RB3', pos: 'RB', points: 5 },
      { name: 'My RB4', pos: 'RB', points: 4 },
      { name: 'My RB5', pos: 'RB', points: 3 },
      { name: 'My WR1', pos: 'WR', points: 14 },
      { name: 'My TE1', pos: 'TE', points: 2 },
      { name: 'My K1', pos: 'K', points: 6 },
      { name: 'My DST1', pos: 'DST', points: 5 },
    ],
    Rival: [
      { name: 'Rival QB1', pos: 'QB', points: 19 },
      { name: 'Rival RB1', pos: 'RB', points: 14 },
      { name: 'Rival WR1', pos: 'WR', points: 13 },
      { name: 'Rival TE1', pos: 'TE', points: 10 },
      { name: 'Rival TE2', pos: 'TE', points: 6 },
      { name: 'Rival TE3', pos: 'TE', points: 5 },
      { name: 'Rival K1', pos: 'K', points: 6 },
      { name: 'Rival DST1', pos: 'DST', points: 5 },
    ],
  }, []);
}

describe('tradeFinder', () => {
  it('returns [] when no rosters are synced', () => {
    const { generateTradeIdeas } = require('../src/analysis/tradeFinder');
    expect(generateTradeIdeas('BuzzKill', board)).toEqual([]);
  });

  it('proposes a double-need trade: my RB surplus fills their RB gap, their TE surplus fills mine', () => {
    const trendStore = require('../src/state/trendStore');
    seedTrends(trendStore);
    const { generateTradeIdeas } = require('../src/analysis/tradeFinder');

    const ideas = generateTradeIdeas('BuzzKill', board);
    expect(ideas.length).toBe(1);
    const idea = ideas[0];
    expect(idea.team).toBe('Rival');
    expect(idea.give[0].pos).toBe('RB'); // their weakest position, my surplus
    expect(idea.get[0].pos).toBe('TE'); // my weakest position, their surplus
    expect(idea.likelihood).toBe('high');
    expect(idea.reasoning.length).toBeGreaterThan(0);
    // My RB5 (proj 80) for Rival TE3 (proj 95): a net gain for me.
    expect(idea.projSwing).toBeCloseTo(15, 5);
    expect(idea.give[0].proj).toBe(80);
    expect(idea.get[0].proj).toBe(95);
  });

  it('carries season-to-date actual production (avg/total/games) on each asset', () => {
    const trendStore = require('../src/state/trendStore');
    seedTrends(trendStore);
    const { generateTradeIdeas } = require('../src/analysis/tradeFinder');

    const idea = generateTradeIdeas('BuzzKill', board)[0];
    expect(idea.give[0].seasonAvg).toBe(3); // My RB5 scored 3 pts in the one synced week
    expect(idea.give[0].gamesPlayed).toBe(1);
    expect(idea.get[0].seasonAvg).toBe(5); // Rival TE3 scored 5 pts
    expect(idea.get[0].gamesPlayed).toBe(1);
  });

  it('gives the best (lowest roachRank) surplus player, not just any surplus player', () => {
    const trendStore = require('../src/state/trendStore');
    seedTrends(trendStore);
    const { generateTradeIdeas } = require('../src/analysis/tradeFinder');

    const idea = generateTradeIdeas('BuzzKill', board)[0];
    expect(idea.give[0].name).toBe('My RB5'); // 5th-best RB, first one beyond the surplus threshold
  });

  it('computeSurplus only flags players beyond the position threshold', () => {
    const { computeSurplus } = require('../src/analysis/tradeFinder');
    const roster = [
      { name: 'A', pos: 'RB', roachRank: 1 },
      { name: 'B', pos: 'RB', roachRank: 2 },
      { name: 'C', pos: 'RB', roachRank: 3 },
      { name: 'D', pos: 'RB', roachRank: 4 },
      { name: 'E', pos: 'RB', roachRank: 5 },
    ];
    const surplus = computeSurplus(roster);
    expect(surplus.RB.map((p) => p.name)).toEqual(['E']); // threshold 4, only the 5th is surplus
  });
});
