// Turns verbose Launch Library 2 objects into compact records, and derives the
// fleet roster from them. Pure functions — shared by browser and build script.

const get = (o, ...path) => path.reduce((v, k) => (v == null ? undefined : v[k]), o);
const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const nameOf = (v) => (typeof v === 'string' ? v : v?.name);
const imgThumb = (img) => (img && typeof img === 'object' ? img.thumbnail_url || img.image_url : img) || null;

/** ISO-8601 duration (P32DT16H27M56S) → days (float). */
export function isoDurationDays(s) {
  if (!s || typeof s !== 'string') return null;
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?)?$/.exec(s);
  if (!m) return null;
  const [, y, mo, w, d, h, mi, se] = m.map((x) => Number(x || 0));
  return y * 365.25 + mo * 30.44 + w * 7 + d + h / 24 + mi / 1440 + se / 86400;
}

/** Satellite / payload count for a launch: payload manifest first, then mission text. */
export function satelliteCount(L) {
  const payloads = arr(get(L, 'rocket', 'payloads'));
  if (payloads.length) {
    let n = 0;
    for (const p of payloads) n += Number(p.amount) > 0 ? Number(p.amount) : 1;
    return { n, src: 'manifest' };
  }
  const text = `${get(L, 'mission', 'description') || ''}`;
  const re = /(\d{1,3}(?:,\d{3})?)\s+(?:[\w.\-/]+\s+){0,4}?(satellites|spacecraft|payloads|smallsats|cubesats)\b/gi;
  let m;
  while ((m = re.exec(text))) {
    const n = Number(m[1].replace(/,/g, ''));
    const before = text.slice(Math.max(0, m.index - 30), m.index).toLowerCase();
    if (n > 0 && n <= 400 && !/constellation|total of|more than|over|nearly|approximately/.test(before)) {
      return { n, src: 'text' };
    }
  }
  return null;
}

export function normLanding(l) {
  if (!l) return null;
  return {
    a: !!l.attempt,
    s: l.success === null || l.success === undefined ? null : !!l.success,
    loc: get(l, 'landing_location', 'abbrev') || get(l, 'landing_location', 'name') || null,
    locn: get(l, 'landing_location', 'name') || null,
    ty: get(l, 'type', 'abbrev') || get(l, 'type', 'name') || null,
    d: l.description || null,
  };
}

const PLACEHOLDER = /^(unknown|tbd|placeholder)\b/i;
export const isPlaceholderSerial = (sn) => !sn || PLACEHOLDER.test(sn);

function normStage(s) {
  if (get(s, 'launcher', 'is_placeholder') || isPlaceholderSerial(get(s, 'launcher', 'serial_number'))) return { lid: null, sn: null, t: s.type || null, n: null, re: null, ta: null, land: normLanding(s.landing) };
  return {
    lid: get(s, 'launcher', 'id'),
    sn: get(s, 'launcher', 'serial_number'),
    t: s.type || null, // "Core" | "Strap-On Booster"
    n: s.launcher_flight_number ?? null,
    re: s.reused ?? null,
    ta: isoDurationDays(s.turn_around_time),
    land: normLanding(s.landing),
  };
}

function normCraftFlight(f) {
  const sc = f.spacecraft || {};
  const cfg = sc.spacecraft_config || {};
  return {
    fid: f.id,
    cid: sc.id,
    sn: sc.serial_number || null,
    name: sc.name || null,
    cfg: cfg.name || null,
    fam: arr(cfg.family || cfg.families).map(nameOf).filter(Boolean),
    dest: f.destination || null,
    end: f.mission_end || null,
    land: normLanding(f.landing),
    dock: arr(f.docking_events).map((d) => ({
      at: d.docking || null,
      dep: d.departure || null,
      loc: get(d, 'docking_location', 'spacestation', 'name') || get(d, 'docking_location', 'name') || null,
    })),
    crew: arr(f.launch_crew).length || 0,
    info: sc.id ? normSpacecraft(sc) : null,
  };
}

