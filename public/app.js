const el = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const posName = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', K: 'K', DST: 'DST' };

/* ---------------------------------------------------------------- tabs --- */

const onShow = { coach: loadCoach, history: loadHistory, trends: loadTrends, scouting: loadScouting };
el('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-view]');
  if (!btn) return;
  document.querySelectorAll('nav.tabs button').forEach((b) => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${btn.dataset.view}`));
  if (onShow[btn.dataset.view]) onShow[btn.dataset.view]();
});

function toggle(panelId) { el(panelId).classList.toggle('open'); }

/* ---------------------------------------------------------- draft board --- */

let boardData = [];
const draftState = { q: '', pos: 'ALL', showTaken: false, sortKey: 'roachRank', sortDir: 1,
  taken: new Set(JSON.parse(localStorage.getItem('roach_taken') || '[]')) };

function saveTaken() {
  localStorage.setItem('roach_taken', JSON.stringify([...draftState.taken]));
}

function gapClass(vg) {
  if (vg == null) return '';
  if (vg > 5) return 'pos';
  if (vg < -5) return 'neg';
  return '';
}

function renderDraftTable() {
  const q = draftState.q.trim().toLowerCase();
  let rows = boardData.filter((p) => {
    if (!draftState.showTaken && draftState.taken.has(p.name)) return false;
    if (draftState.pos !== 'ALL' && p.pos !== draftState.pos) return false;
    if (q && !p.name.toLowerCase().includes(q) && !(p.team || '').toLowerCase().includes(q)) return false;
    return true;
  });
  rows.sort((a, b) => {
    let av = a[draftState.sortKey]; let bv = b[draftState.sortKey];
    if (av == null) av = 9999; if (bv == null) bv = 9999;
    if (typeof av === 'string') return av.localeCompare(bv) * draftState.sortDir;
    return (av - bv) * draftState.sortDir;
  });
  el('draft-count').textContent = `${rows.length} players`;
  if (rows.length === 0) {
    setRows('draft-table', '', 13);
    return;
  }
  const html = rows.map((p) => {
    const taken = draftState.taken.has(p.name);
    const vg = p.valueGap;
    const vgStr = vg == null ? '—' : (vg > 0 ? '+' + vg : vg);
    const shift = p.shift;
    const shiftStr = shift == null ? '—' : (shift > 0 ? '+' + shift : shift);
    const shiftCls = shift > 0 ? 'pos' : (shift < 0 ? 'neg' : '');
    const projStr = p.proj == null ? '—' : p.proj.toFixed(1);
    const vorStr = p.vor == null ? '—' : (p.vor > 0 ? '+' : '') + p.vor.toFixed(1);
    const vorCls = p.vor == null ? '' : (p.vor > 0 ? 'pos' : (p.vor < 0 ? 'neg' : ''));
    return `<tr class="${taken ? 'taken' : ''}" data-name="${esc(p.name)}">
      <td class="num">${p.roachRank}</td>
      <td class="pname">${esc(p.name)}</td>
      <td><span class="pos-tag pos-${p.pos}">${posName[p.pos] || p.pos}</span></td>
      <td class="hide-sm">${esc(p.team || '')}</td>
      <td class="num">${p.ecr ?? '—'}</td>
      <td class="num hide-sm ${shiftCls}">${shiftStr}</td>
      <td class="num hide-sm">${p.cbsRank ?? '—'}</td>
      <td class="num hide-sm">${projStr}</td>
      <td class="num hide-sm ${vorCls}">${vorStr}</td>
      <td class="num">${p.adp ?? '—'}</td>
      <td class="num ${gapClass(vg)}">${vgStr}</td>
      <td class="num hide-sm">${p.bye ?? '—'}</td>
      <td><button class="taken-btn" data-name="${esc(p.name)}">${taken ? 'Undo' : 'Taken'}</button></td>
    </tr>`;
  }).join('');
  setRows('draft-table', html, 11);
  updateSortArrows();
}

function setRows(tableId, html, colspan) {
  el(tableId).querySelector('tbody').innerHTML = html || `<tr><td colspan="${colspan}" class="empty">No players match.</td></tr>`;
}

function updateSortArrows() {
  document.querySelectorAll('#draft-table thead th').forEach((th) => {
    const arrow = th.querySelector('.arrow');
    if (arrow) arrow.remove();
    if (th.dataset.key === draftState.sortKey) {
      th.insertAdjacentHTML('beforeend', `<span class="arrow">${draftState.sortDir === 1 ? '↑' : '↓'}</span>`);
    }
  });
}

async function loadDraftBoard() {
  try {
    const res = await fetch('/api/board');
    const body = await res.json();
    if (!res.ok) { setRows('draft-table', `<tr><td colspan="9" class="error">${esc(body.error)}</td></tr>`, 9); return; }
    boardData = body.players;
    renderDraftTable();
  } catch (err) {
    setRows('draft-table', `<tr><td colspan="9" class="error">${esc(err.message)}</td></tr>`, 9);
  }
}

el('draft-search').addEventListener('input', (e) => { draftState.q = e.target.value; renderDraftTable(); });
el('draft-show-taken').addEventListener('change', (e) => { draftState.showTaken = e.target.checked; renderDraftTable(); });
el('draft-pos-filter').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  document.querySelectorAll('#draft-pos-filter .chip').forEach((c) => c.classList.remove('active'));
  chip.classList.add('active');
  draftState.pos = chip.dataset.pos;
  renderDraftTable();
});
document.querySelectorAll('#draft-table thead th[data-key]').forEach((th) => {
  th.addEventListener('click', () => {
    const key = th.dataset.key;
    if (draftState.sortKey === key) draftState.sortDir *= -1;
    else { draftState.sortKey = key; draftState.sortDir = 1; }
    renderDraftTable();
  });
});
el('draft-table').querySelector('tbody').addEventListener('click', (e) => {
  const btn = e.target.closest('.taken-btn');
  if (!btn) return;
  const name = btn.dataset.name;
  if (draftState.taken.has(name)) draftState.taken.delete(name); else draftState.taken.add(name);
  saveTaken();
  renderDraftTable();
});

/* --------------------------------------------------------------- coach --- */

function fmtWhen(ts) {
  if (!ts) return { text: 'never synced', stale: false };
  const d = new Date(ts);
  const days = (Date.now() - d.getTime()) / 86400000;
  return { text: 'Last synced ' + d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), stale: days > 8 };
}
function setUpdatedTag(id, ts) {
  const r = fmtWhen(ts);
  const node = el(id);
  node.textContent = r.text;
  node.classList.toggle('stale', r.stale);
}

function parseLineupInput(text) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const parts = line.split(',').map((s) => s.trim());
    return { name: parts[0], pos: parts[1], score: parseFloat(parts[2]) };
  });
}
function parseNames(text) { return text.split('\n').map((l) => l.trim()).filter(Boolean); }
function parseStandings(text) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const parts = line.split(',').map((s) => s.trim());
    return { team: parts[0], record: parts[1] || '', pointsFor: parts[2] || '' };
  });
}

function renderLineup(derived) {
  if (!derived || !derived.lineup) { setRows('lineup-table', '', 4); return; }
  const { slots, bench } = derived.lineup;
  const rows = Object.entries(slots).map(([slot, players]) =>
    players.map((p) => `<tr><td>${esc(slot)}</td><td>${esc(p.name)}</td><td><span class="pos-tag pos-${p.pos}">${posName[p.pos] || p.pos}</span></td><td class="num">${p.score}</td></tr>`).join('')
  ).join('');
  const benchRows = bench.map((p) => `<tr><td class="hide-sm">BENCH</td><td>${esc(p.name)}</td><td><span class="pos-tag pos-${p.pos}">${posName[p.pos] || p.pos}</span></td><td class="num">${p.score}</td></tr>`).join('');
  setRows('lineup-table', rows + benchRows, 4);
}

function renderWaivers(derived) {
  if (!derived || !derived.waiverSuggestions || derived.waiverSuggestions.length === 0) { setRows('waiver-table', '', 3); return; }
  const rows = derived.waiverSuggestions.map((s) => `
    <tr>
      <td>${esc(s.add.name)} <span class="pos-tag pos-${s.add.pos}">${posName[s.add.pos] || s.add.pos}</span> — rank ${s.add.roachRank}</td>
      <td>${s.dropCandidate ? esc(s.dropCandidate.name) + ' — rank ' + s.dropCandidate.roachRank : '—'}</td>
      <td>${s.isUpgrade ? '<strong class="pos">Upgrade</strong>' : 'Not an upgrade'}</td>
    </tr>`).join('');
  setRows('waiver-table', rows, 3);
}

function renderStandings(teams) {
  if (!teams || teams.length === 0) { setRows('standings-table', '', 3); return; }
  const rows = teams.map((t) => `<tr><td>${esc(t.team)}</td><td>${esc(t.record)}</td><td class="num">${esc(t.pointsFor)}</td></tr>`).join('');
  setRows('standings-table', rows, 3);
}

async function loadCoach() {
  const res = await fetch('/api/state');
  const state = await res.json();
  setUpdatedTag('roster-updated', state.roster.updatedAt);
  setUpdatedTag('waiver-updated', state.waivers.updatedAt);
  setUpdatedTag('standings-updated', state.standings.updatedAt);
  renderLineup(state.derived);
  renderWaivers(state.derived);
  renderStandings(state.standings.teams);
  el('roster-input').value = state.roster.players.map((p) => `${p.name}, ${p.pos}, ${p.score}`).join('\n');
  el('fa-input').value = (state.waivers.freeAgents || []).map((f) => (typeof f === 'string' ? f : f.name)).join('\n');
  el('standings-input').value = (state.standings.teams || []).map((t) => `${t.team}, ${t.record}, ${t.pointsFor}`).join('\n');
}

el('roster-toggle').addEventListener('click', () => toggle('roster-panel'));
el('waiver-toggle').addEventListener('click', () => toggle('waiver-panel'));
el('standings-toggle').addEventListener('click', () => toggle('standings-panel'));

el('roster-save').addEventListener('click', async () => {
  const errEl = el('roster-err');
  errEl.innerHTML = '';
  let players;
  try {
    players = parseLineupInput(el('roster-input').value);
    if (players.length === 0 || players.some((p) => !p.name || !p.pos || isNaN(p.score))) throw new Error('Each line needs Name, POS, score');
  } catch (e) { errEl.innerHTML = `<div class="error">${esc(e.message)}</div>`; return; }
  const res = await fetch('/api/state/roster', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ players }) });
  const body = await res.json();
  if (!res.ok) { errEl.innerHTML = `<div class="error">${esc(body.error)}</div>`; return; }
  await loadCoach();
  toggle('roster-panel');
});

el('waiver-save').addEventListener('click', async () => {
  const freeAgents = parseNames(el('fa-input').value);
  const res = await fetch('/api/state/waivers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ freeAgents }) });
  const body = await res.json();
  if (!res.ok) { el('waiver-err').innerHTML = `<div class="error">${esc(body.error)}</div>`; return; }
  await loadCoach();
  toggle('waiver-panel');
});

el('standings-save').addEventListener('click', async () => {
  const teams = parseStandings(el('standings-input').value);
  const res = await fetch('/api/state/standings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teams }) });
  const body = await res.json();
  if (!res.ok) { el('standings-err').innerHTML = `<div class="error">${esc(body.error)}</div>`; return; }
  await loadCoach();
  toggle('standings-panel');
});

/* -------------------------------------------------------------- trends --- */

let trendsData = { weeks: [], players: [] };
const trendsState = { q: '', team: 'ALL', sortKey: 'total', sortDir: -1 };

function buildTrendsHeader() {
  const row = el('trends-thead-row');
  row.innerHTML = '<th data-key="name">Player</th><th data-key="pos">Pos</th><th data-key="team">Team</th>'
    + trendsData.weeks.map((w) => `<th class="num" data-key="wk${w}">Wk${w}</th>`).join('')
    + '<th class="num" data-key="total">Total</th><th class="num" data-key="avg">Avg</th>';
  row.querySelectorAll('th[data-key]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (trendsState.sortKey === key) trendsState.sortDir *= -1;
      else { trendsState.sortKey = key; trendsState.sortDir = key.startsWith('wk') || key === 'total' || key === 'avg' ? -1 : 1; }
      renderTrendsTable();
    });
  });
}

function buildTrendsTeamFilter() {
  const teams = [...new Set(trendsData.players.map((p) => p.team))].sort();
  const wrap = el('trends-team-filter');
  wrap.innerHTML = '<button class="chip active" data-team="ALL">All</button>'
    + teams.map((t) => `<button class="chip" data-team="${esc(t)}">${esc(t)}</button>`).join('');
  wrap.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      wrap.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      trendsState.team = chip.dataset.team;
      renderTrendsTable();
    });
  });
}

function trendsRowValue(p, key) {
  if (key === 'name' || key === 'pos' || key === 'team') return p[key];
  if (key === 'total') return p.total;
  if (key === 'avg') return p.avg;
  if (key.startsWith('wk')) {
    const idx = trendsData.weeks.indexOf(Number(key.slice(2)));
    return idx >= 0 ? p.pointsByWeek[idx] : null;
  }
  return null;
}

function renderTrendsTable() {
  const q = trendsState.q.trim().toLowerCase();
  let rows = trendsData.players.filter((p) => {
    if (trendsState.team !== 'ALL' && p.team !== trendsState.team) return false;
    if (q && !p.name.toLowerCase().includes(q)) return false;
    return true;
  });
  rows.sort((a, b) => {
    let av = trendsRowValue(a, trendsState.sortKey);
    let bv = trendsRowValue(b, trendsState.sortKey);
    if (av == null) av = trendsState.sortDir === 1 ? Infinity : -Infinity;
    if (bv == null) bv = trendsState.sortDir === 1 ? Infinity : -Infinity;
    if (typeof av === 'string') return av.localeCompare(bv) * trendsState.sortDir;
    return (av - bv) * trendsState.sortDir;
  });
  el('trends-count').textContent = `${rows.length} players, ${trendsData.weeks.length} weeks logged`;
  if (rows.length === 0) {
    setRows('trends-table', '', 3 + trendsData.weeks.length + 2);
    return;
  }
  const html = rows.map((p) => {
    const weekCells = p.pointsByWeek.map((v) => `<td class="num">${v == null ? '—' : v}</td>`).join('');
    return `<tr>
      <td class="pname">${esc(p.name)}</td>
      <td><span class="pos-tag pos-${p.pos}">${posName[p.pos] || p.pos}</span></td>
      <td>${esc(p.team)}</td>
      ${weekCells}
      <td class="num">${p.total}</td>
      <td class="num">${p.avg ?? '—'}</td>
    </tr>`;
  }).join('');
  setRows('trends-table', html, 3 + trendsData.weeks.length + 2);
}

el('trends-search').addEventListener('input', (e) => { trendsState.q = e.target.value; renderTrendsTable(); });

async function loadTrends() {
  // Unlike history (static), trends can gain a new week any time someone
  // asks Claude to log one — always refetch rather than caching once.
  try {
    const res = await fetch('/api/trends');
    trendsData = await res.json();
    buildTrendsHeader();
    buildTrendsTeamFilter();
    renderTrendsTable();
  } catch (err) {
    setRows('trends-table', `<tr><td colspan="6" class="error">${esc(err.message)}</td></tr>`, 6);
  }
}

/* --------------------------------------------------------- scouting report --- */

function luckClass(v) {
  if (v == null) return '';
  return v > 0 ? 'pos' : v < 0 ? 'neg' : '';
}

let scoutingAlertsTeam = 'ALL';
let scoutingSeasonTrend = null;
let scoutingHighlightTeam = null;

const TEAM_LINE_COLORS = ['#6db3e0', '#b39ddb', '#c9a4a0', '#e0a15b', '#7fd1c9', '#e08fd1', '#9fb87a', '#d19a9a', '#8fa8d1', '#c4c46a'];
function colorForTeam(team, index) {
  return team === 'BuzzKill' ? getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    : TEAM_LINE_COLORS[index % TEAM_LINE_COLORS.length];
}

function fitChartCanvas(canvas) {
  const cssH = canvas.height || canvas.clientHeight;
  const rect = canvas.getBoundingClientRect();
  const cssW = rect.width || canvas.clientWidth;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.height = `${cssH}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: cssW, h: cssH };
}

