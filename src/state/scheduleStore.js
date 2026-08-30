// Weekly matchup schedule — who plays whom. No CBS API, same manual-sync
// model as everything else: ask Claude to read the live CBS matchup page
// and push it here. Append-only by week, same pattern as trendStore.js.

const fs = require('fs');
const path = require('path');

const SCHEDULE_PATH = path.join(__dirname, '..', '..', 'data', 'state', 'schedule.json');

function readSchedule() {
  try {
    return JSON.parse(fs.readFileSync(SCHEDULE_PATH, 'utf8'));
  } catch (err) {
    return { weeks: {} };
  }
}

function writeSchedule(data) {
  fs.mkdirSync(path.dirname(SCHEDULE_PATH), { recursive: true });
  fs.writeFileSync(SCHEDULE_PATH, JSON.stringify(data, null, 2));
}

/**
 * Records (or overwrites, if re-synced) one week's matchups.
 * @param {number} week
 * @param {Array<{home:string, away:string}>} matchups
 */
function recordWeek(week, matchups) {
  const data = readSchedule();
  data.weeks[week] = { syncedAt: new Date().toISOString(), matchups: matchups || [] };
  writeSchedule(data);
  return data.weeks[week];
}

/**
 * The team a given team plays in a given week, or null if that week's
 * schedule hasn't been synced or the team has a bye.
 */
function getOpponent(week, team) {
  const data = readSchedule();
  const wk = data.weeks[week];
  if (!wk) return null;
  const matchup = wk.matchups.find((m) => m.home === team || m.away === team);
  if (!matchup) return null;
  return matchup.home === team ? matchup.away : matchup.home;
}

module.exports = { readSchedule, recordWeek, getOpponent };
