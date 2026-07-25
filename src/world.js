/* ============================================================
   world.js — procedural station: atrium + 5 discipline districts,
   linked by radial causeways and an outer ring walkway.
   Everything is baked into one static mesh plus a list of spinners.
   ============================================================ */

const R_ATRIUM   = 26;
const R_DISTRICT = 110;   // distance from origin to a district centre
const R_PLATFORM = 34;    // district platform radius
const R_RING     = 100;   // outer ring walkway centreline
const W_RING     = 10;
const W_CAUSEWAY = 11;
const CAUSE_IN   = 20;
const CAUSE_OUT  = 78;

const DISTRICTS = [
  { id: 'foundry',     name: 'THE FOUNDRY',     sub: 'Forces, Matter & Energy',
    accent: '#ff6a3c', accent2: '#ffc24a', floor: '#2e1d1c', glyph: '⚛' },
  { id: 'observatory', name: 'THE OBSERVATORY', sub: 'Cosmos & Spacetime',
    accent: '#57d6ff', accent2: '#b08cff', floor: '#182136', glyph: '✦' },
  { id: 'helix',       name: 'THE HELIX',       sub: 'Life, Heredity & Medicine',
    accent: '#3affb0', accent2: '#9dff62', floor: '#163026', glyph: '⌘' },
  { id: 'lattice',     name: 'THE LATTICE',     sub: 'Molecules, Materials & Earth',
    accent: '#ffc93d', accent2: '#ff7ad0', floor: '#2e271a', glyph: '⬢' },
  { id: 'engine',      name: 'THE ENGINE',      sub: 'Mind, Mathematics & Computation',
    accent: '#8aa4ff', accent2: '#aabbf0', floor: '#1d2236', glyph: '⌗' },
];

DISTRICTS.forEach((d, k) => {
  d.index = k;
  d.angle = (k / DISTRICTS.length) * TAU - Math.PI / 2;
  d.cx = Math.cos(d.angle) * R_DISTRICT;
  d.cz = Math.sin(d.angle) * R_DISTRICT;
  d.rgb = hex2rgb(d.accent);
  d.rgb2 = hex2rgb(d.accent2);
  d.floorRGB = hex2rgb(d.floor);
});

const GREY   = hex2rgb('#3c4250');
const GREY_D = hex2rgb('#22262f');
const GREY_L = hex2rgb('#6a7285');
const STEEL  = hex2rgb('#4d5566');
const GOLD   = hex2rgb('#ffd98a');
const WHITE  = hex2rgb('#e8eeff');

/* ---------- geometry helpers ---------- */
function disc(b, cx, cz, r, y, thick, color, glow = 0, seg = 64) {
  b.add(pCyl(seg), xform([cx, y - thick / 2, cz], [0, 0, 0], [r * 2, thick, r * 2]), color, glow);
}
function ringFlat(b, cx, cz, rOuter, rInner, y, color, glow = 0, seg = 72) {
  b.add(pRing(0.5 * rInner / rOuter, seg), xform([cx, y, cz], [0, 0, 0], [rOuter * 2, 1, rOuter * 2]), color, glow);
}
function box(b, pos, size, color, glow = 0, rot = [0, 0, 0]) {
  b.add(BOX, xform(pos, rot, size), color, glow);
}

/* railing along a straight run */
function railing(b, x0, z0, x1, z1, color, glow) {
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
  const n = Math.max(2, Math.round(len / 3.5));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    b.add(BOX, xform([x0 + dx * t, 0.52, z0 + dz * t], [0, 0, 0], [0.14, 1.04, 0.14]), GREY, 0);
  }
  const yaw = Math.atan2(dx, dz);
  b.add(BOX, xform([(x0 + x1) / 2, 1.0, (z0 + z1) / 2], [0, yaw, 0], [0.09, 0.09, len]), color, glow * 0.9);
  b.add(BOX, xform([(x0 + x1) / 2, 0.62, (z0 + z1) / 2], [0, yaw, 0], [0.05, 0.05, len]), color, glow * 0.4);
}

/* railing following a circular arc */
function arcRailing(b, cx, cz, r, a0, a1, color, glow, y = 0) {
  const steps = Math.max(3, Math.round((Math.abs(a1 - a0) * r) / 4));
  let px = cx + Math.cos(a0) * r, pz = cz + Math.sin(a0) * r;
  for (let i = 1; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps);
    const nx = cx + Math.cos(a) * r, nz = cz + Math.sin(a) * r;
    const mx = (px + nx) / 2, mz = (pz + nz) / 2;
    const len = Math.hypot(nx - px, nz - pz);
    const yaw = Math.atan2(nx - px, nz - pz);
    b.add(BOX, xform([mx, y + 1.0, mz], [0, yaw, 0], [0.09, 0.09, len * 1.02]), color, glow * 0.9);
    b.add(BOX, xform([px, y + 0.52, pz], [0, 0, 0], [0.14, 1.04, 0.14]), GREY, 0);
    px = nx; pz = nz;
  }
}

