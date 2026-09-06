// Coach-tab guidance content ported from the espn-fantasy project's Coach
// tab (same analytical spirit, different data source — CBS has no live API,
// so this runs on whatever's been manually synced rather than polling).
// Three independent pieces, each usable even if the others have no data yet:
//   - byeInactiveAlerts: flags rostered players on bye the upcoming week
//   - pointValueByPosition: "what a point is worth here" — the gap between
//     a startable player and replacement level, by position
//   - leagueFabTendencies: what each team has actually spent/bid on waivers

const { computeReplacementLevels } = require('../rankings/leagueConfig');

/**
 * Rostered players on bye for the upcoming week — the week right after the
 * latest synced trend week, since that's the best signal we have for
 * "what week is it" without a live schedule feed. Returns [] (not an error)
 * when there's no trend history yet to infer a week from.
 */
function byeInactiveAlerts(rosterPlayers, board, upcomingWeek) {
  if (!upcomingWeek) return [];
  const byName = new Map(board.map((p) => [p.name, p]));
  return rosterPlayers
    .map((p) => {
      const boardEntry = byName.get(p.name);
      if (!boardEntry || boardEntry.bye == null) return null;
      if (Number(boardEntry.bye) !== upcomingWeek) return null;
      return { name: p.name, pos: p.pos, bye: boardEntry.bye };
    })
    .filter(Boolean);
}

const GUIDANCE_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];

/**
 * "What a point is worth here" — for each position, the season-long
 * projected-points gap between a startable player and replacement level
 * (the same replacement rank the board's own VOR column already uses),
 * so a coach can see which positions are worth fighting for.
 */
function pointValueByPosition(board) {
  const replacementByPos = computeReplacementLevels();
  const result = {};
  for (const pos of GUIDANCE_POSITIONS) {
    const atPos = board.filter((p) => p.pos === pos && p.proj != null).sort((a, b) => b.proj - a.proj);
    if (!atPos.length) continue;
    const replCount = replacementByPos[pos] || atPos.length;
    const startable = atPos.slice(0, Math.max(1, Math.round(replCount * 0.5))); // the truly startable tier, not the whole replacement pool
    const replacementPlayer = atPos[Math.min(replCount, atPos.length - 1)];
    const avgStartableProj = startable.reduce((s, p) => s + p.proj, 0) / startable.length;
    result[pos] = {
      avgStartableProj: Math.round(avgStartableProj * 10) / 10,
      replacementProj: Math.round((replacementPlayer ? replacementPlayer.proj : 0) * 10) / 10,
      edge: Math.round((avgStartableProj - (replacementPlayer ? replacementPlayer.proj : 0)) * 10) / 10,
    };
  }
  return result;
}

/**
 * What each team has actually spent/bid on waivers, from synced bid
 * history — the closest thing to espn-fantasy's per-manager "tendencies"
 * panel that's buildable from data CBS actually exposes (no trade log or
 * add/drop history synced yet, so this is FAB behavior only for now).
 */
function leagueFabTendencies(bidHistory, budgets) {
  const byTeam = {};
  for (const bid of bidHistory) {
    if (!bid.won) continue;
    byTeam[bid.team] = byTeam[bid.team] || { team: bid.team, totalSpent: 0, bidCount: 0, maxBid: 0 };
    byTeam[bid.team].totalSpent += bid.amount;
    byTeam[bid.team].bidCount += 1;
    byTeam[bid.team].maxBid = Math.max(byTeam[bid.team].maxBid, bid.amount);
  }
  const rows = Object.values(byTeam).map((t) => ({
    ...t,
    avgBid: Math.round((t.totalSpent / t.bidCount) * 10) / 10,
    remaining: budgets && budgets[t.team] != null ? budgets[t.team] : null,
  }));
  rows.sort((a, b) => b.totalSpent - a.totalSpent);
  return rows;
}

module.exports = { byeInactiveAlerts, pointValueByPosition, leagueFabTendencies };
