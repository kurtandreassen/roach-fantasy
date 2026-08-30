// Trade idea generator: proposes specific, named trades built to make YOUR
// team better first, while still being realistic enough that the other
// coach would say yes.
//
// Two separate axes, on purpose — conflating them produces either giveaway
// trades or trades nobody accepts:
//   - `grade` (A/B/C/D): how much this trade is worth to YOU, measured the
//     way a championship actually gets won — the change in your OPTIMAL
//     STARTING LINEUP's weekly output, not raw player value. A bench
//     upgrade doesn't win playoff weeks; a starting-lineup upgrade does.
//   - `likelihood` ('high'/'medium'): how likely the other coach is to
//     accept, based on whether it fills their board-confirmed need and
//     whether what you're giving up is the *minimum* sufficient piece
//     rather than your best trade chip — real coaches negotiate, and
//     offering your best asset when a lesser one already fixes their hole
//     just overpays for no reason.
//
// The two can and should disagree: a high-grade trade for you is often
// medium-likelihood, because the same thing that makes it great for you
// (mutual need fill without overpaying) makes it a harder sell than just
// handing over your best player. That tension is the point — it's shown,
// not hidden.

const { readTrends, buildPlayerMatrix } = require('../state/trendStore');
const { readState } = require('../state/store');
const { positionalGaps } = require('./scoutingReport');
const { optimizeLineup } = require('../coach/lineupOptimizer');

// Comfortable roster depth per position before extra copies count as
// "surplus" — tradeable without weakening the team's own starting lineup.
// Sized around Roach's shape (1 QB, 2 RB, 2 WR, 1 TE, 2 flex, 1 K, 1 DST):
// RB/WR need the deepest bench since they also fill both flex slots.
const SURPLUS_THRESHOLD = { QB: 2, RB: 4, WR: 4, TE: 2, K: 1, DST: 1 };

// Season proj spread evenly across a 17-week schedule — same convention
// scoutingReport.getMatchup() uses for weekly lineup math, so the "lineup
// impact" grade here is directly comparable to what the Matchup panel shows.
const weeklyEstimate = (proj) => (proj != null ? proj / 17 : 0);

function latestRosters() {
  const data = readTrends();
  const weekNums = Object.keys(data.weeks).map(Number).sort((a, b) => a - b);
  if (weekNums.length === 0) return {};
  return data.weeks[weekNums[weekNums.length - 1]].teams || {};
}

function enrich(players, rankByName, seasonByName) {
  return players
    .map((p) => {
      const boardEntry = rankByName.get(p.name);
      if (!boardEntry) return null;
      const season = seasonByName.get(p.name);
      return {
        name: p.name,
        pos: p.pos,
        roachRank: boardEntry.roachRank,
        proj: boardEntry.proj,
        seasonAvg: season ? season.avg : null,
        seasonTotal: season ? season.total : null,
        gamesPlayed: season ? season.pointsByWeek.filter((v) => v != null).length : 0,
      };
    })
    .filter(Boolean);
}

/**
 * Players a team could give up without weakening its own lineup: for each
 * position, whatever sits beyond the comfortable depth threshold, sorted
 * best-first (lowest roachRank first).
 */
function computeSurplus(roster) {
  const byPos = {};
  for (const p of roster) (byPos[p.pos] = byPos[p.pos] || []).push(p);

  const surplus = {};
  for (const [pos, players] of Object.entries(byPos)) {
    const threshold = SURPLUS_THRESHOLD[pos] ?? 2;
    const sorted = [...players].sort((a, b) => a.roachRank - b.roachRank);
    if (sorted.length > threshold) surplus[pos] = sorted.slice(threshold);
  }
  return surplus;
}

/**
 * The cheapest surplus piece that still genuinely upgrades the position —
 * i.e. still outranks their current weakest-there player — rather than
 * always reaching for the best one. Overpaying (offering your #1 surplus
 * asset when your #3 already fixes the hole) helps nobody but the other
 * team.
 */
