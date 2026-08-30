const fs = require('fs');
const path = require('path');

const BIDS_PATH = path.join(__dirname, '..', 'data', 'state', 'bids.json');

beforeEach(() => {
  if (fs.existsSync(BIDS_PATH)) fs.unlinkSync(BIDS_PATH);
  jest.resetModules();
});
afterAll(() => {
  if (fs.existsSync(BIDS_PATH)) fs.unlinkSync(BIDS_PATH);
});

describe('bidStore', () => {
  it('returns empty state when nothing is synced', () => {
    const store = require('../src/state/bidStore');
    expect(store.allBids()).toEqual([]);
    expect(store.readBids().budgets.teams).toEqual({});
  });

  it('accumulates bid weeks and flattens them with week numbers attached', () => {
    const store = require('../src/state/bidStore');
    store.recordWeek(1, [{ player: 'A', pos: 'RB', team: 'Rival', amount: 12, won: true }]);
    store.recordWeek(2, [{ player: 'B', pos: 'WR', team: 'BuzzKill', amount: 8, won: false }]);
    const all = store.allBids();
    expect(all).toEqual([
      { player: 'A', pos: 'RB', team: 'Rival', amount: 12, won: true, week: 1 },
      { player: 'B', pos: 'WR', team: 'BuzzKill', amount: 8, won: false, week: 2 },
    ]);
  });

  it('re-syncing a week overwrites only that week', () => {
    const store = require('../src/state/bidStore');
    store.recordWeek(1, [{ player: 'A', pos: 'RB', team: 'Rival', amount: 12, won: true }]);
    store.recordWeek(1, [{ player: 'A', pos: 'RB', team: 'Rival', amount: 20, won: true }]);
    expect(store.allBids()).toHaveLength(1);
    expect(store.allBids()[0].amount).toBe(20);
  });

  it('stores and returns per-team remaining budgets', () => {
    const store = require('../src/state/bidStore');
    store.recordBudgets({ BuzzKill: 62, Rival: 40 });
    expect(store.readBids().budgets.teams).toEqual({ BuzzKill: 62, Rival: 40 });
  });
});
