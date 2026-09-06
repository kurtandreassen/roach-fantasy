const { byeInactiveAlerts, pointValueByPosition, leagueFabTendencies } = require('../src/analysis/coachGuidance');

describe('coachGuidance', () => {
  describe('byeInactiveAlerts', () => {
    const board = [
      { name: 'Bye Guy', pos: 'RB', bye: '7' },
      { name: 'Playing Guy', pos: 'WR', bye: '9' },
      { name: 'No Bye Data', pos: 'TE', bye: null },
    ];
    const roster = [
      { name: 'Bye Guy', pos: 'RB' },
      { name: 'Playing Guy', pos: 'WR' },
      { name: 'No Bye Data', pos: 'TE' },
      { name: 'Not On Board', pos: 'K' },
    ];

    it('returns [] when there is no upcoming week to check against', () => {
      expect(byeInactiveAlerts(roster, board, null)).toEqual([]);
    });

    it('flags only rostered players whose bye matches the upcoming week', () => {
      const alerts = byeInactiveAlerts(roster, board, 7);
      expect(alerts).toEqual([{ name: 'Bye Guy', pos: 'RB', bye: '7' }]);
    });

    it('flags nobody when the upcoming week matches no byes', () => {
      expect(byeInactiveAlerts(roster, board, 12)).toEqual([]);
    });
  });

  describe('pointValueByPosition', () => {
    it('computes a bigger edge for a position with a steep proj drop-off', () => {
      const board = [
        ...Array.from({ length: 30 }, (_, i) => ({ name: `RB${i}`, pos: 'RB', proj: 300 - i * 8 })), // steep drop
        ...Array.from({ length: 30 }, (_, i) => ({ name: `TE${i}`, pos: 'TE', proj: 150 - i * 1 })), // flat
      ];
      const result = pointValueByPosition(board);
      expect(result.RB.edge).toBeGreaterThan(result.TE.edge);
      expect(result.RB.avgStartableProj).toBeGreaterThan(result.RB.replacementProj);
    });

    it('skips a position entirely absent from the board', () => {
      const board = [{ name: 'Solo QB', pos: 'QB', proj: 300 }];
      const result = pointValueByPosition(board);
      expect(result.RB).toBeUndefined();
      expect(result.QB).toBeDefined();
    });
  });

  describe('leagueFabTendencies', () => {
    it('sums only WON bids per team and sorts by total spent descending', () => {
      const history = [
        { team: 'Rival', amount: 20, won: true },
        { team: 'Rival', amount: 5, won: false },
        { team: 'BuzzKill', amount: 10, won: true },
        { team: 'BuzzKill', amount: 8, won: true },
      ];
      const rows = leagueFabTendencies(history, { Rival: 280, BuzzKill: 282 });
      expect(rows[0].team).toBe('Rival'); // 20 total spent > BuzzKill's 18
      expect(rows.find((r) => r.team === 'Rival').totalSpent).toBe(20);
      expect(rows.find((r) => r.team === 'Rival').bidCount).toBe(1); // the losing bid excluded
      expect(rows.find((r) => r.team === 'BuzzKill').totalSpent).toBe(18);
      expect(rows.find((r) => r.team === 'BuzzKill').remaining).toBe(282);
    });

    it('returns [] with no bid history', () => {
      expect(leagueFabTendencies([], {})).toEqual([]);
    });
  });
});
