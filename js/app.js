import { loadCore, loadYears, topUp } from './store.js';
import { vehicleIcon } from './icons.js';
import { missionTitle, isFailure } from './normalize.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat();
const DAY = 864e5;

const fmtDate = (iso, opts = { month: 'short', day: 'numeric', year: 'numeric' }) => (iso ? new Date(iso).toLocaleDateString(undefined, opts) : '—');
const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
function rel(iso) {
  if (!iso) return '';
  const d = (Date.parse(iso) - Date.now()) / DAY;
  const a = Math.abs(d);
  const s = a < 1 / 24 ? `${Math.max(1, Math.round(a * 1440))} min` : a < 1 ? `${Math.round(a * 24)} h` : a < 60 ? `${Math.round(a)} d` : a < 730 ? `${Math.round(a / 30.44)} mo` : `${(a / 365.25).toFixed(1)} yr`;
  return d < 0 ? `${s} ago` : `in ${s}`;
}
function fmtDays(d) {
  if (d == null || !isFinite(d)) return '—';
  if (d < 1) return `${Math.round(d * 24)} h`;
  if (d < 10) { const h = Math.round((d % 1) * 24); return h ? `${Math.floor(d)} d ${h} h` : `${Math.floor(d)} d`; }
  return `${Math.round(d)} d`;
}
function met(sinceIso) {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(sinceIso)) / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return `${d}d ${p(h)}:${p(m)}:${p(sec)}`;
}
function countdown(iso) {
  const s = Math.floor((Date.parse(iso) - Date.now()) / 1000);
  if (s <= 0) return 'T−0';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return `T−${d ? d + 'd ' : ''}${p(h)}:${p(m)}:${p(sec)}`;
}

