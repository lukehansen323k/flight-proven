#!/usr/bin/env node
// Refreshes ./data from Launch Library 2. Safe to run as often as you like: it is
// incremental, checkpoints after every page, and stops cleanly at the rate limit.
//
//   node scripts/build-data.mjs
//
// Env:
//   LL2_TOKEN      optional API token (https://thespacedevs.com) for higher limits
//   LL2_BASE       API root override (default https://ll.thespacedevs.com/2.3.0)
//   LL2_MAX_WAIT   seconds to sleep when throttled before giving up (default 900)
//   DATA_DIR       output folder (default ./data)

import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi, LL2_BASE } from '../js/ll2.js';
import { sync, buildOutputs, restoreState } from '../js/pipeline.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = process.env.DATA_DIR || join(root, 'data');
const LAUNCH_DIR = join(DATA, 'launches');

const readJson = async (p, fallback) => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return fallback; } };
const writeJson = (p, v) => writeFile(p, JSON.stringify(v));

async function loadState() {
  await mkdir(LAUNCH_DIR, { recursive: true });
  const saved = await readJson(join(DATA, 'state.json'), null);
  const launches = [];
  for (const f of (await readdir(LAUNCH_DIR)).filter((f) => /^\d{4}\.json$/.test(f))) launches.push(...(await readJson(join(LAUNCH_DIR, f), [])));
  return restoreState(saved, launches);
}

async function saveLaunches(st) {
  const years = {};
  for (const L of st.launches.values()) (years[L.net.slice(0, 4)] ||= []).push(L);
  for (const [y, list] of Object.entries(years)) {
    list.sort((a, b) => a.net.localeCompare(b.net));
    await writeJson(join(LAUNCH_DIR, `${y}.json`), list);
  }
  return Object.keys(years).sort();
}

async function saveState(st) {
  const { launchers, spacecraft, upcoming, sync: s } = st;
  await writeJson(join(DATA, 'state.json'), { launchers, spacecraft, upcoming, sync: s });
}

const api = createApi({
  base: process.env.LL2_BASE || LL2_BASE,
  token: process.env.LL2_TOKEN || undefined,
  maxWaitSec: Number(process.env.LL2_MAX_WAIT ?? 900),
  userAgent: 'spacex-fleet-tracker (github pages static build)',
  log: (m) => console.log(m),
});

const st = await loadState();
console.log(`Loaded ${st.launches.size} launches; backfill ${st.sync.fullDone ? 'complete' : `at offset ${st.sync.offset}`}`);

const result = await sync(api, st, {
  log: (m) => console.log(m),
  checkpoint: async (s) => { await saveLaunches(s); await saveState(s); },
});

await saveLaunches(st);
await saveState(st);
const out = buildOutputs(st);
await writeJson(join(DATA, 'meta.json'), out.meta);
await writeJson(join(DATA, 'fleet.json'), out.fleet);
await writeJson(join(DATA, 'orbit.json'), out.orbit);

console.log(`${result.complete ? 'Complete' : 'Partial: ' + result.stoppedBy}. ${api.calls} API calls. ${st.launches.size} launches, ${out.fleet.length} vehicles.`);
