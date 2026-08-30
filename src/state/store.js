// Server-side persistent state for the Coach dashboard: roster, free-agent
// pool, and standings, each with a last-updated timestamp, plus the
// computed lineup/waiver recommendations derived from them.
//
// Storage is a single JSON file on disk. On Railway this persists across
// requests within a running deployment but is WIPED on redeploy (ephemeral
// filesystem, no volume attached) — acceptable for now since state gets
// re-synced regularly anyway, but worth upgrading to a Railway volume or a
// small DB if losing state on redeploy becomes annoying.

const fs = require('fs');
const path = require('path');

const { optimizeLineup } = require('../coach/lineupOptimizer');
const { suggestWaivers } = require('../coach/waiverSuggest');

const STATE_PATH = path.join(__dirname, '..', '..', 'data', 'state', 'coach-state.json');

const EMPTY_STATE = {
  roster: { players: [], updatedAt: null },
  waivers: { freeAgents: [], updatedAt: null },
  standings: { teams: [], updatedAt: null },
};

function readState() {
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    return { ...EMPTY_STATE, ...JSON.parse(raw) };
  } catch (err) {
    return { ...EMPTY_STATE };
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function computeDerived(state, board) {
  const derived = { lineup: null, waiverSuggestions: null };
  if (state.roster.players.length > 0) {
    derived.lineup = optimizeLineup(state.roster.players);
  }
  if (board && state.waivers.freeAgents.length > 0) {
    const rosterNames = state.roster.players.map((p) => p.name);
    const faNames = state.waivers.freeAgents.map((f) => (typeof f === 'string' ? f : f.name));
    derived.waiverSuggestions = suggestWaivers(board, rosterNames, faNames, 15);
  }
  return derived;
}

function getFullState(board) {
  const state = readState();
  return { ...state, derived: computeDerived(state, board) };
}

function updateRoster(players) {
  const state = readState();
  state.roster = { players, updatedAt: new Date().toISOString() };
  writeState(state);
  return state;
}

function updateWaivers(freeAgents) {
  const state = readState();
  state.waivers = { freeAgents, updatedAt: new Date().toISOString() };
  writeState(state);
  return state;
}

function updateStandings(teams) {
  const state = readState();
  state.standings = { teams, updatedAt: new Date().toISOString() };
  writeState(state);
  return state;
}

module.exports = { readState, writeState, getFullState, updateRoster, updateWaivers, updateStandings, EMPTY_STATE };
