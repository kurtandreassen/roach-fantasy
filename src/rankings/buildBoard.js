// Builds the Roach draft board from a FantasyPros full-PPR ECR snapshot.
//
// Philosophy (carried over from the espn-fantasy project's own board, and
// validated there): the market beats a from-scratch projection. ECR is the
// base. We apply a BOUNDED positional nudge only where expert disagreement
// (rank_std) is already high — i.e. only in genuinely uncertain territory —
// sized to reflect Roach's two flex spots (1 WR/TE, 1 RB/WR/TE), which put
// more demand on RB/WR than the single-flex assumption most public
// rankings are built around, and slightly less unique demand on TE.

const { computeReplacementLevels } = require('./leagueConfig');
const { buildRoachProjections } = require('./roachScoring');

const POS_DIRECTION = { QB: 0, RB: 0.6, WR: 0.4, TE: -0.5, K: 0, DST: 0 };
const SD_FLOOR = 4; // below this, experts agree — don't touch the pick
const SHIFT_CAP = 10; // max spots any single adjustment can move a player

function normPos(pos) {
  return pos === 'DST' ? 'DST' : pos;
}

// Loose name match so "Michael Pittman" (CBS) finds "Michael Pittman Jr."
// (FantasyPros) — strip suffixes/punctuation, not a fuzzy/edit-distance
// match, so it won't silently pair two different people.
function normName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\.?\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * @param {Array} ecrPlayers - raw FantasyPros ecrData.players array (or the
 *   trimmed {name,pos,team,ecr,tier,adp,sd,bye} shape already extracted).
 * @param {Object} [cbsExpertRanks] - optional { QB: [{n,r}], RB: [...], ... }
 *   pulled live from CBS's own SportsLine-powered "Expert" rank column —
 *   the only CBS ranking signal populated preseason (their own season point
 *   projections are all zero until the season starts). Purely informational;
 *   never folds into roachScore/roachRank.
 * @param {Array} [espnProjections] - optional raw ESPN per-category season
 *   stat projections ({n, pos, "3":passYds, "24":rushYds, ...}), reapplied
 *   through Roach's OWN scoring formula (roachScoring.js) to get real,
 *   points-based Proj/VOR for QB/RB/WR/TE. K/DST can't be scored this way —
 *   see roachScoring.js header. Informational, like cbsRank: proj/vor are
 *   exposed for comparison but do NOT change roachRank/roachScore, same
 *   "market beats homemade projections" call the ESPN board's own backtest
 *   validated — an unvalidated pivot to VOR-primary here would repeat the
 *   mistake that backtest caught, not avoid it.
 * @returns {Array} players ranked by roachRank, richest fields first.
 */
function buildBoard(ecrPlayers, cbsExpertRanks, espnProjections) {
  const replacement = computeReplacementLevels();

  let cbsByPos = null;
  if (cbsExpertRanks) {
    cbsByPos = {};
    for (const pos of Object.keys(cbsExpertRanks)) {
      cbsByPos[pos] = new Map(cbsExpertRanks[pos].map((p) => [normName(p.n), p.r]));
    }
  }

  const roachProjByName = espnProjections ? buildRoachProjections(espnProjections, normName) : null;

  const normalized = ecrPlayers.map((p) => ({
    name: p.name ?? p.player_name,
    pos: normPos(p.pos ?? p.player_position_id),
    team: p.team ?? p.player_team_id,
    ecr: p.ecr ?? p.rank_ecr,
    tier: p.tier,
    adp: p.adp ?? p.rank_adp ?? null,
    sd: p.sd != null ? parseFloat(p.sd) : (p.rank_std != null ? parseFloat(p.rank_std) : null),
    bye: p.bye ?? p.player_bye_week ?? null,
  }));

  const byPos = {};
  for (const p of normalized) {
    (byPos[p.pos] = byPos[p.pos] || []).push(p);
  }
  for (const pos of Object.keys(byPos)) {
    byPos[pos].sort((a, b) => a.ecr - b.ecr);
    byPos[pos].forEach((p, i) => { p.posRank = i + 1; });
  }

  const scored = normalized.map((p) => {
    const rep = replacement[p.pos] || 20;
    const sd = p.sd || 0;
    const shiftCap = Math.min(sd * 1.5, SHIFT_CAP);
    const adjustment = sd >= SD_FLOOR ? shiftCap * (POS_DIRECTION[p.pos] || 0) : 0;
    const roachScore = p.ecr - adjustment;
    const cbsRank = cbsByPos && cbsByPos[p.pos] ? cbsByPos[p.pos].get(normName(p.name)) ?? null : null;
    const proj = roachProjByName ? roachProjByName.get(normName(p.name))?.proj ?? null : null;
    return {
      ...p,
      replacement: rep,
      roachScore: Math.round(roachScore * 100) / 100,
      startable: p.posRank <= rep,
      cbsRank,
      proj,
    };
  });

  // Real points-based replacement level, position by position: the Nth-best
  // PROJECTION (not the Nth-best ECR rank — those are two different
  // players' worth of points, and mixing them was a bug the ESPN board's
  // own mock-draft testing caught once already).
  if (roachProjByName) {
    const projByPos = {};
    for (const p of scored) {
      if (p.proj == null) continue;
      (projByPos[p.pos] = projByPos[p.pos] || []).push(p.proj);
    }
    const replacementProj = {};
    for (const pos of Object.keys(projByPos)) {
      const sorted = [...projByPos[pos]].sort((a, b) => b - a);
      const rep = replacement[pos] || sorted.length;
      replacementProj[pos] = sorted[Math.min(rep - 1, sorted.length - 1)] ?? 0;
    }
    for (const p of scored) {
      p.vor = p.proj != null && replacementProj[p.pos] != null
        ? Math.round((p.proj - replacementProj[p.pos]) * 100) / 100
        : null;
    }
  } else {
    for (const p of scored) p.vor = null;
  }

  scored.sort((a, b) => a.roachScore - b.roachScore || a.ecr - b.ecr);
  scored.forEach((p, i) => {
    p.roachRank = i + 1;
    p.valueGap = p.adp != null ? p.adp - p.roachRank : null;
    // Shift: how far OUR rank moved him from ECR. Positive = we like him
    // more than the market (moved him up); negative = we like him less.
    p.shift = p.ecr - p.roachRank;
  });

  return scored;
}

module.exports = { buildBoard, POS_DIRECTION, SD_FLOOR, SHIFT_CAP };