/** Compact launch record. */
export function normLaunch(L) {
  const cfg = get(L, 'rocket', 'configuration') || {};
  const sats = satelliteCount(L);
  const vids = arr(L.vid_urls);
  const patch = arr(L.mission_patches)[0];
  return {
    id: L.id,
    name: L.name,
    net: L.net,
    np: get(L, 'net_precision', 'abbrev') || get(L, 'net_precision', 'name') || null,
    st: get(L, 'status', 'abbrev') || get(L, 'status', 'name') || null,
    stn: get(L, 'status', 'name') || null,
    fail: L.failreason || null,
    rk: cfg.name || null,
    rkf: cfg.full_name || null,
    fam: arr(cfg.families || cfg.family).map(nameOf).filter(Boolean),
    msn: get(L, 'mission', 'name') || null,
    mt: get(L, 'mission', 'type') || null,
    desc: get(L, 'mission', 'description') || null,
    orb: get(L, 'mission', 'orbit', 'abbrev') || null,
    orbn: get(L, 'mission', 'orbit', 'name') || null,
    pad: get(L, 'pad', 'name') || null,
    loc: get(L, 'pad', 'location', 'name') || null,
    img: imgThumb(L.image),
    patch: patch ? patch.image_url || null : null,
    vid: vids.length ? vids[0].url || null : L.webcast_live ? null : null,
    sats: sats ? sats.n : null,
    satsSrc: sats ? sats.src : null,
    stages: arr(get(L, 'rocket', 'launcher_stage')).map(normStage),
    craft: arr(get(L, 'rocket', 'spacecraft_stage')).map(normCraftFlight),
    upd: L.last_updated || null,
  };
}

export function normLauncher(x) {
  return {
    id: x.id,
    sn: x.serial_number,
    status: (nameOf(x.status) || 'unknown').toLowerCase(),
    flights: x.flights ?? null,
    sl: x.successful_landings ?? null,
    al: x.attempted_landings ?? null,
    first: x.first_launch_date || null,
    last: x.last_launch_date || null,
    fast: isoDurationDays(x.fastest_turnaround),
    details: x.details || null,
    img: imgThumb(x.image),
    placeholder: !!x.is_placeholder,
  };
}

export function normSpacecraft(x) {
  const cfg = x.spacecraft_config || {};
  return {
    id: x.id,
    sn: x.serial_number || null,
    name: x.name || null,
    cfg: cfg.name || null,
    fam: arr(cfg.family || cfg.families).map(nameOf).filter(Boolean),
    status: (nameOf(x.status) || 'unknown').toLowerCase(),
    inSpace: !!x.in_space,
    tis: isoDurationDays(x.time_in_space),
    docked: isoDurationDays(x.time_docked),
    flights: x.flights_count ?? null,
    desc: x.description || null,
    img: imgThumb(x.image),
  };
}

// ---------------------------------------------------------------------------
// Fleet derivation
// ---------------------------------------------------------------------------

const isStarship = (L) => L.fam.includes('Starship') || /starship/i.test(L.rk || '');
const isFH = (L) => /heavy/i.test(L.rk || '');
const isSuccess = (L) => /success/i.test(L.st || '') || /success/i.test(L.stn || '');
const isFailure = (L) => /fail/i.test(L.st || '') || /fail/i.test(L.stn || '');

export function classifyBoosterSerial(sn = '') {
  if (/^SN\d|starhopper|^MK\s?\d/i.test(sn)) return 'ship'; // single-stage Starship prototypes
  if (/^B[01]\d{3}$/i.test(sn)) return 'f9';
  if (/booster|^B\d{1,2}$|^BN/i.test(sn)) return 'sh';
  return 'f9';
}

