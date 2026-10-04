// Procedural SVG icons for each vehicle class, drawn to roughly true proportions:
// Falcon 9 first stage ~1:11, Super Heavy ~1:8, Starship ~1:6. Hull colours are physical
// (white composite, stainless steel, black carbon), with a few CSS tokens so they sit well on
// either theme. Each type has one fixed drawing with a light, fixed amount of weathering.

let uid = 0;

/**
 * @param {string} kind  f9 | fh-side | fh-core | sh | ship | dragon-crew | dragon-cargo | other
 * @param {{flights?:number, bucket?:string, label?:string}} o
 */
// One fixed icon per vehicle type: every Falcon 9 looks the same, every Super Heavy, every
// Starship, every Dragon. Falcon Heavy side boosters and center cores share one icon.
const TYPE = { f9: 'f9', 'fh-side': 'fh', 'fh-core': 'fh', sh: 'sh', ship: 'ship', 'dragon-crew': 'dragon', 'dragon-cargo': 'dragon' };
const WEATHER = { f9: 0.4, fh: 0.25, sh: 0.25, ship: 0.15, dragon: 0, other: 0 };

export function vehicleIcon(kind, { bucket = 'active', label = '' } = {}) {
  const id = `v${++uid}`;
  const type = TYPE[kind] || 'other';
  const soot = WEATHER[type];
  const rnd = seeded(type); // same streaks on every vehicle of this type
  const draw = BODIES[type]({ id, soot, rnd });
  return `<svg class="vicon vicon-${kind} is-${bucket}" viewBox="0 0 48 128" role="img" aria-label="${esc(label || kind)}">${draw}</svg>`;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function seeded(str) {
  let h = 2166136261;
  for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
}

const f = (n) => +n.toFixed(2);

// Shared gradients ---------------------------------------------------------------------
// Horizontal shading turns a flat rectangle into a lit cylinder (light from the upper left).
const cylGrad = (gid, a, b, c, d) => `<linearGradient id="${gid}" x1="0" x2="1" y1="0" y2="0">
  <stop offset="0" style="stop-color:${a}"/><stop offset=".28" style="stop-color:${b}"/>
  <stop offset=".55" style="stop-color:${c}"/><stop offset="1" style="stop-color:${d}"/></linearGradient>`;
const WHITE = (gid) => cylGrad(gid, 'var(--hull-lo)', 'var(--hull-hi)', 'var(--hull)', 'var(--hull-shade)');
const BLACK = (gid) => cylGrad(gid, '#2b3036', '#4a5058', '#1b1e22', '#0b0c0e');
const STEEL = (gid) => `<linearGradient id="${gid}" x1="0" x2="1" y1="0" y2="0">
  <stop offset="0" style="stop-color:var(--steel-a)"/><stop offset=".18" style="stop-color:var(--steel-b)"/>
  <stop offset=".24" style="stop-color:var(--steel-hi)"/><stop offset=".34" style="stop-color:var(--steel-b)"/>
  <stop offset=".7" style="stop-color:var(--steel-c)"/><stop offset="1" style="stop-color:var(--steel-a)"/></linearGradient>`;
const BELL = (gid) => `<linearGradient id="${gid}" x1="0" x2="1"><stop offset="0" stop-color="#2a2d31"/><stop offset=".35" stop-color="#7d838b"/><stop offset=".6" stop-color="#3c4046"/><stop offset="1" stop-color="#16181b"/></linearGradient>`;

// Soot: a body-clipped wash that is heaviest just below the interstage and at the base,
// plus vertical streaks from the reentry burn plume.
function sootLayer(id, rnd, soot, x, y, w, h) {
  if (soot <= 0) return '';
  const streaks = [];
  const n = Math.round(4 + soot * 9);
  for (let i = 0; i < n; i++) {
    const sx = x + rnd() * w, sw = 0.3 + rnd() * 1.4;
    const sy = y + rnd() * h * 0.25, sh = h * (0.3 + rnd() * 0.7);
    streaks.push(`<rect x="${f(sx)}" y="${f(sy)}" width="${f(sw)}" height="${f(Math.min(sh, y + h - sy))}" style="fill:var(--soot);opacity:${f((0.12 + rnd() * 0.3) * soot)}"/>`);
  }
  return `<linearGradient id="${id}sg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color:var(--soot);stop-opacity:${f(0.7 * soot)}"/>
      <stop offset=".35" style="stop-color:var(--soot);stop-opacity:${f(0.45 * soot)}"/>
      <stop offset=".7" style="stop-color:var(--soot);stop-opacity:${f(0.3 * soot)}"/>
      <stop offset="1" style="stop-color:var(--soot);stop-opacity:${f(0.65 * soot)}"/></linearGradient>
    <clipPath id="${id}sc"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>
    <g clip-path="url(#${id}sc)"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${id}sg)"/>${streaks.join('')}</g>`;
}

// A titanium grid fin. Side view = thin profile; face view = lattice.
function gridFinFace(x, y, w, h) {
  const lines = [];
  const step = w / 4;
  for (let i = 1; i < 4; i++) lines.push(`M${f(x + i * step)} ${y}v${h}`);
  for (let j = 1; j < 3; j++) lines.push(`M${x} ${f(y + (j * h) / 3)}h${w}`);
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx=".3" class="h-ti"/><path d="${lines.join('')}" class="h-ti-line"/>`;
}
const gridFinSide = (x, y, w, h, dir) => `<path d="M${x} ${y + 0.6} L${x + dir * w} ${y} V${y + h} L${x} ${y + h - 0.6} z" class="h-ti"/><path d="M${f(x + dir * w * 0.5)} ${y + 0.2}V${y + h - 0.2}" class="h-ti-line"/>`;

// Engine bells (with nozzle mouth ellipse).
function bells(gid, xs, top, w, h) {
  return xs.map((cx) => `<path d="M${f(cx - w * 0.28)} ${top} L${f(cx - w / 2)} ${top + h} Q${cx} ${top + h + 1.2} ${f(cx + w / 2)} ${top + h} L${f(cx + w * 0.28)} ${top} z" fill="url(#${gid})"/>`).join('');
}

// ---------------------------------------------------------------------------------------
// Falcon first stage. Body 10 wide x ~87 tall + interstage ≈ 1:10.5.
// ---------------------------------------------------------------------------------------
function falcon({ id, soot, rnd }, top) {
  const X = 19, W = 10, Y = 17, H = 87;
  const panels = [30, 44, 58, 72, 86].map((y) => `M${X} ${y}h${W}`).join('');
  return `<defs>${WHITE(id + 'w')}${BLACK(id + 'k')}${BELL(id + 'b')}</defs>
  <rect x="${X}" y="${Y}" width="${W}" height="${H}" fill="url(#${id}w)"/>
  ${sootLayer(id, rnd, soot, X, Y, W, H)}
  <path d="${panels}" class="h-panel"/>
  <rect x="${X + 7.2}" y="${Y + 1}" width=".9" height="${H - 18}" class="h-raceway"/>
  ${top}
  <!-- landing legs, stowed: two in profile at the edges, one face-on -->
  <path d="M${X - 1.4} 108 L${X - 0.3} 78 L${X + 0.6} 78 L${X + 0.6} 108 z" fill="url(#${id}k)"/>
  <path d="M${X + W + 1.4} 108 L${X + W + 0.3} 78 L${X + W - 0.6} 78 L${X + W - 0.6} 108 z" fill="url(#${id}k)"/>
  <path d="M${X + 3.6} 108 L${X + 3.9} 76 h2.2 L${X + 6.4} 108 z" fill="url(#${id}k)" opacity=".92"/>
  <path d="M${X + 4.4} 80 v24" class="h-piston"/>
  <!-- octaweb + engine section -->
  <rect x="${X - 0.4}" y="104" width="${W + 0.8}" height="4.5" rx=".6" fill="url(#${id}k)"/>
  ${bells(id + 'b', [20.4, 24, 27.6], 108.5, 3.6, 7)}
  <rect x="${X}" y="${Y}" width="${W}" height="${H}" class="h-edge"/>`;
}

const falconInterstage = (id) => `
  <rect x="19" y="3" width="10" height="14.5" fill="url(#${id}k)"/>
  <rect x="21.2" y="1.6" width="5.6" height="1.6" rx=".4" fill="#15181b"/>
  ${gridFinSide(19, 4.5, 5.2, 5.5, -1)}${gridFinSide(29, 4.5, 5.2, 5.5, 1)}
  ${gridFinFace(21.3, 4.6, 5.4, 5.2)}
  <rect x="19.8" y="12.4" width="1.6" height="2.4" rx=".3" fill="#5a6068"/><rect x="26.6" y="12.4" width="1.6" height="2.4" rx=".3" fill="#5a6068"/>`;

// FH side booster: composite nose cone instead of interstage, fins just below it.
const fhNose = (id) => `
  <path d="M19 17.5 V13 Q19 3 24 1 Q29 3 29 13 V17.5 z" fill="url(#${id}w)"/>
  <path d="M19 17.5 V13 Q19 3 24 1 Q29 3 29 13 V17.5" class="h-edge" fill="none"/>
  <rect x="19" y="16.6" width="10" height="2.2" fill="url(#${id}k)"/>
  ${gridFinSide(19, 18.4, 5, 5, -1)}${gridFinSide(29, 18.4, 5, 5, 1)}`;

// ---------------------------------------------------------------------------------------
// Super Heavy. Body 18 wide x ~92 tall + hot-stage ring ≈ 1:5.8 (drawn slightly stouter).
// ---------------------------------------------------------------------------------------
function superHeavy({ id, soot, rnd }) {
  const X = 15, W = 18, Y = 14, H = 90;
  const welds = [];
  for (let y = Y + 6; y < Y + H - 2; y += 6.5) welds.push(`M${X} ${f(y)}h${W}`);
  const vents = [];
  for (let i = 0; i < 6; i++) vents.push(`<rect x="${f(X + 1 + i * 2.8)}" y="6.2" width="1.6" height="4.8" rx=".5" class="h-vent"/>`);
  return `<defs>${STEEL(id + 's')}${BLACK(id + 'k')}${BELL(id + 'b')}</defs>
  <rect x="${X}" y="${Y}" width="${W}" height="${H}" fill="url(#${id}s)"/>
  ${sootLayer(id, rnd, soot * 0.9, X, Y, W, H)}
  <path d="${welds.join('')}" class="h-weld"/>
  <!-- vented hot-staging ring -->
  <rect x="${X}" y="3.5" width="${W}" height="10.5" fill="url(#${id}k)"/>${vents.join('')}
  <rect x="${X}" y="3.5" width="${W}" height="1" fill="#5d646d"/>
  <!-- three large grid fins (V3 layout): two in profile, one face-on -->
  ${gridFinSide(X, 15, 6.5, 8, -1)}${gridFinSide(X + W, 15, 6.5, 8, 1)}
  ${gridFinFace(X + 5.5, 15.2, 7, 7.6)}
  <!-- chines -->
  <path d="M${X} 34 l-.9 1 V96 l.9 1 z M${X + W} 34 l.9 1 V96 l-.9 1 z" fill="url(#${id}k)"/>
  <!-- quick-disconnect plate and aft skirt -->
  <rect x="${X + 12.5}" y="88" width="3.2" height="7" rx=".5" fill="#3a4047"/>
  <rect x="${X - 0.3}" y="${Y + H}" width="${W + 0.6}" height="5" fill="url(#${id}k)"/>
  ${bells(id + 'b', [17.4, 21.2, 24, 26.8, 30.6], 109, 3.4, 6)}
  <rect x="${X}" y="${Y}" width="${W}" height="${H}" class="h-edge"/>`;
}

// ---------------------------------------------------------------------------------------
// Starship upper stage. Barrel 18 wide; heat-shield tiles on the windward (right) half.
// ---------------------------------------------------------------------------------------
function starship({ id, soot, rnd }) {
  // Blunt ogive nose on a 9 m barrel; tiles cover the windward (right) half, nose to skirt.
  const hull = 'M15 108 V36 C15 21 18.4 9.5 22.4 5.2 Q24 3.6 25.6 5.2 C29.6 9.5 33 21 33 36 V108 z';
  const welds = [];
  for (let y = 44; y < 106; y += 8) welds.push(`M15 ${y}h18`);
  const flapL = (d) => `<path d="${d}" fill="url(#${id}f)"/><path d="${d}" class="h-flap" fill="none"/>`;
  return `<defs>${STEEL(id + 's')}${BELL(id + 'b')}
    <linearGradient id="${id}f" x1="0" x2="1"><stop offset="0" stop-color="#14171b"/><stop offset=".6" stop-color="#2c3238"/><stop offset="1" stop-color="#1a1d21"/></linearGradient>
    <pattern id="${id}hex" width="2.6" height="2.25" patternUnits="userSpaceOnUse">
      <rect width="2.6" height="2.25" style="fill:var(--tile)"/>
      <path d="M0 1.125 L.65 0 H1.95 L2.6 1.125 L1.95 2.25 H.65 z" style="fill:none;stroke:var(--tile-gap);stroke-width:.2"/>
    </pattern>
    <clipPath id="${id}c"><path d="${hull}"/></clipPath></defs>
  <!-- aft flaps sit behind the barrel -->
  ${flapL('M15 83 L10.4 87 Q8.8 88.2 8.8 90.2 V104.6 Q8.8 106.4 10.6 106.4 H15 z')}
  ${flapL('M33 83 L37.6 87 Q39.2 88.2 39.2 90.2 V104.6 Q39.2 106.4 37.4 106.4 H33 z')}
  <!-- forward flaps on the nose cone -->
  ${flapL('M16.9 15.5 L13.4 19.2 Q12.5 20.1 12.5 21.4 V28.6 Q12.5 30 13.8 29.7 L15.6 29.2 z')}
  ${flapL('M31.1 15.5 L34.6 19.2 Q35.5 20.1 35.5 21.4 V28.6 Q35.5 30 34.2 29.7 L32.4 29.2 z')}
  <path d="${hull}" fill="url(#${id}s)"/>
  <g clip-path="url(#${id}c)">
    <path d="${welds.join('')}" class="h-weld"/>
    <path d="M15 36.5 h18 M15 37.2 h18" class="h-weld"/>
    <rect x="24.6" y="0" width="10" height="110" fill="url(#${id}hex)"/>
    <rect x="24.6" y="0" width=".5" height="110" fill="#0c0e10" opacity=".5"/>
    ${sootLayer(id, rnd, soot * 0.6, 15, 36, 9.6, 72)}
  </g>
  <path d="${hull}" class="h-edge" fill="none"/>
  <!-- engine skirt: centre sea-level Raptor between two larger vacuum bells -->
  <rect x="15.6" y="107.6" width="16.8" height="2.4" rx=".6" fill="#22262b"/>
  ${bells(id + 'b', [24], 110, 3.4, 5)}${bells(id + 'b', [19.2, 28.8], 110, 5.4, 8)}`;
}

// ---------------------------------------------------------------------------------------
// Dragon 2: capsule (nose cone, SuperDraco pods, windows, heat shield) over the trunk.
// ---------------------------------------------------------------------------------------
function dragon({ id }, crew) {
  return `<defs>${WHITE(id + 'w')}${BLACK(id + 'k')}
    <pattern id="${id}cell" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="#1c2433"/><rect x=".15" y=".15" width="1.7" height="1.7" fill="#2a3a55"/></pattern></defs>
  <!-- capsule -->
  <path d="M18.6 30 Q24 26.5 29.4 30 L35 58 H13 z" fill="url(#${id}w)"/>
  <path d="M18.6 30 Q24 21 29.4 30 Q24 28.2 18.6 30 z" fill="url(#${id}w)"/>
  <path d="M18.6 30 Q24 21 29.4 30" class="h-edge" fill="none"/>
  <path d="M18.6 30 Q24 26.5 29.4 30 L35 58 H13 z" class="h-edge" fill="none"/>
  <path d="M24 22.8 v5.2" class="h-panel"/>
  ${crew
    ? `<path d="M15.8 37 l2.6 -.4 -1 9 -2.8 .4 z M32.2 37 l-2.6 -.4 1 9 2.8 .4 z" fill="#1a1d21"/>
       <circle cx="20.6" cy="47" r="1.5" fill="#20262e"/><circle cx="27.4" cy="47" r="1.5" fill="#20262e"/>
       <circle cx="20.3" cy="46.6" r=".5" fill="#6d86a8"/><circle cx="27.1" cy="46.6" r=".5" fill="#6d86a8"/>`
    : `<rect x="21.6" y="39" width="4.8" height="6.4" rx=".6" class="h-panel-fill"/>`}
  <rect x="12.6" y="57" width="22.8" height="2.6" rx=".6" fill="url(#${id}k)"/>
  <!-- trunk: body-mounted solar cells on one side, radiator on the other, fins at the base -->
  <rect x="13" y="59.6" width="22" height="36" fill="url(#${id}w)"/>
  <rect x="13" y="59.6" width="11.5" height="36" fill="url(#${id}cell)"/>
  <path d="M13 77.6 h22" class="h-panel"/>
  <rect x="13" y="59.6" width="22" height="36" class="h-edge"/>
  <path d="M13 82 L8.5 95.6 H13 z M35 82 L39.5 95.6 H35 z" fill="url(#${id}w)"/>
  <path d="M13 82 L8.5 95.6 H13 M35 82 L39.5 95.6 H35" class="h-edge" fill="none"/>`;
}

const BODIES = {
  f9: (c) => falcon(c, falconInterstage(c.id)),
  fh: (c) => falcon(c, fhNose(c.id)),
  sh: superHeavy,
  ship: starship,
  dragon: (c) => dragon(c, true),
  other: ({ id }) => `<defs>${WHITE(id + 'w')}</defs><circle cx="24" cy="64" r="12" fill="url(#${id}w)"/><circle cx="24" cy="64" r="12" class="h-edge"/>
    <path d="M4 60 h10 v8 H4 z M34 60 h10 v8 H34 z" fill="#2a3a55"/>`,
};