function minimumSufficientGive(giveCandidates, theirWeakestRank) {
  const worthwhile = giveCandidates.filter((p) => p.roachRank < theirWeakestRank);
  if (worthwhile.length === 0) return giveCandidates[0]; // none clearly upgrade them; offer the best
  return worthwhile[worthwhile.length - 1]; // worst-ranked (cheapest) of the ones that still help
}

/** Change in weekly starting-lineup output from swapping giveAsset out for
 * getAsset in — the actual championship-relevant number, since points
 * sitting on the bench don't win games. */
function lineupImpact(fullRoster, giveAsset, getAsset) {
  const scored = (list) => list.map((p) => ({ name: p.name, pos: p.pos, score: weeklyEstimate(p.proj) }));
  const before = optimizeLineup(scored(fullRoster)).starters.reduce((s, p) => s + p.score, 0);
  const after = optimizeLineup(scored([
    ...fullRoster.filter((p) => p.name !== giveAsset.name),
    getAsset,
  ])).starters.reduce((s, p) => s + p.score, 0);
  return Math.round((after - before) * 10) / 10;
}

function gradeFor(weeklyDelta) {
  if (weeklyDelta >= 4) return 'A';
  if (weeklyDelta >= 2) return 'B';
  if (weeklyDelta > 0) return 'C';
  return 'D';
}

function winPct(record) {
  if (!record) return null;
  const m = String(record).match(/(\d+)\s*-\s*(\d+)/);
  if (!m) return null;
  const w = Number(m[1]), l = Number(m[2]);
  return (w + l) > 0 ? w / (w + l) : null;
}

function buildReasoning({ giveAsset, getAsset, theirGap, myGap, doubleNeed, record, projSwing, weeklyDelta, grade }) {
  const lines = [];
  const remainingWeeks = 14; // rough regular-season-remaining assumption for the total-impact framing
  if (weeklyDelta > 0) {
    lines.push(`Grade ${grade}: your OPTIMAL starting lineup gains ~${weeklyDelta} pts/week (~${Math.round(weeklyDelta * remainingWeeks)} pts the rest of the season) — that's the number that actually moves championship odds, not the raw player-value swing.`);
  } else {
    lines.push(`Grade ${grade}: this doesn't actually improve your best starting lineup — you're only trading it because ${giveAsset.name} was dead bench weight anyway. Treat it as a lateral roster move, not a value add.`);
  }
  lines.push(`Fills their clearest hole at ${theirGap.weakestPos} — nobody on their roster currently outranks board #${theirGap.weakestRank} there.`);
  lines.push(`${giveAsset.name} (#${giveAsset.roachRank}) is the cheapest piece from your surplus that still clears that bar — you're not overpaying with a better trade chip than the job requires.`);
  if (doubleNeed) {
    lines.push(`In return, ${getAsset.name} directly upgrades your own weak spot at ${myGap.weakestPos} — it's a position they're deep at too, so it costs them real bench depth but not a starter.`);
  } else {
    lines.push(`${getAsset.name} comes back as the closest value-for-value piece at a position they're not thin at, so the offer should still read as fair rather than a pure need-exploit.`);
  }
  if (projSwing != null) {
    if (projSwing < -5) lines.push(`Note: they're getting the better rest-of-season projection (${projSwing.toFixed(1)} pts in their favor) — expected, since minimum-sufficient offers concede some value swing to lower what you give up.`);
    else if (projSwing > 5) lines.push(`You're also netting +${projSwing.toFixed(1)} projected season points on top of the lineup upgrade — a genuinely light ask for what you're getting.`);
  }
  const givenGames = giveAsset.gamesPlayed, gotGames = getAsset.gamesPlayed;
  if (givenGames > 0 && gotGames > 0 && giveAsset.seasonAvg > getAsset.seasonAvg) {
    lines.push(`Fair warning: ${giveAsset.name} has actually outscored ${getAsset.name} so far this season (${giveAsset.seasonAvg} vs. ${getAsset.seasonAvg} pts/game) — the case here is roster construction and rest-of-season outlook, not recent form.`);
  }
  const pct = winPct(record);
  if (pct != null) {
    if (pct < 0.4) lines.push(`They're under .500 — likely to prioritize a role/need fit over pure rank value right now, which makes a minimum-sufficient offer more likely to land.`);
    else if (pct > 0.6) lines.push(`They're near the top of the standings and likely want an immediate plug-and-play starter more than long-term upside, which is exactly what this offer gives them.`);
  }
  return lines;
}

