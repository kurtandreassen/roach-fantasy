const el = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const posName = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', K: 'K', DST: 'DST' };

/* ---------------------------------------------------------------- tabs --- */

const onShow = { coach: loadCoach, history: loadHistory };
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
    setRows('draft-table', '', 9);
    return;
  }
  const html = rows.map((p) => {
    const taken = draftState.taken.has(p.name);
    const vg = p.valueGap;
    const vgStr = vg == null ? '—' : (vg > 0 ? '+' + vg : vg);
    return `<tr class="${taken ? 'taken' : ''}" data-name="${esc(p.name)}">
      <td class="num">${p.roachRank}</td>
      <td class="pname">${esc(p.name)}</td>
      <td><span class="pos-tag pos-${p.pos}">${posName[p.pos] || p.pos}</span></td>
      <td class="hide-sm">${esc(p.team || '')}</td>
      <td class="num hide-sm">${p.tier ?? '—'}</td>
      <td class="num">${p.adp ?? '—'}</td>
      <td class="num ${gapClass(vg)}">${vgStr}</td>
      <td class="num hide-sm">${p.bye ?? '—'}</td>
      <td><button class="taken-btn" data-name="${esc(p.name)}">${taken ? 'Undo' : 'Taken'}</button></td>
    </tr>`;
  }).join('');
  setRows('draft-table', html, 9);
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
