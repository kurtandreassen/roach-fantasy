// Brighton Roach / BuzzKill — CBS Sportsline league settings.
// Verified live from the league's own /rules page, 2026-08-29. Do not guess these —
// re-verify against /rules if the league ever changes settings.

const TEAMS = 12;

// Starters: 1 QB, 2 RB, 2 WR, 1 TE, 1 WR/TE flex, 1 RB/WR/TE flex, 1 K, 1 DST
const DEDICATED_STARTERS = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DST: 1 };

// Typical flex-usage split assumptions for a roster with these two flex types.
const FLEX_WR_TE = { WR: 0.70, TE: 0.30 };
const FLEX_RB_WR_TE = { RB: 0.45, WR: 0.45, TE: 0.10 };

const ROUNDS = 16;
const STARTERS_PER_TEAM = 10;
const BENCH_TOTAL = ROUNDS * TEAMS - STARTERS_PER_TEAM * TEAMS;
const BENCH_SHARE = { QB: 0.10, RB: 0.35, WR: 0.40, TE: 0.10, K: 0.03, DST: 0.02 };

// Scoring, exact — verified from /rules 2026-08-29.
const SCORING = {
  passing: { yardsPerPoint: 25, td: 4, interception: -1, twoPt: 2 },
  rushing: { yardsPerPoint: 10, td: 6, twoPt: 2 }, // 0.1/yd == 1pt per 10yd
  receiving: { reception: 1, yardsPerPoint: 10, td: 6, twoPt: 2 },
  kicker: {
    fgBase: 2,
    xp: 1,
    distanceBonus: [
      { min: 37, max: 39, bonus: 1 },
      { min: 40, max: 44, bonus: 1.5 },
      { min: 45, max: 49, bonus: 2 },
      { min: 50, max: 54, bonus: 2.5 },
      { min: 55, max: 59, bonus: 3 },
      { min: 60, max: 64, bonus: 4 },
      { min: 65, max: 200, bonus: 6 },
    ],
  },
  defense: {
    sack: 1,
    interception: 2,
    fumbleRecovery: 2,
    safety: 2,
    touchdown: 6,
    pointsAllowedTiers: [
      { min: 0, max: 3, points: 6 },
      { min: 4, max: 10, points: 4 },
      { min: 11, max: 17, points: 2 },
      { min: 18, max: 24, points: 0 },
      { min: 25, max: 31, points: -2 },
      { min: 32, max: 38, points: -4 },
      { min: 39, max: 999, points: -6 },
    ],
  },
};

function computeReplacementLevels() {
  const starterCounts = {};
  for (const pos of Object.keys(DEDICATED_STARTERS)) {
    starterCounts[pos] = DEDICATED_STARTERS[pos] * TEAMS;
  }
  starterCounts.WR += FLEX_WR_TE.WR * TEAMS + FLEX_RB_WR_TE.WR * TEAMS;
  starterCounts.TE += FLEX_WR_TE.TE * TEAMS + FLEX_RB_WR_TE.TE * TEAMS;
  starterCounts.RB += FLEX_RB_WR_TE.RB * TEAMS;

  const replacement = {};
  for (const pos of Object.keys(starterCounts)) {
    replacement[pos] = Math.round(starterCounts[pos] + BENCH_TOTAL * (BENCH_SHARE[pos] || 0));
  }
  return replacement;
}

module.exports = {
  TEAMS,
  ROUNDS,
  STARTERS_PER_TEAM,
  DEDICATED_STARTERS,
  FLEX_WR_TE,
  FLEX_RB_WR_TE,
  SCORING,
  computeReplacementLevels,
};
