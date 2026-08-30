// Parses the plain-text draft-history dumps pulled from CBS's own
// League > Year by Year > Draft Results pages (data/draft-history/*.txt).
//
// Format per file: "ROUND N" header lines, then one line per pick:
//   "<pickInRound> <team+player text> [totalFpts activeFpts]"
// Some years (2020, 2024) have no trailing FPTS columns.

const fs = require('fs');
const path = require('path');

function parseFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const picks = [];
  let round = 0;
  let overallPick = 0;

  for (const line of lines) {
    if (/^ROUND \d+/.test(line)) {
      round = parseInt(line.match(/\d+/)[0], 10);
      continue;
    }
    if (/^NOTE/.test(line)) continue;
    const m = line.match(/^(\d+)\s+(.+)$/);
    if (!m) continue;
    overallPick += 1;
    const rest = m[2];
    const toks = rest.split(/\s+/);

    const maybeActive = parseFloat(toks[toks.length - 1]);
    const maybeTotal = parseFloat(toks[toks.length - 2]);
    const hasFpts = !isNaN(maybeActive) && !isNaN(maybeTotal);

    let totalFpts = null;
    let activeFpts = null;
    let coreTokens = toks;
    if (hasFpts) {
      totalFpts = maybeTotal;
      activeFpts = maybeActive;
      coreTokens = toks.slice(0, toks.length - 2);
    }

    // coreTokens: <team...> <player...> <POS> <NFLTEAM>
    // We don't have a reliable team-name boundary without a roster of team
    // names, so callers that need the drafting team should pass a
    // teamNames list via parseFile's second arg.
    picks.push({
      round,
      pickInRound: parseInt(m[1], 10),
      overallPick,
      rawTail: coreTokens.join(' '),
      totalFpts,
      activeFpts,
    });
  }
  return picks;
}

/**
 * Splits rawTail into {team, player, pos, nflTeam} given a known list of
 * team names for that season (longest-match-first so multi-word team names
 * like "Nicaraguan Crab Sandwich" resolve correctly).
 */
function resolveTeams(picks, teamNames) {
  const sorted = [...teamNames].sort((a, b) => b.length - a.length);
  return picks.map((p) => {
    const match = sorted.find((t) => p.rawTail.startsWith(t + ' '));
    if (!match) return { ...p, team: null, player: p.rawTail, pos: null, nflTeam: null };
    const remainder = p.rawTail.slice(match.length).trim();
    const toks = remainder.split(/\s+/);
    const nflTeam = toks[toks.length - 1];
    const pos = toks[toks.length - 2];
    const player = toks.slice(0, toks.length - 2).join(' ');
    return { ...p, team: match, player, pos, nflTeam };
  });
}

function loadSeason(dataDir, year) {
  return parseFile(path.join(dataDir, `${year}.txt`));
}

/** Spearman rank correlation between overall pick number and totalFpts. */
function spearman(pairs) {
  const n = pairs.length;
  const rankOf = (arr) => {
    const sorted = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const ranks = new Array(arr.length);
    sorted.forEach(([, i], idx) => { ranks[i] = idx + 1; });
    return ranks;
  };
  const rx = rankOf(pairs.map((p) => p[0]));
  const ry = rankOf(pairs.map((p) => p[1]));
  let d2sum = 0;
  for (let i = 0; i < n; i++) {
    const d = rx[i] - ry[i];
    d2sum += d * d;
  }
  return 1 - (6 * d2sum) / (n * (n * n - 1));
}

function pickOrderCorrelation(picks) {
  const pairs = picks
    .filter((p) => p.totalFpts != null && !isNaN(p.totalFpts))
    .map((p) => [p.overallPick, p.totalFpts]);
  if (pairs.length < 10) return null;
  return spearman(pairs);
}

/**
 * Compares one manager's picks (by team name, possibly across an alias
 * mapping like { 2021: 'Malachi Crunch', 2022: 'Malachi Crunch', 2023: 'BuzzKill' })
 * against the field average, per round.
 */
function managerRoundPerformance(seasons) {
  // seasons: [{ picks: resolvedPicks, managerTeam: string }]
  const roundAgg = {};
  for (const { picks, managerTeam } of seasons) {
    for (const p of picks) {
      if (p.totalFpts == null || isNaN(p.totalFpts)) continue;
      if (!roundAgg[p.round]) roundAgg[p.round] = { mgrSum: 0, mgrCount: 0, fieldSum: 0, fieldCount: 0 };
      roundAgg[p.round].fieldSum += p.totalFpts;
      roundAgg[p.round].fieldCount += 1;
      if (p.team === managerTeam) {
        roundAgg[p.round].mgrSum += p.totalFpts;
        roundAgg[p.round].mgrCount += 1;
      }
    }
  }
  const rows = [];
  for (let r = 1; r <= 16; r++) {
    const a = roundAgg[r];
    if (!a || a.mgrCount === 0) continue;
    const mgrAvg = a.mgrSum / a.mgrCount;
    const fieldAvg = a.fieldSum / a.fieldCount;
    rows.push({
      round: r,
      managerAvg: Math.round(mgrAvg * 10) / 10,
      fieldAvg: Math.round(fieldAvg * 10) / 10,
      diffPct: Math.round(((mgrAvg - fieldAvg) / fieldAvg) * 1000) / 10,
      n: a.mgrCount,
    });
  }
  return rows;
}

module.exports = { parseFile, resolveTeams, loadSeason, spearman, pickOrderCorrelation, managerRoundPerformance };
