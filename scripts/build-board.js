#!/usr/bin/env node
// Regenerates data/preseason/<year>-roach-board.json from the FantasyPros
// ECR snapshot. Run this the morning of the draft (or whenever the ECR
// snapshot is refreshed) — it does NOT fetch live data itself, since that
// requires a logged-in Chrome session to pull FantasyPros' embedded data.
// See README.md for the manual refresh steps.

const fs = require('fs');
const path = require('path');
const { buildBoard } = require('../src/rankings/buildBoard');

const YEAR = process.argv[2] || '2026';
const inputPath = path.join(__dirname, '..', 'data', 'preseason', `${YEAR}-fantasypros-ppr-ecr.json`);
const outputPath = path.join(__dirname, '..', 'data', 'preseason', `${YEAR}-roach-board.json`);

if (!fs.existsSync(inputPath)) {
  console.error(`No ECR snapshot found at ${inputPath}`);
  console.error('Pull one first — see README.md "Refreshing the board" section.');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const board = buildBoard(raw);

fs.writeFileSync(outputPath, JSON.stringify(board, null, 2));
console.log(`Wrote ${board.length} players to ${outputPath}`);
console.log('Top 10:');
board.slice(0, 10).forEach((p) => {
  console.log(`  ${p.roachRank}. ${p.name} (${p.pos}, ${p.team}) — ecr ${p.ecr}, adp ${p.adp}`);
});
