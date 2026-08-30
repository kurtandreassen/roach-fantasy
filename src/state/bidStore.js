// FAAB waiver bid history + remaining budgets. No CBS API for transaction
// history either, so same manual-sync model as everything else: ask Claude
// to read the league's Transactions/Waiver Results page and push it here.
// This is what lets the bid advisor say "comparable RBs went for $12-18"
// instead of guessing blind.

const fs = require('fs');
const path = require('path');

const BIDS_PATH = path.join(__dirname, '..', '..', 'data', 'state', 'bids.json');

const EMPTY = { budgets: { teams: {}, updatedAt: null }, weeks: {} };

function readBids() {
  try {
    return { ...EMPTY, ...JSON.parse(fs.readFileSync(BIDS_PATH, 'utf8')) };
  } catch (err) {
    return { ...EMPTY };
  }
}

function writeBids(data) {
  fs.mkdirSync(path.dirname(BIDS_PATH), { recursive: true });
  fs.writeFileSync(BIDS_PATH, JSON.stringify(data, null, 2));
}

/**
 * Remaining FAAB budget per team, e.g. { BuzzKill: 62, Rival: 40 }.
 * A full overwrite each sync, same pattern as Coach standings.
 */
function recordBudgets(teams) {
  const data = readBids();
  data.budgets = { teams, updatedAt: new Date().toISOString() };
  writeBids(data);
  return data.budgets;
}

/**
 * Records (or overwrites, if re-synced) one week's completed waiver bids.
 * @param {number} week
 * @param {Array<{player:string, pos:string, team:string, amount:number, won:boolean}>} bids
 */
function recordWeek(week, bids) {
  const data = readBids();
  data.weeks[week] = { syncedAt: new Date().toISOString(), bids: bids || [] };
  writeBids(data);
  return data.weeks[week];
}

/** Flat list of every synced bid across all weeks, oldest first. */
function allBids() {
  const data = readBids();
  const weekNums = Object.keys(data.weeks).map(Number).sort((a, b) => a - b);
  return weekNums.flatMap((w) => data.weeks[w].bids.map((b) => ({ ...b, week: w })));
}

module.exports = { readBids, recordBudgets, recordWeek, allBids };
