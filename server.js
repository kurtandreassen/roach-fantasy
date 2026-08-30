const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const fs = require('fs');
const path = require('path');

const { buildBoard } = require('./src/rankings/buildBoard');
const {
  loadSeason,
  resolveTeams,
  pickOrderCorrelation,
  managerRoundPerformance,
} = require('./src/draftHistory/parseHistory');
const { optimizeLineup } = require('./src/coach/lineupOptimizer');
const { suggestWaivers } = require('./src/coach/waiverSuggest');
const stateStore = require('./src/state/store');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function loadBoardOrNull(year) {
  const boardPath = path.join(DATA_DIR, 'preseason', `${year}-roach-board.json`);
  const ecrPath = path.join(DATA_DIR, 'preseason', `${year}-fantasypros-ppr-ecr.json`);
  const cbsPath = path.join(DATA_DIR, 'preseason', `${year}-cbs-expert-rank.json`);
  const espnPath = path.join(DATA_DIR, 'preseason', `${year}-espn-stat-projections.json`);
  if (fs.existsSync(boardPath)) return JSON.parse(fs.readFileSync(boardPath, 'utf8'));
  if (fs.existsSync(ecrPath)) {
    const cbs = fs.existsSync(cbsPath) ? JSON.parse(fs.readFileSync(cbsPath, 'utf8')) : null;
    const espn = fs.existsSync(espnPath) ? JSON.parse(fs.readFileSync(espnPath, 'utf8')) : null;
    return buildBoard(JSON.parse(fs.readFileSync(ecrPath, 'utf8')), cbs, espn);
  }
  return null;
}

// --- Board API ---------------------------------------------------------

