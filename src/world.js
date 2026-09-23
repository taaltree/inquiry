/* ============================================================
   world.js — the campus.

   North is -z, east +x. A Great Court at the centre (library to the
   north, chapel to the east, a clock-tower range to the west, the
   Great Gate to the south), five departments around it, a lane loop
   for carts and bikes, the river and the Backs to the west, playing
   fields to the north, and the town street along the south edge.
   ============================================================ */

const WORLD_HALF = 330;
const WATER_Y = -1.45;
const R_PLATFORM = 42;          // a department's catchment, used by objectives and the feed

const DISTRICTS = [
  { id: 'foundry',     name: 'FOUNDRY HALL',      short: 'Foundry Hall', sub: 'Physics · Forces, Matter & Energy',
    accent: '#ff6a3c', accent2: '#ffc24a', glyph: '⚛' },
  { id: 'observatory', name: 'THE OBSERVATORY',   short: 'The Observatory', sub: 'Astronomy · Cosmos & Spacetime',
    accent: '#57d6ff', accent2: '#b08cff', glyph: '✦' },
  { id: 'helix',       name: 'THE HELIX BUILDING', short: 'Helix Building', sub: 'Life Sciences · Heredity & Medicine',
    accent: '#3affb0', accent2: '#9dff62', glyph: '⌘' },
  { id: 'lattice',     name: 'LATTICE LABORATORY', short: 'Lattice Laboratory', sub: 'Chemistry · Molecules, Materials & Earth',
    accent: '#ffc93d', accent2: '#ff7ad0', glyph: '⬢' },
  { id: 'engine',      name: 'THE ENGINE HOUSE',  short: 'Engine House', sub: 'Computing · Mind, Mathematics & Computation',
    accent: '#8aa4ff', accent2: '#aabbf0', glyph: '⌗' },
];
/* where each department's forecourt is (scientists stand around it) and where its building sits */
const DEPT = {
  foundry:     { cx: -134, cz: 113, bx: -150, bz: 129, yaw: 3 * Math.PI / 4 },
  observatory: { cx: -141, cz: -116, bx: -160, bz: -135, yaw: Math.PI / 4 },
  helix:       { cx: 133, cz: -122, bx: 150, bz: -140, yaw: -Math.PI / 4 },
  lattice:     { cx: 158, cz: 30, bx: 186, bz: 30, yaw: -Math.PI / 2 },
  engine:      { cx: 131, cz: 131, bx: 150, bz: 150, yaw: -3 * Math.PI / 4 },
};
DISTRICTS.forEach((d, k) => {
  const D = DEPT[d.id];
  d.index = k; d.cx = D.cx; d.cz = D.cz;
  d.angle = Math.atan2(d.cz, d.cx);
  d.rgb = hex2rgb(d.accent); d.rgb2 = hex2rgb(d.accent2);
});

/* a flat annulus (used by the summit's marquees) */
function ringFlat(b, cx, cz, rOuter, rInner, y, color, glow = 0, seg = 72) {
  b.add(pRing(0.5 * rInner / rOuter, seg), xform([cx, y, cz], [0, 0, 0], [rOuter * 2, 1, rOuter * 2]), color, glow);
}

/* ---------- terrain ---------- */
const HILL = { x: -150, z: -126, top: 4.6, r0: 32, r1: 62 };
function riverX(z) { return -240 + Math.sin(z * 0.011) * 7 + Math.sin(z * 0.031 + 1) * 2.5; }
function groundH(x, z) {
  let h = 0;
  const dh = Math.hypot(x - HILL.x, z - HILL.z);
  if (dh < HILL.r1) h += HILL.top * (1 - smoothstep(clamp((dh - HILL.r0) / (HILL.r1 - HILL.r0), 0, 1)));
  const dr = Math.abs(x - riverX(z));
  if (dr < 19) h -= 3.0 * (1 - smoothstep(clamp((dr - 7) / 11, 0, 1)));
  if (x < -262) h += Math.sin(x * 0.03) * Math.cos(z * 0.025) * 0.9 * clamp((-262 - x) / 30, 0, 1);
  if (z < -300) h += Math.sin(x * 0.02 + 1) * 0.6 * clamp((-300 - z) / 30, 0, 1);
  return h;
}
function inWater(x, z) { return Math.abs(x - riverX(z)) < 12.5; }
function isWalkable(x, z) { return Math.abs(x) < WORLD_HALF && Math.abs(z) < WORLD_HALF && !inWater(x, z); }

/* ---------- materials for the ground ---------- */
const GM = {
  field:  mat(TX.GRASS, [0.82, 0.86, 0.74], { rough: 0.95, tile: 3 }),
  lawn:   mat(TX.GRASS, [1.02, 1.06, 0.92], { rough: 0.95, tile: 3, kind: KIND.LAWN }),
  gravel: mat(TX.GRAVEL, [1, 1, 1], { rough: 0.95, tile: 2 }),
  flag:   mat(TX.FLAG, [1.1, 1.02, 0.9], { rough: 0.85, tile: 3 }),
  setts:  mat(TX.SETTS, [1, 1, 1], { rough: 0.8, tile: 1 }),
  paver:  mat(TX.PAVER, [1, 1, 1], { rough: 0.85, tile: 1.2 }),
  road:   mat(TX.ASPHALT, [1, 1, 1], { rough: 0.9, tile: 4 }),
  kerb:   mat(TX.CONCRETE, [0.95, 0.94, 0.9], { rough: 0.85, tile: 1, uv: 'local' }),
  paint:  mat(0, [0.85, 0.85, 0.8], { rough: 0.7 }),
  yellow: mat(0, [0.85, 0.65, 0.12], { rough: 0.7 }),
  soil:   mat(TX.SOIL, [1, 1, 1], { rough: 0.95, tile: 2 }),
  beds:   mat(TX.FLOWERS, [1, 1, 1], { rough: 0.9, tile: 1.5 }),
  water:  mat(0, [0.09, 0.12, 0.08], { kind: KIND.WATER, rough: 0.05 }),
  edging: mat(TX.ASHLAR, [0.95, 0.93, 0.88], { rough: 0.85, tile: 2, uv: 'local' }),
  wall:   mat(TX.ASHLAR, [0.92, 0.88, 0.8], { rough: 0.85, tile: 2, uv: 'local' }),
};

