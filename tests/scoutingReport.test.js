const fs = require('fs');
const path = require('path');

const TRENDS_PATH = path.join(__dirname, '..', 'data', 'state', 'weekly-trends.json');
const SCHEDULE_PATH = path.join(__dirname, '..', 'data', 'state', 'schedule.json');

beforeEach(() => {
  if (fs.existsSync(TRENDS_PATH)) fs.unlinkSync(TRENDS_PATH);
  if (fs.existsSync(SCHEDULE_PATH)) fs.unlinkSync(SCHEDULE_PATH);
  jest.resetModules();
});
afterAll(() => {
  if (fs.existsSync(TRENDS_PATH)) fs.unlinkSync(TRENDS_PATH);
  if (fs.existsSync(SCHEDULE_PATH)) fs.unlinkSync(SCHEDULE_PATH);
});

describe('scoutingReport', () => {
  it('computes optimal but leaves actual null when no started flags are present', () => {
    const trendStore = require('../src/state/trendStore');
    const { weekReport } = require('../src/analysis/scoutingReport');
    trendStore.recordWeek(1, {
      BuzzKill: [
        { name: 'QB A', pos: 'QB', points: 20 },
        { name: 'RB A', pos: 'RB', points: 10 },
        { name: 'RB B', pos: 'RB', points: 8 },
        { name: 'WR A', pos: 'WR', points: 12 },
        { name: 'WR B', pos: 'WR', points: 9 },
        { name: 'TE A', pos: 'TE', points: 7 },
        { name: 'K A', pos: 'K', points: 6 },
        { name: 'DST A', pos: 'DST', points: 5 },
      ],
    }, []);
    const report = weekReport(1);
    expect(report.teams.BuzzKill.actual).toBeNull();
    expect(report.teams.BuzzKill.optimal).toBeGreaterThan(0);
  });

  it('computes actual, regret, and missed swaps when started flags are present', () => {
    const trendStore = require('../src/state/trendStore');
    const { weekReport } = require('../src/analysis/scoutingReport');
    trendStore.recordWeek(1, {
      BuzzKill: [
        { name: 'QB A', pos: 'QB', points: 20, started: true },
        { name: 'RB A', pos: 'RB', points: 5, started: true },
        { name: 'RB B', pos: 'RB', points: 3, started: true },
        { name: 'RB C', pos: 'RB', points: 4, started: true },
        { name: 'WR A', pos: 'WR', points: 12, started: true },
        { name: 'WR B', pos: 'WR', points: 9, started: true },
        { name: 'WR C', pos: 'WR', points: 1, started: true },
        { name: 'TE A', pos: 'TE', points: 7, started: true },
        { name: 'K A', pos: 'K', points: 6, started: true },
        { name: 'DST A', pos: 'DST', points: 5, started: true },
        { name: 'Bench Guy', pos: 'RB', points: 20, started: false },
      ],
    }, []);
    const report = weekReport(1);
    const r = report.teams.BuzzKill;
    expect(r.actual).toBe(72);
    expect(r.optimal).toBeGreaterThan(r.actual);
    expect(r.regret).toBeGreaterThan(0);
    expect(r.missedSwaps.length).toBeGreaterThan(0);
    expect(r.missedSwaps[0].startInstead).toBe('Bench Guy');
    expect(r.missedSwaps[0].satPlayer).toBe('RB B');
  });

  it('returns null for an unrecorded week', () => {
    const { weekReport } = require('../src/analysis/scoutingReport');
    expect(weekReport(99)).toBeNull();
  });

  it('flags 3-week rising and falling trends', () => {
    const { trendAlerts } = require('../src/analysis/scoutingReport');
    const matrix = {
      players: [
        { name: 'Riser', pos: 'WR', team: 'BuzzKill', pointsByWeek: [5, 10, 15] },
        { name: 'Faller', pos: 'RB', team: 'BuzzKill', pointsByWeek: [20, 12, 4] },
        { name: 'Flat', pos: 'TE', team: 'BuzzKill', pointsByWeek: [8, 8, 8] },
        { name: 'TooFew', pos: 'QB', team: 'BuzzKill', pointsByWeek: [10, null] },
      ],
    };
    const alerts = trendAlerts(matrix);
    expect(alerts.rising.find((a) => a.name === 'Riser')).toBeTruthy();
    expect(alerts.falling.find((a) => a.name === 'Faller')).toBeTruthy();
    expect(alerts.rising.find((a) => a.name === 'Flat')).toBeUndefined();
    expect(alerts.falling.find((a) => a.name === 'Flat')).toBeUndefined();
    expect(alerts.rising.find((a) => a.name === 'TooFew')).toBeUndefined();
  });

  it('caps rising/falling to the top movers and can filter by team', () => {
    const { trendAlerts } = require('../src/analysis/scoutingReport');
    const players = [];
    for (let i = 1; i <= 5; i++) {
      players.push({ name: `Riser${i}`, pos: 'WR', team: 'BuzzKill', pointsByWeek: [1, 5, i + 5] });
    }
    players.push({ name: 'WaiverGuy', pos: 'RB', team: 'Free Agent', pointsByWeek: [1, 5, 20] });
    const matrix = { players };

    const all = trendAlerts(matrix);
    expect(all.rising.length).toBe(3);
    expect(all.rising[0].name).toBe('WaiverGuy'); // biggest swing first

    const faOnly = trendAlerts(matrix, { team: 'Free Agent' });
    expect(faOnly.rising.length).toBe(1);
    expect(faOnly.rising[0].name).toBe('WaiverGuy');
  });

  it('builds a season efficiency table sorted by worst regret first', () => {
    const trendStore = require('../src/state/trendStore');
    const { seasonEfficiencyTable } = require('../src/analysis/scoutingReport');
    const roster = (started) => [
      { name: 'QB A', pos: 'QB', points: 20, started: true },
      { name: 'RB A', pos: 'RB', points: 10, started: true },
      { name: 'RB B', pos: 'RB', points: started ? 30 : 8, started },
      { name: 'WR A', pos: 'WR', points: 12, started: true },
      { name: 'WR B', pos: 'WR', points: 9, started: true },
      { name: 'TE A', pos: 'TE', points: 7, started: true },
      { name: 'K A', pos: 'K', points: 6, started: true },
      { name: 'DST A', pos: 'DST', points: 5, started: true },
    ];
    trendStore.recordWeek(1, { BuzzKill: roster(false), Rival: roster(true) }, []);
    const table = seasonEfficiencyTable();
    expect(table[0].team).toBe('BuzzKill');
    expect(table[0].regret).toBeGreaterThan(table[1].regret);
  });

  it('returns null when the schedule has no matchup for that team/week', () => {
    const { getMatchup } = require('../src/analysis/scoutingReport');
    expect(getMatchup(1, 'BuzzKill', [])).toBeNull();
  });

  it('builds a matchup with projected scores and slot edges from board proj', () => {
    const trendStore = require('../src/state/trendStore');
    const scheduleStore = require('../src/state/scheduleStore');
    const { getMatchup } = require('../src/analysis/scoutingReport');

    scheduleStore.recordWeek(1, [{ home: 'BuzzKill', away: 'Rival' }]);
    trendStore.recordWeek(1, {
      BuzzKill: [{ name: 'Star QB', pos: 'QB', points: 20 }],
      Rival: [{ name: 'Weak QB', pos: 'QB', points: 5 }],
    }, []);

    const board = [
      { name: 'Star QB', pos: 'QB', proj: 340, roachRank: 3 },
      { name: 'Weak QB', pos: 'QB', proj: 170, roachRank: 40 },
    ];

    const matchup = getMatchup(1, 'BuzzKill', board);
    expect(matchup.opponent).toBe('Rival');
    expect(matchup.projected.self).toBeGreaterThan(matchup.projected.opponent);
    const qbEdge = matchup.edgeBySlot.find((e) => e.slot === 'QB');
    expect(qbEdge.edge).toBeGreaterThan(0);
  });
});
