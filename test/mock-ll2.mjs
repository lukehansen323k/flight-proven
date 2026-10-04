#!/usr/bin/env node
// Offline mock of the Launch Library 2 endpoints the tracker uses, filled with SYNTHETIC
// data in the real 2.3.0 response shape. For development and tests only.
//   node test/mock-ll2.mjs [port] [throttleAfterNCalls]
import http from 'node:http';

const PORT = Number(process.argv[2] || 8765);
const THROTTLE_AFTER = Number(process.argv[3] || Infinity);
let calls = 0;

// --- deterministic pseudo-random -------------------------------------------------
let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];

const iso = (t) => new Date(t).toISOString().replace('.000', '');
const dur = (days) => { const d = Math.floor(days), h = Math.floor((days - d) * 24); return `P${d}DT${h}H0M0S`; };
const landingLoc = { OCISLY: 'Of Course I Still Love You', ASOG: 'A Shortfall of Gravitas', JRTI: 'Just Read The Instructions', 'LZ-1': 'Landing Zone 1', 'LZ-2': 'Landing Zone 2', 'LZ-4': 'Landing Zone 4', GOM: 'Gulf of Mexico', PAC: 'Pacific Ocean', IND: 'Indian Ocean', OLP: 'Orbital Launch Pad Tower' };
const mkLanding = (attempt, success, abbrev, type, desc) => ({ id: Math.floor(rnd() * 1e6), attempt, success, description: desc, downrange_distance: null, landing_location: { id: 1, name: landingLoc[abbrev] || abbrev, abbrev }, type: { id: 1, name: type, abbrev: type } });

const now = Date.now();
const launchers = new Map();
const spacecraft = new Map();
const launches = [];
const upcoming = [];

function launcher(id, sn, status = 'active') {
  if (!launchers.has(id)) launchers.set(id, { response_mode: 'normal', id, url: '', flight_proven: false, serial_number: sn, is_placeholder: false, status: { id: 1, name: status }, image: null, details: `Synthetic test booster ${sn}.`, successful_landings: 0, attempted_landings: 0, flights: 0, last_launch_date: null, first_launch_date: null, fastest_turnaround: null, _last: null, _fast: Infinity });
  return launchers.get(id);
}
function craft(id, name, sn, cfgName, fam, typeName) {
  if (!spacecraft.has(id)) spacecraft.set(id, { response_mode: 'normal', id, name, serial_number: sn, is_placeholder: false, image: null, in_space: false, time_in_space: 'P0D', time_docked: 'P0D', flights_count: 0, mission_ends_count: 0, status: { id: 1, name: 'Active' }, description: `Synthetic test vehicle ${name}.`, spacecraft_config: { id: 1, name: cfgName, type: { id: 1, name: typeName }, family: fam.map((n) => ({ id: 1, name: n })) } });
  return spacecraft.get(id);
}

function stageFor(L, id, sn, type, land, net) {
  const b = launcher(id, sn);
  b.flights++;
  const prev = b._last;
  const ta = prev ? (Date.parse(net) - Date.parse(prev)) / 864e5 : null;
  if (ta != null) b._fast = Math.min(b._fast, ta);
  if (land.attempt) { b.attempted_landings++; if (land.success) b.successful_landings++; }
  b.first_launch_date ||= net; b.last_launch_date = net; b._last = net; b.flight_proven = b.flights > 1;
  b.fastest_turnaround = isFinite(b._fast) ? dur(b._fast) : null;
  return { id: Math.floor(rnd() * 1e6), type, reused: b.flights > 1, launcher_flight_number: b.flights, launcher: { ...b }, previous_flight_date: prev, turn_around_time: ta != null ? dur(ta) : null, landing: land, previous_flight: null };
}

