// The "ultimate scouting report": actual-vs-optimal lineup efficiency,
// league-wide luck, and positional gaps — reusing lineupOptimizer.js and
// the board's own rankings rather than inventing new metrics from scratch.
// Same pattern the espn-fantasy coach tool already validated (Actual vs
// Optimal, Biggest Bench Regrets, Opponents efficiency table).
//
// Data model: each player entry logged via POST /api/trends/week can carry
// an optional `started: true/false`. Without it, this module still computes
// "optimal" (via the lineup optimizer over the full logged roster that
// week) but can't compute "actual" or the specific missed-swap list — it
// degrades gracefully rather than crashing.

const { readTrends } = require('../state/trendStore');
const { optimizeLineup } = require('../coach/lineupOptimizer');

/**
 * One team, one week: actual points (sum of players marked started),
 * optimal points (the lineup optimizer's best possible from the full
 * roster logged that week), the regret, and the specific swaps that would
 * have closed the gap.
 */
function computeTeamWeek(players) {
  if (!players || players.length === 0) return null;
  const roster = players.map((p) => ({ name: p.name, pos: p.pos, score: p.points }));
  const { starters, bench } = optimizeLineup(roster);
  const optimal = Math.round(starters.reduce((s, p) => s + p.score, 0) * 10) / 10;

  const hasStartedFlag = players.some((p) => p.started != null);
  let actual = null;
  let missedSwaps = [];
  if (hasStartedFlag) {
    const startedNames = new Set(players.filter((p) => p.started).map((p) => p.name));
    actual = Math.round(players.filter((p) => p.started).reduce((s, p) => s + p.points, 0) * 10) / 10;
    const optimalNames = new Set(starters.map((p) => p.name));
    // Players the optimizer would start that you didn't, paired against
    // the actual starters they'd replace at the same position (best-effort
    // pairing by score gap, not a strict slot-for-slot proof).
    const shouldHaveStarted = starters.filter((p) => !startedNames.has(p.name));
    const shouldHaveSat = players.filter((p) => p.started && !optimalNames.has(p.name));
    shouldHaveStarted.forEach((up) => {
      const down = shouldHaveSat.shift();
      if (down) {
        missedSwaps.push({
          startInstead: up.name,
          startInsteadScore: up.score,
          satPlayer: down.name,
          satPlayerScore: down.points,
          swing: Math.round((up.score - down.points) * 10) / 10,
        });
      }
    });
    missedSwaps.sort((a, b) => b.swing - a.swing);
  }

  return {
    actual,
    optimal,
    regret: actual != null ? Math.round((optimal - actual) * 10) / 10 : null,
    missedSwaps,
    bench: bench.map((p) => ({ name: p.name, pos: p.pos, score: p.score })),
  };
}

/**
 * League-wide efficiency for one week: every team's actual/optimal/regret,
 * plus a luck delta (actual vs the league's own average that week — a win
 * off a below-average score is a soft matchup, not dominance).
 */
function weekReport(week) {
  const data = readTrends();
  const wk = data.weeks[week];
  if (!wk) return null;

  const teamResults = {};
  for (const [teamName, players] of Object.entries(wk.teams || {})) {
    const result = computeTeamWeek(players);
    if (result) teamResults[teamName] = result;
  }

  const actuals = Object.values(teamResults).map((r) => r.actual).filter((v) => v != null);
  const leagueAvg = actuals.length ? Math.round((actuals.reduce((a, b) => a + b, 0) / actuals.length) * 10) / 10 : null;

  for (const teamName of Object.keys(teamResults)) {
    const r = teamResults[teamName];
    r.luckDelta = r.actual != null && leagueAvg != null ? Math.round((r.actual - leagueAvg) * 10) / 10 : null;
  }

  return { week, leagueAvg, teams: teamResults };
}

/**
 * Season-to-date efficiency table, one row per team: total actual vs
 * total optimal across every week with `started` data, sorted worst
 * (biggest regret = most exploitable) first.
 */
function seasonEfficiencyTable() {
  const data = readTrends();
  const weekNums = Object.keys(data.weeks).map(Number).sort((a, b) => a - b);
  const totals = {}; // team -> { actual, optimal, weeksWithData }

  for (const week of weekNums) {
    const wk = data.weeks[week];
    for (const [teamName, players] of Object.entries(wk.teams || {})) {
      const result = computeTeamWeek(players);
      if (!result || result.actual == null) continue;
      if (!totals[teamName]) totals[teamName] = { actual: 0, optimal: 0, weeks: 0 };
      totals[teamName].actual += result.actual;
      totals[teamName].optimal += result.optimal;
      totals[teamName].weeks += 1;
    }
  }

  const rows = Object.entries(totals).map(([team, t]) => ({
    team,
    weeks: t.weeks,
    actual: Math.round(t.actual * 10) / 10,
    optimal: Math.round(t.optimal * 10) / 10,
    regret: Math.round((t.optimal - t.actual) * 10) / 10,
    efficiencyPct: t.optimal > 0 ? Math.round((t.actual / t.optimal) * 1000) / 10 : null,
  }));
  rows.sort((a, b) => b.regret - a.regret);
  return rows;
}

/**
 * Trend alerts: players on a strict 3-consecutive-week rise or fall,
 * pulled straight from the trend matrix rather than a separate data source.
 */
function trendAlerts(playerMatrix) {
  const alerts = [];
  for (const p of playerMatrix.players) {
    const played = p.pointsByWeek.filter((v) => v != null);
    if (played.length < 3) continue;
    const last3 = played.slice(-3);
    const rising = last3[0] < last3[1] && last3[1] < last3[2];
    const falling = last3[0] > last3[1] && last3[1] > last3[2];
    if (rising || falling) {
      alerts.push({ name: p.name, pos: p.pos, team: p.team, direction: rising ? 'up' : 'down', last3 });
    }
  }
  return alerts;
}

/**
 * Positional gaps: for each team, using their most-recently-logged roster
 * and the draft board's own roachRank, the single weakest position among
 * their players at that position (worst = highest roachRank number = least
 * valuable per our own board) — real trade/waiver leverage, not a guess.
 */
function positionalGaps(board) {
  const data = readTrends();
  const weekNums = Object.keys(data.weeks).map(Number).sort((a, b) => a - b);
  if (weekNums.length === 0) return [];
  const latestWeek = data.weeks[weekNums[weekNums.length - 1]];

  const rankByName = new Map(board.map((p) => [p.name, p]));

  const gaps = [];
  for (const [teamName, players] of Object.entries(latestWeek.teams || {})) {
    const byPos = {};
    for (const p of players) {
      const boardEntry = rankByName.get(p.name);
      if (!boardEntry) continue;
      (byPos[p.pos] = byPos[p.pos] || []).push(boardEntry.roachRank);
    }
    let worstPos = null;
    let worstRank = -1;
    for (const [pos, ranks] of Object.entries(byPos)) {
      const best = Math.min(...ranks); // their best player at this position
      if (best > worstRank) { worstRank = best; worstPos = pos; }
    }
    if (worstPos) {
      const available = board
        .filter((p) => p.pos === worstPos && p.roachRank < worstRank)
        .filter((p) => !Object.values(latestWeek.teams).flat().some((rp) => rp.name === p.name))
        .slice(0, 3)
        .map((p) => ({ name: p.name, roachRank: p.roachRank }));
      gaps.push({ team: teamName, weakestPos: worstPos, weakestRank: worstRank, targets: available });
    }
  }
  return gaps;
}

module.exports = { computeTeamWeek, weekReport, seasonEfficiencyTable, trendAlerts, positionalGaps };
