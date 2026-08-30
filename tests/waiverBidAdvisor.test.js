const { adviseBid, positionComps } = require('../src/analysis/waiverBidAdvisor');

describe('waiverBidAdvisor', () => {
  describe('positionComps', () => {
    it('returns null with no history at that position', () => {
      expect(positionComps([], 'RB')).toBeNull();
      expect(positionComps([{ pos: 'WR', amount: 10, won: true }], 'RB')).toBeNull();
    });

    it('prefers won bids over all bids when both exist', () => {
      const history = [
        { pos: 'RB', amount: 5, won: false },
        { pos: 'RB', amount: 20, won: true },
        { pos: 'RB', amount: 10, won: true },
      ];
      const comps = positionComps(history, 'RB');
      expect(comps.median).toBe(15); // median of the two WON bids (10, 20), not all three
      expect(comps.wonCount).toBe(2);
      expect(comps.sampleSize).toBe(3);
    });
  });

  describe('adviseBid', () => {
    const fa = { name: 'Waiver Guy', pos: 'RB', roachRank: 80, proj: 120 };

    it('falls back to a position-tier default with no bid history', () => {
      const advice = adviseBid(fa, null, [], null, null, null);
      expect(advice.suggestedBid).toBeGreaterThan(0);
      expect(advice.comps).toBeNull();
      expect(advice.reasons.some((r) => r.includes('No synced bid history'))).toBe(true);
    });

    it('raises the bid and marks must-bid when it fills a need and is trending', () => {
      const withoutSignals = adviseBid(fa, null, [], null, null, null);
      const withSignals = adviseBid(fa, null, [], null, 'RB', { last3: [3, 8, 14] });
      expect(withSignals.suggestedBid).toBeGreaterThan(withoutSignals.suggestedBid);
      expect(withSignals.importance).toBe('must-bid');
      expect(withSignals.reasons.some((r) => r.includes('weakest starting position'))).toBe(true);
      expect(withSignals.reasons.some((r) => r.includes('rising trend'))).toBe(true);
    });

    it('caps the bid at a share of remaining budget rather than recommending overspend', () => {
      const history = [{ pos: 'RB', amount: 90, won: true }];
      const advice = adviseBid(fa, null, history, 20, 'RB', null); // median comp 90, but budget is only $20
      expect(advice.suggestedBid).toBeLessThanOrEqual(8); // 40% of $20
      expect(advice.reasons.some((r) => r.includes('Capped at'))).toBe(true);
    });

    it('uses league bid history as the baseline when available', () => {
      const history = [
        { pos: 'RB', amount: 10, won: true },
        { pos: 'RB', amount: 14, won: true },
      ];
      const advice = adviseBid(fa, null, history, null, null, null);
      expect(advice.comps.median).toBe(12);
      expect(advice.suggestedBid).toBe(12);
      expect(advice.reasons.some((r) => r.includes('League bid history'))).toBe(true);
    });

    it('never calls a worse-ranked pickup an "upgrade" when it is actually a downgrade', () => {
      const worseDrop = { name: 'Star RB', pos: 'RB', roachRank: 6 }; // my current RB is much better than the FA (#80)
      const advice = adviseBid(fa, worseDrop, [], null, null, null);
      expect(advice.reasons.some((r) => r.includes('rank upgrade'))).toBe(false);
      expect(advice.reasons.some((r) => r.includes('depth/handcuff insurance'))).toBe(true);
    });

    it('correctly calls it an upgrade when the pickup does outrank the drop candidate', () => {
      const worseDrop = { name: 'Bench RB', pos: 'RB', roachRank: 150 }; // worse than the FA (#80)
      const advice = adviseBid(fa, worseDrop, [], null, null, null);
      expect(advice.reasons.some((r) => r.includes('a direct rank upgrade'))).toBe(true);
    });
  });
});