function mkLaunch({ id, net, rk, fam, mission, desc, orbit, pad, stages = [], crafts = [], status = 'Success', payloads = [] }) {
  return {
    id, url: '', name: `${rk} | ${mission}`, response_mode: 'detailed', net,
    status: { id: status === 'Success' ? 3 : status === 'Failure' ? 4 : 1, name: status === 'Success' ? 'Launch Successful' : status === 'Failure' ? 'Launch Failure' : 'Go for Launch', abbrev: status },
    failreason: status === 'Failure' ? 'Synthetic test failure.' : '',
    image: null, launch_service_provider: { id: 121, name: 'SpaceX' },
    rocket: { id: 1, configuration: { id: 1, name: rk, full_name: rk, variant: '', families: fam.map((n) => ({ id: 1, name: n })) }, launcher_stage: stages, spacecraft_stage: crafts, payloads },
    mission: { id: 1, name: mission, type: 'Communications', description: desc, orbit: { id: 1, name: orbit[1], abbrev: orbit[0] }, agencies: [] },
    pad: { name: pad, location: { name: pad.includes('39A') || pad.includes('40') ? 'Cape Canaveral / KSC, FL, USA' : pad.includes('Starbase') || pad.includes('Orbital') ? 'Starbase, TX, USA' : 'Vandenberg SFB, CA, USA' } },
    vid_urls: [{ url: 'https://www.youtube.com/watch?v=example' }], mission_patches: [], last_updated: iso(now),
  };
}

// --- generate a synthetic history ----------------------------------------------------
const pads = ['SLC-40', 'LC-39A', 'SLC-4E'];
const ships = { 'SLC-40': ['ASOG', 'JRTI'], 'LC-39A': ['ASOG', 'JRTI'], 'SLC-4E': ['OCISLY'] };
const f9Fleet = [];
for (let i = 0; i < 26; i++) f9Fleet.push({ id: 100 + i, sn: `B10${String(60 + i).padStart(2, '0')}`, alive: true });
let lid = 1;
let t = now - 6 * 365 * 864e5;
let group = 1;
while (t < now - 2 * 864e5) {
  t += (1.2 + rnd() * 3.5) * 864e5;
  const alive = f9Fleet.filter((b) => b.alive);
  const b = pick(alive);
  const pad = pick(pads);
  const kind = rnd();
  const net = iso(t);
  const id = `00000000-0000-4000-8000-${String(lid++).padStart(12, '0')}`;
  if (kind < 0.04 && alive.length > 6) {
    // Falcon Heavy
    const s1 = alive[0], s2 = alive[1], core = { id: 300 + lid, sn: `B11${String(lid % 90).padStart(2, '0')}` };
    const stages = [
      stageFor(null, s1.id, s1.sn, 'Strap-On Booster', mkLanding(true, true, 'LZ-1', 'RTLS', `${s1.sn} landed at LZ-1.`), net),
      stageFor(null, s2.id, s2.sn, 'Strap-On Booster', mkLanding(true, true, 'LZ-2', 'RTLS', `${s2.sn} landed at LZ-2.`), net),
      stageFor(null, core.id, core.sn, 'Core', mkLanding(false, null, 'ATL', 'Ocean', 'Center core expended.'), net),
    ];
    launcher(core.id, core.sn).status.name = 'expended';
    launches.push(mkLaunch({ id, net, rk: 'Falcon Heavy', fam: ['Falcon'], mission: `USSF-${lid}`, desc: 'Synthetic national security mission to geosynchronous orbit.', orbit: ['GEO', 'Geostationary Orbit'], pad: 'LC-39A', stages }));
    continue;
  }
  if (kind < 0.12) {
    // Crew / cargo Dragon
    const crew = rnd() < 0.5;
    const capId = crew ? 500 + Math.floor(rnd() * 4) : 520 + Math.floor(rnd() * 3);
    const cap = crew ? craft(capId, `Crew Dragon ${['Endeavour', 'Resilience', 'Endurance', 'Freedom'][capId - 500]}`, `C2${capId - 494}`, 'Crew Dragon 2', ['Dragon', 'Dragon 2'], 'Crewed Spacecraft')
      : craft(capId, `Cargo Dragon C2${capId - 511}`, `C2${capId - 511}`, 'Cargo Dragon 2', ['Dragon', 'Dragon 2'], 'Cargo Spacecraft');
    cap.flights_count++;
    const land = mkLanding(true, true, 'LZ-1', 'RTLS', `${b.sn} returned to LZ-1.`);
    const stages = [stageFor(null, b.id, b.sn, 'Core', land, net)];
    const flight = { id: lid, url: '', destination: 'International Space Station', mission_end: iso(t + 30 * 864e5), spacecraft: { ...cap }, landing: mkLanding(true, true, 'PAC', 'Ocean', 'Splashdown off California.'), launch_crew: crew ? [{}, {}, {}, {}] : [], docking_events: [{ docking: iso(t + 864e5), departure: iso(t + 29 * 864e5), docking_location: { name: 'Harmony Zenith', spacestation: { name: 'International Space Station' } } }] };
    launches.push(mkLaunch({ id, net, rk: 'Falcon 9', fam: ['Falcon'], mission: crew ? `Crew-${lid}` : `CRS-${lid}`, desc: crew ? 'Synthetic crew rotation flight to the ISS with four astronauts.' : 'Synthetic cargo resupply mission to the ISS.', orbit: ['LEO', 'Low Earth Orbit'], pad: 'LC-39A', stages, crafts: [flight] }));
    continue;
  }
  const fail = rnd() < 0.015;
  const lose = rnd() < 0.02;
  const drone = pick(ships[pad]);
  const land = lose ? mkLanding(true, false, drone, 'ASDS', `${b.sn} was lost during the landing attempt.`) : mkLanding(true, true, drone, 'ASDS', `${b.sn} landed on ${landingLoc[drone]}.`);
  const stages = [stageFor(null, b.id, b.sn, 'Core', land, net)];
  if (lose) { b.alive = false; launcher(b.id, b.sn).status.name = 'lost'; }
  const sats = 20 + Math.floor(rnd() * 10);
  const g = `${6 + (group % 6)}-${group++}`;
  launches.push(mkLaunch({ id, net, rk: 'Falcon 9', fam: ['Falcon'], mission: `Starlink Group ${g}`, desc: `A batch of ${sats} Starlink V2 Mini satellites for the Starlink mega-constellation, part of a total of 12,000 satellites.`, orbit: ['LEO', 'Low Earth Orbit'], pad, stages, status: fail ? 'Failure' : 'Success' }));
  if (rnd() < 0.01) { b.alive = false; launcher(b.id, b.sn).status.name = 'retired'; }
}
// Retire a couple of old boosters, add two new unflown ones
launcher(100, 'B1060').status.name = 'retired';
launcher(190, 'B1095', 'active');
launcher(191, 'B1096', 'active');

