const fs = require('fs');
const path = require('path');

const SCHEDULE_PATH = path.join(__dirname, '..', 'data', 'state', 'schedule.json');

beforeEach(() => {
  if (fs.existsSync(SCHEDULE_PATH)) fs.unlinkSync(SCHEDULE_PATH);
  jest.resetModules();
});
afterAll(() => {
  if (fs.existsSync(SCHEDULE_PATH)) fs.unlinkSync(SCHEDULE_PATH);
});

describe('scheduleStore', () => {
  it('returns null for an opponent when no schedule is synced', () => {
    const store = require('../src/state/scheduleStore');
    expect(store.getOpponent(1, 'BuzzKill')).toBeNull();
  });

  it('finds the opponent on either side of a matchup', () => {
    const store = require('../src/state/scheduleStore');
    store.recordWeek(1, [{ home: 'BuzzKill', away: 'Iron Roosters' }, { home: 'Malachi Crunch', away: 'Whytt\'s Wagers' }]);
    expect(store.getOpponent(1, 'BuzzKill')).toBe('Iron Roosters');
    expect(store.getOpponent(1, 'Iron Roosters')).toBe('BuzzKill');
    expect(store.getOpponent(1, 'Whytt\'s Wagers')).toBe('Malachi Crunch');
  });

  it('returns null for a team on bye that week', () => {
    const store = require('../src/state/scheduleStore');
    store.recordWeek(1, [{ home: 'BuzzKill', away: 'Iron Roosters' }]);
    expect(store.getOpponent(1, 'Gridiron Gremlins')).toBeNull();
  });

  it('re-syncing a week overwrites only that week', () => {
    const store = require('../src/state/scheduleStore');
    store.recordWeek(1, [{ home: 'BuzzKill', away: 'Iron Roosters' }]);
    store.recordWeek(2, [{ home: 'BuzzKill', away: 'Malachi Crunch' }]);
    store.recordWeek(1, [{ home: 'BuzzKill', away: 'Whytt\'s Wagers' }]);
    expect(store.getOpponent(1, 'BuzzKill')).toBe('Whytt\'s Wagers');
    expect(store.getOpponent(2, 'BuzzKill')).toBe('Malachi Crunch');
  });
});
