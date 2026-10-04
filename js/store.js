// Data access for the browser. Prefers the static snapshot in ./data (built by the
// GitHub Action); tops it up with one live API call for anything launched since; falls
// back to building everything in the browser when no snapshot exists (local dev).

import { createApi, SPACEX_LSP_ID, ThrottledError } from './ll2.js';
import { normLaunch, missionTitle, isFailure } from './normalize.js';
import { sync, buildOutputs, restoreState } from './pipeline.js';

const LS_LIVE = 'fp.live.v1';
const LS_TOPUP = 'fp.topup.v1';
const TOPUP_EVERY_MS = 30 * 60e3;

const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};

const yearCache = new Map();
let liveLaunches = null; // when running without a snapshot

async function getJson(path) {
  const r = await fetch(path, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

/** Load meta + fleet + orbit. Returns {meta, fleet, orbit, mode}. */
export async function loadCore(onStatus = () => {}) {
  try {
    const [meta, fleet, orbit] = await Promise.all([getJson('data/meta.json'), getJson('data/fleet.json'), getJson('data/orbit.json')]);
    return { meta, fleet, orbit, mode: 'snapshot' };
  } catch {
    return loadLive(onStatus);
  }
}

/** No snapshot: build from the API directly (rate limited, cached in localStorage). */
async function loadLive(onStatus) {
  const saved = ls.get(LS_LIVE);
  const st = restoreState(saved?.state, saved?.launches);
  const fresh = saved && Date.now() - Date.parse(saved.state?.sync?.lastRun || 0) < TOPUP_EVERY_MS && saved.state?.sync?.fullDone;
  let note = null;
  if (!fresh) {
    onStatus('Downloading launch history from Launch Library 2…');
    const api = createApi({ maxWaitSec: 0, log: () => {} });
    const res = await sync(api, st, {
      checkpoint: async (s) => { persistLive(s); onStatus(s.sync.total ? `Downloading launch history… ${s.sync.offset} / ${s.sync.total}` : 'Downloading…'); },
    });
    if (!res.complete) note = res.stoppedBy;
  }
  persistLive(st);
  liveLaunches = [...st.launches.values()];
  const out = buildOutputs(st);
  return { meta: { ...out.meta, note }, fleet: out.fleet, orbit: out.orbit, mode: 'live' };
}

function persistLive(st) {
  const { launchers, spacecraft, upcoming, sync: s } = st;
  ls.set(LS_LIVE, { state: { launchers, spacecraft, upcoming, sync: s }, launches: [...st.launches.values()] });
}

/** Launch records for the given years (shards are cached). */
export async function loadYears(years) {
  if (liveLaunches) return liveLaunches.filter((L) => years.includes(L.net.slice(0, 4)));
  const need = years.filter((y) => !yearCache.has(y));
  await Promise.all(need.map(async (y) => yearCache.set(y, await getJson(`data/launches/${y}.json`).catch(() => []))));
  return years.flatMap((y) => yearCache.get(y) || []);
}

/**
 * Snapshot mode: one API call for launches newer than the snapshot. Patches fleet records
 * in place so the UI reflects flights the scheduled build hasn't picked up yet.
 * @returns {Promise<object[]>} new launches (compact), newest first
 */
export async function topUp(core) {
  if (core.mode !== 'snapshot' || !core.meta.latestNet) return [];
  const cached = ls.get(LS_TOPUP);
  let fresh;
  if (cached && cached.after === core.meta.latestNet && Date.now() - cached.at < TOPUP_EVERY_MS) {
    fresh = cached.launches;
  } else {
    try {
      const api = createApi({ maxWaitSec: 0 });
      const page = await api.get('/launches/previous/', { lsp__id: SPACEX_LSP_ID, mode: 'detailed', ordering: 'net', limit: 25, net__gt: core.meta.latestNet });
      fresh = page.results.map(normLaunch).filter((L) => L.net > core.meta.latestNet);
      ls.set(LS_TOPUP, { after: core.meta.latestNet, at: Date.now(), launches: fresh });
    } catch (e) {
      if (!(e instanceof ThrottledError)) console.warn('Live top-up failed', e);
      return [];
    }
  }
  if (!fresh.length) return [];
  const byKey = new Map(core.fleet.map((v) => [v.key, v]));
  for (const L of fresh) {
    for (const s of L.stages) patch(byKey.get(`b${s.lid}`), L, s.land, s.ta);
    for (const c of L.craft) patch(byKey.get(`c${c.cid}`), L, c.land, null);
    const y = L.net.slice(0, 4);
    if (yearCache.has(y) && !yearCache.get(y).some((x) => x.id === L.id)) yearCache.get(y).push(L);
  }
  core.extra = fresh;
  return [...fresh].reverse();
}

function patch(v, L, land, ta) {
  if (!v || (v.last && v.last >= L.net)) return;
  v.flights += 1;
  v.last = L.net;
  v.lastMission = missionTitle(L);
  v.lastFail = isFailure(L);
  if (land && land.a) { v.landAtt += 1; if (land.s) v.landOk += 1; }
  v.lastLanding = land;
  if (ta != null) v.fastest = v.fastest == null ? ta : Math.min(v.fastest, ta);
  if (L.sats) { v.sats += L.sats; v.satsKnown += 1; }
  v.tally += isFailure(L) ? 'F' : v.type === 'craft' ? 'S' : !land || !land.a ? 'E' : land.s === false ? 'X' : 'L';
  const y = L.net.slice(0, 4);
  if (!v.years.includes(y)) v.years.push(y);
  if (land && land.a && land.s === false && v.type === 'booster') v.bucket = 'lost';
  if (v.next && v.next.id === L.id) v.next = null;
  v.patched = true;
}