// Starship test flights
const shipIds = [];
for (let i = 1; i <= 14; i++) {
  const net = iso(now - (420 - i * 28) * 864e5);
  const bId = 400 + i, sId = 600 + i;
  const sh = launcher(bId, `Booster ${7 + i}`);
  const ship = craft(sId, `Ship ${24 + 1 + i}`, `S${25 + i}`, i > 11 ? 'Starship V3' : 'Starship V2', ['Starship'], 'Reuseable Upper Stage');
  ship.flights_count = 1; ship.status.name = i % 3 === 0 ? 'Destroyed' : 'Retired';
  const caught = i % 2 === 0;
  const stages = [stageFor(null, bId, sh.serial_number, 'Core', mkLanding(true, true, caught ? 'OLP' : 'GOM', caught ? 'Catch' : 'Ocean', caught ? 'Caught by the tower chopsticks.' : 'Soft splashdown in the Gulf of Mexico.'), net)];
  sh.status.name = caught ? 'retired' : 'lost';
  const flight = { id: 9000 + i, url: '', destination: 'Suborbital', mission_end: iso(Date.parse(net) + 3600e3), spacecraft: { ...ship }, landing: mkLanding(true, i % 3 !== 0, 'IND', 'Ocean', 'Ship splashdown in the Indian Ocean.'), launch_crew: [] };
  launches.push(mkLaunch({ id: `00000000-0000-4000-9000-${String(i).padStart(12, '0')}`, net, rk: 'Starship', fam: ['Starship'], mission: `Starship Flight ${i}`, desc: i === 14 ? 'Starship will deliver 26 Starlink V3 satellites to orbit for the first time.' : `Integrated flight test ${i} of Starship.`, orbit: ['SO', 'Suborbital'], pad: 'Starbase Orbital Launch Pad', stages, crafts: [flight], status: i % 4 === 1 ? 'Failure' : 'Success' }));
  shipIds.push(sId);
}