/* a floating platform slab: top surface, chamfer, deep skirt, underglow */
function platform(b, cx, cz, r, floorCol, accent, seg = 72) {
  disc(b, cx, cz, r, 0, 0.6, floorCol, 0.02, seg);
  b.add(pCyl(seg, false, false), xform([cx, -1.9, cz], [0, 0, 0], [r * 1.98, 3.0, r * 1.98]), GREY_D, 0);
  b.add(pCyl(seg, false, false), xform([cx, -5.4, cz], [0, 0, 0], [r * 1.80, 5.0, r * 1.80]), scalec(GREY_D, 0.7), 0);
  b.add(pCyl(seg, true, false), xform([cx, -9.6, cz], [0, 0, 0], [r * 1.35, 5.0, r * 1.35]), scalec(GREY_D, 0.5), 0);
  ringFlat(b, cx, cz, r * 0.995, r * 0.94, -0.32, accent, 0.75, seg);   // underglow lip
}

/* ============================================================ */

function buildWorld(gl, roster) {
  const b = new Builder();
  const spinners = [];
  const lights = [];
  const stations = [];
  const vaults = [];
  const rnd = mulberry(20260725);

  /* ================= ATRIUM ================= */
  platform(b, 0, 0, R_ATRIUM, hex2rgb('#202531'), GOLD, 80);
  ringFlat(b, 0, 0, R_ATRIUM - 0.6, R_ATRIUM - 1.6, 0.31, GOLD, 0.7, 80);
  ringFlat(b, 0, 0, 15.5, 14.4, 0.31, hex2rgb('#8fd8ff'), 0.9, 64);
  ringFlat(b, 0, 0, 8.2, 7.6, 0.31, hex2rgb('#8fd8ff'), 0.6, 48);

  // floor timeline: tick marks around the inner ring, dense = more recent
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * TAU;
    const long = i % 6 === 0;
    b.add(BOX, xform([Math.cos(a) * 11.8, 0.31, Math.sin(a) * 11.8], [0, -a, 0],
      [0.10, 0.02, long ? 2.6 : 1.3]), long ? GOLD : GREY_L, long ? 0.9 : 0.35);
  }

  // central spire — the Synthesis Terminal
  b.add(pCyl(8), xform([0, 0.5, 0], [0, 0, 0], [7.2, 1.0, 7.2]), hex2rgb('#2b2f3c'), 0);
  b.add(pCyl(8), xform([0, 1.15, 0], [0, Math.PI / 8, 0], [6.0, 0.3, 6.0]), hex2rgb('#3a3f50'), 0.05);
  ringFlat(b, 0, 0, 3.0, 2.55, 1.32, GOLD, 1.6, 40);
  b.add(pCyl(8), xform([0, 8, 0], [0, 0, 0], [1.5, 14, 1.5]), hex2rgb('#333949'), 0.03);
  b.add(pCyl(8, true, true, 0.5, 0.18), xform([0, 17.5, 0], [0, 0, 0], [3.4, 5.0, 3.4]), hex2rgb('#3d4356'), 0.05);
  b.add(SPHERE, xform([0, 21.5, 0], [0, 0, 0], [2.4, 2.4, 2.4]), GOLD, 1.9);
  lights.push({ pos: [0, 21.5, 0], col: GOLD, range: 46, intensity: 1.0 });
  lights.push({ pos: [0, 3, 0], col: hex2rgb('#8fd8ff'), range: 30, intensity: 0.7 });
  lights.push({ pos: [0, 15, 0], col: hex2rgb('#fff0c4'), range: 62, intensity: 0.55 });

  // armillary: three nested rings around the orb, each on its own axis
  [[0, 0, 6.5, 0.30], [Math.PI / 2.6, 0.4, 8.2, -0.22], [Math.PI / 1.9, 1.1, 10.0, 0.15]].forEach(([tilt, roll, rad, spd], i) => {
    const sb = new Builder();
    sb.add(pTorus(0.035, 64, 8), xform([0, 0, 0], [tilt, 0, roll], [rad, rad, rad]), i === 1 ? GOLD : hex2rgb('#9fe4ff'), 1.7);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU;
      const p = [Math.cos(a) * rad / 2, 0, Math.sin(a) * rad / 2];
      sb.add(SPHERE_LO, xform([p[0] * Math.cos(roll), p[0] * Math.sin(roll) + p[1], p[2] * Math.cos(tilt)],
        [0, 0, 0], [0.42, 0.42, 0.42]), GOLD, 1.9);
    }
    spinners.push({ mesh: sb.upload(gl), pivot: [0, 21.5, 0], speed: spd, tiltX: tilt * 0.35 });
  });

  // atrium perimeter railing — without it the walkable edge is an invisible wall
  for (let i = 0; i < 84; i++) {
    const a = (i / 84) * TAU;
    let skip = false;
    for (const d of DISTRICTS) {
      const dl = Math.abs(((a - d.angle + Math.PI * 3) % TAU) - Math.PI);
      if (dl < 0.30) skip = true;
    }
    if (skip) continue;
    const x = Math.cos(a) * 24.5, z = Math.sin(a) * 24.5;
    b.add(BOX, xform([x, 0.55, z], [0, a, 0], [0.16, 1.1, 0.16]), GREY, 0);
    b.add(BOX, xform([x, 1.05, z], [0, -a, 0], [0.1, 0.1, 1.95]), GOLD, 0.55);
  }

  // five gate arches, one aimed at each district
  DISTRICTS.forEach((d) => {
    const gx = Math.cos(d.angle) * (R_ATRIUM - 3.2), gz = Math.sin(d.angle) * (R_ATRIUM - 3.2);
    const yaw = -d.angle;
    for (const side of [-1, 1]) {
      const ox = Math.cos(d.angle + Math.PI / 2) * 4.6 * side;
      const oz = Math.sin(d.angle + Math.PI / 2) * 4.6 * side;
      b.add(BOX, xform([gx + ox, 3.6, gz + oz], [0, yaw, 0], [1.0, 7.2, 1.0]), hex2rgb('#2e3341'), 0);
      b.add(BOX, xform([gx + ox, 7.4, gz + oz], [0, yaw, 0], [1.3, 0.5, 1.3]), d.rgb, 1.3);
      b.add(BOX, xform([gx + ox, 3.6, gz + oz], [0, yaw, 0], [1.06, 5.4, 0.18]), d.rgb, 1.1);
    }
    b.add(BOX, xform([gx, 7.8, gz], [0, yaw, 0], [10.4, 0.8, 0.9]), hex2rgb('#333947'), 0.03);
    b.add(BOX, xform([gx, 7.25, gz], [0, yaw, 0], [9.4, 0.14, 0.24]), d.rgb, 1.6);
    lights.push({ pos: [gx, 6.5, gz], col: d.rgb, range: 22, intensity: 0.75 });
    d.gate = [gx, gz];
  });

  /* ================= CAUSEWAYS ================= */
  DISTRICTS.forEach((d) => {
    const dirx = Math.cos(d.angle), dirz = Math.sin(d.angle);
    const midR = (CAUSE_IN + CAUSE_OUT) / 2, len = CAUSE_OUT - CAUSE_IN;
    const yaw = -d.angle;
    b.add(BOX, xform([dirx * midR, -0.3, dirz * midR], [0, yaw, 0], [W_CAUSEWAY, 0.6, len]), hex2rgb('#222735'), 0.02);
    b.add(BOX, xform([dirx * midR, -1.6, dirz * midR], [0, yaw, 0], [W_CAUSEWAY - 1.6, 2.2, len - 1]), GREY_D, 0);
    // glowing centre strip + edge lines
    b.add(BOX, xform([dirx * midR, 0.015, dirz * midR], [0, yaw, 0], [0.5, 0.02, len - 2]), d.rgb, 0.9);
    for (const s of [-1, 1]) {
      const px = dirx * midR + Math.cos(d.angle + Math.PI / 2) * (W_CAUSEWAY / 2 - 0.35) * s;
      const pz = dirz * midR + Math.sin(d.angle + Math.PI / 2) * (W_CAUSEWAY / 2 - 0.35) * s;
      b.add(BOX, xform([px, 0.02, pz], [0, yaw, 0], [0.16, 0.02, len]), d.rgb, 0.6);
      railing(b,
        px + dirx * (-len / 2), pz + dirz * (-len / 2),
        px + dirx * (len / 2),  pz + dirz * (len / 2), d.rgb, 0.85);
    }
    // light posts
    const posts = 6;
    for (let i = 0; i < posts; i++) {
      const r = CAUSE_IN + 5 + (len - 10) * (i / (posts - 1));
      for (const s of [-1, 1]) {
        const px = dirx * r + Math.cos(d.angle + Math.PI / 2) * (W_CAUSEWAY / 2 + 0.2) * s;
        const pz = dirz * r + Math.sin(d.angle + Math.PI / 2) * (W_CAUSEWAY / 2 + 0.2) * s;
        b.add(pCyl(6), xform([px, 2.1, pz], [0, 0, 0], [0.22, 4.2, 0.22]), hex2rgb('#2a2f3b'), 0);
        b.add(SPHERE_LO, xform([px, 4.4, pz], [0, 0, 0], [0.40, 0.52, 0.40]), d.rgb, 1.35);
      }
      if (i % 2 === 0) lights.push({ pos: [dirx * r, 4.4, dirz * r], col: d.rgb, range: 20, intensity: 0.5 });
    }
  });

  /* ================= OUTER RING WALKWAY ================= */
  ringFlat(b, 0, 0, R_RING + W_RING / 2, R_RING - W_RING / 2, 0, hex2rgb('#20252f'), 0.02, 128);
  b.add(pCyl(128, false, false), xform([0, -1.2, 0], [0, 0, 0], [(R_RING + W_RING / 2) * 2, 2.4, (R_RING + W_RING / 2) * 2]), GREY_D, 0);
  b.add(pCyl(128, false, false), xform([0, -1.2, 0], [0, 0, 0], [(R_RING - W_RING / 2) * 2, 2.4, (R_RING - W_RING / 2) * 2]), GREY_D, 0);
  ringFlat(b, 0, 0, R_RING + W_RING / 2, R_RING + W_RING / 2 - 0.3, 0.02, hex2rgb('#7f8bb0'), 0.8, 128);
  ringFlat(b, 0, 0, R_RING - W_RING / 2 + 0.3, R_RING - W_RING / 2, 0.02, hex2rgb('#7f8bb0'), 0.8, 128);
  // ring railings on the outer edge only, skipping where districts meet it
  for (let k = 0; k < 5; k++) {
    const a0 = DISTRICTS[k].angle + 0.30, a1 = DISTRICTS[(k + 1) % 5].angle - 0.30;
    arcRailing(b, 0, 0, R_RING + W_RING / 2 - 0.4, a0, a1 < a0 ? a1 + TAU : a1, hex2rgb('#6f7ba0'), 0.7);
    arcRailing(b, 0, 0, R_RING - W_RING / 2 + 0.4, a0, a1 < a0 ? a1 + TAU : a1, hex2rgb('#6f7ba0'), 0.7);
  }
  // marker obelisks between districts
  for (let k = 0; k < 5; k++) {
    const a = DISTRICTS[k].angle + TAU / 10;
    const x = Math.cos(a) * R_RING, z = Math.sin(a) * R_RING;
    b.add(pPrism(6), xform([x, 3.2, z], [0, a, 0], [1.5, 6.4, 1.5]), hex2rgb('#262b36'), 0);
    b.add(pPrism(6), xform([x, 6.7, z], [0, a, 0], [0.9, 1.2, 0.9]), hex2rgb('#9fb4e8'), 1.6);
    lights.push({ pos: [x, 6.7, z], col: hex2rgb('#9fb4e8'), range: 24, intensity: 0.55 });
  }

  /* ================= DISTRICTS ================= */
  DISTRICTS.forEach((d) => {
    platform(b, d.cx, d.cz, R_PLATFORM, d.floorRGB, d.rgb, 80);
    ringFlat(b, d.cx, d.cz, R_PLATFORM - 1.0, R_PLATFORM - 2.0, 0.31, d.rgb, 0.65, 80);
    ringFlat(b, d.cx, d.cz, 24.4, 23.8, 0.31, d.rgb2, 0.7, 64);

    // perimeter railing, with a gap at the causeway mouth and at both ring crossings
    const gaps = [d.angle + Math.PI, d.angle + Math.PI * 0.62, d.angle - Math.PI * 0.62];
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * TAU;
      let skip = false;
      for (const g of gaps) {
        let dl = Math.abs(((a - g + Math.PI * 3) % TAU) - Math.PI);
        if (dl < 0.22) skip = true;
      }
      if (skip) continue;
      const x = d.cx + Math.cos(a) * (R_PLATFORM - 0.9), z = d.cz + Math.sin(a) * (R_PLATFORM - 0.9);
      b.add(BOX, xform([x, 0.55, z], [0, a, 0], [0.16, 1.1, 0.16]), GREY, 0);
      b.add(BOX, xform([x, 1.05, z], [0, -a, 0], [0.1, 0.1, 2.4]), d.rgb, 0.9);
    }

    // broad soft fill so the plaza floor reads without washing out the neon
    lights.push({ pos: [d.cx, 17, d.cz], col: mixc(d.rgb, [1, 1, 1], 0.45), range: 74, intensity: 0.58 });
    lights.push({ pos: [d.cx - Math.cos(d.angle) * 20, 9, d.cz - Math.sin(d.angle) * 20],
                  col: mixc(d.rgb2, [1, 1, 1], 0.3), range: 46, intensity: 0.36 });

    buildLandmark(b, spinners, lights, gl, d, rnd);

    // ---- scientist stations ----
    const people = roster.filter((p) => p.district === d.id);
    const n = people.length;
    const spread = 2.15;                     // radians of arc the stations occupy
    people.forEach((p, i) => {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const a = d.angle + (t - 0.5) * spread;
      const sr = 21.5 + (i % 2) * 2.6;       // stagger so nobody hides behind anyone
      const x = d.cx + Math.cos(a) * sr, z = d.cz + Math.sin(a) * sr;
      const yaw = Math.atan2(d.cx - x, d.cz - z);
      buildStation(b, lights, x, z, yaw, d, p);
      stations.push({ id: p.id, x, z, yaw, district: d.id, accent: d.rgb, accent2: d.rgb2 });
    });

    // ---- insight vault ----
    const vx = d.cx + Math.cos(d.angle) * 27.5, vz = d.cz + Math.sin(d.angle) * 27.5;
    const vyaw = Math.atan2(d.cx - vx, d.cz - vz);
    buildVault(b, spinners, lights, gl, vx, vz, vyaw, d, n);
    vaults.push({ district: d.id, x: vx, z: vz, yaw: vyaw, need: n });
  });

  /* ================= DISTANT SCENERY ================= */
  for (let i = 0; i < 90; i++) {
    const a = rnd() * TAU;
    const r = 210 + rnd() * 520;
    const y = -50 - rnd() * 130;
    const s = 8 + rnd() * 40;
    const c = mixc(hex2rgb('#1a2233'), hex2rgb('#2c2038'), rnd());
    b.add(rnd() > 0.5 ? OCT : BOX,
      xform([Math.cos(a) * r, y, Math.sin(a) * r], [rnd() * 0.6, rnd() * TAU, rnd() * 0.6],
        [s, s * (0.4 + rnd()), s]), c, 0);
  }
  for (let i = 0; i < 46; i++) {              // drifting motes of light
    const a = rnd() * TAU, r = 130 + rnd() * 260;
    b.add(SPHERE_LO, xform([Math.cos(a) * r, -20 + rnd() * 70, Math.sin(a) * r], [0, 0, 0], [1.0, 1.0, 1.0]),
      mixc(hex2rgb('#6fd6ff'), hex2rgb('#ffb680'), rnd()), 1.5);
  }

  return { mesh: b.upload(gl), spinners, lights, stations, vaults, districts: DISTRICTS };
}

