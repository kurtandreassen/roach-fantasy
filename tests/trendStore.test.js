const fs = require('fs');
const path = require('path');

const TRENDS_PATH = path.join(__dirname, '..', 'data', 'state', 'weekly-trends.json');

beforeEach(() => {
  if (fs.existsSync(TRENDS_PATH)) fs.unlinkSync(TRENDS_PATH);
  jest.resetModules();
});
afterAll(() => {
  if (fs.existsSync(TRENDS_PATH)) fs.unlinkSync(TRENDS_PATH);
});

describe('trendStore', () => {
  it('returns an empty matrix when no weeks are recorded', () => {
    const store = require('../src/state/trendStore');
    const matrix = store.buildPlayerMatrix();
    expect(matrix.weeks).toEqual([]);
    expect(matrix.players).toEqual([]);
  });

  it('accumulates weeks instead of overwriting them', () => {
    const store = require('../src/state/trendStore');
    store.recordWeek(1, { BuzzKill: [{ name: 'Josh Allen', pos: 'QB', points: 24.1 }] }, []);
    store.recordWeek(2, { BuzzKill: [{ name: 'Josh Allen', pos: 'QB', points: 18.3 }] }, []);
    const matrix = store.buildPlayerMatrix();
    expect(matrix.weeks).toEqual([1, 2]);
    const allen = matrix.players.find((p) => p.name === 'Josh Allen');
    expect(allen.pointsByWeek).toEqual([24.1, 18.3]);
    expect(allen.total).toBeCloseTo(42.4, 1);
    expect(allen.avg).toBeCloseTo(21.2, 1);
  });

  it('re-syncing the same week overwrites only that week, not history', () => {
    const store = require('../src/state/trendStore');
    store.recordWeek(1, { BuzzKill: [{ name: 'Josh Allen', pos: 'QB', points: 24.1 }] }, []);
    store.recordWeek(2, { BuzzKill: [{ name: 'Josh Allen', pos: 'QB', points: 18.3 }] }, []);
    store.recordWeek(1, { BuzzKill: [{ name: 'Josh Allen', pos: 'QB', points: 30.0 }] }, []); // corrected week 1
    const matrix = store.buildPlayerMatrix();
    const allen = matrix.players.find((p) => p.name === 'Josh Allen');
    expect(allen.pointsByWeek).toEqual([30.0, 18.3]);
  });

  it('marks a player "Free Agent" until a roster claims them, without erasing rostered history', () => {
    const store = require('../src/state/trendStore');
    store.recordWeek(1, {}, [{ name: 'Waiver Guy', pos: 'RB', points: 12.0 }]);
    store.recordWeek(2, { BuzzKill: [{ name: 'Waiver Guy', pos: 'RB', points: 15.5 }] }, []);
    const matrix = store.buildPlayerMatrix();
    const wg = matrix.players.find((p) => p.name === 'Waiver Guy');
    expect(wg.team).toBe('BuzzKill'); // most recent team wins
    expect(wg.pointsByWeek).toEqual([12.0, 15.5]); // week 1 history preserved
  });

  it('leaves a bye/inactive week as null rather than zero', () => {
    const store = require('../src/state/trendStore');
    store.recordWeek(1, { BuzzKill: [{ name: 'Josh Allen', pos: 'QB', points: 24.1 }] }, []);
    store.recordWeek(2, { BuzzKill: [] }, []); // Allen not in this week's payload
    const matrix = store.buildPlayerMatrix();
    const allen = matrix.players.find((p) => p.name === 'Josh Allen');
    expect(allen.pointsByWeek).toEqual([24.1, null]);
    expect(allen.total).toBeCloseTo(24.1, 1); // null weeks excluded from total/avg
  });

  it('persists to disk across a fresh require', () => {
    const store1 = require('../src/state/trendStore');
    store1.recordWeek(1, { BuzzKill: [{ name: 'Test Player', pos: 'WR', points: 10 }] }, []);
    jest.resetModules();
    const store2 = require('../src/state/trendStore');
    const matrix = store2.buildPlayerMatrix();
    expect(matrix.players[0].name).toBe('Test Player');
  });
});