// Something currently in space: the last crew Dragon flight
const lastDragon = [...launches].reverse().find((L) => /Crew-/.test(L.mission.name));
if (lastDragon) {
  const f = lastDragon.rocket.spacecraft_stage[0];
  f.docking_events[0].departure = null;
  f.mission_end = null;
  const c = spacecraft.get(f.spacecraft.id); c.in_space = true; f.spacecraft.in_space = true;
}

// Upcoming manifest
for (let i = 0; i < 6; i++) {
  const b = f9Fleet.filter((x) => x.alive)[i];
  const net = iso(now + (i + 1) * 2.5 * 864e5);
  upcoming.push(mkLaunch({ id: `00000000-0000-4000-7000-${String(i).padStart(12, '0')}`, net, rk: 'Falcon 9', fam: ['Falcon'], mission: `Starlink Group 12-${i + 1}`, desc: 'A batch of 28 Starlink V2 Mini satellites.', orbit: ['LEO', 'Low Earth Orbit'], pad: 'SLC-40', status: 'Go', stages: [{ id: 1, type: 'Core', reused: true, launcher_flight_number: null, launcher: { ...launcher(b.id, b.sn) }, landing: mkLanding(true, null, 'ASOG', 'ASDS', '') }] }));
}
upcoming.push(mkLaunch({ id: '00000000-0000-4000-7000-000000000099', net: iso(now + 30 * 864e5), rk: 'Starship', fam: ['Starship'], mission: 'Starship Flight 15', desc: 'Next Starship flight.', orbit: ['LEO', 'Low Earth Orbit'], pad: 'Starbase Orbital Launch Pad', status: 'TBD', stages: [{ id: 1, type: 'Core', reused: false, launcher_flight_number: 1, launcher: { ...launcher(430, 'Booster 22') }, landing: null }], crafts: [{ id: 99999, destination: 'Low Earth Orbit', spacecraft: { ...craft(650, 'Ship 42', 'S42', 'Starship V3', ['Starship'], 'Reuseable Upper Stage') }, landing: null, launch_crew: [] }] }));

launches.sort((a, b) => a.net.localeCompare(b.net));
const strip = (o) => { const { _last, _fast, ...r } = o; return r; };

// --- server ---------------------------------------------------------------------------
function page(list, q) {
  const limit = Number(q.get('limit') || 10), offset = Number(q.get('offset') || 0);
  const results = list.slice(offset, offset + limit);
  const next = offset + limit < list.length ? `http://localhost:${PORT}/next?offset=${offset + limit}` : null;
  return { count: list.length, next, previous: null, results };
}

http.createServer((req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const q = u.searchParams;
  const p = u.pathname.replace(/^\/2\.3\.0/, '');
  calls++;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (calls > THROTTLE_AFTER) { res.statusCode = 429; return res.end(JSON.stringify({ detail: 'Request was throttled. Expected available in 1800 seconds.' })); }
  let body;
  if (p === '/launches/previous/') {
    let list = launches;
    if (q.get('net__gte')) list = list.filter((L) => L.net >= q.get('net__gte'));
    body = page(list, q);
  } else if (p === '/launches/upcoming/') body = page(upcoming, q);
  else if (p.startsWith('/launches/')) body = launches.find((L) => p.includes(L.id)) || {};
  else if (p === '/spacecraft/') body = page([...spacecraft.values()].filter((c) => q.get('in_space') !== 'true' || c.in_space).map(strip), q);
  else if (p === '/launchers/') body = page([...launchers.values()].map(strip), q);
  else { res.statusCode = 404; body = { detail: 'Not found' }; }
  res.end(JSON.stringify(body));
}).listen(PORT, () => console.log(`mock LL2 on http://localhost:${PORT}/2.3.0  (${launches.length} launches, ${launchers.size} boosters)`));