/* ---------- a scientist's station: dais, backdrop, plinth ---------- */
function buildStation(b, lights, x, z, yaw, d, p) {
  b.add(pCyl(32), xform([x, 0.18, z], [0, 0, 0], [7.0, 0.36, 7.0]), hex2rgb('#20242f'), 0);
  b.add(pCyl(32), xform([x, 0.40, z], [0, 0, 0], [6.2, 0.14, 6.2]), hex2rgb('#2a2f3c'), 0.04);
  ringFlat(b, x, z, 3.35, 2.95, 0.48, d.rgb, 0.50, 40);
  ringFlat(b, x, z, 2.2, 2.05, 0.48, d.rgb2, 0.30, 32);

  // backdrop fin: a curved wall behind the figure
  const bx = x - Math.sin(yaw) * 3.9, bz = z - Math.cos(yaw) * 3.9;
  b.add(BOX, xform([bx, 2.9, bz], [0, yaw, 0], [7.2, 5.8, 0.35]), hex2rgb('#12151d'), 0.01);
  b.add(BOX, xform([bx, 5.9, bz], [0, yaw, 0], [7.6, 0.3, 0.6]), d.rgb, 0.8);
  for (const s of [-1, 1]) b.add(BOX, xform([bx + Math.cos(yaw) * 2.45 * s, 2.9,
    bz - Math.sin(yaw) * 2.45 * s], [0, yaw, 0], [0.18, 5.2, 0.5]), d.rgb, 0.6);
  for (const s of [-1, 1]) {
    b.add(BOX, xform([bx + Math.cos(yaw) * 3.4 * s, 2.9, bz - Math.sin(yaw) * 3.4 * s], [0, yaw, 0],
      [0.4, 5.8, 0.7]), hex2rgb('#1a1e28'), 0);
  }
  // era tag: historical stations get a stone plinth, contemporary get a floating slab
  if (p.era === 'contemporary') {
    b.add(BOX, xform([x + Math.sin(yaw + 1.5) * 3.0, 1.4, z + Math.cos(yaw + 1.5) * 3.0], [0, yaw, 0.12],
      [1.5, 0.09, 1.0]), d.rgb2, 1.5);
  } else {
    b.add(pPrism(6), xform([x + Math.sin(yaw + 1.5) * 3.0, 0.75, z + Math.cos(yaw + 1.5) * 3.0], [0, yaw, 0],
      [1.2, 1.5, 1.2]), hex2rgb('#333a47'), 0.05);
  }
  lights.push({ pos: [x, 2.9, z], col: mixc(d.rgb, [1, 1, 1], 0.55), range: 15, intensity: 0.75 });
}