/**
 * Named, ranked trade proposals for `myTeam`, graded on how much they'd
 * actually help you win (weekly starting-lineup impact) and separately
 * flagged with how likely the other side is to accept — matched to their
 * board-confirmed weakest position, paid for with the cheapest surplus
 * piece that still clears the bar rather than your best trade chip.
 */
function generateTradeIdeas(myTeam, board, opts) {
  opts = opts || {};
  const maxTotal = opts.maxTotal || 8;

  const rosters = latestRosters();
  if (!rosters[myTeam]) return [];

  const rankByName = new Map(board.map((p) => [p.name, p]));
  const seasonByName = new Map(buildPlayerMatrix().players.map((p) => [p.name, p]));
  const gaps = positionalGaps(board);
  const myGap = gaps.find((g) => g.team === myTeam);
  if (!myGap) return [];

  const myRoster = enrich(rosters[myTeam], rankByName, seasonByName);
  const mySurplus = computeSurplus(myRoster);

  const standings = readState().standings.teams || [];
  const recordByTeam = new Map(standings.map((t) => [t.team, t.record]));

  const ideas = [];
  for (const [team, players] of Object.entries(rosters)) {
    if (team === myTeam) continue;
    const theirGap = gaps.find((g) => g.team === team);
    if (!theirGap) continue;
    const giveCandidates = mySurplus[theirGap.weakestPos];
    if (!giveCandidates || giveCandidates.length === 0) continue;

    const theirRoster = enrich(players, rankByName, seasonByName);
    const theirSurplus = computeSurplus(theirRoster);

    let getAsset = null;
    let doubleNeed = false;
    const theirSurplusAtMyGap = theirSurplus[myGap.weakestPos];
    if (theirSurplusAtMyGap && theirSurplusAtMyGap.length) {
      getAsset = theirSurplusAtMyGap[0]; // their best surplus there — maximize what it does for you
      doubleNeed = true;
    } else {
      // Fallback: closest-value piece at a position they're not thin at
      // (never their own weakest slot — that just recreates their hole).
      const candidates = theirRoster.filter((p) => p.pos !== theirGap.weakestPos);
      if (candidates.length) {
        const target = giveCandidates[0].roachRank;
        candidates.sort((a, b) => Math.abs(a.roachRank - target) - Math.abs(b.roachRank - target));
        getAsset = candidates[0];
      }
    }
    if (!getAsset) continue;

    const giveAsset = minimumSufficientGive(giveCandidates, theirGap.weakestRank);
    const projSwing = (getAsset.proj != null && giveAsset.proj != null)
      ? Math.round((getAsset.proj - giveAsset.proj) * 10) / 10
      : null;
    const weeklyDelta = lineupImpact(myRoster, giveAsset, getAsset);
    const grade = gradeFor(weeklyDelta);

    const assetView = (a) => ({
      name: a.name,
      pos: a.pos,
      roachRank: a.roachRank,
      proj: a.proj,
      seasonAvg: a.seasonAvg,
      seasonTotal: a.seasonTotal,
      gamesPlayed: a.gamesPlayed,
    });

    ideas.push({
      team,
      give: [assetView(giveAsset)],
      get: [assetView(getAsset)],
      grade,
      weeklyLineupDelta: weeklyDelta,
      likelihood: doubleNeed ? 'high' : 'medium',
      projSwing,
      reasoning: buildReasoning({
        giveAsset, getAsset, theirGap, myGap, doubleNeed, record: recordByTeam.get(team), projSwing, weeklyDelta, grade,
      }),
    });
  }

  const gradeRank = { A: 0, B: 1, C: 2, D: 3 };
  ideas.sort((a, b) => gradeRank[a.grade] - gradeRank[b.grade]);
  return ideas.slice(0, maxTotal);
}

module.exports = { generateTradeIdeas, computeSurplus, SURPLUS_THRESHOLD };