function renderEfficiencyChart(trend) {
  scoutingSeasonTrend = trend;
  const box = el('scouting-eff-chart-box');
  const teamNames = trend ? Object.keys(trend.teams) : [];
  if (!trend || trend.weeks.length < 2 || !teamNames.length) {
    box.style.display = 'none';
    return;
  }
  box.style.display = '';
  drawEfficiencyChart();
}

function drawEfficiencyChart() {
  const trend = scoutingSeasonTrend;
  if (!trend) return;
  const canvas = el('scouting-eff-chart');
  const { ctx, w, h } = fitChartCanvas(canvas);
  const padL = 34, padR = 10, padT = 10, padB = 20;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const weeks = trend.weeks;
  const teamNames = Object.keys(trend.teams);
  const muted = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
  const border = getComputedStyle(document.documentElement).getPropertyValue('--border').trim();

  ctx.clearRect(0, 0, w, h);

  // gridlines at 0/50/100%
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.fillStyle = muted;
  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  [0, 50, 100].forEach((pct) => {
    const y = padT + plotH - (pct / 100) * plotH;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(`${pct}%`, padL - 6, y);
  });

  const xAt = (i) => padL + (weeks.length === 1 ? plotW / 2 : (i / (weeks.length - 1)) * plotW);
  const yAt = (pct) => padT + plotH - (Math.max(0, Math.min(100, pct)) / 100) * plotH;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  weeks.forEach((wk, i) => ctx.fillText(`W${wk}`, xAt(i), h - padB + 4));

  const drawLine = (teamName, colorIdx, emphasize) => {
    const values = trend.teams[teamName];
    const color = colorForTeam(teamName, colorIdx);
    ctx.strokeStyle = color;
    ctx.lineWidth = emphasize ? 3 : 1.5;
    ctx.globalAlpha = scoutingHighlightTeam && !emphasize ? 0.18 : 1;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let started = false;
    values.forEach((v, i) => {
      if (v == null) { started = false; return; }
      const x = xAt(i), y = yAt(v);
      if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
    });
    ctx.stroke();
    values.forEach((v, i) => {
      if (v == null) return;
      ctx.beginPath();
      ctx.arc(xAt(i), yAt(v), emphasize ? 3 : 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  };

  const teamNamesOrdered = teamNames.slice().sort((a, b) => (a === 'BuzzKill' ? -1 : b === 'BuzzKill' ? 1 : 0));
  teamNamesOrdered.forEach((teamName, i) => {
    const emphasize = teamName === 'BuzzKill' || teamName === scoutingHighlightTeam;
    if (!emphasize) drawLine(teamName, i, false);
  });
  teamNamesOrdered.forEach((teamName, i) => {
    const emphasize = teamName === 'BuzzKill' || teamName === scoutingHighlightTeam;
    if (emphasize) drawLine(teamName, i, true);
  });
}

document.addEventListener('click', (e) => {
  const row = e.target.closest('#scouting-season-table tbody tr[data-team]');
  if (!row) return;
  const team = row.dataset.team;
  scoutingHighlightTeam = scoutingHighlightTeam === team ? null : team;
  document.querySelectorAll('#scouting-season-table tbody tr').forEach((r) => {
    r.classList.toggle('chart-highlight', r.dataset.team === scoutingHighlightTeam);
  });
  drawEfficiencyChart();
});

function renderMatchup(matchup) {
  const empty = el('scouting-matchup-empty');
  const body = el('scouting-matchup-body');
  if (!matchup) {
    empty.style.display = '';
    body.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  body.style.display = '';

  el('scouting-matchup-label').textContent = `— Week ${matchup.week}`;
  el('scouting-matchup-self-name').textContent = matchup.team;
  el('scouting-matchup-opp-name').textContent = matchup.opponent;
  el('scouting-matchup-self-proj').textContent = matchup.projected.self;
  el('scouting-matchup-opp-proj').textContent = matchup.projected.opponent;

  const edgeRows = matchup.edgeBySlot.map((e) => `
    <tr>
      <td>${esc(e.slot)}</td>
      <td class="num ${e.edge > 0 ? 'pos' : e.edge < 0 ? 'neg' : ''}">${e.edge > 0 ? '+' : ''}${e.edge}</td>
    </tr>`).join('');
  setRows('scouting-matchup-edge-table', edgeRows, 2);

  const notes = [];
  if (matchup.opponentGap) {
    const targets = matchup.opponentGap.targets.map((t) => esc(t.name)).join(', ') || 'none available';
    notes.push(`<div class="stat"><div class="label">Their weakest slot</div><div class="value">${esc(matchup.opponentGap.weakestPos)} <span style="font-size:12px; color:var(--muted); font-weight:400;">— upgrades: ${targets}</span></div></div>`);
  }
  if (matchup.myGap) {
    const targets = matchup.myGap.targets.map((t) => esc(t.name)).join(', ') || 'none available';
    notes.push(`<div class="stat"><div class="label">Your weakest slot</div><div class="value">${esc(matchup.myGap.weakestPos)} <span style="font-size:12px; color:var(--muted); font-weight:400;">— upgrades: ${targets}</span></div></div>`);
  }
  if (matchup.form.opponent.length) {
    const scores = matchup.form.opponent.map((f) => f.actual).join(', ');
    notes.push(`<div class="stat"><div class="label">Their recent scores</div><div class="value">${esc(scores)}</div></div>`);
  }
  el('scouting-matchup-notes').innerHTML = notes.join('') || '<p class="empty" style="padding-top:0">No gap or form data yet.</p>';
}

function renderAlertCard(a) {
  return `
    <div class="stat">
      <div class="label">${esc(a.name)} · ${esc(a.pos)} · ${esc(a.team)}</div>
      <div class="value ${a.last3[2] > a.last3[0] ? 'pos' : 'neg'}">${a.last3.join(' → ')}</div>
    </div>`;
}

async function loadScouting() {
  // Same reasoning as trends: this can change any time a new week is
  // synced, so always refetch rather than caching once.
  try {
    const res = await fetch(`/api/scouting-report?alertsTeam=${encodeURIComponent(scoutingAlertsTeam)}`);
    const data = await res.json();

    renderMatchup(data.matchup);

    // Populate the alerts team filter once (idempotent) with real team names.
    const filterEl = el('scouting-alerts-team-filter');
    if (filterEl.options.length <= 1 && data.trendTeams.length) {
      data.trendTeams.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t === 'Free Agent' ? 'Waiver Wire (Free Agents)' : t;
        filterEl.appendChild(opt);
      });
      filterEl.value = scoutingAlertsTeam;
    }

    // Weekly actual vs optimal
    if (data.latestWeek) {
      el('scouting-empty-note').style.display = 'none';
      el('scouting-week-label').textContent = `— Week ${data.latestWeek.week} (league avg ${data.latestWeek.leagueAvg ?? '—'})`;
      const rows = Object.entries(data.latestWeek.teams)
        .sort((a, b) => (b[1].regret ?? -Infinity) - (a[1].regret ?? -Infinity))
        .map(([team, r]) => `
          <tr>
            <td>${esc(team)}</td>
            <td class="num">${r.actual ?? '—'}</td>
            <td class="num">${r.optimal}</td>
            <td class="num ${r.regret > 0 ? 'neg' : ''}">${r.regret ?? '—'}</td>
            <td class="num ${luckClass(r.luckDelta)}">${r.luckDelta != null ? (r.luckDelta > 0 ? '+' : '') + r.luckDelta : '—'}</td>
          </tr>`).join('');
      setRows('scouting-week-table', rows, 5);

      const mySwaps = (data.latestWeek.teams.BuzzKill && data.latestWeek.teams.BuzzKill.missedSwaps) || [];
      el('scouting-swaps-list').innerHTML = mySwaps.length
        ? mySwaps.map((s) => `
          <div class="swap-item">
            <div class="swap-side in">
              <span class="pos-tag pos-${esc(s.startInsteadPos)}">${esc(s.startInsteadPos)}</span>
              <span class="swap-name">${esc(s.startInstead)}</span>
              <span class="swap-score">${s.startInsteadScore} pts</span>
            </div>
            <span class="swap-arrow">should've started over</span>
            <div class="swap-side out">
              <span class="pos-tag pos-${esc(s.satPlayerPos)}">${esc(s.satPlayerPos)}</span>
              <span class="swap-name">${esc(s.satPlayer)}</span>
              <span class="swap-score">${s.satPlayerScore} pts</span>
            </div>
            <span class="swap-swing">+${s.swing} pts</span>
          </div>`).join('')
        : `<p class="empty">No missed opportunities — your lineup was optimal.</p>`;
    } else {
      setRows('scouting-week-table', '', 5);
      el('scouting-swaps-list').innerHTML = `<p class="empty">No data yet.</p>`;
    }

    // Season efficiency table
    const seasonRows = data.season.map((r) => `
      <tr data-team="${esc(r.team)}">
        <td>${esc(r.team)}</td>
        <td class="num">${r.weeks}</td>
        <td class="num">${r.actual}</td>
        <td class="num">${r.optimal}</td>
        <td class="num ${r.regret > 0 ? 'neg' : ''}">${r.regret}</td>
        <td class="num">${r.efficiencyPct != null ? r.efficiencyPct + '%' : '—'}</td>
      </tr>`).join('');
    setRows('scouting-season-table', seasonRows, 6);
    renderEfficiencyChart(data.seasonTrend);

    // Trend alerts — split rising/falling, already capped to top movers server-side
    el('scouting-alerts-up').innerHTML = data.trendAlerts.rising.length
      ? data.trendAlerts.rising.map(renderAlertCard).join('')
      : `<p class="empty">No risers yet.</p>`;
    el('scouting-alerts-down').innerHTML = data.trendAlerts.falling.length
      ? data.trendAlerts.falling.map(renderAlertCard).join('')
      : `<p class="empty">No fallers yet.</p>`;

    // Positional gaps
    const gapRows = data.positionalGaps.map((g) => `
      <tr>
        <td>${esc(g.team)}</td>
        <td>${esc(g.weakestPos)}</td>
        <td>${g.targets.length ? g.targets.map((t) => esc(t.name)).join(', ') : '—'}</td>
      </tr>`).join('');
    setRows('scouting-gaps-table', gapRows, 3);

    // Trade ideas
    const tradeAssetDetail = (a) => {
      const bits = [`Proj ${a.proj != null ? a.proj : '—'}`];
      if (a.gamesPlayed > 0) bits.push(`${a.seasonAvg} pts/gm (${a.gamesPlayed} gm)`);
      return bits.join(' · ');
    };
    el('scouting-trades-list').innerHTML = data.tradeIdeas.length
      ? data.tradeIdeas.map((t) => `
        <div class="trade-card">
          <div class="trade-head">
            <span class="trade-grade grade-${esc(t.grade)}">${esc(t.grade)}</span>
            <span class="trade-team">Trade with ${esc(t.team)}</span>
            <span class="trade-likelihood ${esc(t.likelihood)}">${t.likelihood} accept odds</span>
            <span class="trade-swing ${t.weeklyLineupDelta >= 0 ? 'pos' : 'neg'}">${t.weeklyLineupDelta >= 0 ? '+' : ''}${t.weeklyLineupDelta} pts/wk to your lineup</span>
          </div>
          <div class="trade-swap">
            <span class="trade-dir give">You give</span>
            <span class="pos-tag pos-${esc(t.give[0].pos)}">${esc(t.give[0].pos)}</span>
            <span class="trade-name">${esc(t.give[0].name)}</span>
            <span class="trade-rank">#${t.give[0].roachRank} · ${esc(tradeAssetDetail(t.give[0]))}</span>
          </div>
          <div class="trade-swap">
            <span class="trade-dir get">You get</span>
            <span class="pos-tag pos-${esc(t.get[0].pos)}">${esc(t.get[0].pos)}</span>
            <span class="trade-name">${esc(t.get[0].name)}</span>
            <span class="trade-rank">#${t.get[0].roachRank} · ${esc(tradeAssetDetail(t.get[0]))}</span>
          </div>
          <ul class="trade-reasoning">
            ${t.reasoning.map((line) => `<li>${esc(line)}</li>`).join('')}
          </ul>
        </div>`).join('')
      : `<p class="empty">No trade ideas yet — needs at least one synced roster per team and the draft board.</p>`;
  } catch (err) {
    setRows('scouting-week-table', `<tr><td colspan="5" class="error">${esc(err.message)}</td></tr>`, 5);
  }
}

el('scouting-alerts-team-filter').addEventListener('change', (e) => {
  scoutingAlertsTeam = e.target.value;
  loadScouting();
});

/* ------------------------------------------------------------- history --- */

let historyLoaded = false;
async function loadHistory() {
  if (historyLoaded) return;
  historyLoaded = true;
  try {
    const corrRes = await fetch('/api/history/correlation');
    const corr = await corrRes.json();
    el('history-corr').innerHTML = Object.entries(corr).map(([year, rho]) => `
      <div class="stat"><div class="label">${esc(year)}</div><div class="value">${rho != null ? rho.toFixed(2) : 'n/a'}</div></div>
    `).join('');
  } catch (err) {
    el('history-corr').innerHTML = `<div class="error">${esc(err.message)}</div>`;
  }

  try {
    const roundsRes = await fetch('/api/history/kurt-rounds');
    const rounds = await roundsRes.json();
    const rows = rounds.map((r) => {
      const cls = r.diffPct >= 0 ? 'pos' : 'neg';
      return `<tr><td>R${r.round}</td><td class="num">${r.managerAvg}</td><td class="num">${r.fieldAvg}</td><td class="num ${cls}">${r.diffPct > 0 ? '+' : ''}${r.diffPct}%</td></tr>`;
    }).join('');
    setRows('history-rounds-table', rows, 4);
  } catch (err) {
    setRows('history-rounds-table', `<tr><td colspan="4" class="error">${esc(err.message)}</td></tr>`, 4);
  }
}

/* --------------------------------------------------------------- init --- */

saveTaken();
loadDraftBoard();
loadCoach();