/* ---------- the district vault ---------- */
function buildVault(b, spinners, lights, gl, x, z, yaw, d, need) {
  b.add(BOX, xform([x, 4.4, z], [0, yaw, 0], [12.0, 8.8, 3.0]), hex2rgb('#232833'), 0);
  b.add(BOX, xform([x, 9.0, z], [0, yaw, 0], [13.0, 0.6, 3.8]), hex2rgb('#2f3543'), 0.04);
  b.add(BOX, xform([x + Math.sin(yaw) * 1.6, 3.6, z + Math.cos(yaw) * 1.6], [0, yaw, 0],
    [6.4, 7.0, 0.4]), hex2rgb('#151922'), 0);
  b.add(BOX, xform([x + Math.sin(yaw) * 1.75, 3.6, z + Math.cos(yaw) * 1.75], [0, yaw, 0],
    [5.6, 6.2, 0.2]), scalec(d.rgb, 0.20), 0.16);

  // one indicator lamp per scientist in the district
  for (let i = 0; i < need; i++) {
    const t = need === 1 ? 0 : (i / (need - 1) - 0.5);
    const px = x + Math.cos(yaw) * t * 4.4 + Math.sin(yaw) * 1.85;
    const pz = z - Math.sin(yaw) * t * 4.4 + Math.cos(yaw) * 1.85;
    b.add(SPHERE_LO, xform([px, 7.6, pz], [0, 0, 0], [0.42, 0.42, 0.42]), hex2rgb('#3a4152'), 0.1);
  }
  lights.push({ pos: [x, 6.0, z], col: d.rgb, range: 18, intensity: 0.4 });

  // slow-turning seal in front of the door
  const sb = new Builder();
  sb.add(pTorus(0.09, 40, 8), xform([0, 0, 0], [Math.PI / 2, 0, 0], [4.4, 4.4, 4.4]), d.rgb2, 1.4);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    sb.add(BOX, xform([Math.cos(a) * 1.9, Math.sin(a) * 1.9, 0], [0, 0, a], [0.9, 0.14, 0.14]), d.rgb2, 1.2);
  }
  spinners.push({
    mesh: sb.upload(gl), pivot: [x + Math.sin(yaw) * 2.1, 3.6, z + Math.cos(yaw) * 2.1],
    speed: 0.12, spinZ: true, yawFix: yaw,
  });
}

