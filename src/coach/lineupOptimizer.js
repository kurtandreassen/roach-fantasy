// Optimal starting lineup for a given roster, against Roach's exact slot
// shape: 1 QB, 2 RB, 2 WR, 1 TE, 1 WR/TE flex, 1 RB/WR/TE flex, 1 K, 1 DST.
//
// No live weekly projections exist for this league (no API), so callers
// supply a `score` per player themselves — either the preseason roachScore
// (inverted, higher = better) for draft-time "who do I even own" sanity
// checks, or a real weekly projection pulled live via Claude-in-Chrome for
// in-season lineup decisions. This module only does the assignment.

const SLOTS = [
  { name: 'QB', eligible: ['QB'], count: 1 },
  { name: 'RB', eligible: ['RB'], count: 2 },
  { name: 'WR', eligible: ['WR'], count: 2 },
  { name: 'TE', eligible: ['TE'], count: 1 },
  { name: 'WR/TE', eligible: ['WR', 'TE'], count: 1 },
  { name: 'RB/WR/TE', eligible: ['RB', 'WR', 'TE'], count: 1 },
  { name: 'K', eligible: ['K'], count: 1 },
  { name: 'DST', eligible: ['DST'], count: 1 },
];

/**
 * Greedy "narrowest domain first" assignment: fill the most restrictive
 * slots (single eligible position) before the flexes, taking the
 * highest-scoring unused eligible player each time. Not a proven-optimal
 * solver, but standard for this problem size and easy to reason about —
 * ties only bite when a flex-eligible player would have scored higher in a
 * dedicated slot that greedy already filled with someone worse; roster
 * sizes here (14-18) make that rare and low-stakes.
 *
 * @param {Array<{name:string,pos:string,score:number}>} roster
 * @returns {{starters: Array, bench: Array, slots: object}}
 */
function optimizeLineup(roster) {
  const pool = [...roster].sort((a, b) => b.score - a.score);
  const used = new Set();
  const assignment = {};

  const orderedSlots = [...SLOTS].sort((a, b) => a.eligible.length - b.eligible.length);

  for (const slot of orderedSlots) {
    assignment[slot.name] = [];
    for (let i = 0; i < slot.count; i++) {
      const pick = pool.find((p) => !used.has(p.name) && slot.eligible.includes(p.pos));
      if (pick) {
        used.add(pick.name);
        assignment[slot.name].push(pick);
      }
    }
  }

  const starters = Object.values(assignment).flat();
  const bench = roster.filter((p) => !used.has(p.name));

  return { starters, bench, slots: assignment };
}

module.exports = { optimizeLineup, SLOTS };
