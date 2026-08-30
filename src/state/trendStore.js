// Season-long weekly scoring trends — separate from stateStore.js (which
// holds a single OVERWRITTEN current snapshot). This one APPENDS: each
// week's data is keyed by week number and never erases a prior week, so a
// player's/team's history builds up over the season instead of only ever
// showing "right now."
//
// Storage is a JSON file on disk, same persistence caveat as stateStore.js:
// survives requests within a Railway deployment, wiped on redeploy (no
// volume attached yet).

const fs = require('fs');
const path = require('path');

const TRENDS_PATH = path.join(__dirname, '..', '..', 'data', 'state', 'weekly-trends.json');

function readTrends() {
  try {
    return JSON.parse(fs.readFileSync(TRENDS_PATH, 'utf8'));
  } catch (err) {
    return { weeks: {} };
  }
}

function writeTrends(data) {
  fs.mkdirSync(path.dirname(TRENDS_PATH), { recursive: true });
  fs.writeFileSync(TRENDS_PATH, JSON.stringify(data, null, 2));
}

/**
 * Records (or overwrites, if re-synced) one week's scoring.
 * @param {number} week
 * @param {Object} teams - { "BuzzKill": [{name,pos,points}], ... } for all rostered teams
 * @param {Array} freeAgents - [{name,pos,points}] for the tracked waiver-wire slice
 */
function recordWeek(week, teams, freeAgents) {
  const data = readTrends();
  data.weeks[week] = {
    syncedAt: new Date().toISOString(),
    teams: teams || {},
    freeAgents: freeAgents || [],
  };
  writeTrends(data);
  return data.weeks[week];
}

/**
 * Flattens all recorded weeks into one row per player with a `points`
 * array indexed by week (1-based weeks, array index 0 = week 1), for a
 * single wide sortable table. `team` is the roster name, or "Free Agent".
 */
function buildPlayerMatrix() {
  const data = readTrends();
  const weekNums = Object.keys(data.weeks).map(Number).sort((a, b) => a - b);
  if (weekNums.length === 0) return { weeks: [], players: [] };

  const byPlayer = new Map(); // name -> { name, pos, team, points: {week: val} }

  for (const week of weekNums) {
    const wk = data.weeks[week];
    for (const [teamName, players] of Object.entries(wk.teams || {})) {
      for (const p of players) {
        const key = p.name;
        if (!byPlayer.has(key)) byPlayer.set(key, { name: p.name, pos: p.pos, team: teamName, points: {} });
        const entry = byPlayer.get(key);
        entry.team = teamName; // most recent team wins (trades/waivers)
        entry.points[week] = p.points;
      }
    }
    for (const p of wk.freeAgents || []) {
      const key = p.name;
      if (!byPlayer.has(key)) byPlayer.set(key, { name: p.name, pos: p.pos, team: 'Free Agent', points: {} });
      const entry = byPlayer.get(key);
      if (!Object.prototype.hasOwnProperty.call(entry.points, week)) {
        // Don't let a free-agent entry overwrite a real rostered week for
        // the same player — being briefly droppable doesn't erase history.
        entry.points[week] = p.points;
      }
    }
  }

  const players = [...byPlayer.values()].map((p) => {
    const pointsArr = weekNums.map((w) => (p.points[w] != null ? p.points[w] : null));
    const played = pointsArr.filter((v) => v != null);
    const total = played.reduce((sum, v) => sum + v, 0);
    const avg = played.length ? Math.round((total / played.length) * 10) / 10 : null;
    return { name: p.name, pos: p.pos, team: p.team, pointsByWeek: pointsArr, total: Math.round(total * 10) / 10, avg };
  });

  return { weeks: weekNums, players };
}

module.exports = { readTrends, recordWeek, buildPlayerMatrix };
