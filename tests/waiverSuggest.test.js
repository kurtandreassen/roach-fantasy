const { suggestWaivers } = require('../src/coach/waiverSuggest');

const board = [
  { name: 'Star RB', pos: 'RB', roachRank: 5 },
  { name: 'Owned RB', pos: 'RB', roachRank: 80 },
  { name: 'Bench RB', pos: 'RB', roachRank: 150 },
  { name: 'Free Agent WR', pos: 'WR', roachRank: 60 },
  { name: 'Owned WR', pos: 'WR', roachRank: 40 },
];

describe('suggestWaivers', () => {
  it('only suggests players who are actually free agents', () => {
    const suggestions = suggestWaivers(board, ['Owned RB', 'Owned WR'], ['Bench RB', 'Free Agent WR']);
    const names = suggestions.map((s) => s.add.name);
    expect(names).toEqual(expect.arrayContaining(['Bench RB', 'Free Agent WR']));
    expect(names).not.toContain('Owned RB');
  });

  it('sorts suggestions by roachRank (best first)', () => {
    const suggestions = suggestWaivers(board, ['Owned RB', 'Owned WR'], ['Bench RB', 'Free Agent WR']);
    expect(suggestions[0].add.name).toBe('Free Agent WR');
  });

  it('flags a drop candidate as the worst rostered player at the same position', () => {
    const suggestions = suggestWaivers(board, ['Owned RB', 'Owned WR'], ['Bench RB']);
    expect(suggestions[0].dropCandidate.name).toBe('Owned RB');
  });

  it('marks isUpgrade false when the free agent is worse than the roster\'s weakest at that position', () => {
    const suggestions = suggestWaivers(board, ['Owned RB'], ['Bench RB']);
    expect(suggestions[0].isUpgrade).toBe(false);
  });

  it('marks isUpgrade true when no rostered player exists at that position', () => {
    const suggestions = suggestWaivers(board, [], ['Free Agent WR']);
    expect(suggestions[0].isUpgrade).toBe(true);
  });
});