/* ---------- per-district signature megastructure ---------- */
function buildLandmark(b, spinners, lights, gl, d, rnd) {
  const cx = d.cx, cz = d.cz;

  if (d.id === 'foundry') {
    // tilted accelerator ring on pylons, with a reactor column at the hub
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const px = cx + Math.cos(a) * 11, pz = cz + Math.sin(a) * 11;
      b.add(pPrism(4), xform([px, 5.5, pz], [0, a, 0], [1.5, 11, 1.5]), hex2rgb('#3a2b26'), 0);
      strut(b, [px, 11, pz], [cx, 15.5, cz], 0.28, hex2rgb('#4a382f'), 0);
      lights.push({ pos: [px, 10, pz], col: d.rgb, range: 18, intensity: 0.4 });
    }
    b.add(pCyl(10), xform([cx, 8, cz], [0, 0, 0], [4.2, 16, 4.2]), hex2rgb('#33262168'.slice(0, 7)), 0.02);
    b.add(pCyl(10), xform([cx, 16.4, cz], [0, 0, 0], [5.6, 1.2, 5.6]), hex2rgb('#4d3a30'), 0.05);
    for (let i = 0; i < 5; i++) {
      b.add(pTorus(0.05, 28, 6), xform([cx, 3 + i * 3.1, cz], [0, 0, 0], [6.0 + Math.sin(i) * 0.6, 1, 6.0 + Math.sin(i) * 0.6]),
        i % 2 ? d.rgb2 : d.rgb, 0.95);
    }
    b.add(SPHERE, xform([cx, 18.6, cz], [0, 0, 0], [3.0, 3.0, 3.0]), d.rgb2, 1.5);
    lights.push({ pos: [cx, 18.6, cz], col: d.rgb2, range: 44, intensity: 1.0 });
    for (const [tilt, rad, spd] of [[0.32, 19, 0.22], [-0.22, 15.5, -0.34]]) {
      const sb = new Builder();
      sb.add(pTorus(0.028, 72, 8), xform([0, 0, 0], [tilt, 0, 0.1], [rad, rad, rad]), d.rgb, 1.05);
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * TAU;
        sb.add(BOX, xform([Math.cos(a) * rad / 2, Math.sin(a) * rad / 2 * Math.sin(tilt), Math.sin(a) * rad / 2 * Math.cos(tilt)],
          [0, -a, 0], [0.5, 0.22, 0.22]), d.rgb2, 1.2);
      }
      spinners.push({ mesh: sb.upload(gl), pivot: [cx, 14, cz], speed: spd });
    }
  }

  if (d.id === 'observatory') {
    // stepped drum + giant orrery
    b.add(pCyl(40), xform([cx, 1.4, cz], [0, 0, 0], [17, 2.8, 17]), hex2rgb('#1d2434'), 0.02);
    b.add(pCyl(40), xform([cx, 3.4, cz], [0, 0, 0], [13, 1.6, 13]), hex2rgb('#232b3e'), 0.03);
    ringFlat(b, cx, cz, 8.3, 7.9, 4.22, d.rgb, 1.3, 48);
    b.add(pCyl(24), xform([cx, 8, cz], [0, 0, 0], [2.0, 8, 2.0]), hex2rgb('#2b3348'), 0.03);
    b.add(SPHERE, xform([cx, 14, cz], [0, 0, 0], [3.6, 3.6, 3.6]), hex2rgb('#ffe9b0'), 2.3);
    lights.push({ pos: [cx, 14, cz], col: hex2rgb('#ffe0a0'), range: 46, intensity: 1.15 });
    const orbits = [[6.5, 0.10, 0.55, '#7fe0ff'], [9.5, -0.28, 0.34, '#b08cff'], [13.0, 0.42, -0.24, '#5ad4ff'], [16.5, -0.14, 0.17, '#ffa6e0']];
    orbits.forEach(([rad, tilt, spd, col], i) => {
      const c = hex2rgb(col);
      const sb = new Builder();
      sb.add(pTorus(0.020, 80, 6), xform([0, 0, 0], [tilt, 0, tilt * 0.5], [rad * 2, rad * 2, rad * 2]), c, 1.5);
      sb.add(SPHERE_LO, xform([rad * Math.cos(tilt * 0.5), rad * Math.sin(tilt), 0], [0, 0, 0],
        [0.9 + i * 0.16, 0.9 + i * 0.16, 0.9 + i * 0.16]), c, 2.2);
      if (i === 2) sb.add(pTorus(0.10, 24, 6), xform([rad * Math.cos(tilt * 0.5), rad * Math.sin(tilt), 0], [0.5, 0, 0.4], [2.4, 2.4, 2.4]), c, 1.8);
      spinners.push({ mesh: sb.upload(gl), pivot: [cx, 14, cz], speed: spd });
    });
    // radio dish off to one side
    const dx = cx + Math.cos(d.angle + 2.4) * 22, dz = cz + Math.sin(d.angle + 2.4) * 22;
    b.add(pCyl(12), xform([dx, 3, dz], [0, 0, 0], [1.6, 6, 1.6]), hex2rgb('#2b3243'), 0);
    b.add(pCyl(28, true, false, 0.5, 0.06), xform([dx, 8.4, dz], [0.55, 0.7, 0], [9, 3.4, 9]), hex2rgb('#39415a'), 0.06);
    b.add(pCyl(28, true, false, 0.5, 0.06), xform([dx, 8.2, dz], [0.55, 0.7, 0], [8.2, 3.0, 8.2]), scalec(d.rgb, 0.5), 0.5);
  }

  if (d.id === 'helix') {
    // twin DNA towers + greenhouse arches
    for (const side of [-1, 1]) {
      const hx = cx + Math.cos(d.angle + Math.PI / 2) * 9 * side;
      const hz = cz + Math.sin(d.angle + Math.PI / 2) * 9 * side;
      b.add(pCyl(20), xform([hx, 0.9, hz], [0, 0, 0], [7.0, 1.8, 7.0]), hex2rgb('#1b2b23'), 0.02);
      const turns = 3.1, steps = 46, H = 25, rad = 3.0;
      let prevA = null, prevB = null;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, a = t * turns * TAU * side, y = 1.8 + t * H;
        const pa = [hx + Math.cos(a) * rad, y, hz + Math.sin(a) * rad];
        const pb = [hx - Math.cos(a) * rad, y, hz - Math.sin(a) * rad];
        const col = mixc(d.rgb, d.rgb2, t);
        b.add(SPHERE_LO, xform(pa, [0, 0, 0], [0.62, 0.62, 0.62]), col, 1.7);
        b.add(SPHERE_LO, xform(pb, [0, 0, 0], [0.62, 0.62, 0.62]), mixc(d.rgb2, d.rgb, t), 1.7);
        if (prevA) { strut(b, prevA, pa, 0.16, col, 1.0); strut(b, prevB, pb, 0.16, col, 1.0); }
        if (i % 3 === 0) strut(b, pa, pb, 0.11, hex2rgb('#d9ffe8'), 0.9);
        prevA = pa; prevB = pb;
      }
      lights.push({ pos: [hx, 14, hz], col: d.rgb, range: 34, intensity: 0.9 });
      b.add(SPHERE, xform([hx, 27.5, hz], [0, 0, 0], [1.8, 1.8, 1.8]), d.rgb2, 2.2);
    }
    // arching glass ribs over the plaza
    for (let i = 0; i < 7; i++) {
      const t = i / 6, a = d.angle + Math.PI + (t - 0.5) * 1.5;
      const r0 = 15.5;
      const p0 = [cx + Math.cos(a) * r0, 0, cz + Math.sin(a) * r0];
      const p1 = [cx + Math.cos(a + Math.PI) * r0 * 0.5, 0, cz + Math.sin(a + Math.PI) * r0 * 0.5];
      const segs = 10;
      let prev = p0;
      for (let s = 1; s <= segs; s++) {
        const u = s / segs;
        const p = [lerp(p0[0], p1[0], u), Math.sin(u * Math.PI) * 12, lerp(p0[2], p1[2], u)];
        strut(b, prev, p, 0.17, mixc(hex2rgb('#2c4438'), d.rgb, 0.25), 0.28);
        prev = p;
      }
    }
  }

  if (d.id === 'lattice') {
    // a floating cubic crystal lattice, plus hex columns
    const N = 3, gap = 5.4, y0 = 8;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
      const px = cx + (i - 1) * gap, py = y0 + (j - 1) * gap, pz = cz + (k - 1) * gap;
      const c = mixc(d.rgb, d.rgb2, (i + j + k) / 6);
      b.add(SPHERE_LO, xform([px, py, pz], [0, 0, 0], [1.5, 1.5, 1.5]), c, 1.6);
      if (i < N - 1) strut(b, [px, py, pz], [px + gap, py, pz], 0.11, c, 0.8);
      if (j < N - 1) strut(b, [px, py, pz], [px, py + gap, pz], 0.11, c, 0.8);
      if (k < N - 1) strut(b, [px, py, pz], [px, py, pz + gap], 0.11, c, 0.8);
    }
    lights.push({ pos: [cx, y0, cz], col: d.rgb, range: 42, intensity: 0.8 });
    b.add(pCyl(24), xform([cx, 0.6, cz], [0, 0, 0], [13, 1.2, 13]), hex2rgb('#2a2317'), 0.02);
    ringFlat(b, cx, cz, 6.4, 6.0, 1.22, d.rgb2, 1.2, 40);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2;
      const px = cx + Math.cos(a) * 15.5, pz = cz + Math.sin(a) * 15.5;
      const h = 6 + (i % 3) * 3.5;
      b.add(pPrism(6), xform([px, h / 2, pz], [0, a, 0], [2.6, h, 2.6]), hex2rgb('#3a3120'), 0.03);
      b.add(pPrism(6, 0.06), xform([px, h + 1.6, pz], [0, a, 0], [2.6, 3.2, 2.6]), mixc(d.rgb, d.rgb2, (i % 3) / 2), 1.7);
    }
    const sb = new Builder();
    sb.add(pPrism(8, 0.05), xform([0, 2.4, 0], [0, 0, 0], [3.2, 4.8, 3.2]), d.rgb2, 2.0);
    sb.add(pPrism(8, 0.05), xform([0, -2.4, 0], [Math.PI, 0, 0], [3.2, 4.8, 3.2]), d.rgb, 2.0);
    spinners.push({ mesh: sb.upload(gl), pivot: [cx, y0, cz], speed: 0.3 });
  }

  if (d.id === 'engine') {
    // monolith grid + floating logic cubes
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const rr = 15 + (i % 2) * 3;
      const px = cx + Math.cos(a) * rr, pz = cz + Math.sin(a) * rr;
      const h = 9 + (i % 4) * 3.2;
      b.add(BOX, xform([px, h / 2, pz], [0, -a, 0], [3.6, h, 1.1]), hex2rgb('#1e2231'), 0.02);
      for (let r = 0; r < 5; r++) for (let c2 = 0; c2 < 3; c2++) {
        if (((i * 7 + r * 3 + c2 * 5) % 4) === 0) continue;
        b.add(BOX, xform([px + Math.cos(a + Math.PI / 2) * (c2 - 1) * 1.0 + Math.cos(a) * 0.58,
                          1.6 + r * (h - 2.6) / 4.4,
                          pz + Math.sin(a + Math.PI / 2) * (c2 - 1) * 1.0 + Math.sin(a) * 0.58],
          [0, -a, 0], [0.62, 0.34, 0.06]), (r + c2) % 3 ? d.rgb : d.rgb2, 1.05);
      }
      if (i % 3 === 0) lights.push({ pos: [px, h * 0.7, pz], col: d.rgb, range: 20, intensity: 0.5 });
    }
    b.add(pCyl(4), xform([cx, 0.8, cz], [0, Math.PI / 4, 0], [16, 1.6, 16]), hex2rgb('#1a1e2c'), 0.02);
    for (let i = 0; i < 5; i++) {
      const s = 5.5 - i * 0.8;
      const sb = new Builder();
      sb.add(BOX, xform([0, 0, 0], [0, 0, 0], [s, s, s]), i % 2 ? d.rgb2 : d.rgb, i === 0 ? 0.14 : 0.30);
      for (const e of cubeEdges(s / 2)) strut(sb, e[0], e[1], 0.09, hex2rgb('#dbe6ff'), 0.55);
      spinners.push({
        mesh: sb.upload(gl), pivot: [cx, 7 + i * 4.4, cz],
        speed: (i % 2 ? 0.24 : -0.31) * (1 + i * 0.15), tiltX: i * 0.2,
      });
    }
    lights.push({ pos: [cx, 16, cz], col: d.rgb2, range: 40, intensity: 0.6 });
  }
}