/* the network everything walks, rides and drives on (also the GPS graph) */
function campusPaths() {
  const P = [];
  const add = (pts, w, M, kind, lift) => P.push({ pts, w, M, kind, lift: lift == null ? 0.07 : lift });
  // roads
  add([[-WORLD_HALF - 40, 205], [WORLD_HALF + 40, 205]], 10, GM.road, 'road', 0.05);
  add([[262, -WORLD_HALF - 40], [262, 199]], 9, GM.road, 'road', 0.05);
  const lane = [[95, 200]];
  for (let a = 0; a <= 8; a++) { const t = (a / 8) * Math.PI / 2; lane.push([83 + Math.cos(t) * 12, -153 - Math.sin(t) * 12]); }
  for (let a = 0; a <= 8; a++) { const t = Math.PI / 2 + (a / 8) * Math.PI / 2; lane.push([-83 + Math.cos(t) * 12, -153 - Math.sin(t) * 12]); }
  lane.push([-95, 200]);
  add(lane, 6.5, GM.road, 'lane', 0.05);
  // pavements along the town road
  add([[-WORLD_HALF - 40, 198.3], [WORLD_HALF + 40, 198.3]], 3.4, GM.flag, 'pave', 0.16);
  add([[-WORLD_HALF - 40, 211.7], [WORLD_HALF + 40, 211.7]], 3.4, GM.flag, 'pave', 0.16);
  add([[258.2, -WORLD_HALF - 40], [258.2, 196.6]], 3.2, GM.flag, 'pave', 0.16);
  // footpaths
  add([[0, 56], [0, 196.6]], 5, GM.gravel, 'path');                                     // the avenue
  add([[-55, 0], [-110, 0], [-170, 0], [-226, 0]], 4, GM.gravel, 'path');                // to the Backs and the bridge
  add([[-212, -170], [-212, -60], [-212, 0], [-212, 60], [-212, 175]], 3, GM.gravel, 'path');   // riverside walk
  add([[-41, 41], [-70, 68], [-104, 94], [-126, 108]], 3.5, GM.gravel, 'path');          // → Foundry
  add([[-40, -43], [-68, -70], [-100, -96], [-132, -110]], 3.5, GM.gravel, 'path');      // → Observatory
  add([[41, -45], [70, -74], [100, -100], [126, -117]], 3.5, GM.gravel, 'path');         // → Helix
  add([[44, 41], [74, 74], [104, 104], [124, 124]], 3.5, GM.gravel, 'path');             // → Engine
  add([[44, 41], [72, 38], [110, 33], [146, 30]], 3.5, GM.gravel, 'path');               // → Lattice
  add([[0, 115], [-20, 115]], 3.5, GM.flag, 'path');                                     // café
  add([[0, -165], [0, -182]], 3.5, GM.gravel, 'path');                                   // pavilion
  add([[-212, 60], [-222, 60]], 2.5, GM.flag, 'path');                                   // punt landing
  add([[-104, 94], [-95, 100]], 3, GM.gravel, 'path');
  add([[-100, -96], [-95, -100]], 3, GM.gravel, 'path');
  add([[100, -100], [95, -103]], 3, GM.gravel, 'path');
  add([[104, 104], [95, 101]], 3, GM.gravel, 'path');
  return P;
}

/* ---------- builders for the ground ---------- */
function terrainChunks(W) {
  const size = 64, res = 3.2;
  const lo = -WORLD_HALF - 64, hi = WORLD_HALF + 64;
  for (let bx = lo; bx < hi; bx += size) for (let bz = lo; bz < hi; bz += size) {
    const b = W.at(bx + size / 2, bz + size / 2);
    const n = Math.round(size / res);
    b.reserve((n + 1) * (n + 1), n * n * 6);
    const base = b.n;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const x = bx + i * res * (size / (n * res)), z = bz + j * res * (size / (n * res));
      const y = groundH(x, z);
      const e = 0.8;
      const nx = groundH(x - e, z) - groundH(x + e, z), nz = groundH(x, z - e) - groundH(x, z + e);
      const L = Math.hypot(nx, 2 * e, nz);
      const uv = [x / GM.field.tile, -z / GM.field.tile];
      b.vert(x, y, z, nx / L, 2 * e / L, nz / L, GM.field, uv[0], uv[1]);
    }
    const w = n + 1;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const a = base + i * w + j;
      b.i[b.ni++] = a; b.i[b.ni++] = a + 1; b.i[b.ni++] = a + w;
      b.i[b.ni++] = a + 1; b.i[b.ni++] = a + w + 1; b.i[b.ni++] = a + w;
    }
  }
}

/* a flat outer skirt beyond the playable ground, so the horizon never shows an edge */
function horizonSkirt(b) {
  const R = 1600, r = WORLD_HALF + 60;
  const M = GM.field;
  const q = (x0, z0, x1, z1) => b.quad([x0, -0.05, z1], [x1, -0.05, z1], [x1, -0.05, z0], [x0, -0.05, z0], M);
  q(-R, -R, R, -r); q(-R, r, R, R); q(-R, -r, -r, r); q(r, -r, R, r);
}

function kerbAlong(b, pts, off, h) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const tx = (x1 - x0) / len, tz = (z1 - z0) / len;
    const mx = (x0 + x1) / 2 - tz * off, mz = (z0 + z1) / 2 + tx * off;
    b.add(BOX, xform([mx, h / 2, mz], [0, Math.atan2(tx, tz), 0], [0.3, h, len]), GM.kerb);
  }
}

function dashes(b, pts, M, dash, gap, w, lift, off = 0) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const tx = (x1 - x0) / len, tz = (z1 - z0) / len;
    for (let s = dash / 2; s < len; s += dash + gap) {
      const l = Math.min(dash, len - s + dash / 2);
      const mx = x0 + tx * s - tz * off, mz = z0 + tz * s + tx * off;
      b.add(BOX, xform([mx, lift, mz], [0, Math.atan2(tx, tz), 0], [w, 0.02, l]), M);
    }
  }
}

/* ============================================================ */