// LL2 gives a date precision for upcoming launches; only count down when it is a day or finer.
const COARSE = /^(MON|QTR|Q\d|H\d|YEAR|FY|WEEK|NEC|TBD)/i;
const isCoarse = (L) => (L.np ? COARSE.test(L.np) : /-12-3[01]T|T00:00:00Z$/.test(L.net) && Date.parse(L.net) - Date.now() > 45 * DAY);
function netLabel(L) {
  const d = new Date(L.net);
  if (/^(QTR|Q\d)/i.test(L.np || '')) return `NET Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
  if (/^(YEAR|FY|H\d)/i.test(L.np || '')) return `NET ${d.getUTCFullYear()}`;
  return `NET ${d.toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' })}`;
}

const KIND = {
  f9: { label: 'Falcon 9 booster', short: 'Falcon 9', group: 'falcon9' },
  'fh-side': { label: 'Falcon Heavy side booster', short: 'FH side', group: 'heavy' },
  'fh-core': { label: 'Falcon Heavy center core', short: 'FH core', group: 'heavy' },
  sh: { label: 'Super Heavy booster', short: 'Super Heavy', group: 'superheavy' },
  ship: { label: 'Starship upper stage', short: 'Starship', group: 'ship' },
  'dragon-crew': { label: 'Crew Dragon', short: 'Crew Dragon', group: 'dragon' },
  'dragon-cargo': { label: 'Cargo Dragon', short: 'Cargo Dragon', group: 'dragon' },
  other: { label: 'Spacecraft', short: 'Spacecraft', group: 'other' },
};
const GROUPS = [
  { id: 'falcon9', title: 'Falcon 9', blurb: 'Block 5 first stages' },
  { id: 'heavy', title: 'Falcon Heavy', blurb: 'Side boosters and center cores' },
  { id: 'superheavy', title: 'Super Heavy', blurb: 'Starship first stages' },
  { id: 'ship', title: 'Starship', blurb: 'Upper stages' },
  { id: 'dragon', title: 'Dragon', blurb: 'Crew and cargo capsules' },
];
const BUCKET = {
  active: 'Active', inspace: 'In space', building: 'In build', retired: 'Retired', expended: 'Expended', lost: 'Lost', unknown: 'Unknown',
};
const LIVE = new Set(['active', 'inspace', 'building']);

const pill = (bucket) => `<span class="pill st-${bucket}">${BUCKET[bucket] || esc(bucket)}</span>`;
const vName = (v) => {
  if (v.type !== 'craft' || !v.name) return '';
  const n = v.name.replace(/^(Crew |Cargo )?Dragon\s*/, '').trim();
  return n && n !== v.sn ? n : '';
};
const icon = (v, extra = {}) => vehicleIcon(v.kind, { flights: v.flights, bucket: v.bucket, label: `${v.sn} icon`, ...extra });

function tally(str, max = 80) {
  if (!str) return '<div class="tally tally-empty">No flights yet</div>';
  const s = str.length > max ? str.slice(-max) : str;
  const title = { L: 'Landed', X: 'Landing failed', E: 'Expended / no landing attempt', F: 'Launch failure', S: 'Flight', D: 'Vehicle lost' };
  return `<div class="tally" aria-label="${str.length} flights">${str.length > max ? `<span class="tally-more">+${str.length - max}</span>` : ''}${[...s].map((c) => `<i class="t-${c}" title="${title[c] || ''}"></i>`).join('')}</div>`;
}

// ---------------------------------------------------------------------------
// App state + routing
// ---------------------------------------------------------------------------
let core = null;
let ticker = null;

// Falcon / Starship switch, shared by Fleet, Next launch and Leaders (remembered per browser).
const PROGRAMS = [{ id: 'all', label: 'All' }, { id: 'falcon', label: 'Falcon' }, { id: 'starship', label: 'Starship' }];
const GROUP_PROGRAM = { falcon9: 'falcon', heavy: 'falcon', dragon: 'falcon', superheavy: 'starship', ship: 'starship' };
let program = (() => { try { return localStorage.getItem('fp.program') || 'all'; } catch { return 'all'; } })();
const launchProgram = (L) => ((L.fam || []).includes('Starship') || /starship/i.test(L.rk || '') ? 'starship' : 'falcon');
const inProgram = (p) => program === 'all' || p === program;
function progSwitch(options = PROGRAMS) {
  if (!options.some((o) => o.id === program)) program = options[0].id;
  return `<div class="seg" role="group" aria-label="Rocket family">${options.map((o) =>
    `<button type="button" data-prog="${o.id}" class="${program === o.id ? 'on' : ''}" aria-pressed="${program === o.id}">${o.label}</button>`).join('')}</div>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-prog]');
  if (!b || b.dataset.prog === program) return;
  program = b.dataset.prog;
  try { localStorage.setItem('fp.program', program); } catch { /* private mode */ }
  route();
});
const archiveState = { q: '', group: 'all', status: 'all', sort: 'flights', shown: 60 };

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [page, arg] = h.split('/');
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === (page === 'v' ? '' : page || 'fleet')));
  clearInterval(ticker);
  document.title = 'Flight Proven';
  const app = $('#app');
  if (!core) return;
  if (page === 'v' && arg) return detailView(app, decodeURIComponent(arg));
  if (page === 'archive') return archiveView(app, arg);
  if (page === 'orbit') return orbitView(app);
  if (page === 'leaders') return leadersView(app);
  if (page === 'launches') return launchesView(app);
  return fleetView(app);
}

// ---------------------------------------------------------------------------
// Fleet (active roster)
// ---------------------------------------------------------------------------
function fleetView(app) {
  const f = core.fleet;
  const year = new Date().getFullYear();
  const boosters = f.filter((v) => v.type === 'booster');
  const activeFalcon = boosters.filter((v) => /^f/.test(v.kind) && LIVE.has(v.bucket));
  const leader = [...boosters].sort((a, b) => b.flights - a.flights)[0];
  const thisYear = core.meta.stats?.byYear?.[year];
  const inSpace = f.filter((v) => v.inSpace).length;

  app.innerHTML = `
  <section class="intro">
    <h1>SpaceX fleet</h1>
    <p class="lede">Every active booster, ship and capsule. Select one to see each flight it has flown.</p>
  </section>
  <div class="viewbar">${progSwitch()}</div>
  <section class="kpis" aria-label="Fleet summary">
    <div class="kpi"><span class="kpi-v">${activeFalcon.length}</span><span class="kpi-l">Active Falcon boosters</span></div>
    <div class="kpi"><span class="kpi-v">${nf.format(core.meta.stats.launches)}</span><span class="kpi-l">SpaceX launches tracked${thisYear ? ` · ${thisYear} in ${year}` : ''}</span></div>
    <div class="kpi"><span class="kpi-v">${nf.format(core.meta.stats.landings)}</span><span class="kpi-l">Booster landings</span></div>
    ${leader ? `<a class="kpi kpi-link" href="#/v/${leader.key}"><span class="kpi-v">${esc(leader.sn)} <small>${leader.flights}×</small></span><span class="kpi-l">Fleet leader</span></a>` : ''}
    <a class="kpi kpi-link" href="#/orbit"><span class="kpi-v">${inSpace}</span><span class="kpi-l">Vehicles in space now</span></a>
  </section>
  ${GROUPS.filter((g) => inProgram(GROUP_PROGRAM[g.id])).map((g) => groupSection(g)).join('')}`;
}

function groupSection(g) {
  const all = core.fleet.filter((v) => KIND[v.kind]?.group === g.id);
  const live = all.filter((v) => LIVE.has(v.bucket)).sort((a, b) => b.flights - a.flights || (b.last || '').localeCompare(a.last || ''));
  if (!all.length) return '';
  return `<section class="group" id="g-${g.id}">
    <header class="group-h">
      <h2>${g.title}</h2>
      <span class="group-sub">${live.length} active · ${g.blurb}</span>
      <a class="group-link" href="#/archive/${g.id}">All ${all.length} in archive →</a>
    </header>
    ${live.length ? `<div class="cards">${live.map(card).join('')}</div>` : `<p class="empty">No active vehicles in this family right now. <a href="#/archive/${g.id}">Browse the archive</a>.</p>`}
  </section>`;
}

function card(v) {
  const nm = vName(v);
  const isCraft = v.type === 'craft';
  return `<a class="card" href="#/v/${v.key}">
    <div class="card-icon">${icon(v)}</div>
    <div class="card-body">
      <div class="card-top"><span class="sn">${esc(v.sn)}</span>${pill(v.bucket)}</div>
      <div class="card-kind">${nm ? `<b>${esc(nm)}</b> · ` : ''}${KIND[v.kind].label}</div>
      <div class="card-flights"><span class="big">${v.flights}</span> flight${v.flights === 1 ? '' : 's'}</div>
      ${tally(v.tally, 40)}
      <dl class="qs">
        ${isCraft ? `<div><dt>Time in space</dt><dd>${v.tis ? fmtDays(v.tis) : '—'}</dd></div>` : `<div><dt>Landings</dt><dd>${v.landAtt ? `${v.landOk}/${v.landAtt}` : '—'}</dd></div>`}
        <div><dt>Last flight</dt><dd>${v.last ? `${fmtDate(v.last, { month: 'short', day: 'numeric', year: '2-digit' })} <span class="muted">${rel(v.last)}</span>` : 'Not flown'}</dd></div>
        ${isCraft ? '' : `<div><dt>Fastest turn</dt><dd>${fmtDays(v.fastest)}</dd></div>`}
        ${v.next ? `<div class="qs-next"><dt>Next</dt><dd>${esc(v.next.name)} <span class="muted">${rel(v.next.net)}</span></dd></div>` : ''}
      </dl>
    </div>
  </a>`;
}

// ---------------------------------------------------------------------------
// Archive (every vehicle ever)
// ---------------------------------------------------------------------------
function archiveView(app, preset) {
  if (preset && GROUPS.some((g) => g.id === preset)) { archiveState.group = preset; archiveState.shown = 60; }
  const total = core.fleet.length;
  app.innerHTML = `
  <section class="intro">
    <h1>Archive</h1>
    <p class="lede">All ${nf.format(total)} boosters, ships and capsules, including retired, expended and lost vehicles.</p>
  </section>
  <form class="filters" id="filters" role="search" onsubmit="return false">
    <label class="search"><span class="sr">Search</span>
      <input id="q" type="search" placeholder="Search serial, name or mission" value="${esc(archiveState.q)}" autocomplete="off">
    </label>
    <div class="chips" role="group" aria-label="Vehicle family">
      ${[{ id: 'all', title: 'All' }, ...GROUPS].map((g) => `<button type="button" class="chip${archiveState.group === g.id ? ' on' : ''}" data-group="${g.id}" aria-pressed="${archiveState.group === g.id}">${g.title}</button>`).join('')}
    </div>
    <div class="selects">
      <label>Status
        <select id="status">${['all', 'active', 'inspace', 'retired', 'expended', 'lost', 'unknown'].map((s) => `<option value="${s}"${archiveState.status === s ? ' selected' : ''}>${s === 'all' ? 'Any status' : BUCKET[s]}</option>`).join('')}</select>
      </label>
      <label>Sort
        <select id="sort">
          ${[['flights', 'Most flights'], ['last', 'Most recent flight'], ['first', 'First flight'], ['sn', 'Serial number'], ['sats', 'Satellites carried']].map(([k, l]) => `<option value="${k}"${archiveState.sort === k ? ' selected' : ''}>${l}</option>`).join('')}
        </select>
      </label>
    </div>
  </form>
  <p class="count" id="count" aria-live="polite"></p>
  <div class="rows" id="rows" role="list"></div>
  <div class="more"><button type="button" class="btn" id="more">Show more</button></div>`;

  const draw = () => {
    const q = archiveState.q.trim().toLowerCase();
    let list = core.fleet.filter((v) =>
      (archiveState.group === 'all' || KIND[v.kind]?.group === archiveState.group) &&
      (archiveState.status === 'all' || v.bucket === archiveState.status) &&
      (!q || `${v.sn} ${v.name || ''} ${v.lastMission || ''} ${KIND[v.kind].label}`.toLowerCase().includes(q)));
    const sorters = {
      flights: (a, b) => b.flights - a.flights || (b.last || '').localeCompare(a.last || ''),
      last: (a, b) => (b.last || '').localeCompare(a.last || ''),
      first: (a, b) => (a.first || '9').localeCompare(b.first || '9'),
      sn: (a, b) => a.sn.localeCompare(b.sn, undefined, { numeric: true }),
      sats: (a, b) => b.sats - a.sats,
    };
    list.sort(sorters[archiveState.sort]);
    $('#count').textContent = `${nf.format(list.length)} vehicle${list.length === 1 ? '' : 's'}`;
    const shown = list.slice(0, archiveState.shown);
    $('#rows').innerHTML = shown.length ? `<div class="row row-h" aria-hidden="true"><span></span><span>Vehicle</span><span>Status</span><span class="num">Flights</span><span class="num">Landings</span><span>First flight</span><span>Last flight</span></div>` + shown.map(row).join('') : '<p class="empty">No vehicles match these filters.</p>';
    $('#more').parentElement.hidden = list.length <= archiveState.shown;
  };

  $('#q').addEventListener('input', (e) => { archiveState.q = e.target.value; archiveState.shown = 60; draw(); });
  $('#status').addEventListener('change', (e) => { archiveState.status = e.target.value; archiveState.shown = 60; draw(); });
  $('#sort').addEventListener('change', (e) => { archiveState.sort = e.target.value; draw(); });
  $('#filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-group]');
    if (!b) return;
    archiveState.group = b.dataset.group; archiveState.shown = 60;
    document.querySelectorAll('[data-group]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    draw();
  });
  $('#more').addEventListener('click', () => { archiveState.shown += 120; draw(); });
  draw();
}

function row(v) {
  const nm = vName(v);
  return `<a class="row" role="listitem" href="#/v/${v.key}">
    <span class="row-icon">${icon(v)}</span>
    <span class="row-name"><b class="sn">${esc(v.sn)}</b>${nm ? ` <span class="muted">${esc(nm)}</span>` : ''}<small>${KIND[v.kind].label}</small></span>
    <span class="row-st">${pill(v.bucket)}</span>
    <span class="num row-fl"><b>${v.flights}</b><small class="m-only"> flights</small></span>
    <span class="num row-land">${v.landAtt ? `${v.landOk}/${v.landAtt}` : '—'}</span>
    <span class="row-date">${v.first ? fmtDate(v.first) : '—'}</span>
    <span class="row-date">${v.last ? fmtDate(v.last) : '—'}<small class="m-only">${v.last ? ' · last flight' : ''}</small></span>
  </a>`;
}

// ---------------------------------------------------------------------------
// Vehicle detail
// ---------------------------------------------------------------------------
async function detailView(app, key) {
  const v = core.fleet.find((x) => x.key === key);
  if (!v) { app.innerHTML = `<p class="empty">That vehicle isn't in the data. <a href="#/archive">Back to the archive</a>.</p>`; return; }
  document.title = `${v.sn} · Flight Proven`;
  const nm = vName(v);
  app.innerHTML = `
  <nav class="crumbs"><a href="#/">Fleet</a> / <a href="#/archive/${KIND[v.kind].group}">${GROUPS.find((g) => g.id === KIND[v.kind].group)?.title || 'Archive'}</a> / <span>${esc(v.sn)}</span></nav>
  <section class="hero">
    <div class="hero-icon">${icon(v)}</div>
    <div class="hero-main">
      <p class="eyebrow">${KIND[v.kind].label}${v.cfg ? ` · ${esc(v.cfg)}` : ''}</p>
      <h1 class="hero-sn">${esc(v.sn)}${nm ? ` <span class="hero-name">${esc(nm)}</span>` : ''}</h1>
      <div class="hero-st">${pill(v.bucket)} ${v.inSpace ? '<a href="#/orbit">Track on orbit →</a>' : ''}</div>
      ${v.details ? `<p class="hero-details">${esc(v.details)}</p>` : ''}
      ${tally(v.tally, 200)}
      <p class="legend"><i class="t-L"></i>landed <i class="t-X"></i>landing failed <i class="t-E"></i>expended <i class="t-F"></i>launch failure ${v.type === 'craft' ? '<i class="t-S"></i>flight' : ''}</p>
    </div>
  </section>
  <section class="stats" id="stats">${statsGrid(v, null)}</section>
  <section class="charts" id="charts"></section>
  <section class="log">
    <header class="log-h"><h2>Flight log</h2><button type="button" class="btn btn-sm" id="order" aria-pressed="false">Newest first</button></header>
    <div id="flights"><div class="loading"><div class="loading-bar"></div></div></div>
  </section>`;
  window.scrollTo(0, 0);

  const launches = (await loadYears(v.years)).concat(core.extra || []);
  const seen = new Set();
  const mine = launches
    .filter((L) => (v.type === 'booster' ? L.stages.some((s) => s.lid === v.id) : L.craft.some((c) => c.cid === v.id)))
    .filter((L) => (seen.has(L.id) ? false : seen.add(L.id)))
    .sort((a, b) => a.net.localeCompare(b.net));
  if (location.hash !== `#/v/${key}`) return; // navigated away while loading

  const flights = mine.map((L, i) => {
    const st = v.type === 'booster' ? L.stages.find((s) => s.lid === v.id) : null;
    const cr = v.type === 'craft' ? L.craft.find((c) => c.cid === v.id) : null;
    const prev = mine[i - 1];
    return { L, st, cr, n: st?.n || i + 1, land: st?.land || cr?.land || null, turn: st?.ta ?? (prev ? (Date.parse(L.net) - Date.parse(prev.net)) / DAY : null) };
  });

  $('#stats').innerHTML = statsGrid(v, flights);
  $('#charts').innerHTML = chartsHtml(v, flights);
  let newestFirst = false;
  const drawLog = () => { $('#flights').innerHTML = flights.length ? (newestFirst ? [...flights].reverse() : flights).map((f) => flightRow(v, f)).join('') : '<p class="empty">No flights yet.</p>'; };
  $('#order').addEventListener('click', (e) => {
    newestFirst = !newestFirst;
    e.target.textContent = newestFirst ? 'Oldest first' : 'Newest first';
    e.target.setAttribute('aria-pressed', newestFirst);
    drawLog();
  });
  drawLog();
}

function statsGrid(v, flights) {
  const fl = flights || [];
  const satsFlights = fl.filter((f) => f.L.sats != null);
  const sats = flights ? satsFlights.reduce((a, f) => a + f.L.sats, 0) : v.sats;
  const starlink = fl.filter((f) => /starlink/i.test(f.L.name)).length;
  const pads = new Set(fl.map((f) => f.L.pad).filter(Boolean));
  const crew = fl.reduce((a, f) => a + (f.cr?.crew || 0), 0);
  const span = v.first && v.last ? (Date.parse(v.last) - Date.parse(v.first)) / DAY : null;
  const turns = fl.map((f) => f.turn).filter((x) => x != null && x > 0);
  const avg = turns.length ? turns.reduce((a, b) => a + b, 0) / turns.length : v.avgTurn;
  const items = [
    ['Flights', v.flights],
    v.type === 'booster' ? ['Landings', v.landAtt ? `${v.landOk}<small>/${v.landAtt}</small>` : '—'] : ['Time in space', v.tis ? fmtDays(v.tis) : '—'],
    ['Satellites carried', sats ? `${nf.format(sats)}${flights && satsFlights.length < fl.length ? '<small>+</small>' : ''}` : '—', flights ? `${satsFlights.length} of ${fl.length} flights have a published payload count` : ''],
    ['Fastest turnaround', fmtDays(v.fastest ?? (turns.length ? Math.min(...turns) : null))],
    ['Average turnaround', fmtDays(avg)],
    ['First flight', v.first ? fmtDate(v.first) : '—'],
    ['Last flight', v.last ? fmtDate(v.last) : '—', v.last ? rel(v.last) : ''],
    ['Career span', span != null ? (span > 365 ? `${(span / 365.25).toFixed(1)} yr` : fmtDays(span)) : '—'],
    flights && starlink ? ['Starlink missions', starlink] : null,
    flights && crew ? ['Crew carried', crew] : null,
    flights && pads.size ? ['Launch pads', pads.size, [...pads].join(', ')] : null,
    v.next ? ['Next mission', esc(v.next.name), `${fmtDate(v.next.net)} · ${rel(v.next.net)}`] : null,
  ].filter(Boolean);
  return items.map(([l, val, sub]) => `<div class="stat"><span class="stat-l">${l}</span><span class="stat-v">${val}</span>${sub ? `<span class="stat-s">${esc(sub)}</span>` : ''}</div>`).join('');
}

function niceTicks(max, n = 4) {
  if (!(max > 0)) return [0];
  const raw = max / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const ticks = [];
  for (let t = 0; t <= max + step * 0.001; t += step) ticks.push(+t.toFixed(6));
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

function chartsHtml(v, flights) {
  const out = [];
  const turns = flights.filter((f) => f.turn != null && f.turn > 0 && flights.indexOf(f) > 0);
  if (turns.length >= 2) {
    const ticks = niceTicks(Math.max(...turns.map((f) => f.turn)));
    const top = ticks[ticks.length - 1];
    const minT = Math.min(...turns.map((f) => f.turn));
    out.push(`<figure class="chart">
      <figcaption><h3>Turnaround between flights</h3><span class="muted">Days from previous launch · fastest highlighted</span></figcaption>
      <div class="bars" style="--n:${turns.length}">
        <div class="grid">${ticks.map((t) => `<span style="bottom:${(t / top) * 100}%"><em>${t}</em></span>`).join('')}</div>
        ${turns.map((f) => `<div class="bar${f.turn === minT ? ' best' : ''}" style="height:${(f.turn / top) * 100}%" title="Flight ${f.n}: ${fmtDays(f.turn)} — ${esc(missionTitle(f.L))}"></div>`).join('')}
      </div>
      <div class="bars-x"><span>Flight ${turns[0].n}</span><span>Flight ${turns[turns.length - 1].n}</span></div>
    </figure>`);
  }
  const sites = {};
  for (const f of flights) if (f.land && f.land.a) { const k = f.land.locn || f.land.loc || 'Unknown'; (sites[k] ||= { ok: 0, bad: 0, abbr: f.land.loc }); f.land.s === false ? sites[k].bad++ : sites[k].ok++; }
  const siteList = Object.entries(sites).sort((a, b) => b[1].ok + b[1].bad - (a[1].ok + a[1].bad));
  if (siteList.length) {
    const max = Math.max(...siteList.map(([, s]) => s.ok + s.bad));
    out.push(`<figure class="chart">
      <figcaption><h3>${v.type === 'booster' ? 'Landing sites' : 'Recovery zones'}</h3><span class="muted">Successful and failed recoveries</span></figcaption>
      <div class="hbars">${siteList.map(([name, s]) => `<div class="hbar"><span class="hbar-l" title="${esc(name)}">${esc(s.abbr && s.abbr !== name ? `${s.abbr}` : name)}<small>${esc(s.abbr && s.abbr !== name ? name : '')}</small></span>
        <span class="hbar-t"><i class="ok" style="width:${(s.ok / max) * 100}%"></i>${s.bad ? `<i class="bad" style="width:${(s.bad / max) * 100}%"></i>` : ''}</span><span class="hbar-v">${s.ok}${s.bad ? `<small> +${s.bad} failed</small>` : ''}</span></div>`).join('')}</div>
    </figure>`);
  }
  const orbits = {};
  for (const f of flights) { const k = f.L.orbn || f.L.orb || 'Unknown'; orbits[k] = (orbits[k] || 0) + 1; }
  const orbitList = Object.entries(orbits).sort((a, b) => b[1] - a[1]);
  if (orbitList.length > 1) {
    const max = orbitList[0][1];
    out.push(`<figure class="chart">
      <figcaption><h3>Destinations</h3><span class="muted">Target orbit per flight</span></figcaption>
      <div class="hbars">${orbitList.map(([k, n]) => `<div class="hbar"><span class="hbar-l">${esc(k)}</span><span class="hbar-t"><i class="ok acc" style="width:${(n / max) * 100}%"></i></span><span class="hbar-v">${n}</span></div>`).join('')}</div>
    </figure>`);
  }
  return out.join('');
}

function landingText(land, v) {
  if (!land) return '<span class="muted">—</span>';
  if (!land.a) return `<span class="lt lt-E">${v.type === 'booster' ? 'Expended' : 'No recovery'}</span>`;
  if (land.s === false) return `<span class="lt lt-X">Failed${land.loc ? ` · ${esc(land.loc)}` : ''}</span>`;
  if (land.s == null) return `<span class="lt">Pending${land.loc ? ` · ${esc(land.loc)}` : ''}</span>`;
  return `<span class="lt lt-L">${esc(land.loc || 'Landed')}${land.ty ? ` <small>${esc(land.ty)}</small>` : ''}</span>`;
}

function flightRow(v, f) {
  const L = f.L;
  const fail = isFailure(L);
  const dock = f.cr?.dock?.filter((d) => d.at) || [];
  return `<details class="flight${fail ? ' is-fail' : ''}">
    <summary>
      <span class="f-n">${f.n}</span>
      <span class="f-date">${fmtDate(L.net)}</span>
      <span class="f-msn"><b>${esc(missionTitle(L))}</b><small>${esc(L.rk || '')}${f.st?.t && /strap/i.test(f.st.t) ? ' · side booster' : f.st?.t && L.stages.length > 1 ? ' · center core' : ''}${fail ? ' · <em>launch failure</em>' : ''}</small></span>
      <span class="f-orb">${esc(L.orb || '—')}</span>
      <span class="f-land">${landingText(f.land, v)}</span>
      <span class="f-turn">${f.turn != null && f.n > 1 ? fmtDays(f.turn) : '—'}</span>
      <span class="f-sats">${L.sats != null ? `${L.sats} sats` : ''}</span>
    </summary>
    <div class="f-notes">
      <dl class="f-meta">
        <div><dt>Launch</dt><dd>${fmtDateTime(L.net)}</dd></div>
        <div><dt>Pad</dt><dd>${esc(L.pad || '—')}${L.loc ? `<small>${esc(L.loc)}</small>` : ''}</dd></div>
        <div><dt>Orbit</dt><dd>${esc(L.orbn || L.orb || '—')}</dd></div>
        <div><dt>Mission type</dt><dd>${esc(L.mt || '—')}</dd></div>
        ${L.sats != null ? `<div><dt>Satellites</dt><dd>${L.sats}${L.satsSrc === 'text' ? ' <small>from mission description</small>' : ''}</dd></div>` : ''}
        ${f.cr?.crew ? `<div><dt>Crew</dt><dd>${f.cr.crew}</dd></div>` : ''}
        ${L.stages.length > 1 || v.type === 'craft' ? `<div><dt>Boosters</dt><dd>${L.stages.map((s) => (s.lid === v.id ? `<b>${esc(s.sn)}</b>` : `<a href="#/v/b${s.lid}">${esc(s.sn)}</a>`)).join(', ') || '—'}</dd></div>` : ''}
        ${v.type === 'booster' && L.craft.length ? `<div><dt>Spacecraft</dt><dd>${L.craft.map((c) => `<a href="#/v/c${c.cid}">${esc(c.name || c.sn)}</a>`).join(', ')}</dd></div>` : ''}
      </dl>
      ${L.desc ? `<p>${esc(L.desc)}</p>` : ''}
      ${fail && L.fail ? `<p class="f-fail"><b>Failure:</b> ${esc(L.fail)}</p>` : ''}
      ${f.land?.d ? `<p><b>Recovery:</b> ${esc(f.land.d)}</p>` : ''}
      ${dock.length ? `<p><b>Docking:</b> ${dock.map((d) => `${esc(d.loc || 'Station')} ${fmtDate(d.at)} → ${d.dep ? fmtDate(d.dep) : 'still docked'}`).join('; ')}</p>` : ''}
      ${L.vid ? `<p><a href="${esc(L.vid)}" target="_blank" rel="noopener">Watch the webcast ↗</a></p>` : ''}
    </div>
  </details>`;
}

// ---------------------------------------------------------------------------
// Leaderboards
// ---------------------------------------------------------------------------
const leaderState = { scope: 'active' };

function leadersView(app) {
  const scope = leaderState.scope;
  const inScope = (v) => scope === 'all' || LIVE.has(v.bucket);
  const falcon = core.fleet.filter((v) => v.type === 'booster' && v.kind !== 'sh' && inScope(v));
  const sh = core.fleet.filter((v) => v.kind === 'sh' && inScope(v));
  const ships = core.fleet.filter((v) => v.kind === 'ship' && inScope(v));
  const dragons = core.fleet.filter((v) => KIND[v.kind]?.group === 'dragon' && inScope(v));
  const now = Date.now();
  const age = (v) => (now - Date.parse(v.first)) / (365.25 * DAY);

  const boards = [
    {
      id: 'reflights', prog: 'falcon', title: 'Most reflights', sub: 'Falcon boosters by number of flights',
      rows: falcon.filter((v) => v.flights > 0).sort((a, b) => b.flights - a.flights || (a.first || '').localeCompare(b.first || '')),
      value: (v) => v.flights, fmt: (v) => `${v.flights}<small> flights</small>`,
      note: (v) => `${v.flights - 1} reflight${v.flights === 2 ? '' : 's'} · last ${rel(v.last)}`,
    },
    {
      id: 'oldest', prog: 'falcon', title: 'Oldest boosters', sub: scope === 'active' ? 'Active Falcon boosters by first flight date' : 'Falcon boosters by first flight date',
      rows: falcon.filter((v) => v.first).sort((a, b) => a.first.localeCompare(b.first)),
      value: (v) => age(v), fmt: (v) => `${age(v).toFixed(1)}<small> yr</small>`,
      note: (v) => `First flew ${fmtDate(v.first)} · ${v.flights} flights`,
    },
    {
      id: 'turnaround', prog: 'falcon', title: 'Fastest turnaround', sub: 'Shortest time between two flights of the same booster',
      rows: falcon.filter((v) => v.fastest > 0).sort((a, b) => a.fastest - b.fastest),
      value: (v) => v.fastest, invert: true, fmt: (v) => fmtDays(v.fastest),
      note: (v) => `Average ${fmtDays(v.avgTurn)} over ${v.flights} flights`,
    },
    {
      id: 'sats', prog: 'falcon', title: 'Most satellites carried', sub: 'Payload counts from published manifests',
      rows: falcon.filter((v) => v.sats > 0).sort((a, b) => b.sats - a.sats),
      value: (v) => v.sats, fmt: (v) => `${nf.format(v.sats)}`,
      note: (v) => `${v.satsKnown} of ${v.flights} flights counted`,
    },
    {
      id: 'superheavy', prog: 'starship', title: 'Super Heavy flights', sub: 'Starship boosters by number of flights',
      rows: sh.filter((v) => v.flights > 0).sort((a, b) => b.flights - a.flights || (a.first || '').localeCompare(b.first || '')),
      value: (v) => v.flights, fmt: (v) => `${v.flights}<small> flight${v.flights === 1 ? '' : 's'}</small>`,
      note: (v) => `${v.landOk}/${v.landAtt} recoveries · last ${rel(v.last)}`,
    },
    {
      id: 'shrecover', prog: 'starship', title: 'Super Heavy recoveries', sub: 'Successful tower catches and soft splashdowns',
      rows: sh.filter((v) => v.landOk > 0).sort((a, b) => b.landOk - a.landOk || (a.first || '').localeCompare(b.first || '')),
      value: (v) => v.landOk, fmt: (v) => `${v.landOk}<small>/${v.landAtt}</small>`,
      note: (v) => `${v.flights} flight${v.flights === 1 ? '' : 's'} · last ${rel(v.last)}`,
    },
    {
      id: 'ships', prog: 'starship', title: 'Starship flights', sub: 'Upper stages and prototypes by number of flights',
      rows: ships.filter((v) => v.flights > 0).sort((a, b) => b.flights - a.flights || (b.last || '').localeCompare(a.last || '')),
      value: (v) => v.flights, fmt: (v) => `${v.flights}<small> flight${v.flights === 1 ? '' : 's'}</small>`,
      note: (v) => `${v.type === 'booster' ? 'Prototype hop' : 'Ship'} · last flew ${fmtDate(v.last)}`,
    },
    {
      id: 'dragon', prog: 'falcon', title: 'Dragon time in space', sub: 'Capsules by total days in space',
      rows: dragons.filter((v) => v.tis > 0 || v.flights > 0).sort((a, b) => (b.tis || 0) - (a.tis || 0) || b.flights - a.flights),
      value: (v) => v.tis || 0, fmt: (v) => (v.tis ? `${nf.format(Math.round(v.tis))}<small> d</small>` : '—'),
      note: (v) => `${v.flights} flight${v.flights === 1 ? '' : 's'}${vName(v) ? ` · ${esc(vName(v))}` : ''}`,
    },
  ];

  const shown = boards.filter((b) => inProgram(b.prog));
  app.innerHTML = `
  <section class="intro">
    <h1>Leaderboards</h1>
    <p class="lede">Record holders across the fleet. Select a vehicle to see every flight behind the number.</p>
  </section>
  <div class="viewbar">${progSwitch()}
  <div class="chips scope" role="group" aria-label="Which vehicles to rank">
    <button type="button" class="chip${scope === 'active' ? ' on' : ''}" data-scope="active" aria-pressed="${scope === 'active'}">Active fleet</button>
    <button type="button" class="chip${scope === 'all' ? ' on' : ''}" data-scope="all" aria-pressed="${scope === 'all'}">All time</button>
  </div></div>
  <nav class="board-jump" aria-label="Jump to leaderboard">${shown.filter((b) => b.rows.length).map((b) => `<a href="#/leaders" data-jump="${b.id}">${b.title}</a>`).join('')}</nav>
  <div class="boards">${shown.map(boardHtml).join('')}</div>`;

  app.querySelector('.scope').addEventListener('click', (e) => {
    const b = e.target.closest('[data-scope]');
    if (!b || b.dataset.scope === leaderState.scope) return;
    leaderState.scope = b.dataset.scope;
    leadersView(app);
  });
  app.querySelector('.board-jump').addEventListener('click', (e) => {
    const a = e.target.closest('[data-jump]');
    if (!a) return;
    e.preventDefault();
    document.getElementById(`lb-${a.dataset.jump}`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  });
}

function boardHtml(b) {
  if (!b.rows.length) return '';
  const top = b.rows.slice(0, 10);
  const vals = top.map(b.value);
  const max = Math.max(...vals), min = Math.min(...vals);
  return `<section class="board" id="lb-${b.id}">
    <header><h2>${b.title}</h2><span class="muted">${b.sub}</span></header>
    <ol class="lb">${top.map((v, i) => {
      const val = b.value(v);
      const pct = b.invert ? (val > 0 ? (min / val) * 100 : 0) : max > 0 ? (val / max) * 100 : 0;
      return `<li><a class="lb-row${i === 0 ? ' lb-first' : ''}" href="#/v/${v.key}">
        <span class="lb-rank">${i + 1}</span>
        <span class="lb-icon">${icon(v)}</span>
        <span class="lb-name"><b class="sn">${esc(v.sn)}</b>${v.bucket !== 'active' ? ` ${pill(v.bucket)}` : ''}<small>${b.note(v)}</small></span>
        <span class="lb-val">${b.fmt(v)}</span>
        <span class="lb-bar"><i style="width:${Math.max(2, pct).toFixed(1)}%"></i></span>
      </a></li>`;
    }).join('')}</ol>
    ${b.rows.length > 10 ? `<p class="lb-more muted">${b.rows.length - 10} more not shown</p>` : ''}
  </section>`;
}

// ---------------------------------------------------------------------------
// Next launch: the next flight, the rest of the manifest, then launch history
// ---------------------------------------------------------------------------
const launchState = { yearsShown: 2, prevShown: 40 };

async function launchesView(app) {
  const now = Date.now();
  const fleetByKey = new Map(core.fleet.map((v) => [v.key, v]));
  // Anything more than 3 h past its NET has flown (or slipped) and waits for the next data build.
  const upcoming = (core.upcoming || []).filter((L) => Date.parse(L.net) > now - 3 * 3600e3 && inProgram(launchProgram(L)))
    .sort((a, b) => a.net.localeCompare(b.net));
  const next = upcoming[0];
  const rest = upcoming.slice(1);

  app.innerHTML = `
  <section class="intro"><h1>Next launch</h1>
    <p class="lede">The next SpaceX flight, the rest of the manifest, then every launch before it.</p></section>
  <div class="viewbar">${progSwitch()}</div>
  ${next ? nextHero(next, fleetByKey) : `<p class="empty">No upcoming ${program === 'all' ? '' : PROGRAMS.find((p) => p.id === program).label + ' '}launches are scheduled in the data yet.</p>`}
  ${rest.length ? `<section class="group"><header class="group-h"><h2>Then</h2><span class="group-sub">${rest.length} more scheduled · dates move often</span></header>
    <div class="llist" id="then">${rest.map((L, i) => launchRow(L, true, fleetByKey, i >= 10)).join('')}</div>
    ${rest.length > 10 ? `<div class="more"><button type="button" class="btn" id="thenMore">Show all ${rest.length} scheduled</button></div>` : ''}</section>` : ''}
  <section class="group"><header class="group-h"><h2>Previous launches</h2><span class="group-sub" id="prevCount">Loading…</span></header>
    <div class="llist" id="prev"><div class="loading"><div class="loading-bar"></div></div></div>
    <div class="more" id="prevMoreWrap" hidden><button type="button" class="btn" id="prevMore">Show older launches</button></div>
  </section>`;

  $('#thenMore')?.addEventListener('click', (e) => { document.querySelectorAll('#then .lrow[hidden]').forEach((r) => (r.hidden = false)); e.target.parentElement.remove(); });
  const tick = () => document.querySelectorAll('[data-t]').forEach((el) => (el.textContent = countdown(el.dataset.t)));
  tick();
  ticker = setInterval(tick, 1000);

  const years = [...core.meta.years].sort().reverse();
  const drawPrev = async () => {
    const want = years.slice(0, launchState.yearsShown);
    const ls = (await loadYears(want)).concat(core.extra || []);
    if (location.hash !== '#/launches') return;
    const seen = new Set();
    const list = ls.filter((L) => (seen.has(L.id) ? false : seen.add(L.id)) && inProgram(launchProgram(L)))
      .sort((a, b) => b.net.localeCompare(a.net));
    // Make sure there are enough rows to fill the page before asking for more years.
    if (list.length < launchState.prevShown && launchState.yearsShown < years.length) { launchState.yearsShown++; return drawPrev(); }
    const shownList = list.slice(0, launchState.prevShown);
    $('#prev').innerHTML = shownList.length ? shownList.map((L) => launchRow(L, false, fleetByKey)).join('') : '<p class="empty">No launches yet.</p>';
    const oldest = shownList[shownList.length - 1];
    $('#prevCount').textContent = `${nf.format(shownList.length)} most recent${oldest ? ` · back to ${fmtDate(oldest.net)}` : ''}`;
    $('#prevMoreWrap').hidden = list.length <= launchState.prevShown && launchState.yearsShown >= years.length;
  };
  $('#prevMore').addEventListener('click', () => { launchState.prevShown += 60; launchState.yearsShown++; drawPrev(); });
  drawPrev();
}

function boosterChip(s, upcoming, fleetByKey) {
  if (!s.lid) return '<span class="bchip bchip-tbd">Booster TBD</span>';
  const v = fleetByKey.get(`b${s.lid}`);
  const n = s.n || (upcoming && v ? v.flights + 1 : null);
  const land = s.land;
  const res = upcoming ? '' : !land ? '' : !land.a ? ' <i class="r-E">exp</i>' : land.s === false ? ' <i class="r-X">✕</i>' : land.s ? ' <i class="r-L">✓</i>' : '';
  return `<a href="#/v/b${s.lid}" class="bchip">${esc(s.sn)}${n ? `<small>·${n}</small>` : ''}${res}</a>`;
}
const craftChip = (c) => (c.cid ? `<a href="#/v/c${c.cid}" class="bchip bchip-c">${esc((c.name || c.sn || '').replace(/^(Crew |Cargo )?Dragon\s*/, '') || c.sn)}</a>` : '');

function launchStatus(L) {
  if (/fail/i.test(L.st || '')) return '<span class="pill st-lost">Failure</span>';
  if (/partial/i.test(L.st || L.stn || '')) return '<span class="pill st-building">Partial</span>';
  if (/success/i.test(L.st || L.stn || '')) return '<span class="pill st-active">Success</span>';
  return `<span class="pill st-unknown">${esc(L.st || 'TBD')}</span>`;
}

function nextHero(L, fleetByKey) {
  const boosters = L.stages.map((s) => {
    const v = s.lid ? fleetByKey.get(`b${s.lid}`) : null;
    const plan = s.land ? (s.land.a ? `landing on ${esc(s.land.locn || s.land.loc || 'TBD')}` : 'expendable') : '';
    return `<div class="nh-veh">${v ? `<span class="nh-icon">${icon(v)}</span>` : ''}<div><span class="nh-l">${/strap/i.test(s.t || '') ? 'Side booster' : L.stages.length > 1 ? 'Center core' : 'Booster'}</span>
      ${s.lid ? `<a href="#/v/b${s.lid}" class="nh-sn">${esc(s.sn)}</a>` : '<span class="nh-sn muted">TBD</span>'}
      <span class="nh-s">${v ? `Flight ${v.flights + 1}${v.last ? ` · last flew ${rel(v.last)}` : ''}` : ''}${plan ? `${v ? ' · ' : ''}${plan}` : ''}</span></div></div>`;
  }).join('');
  const crafts = L.craft.filter((c) => c.cid).map((c) => {
    const v = fleetByKey.get(`c${c.cid}`);
    return `<div class="nh-veh">${v ? `<span class="nh-icon">${icon(v)}</span>` : ''}<div><span class="nh-l">Spacecraft</span><a href="#/v/c${c.cid}" class="nh-sn">${esc(c.name || c.sn)}</a>
      <span class="nh-s">${v && v.flights ? `Flight ${v.flights + 1}` : 'First flight'}${c.dest ? ` · to ${esc(c.dest)}` : ''}</span></div></div>`;
  }).join('');
  return `<section class="nexthero">
    <div class="nh-main">
      <p class="eyebrow">${esc(L.rk || '')}${L.pad ? ` · ${esc(L.pad)}` : ''}</p>
      <h2 class="nh-title">${esc(missionTitle(L))}</h2>
      ${isCoarse(L) ? `<div class="nh-count">${netLabel(L)}</div>` : `<div class="nh-count" data-t="${esc(L.net)}">${countdown(L.net)}</div>`}
      <p class="nh-when">${fmtDateTime(L.net)} <span class="muted">your time · ${esc(L.st || '')}</span></p>
      <dl class="f-meta">
        <div><dt>Orbit</dt><dd>${esc(L.orbn || L.orb || '—')}</dd></div>
        <div><dt>Launch site</dt><dd>${esc(L.loc || '—')}</dd></div>
        ${L.mt ? `<div><dt>Mission type</dt><dd>${esc(L.mt)}</dd></div>` : ''}
        ${L.sats != null ? `<div><dt>Satellites</dt><dd>${L.sats}</dd></div>` : ''}
      </dl>
      ${L.desc ? `<p class="nh-desc">${esc(L.desc)}</p>` : ''}
      ${L.vid ? `<p><a href="${esc(L.vid)}" target="_blank" rel="noopener">Webcast ↗</a></p>` : ''}
    </div>
    <div class="nh-side">${boosters || '<p class="muted">Booster not assigned yet.</p>'}${crafts}</div>
  </section>`;
}

function launchRow(L, upcoming, fleetByKey, hide = false) {
  const fail = !upcoming && /fail/i.test(L.st || '');
  const chips = (L.stages.length ? L.stages.map((s) => boosterChip(s, upcoming, fleetByKey)).join('') : '<span class="bchip bchip-tbd">Booster TBD</span>') + L.craft.map(craftChip).join('');
  return `<details class="lrow${fail ? ' is-fail' : ''}"${hide ? ' hidden' : ''}>
    <summary>
      <span class="m-when">${upcoming ? (isCoarse(L) ? `<b>${netLabel(L)}</b><small>Date not set yet</small>` : `<b data-t="${esc(L.net)}">${countdown(L.net)}</b><small>${fmtDateTime(L.net)}</small>`) : `<b>${fmtDate(L.net, { month: 'short', day: 'numeric', year: 'numeric' })}</b><small>${rel(L.net)}</small>`}</span>
      <span class="m-name"><b>${esc(missionTitle(L))}</b><small>${esc(L.rk || '')}${L.orb ? ` · ${esc(L.orbn || L.orb)}` : ''}${L.sats ? ` · ${L.sats} satellites` : ''}</small></span>
      <span class="m-veh">${chips}${upcoming ? '' : launchStatus(L)}</span>
    </summary>
    <div class="f-notes">
      <dl class="f-meta">
        <div><dt>${upcoming ? 'Target (NET)' : 'Launched'}</dt><dd>${fmtDateTime(L.net)}</dd></div>
        <div><dt>Pad</dt><dd>${esc(L.pad || '—')}${L.loc ? `<small>${esc(L.loc)}</small>` : ''}</dd></div>
        <div><dt>Orbit</dt><dd>${esc(L.orbn || L.orb || '—')}</dd></div>
        ${L.mt ? `<div><dt>Mission type</dt><dd>${esc(L.mt)}</dd></div>` : ''}
      </dl>
      ${L.desc ? `<p>${esc(L.desc)}</p>` : ''}
      ${!upcoming && L.fail ? `<p class="f-fail"><b>Failure:</b> ${esc(L.fail)}</p>` : ''}
      ${L.stages.filter((s) => s.land && s.land.d).map((s) => `<p><b>${esc(s.sn || 'Booster')}:</b> ${esc(s.land.d)}</p>`).join('')}
      ${L.vid ? `<p><a href="${esc(L.vid)}" target="_blank" rel="noopener">Webcast ↗</a></p>` : ''}
    </div>
  </details>`;
}

// ---------------------------------------------------------------------------
// On orbit
// ---------------------------------------------------------------------------
function orbitView(app) {
  const o = core.orbit;
  const fleetByKey = new Map(core.fleet.map((v) => [v.key, v]));
  const craft = o.craft.map((c) => ({ ...c, v: fleetByKey.get(c.key) }));
  app.innerHTML = `
  <section class="intro orbit-intro">
    <div>
      <h1>On orbit</h1>
      <p class="lede">SpaceX-launched vehicles in space right now, with live mission clocks. Launch schedules are on the <a href="#/launches">Next launch</a> tab.</p>
    </div>
    ${orbitGraphic(craft)}
  </section>
  <section class="group">
    <header class="group-h"><h2>In space now</h2><span class="group-sub">${craft.length} vehicle${craft.length === 1 ? '' : 's'} · mission clocks run live</span></header>
    ${craft.length ? `<div class="ocards">${craft.map(orbitCard).join('')}</div>` : '<p class="empty">No SpaceX-launched crew vehicles, Dragons or Starships are in space right now.</p>'}
  </section>
`;

  const tick = () => {
    document.querySelectorAll('[data-met]').forEach((el) => (el.textContent = met(el.dataset.met)));
    document.querySelectorAll('[data-t]').forEach((el) => (el.textContent = countdown(el.dataset.t)));
  };
  tick();
  ticker = setInterval(tick, 1000);
}

function orbitCard(c) {
  const v = c.v || { kind: c.kind, flights: c.flights || 1, bucket: 'inspace', sn: c.sn || c.name };
  const docked = (c.dock || []).filter((d) => d.at && !d.dep).pop();
  const helio = /roadster/i.test(c.name || '');
  const where = helio ? 'Heliocentric orbit' : docked ? `Docked · ${esc(docked.loc || 'station')}` : c.dest ? `Free flying · ${esc(c.dest)}` : 'Free flying';
  return `<a class="ocard" href="${c.v ? `#/v/${c.key}` : '#/orbit'}">
    <div class="card-icon">${vehicleIcon(c.kind, { flights: v.flights, bucket: 'inspace', label: `${c.name} icon` })}</div>
    <div class="card-body">
      <div class="card-top"><span class="sn">${esc(c.name || c.sn)}</span>${pill('inspace')}</div>
      <div class="card-kind">${esc(c.launch.title)} · ${esc(c.launch.rk || '')}</div>
      <div class="met"><span class="met-l">Mission elapsed</span><span class="met-v" data-met="${esc(c.launch.net)}">${met(c.launch.net)}</span></div>
      <dl class="qs">
        <div><dt>Where</dt><dd>${where}</dd></div>
        ${docked ? `<div><dt>Docked since</dt><dd>${fmtDate(docked.at)}</dd></div>` : ''}
        <div><dt>Launched</dt><dd>${fmtDate(c.launch.net)}${c.launch.pad ? ` <span class="muted">${esc(c.launch.pad)}</span>` : ''}</dd></div>
        ${c.crew ? `<div><dt>Crew</dt><dd>${c.crew}</dd></div>` : ''}
        ${c.flights ? `<div><dt>Vehicle flight</dt><dd>#${c.flights}</dd></div>` : ''}
      </dl>
    </div>
  </a>`;
}

function orbitGraphic(craft) {
  const n = Math.max(craft.length, 1);
  const dots = craft.filter((c) => !/roadster/i.test(c.name || '')).map((c, i) => {
    const r = 46 + (i % 3) * 9, dur = 9 + i * 2.3;
    return `<g class="odot" style="--dur:${dur}s;--start:${-(i / n) * dur}s"><circle cx="${80 + r}" cy="80" r="3.2" class="o-${c.kind}"/></g>`;
  }).join('');
  return `<svg class="orbit-svg" viewBox="0 0 160 160" aria-hidden="true">
    <circle cx="80" cy="80" r="36" class="o-earth"/>
    <path d="M52 66 q12 -10 22 -4 t18 2 M48 88 q16 6 28 0 t26 4" class="o-land"/>
    <circle cx="80" cy="80" r="46" class="o-ring"/><circle cx="80" cy="80" r="55" class="o-ring"/><circle cx="80" cy="80" r="64" class="o-ring"/>
    ${dots}
  </svg>`;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function setBanner(html) {
  const b = $('#banner');
  b.innerHTML = html ? `<div class="wrap">${html}</div>` : '';
  b.hidden = !html;
}

function freshness() {
  const m = core.meta;
  $('#freshness').textContent = `Data updated ${rel(m.generatedAt)} (${fmtDateTime(m.generatedAt)}).`;
}

function themeInit() {
  $('#themeBtn').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('fp.theme', next); } catch { /* private mode */ }
  });
}

async function boot() {
  themeInit();
  try {
    core = await loadCore((msg) => { const el = $('#loadingMsg'); if (el) el.textContent = msg; });
  } catch (e) {
    $('#app').innerHTML = `<div class="empty"><p><b>Couldn't load fleet data.</b> ${esc(e.message)}</p><p>Check your connection and reload. If you're running locally, start a web server in the project folder (see README).</p></div>`;
    return;
  }
  // Stats by year for the KPI row
  core.meta.stats.byYear = {};
  for (const y of core.meta.years) core.meta.stats.byYear[y] = null;
  const thisYear = String(new Date().getFullYear());
  if (core.meta.years.includes(thisYear)) {
    loadYears([thisYear]).then((ls) => { core.meta.stats.byYear[thisYear] = ls.length; if (/^#?\/?$/.test(location.hash)) route(); });
  }
  const notes = [];
  if (core.meta.backfill) notes.push(`Launch history is still downloading (${core.meta.backfill.done} of ${core.meta.backfill.total} launches so far). Older flights will appear after the next scheduled update.`);
  if (core.meta.note) notes.push(`Showing partial data: ${esc(core.meta.note)}.`);
  setBanner(notes.join(' '));
  freshness();
  window.addEventListener('hashchange', route);
  route();

  const fresh = await topUp(core);
  if (fresh.length) {
    notes.push(`<b>${fresh.length} new launch${fresh.length === 1 ? '' : 'es'}</b> since the last data build: ${fresh.slice(0, 3).map((L) => esc(missionTitle(L))).join(', ')}${fresh.length > 3 ? '…' : ''}. Included below.`);
    setBanner(notes.join(' '));
    route();
  }
}

boot();