function cubeEdges(h) {
  const c = [[-h,-h,-h],[h,-h,-h],[h,-h,h],[-h,-h,h],[-h,h,-h],[h,h,-h],[h,h,h],[-h,h,h]];
  const pairs = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  return pairs.map(([a, b2]) => [c[a], c[b2]]);
}

/* ---------- navigation queries ---------- */
function isWalkable(x, z) {
  const r = Math.hypot(x, z);
  if (r <= R_ATRIUM - 1.2) return true;
  if (r >= R_RING - W_RING / 2 + 1.0 && r <= R_RING + W_RING / 2 - 1.0) return true;
  for (const d of DISTRICTS) {
    if (Math.hypot(x - d.cx, z - d.cz) <= R_PLATFORM - 1.6) return true;
    const along = x * Math.cos(d.angle) + z * Math.sin(d.angle);
    const perp  = -x * Math.sin(d.angle) + z * Math.cos(d.angle);
    if (along >= CAUSE_IN - 6 && along <= CAUSE_OUT + 2 && Math.abs(perp) <= W_CAUSEWAY / 2 - 1.1) return true;
  }
  return false;
}

/* solid props the player collides with (circles are plenty for this world) */
function buildColliders(world) {
  const c = [];
  c.push({ x: 0, z: 0, r: 4.4 });                                  // atrium spire base
  for (const d of DISTRICTS) {
    if (d.id === 'foundry')     c.push({ x: d.cx, z: d.cz, r: 5.0 });
    if (d.id === 'observatory') c.push({ x: d.cx, z: d.cz, r: 13.6 });
    if (d.id === 'helix') for (const s of [-1, 1]) c.push({
      x: d.cx + Math.cos(d.angle + Math.PI / 2) * 9 * s,
      z: d.cz + Math.sin(d.angle + Math.PI / 2) * 9 * s, r: 4.0 });
    if (d.id === 'lattice')     c.push({ x: d.cx, z: d.cz, r: 7.0 });
    if (d.id === 'engine')      c.push({ x: d.cx, z: d.cz, r: 9.0 });
  }
  for (const v of world.vaults) c.push({ x: v.x, z: v.z, r: 5.2 });
  for (const s of world.stations) c.push({ x: s.x, z: s.z, r: 1.15 });  // the figure itself
  return c;
}