app.get('/api/board', (req, res) => {
  const year = req.query.year || '2026';
  const boardPath = path.join(DATA_DIR, 'preseason', `${year}-roach-board.json`);
  const ecrPath = path.join(DATA_DIR, 'preseason', `${year}-fantasypros-ppr-ecr.json`);

  try {
    if (fs.existsSync(boardPath)) {
      const board = JSON.parse(fs.readFileSync(boardPath, 'utf8'));
      return res.json({ year, players: board, cached: true });
    }
    if (fs.existsSync(ecrPath)) {
      const raw = JSON.parse(fs.readFileSync(ecrPath, 'utf8'));
      const board = buildBoard(raw);
      return res.json({ year, players: board, cached: false });
    }
    return res.status(404).json({ error: `No ECR snapshot for ${year}. See README for refresh steps.` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --- Draft history API --------------------------------------------------

const TEAM_NAMES = {
  2021: ['Afros', 'Thorbjorn Olesen', 'Billy A', 'Hong Kong Fluuey', 'Malachi Crunch',
    'Nicaraguan Crab Sandwich', 'Team Rollaway', 'Appleseed', 'T-Bag', 'Dez Nuts', 'Tim', 'Suq Madiq'],
  2022: ['Malachi Crunch', 'Dez Nuts', 'Billy A', 'T-Bag', 'Nicaraguan Crab Sandwich', 'Appleseed',
    'Afros', 'Bogota Express', 'Team Rollaway', 'Sloth', 'Tim', 'Suq Madiq'],
  2023: ['Malachi Crunch', 'Suq Madiq', 'Mike Hunt Smells', 'Dez Nuts', 'Team Rollaway',
    'Nicaraguan Crab Sandwich', "Jerry's Nub", 'Billy A', 'Frank Thomas', 'Appleseed', 'BuzzKill', 'BYE WEEK'],
};
const KURT_ALIASES = { 2021: 'Malachi Crunch', 2022: 'Malachi Crunch', 2023: 'BuzzKill' };
const HISTORY_YEARS = [2020, 2021, 2022, 2023, 2024];

app.get('/api/history/correlation', (req, res) => {
  const results = {};
  for (const year of [2021, 2022, 2023]) {
    const picks = loadSeason(path.join(DATA_DIR, 'draft-history'), year);
    results[year] = pickOrderCorrelation(picks);
  }
  res.json(results);
});

app.get('/api/history/kurt-rounds', (req, res) => {
  const seasons = [2021, 2022, 2023].map((year) => {
    const rawPicks = loadSeason(path.join(DATA_DIR, 'draft-history'), year);
    const resolved = resolveTeams(rawPicks, TEAM_NAMES[year]).map((p) => ({
      ...p,
      team: p.team === KURT_ALIASES[year] ? '__KURT__' : p.team,
    }));
    return { picks: resolved, managerTeam: '__KURT__' };
  });
  res.json(managerRoundPerformance(seasons));
});

app.get('/api/history/years', (req, res) => {
  const available = HISTORY_YEARS.filter((y) =>
    fs.existsSync(path.join(DATA_DIR, 'draft-history', `${y}.txt`)));
  res.json({ years: available });
});

// --- Coach API -----------------------------------------------------------
// No live API exists to pull rosters/free agents automatically. These
// endpoints take data the caller supplies (fetched live via Claude-in-Chrome
// against CBS's actual pages) and do the actual decision-making in code.

app.post('/api/coach/lineup', (req, res) => {
  const { roster } = req.body || {};
  if (!Array.isArray(roster) || roster.length === 0) {
    return res.status(400).json({ error: 'Body must include a non-empty `roster` array of {name, pos, score}.' });
  }
  for (const p of roster) {
    if (typeof p.name !== 'string' || typeof p.pos !== 'string' || typeof p.score !== 'number') {
      return res.status(400).json({ error: 'Each roster entry needs {name: string, pos: string, score: number}.' });
    }
  }
  try {
    const result = optimizeLineup(roster);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/coach/waivers', (req, res) => {
  const { roster, freeAgents, year, topN } = req.body || {};
  if (!Array.isArray(roster) || !Array.isArray(freeAgents)) {
    return res.status(400).json({ error: 'Body must include `roster` and `freeAgents` arrays of player names.' });
  }
  const board = loadBoardOrNull(year || '2026');
  if (!board) {
    return res.status(404).json({ error: `No board available for ${year || '2026'}. Run npm run build:board first.` });
  }
  try {
    const suggestions = suggestWaivers(board, roster, freeAgents, topN || 10);
    res.json({ suggestions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Persistent Coach dashboard state ------------------------------------
// Unlike /api/coach/lineup and /api/coach/waivers above (stateless, one-off
// calculations), these endpoints hold the CURRENT roster/free-agent/
// standings snapshot server-side, so the dashboard shows the same thing on
// any device until the next sync — not just whatever's in one browser's
// localStorage. Sync itself still has to go through Claude reading the
// live CBS pages (via Claude-in-Chrome) and calling these endpoints; no
// button here can reach into your browser's other tabs on its own.

app.get('/api/state', (req, res) => {
  const board = loadBoardOrNull(req.query.year || '2026');
  res.json(stateStore.getFullState(board));
});

app.post('/api/state/roster', (req, res) => {
  const { players } = req.body || {};
  if (!Array.isArray(players)) {
    return res.status(400).json({ error: 'Body must include a `players` array of {name, pos, score}.' });
  }
  for (const p of players) {
    if (typeof p.name !== 'string' || typeof p.pos !== 'string' || typeof p.score !== 'number') {
      return res.status(400).json({ error: 'Each player needs {name: string, pos: string, score: number}.' });
    }
  }
  const state = stateStore.updateRoster(players);
  const board = loadBoardOrNull(req.query.year || '2026');
  res.json({ ...state, derived: stateStore.getFullState(board).derived });
});

app.post('/api/state/waivers', (req, res) => {
  const { freeAgents } = req.body || {};
  if (!Array.isArray(freeAgents)) {
    return res.status(400).json({ error: 'Body must include a `freeAgents` array of names.' });
  }
  const state = stateStore.updateWaivers(freeAgents);
  const board = loadBoardOrNull(req.query.year || '2026');
  res.json({ ...state, derived: stateStore.getFullState(board).derived });
});

app.post('/api/state/standings', (req, res) => {
  const { teams } = req.body || {};
  if (!Array.isArray(teams)) {
    return res.status(400).json({ error: 'Body must include a `teams` array.' });
  }
  const state = stateStore.updateStandings(teams);
  res.json(state);
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Roach fantasy tools running on http://localhost:${PORT}`);
});

module.exports = app;
