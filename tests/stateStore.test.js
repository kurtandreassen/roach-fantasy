const fs = require('fs');
const path = require('path');

const STATE_PATH = path.join(__dirname, '..', 'data', 'state', 'coach-state.json');

// Isolate this test file from any real state left on disk.
beforeEach(() => {
  if (fs.existsSync(STATE_PATH)) fs.unlinkSync(STATE_PATH);
  jest.resetModules();
});
afterAll(() => {
  if (fs.existsSync(STATE_PATH)) fs.unlinkSync(STATE_PATH);
});

describe('state store', () => {
  it('returns empty state when nothing has been saved yet', () => {
    const store = require('../src/state/store');
    const state = store.getFullState(null);
    expect(state.roster.players).toEqual([]);
    expect(state.roster.updatedAt).toBeNull();
    expect(state.derived.lineup).toBeNull();
  });

  it('persists a roster update and computes the derived lineup', () => {
    const store = require('../src/state/store');
    const players = [
      { name: 'Josh Allen', pos: 'QB', score: 24.1 },
      { name: 'Bijan Robinson', pos: 'RB', score: 19.8 },
    ];
    store.updateRoster(players);
    const state = store.getFullState(null);
    expect(state.roster.players).toEqual(players);
    expect(state.roster.updatedAt).not.toBeNull();
    expect(state.derived.lineup.starters.length).toBeGreaterThan(0);
  });

  it('survives a fresh require (real file persistence, not just in-memory)', () => {
    const store1 = require('../src/state/store');
    store1.updateRoster([{ name: 'Test Player', pos: 'WR', score: 10 }]);
    jest.resetModules();
    const store2 = require('../src/state/store');
    const state = store2.getFullState(null);
    expect(state.roster.players[0].name).toBe('Test Player');
  });

  it('computes waiver suggestions once both roster and free agents are set, given a board', () => {
    const store = require('../src/state/store');
    store.updateRoster([{ name: 'Owned RB', pos: 'RB', score: 15 }]);
    store.updateWaivers(['Free Agent RB']);
    const board = [
      { name: 'Owned RB', pos: 'RB', roachRank: 80 },
      { name: 'Free Agent RB', pos: 'RB', roachRank: 40 },
    ];
    const state = store.getFullState(board);
    expect(state.derived.waiverSuggestions).not.toBeNull();
    expect(state.derived.waiverSuggestions[0].add.name).toBe('Free Agent RB');
  });

  it('persists standings independently of roster/waivers', () => {
    const store = require('../src/state/store');
    const teams = [{ team: 'BuzzKill', record: '0-0-0', pointsFor: '0' }];
    store.updateStandings(teams);
    const state = store.getFullState(null);
    expect(state.standings.teams).toEqual(teams);
    expect(state.roster.players).toEqual([]);
  });
});
