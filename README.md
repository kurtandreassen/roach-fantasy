# roach-fantasy

Draft prep tools for the Brighton Roach CBS Sportsline league (team BuzzKill).
Separate project from `espn-fantasy` — different league, different scoring,
and **no live API**: CBS's developer API has been dead for years, and the
only known third-party workaround requires submitting your real account
password, which this project will never do. Everything here is either a
one-time manual data pull (via a logged-in Chrome session) or a static/local
tool — there is no backend polling loop.

## What's here

- **Draft board** (`/`) — the full player pool ranked for this league's exact
  roster shape and scoring, filterable/sortable, click a player to mark him
  taken (persists in your browser via localStorage).
- **Draft history** (`/history.html`) — a 5-season backtest pulled from CBS's
  own League → Year by Year → Draft Results pages: does draft order predict
  outcome here (yes, ρ ≈ 0.46–0.52, matching the espn-fantasy league's own
  benchmark), and how has Kurt's own drafting held up round-by-round.

## Architecture

- `src/rankings/leagueConfig.js` — the league's exact roster shape and
  scoring rules, verified from the live `/rules` page. Single source of
  truth; re-verify against the site if settings ever change.
- `src/rankings/buildBoard.js` — turns a FantasyPros full-PPR ECR snapshot
  into this league's ranked board. Base = market consensus (ECR); only
  applies a bounded positional nudge (RB up, TE down) sized by how much
  experts already disagree, reflecting the league's two flex spots. Never
  overrides a confident consensus pick.
- `src/draftHistory/parseHistory.js` — parses the plain-text draft-history
  dumps in `data/draft-history/`, computes the pick-order/outcome
  correlation, and a manager's round-by-round performance vs. the field.
- `server.js` — Express app serving `public/` plus `/api/board` and
  `/api/history/*`.

## Refreshing the board

There is no automated fetch — FantasyPros paywalls their full rankings past
rank 10 for logged-out requests, but the complete data is present in the
page's embedded `ecrData` JS object regardless of what's rendered. Pull it
with a logged-in (or even logged-out — the data is embedded either way)
Chrome session:

1. Navigate to `https://www.fantasypros.com/nfl/rankings/ppr-cheatsheets.php`
2. Run in the page console (or via Claude's `javascript_tool`):
   ```js
   var data = ecrData.players.map(p => ({
     name: p.player_name, pos: p.player_position_id, team: p.player_team_id,
     ecr: p.rank_ecr, tier: p.tier, adp: p.rank_adp, sd: p.rank_std, bye: p.player_bye_week,
   }));
   // download as fp_ppr_ecr_<year>.json (Blob + <a download>, since the raw
   // JSON is too large for a single tool-result to return inline)
   ```
3. Save the file to `data/preseason/<year>-fantasypros-ppr-ecr.json`
4. Run `npm run build:board -- <year>` (defaults to 2026)

CBS's own site (`/stats/stats-main/.../projections/season`) is NOT usable
before the season starts — verified the stat columns are all zero preseason.

## Pulling more draft history

CBS keeps a full archive at `League → Year by Year → Draft Results`, going
back to 2008 (`/draft/results/<year>:Pre-season[:label]/`). Pull a year with
`get_page_text` on that page while logged in, save the pick lines to
`data/draft-history/<year>.txt` (see existing files for the exact format:
`ROUND N` headers, then `<pick#> <team> <player> <pos> <nflteam> [totalFpts activeFpts]`
per line), and add the team-name list to `TEAM_NAMES` in `server.js` and
`scripts/analyze-history.js` if you want manager-level breakdowns.

Known gaps: 2025 is unusable (blank player data site-wide, a mid-draft site
bug that year); 2020 and earlier have no season FPTS attached.

## Commands

```
npm start              # run the server (http://localhost:3000)
npm run dev             # same, with nodemon
npm test                 # run the Jest suite
npm run build:board      # rebuild data/preseason/<year>-roach-board.json
npm run analyze:history  # print the correlation check + round-by-round table
```

## Not built (yet)

- **Coach features** (waiver/lineup advice) — scoped for later. Since CBS
  has no API, this would work the same way draft prep did: Claude reads your
  actual roster/matchup/free-agent pages live via Claude in Chrome on
  request, not an automated recommendation engine.
- **Deployment** — currently local-only. If Kurt wants this reachable from
  his phone on draft night, deploy alongside espn-fantasy on Railway.
