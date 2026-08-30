# roach-fantasy

Draft prep and in-season tools for the Brighton Roach CBS Sportsline league
(team BuzzKill). Separate project from `espn-fantasy` — different league,
different scoring, and **no live API**: CBS's developer API has been dead for
years, and the only known third-party workaround requires submitting your
real account password, which this project will never do. Data gets in here
via one-time manual pulls (Claude reading your logged-in CBS/ESPN/FantasyPros
pages live), not a backend polling loop.

Live at: https://roach-fantasy-production.up.railway.app

## What's here

Single-page app (`public/index.html` + `app.js`), same shell as
`espn-fantasy`'s own dashboard (header, tab nav, dark theme, panel cards) —
three tabs, no Recap (this league has no weekly recap feature):

- **Draft Board** — the full player pool, filterable/sortable, click a player
  to mark him taken (persists via localStorage). Columns: **ECR** (market
  consensus base), **Shift** (how far our positional adjustment moved him),
  **CBS** (CBS/SportsLine's own expert rank, informational), **Proj/VOR**
  (real Roach-scored points and value-over-replacement — see below), **ADP**,
  **Falls** (our rank vs. market ADP).
- **Coach** — a persistent dashboard (server-side state, not per-browser) for
  Roster & Lineup, Waiver Targets, and Standings. Each section shows "last
  synced" and a manual paste-to-update fallback; the real sync path is asking
  Claude to read your live CBS pages and push through `/api/state/*`.
- **Draft History** — a 5-season backtest from CBS's own League → Year by
  Year → Draft Results pages: draft order predicts outcome here too (ρ ≈
  0.46–0.52, matching the espn-fantasy league's own benchmark), plus Kurt's
  own round-by-round performance vs. the field.

## How the ranking actually works

**Base: FantasyPros full-PPR ECR.** Market consensus beats a from-scratch
projection — validated on the espn-fantasy board first. A bounded positional
nudge (RB up, TE down) applies only where experts already disagree (rank_std
≥ 4), sized for this league's two flex spots (1 WR/TE, 1 RB/WR/TE — more
demand on RB/WR than the single-flex assumption most public rankings use). A
confident consensus pick never moves. This produces `roachRank`/`roachScore`
— **the actual sort order**, unchanged by everything below.

**Proj/VOR: real points, not a proxy.** Roach's scoring (0.1 pt/yard, 1pt/25
pass yards, 6pt TDs, tiered kicker distance bonus, etc.) is defined in
`leagueConfig.js`. For a while nothing actually *used* it — there was no
source of real per-player stat projections to apply it to. Fixed by reverse-
engineering ESPN's public player-projections endpoint (`lm-api-reads.fantasy
.espn.com/apis/v3/games/ffl/seasons/<year>/segments/0/leagues/<any-real-
league-id>?view=kona_player_info`, no auth beyond a logged-in ESPN session in
the browser) — it returns raw per-category stat projections (pass/rush/rec
yards, TDs, INTs, receptions) that are provider projections, not yet turned
into any particular league's points. `roachScoring.js` reapplies Roach's
exact formula to those raw numbers. **QB/RB/WR/TE only** — ESPN's payload
doesn't break kicker FG makes out by distance bucket (so Roach's tiered bonus
can't be reproduced) or carry the sack/INT/fumble/TD splits DST needs. Proj
and VOR are exposed as real, informational columns — like `cbsRank`, they do
**not** change `roachRank`. Making VOR primary without a real backtest would
repeat the mistake the espn-fantasy board's own history caught once already
(an unvalidated homemade-projection pivot lost to ADP twice in that league's
backtest) — the burden of proof is on the transformation, not on consensus.

**CBS column:** their own season-point projections are all zero site-wide
until the season starts (checked more than once), but their SportsLine-
powered "Expert" rank column is populated preseason. Pulled per position
(QB/RB/WR/TE/K — DST's report has a different column layout and wasn't worth
chasing for ~12 relevant teams) as a second opinion, informational only.

## Architecture

- `src/rankings/leagueConfig.js` — exact roster shape and scoring rules,
  verified from the live `/rules` page. Single source of truth; re-verify if
  settings ever change.
- `src/rankings/buildBoard.js` — the ranking engine described above.
- `src/rankings/roachScoring.js` — applies `leagueConfig.SCORING` to raw ESPN
  stat-category projections.
- `src/draftHistory/parseHistory.js` — parses `data/draft-history/*.txt`,
  computes the pick-order/outcome correlation and round-by-round performance.
- `src/coach/lineupOptimizer.js` / `waiverSuggest.js` — greedy lineup
  assignment across Roach's exact 10 slots; free-agent-vs-roster comparison.
- `src/state/store.js` — persistent Coach dashboard state (roster/waivers/
  standings + last-synced timestamps), a JSON file on disk. On Railway this
  survives requests within a deployment but is wiped on redeploy (no volume
  attached) — acceptable since state gets re-synced regularly anyway.
- `server.js` — Express app serving `public/` plus `/api/board`,
  `/api/history/*`, `/api/coach/*`, `/api/state/*`.

## Refreshing the rankings data

Three independent snapshots feed `npm run build:board`, each pulled the same
way: navigate there with a logged-in Chrome session and run JS in the page
console (or via Claude's `javascript_tool`) to extract and download the data
as JSON, since raw pulls are too large for a single tool-result.

**FantasyPros ECR** (`data/preseason/<year>-fantasypros-ppr-ecr.json`) —
required; the other two are optional enhancements.
`https://www.fantasypros.com/nfl/rankings/ppr-cheatsheets.php` — paywalls the
rendered UI past rank 10 for logged-out users, but the full list is in the
page's embedded `ecrData` JS object regardless:
```js
var data = ecrData.players.map(p => ({
  name: p.player_name, pos: p.player_position_id, team: p.player_team_id,
  ecr: p.rank_ecr, tier: p.tier, adp: p.rank_adp, sd: p.rank_std, bye: p.player_bye_week,
}));
```

**CBS expert rank** (`data/preseason/<year>-cbs-expert-rank.json`, shape
`{QB:[{n,r}], RB:[...], ...}`) — from
`https://<league>.football.cbssports.com/stats/stats-main/all:<POS>/all/points/season/full?print_rows=9999`,
one fetch per position (QB/RB/WR/TE/K), extracting the Player and Expert
columns (index 2 and 8 in each row).

**ESPN stat projections** (`data/preseason/<year>-espn-stat-projections.json`,
flat array of `{n, pos, "3":passYds, "24":rushYds, ...}`) — from
`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/<year>/segments/0/leagues/<leagueId>?view=kona_player_info`
with header `x-fantasy-filter: {"players":{"filterSlotIds":{"value":[0,2,4,6,16,17]},"sortPercOwned":{"sortAsc":false,"sortPriority":1},"limit":600}}`,
`credentials: 'include'`. Any real ESPN league ID works (the projections
aren't league-scoped, only `appliedTotal` would be — this pulls the raw
`stats` object instead). Extract `player.stats.find(s => s.statSourceId===1 && s.scoringPeriodId===0 && s.statSplitTypeId===0).stats`,
keeping stat IDs 3/4/20/24/25/42/43/53/83/86 (verified against
`espn-fantasy`'s own `database/seed/stat_names.json` — don't re-guess these).

After saving whichever snapshots you have: `npm run build:board -- <year>`
(defaults to 2026). Missing snapshots degrade gracefully (no CBS column, no
Proj/VOR) rather than failing.

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
npm start                # run the server (http://localhost:3000)
npm run dev               # same, with nodemon
npm test                   # run the Jest suite
npm run build:board        # rebuild data/preseason/<year>-roach-board.json
npm run analyze:history    # print the correlation check + round-by-round table
```

## Deployment

Railway, connected to `kurtandreassen/roach-fantasy` on GitHub. Auto-deploy
on push has been unreliable in this environment (the app-triggered webhook
doesn't always fire) — if a push doesn't show up, trigger it manually from
the Railway dashboard: service → Settings → Source → "Check for updates" →
"Update". The Railway **CLI** does not work from this machine's network (TLS
cert validation fails against `backboard.railway.com` — confirmed repeatable,
not a fluke); everything here goes through the web dashboard instead.

## Known gaps

- **Coach sync isn't automated** — no CBS API means no button can pull your
  roster/waivers/standings itself. The real trigger is asking Claude to read
  the live pages and push through `/api/state/*`.
- **K/DST have no real Proj/VOR** — ESPN's projection payload doesn't carry
  the data needed (FG-by-distance for K's tiered bonus, sack/INT/fumble/TD
  splits for DST). Both stay on the ECR+roster-shape system only.
- **Coach dashboard state resets on redeploy** — `data/state/coach-state.json`
  has no Railway volume attached yet.