export function classifyCraft(c) {
  const fam = (c.fam || []).join(' ') + ' ' + (c.cfg || '') + ' ' + (c.name || '');
  if (/starship|ship\s*\d/i.test(fam)) return 'ship';
  if (/crew dragon/i.test(fam)) return 'dragon-crew';
  if (/dragon/i.test(fam)) return 'dragon-cargo';
  return null;
}

/** Normalised status buckets for display. */
export function statusBucket(status, inSpace) {
  if (inSpace) return 'inspace';
  const s = (status || '').toLowerCase();
  if (/active|single use/.test(s)) return 'active';
  if (/expend/.test(s)) return 'expended';
  if (/lost|destroy/.test(s)) return 'lost';
  if (/retire|inactive/.test(s)) return 'retired';
  if (/under construction|development|in production/.test(s)) return 'building';
  return 'unknown';
}

/**
 * Build the fleet roster from launchers, spacecraft and launches.
 * @param {{launchers: object[], spacecraft: object[], launches: object[], upcoming: object[]}} d
 */
export function deriveFleet({ launchers, spacecraft, launches, upcoming }) {
  const sorted = [...launches].sort((a, b) => a.net.localeCompare(b.net));
  const byKey = new Map();

  const ensure = (key, base) => {
    if (!byKey.has(key)) byKey.set(key, { key, ...base, log: [], years: new Set(), sats: 0, satsKnown: 0, roles: new Set() });
    return byKey.get(key);
  };

  for (const l of launchers) {
    if (l.placeholder || isPlaceholderSerial(l.sn)) continue;
    ensure(`b${l.id}`, { type: 'booster', ref: l, sn: l.sn, kind: classifyBoosterSerial(l.sn) });
  }
  for (const c of spacecraft) {
    const kind = classifyCraft(c);
    if (!kind) continue;
    ensure(`c${c.id}`, { type: 'craft', ref: c, sn: c.sn || c.name, kind });
  }

  for (const L of sorted) {
    const ship = isStarship(L), heavy = isFH(L);
    for (const s of L.stages) {
      if (!s.lid) continue;
      const v = ensure(`b${s.lid}`, { type: 'booster', ref: { id: s.lid, sn: s.sn, status: 'unknown' }, sn: s.sn, kind: classifyBoosterSerial(s.sn) });
      if (ship) v.kind = /prototype/i.test(L.rk || '') ? 'ship' : 'sh';
      else if (heavy) v.roles.add(/core/i.test(s.t || '') ? 'fh-core' : 'fh-side');
      else v.roles.add('f9');
      v.log.push(L.id);
      v.years.add(L.net.slice(0, 4));
      if (L.sats != null) { v.sats += L.sats; v.satsKnown++; }
    }
    for (const c of L.craft) {
      if (!c.cid) continue;
      const kind = classifyCraft(c) || (ship ? 'ship' : null);
      if (!kind) continue;
      const v = ensure(`c${c.cid}`, { type: 'craft', ref: { id: c.cid, sn: c.sn, name: c.name, cfg: c.cfg, fam: c.fam, status: 'unknown' }, sn: c.sn || c.name, kind });
      v.log.push(L.id);
      v.years.add(L.net.slice(0, 4));
      if (L.sats != null) { v.sats += L.sats; v.satsKnown++; }
    }
  }

  // Next assignment from upcoming manifest
  const nextFor = new Map();
  for (const U of [...upcoming].sort((a, b) => a.net.localeCompare(b.net))) {
    for (const s of U.stages) if (s.lid && !nextFor.has(`b${s.lid}`)) nextFor.set(`b${s.lid}`, U);
    for (const c of U.craft) if (c.cid && !nextFor.has(`c${c.cid}`)) nextFor.set(`c${c.cid}`, U);
    for (const s of U.stages) if (s.lid) ensure(`b${s.lid}`, { type: 'booster', ref: { id: s.lid, sn: s.sn, status: 'active' }, sn: s.sn, kind: isStarship(U) ? 'sh' : classifyBoosterSerial(s.sn) });
    for (const c of U.craft) { const k = classifyCraft(c); if (c.cid && k) ensure(`c${c.cid}`, { type: 'craft', ref: { id: c.cid, sn: c.sn, name: c.name, cfg: c.cfg, fam: c.fam, status: 'active' }, sn: c.sn || c.name, kind: k }); }
  }

  const launchById = new Map(sorted.map((L) => [L.id, L]));
  const out = [];
  for (const v of byKey.values()) {
    const r = v.ref;
    const flown = v.log.map((id) => launchById.get(id));
    // Booster kind: Falcon Heavy roles take precedence when it never flew as a single-stick F9
    if (v.type === 'booster' && v.kind !== 'sh' && v.kind !== 'ship') {
      if (v.roles.has('fh-core')) v.kind = 'fh-core';
      else if (v.roles.has('fh-side') && !v.roles.has('f9')) v.kind = 'fh-side';
      else v.kind = 'f9';
    }
    let landOk = 0, landAtt = 0, lastLanding = null;
    const turns = [];
    for (const L of flown) {
      const st = v.type === 'booster' ? L.stages.find((s) => s.lid === r.id) : null;
      const cr = v.type === 'craft' ? L.craft.find((c) => c.cid === r.id) : null;
      const land = st ? st.land : cr ? cr.land : null;
      if (land && land.a) { landAtt++; if (land.s) landOk++; }
      if (land) lastLanding = land;
      if (st && st.ta != null) turns.push(st.ta);
    }
    // Spacecraft turnaround = gap between consecutive launches
    if (v.type === 'craft') for (let i = 1; i < flown.length; i++) turns.push((Date.parse(flown[i].net) - Date.parse(flown[i - 1].net)) / 864e5);

    const flights = Math.max(r.flights ?? 0, flown.length);
    const inSpace = !!r.inSpace;
    const nx = nextFor.get(v.key);
    const lastL = flown[flown.length - 1];
    out.push({
      key: v.key,
      type: v.type,
      kind: v.kind,
      id: r.id,
      sn: v.sn,
      name: v.type === 'craft' ? r.name : null,
      cfg: r.cfg || null,
      status: r.status || 'unknown',
      bucket: statusBucket(r.status, inSpace),
      inSpace,
      flights,
      landOk: r.sl ?? landOk,
      landAtt: r.al ?? landAtt,
      first: r.first || (flown[0] && flown[0].net) || null,
      last: r.last || (lastL && lastL.net) || null,
      lastMission: lastL ? missionTitle(lastL) : null,
      lastFail: lastL ? isFailure(lastL) : false,
      fastest: r.fast ?? (turns.length ? Math.min(...turns) : null),
      avgTurn: turns.length ? turns.reduce((a, b) => a + b, 0) / turns.length : null,
      sats: v.sats,
      satsKnown: v.satsKnown,
      tis: r.tis ?? null,
      details: r.details || r.desc || null,
      img: r.img || null,
      lastLanding,
      next: nx ? { id: nx.id, name: missionTitle(nx), net: nx.net } : null,
      years: [...v.years].sort(),
      // One character per flight, oldest first: L landed, X landing failed, E expended / no attempt,
      // F launch failure, S spacecraft flight recovered, D spacecraft lost.
      tally: flown.map((L) => {
        if (isFailure(L)) return 'F';
        if (v.type === 'craft') { const c = L.craft.find((x) => x.cid === r.id); return c && c.land && c.land.a && c.land.s === false ? 'D' : 'S'; }
        const s = L.stages.find((x) => x.lid === r.id);
        if (!s || !s.land || !s.land.a) return 'E';
        return s.land.s === false ? 'X' : 'L';
      }).join(''),
    });
  }
  return out.sort((a, b) => (b.last || '').localeCompare(a.last || ''));
}

export function missionTitle(L) {
  if (!L) return '';
  const parts = (L.name || '').split('|');
  return (parts[1] || parts[0] || L.msn || '').trim();
}

export { isSuccess, isFailure, isStarship, isFH };
