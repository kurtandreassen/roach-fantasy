// Trade idea generator: proposes specific, named trades that (a) help the
// requesting team and (b) are built to actually get accepted — matched to
// need on both sides, not just closest-value swaps. The core insight from
// how real leagues trade: a lopsided-looking-but-need-filling offer gets
// accepted far more often than a "fair" one that doesn't solve anyone's
// problem. Coaches trade to fix a specific hole, not to optimize a
// spreadsheet — so every idea here is built need-first, value-checked
// second.

const { readTrends, buildPlayerMatrix } = require('../state/trendStore');
const { readState } = require('../state/store');
const { positionalGaps } = require('./scoutingReport');

// Comfortable roster depth per position before extra copies count as
// "surplus" — tradeable without weakening the team's own starting lineup.
// Sized around Roach's shape (1 QB, 2 RB, 2 WR, 1 TE, 2 flex, 1 K, 1 DST):
// RB/WR need the deepest bench since they also fill both flex slots.
const SURPLUS_THRESHOLD = { QB: 2, RB: 4, WR: 4, TE: 2, K: 1, DST: 1 };

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
 * so the *best* surplus piece (most attractive to a trade partner) comes
 * first.
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

function winPct(record) {
  if (!record) return null;
  const m = String(record).match(/(\d+)\s*-\s*(\d+)/);
  if (!m) return null;
  const w = Number(m[1]), l = Number(m[2]);
  return (w + l) > 0 ? w / (w + l) : null;
}

function buildReasoning({ giveAsset, getAsset, theirGap, myGap, doubleNeed, record, projSwing }) {
  const lines = [];
  lines.push(`Fills their clearest hole at ${theirGap.weakestPos} — nobody on their roster currently outranks board #${theirGap.weakestRank} there.`);
  lines.push(`${giveAsset.name} is surplus for you: bench depth at ${giveAsset.pos} you're not starting over your current group.`);
  if (doubleNeed) {
    lines.push(`In return, ${getAsset.name} directly upgrades your own weak spot at ${myGap.weakestPos} — and it's a position they're deep at too, so it costs them little to include.`);
  } else {
    lines.push(`${getAsset.name} comes back as the closest value-for-value piece at a position they're not thin at, so the offer should read as fair rather than lopsided.`);
  }
  if (projSwing != null) {
    if (Math.abs(projSwing) < 15) {
      lines.push(`Rest-of-season projections are close (${projSwing >= 0 ? '+' : ''}${projSwing.toFixed(1)} pts for you) — a fair-value trade like this is an easier yes than one that looks lopsided on paper.`);
    } else if (projSwing < 0) {
      lines.push(`You're giving up ${Math.abs(projSwing).toFixed(1)} more projected season points than you get back — that gap is what makes this an easy accept for them, and it's worth it if it plugs your ${doubleNeed ? myGap.weakestPos : 'roster'} hole for the stretch run.`);
    } else {
      lines.push(`You're actually netting +${projSwing.toFixed(1)} projected season points on top of fixing your need — worth offering before they notice.`);
    }
  }
  const givenGames = giveAsset.gamesPlayed, gotGames = getAsset.gamesPlayed;
  if (givenGames > 0 && gotGames > 0) {
    if (getAsset.seasonAvg > giveAsset.seasonAvg) {
      lines.push(`Actual production so far backs it up: ${getAsset.name} is averaging ${getAsset.seasonAvg} pts/game (${gotGames} games) vs. ${giveAsset.name}'s ${giveAsset.seasonAvg} (${givenGames} games).`);
    } else {
      lines.push(`Fair warning: ${giveAsset.name} has actually outscored ${getAsset.name} so far this season (${giveAsset.seasonAvg} vs. ${getAsset.seasonAvg} pts/game) — the case here is need and rest-of-season outlook, not recent form.`);
    }
  }
  const pct = winPct(record);
  if (pct != null) {
    if (pct < 0.4) lines.push(`They're under .500 — likely to prioritize a role/need fit over pure rank value right now.`);
    else if (pct > 0.6) lines.push(`They're near the top of the standings and likely want an immediate plug-and-play starter more than long-term upside, which is exactly what this offer gives them.`);
  }
  return lines;
}

/**
 * Named, ranked trade proposals for `myTeam`: built by matching your
 * tradeable surplus against each opponent's board-confirmed weakest
 * position, then trying to fill your own weakest position back from
 * their surplus (a real two-way need match, ranked 'high' likelihood) —
 * falling back to a value-matched piece at a position they're not thin at
 * when no mutual need exists ('medium' likelihood).
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
      getAsset = theirSurplusAtMyGap[0];
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

    const giveAsset = giveCandidates[0];
    const projSwing = (getAsset.proj != null && giveAsset.proj != null)
      ? Math.round((getAsset.proj - giveAsset.proj) * 10) / 10
      : null;
    const assetView = (a) => ({
      name: a.name,
      pos: a.pos,
      roachRank: a.roachRank,
      proj: a.proj,
      seasonAvg: a.seasonAvg,
      seasonTotal: a.seasonTotal,
      gamesPlayed: a.gamesPlayed,
    });

    const idea = {
      team,
      give: [assetView(giveAsset)],
      get: [assetView(getAsset)],
      likelihood: doubleNeed ? 'high' : 'medium',
      projSwing,
      reasoning: buildReasoning({
        giveAsset, getAsset, theirGap, myGap, doubleNeed, record: recordByTeam.get(team), projSwing,
      }),
    };
    ideas.push(idea);
  }

  ideas.sort((a, b) => (a.likelihood === b.likelihood ? 0 : a.likelihood === 'high' ? -1 : 1));
  return ideas.slice(0, maxTotal);
}

module.exports = { generateTradeIdeas, computeSurplus, SURPLUS_THRESHOLD };
