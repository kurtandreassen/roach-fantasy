let DATA = [];
let state = {
  q: '',
  pos: 'ALL',
  showTaken: false,
  sortKey: 'roachRank',
  sortDir: 1,
  taken: new Set(JSON.parse(localStorage.getItem('roach_taken') || '[]')),
};

const posName = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', K: 'K', DST: 'DST' };

function saveTaken() {
  localStorage.setItem('roach_taken', JSON.stringify([...state.taken]));
  document.getElementById('taken-count').textContent = state.taken.size + ' marked taken';
}

function gapClass(vg) {
  if (vg == null) return 'gap-zero';
  if (vg > 5) return 'gap-pos';
  if (vg < -5) return 'gap-neg';
  return 'gap-zero';
}

function render() {
  const q = state.q.trim().toLowerCase();
  let rows = DATA.filter((p) => {
    if (!state.showTaken && state.taken.has(p.name)) return false;
    if (state.pos !== 'ALL' && p.pos !== state.pos) return false;
    if (q && !p.name.toLowerCase().includes(q) && !(p.team || '').toLowerCase().includes(q)) return false;
    return true;
  });
  rows.sort((a, b) => {
    let av = a[state.sortKey];
    let bv = b[state.sortKey];
    if (av == null) av = state.sortKey === 'adp' || state.sortKey === 'bye' ? 9999 : '';
    if (bv == null) bv = state.sortKey === 'adp' || state.sortKey === 'bye' ? 9999 : '';
    if (typeof av === 'string') return av.localeCompare(bv) * state.sortDir;
    return (av - bv) * state.sortDir;
  });

  document.getElementById('count').textContent = rows.length + ' players';
  const tbody = document.getElementById('rows');
  const empty = document.getElementById('empty');
  if (rows.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    tbody.innerHTML = rows.map((p) => {
      const taken = state.taken.has(p.name);
      const vg = p.valueGap;
      const vgStr = vg == null ? '&mdash;' : (vg > 0 ? '+' + vg : vg);
      return `<tr class="${taken ? 'taken' : ''}" data-name="${p.name.replace(/"/g, '&quot;')}">
        <td class="num rank">${p.roachRank}</td>
        <td class="name">${p.name}</td>
        <td><span class="pos-chip pos-${p.pos}">${posName[p.pos] || p.pos}</span></td>
        <td>${p.team || ''}</td>
        <td class="num">${p.tier ?? '&mdash;'}</td>
        <td class="num">${p.adp ?? '&mdash;'}</td>
        <td class="num ${gapClass(vg)}">${vgStr}</td>
        <td class="num">${p.bye ?? '&mdash;'}</td>
      </tr>`;
    }).join('');
  }
  updateSortArrows();
}

function updateSortArrows() {
  document.querySelectorAll('thead th').forEach((th) => {
    const arrow = th.querySelector('.arrow');
    if (!arrow) return;
    arrow.textContent = th.dataset.key === state.sortKey ? (state.sortDir === 1 ? '↑' : '↓') : '';
  });
}

async function loadBoard() {
  const res = await fetch('/api/board');
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    document.getElementById('rows').innerHTML = '';
    document.getElementById('empty').style.display = 'block';
    document.getElementById('empty').textContent = err.error || 'Failed to load board.';
    return;
  }
  const body = await res.json();
  DATA = body.players;
  render();
}

document.getElementById('search').addEventListener('input', (e) => { state.q = e.target.value; render(); });

document.getElementById('pos-chips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  document.querySelectorAll('#pos-chips .chip').forEach((c) => c.classList.remove('active'));
  chip.classList.add('active');
  state.pos = chip.dataset.pos;
  render();
});

document.getElementById('show-taken').addEventListener('change', (e) => {
  state.showTaken = e.target.checked;
  render();
});

document.querySelectorAll('thead th').forEach((th) => {
  th.addEventListener('click', () => {
    const key = th.dataset.key;
    if (state.sortKey === key) state.sortDir *= -1;
    else { state.sortKey = key; state.sortDir = 1; }
    render();
  });
});

document.getElementById('rows').addEventListener('click', (e) => {
  const tr = e.target.closest('tr');
  if (!tr) return;
  const name = tr.dataset.name;
  if (state.taken.has(name)) state.taken.delete(name);
  else state.taken.add(name);
  saveTaken();
  render();
});

document.getElementById('reset-btn').addEventListener('click', () => {
  state.taken.clear();
  saveTaken();
  render();
});

saveTaken();
loadBoard();
