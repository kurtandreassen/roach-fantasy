// Applies Roach's EXACT scoring rules (leagueConfig.SCORING, verified live
// from the league's own /rules page) to raw per-category stat projections —
// not to some other site's already-blended point total. The stat categories
// come from ESPN's public player-projections endpoint, which is genuinely
// scoring-agnostic: ESPN computes each league's own applied points from these
// same raw numbers, so reapplying a different formula to them is legitimate,
// not a hack.
//
// ESPN stat IDs used (verified against espn-fantasy's own
// database/seed/stat_names.json, not guessed):
//   3 passYds, 4 passTD, 20 passInt, 24 rushYds, 25 rushTD,
//   42 recYds, 43 recTD, 53 receptions, 83 FG made, 86 XP made.
//
// Known gap: ESPN's projections don't break kicker FG makes out by distance
// bucket, so Roach's tiered kicker bonus (the whole reason K scoring here
// differs from a standard site) can't be reproduced — K uses the flat base
// (2 pts/FG + 1/XP) only, which UNDERSTATES real value for long-range
// kickers. DST needs sacks/INT/fumble-recovery/TD splits ESPN's projection
// payload doesn't carry either. Both stay on the ECR+roster-shape system;
// only QB/RB/WR/TE get real points-based scoring here.

const { SCORING } = require('./leagueConfig');

function computeRoachPoints(stats, pos) {
  if (!stats) return null;
  const passYds = stats['3'] || 0;
  const passTD = stats['4'] || 0;
  const passInt = stats['20'] || 0;
  const rushYds = stats['24'] || 0;
  const rushTD = stats['25'] || 0;
  const recYds = stats['42'] || 0;
  const recTD = stats['43'] || 0;
  const receptions = stats['53'] || 0;
  const fgMade = stats['83'] || 0;
  const xpMade = stats['86'] || 0;

  if (pos === 'QB' || pos === 'RB' || pos === 'WR' || pos === 'TE') {
    const passPts = (passYds / SCORING.passing.yardsPerPoint) + passTD * SCORING.passing.td + passInt * SCORING.passing.interception;
    const rushPts = (rushYds / SCORING.rushing.yardsPerPoint) + rushTD * SCORING.rushing.td;
    const recPts = receptions * SCORING.receiving.reception + (recYds / SCORING.receiving.yardsPerPoint) + recTD * SCORING.receiving.td;
    return Math.round((passPts + rushPts + recPts) * 100) / 100;
  }

  if (pos === 'K') {
    // Flat base only — see file header re: missing distance-bucket data.
    return Math.round((fgMade * SCORING.kicker.fgBase + xpMade * SCORING.kicker.xp) * 100) / 100;
  }

  return null; // DST: not enough category data to score honestly.
}

/**
 * Builds a { normalizedName: { proj, pos } } lookup from the raw ESPN
 * projection dump, applying Roach scoring to each player.
 */
function buildRoachProjections(espnPlayers, normName) {
  const byName = new Map();
  for (const p of espnPlayers) {
    const proj = computeRoachPoints(p, p.pos);
    if (proj == null) continue;
    byName.set(normName(p.n), { proj, pos: p.pos });
  }
  return byName;
}

module.exports = { computeRoachPoints, buildRoachProjections };