function buildWorld(gl, roster) {
  const rnd = mulberry(20260922);
  const W = new ChunkedBuilder(64);        // opaque statics
  const Fo = new ChunkedBuilder(64);       // alpha-tested foliage
  const Gl = new Builder(4096);            // transparent panes
  const Wa = new Builder(4096);            // water
  const lights = [], colliders = [], obbs = [], slabs = [], spots = [], stations = [], vaults = [];
  const map = { buildings: [], trees: [], lawns: [], beds: [], labels: [], water: [] };
  const vehicles = [];
  const H = groundH;

  const addObbs = (list) => { for (const o of list || []) { obbs.push(o); map.buildings.push(o); } };
  const addTree = (x, z, kind, s) => { const t = tree(W, Fo, x, z, H(x, z), kind, rnd, s); colliders.push({ x, z, r: t.r }); map.trees.push({ x, z, r: t.crown, kind }); return t; };
  const addLamp = (x, z, style) => { lights.push(lampPost(W.at(x, z), x, z, H(x, z), style)); colliders.push({ x, z, r: 0.25 }); };
  const seats = [];         // benches and café chairs people can sit on
  const addBench = (x, z, yaw) => { bench(W.at(x, z), x, z, H(x, z), yaw); colliders.push({ x, z, r: 0.75 }); seats.push({ kind: 'bench', x, z, yaw }); };
  const lawn = (pts, stripeYaw = 0) => {
    const prev = W.frame;
    W.frame = uvFrame(0, 0, stripeYaw, 0);
    W.fan(pts, GM.lawn, H, 0.078);
    W.frame = prev;
    map.lawns.push(pts);
  };
  const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const circle = (cx, cz, r, n = 24, a0 = 0, a1 = TAU) => { const o = []; for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * (i / n); o.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } return o; };

  /* ---------------- ground, water ---------------- */
  terrainChunks(W);
  horizonSkirt(W.at(0, 0));
  // the river: a strip of water from bank to bank
  {
    const pts = [];
    for (let z = -WORLD_HALF - 60; z <= WORLD_HALF + 60; z += 6) pts.push([riverX(z), z]);
    Wa.ribbon(pts, 26, GM.water, () => WATER_Y, 0, false);
    map.water.push({ pts, w: 22 });
    // reeds and a stone revetment along the banks
    for (const s of [-1, 1]) for (let z = -WORLD_HALF; z < WORLD_HALF; z += 2.2) {
      if (Math.abs(z) < 8 || Math.abs(z - 115) < 6) continue;
      const x = riverX(z) + s * (11.4 + rnd() * 0.8);
      if (rnd() < 0.55) {
        const M = mat(TX.WILLOW, [0.8, 0.85, 0.55], { kind: KIND.LEAF, uv: 'prim' });
        leafCard(Fo.at(x, z), x, WATER_Y + 0.6, z, 1.3 + rnd() * 0.5, rnd() * TAU, 0.1, M, [x, WATER_Y - 2, z], [0.7 + rnd() * 0.2, 0.75, 0.45]);
      }
    }
  }

  /* ---------------- roads, pavements, paths ---------------- */
  const PATHS = campusPaths();
  for (const p of PATHS) W.ribbon(p.pts, p.w, p.M, H, p.lift, p.kind !== 'road' && p.kind !== 'lane');
  // kerbs and markings on the roads
  const town = PATHS[0].pts, east = PATHS[1].pts, lane = PATHS[2].pts;
  kerbAlong(W.at(0, 205), [[-WORLD_HALF - 40, 205], [WORLD_HALF + 40, 205]], 5.1, 0.16);
  kerbAlong(W.at(0, 205), [[-WORLD_HALF - 40, 205], [WORLD_HALF + 40, 205]], -5.1, 0.16);
  dashes(W, [[-WORLD_HALF - 40, 205], [WORLD_HALF + 40, 205]], GM.paint, 3, 6, 0.12, 0.07);
  dashes(W, [[-WORLD_HALF - 40, 205], [WORLD_HALF + 40, 205]], GM.yellow, 400, 0, 0.1, 0.07, 4.6);
  dashes(W, [[-WORLD_HALF - 40, 205], [WORLD_HALF + 40, 205]], GM.yellow, 400, 0, 0.1, 0.07, -4.6);
  dashes(W, [[262, -WORLD_HALF - 40], [262, 199]], GM.paint, 3, 6, 0.12, 0.07);
  dashes(W, lane, GM.paint, 2, 4, 0.1, 0.07);
  // zebra crossing where the avenue meets the street
  for (let i = -4; i <= 4; i++) W.add(BOX, xform([i * 1.1, 0.07, 205], [0, 0, 0], [0.55, 0.02, 9]), GM.paint);

  /* ---------------- the Great Court ---------------- */
  W.frame = null;
  W.fan(rect(-42, -42, 42, 42), GM.flag, H, 0.035);
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const pts = [[sx * 3.2, sz * 31], [sx * 31, sz * 31], [sx * 31, sz * 3.2]];
    const a0 = Math.atan2(sz * 3.2, sx * 10.3), a1 = Math.atan2(sz * 10.3, sx * 3.2);
    for (let i = 0; i <= 8; i++) { const t = i / 8; const a = a0 + (a1 - a0) * t; pts.push([Math.cos(a) * 10.8, Math.sin(a) * 10.8]); }
    const P = sx * sz > 0 ? pts.slice().reverse() : pts;
    lawn(P, sx > 0 ? 0 : Math.PI / 2);
    // stone edging around each lawn
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (len < 0.05) continue;
      W.add(BOX, xform([(a[0] + c[0]) / 2, 0.06, (a[1] + c[1]) / 2], [0, Math.atan2(c[0] - a[0], c[1] - a[1]), 0], [0.25, 0.1, len]), GM.edging);
    }
  }
  const fo = fountain(W.at(0, 0), 0, 0, 0.04);
  colliders.push({ x: 0, z: 0, r: fo.r });
  map.labels.push({ x: 0, z: 0, text: 'GREAT COURT', size: 1.1 });
  // benches and lamps around the court
  for (const [x, z, yaw] of [[-20, 36, Math.PI], [20, 36, Math.PI], [-20, -36, 0], [20, -36, 0], [-36, -18, Math.PI / 2], [-36, 18, Math.PI / 2], [37, -18, -Math.PI / 2], [37, 18, -Math.PI / 2]]) addBench(x, z, yaw);
  for (const [x, z] of [[-33, -33], [33, -33], [-33, 33], [33, 33], [-9, -9], [9, -9], [-9, 9], [9, 9]]) addLamp(x, z);

  // north: the library, a classical range with a portico and a dome
  const lib = building(W, {
    x: 0, z: -50, yaw: 0, w: 72, d: 16, storeys: 3, sh: 4.4, plinth: 1.2, wall: MAT.ashlarW, trim: MAT.ashlar,
    win: { style: 'sash', w: 1.6, h: 2.8, sill: 1.0, bay: 4.2, frame: 'surround' }, quoins: true,
    parapet: 1.0, doors: [{ side: 'front', at: 0.5, w: 2.4, h: 3.6 }],
    roof: { type: 'hip', pitch: 0.4, M: MAT.slate, overhang: 0.2, chimneys: 0 },
  }, rnd);
  addObbs(lib.colliders);
  portico(W, { x: 0, z: -39.5, yaw: 0, w: 18, d: 5, h: 11, base: 1.2 });
  obbs.push({ x: 0, z: -39.5, hw: 9.2, hd: 1.8, yaw: 0, y0: 0, h: 14 });
  slabs.push({ x: 0, z: -38.6, w: 18.4, d: 5.2, y: 1.2, ry: 0, h: 1.2 });
  for (let i = 0; i < 6; i++) slabs.push({ x: 0, z: -36 + i * 0.34, w: 17, d: 0.34, y: 1.2 - (i + 1) * 0.2, ry: 0, h: 0.4 });
  dome(W, 0, -50, lib.top + 0.3, 7.2, { drumH: 5.5 });
  map.labels.push({ x: 0, z: -50, text: 'LIBRARY', size: 0.9 });
  const synth = { x: 0, z: -33.5 };

  // south: the Great Gate — a turreted brick gatehouse between two ranges
  for (const sx of [-1, 1]) {
    const r = building(W, {
      x: sx * 25, z: 48, yaw: Math.PI, w: 34, d: 12, storeys: 3, sh: 3.6, plinth: 0.6, wall: MAT.brick, trim: MAT.ashlarW,
      win: { style: 'leaded', w: 1.3, h: 2.1, sill: 0.95, bay: 3.8 }, parapet: 1.2, crenel: true, bands: true, cornice: true,
      roof: { type: 'gable', pitch: 0.55, M: MAT.slate, overhang: 0.2, chimneys: 2 },
    }, rnd);
    addObbs(r.colliders);
  }
  const gate = tower(W, { x: 0, z: 48, yaw: Math.PI, w: 16, d: 15, h: 19, wall: MAT.brick, trim: MAT.ashlarW,
    turrets: true, turretR: 1.5, crenel: true, openings: 2, winW: 1.6, winH: 2.4,
    arch: { side: 'front', at: 0.5, w: 5.2, h: 6.8 } }, rnd);
  addObbs(gate.colliders);
  statue(W.at(-11, 38), -11, 38.2, 0, 0.3);
  obbs.push({ x: -11, z: 38.2, hw: 0.8, hd: 0.8, yaw: 0.3, y0: 0, h: 5 });
  map.labels.push({ x: 0, z: 55, text: 'GREAT GATE', size: 0.7 });

  // east: the chapel
  const ch = chapel(W, { x: 54, z: -3, yaw: -Math.PI / 2, w: 82, d: 16, h: 23.5 }, rnd);
  addObbs(ch.colliders.map((o) => Object.assign({}, o, { hw: o.hw + 1.8 })));
  map.labels.push({ x: 54, z: -3, text: 'CHAPEL', size: 0.8 });

  // west: a collegiate range with a clock tower and a passage to the Backs
  for (const [zc, w] of [[-23.5, 33], [21.5, 29]]) {
    const r = building(W, {
      x: -48, z: zc, yaw: Math.PI / 2, w, d: 12, storeys: 3, sh: 3.6, plinth: 0.6, wall: MAT.ashlar, trim: MAT.ashlarW,
      win: { style: 'leaded', w: 1.3, h: 2.1, sill: 0.95, bay: 3.6 }, bands: true,
      roof: { type: 'gable', pitch: 0.95, M: MAT.slate, overhang: 0.3, dormers: Math.round(w / 7), chimneys: 2 },
    }, rnd);
    addObbs(r.colliders);
  }
  const clock = tower(W, { x: -48, z: 0, yaw: Math.PI / 2, w: 14, d: 16, h: 24, wall: MAT.ashlar, trim: MAT.ashlarW,
    crenel: false, lantern: true, openings: 2, arch: { side: 'front', at: 0.5, w: 4.6, h: 6.2 } }, rnd);
  addObbs(clock.colliders);
  const clockFaces = [];
  for (const [dx, dz, yaw] of [[8.3, 0, Math.PI / 2], [-8.3, 0, -Math.PI / 2]]) clockFaces.push({ x: -48 + dx, y: clock.top - 3.2, z: dz, yaw, r: 2.1 });
  map.labels.push({ x: -48, z: 0, text: 'CLOCK TOWER', size: 0.6 });

  /* ---------------- the Backs, the river, the bridges ---------------- */
  lawn(rect(-206, -58, -64, -2.6), 0.35);
  lawn(rect(-206, 2.6, -64, 58), 0.35);
  for (let x = -70; x > -205; x -= 14) for (const s of [-1, 1]) { addTree(x, s * 8.5, 'lime', 0.95); if ((x / 14 | 0) % 2 === 0) addLamp(x - 7, s * 4); }
  for (const [x, z, k] of [[-160, -40, 'plane'], [-120, 38, 'oak'], [-185, 32, 'beech'], [-95, -36, 'gold'], [-150, 46, 'plane'], [-180, -30, 'oak'], [-128, -46, 'rust']]) addTree(x, z, k, 1.1);
  for (let z = -170; z < 180; z += 20 + rnd() * 12) for (const s of [-1, 1]) {
    if (Math.abs(z) < 14 || Math.abs(z - 115) < 12) continue;
    const x = riverX(z) + s * (14.5 + rnd() * 3);
    addTree(x, z, rnd() < 0.7 ? 'willow' : 'plane', 0.9 + rnd() * 0.25);
  }
  for (let z = -160; z < 170; z += 26) addBench(-208.5, z, Math.PI / 2);
  // the stone bridge on the Backs avenue
  {
    const x0 = riverX(0) - 17, x1 = riverX(0) + 17, n = 17;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = lerp(x0, x1, t), y = 0.25 + Math.sin(t * Math.PI) * 1.3;
      const bw = (x1 - x0) / n;
      W.add(BOX, xform([x, y - 0.3, 0], [0, 0, 0], [bw + 0.02, 0.6, 5.2]), MAT.ashlarW);
      for (const s of [-1, 1]) W.add(BOX, xform([x, y + 0.45, s * 2.75], [0, 0, 0], [bw + 0.02, 0.95, 0.4]), MAT.ashlarW);
      slabs.push({ x, z: 0, w: bw + 0.1, d: 5.0, y, ry: 0, h: 0.6 });
    }
    // the arch beneath
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * (i / 10), x = riverX(0) + Math.cos(a) * 10.5, y = WATER_Y + Math.sin(a) * 2.4;
      W.add(BOX, xform([x, y - 0.4, 0], [0, 0, a - Math.PI / 2], [1.2, 0.9, 5.4]), MAT.ashlar);
    }
    for (const s of [-1, 1]) for (const e of [0, 1]) W.add(SPHERE_LO, xform([e ? x1 : x0, 1.35, s * 2.75], [0, 0, 0], [0.55, 0.55, 0.55]), MAT.ashlarW);
    map.labels.push({ x: riverX(0), z: -9, text: 'BRIDGE', size: 0.5 });
  }
  // the Mathematical Bridge: a timber truss of tangents
  {
    const zc = 115, x0 = riverX(zc) - 15, x1 = riverX(zc) + 15, n = 15;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = lerp(x0, x1, t), y = 0.2 + Math.sin(t * Math.PI) * 1.6;
      W.add(BOX, xform([x, y - 0.12, zc], [0, 0, 0], [(x1 - x0) / n + 0.02, 0.2, 3.4]), MAT.timber);
      slabs.push({ x, z: zc, w: (x1 - x0) / n + 0.1, d: 3.2, y, ry: 0, h: 0.4 });
    }
    for (const s of [-1, 1]) {
      const zs = zc + s * 1.8;
      for (let i = 0; i <= 10; i++) {
        const a0 = Math.PI * (i / 10);
        const px = riverX(zc) + Math.cos(a0) * 14.5, py = 0.2 + Math.sin(a0) * 3.4;
        strut(W.at(px, zs), [px, py, zs], [px - Math.sin(a0) * 2.4, py + Math.cos(a0) * 2.4 * 0.4, zs], 0.16, MAT.timber);
        strut(W.at(px, zs), [px, py, zs], [px, 0.2 + Math.sin(a0) * 1.6 + 0.1, zs], 0.14, MAT.timber);
        if (i < 10) {
          const a1 = Math.PI * ((i + 1) / 10);
          strut(W.at(px, zs), [px, py, zs], [riverX(zc) + Math.cos(a1) * 14.5, 0.2 + Math.sin(a1) * 3.4, zs], 0.14, MAT.timber);
        }
      }
    }
    map.labels.push({ x: riverX(zc), z: zc - 8, text: 'MATHEMATICAL BRIDGE', size: 0.5 });
  }
  // punts at the landing stage
  W.add(BOX, xform([-223, -0.15, 60], [0, 0, 0], [3.2, 0.3, 14]), MAT.timber);
  slabs.push({ x: -223, z: 60, w: 3.2, d: 14, y: 0.0, ry: 0, h: 0.4 });
  for (let i = 0; i < 4; i++) punt(W.at(-227, 54 + i * 3), riverX(54 + i * 3) + 4 + (i % 2) * 0.6, 54 + i * 3.1, WATER_Y - 0.05, Math.PI / 2 + (rnd() - 0.5) * 0.1);
  // boathouse
  {
    const r = building(W, { x: -196, z: 88, yaw: -Math.PI / 2, w: 16, d: 9, storeys: 2, sh: 3.4, plinth: 0.4, wall: MAT.timber, trim: MAT.paint,
      win: { style: 'sash', w: 1.3, h: 2.0, sill: 0.9, bay: 3.2 }, bands: false, cornice: false,
      roof: { type: 'gable', pitch: 0.8, M: MAT.clay, overhang: 0.6, chimneys: 1 } }, rnd);
    addObbs(r.colliders);
    map.labels.push({ x: -196, z: 88, text: 'BOATHOUSE', size: 0.5 });
  }

  /* ---------------- departments ---------------- */
  const deptBuild = {};
  const forecourt = (d, r, M) => { W.frame = null; W.fan(circle(d.cx, d.cz, r, 40), M, H, 0.06); };

  // Foundry Hall — Victorian brick, a pinnacled entrance tower, Newton's apple tree
  {
    const D = DEPT.foundry, d = DISTRICTS[0];
    forecourt(d, 13, GM.flag);
    lawn(circle(d.cx, d.cz, 6.5, 28), D.yaw);
    const r = building(W, { x: D.bx, z: D.bz, yaw: D.yaw, w: 52, d: 14, storeys: 3, sh: 4.0, plinth: 0.8, wall: MAT.brick, trim: MAT.ashlarW,
      win: { style: 'sash', w: 1.3, h: 2.5, sill: 0.95, bay: 3.6, frame: 'surround' }, quoins: true, cornice: false,
      roof: { type: 'gable', pitch: 1.0, M: MAT.slate, overhang: 0.45, dormers: 6, chimneys: 3 } }, rnd);
    addObbs(r.colliders);
    const F = r.frame;
    const tp = F.P(0, 0, 9.5);
    const tw = tower(W, { x: tp[0], z: tp[2], yaw: D.yaw, w: 7.5, d: 6, h: 18, wall: MAT.brick, trim: MAT.ashlarW, crenel: false,
      pinnacles: true, spire: 7, openings: 1, doors: [{ side: 'front', at: 0.5, w: 2.2, h: 3.4 }] }, rnd);
    addObbs(tw.colliders);
    deptBuild.foundry = { door: tw.doors[0], frame: F };
    addTree(d.cx, d.cz, 'apple');
    map.labels.push({ x: D.bx, z: D.bz, text: 'FOUNDRY HALL', size: 0.8, col: d.accent });
  }
  // The Observatory — a white classical block on a hill, three copper domes
  {
    const D = DEPT.observatory, d = DISTRICTS[1];
    const y0 = H(D.bx, D.bz);
    forecourt(d, 14, GM.gravel);
    const r = building(W, { x: D.bx, z: D.bz, yaw: D.yaw, y0, w: 26, d: 16, storeys: 2, sh: 5.0, plinth: 1.2, wall: MAT.ashlarW, trim: MAT.ashlar,
      win: { style: 'sash', w: 1.5, h: 3.0, sill: 1.0, bay: 4.2, frame: 'surround' }, parapet: 1.0, quoins: true,
      doors: [{ side: 'front', at: 0.5, w: 2.2, h: 3.6 }], roof: { type: 'flat', M: MAT.lead } }, rnd);
    addObbs(r.colliders);
    const F = r.frame;
    const pp = F.P(0, 0, 10.5);
    portico(W, { x: pp[0], z: pp[2], yaw: D.yaw, y0, cols: 4, w: 12, d: 4.6, h: 9.2, base: 1.2 });
    dome(W, D.bx, D.bz, y0 + r.top + 0.25, 5.2, { drumH: 3.6 });
    for (const s of [-1, 1]) {
      const wp = F.P(s * 20, 0, -1);
      const wng = building(W, { x: wp[0], z: wp[2], yaw: D.yaw, y0: H(wp[0], wp[2]), w: 12, d: 12, storeys: 1, sh: 5.4, plinth: 1.0, wall: MAT.ashlarW, trim: MAT.ashlar,
        win: { style: 'sash', w: 1.4, h: 2.8, sill: 1.0, bay: 4, frame: 'surround' }, parapet: 0.8, roof: { type: 'flat', M: MAT.lead } }, rnd);
      addObbs(wng.colliders);
      dome(W, wp[0], wp[2], H(wp[0], wp[2]) + wng.top + 0.2, 3.3, { drumH: 1.8, lantern: false, windows: 0 });
    }
    deptBuild.observatory = { door: r.doors[0], frame: F };
    map.labels.push({ x: D.bx, z: D.bz, text: 'OBSERVATORY', size: 0.8, col: d.accent });
  }
  // The Helix Building — Edwardian brick with a Victorian glasshouse and botanic beds
  {
    const D = DEPT.helix, d = DISTRICTS[2];
    forecourt(d, 13, GM.gravel);
    const r = building(W, { x: D.bx, z: D.bz, yaw: D.yaw, w: 46, d: 15, storeys: 3, sh: 4.0, plinth: 0.8, wall: MAT.brick, trim: MAT.ashlarW,
      win: { style: 'sash', w: 1.4, h: 2.4, sill: 0.95, bay: 3.8, frame: 'surround' }, quoins: true,
      doors: [{ side: 'front', at: 0.5, w: 2.4, h: 3.4 }],
      roof: { type: 'hip', pitch: 0.7, M: MAT.clay, overhang: 0.4, dormers: 0, chimneys: 2 } }, rnd);
    addObbs(r.colliders);
    const F = r.frame;
    const gp = F.P(40, 0, 4);
    const gh = glasshouse(W, Gl, { x: gp[0], z: gp[2], yaw: D.yaw, w: 30, d: 12, wallH: 3.2 });
    addObbs(gh.colliders);
    // palms and ferns inside the glasshouse
    for (let i = 0; i < 5; i++) { const p = F.P(30 + i * 5, 0, 4 + (i % 2 ? 2 : -2)); tree(W, Fo, p[0], p[2], 0.3, 'birch', rnd, 0.8); }
    // botanic beds along the approach
    for (let i = 0; i < 4; i++) {
      const p = F.P(-18 + i * 12, 0, 18), q = F.P(-14 + i * 12, 0, 22);
      W.frame = uvFrame(0, 0, D.yaw); W.fan([F.P(-18 + i * 12, 0, 17), F.P(-12 + i * 12, 0, 17), F.P(-12 + i * 12, 0, 21), F.P(-18 + i * 12, 0, 21)].map((v) => [v[0], v[2]]), GM.beds, H, 0.12);
      map.beds.push([p[0], p[2]]); void q;
    }
    W.frame = null;
    deptBuild.helix = { door: r.doors[0], frame: F, glass: gp };
    map.labels.push({ x: D.bx, z: D.bz, text: 'HELIX BUILDING', size: 0.8, col: d.accent });
  }
  // Lattice Laboratory — a 1960s ribbon-window block, a rock garden, the lattice sculpture
  {
    const D = DEPT.lattice, d = DISTRICTS[3];
    forecourt(d, 14, GM.paver);
    const r = modernBlock(W, { x: D.bx, z: D.bz, yaw: D.yaw, w: 58, d: 16, storeys: 4, sh: 3.6, style: 'ribbon',
      wall: mat(TX.BRICK, [0.72, 0.62, 0.55], { rough: 0.9, tile: 2 }), doors: [{ side: 'front', at: 0.5 }], plant: [8, 0, 10, 6] }, rnd);
    addObbs(r.colliders);
    // the lattice: a cubic crystal in steel and glass beads
    const sx = d.cx, sz = d.cz, g = 1.8, y0 = 1.6;
    const beadM = mat(0, d.rgb.map((c) => c * 0.8), { rough: 0.2, metal: 0.3 });
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) {
      const p = [sx + (i - 1) * g, y0 + j * g, sz + (k - 1) * g];
      W.add(SPHERE_LO, xform(p, [0, 0, 0], [0.45, 0.45, 0.45]), beadM);
      if (i < 2) strut(W.at(sx, sz), p, [p[0] + g, p[1], p[2]], 0.06, PM.steel);
      if (j < 2) strut(W.at(sx, sz), p, [p[0], p[1] + g, p[2]], 0.06, PM.steel);
      if (k < 2) strut(W.at(sx, sz), p, [p[0], p[1], p[2] + g], 0.06, PM.steel);
    }
    W.add(BOX, xform([sx, 0.4, sz], [0, 0.3, 0], [5, 0.8, 5]), MAT.concrete);
    colliders.push({ x: sx, z: sz, r: 3.6 });
    // boulders of the rock garden
    for (let i = 0; i < 9; i++) {
      const a = rnd() * TAU, rr = 9 + rnd() * 4, bx = sx + Math.cos(a) * rr, bz = sz + Math.sin(a) * rr, s = 0.8 + rnd() * 1.1;
      W.add(SPHERE_LO, xform([bx, s * 0.25, bz], [rnd(), rnd() * TAU, rnd()], [s * 1.4, s, s * 1.2]), mat(TX.CONCRETE, [0.7 + rnd() * 0.2, 0.68, 0.64], { uv: 'local', tile: 1.5 }));
      colliders.push({ x: bx, z: bz, r: s * 0.7 });
    }
    deptBuild.lattice = { door: r.doors[0], frame: r.frame };
    map.labels.push({ x: D.bx, z: D.bz, text: 'LATTICE LAB', size: 0.8, col: d.accent });
  }
  // The Engine House — glass and timber fins, a green roof, a Victorian engine chimney
  {
    const D = DEPT.engine, d = DISTRICTS[4];
    forecourt(d, 15, GM.paver);
    const r = modernBlock(W, { x: D.bx, z: D.bz, yaw: D.yaw, w: 44, d: 18, storeys: 3, sh: 3.6, style: 'curtain', fins: 1.2,
      wall: MAT.concrete, green: true, doors: [{ side: 'front', at: 0.5 }] }, rnd);
    addObbs(r.colliders);
    const F = r.frame;
    const cp = F.P(-30, 0, 2);
    // the old chimney: tapering brick shaft, corbelled crown
    for (let i = 0; i < 10; i++) {
      const s = 3.0 - i * 0.12;
      W.add(BOX, xform([cp[0], i * 3.2 + 1.6, cp[2]], [0, D.yaw, 0], [s, 3.2, s]), MAT.brick);
    }
    W.add(BOX, xform([cp[0], 32.5, cp[2]], [0, D.yaw, 0], [2.4, 0.6, 2.4]), MAT.ashlarW);
    W.add(BOX, xform([cp[0], 33.2, cp[2]], [0, D.yaw, 0], [2.0, 0.8, 2.0]), MAT.brick);
    obbs.push({ x: cp[0], z: cp[2], hw: 1.6, hd: 1.6, yaw: D.yaw, y0: 0, h: 34 });
    // an external stair up to the green roof
    const st = F.P(24, 0, 0);
    for (let i = 0; i < 18; i++) {
      const p = F.P(23.2 + 1.3, 0, 7 - i * 0.8);
      W.add(BOX, xform([p[0], (i + 1) * 0.6 - 0.3, p[2]], [0, D.yaw, 0], [2.2, 0.6, 0.8]), MAT.concrete);
      slabs.push({ x: p[0], z: p[2], w: 2.2, d: 0.8, y: (i + 1) * 0.6, ry: D.yaw, h: 0.6 });
    }
    const rp = F.P(0, 0, 0);
    slabs.push({ x: rp[0], z: rp[2], w: 43, d: 17, y: 11.1, ry: D.yaw, h: 0.6 });
    void st;
    for (let i = 0; i < 6; i++) { const p = F.P(-14 + i * 5.5, 0, 16); addTree(p[0], p[2], 'birch', 0.9); }
    deptBuild.engine = { door: r.doors[0], frame: F };
    map.labels.push({ x: D.bx, z: D.bz, text: 'ENGINE HOUSE', size: 0.8, col: d.accent });
  }

  /* ---------------- the café, the pavilion, the car park ---------------- */
  {
    const r = building(W, { x: -32, z: 115, yaw: Math.PI / 2, w: 22, d: 10, storeys: 2, sh: 3.6, plinth: 0.4, wall: MAT.render, trim: MAT.paint,
      win: { style: 'sash', w: 1.4, h: 2.3, sill: 0.9, bay: 3.4, frame: 'surround' }, doors: [{ side: 'front', at: 0.5, w: 1.8, h: 2.9 }],
      roof: { type: 'hip', pitch: 0.65, M: MAT.clay, overhang: 0.5, chimneys: 2 } }, rnd);
    addObbs(r.colliders);
    W.frame = null; W.fan(rect(-20, 106, -8, 124), GM.setts, H, 0.06);
    for (let i = 0; i < 6; i++) {
      const chairs = cafeSet(W.at(-14, 115), -17 + (i % 2) * 6, 108.5 + Math.floor(i / 2) * 6, 0.06, rnd, i % 3 ? [0.86, 0.82, 0.74] : [0.55, 0.2, 0.18]);
      for (const ch of chairs) seats.push({ kind: 'cafe', table: i, ...ch });
    }
    map.labels.push({ x: -32, z: 115, text: 'THE BUTTERY (CAFÉ)', size: 0.55 });
  }
  {
    const r = building(W, { x: 0, z: -192, yaw: Math.PI, w: 22, d: 9, storeys: 1, sh: 4.2, plinth: 0.6, wall: MAT.timber, trim: MAT.paint,
      win: { style: 'sash', w: 1.6, h: 2.4, sill: 0.8, bay: 3.6 }, bands: false, cornice: false,
      roof: { type: 'gable', pitch: 0.6, M: MAT.clay, overhang: 1.6, chimneys: 1 } }, rnd);
    addObbs(r.colliders);
    lawn(rect(-120, -300, 120, -205), 0);
    W.fan(rect(-10, -262, 10, -238), mat(TX.GRASS, [1.25, 1.2, 0.9], { rough: 0.9, tile: 3 }), H, 0.07);
    map.labels.push({ x: 0, z: -250, text: 'PLAYING FIELDS', size: 0.8 });
  }
  W.frame = null;
  W.fan(rect(196, 90, 240, 130), GM.road, H, 0.05);
  map.lawns.push(null);
  for (let i = 0; i < 8; i++) {
    const x = 200 + i * 5, z = 97 + (i % 2) * 26;
    const cols = [[0.6, 0.08, 0.06], [0.12, 0.18, 0.35], [0.75, 0.75, 0.72], [0.1, 0.1, 0.1], [0.3, 0.35, 0.3]];
    placeMesh(W, carMesh, x, z, 0.05, (i % 2) ? Math.PI : 0, cols[i % cols.length]);
    obbs.push({ x, z, hw: 0.95, hd: 2.1, yaw: 0, y0: 0, h: 1.5 });
  }
  map.labels.push({ x: 218, z: 110, text: 'CAR PARK', size: 0.5 });

  /* ---------------- the town street ---------------- */
  {
    let x = -140;
    const palette = [[0.95, 0.9, 0.78], [0.88, 0.8, 0.72], [0.8, 0.86, 0.9], [0.95, 0.85, 0.75], [0.85, 0.9, 0.8]];
    const shopCols = [[0.12, 0.2, 0.16], [0.35, 0.08, 0.08], [0.08, 0.1, 0.2], [0.18, 0.18, 0.18], [0.45, 0.3, 0.1]];
    let k = 0;
    while (x < 140) {
      const w = 7 + Math.floor(rnd() * 4);
      if (Math.abs(x + w / 2) < 8) { x += 16; continue; }
      const brick = rnd() < 0.45;
      const r = building(W, {
        x: x + w / 2, z: 220, yaw: Math.PI, w, d: 12, storeys: 3 + (rnd() < 0.35 ? 1 : 0), sh: 3.2, plinth: 0.25,
        wall: brick ? (rnd() < 0.5 ? MAT.brick : MAT.brickY) : tint(MAT.render, palette[k % palette.length]), trim: MAT.paint,
        win: { style: 'sash', w: 1.15, h: 2.0, sill: 0.9, bay: 2.9, frame: brick ? 'none' : 'surround' },
        shop: shopCols[k % shopCols.length], cornice: !brick, bands: false,
        roof: { type: 'gable', pitch: 0.75 + rnd() * 0.25, M: rnd() < 0.7 ? MAT.slate : MAT.clay, overhang: 0.25, dormers: rnd() < 0.4 ? 1 : 0, chimneys: 2 },
      }, rnd);
      addObbs(r.colliders);
      x += w + 0.02; k++;
    }
    // the campus boundary: a stone wall with railings, gaps at the gates
    for (const [a, b2] of [[-150, -101], [-89, -8], [8, 89], [101, 150]]) {
      const len = b2 - a, mx = (a + b2) / 2;
      W.add(BOX, xform([mx, 0.4, 195.8], [0, 0, 0], [len, 0.8, 0.5]), GM.wall);
      W.add(BOX, xform([mx, 0.85, 195.8], [0, 0, 0], [len, 0.1, 0.6]), GM.wall);
      for (let px = a + 0.4; px < b2; px += 0.35) W.add(BOX, xform([px, 1.5, 195.8], [0, 0, 0], [0.03, 1.3, 0.03]), PM.iron);
      W.add(BOX, xform([mx, 2.1, 195.8], [0, 0, 0], [len, 0.05, 0.05]), PM.iron);
      obbs.push({ x: mx, z: 195.8, hw: len / 2, hd: 0.4, yaw: 0, y0: 0, h: 2.2 });
    }
    // gate piers either side of the avenue
    for (const s of [-1, 1]) {
      W.add(BOX, xform([s * 7.5, 1.6, 195.8], [0, 0, 0], [1.2, 3.2, 1.2]), GM.wall);
      W.add(SPHERE_LO, xform([s * 7.5, 3.6, 195.8], [0, 0, 0], [0.8, 0.8, 0.8]), GM.wall);
      obbs.push({ x: s * 7.5, z: 195.8, hw: 0.7, hd: 0.7, yaw: 0, y0: 0, h: 4 });
    }
    for (let px = -300; px < 300; px += 22) { if (Math.abs(px) > 12) addTree(px + rnd() * 4, 191.5 - rnd() * 2, rnd() < 0.8 ? 'plane' : 'lime', 0.95); }
    for (let px = -310; px < 310; px += 30) { addLamp(px, 199.9); addLamp(px + 15, 212.8); }
    for (const x0 of [-60, -30, 40, 70, 120]) {
      const cols = [[0.6, 0.08, 0.06], [0.12, 0.18, 0.35], [0.75, 0.75, 0.72], [0.1, 0.1, 0.1], [0.28, 0.4, 0.3], [0.55, 0.5, 0.42]];
      placeMesh(W, carMesh, x0, 208.6, 0.05, Math.PI / 2, cols[Math.floor(rnd() * cols.length)]);
      obbs.push({ x: x0, z: 208.6, hw: 2.1, hd: 0.95, yaw: 0, y0: 0, h: 1.5 });
    }
    phoneBox(W, 12, 199.3, 0.16, Math.PI);
    obbs.push({ x: 12, z: 199.3, hw: 0.55, hd: 0.55, yaw: 0, y0: 0, h: 3 });
    postBox(W.at(-12, 199.5), -12, 199.5, 0.16);
    colliders.push({ x: -12, z: 199.5, r: 0.35 });
    map.labels.push({ x: 0, z: 222, text: 'KING\'S PARADE', size: 0.7 });
    // distant town: rooftops and two spires beyond the street
    for (let i = 0; i < 26; i++) {
      const bx = -300 + i * 24 + rnd() * 6, bz = 250 + rnd() * 60, bh = 8 + rnd() * 8;
      W.add(BOX, xform([bx, bh / 2, bz], [0, rnd() * 0.3, 0], [14 + rnd() * 8, bh, 12]), rnd() < 0.5 ? MAT.brick : tint(MAT.render, palette[i % 5]));
      W.add(TRI, xform([bx, bh + 2.2, bz], [0, rnd() * 0.3, Math.PI / 2], [4.4, 16, 13]), MAT.slate);
    }
    for (const [sx, sz, sh] of [[-120, 300, 44], [150, 320, 52]]) {
      W.add(BOX, xform([sx, sh * 0.3, sz], [0, 0, 0], [7, sh * 0.6, 7]), MAT.ashlar);
      W.add(pCyl(8, false, true, 0.02, 0.5), xform([sx, sh * 0.6 + sh * 0.2, sz], [0, 0, 0], [6, sh * 0.4, 6]), MAT.lead);
    }
  }

  /* ---------------- planting and lamps along the paths ---------------- */
  for (let z = 64; z < 190; z += 10) for (const s of [-1, 1]) addTree(s * 7.5, z, 'lime', 0.9);
  for (let z = 66; z < 190; z += 20) for (const s of [-1, 1]) addLamp(s * 3.6, z + 5);
  for (let i = 3; i < PATHS.length; i++) {
    const p = PATHS[i];
    if (p.kind !== 'path') continue;
    let acc = 0;
    for (let k = 0; k < p.pts.length - 1; k++) {
      const [x0, z0] = p.pts[k], [x1, z1] = p.pts[k + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      for (let s = 11; s < len; s += 24) {
        acc++;
        const t = s / len, x = lerp(x0, x1, t), z = lerp(z0, z1, t);
        const nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
        if (Math.abs(x) < 46 && Math.abs(z) < 46) continue;
        if (Math.abs(x) < 10 && z > 56) continue;
        addLamp(x + nx * (p.w / 2 + 0.7), z + nz * (p.w / 2 + 0.7));
        if (acc % 2 === 0) addBench(x - nx * (p.w / 2 + 1.2), z - nz * (p.w / 2 + 1.2), Math.atan2(nx, nz) + Math.PI);
      }
    }
  }
  for (let t = 0; t < lane.length - 1; t++) {
    const [x0, z0] = lane[t], [x1, z1] = lane[t + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    for (let s = 18; s < len; s += 36) {
      const x = lerp(x0, x1, s / len), z = lerp(z0, z1, s / len);
      const nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
      addLamp(x + nx * 4.4, z + nz * 4.4, 'modern');
    }
  }
  // scattered campus trees, clear of buildings, roads and paths
  const clearOf = (x, z, r) => {
    if (Math.abs(x) < 64 && Math.abs(z) < 64) return false;
    if (inWater(x, z) || Math.abs(x - riverX(z)) < 16) return false;
    for (const o of obbs) {
      const dx = x - o.x, dz = z - o.z, c = Math.cos(o.yaw), s = Math.sin(o.yaw);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) < o.hw + r && Math.abs(lz) < o.hd + r) return false;
    }
    for (const p of PATHS) for (let k = 0; k < p.pts.length - 1; k++) {
      const [x0, z0] = p.pts[k], [x1, z1] = p.pts[k + 1];
      const vx = x1 - x0, vz = z1 - z0, L2 = vx * vx + vz * vz || 1;
      const t = clamp(((x - x0) * vx + (z - z0) * vz) / L2, 0, 1);
      if (Math.hypot(x - (x0 + vx * t), z - (z0 + vz * t)) < p.w / 2 + r) return false;
    }
    for (const d of DISTRICTS) if (Math.hypot(x - d.cx, z - d.cz) < 16) return false;
    for (const c of colliders) if (Math.hypot(x - c.x, z - c.z) < c.r + r) return false;
    return true;
  };
  const kinds = ['plane', 'lime', 'oak', 'plane', 'beech', 'gold', 'lime', 'rust', 'oak', 'yew', 'birch'];
  let placed = 0;
  for (let tries = 0; tries < 2600 && placed < 150; tries++) {
    const x = (rnd() * 2 - 1) * (WORLD_HALF - 20), z = (rnd() * 2 - 1) * (WORLD_HALF - 20);
    if (z > 185 && z < 230) continue;
    if (z < -196 && z > -304 && Math.abs(x) < 124) continue;
    if (!clearOf(x, z, 3.5)) continue;
    addTree(x, z, kinds[Math.floor(rnd() * kinds.length)], 0.85 + rnd() * 0.35);
    placed++;
  }
  // a tree line around the playing fields and along the far edges
  for (let x = -140; x <= 140; x += 12) addTree(x + rnd() * 3, -310 + rnd() * 4, rnd() < 0.5 ? 'lime' : 'plane', 1.1);
  for (let z = -300; z < 190; z += 16) addTree(-318 + rnd() * 4, z, 'oak', 1.05);
  for (let z = -300; z < 190; z += 16) addTree(290 + rnd() * 6, z, rnd() < 0.5 ? 'lime' : 'oak', 1.0);
  // hedges framing the department forecourts
  for (const d of DISTRICTS) {
    const D = DEPT[d.id];
    const pts = [];
    for (let i = 0; i <= 10; i++) { const a = D.yaw + Math.PI + (i / 10 - 0.5) * 1.5; pts.push([d.cx + Math.sin(a) * 17, d.cz + Math.cos(a) * 17]); }
    hedge(W, pts, 1.1, 0.9, H);
  }

  /* ---------------- ivy on the older walls ---------------- */
  {
    const ivy = mat(TX.HEDGE, [0.9, 1.0, 0.85], { uv: 'local', tile: 1.4, rough: 0.9 });
    const climb = (F, lx, w, h, side) => {
      const lz = side * (F.depth / 2 + 0.12);
      for (let i = 0; i < 5; i++) {
        const ww = w * (1 - i * 0.16), hh = h * (0.45 + 0.55 * ((i * 7) % 5) / 4);
        const p = F.frame.P(lx + (rnd() - 0.5) * w * 0.3, 0, lz);
        W.add(BOX, xform([p[0], hh / 2, p[2]], [0, F.frame.yaw, 0], [ww, hh, 0.22 + i * 0.03]), ivy);
      }
    };
    const fb = deptBuild.foundry; fb.depth = 14;
    climb(fb, -18, 7, 9, 1); climb(fb, 16, 6, 11, 1);
    const hb = deptBuild.helix; hb.depth = 15;
    climb(hb, -14, 6, 8, 1); climb(hb, 20, 5, 10, -1);
  }

  /* ---------------- stations: where the scientists stand ---------------- */
  for (const d of DISTRICTS) {
    const D = DEPT[d.id];
    const people = roster.filter((p) => p.district === d.id);
    const n = people.length;
    // an arc around the forecourt, facing its centre, open toward the approach path
    const face = Math.atan2(-D.cx, -D.cz);    // from the court toward the forecourt, reversed
    people.forEach((p, i) => {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const a = D.yaw + (t - 0.5) * 2.3;
      const r = 9.5 + (i % 2) * 1.6;
      const x = d.cx - Math.sin(a) * r, z = d.cz - Math.cos(a) * r;
      const yaw = Math.atan2(d.cx - x, d.cz - z);
      stations.push({ id: p.id, x, z, y: H(x, z), yaw, district: d.id, accent: d.rgb, accent2: d.rgb2 });
      W.add(pCyl(24), xform([x, H(x, z) + 0.07, z], [0, 0, 0], [1.8, 0.08, 1.8]), MAT.ashlarW);
    });
    void face;
  }

  /* ---------------- vaults: each department's front door ---------------- */
  for (const d of DISTRICTS) {
    const B = deptBuild[d.id];
    const door = B.door || { x: d.cx, z: d.cz, yaw: DEPT[d.id].yaw };
    const need = roster.filter((p) => p.district === d.id).length;
    vaults.push({ district: d.id, x: door.x, z: door.z, y: H(door.x, door.z), yaw: door.yaw, need });
  }

  /* ---------------- marginalia sites ---------------- */
  const spot = (district, kind, x, z, y) => {
    const yy = y == null ? H(x, z) : y;
    W.add(pPrism(6), xform([x, yy + 0.45, z], [0, 0, 0], [0.62, 0.9, 0.62]), MAT.ashlarW);
    W.add(pPrism(6), xform([x, yy + 0.93, z], [0, 0, 0], [0.74, 0.06, 0.74]), MAT.timber);
    spots.push({ district, kind, x, y: yy + 1.45, z });
  };
  {
    const Fd = deptBuild.foundry.frame;
    const q = (lx, lz) => Fd.P(lx, 0, lz);
    spot('foundry', 'apple tree', DISTRICTS[0].cx + 3, DISTRICTS[0].cz - 3);
    let p = q(-20, 12); spot('foundry', 'bike shed', p[0], p[2]);
    p = q(26, -12); spot('foundry', 'rear garden', p[0], p[2]);
    spot('foundry', 'café terrace', -14, 121);
    const Fo2 = deptBuild.observatory.frame;
    const o = (lx, lz) => Fo2.P(lx, 0, lz);
    p = o(-24, 14); spot('observatory', 'hilltop', p[0], p[2]);
    p = o(24, 14); spot('observatory', 'meridian line', p[0], p[2]);
    p = o(0, -16); spot('observatory', 'behind the domes', p[0], p[2]);
    spot('observatory', 'Backs', -150, -20);
    spot('observatory', 'riverside', -210, -90);
    const Fh = deptBuild.helix.frame;
    const h = (lx, lz) => Fh.P(lx, 0, lz);
    p = h(36, 4); spot('helix', 'glasshouse', p[0], p[2]);
    p = h(46, 4); spot('helix', 'glasshouse', p[0], p[2]);
    p = h(-6, 19); spot('helix', 'botanic beds', p[0], p[2]);
    p = h(18, 19); spot('helix', 'botanic beds', p[0], p[2]);
    p = h(-26, -12); spot('helix', 'service yard', p[0], p[2]);
    spot('helix', 'playing fields', 60, -214);
    const Fl = deptBuild.lattice.frame;
    const l = (lx, lz) => Fl.P(lx, 0, lz);
    spot('lattice', 'rock garden', DISTRICTS[3].cx - 6, DISTRICTS[3].cz + 10);
    p = l(-32, 6); spot('lattice', 'loading bay', p[0], p[2]);
    spot('lattice', 'car park', 206, 110);
    spot('lattice', 'chapel yard', 72, -36);
    const Fe = deptBuild.engine.frame;
    const e = (lx, lz) => Fe.P(lx, 0, lz);
    p = e(-10, 0); spot('engine', 'green roof', p[0], p[2], 11.1);
    p = e(12, -4); spot('engine', 'green roof', p[0], p[2], 11.1);
    p = e(-30, 6); spot('engine', 'engine chimney', p[0], p[2]);
    spot('engine', 'bus stop', 60, 198.2);
    spot('engine', 'king\'s parade', -80, 198.2);
  }

  /* ---------------- bikes to borrow, carts to drive ---------------- */
  const rack = (x, z, yaw, n, rideable) => {
    bikeRack(W.at(x, z), x, z, H(x, z), yaw, n);
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * 0.9;
      const bx = x + Math.cos(yaw) * o, bz = z - Math.sin(yaw) * o;
      if (i < rideable) vehicles.push({ type: 'bike', x: bx, z: bz, yaw: yaw + Math.PI / 2 });
      else placeMesh(W, bicycleMesh, bx, bz, H(bx, bz), yaw + Math.PI / 2, [[0.1, 0.1, 0.12], [0.5, 0.1, 0.08], [0.1, 0.3, 0.5], [0.8, 0.8, 0.78]][i % 4], { basket: i % 3 === 0 });
    }
    obbs.push({ x, z, hw: n * 0.45 + 0.3, hd: 0.8, yaw, y0: 0, h: 1.2 });
  };
  rack(12, 62, 0, 6, 2);
  rack(-12, 62, 0, 5, 1);
  rack(-56, -32, Math.PI / 2, 4, 1);
  for (const d of DISTRICTS) { const D = DEPT[d.id]; rack(d.cx + Math.sin(D.yaw + 1.6) * 15, d.cz + Math.cos(D.yaw + 1.6) * 15, D.yaw, 5, 2); }
  rack(-8, 124, Math.PI / 2, 4, 1);
  vehicles.push({ type: 'cart', x: 225, z: 100, yaw: 0 }, { type: 'cart', x: 230, z: 100, yaw: 0 },
    { type: 'cart', x: 70, z: 45, yaw: Math.PI / 2 }, { type: 'cart', x: -70, z: -60, yaw: 0 });

  /* ---------------- finish ---------------- */
  W.frame = null;
  const mesh = W.upload(gl);
  const foliage = Fo.upload(gl);
  const glass = Gl.n ? Gl.upload(gl) : null;
  const water = Wa.upload(gl);
  for (const o of obbs) colliders.push({ obb: true, ...o });
  let verts = 0; for (const m of mesh) verts += m.verts; let fverts = 0; for (const m of foliage) fverts += m.verts;
  console.info(`[campus] ${mesh.length} chunks, ${verts} verts; foliage ${fverts} verts; ${colliders.length} colliders; ${lights.length} lights`);

  return {
    chunks: mesh, foliage, glass, water, spinners: [], lights, stations, vaults, spots, slabs, pads: [], zips: [], pillars: [],
    colliders, obbs, paths: PATHS, map, vehicles, synth, clockFaces, districts: DISTRICTS, spawn: { x: -6, z: 30, yaw: 0.35 }, seats,
  };
}

/* the old API: colliders are built with the world now */
function buildColliders(world) { return world.colliders; }
