// Incremental sync of SpaceX data from Launch Library 2 into compact state.
// Used by scripts/build-data.mjs (GitHub Action) and by the browser as a fallback.

import { SPACEX_LSP_ID, ThrottledError } from './ll2.js';
import { normLaunch, normLauncher, normSpacecraft, deriveFleet, classifyCraft, missionTitle } from './normalize.js';

export function emptyState() {
  return {
    launches: new Map(), // id -> compact launch
    launchers: [],
    spacecraft: [], // fresh in-space list from last sync
    upcoming: [],
    sync: { fullDone: false, offset: 0, total: null, lastRun: null, lastComplete: null },
  };
}

/**
 * Pull whatever has changed since the previous run. Steps are ordered by importance so a
 * rate-limit stop still leaves a useful result; progress is checkpointed after every page.
 * @returns {{state, complete:boolean, stoppedBy?:string, calls:number}}
 */
export async function sync(api, state, { now = new Date(), recentDays = 45, checkpoint = async () => {}, log = () => {} } = {}) {
  const st = state;
  const since = new Date(now.getTime() - recentDays * 864e5).toISOString();
  let stoppedBy = null;

  const step = async (name, fn) => {
    if (stoppedBy) return;
    try {
      await fn();
    } catch (e) {
      if (e instanceof ThrottledError) { stoppedBy = `rate limit during ${name} (retry in ${Math.ceil(e.waitSec / 60)} min)`; log(stoppedBy); }
      else { stoppedBy = `${name}: ${e.message}`; log(stoppedBy); }
    }
  };

  // 1. Launch history — full backfill once, then a rolling window that also catches corrections.
  await step('history', async () => {
    if (!st.sync.fullDone) {
      await api.getAll('/launches/previous/', { lsp__id: SPACEX_LSP_ID, mode: 'detailed', ordering: 'net', limit: 100, offset: st.sync.offset || 0 },
        async (results, offset, count) => {
          for (const L of results) st.launches.set(L.id, normLaunch(L));
          st.sync.offset = offset; st.sync.total = count;
          log(`history ${offset}/${count}`);
          await checkpoint(st);
        });
      st.sync.fullDone = true;
    } else {
      const res = await api.getAll('/launches/previous/', { lsp__id: SPACEX_LSP_ID, mode: 'detailed', ordering: 'net', limit: 100, net__gte: since });
      for (const L of res) st.launches.set(L.id, normLaunch(L));
    }
    await checkpoint(st);
  });

  // 2. Upcoming manifest (booster / ship assignments)
  await step('upcoming', async () => {
    const page = await api.get('/launches/upcoming/', { lsp__id: SPACEX_LSP_ID, mode: 'detailed', limit: 40, ordering: 'net' });
    st.upcoming = page.results.map(normLaunch);
  });

  // 3. Everything currently in space; keep SpaceX-launched vehicles.
  let inSpaceFresh = null;
  await step('in-space', async () => {
    const page = await api.get('/spacecraft/', { in_space: 'true', limit: 100, mode: 'normal' });
    inSpaceFresh = page.results.map(normSpacecraft);
  });

  // 4. Refresh the launch record for in-space SpaceX craft launched before the rolling window
  //    (docking status lives on the launch's spacecraft flight).
  if (inSpaceFresh) {
    const lastLaunchOf = lastLaunchByCraft(st.launches);
    st.spacecraft = inSpaceFresh.filter((c) => classifyCraft(c) || lastLaunchOf.has(c.id));
    const stale = st.spacecraft
      .map((c) => lastLaunchOf.get(c.id))
      .filter((L) => L && L.net < since)
      .slice(0, 3);
    for (const L of stale) {
      await step('refresh', async () => {
        const full = await api.get(`/launches/${L.id}/`, { mode: 'detailed' });
        st.launches.set(full.id, normLaunch(full));
      });
    }
  }

  // 5. Booster roster (statuses change when SpaceX retires / expends / loses a core)
  await step('launchers', async () => {
    const list = await api.getAll('/launchers/', { launcher_config__manufacturer__name: 'SpaceX', mode: 'normal', limit: 100 });
    st.launchers = list.map(normLauncher);
  });

  st.sync.lastRun = now.toISOString();
  if (!stoppedBy) st.sync.lastComplete = now.toISOString();
  await checkpoint(st);
  return { state: st, complete: !stoppedBy, stoppedBy, calls: api.calls };
}

