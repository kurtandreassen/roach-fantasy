// General transaction log (adds/drops/trades) — scaffolding only for now.
// CBS's /transactions page has no rows yet (preseason, draft hasn't run),
// so the exact PLAYERS-cell text format and FAB-report columns are still
// unconfirmed. Don't guess that shape — this store holds whatever
// normalized rows we decide on once a real populated page can be read
// (likely after the first waiver run, a few days into the season).
//
// Row shape (provisional, to be revisited against real data):
//   { date, team, type: 'add'|'drop'|'trade', player, effectiveDate }

const fs = require('fs');
const path = require('path');

const TXN_PATH = path.join(__dirname, '..', '..', 'data', 'state', 'transactions.json');

const EMPTY = { rows: [] };

function readTransactions() {
  try {
    return { ...EMPTY, ...JSON.parse(fs.readFileSync(TXN_PATH, 'utf8')) };
  } catch (err) {
    return { ...EMPTY };
  }
}

function writeTransactions(data) {
  fs.mkdirSync(path.dirname(TXN_PATH), { recursive: true });
  fs.writeFileSync(TXN_PATH, JSON.stringify(data, null, 2));
}

/** Appends rows (does not dedupe/overwrite — caller's responsibility once
 * the real ingestion format is designed). */
function appendRows(rows) {
  const data = readTransactions();
  data.rows.push(...rows);
  writeTransactions(data);
  return data;
}

module.exports = { readTransactions, appendRows };
