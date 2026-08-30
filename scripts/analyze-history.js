#!/usr/bin/env node
// Prints the draft-order validation check and, if a manager alias map is
// given, that manager's round-by-round performance vs. the field.
// Usage: node scripts/analyze-history.js

const path = require('path');
const {
  loadSeason,
  resolveTeams,
  pickOrderCorrelation,
  managerRoundPerformance,
} = require('../src/draftHistory/parseHistory');

const DATA_DIR = path.join(__dirname, '..', 'data', 'draft-history');

// Team names per season (needed to split team from player in the raw text).
// Extend this as more years are pulled.
const TEAM_NAMES = {
  2021: ['Afros', 'Thorbjorn Olesen', 'Billy A', 'Hong Kong Fluuey', 'Malachi Crunch',
    'Nicaraguan Crab Sandwich', 'Team Rollaway', 'Appleseed', 'T-Bag', 'Dez Nuts', 'Tim', 'Suq Madiq'],
  2022: ['Malachi Crunch', 'Dez Nuts', 'Billy A', 'T-Bag', 'Nicaraguan Crab Sandwich', 'Appleseed',
    'Afros', 'Bogota Express', 'Team Rollaway', 'Sloth', 'Tim', 'Suq Madiq'],
  2023: ['Malachi Crunch', 'Suq Madiq', 'Mike Hunt Smells', 'Dez Nuts', 'Team Rollaway',
    'Nicaraguan Crab Sandwich', "Jerry's Nub", 'Billy A', 'Frank Thomas', 'Appleseed', 'BuzzKill', 'BYE WEEK'],
};

// Kurt's team name changed across seasons — confirmed via draft-room chat logs.
const KURT_ALIASES = { 2021: 'Malachi Crunch', 2022: 'Malachi Crunch', 2023: 'BuzzKill' };

console.log('=== Draft order vs. season outcome (Spearman correlation) ===');
for (const year of [2021, 2022, 2023]) {
  const picks = loadSeason(DATA_DIR, year);
  const rho = pickOrderCorrelation(picks);
  console.log(`${year}: rho = ${rho != null ? rho.toFixed(3) : 'n/a'}`);
}

console.log('\n=== Kurt\'s round-by-round performance vs. field (2021-2023) ===');
const seasons = [2021, 2022, 2023].map((year) => {
  const rawPicks = loadSeason(DATA_DIR, year);
  const resolved = resolveTeams(rawPicks, TEAM_NAMES[year]);
  return { picks: resolved, managerTeam: KURT_ALIASES[year] };
});

// Aggregate across years manually since managerRoundPerformance expects one
// manager identity per call, but Kurt's identity changes by year — merge by
// tagging each season's picks with a synthetic constant team name.
const merged = seasons.map((s) => ({
  picks: s.picks.map((p) => ({ ...p, team: p.team === s.managerTeam ? '__KURT__' : p.team })),
  managerTeam: '__KURT__',
}));
const rows = managerRoundPerformance(merged);
console.log('Round | Kurt Avg | Field Avg | Diff');
for (const r of rows) {
  console.log(`R${r.round}\t${r.managerAvg}\t${r.fieldAvg}\t${r.diffPct > 0 ? '+' : ''}${r.diffPct}%`);
}