function lastLaunchByCraft(launches) {
  const m = new Map();
  for (const L of [...launches.values()].sort((a, b) => a.net.localeCompare(b.net))) for (const c of L.craft) if (c.cid) m.set(c.cid, L);
  return m;
}

/** Latest known spacecraft info: launch snapshots, overridden by the fresh in-space list. */
export function spacecraftRoster(st) {
  const m = new Map();
  for (const L of [...st.launches.values(), ...st.upcoming].sort((a, b) => a.net.localeCompare(b.net))) {
    for (const c of L.craft) if (c.info) m.set(c.cid, { ...c.info });
  }
  const fresh = new Set(st.spacecraft.map((c) => c.id));
  if (st.spacecraft.length || st.sync.lastComplete) for (const c of m.values()) if (!fresh.has(c.id)) c.inSpace = false;
  for (const c of st.spacecraft) m.set(c.id, { ...(m.get(c.id) || {}), ...c });
  return [...m.values()];
}

/** Everything the UI needs, derived from state. */
export function buildOutputs(st, now = new Date()) {
  const launches = [...st.launches.values()].sort((a, b) => a.net.localeCompare(b.net));
  const spacecraft = spacecraftRoster(st);
  const fleet = deriveFleet({ launchers: st.launchers, spacecraft, launches, upcoming: st.upcoming });
  const lastLaunchOf = lastLaunchByCraft(st.launches);

  const orbit = {
    craft: spacecraft
      .filter((c) => c.inSpace && lastLaunchOf.has(c.id))
      .map((c) => {
        const L = lastLaunchOf.get(c.id);
        const f = L.craft.find((x) => x.cid === c.id);
        return {
          key: `c${c.id}`, id: c.id, name: c.name, sn: c.sn, cfg: c.cfg, kind: classifyCraft(c) || 'other',
          status: c.status, tisTotal: c.tis, flights: c.flights,
          launch: { id: L.id, title: missionTitle(L), net: L.net, orb: L.orbn || L.orb, pad: L.pad, rk: L.rk, desc: L.desc },
          dest: f?.dest || null, dock: f?.dock || [], crew: f?.crew || 0,
        };
      }),
    recent: launches.filter((L) => now - Date.parse(L.net) < 21 * 864e5).reverse().map(slimLaunch),
    upcoming: st.upcoming.slice(0, 8).map(slimLaunch),
  };

  const years = {};
  for (const L of launches) (years[L.net.slice(0, 4)] ||= []).push(L);

  const stats = {
    launches: launches.length,
    byRocket: countBy(launches, (L) => L.rk || 'Unknown'),
    landings: fleet.filter((v) => v.type === 'booster').reduce((a, v) => a + (v.landOk || 0), 0),
    sats: launches.reduce((a, L) => a + (L.sats || 0), 0),
  };

  const meta = {
    generatedAt: now.toISOString(),
    lastComplete: st.sync.lastComplete,
    backfill: st.sync.fullDone ? null : { done: st.sync.offset, total: st.sync.total },
    years: Object.keys(years).sort(),
    latestNet: launches.length ? launches[launches.length - 1].net : null,
    stats,
    source: 'Launch Library 2 — The Space Devs',
  };
  return { meta, fleet, orbit, years, upcoming: st.upcoming };
}

function slimLaunch(L) {
  return { id: L.id, title: missionTitle(L), net: L.net, rk: L.rk, st: L.st, orb: L.orbn || L.orb, pad: L.pad, sats: L.sats,
    boosters: L.stages.map((s) => ({ sn: s.sn, lid: s.lid, n: s.n, land: s.land })), craft: L.craft.map((c) => ({ cid: c.cid, sn: c.sn, name: c.name })) };
}
const countBy = (xs, f) => xs.reduce((m, x) => ((m[f(x)] = (m[f(x)] || 0) + 1), m), {});

/** Serialise / restore state (Map → array). */
export const serializeState = (st) => ({ ...st, launches: undefined, sync: st.sync, launchers: st.launchers, spacecraft: st.spacecraft, upcoming: st.upcoming });
export function restoreState(saved, launchesArr) {
  const st = emptyState();
  if (saved) Object.assign(st, { launchers: saved.launchers || [], spacecraft: saved.spacecraft || [], upcoming: saved.upcoming || [], sync: { ...st.sync, ...(saved.sync || {}) } });
  for (const L of launchesArr || []) st.launches.set(L.id, L);
  return st;
}
