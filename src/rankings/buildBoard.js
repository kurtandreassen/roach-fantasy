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

const POS_DIRECTION = { QB: 0, RB: 0.6, WR: 0.4, TE: -0.5, K: 0, DST: 0 };
const SD_FLOOR = 4; // below this, experts agree — don't touch the pick
const SHIFT_CAP = 10; // max spots any single adjustment can move a player

function normPos(pos) {
  return pos === 'DST' ? 'DST' : pos;
}

/**
 * @param {Array} ecrPlayers - raw FantasyPros ecrData.players array (or the
 *   trimmed {name,pos,team,ecr,tier,adp,sd,bye} shape already extracted).
 * @returns {Array} players ranked by roachRank, richest fields first.
 */
function buildBoard(ecrPlayers) {
  const replacement = computeReplacementLevels();

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
    return {
      ...p,
      replacement: rep,
      roachScore: Math.round(roachScore * 100) / 100,
      startable: p.posRank <= rep,
    };
  });

  scored.sort((a, b) => a.roachScore - b.roachScore || a.ecr - b.ecr);
  scored.forEach((p, i) => {
    p.roachRank = i + 1;
    p.valueGap = p.adp != null ? p.adp - p.roachRank : null;
  });

  return scored;
}

module.exports = { buildBoard, POS_DIRECTION, SD_FLOOR, SHIFT_CAP };
