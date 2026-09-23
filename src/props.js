/* ============================================================
   props.js — street furniture and small things that make a place
   look lived in. Each call bakes into a (chunked) builder.
   ============================================================ */

const PM = {
  iron:   mat(0, [0.018, 0.02, 0.022], { rough: 0.5, metal: 0.05 }),     // black-painted cast iron
  green:  mat(0, [0.06, 0.16, 0.10], { rough: 0.45, metal: 0.3 }),
  red:    mat(0, [0.62, 0.05, 0.04], { rough: 0.35, metal: 0.1 }),
  steel:  mat(0, [0.55, 0.57, 0.6], { rough: 0.3, metal: 0.9 }),
  rubber: mat(0, [0.03, 0.03, 0.03], { rough: 0.8 }),
  lamp:   mat(0, [1.0, 0.78, 0.5], { kind: KIND.LAMP, glow: 1.4, rough: 0.2 }),
  glassL: mat(0, [0.16, 0.16, 0.15], { kind: KIND.LAMP, glow: 1.2, rough: 0.1 }),
  bench:  mat(TX.WOOD, [0.75, 0.6, 0.45], { uv: 'local', tile: 1, rough: 0.7 }),
  stone:  mat(TX.ASHLAR, [0.95, 0.92, 0.86], { uv: 'local', tile: 2, rough: 0.85 }),
  stoneF: mat(TX.ASHLAR, [0.95, 0.92, 0.86], { rough: 0.85, tile: 2 }),
  water:  mat(0, [0.05, 0.09, 0.08], { kind: KIND.WATER, rough: 0.05 }),
  bronze: mat(0, [0.22, 0.17, 0.10], { rough: 0.38, metal: 0.85 }),
  whiteP: mat(0, [0.85, 0.85, 0.82], { rough: 0.5 }),
  canvas: mat(TX.FABRIC, [0.9, 0.86, 0.78], { uv: 'local', tile: 0.5, rough: 0.9 }),
};

/* a Victorian cast-iron lamp; returns the light it casts after dark */
function lampPost(b, x, z, y0, style = 'victorian') {
  const H = style === 'modern' ? 5.2 : 4.1;
  if (style === 'modern') {
    b.add(pCyl(10), xform([x, y0 + H / 2, z], [0, 0, 0], [0.16, H, 0.16]), PM.steel);
    b.add(BOX, xform([x, y0 + H + 0.05, z], [0, 0, 0], [0.7, 0.1, 0.22]), PM.steel);
    b.add(BOX, xform([x, y0 + H - 0.01, z], [0, 0, 0], [0.6, 0.02, 0.16]), PM.lamp);
    return { pos: [x, y0 + H - 0.3, z], col: [1.0, 0.92, 0.8], range: 16, intensity: 0.8, night: true };
  }
  b.add(pPrism(8), xform([x, y0 + 0.45, z], [0, 0, 0], [0.42, 0.9, 0.42]), PM.iron);
  b.add(pCyl(10, true, true, 0.4, 0.5), xform([x, y0 + 0.95, z], [0, 0, 0], [0.3, 0.2, 0.3]), PM.iron);
  b.add(pCyl(10, false, false, 0.35, 0.5), xform([x, y0 + 2.4, z], [0, 0, 0], [0.18, 2.8, 0.18]), PM.iron);
  b.add(BOX, xform([x, y0 + 3.55, z], [0, 0, 0], [0.62, 0.05, 0.05]), PM.iron);      // ladder bar
  b.add(pCyl(8, true, true, 0.5, 0.35), xform([x, y0 + 3.75, z], [0, 0, 0], [0.34, 0.14, 0.34]), PM.iron);
  // lantern: glowing core in a four-sided cage
  b.add(pCyl(4, true, true, 0.5, 0.36), xform([x, y0 + 4.12, z], [0, Math.PI / 4, 0], [0.46, 0.62, 0.46]), PM.glassL);
  b.add(SPHERE_LO, xform([x, y0 + 4.08, z], [0, 0, 0], [0.16, 0.2, 0.16]), PM.lamp);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    b.add(BOX, xform([x + Math.cos(a) * 0.2, y0 + 4.12, z + Math.sin(a) * 0.2], [0, -a, 0.1], [0.03, 0.66, 0.03]), PM.iron);
  }
  b.add(pCyl(4, true, false, 0.05, 0.5), xform([x, y0 + 4.56, z], [0, Math.PI / 4, 0], [0.62, 0.3, 0.62]), PM.iron);
  b.add(SPHERE_LO, xform([x, y0 + 4.75, z], [0, 0, 0], [0.08, 0.1, 0.08]), PM.iron);
  return { pos: [x, y0 + 3.9, z], col: [1.0, 0.72, 0.42], range: 15, intensity: 0.85, night: true };
}

function bench(b, x, z, y0, yaw) {
  const P = (lx, ly, lz) => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), y0 + ly, z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
  for (let i = 0; i < 3; i++) b.add(BOX, xform(P(0, 0.44, -0.18 + i * 0.14), [0, yaw, 0], [1.8, 0.04, 0.11]), PM.bench);
  for (let i = 0; i < 2; i++) b.add(BOX, xform(P(0, 0.64 + i * 0.16, -0.3 - i * 0.03), [0.18, yaw, 0], [1.8, 0.1, 0.035]), PM.bench);
  for (const s of [-0.78, 0.78]) {
    b.add(BOX, xform(P(s, 0.22, 0.05), [0, yaw, 0], [0.06, 0.44, 0.07]), PM.iron);
    b.add(BOX, xform(P(s, 0.22, -0.25), [0, yaw, 0], [0.06, 0.44, 0.07]), PM.iron);
    b.add(BOX, xform(P(s, 0.62, -0.32), [0.2, yaw, 0], [0.06, 0.5, 0.06]), PM.iron);
    b.add(BOX, xform(P(s, 0.6, -0.08), [0, yaw, 0], [0.06, 0.05, 0.5]), PM.iron);
  }
  return { x, z, r: 0.7 };
}

function bollard(b, x, z, y0) {
  b.add(pCyl(10), xform([x, y0 + 0.45, z], [0, 0, 0], [0.22, 0.9, 0.22]), PM.iron);
  b.add(SPHERE_LO, xform([x, y0 + 0.9, z], [0, 0, 0], [0.24, 0.16, 0.24]), PM.iron);
  b.add(pCyl(10, false, false), xform([x, y0 + 0.72, z], [0, 0, 0], [0.235, 0.05, 0.235]), mat(0, [0.8, 0.7, 0.3], { rough: 0.3, metal: 0.8 }));
}

function bin(b, x, z, y0) {
  b.add(pCyl(12), xform([x, y0 + 0.5, z], [0, 0, 0], [0.55, 1.0, 0.55]), PM.green);
  b.add(pCyl(12), xform([x, y0 + 1.03, z], [0, 0, 0], [0.62, 0.08, 0.62]), PM.green);
}

function bikeRack(b, x, z, y0, yaw, n = 4) {
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2) * 0.9;
    const cx = x + Math.cos(yaw) * o, cz = z - Math.sin(yaw) * o;
    const ax = Math.sin(yaw) * 0.35, az = Math.cos(yaw) * 0.35;
    strut(b, [cx - ax, y0, cz - az], [cx - ax, y0 + 0.75, cz - az], 0.05, PM.steel);
    strut(b, [cx + ax, y0, cz + az], [cx + ax, y0 + 0.75, cz + az], 0.05, PM.steel);
    strut(b, [cx - ax, y0 + 0.75, cz - az], [cx + ax, y0 + 0.75, cz + az], 0.05, PM.steel);
  }
}

/* a bicycle mesh built around its own origin, facing +z; used static and ridden */
function bicycleMesh(b, col, o = {}) {
  const frame = mat(0, col, { rough: 0.35, metal: 0.5 });
  const W = 0.34;       // wheel radius
  const ax = [0, W, -0.52], fx = [0, W, 0.52];
  for (const c of [ax, fx]) {
    b.add(pTorus(0.07, 28, 6), xform(c, [0, 0, Math.PI / 2], [W * 2, W * 2, W * 2]), PM.rubber);
    for (let s = 0; s < 8; s++) {
      const a = (s / 8) * TAU;
      strut(b, c, [c[0], c[1] + Math.sin(a) * W * 0.92, c[2] + Math.cos(a) * W * 0.92], 0.012, PM.steel);
    }
  }
  const bb = [0, 0.3, 0], seat = [0, 0.86, -0.16], head = [0, 0.84, 0.36], bar = [0, 1.02, 0.34];
  strut(b, bb, seat, 0.045, frame);           // seat tube
  strut(b, bb, head, 0.05, frame);            // down tube
  strut(b, seat, head, 0.045, frame);         // top tube
  strut(b, bb, ax, 0.035, frame);             // chain stay
  strut(b, seat, ax, 0.03, frame);            // seat stay
  strut(b, head, fx, 0.04, frame);            // fork
  strut(b, head, bar, 0.04, frame);           // stem
  b.add(BOX, xform(bar, [0, 0, 0], [0.56, 0.035, 0.035]), PM.iron);
  b.add(BOX, xform([0, 0.9, -0.18], [0.1, 0, 0], [0.13, 0.05, 0.26]), PM.iron);   // saddle
  if (o.basket) b.add(BOX, xform([0, 0.86, 0.6], [0, 0, 0], [0.34, 0.24, 0.28]), mat(TX.WOOD, [0.7, 0.55, 0.35], { uv: 'local', tile: 0.5 }));
  if (o.crank !== false) {
    b.add(pCyl(12), xform(bb, [0, 0, Math.PI / 2], [0.2, 0.03, 0.2]), PM.steel);
  }
}

/* a small hatchback / saloon, origin at the ground centre, facing +z */
function carMesh(b, col, o = {}) {
  const L = o.len || 4.1, W = o.wid || 1.75, H = o.hgt || 1.45;
  const paint = mat(0, col, { rough: 0.22, metal: 0.55 });
  const glass = mat(0, [0.03, 0.035, 0.04], { rough: 0.05, metal: 0.3 });
  b.add(BOX, xform([0, 0.55, 0], [0, 0, 0], [W, 0.6, L]), paint);                       // body
  b.add(BOX, xform([0, 0.34, 0], [0, 0, 0], [W + 0.04, 0.2, L - 0.2]), PM.rubber);      // sills
  b.add(pCyl(4, true, true, 0.5 * 0.72, 0.5), xform([0, 1.1, -0.2], [0, Math.PI / 4, 0], [W * 1.27, 0.55, L * 0.72]), glass);   // glasshouse
  b.add(BOX, xform([0, 1.39, -0.25], [0, 0, 0], [W * 0.84, 0.05, L * 0.42]), paint);   // roof
  b.add(BOX, xform([0, 0.62, L / 2 + 0.01], [0, 0, 0], [W * 0.7, 0.14, 0.02]), mat(0, [1, 0.95, 0.85], { kind: KIND.LAMP, glow: 0.9 }));
  b.add(BOX, xform([0, 0.7, -L / 2 - 0.01], [0, 0, 0], [W * 0.7, 0.12, 0.02]), mat(0, [0.9, 0.08, 0.05], { kind: KIND.LAMP, glow: 0.8 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.add(pCyl(14), xform([sx * (W / 2 - 0.02), 0.33, sz * (L / 2 - 0.72)], [0, 0, Math.PI / 2], [0.64, 0.22, 0.64]), PM.rubber);
    b.add(pCyl(10), xform([sx * (W / 2 + 0.09), 0.33, sz * (L / 2 - 0.72)], [0, 0, Math.PI / 2], [0.38, 0.02, 0.38]), PM.steel);
  }
}

function placeMesh(b, fn, x, z, y0, yaw, ...args) {
  // build into a scratch builder at the origin, then bake it at (x, y0, z, yaw)
  const tmp = new Builder(512);
  fn(tmp, ...args);
  const m = xform([x, y0, z], [0, yaw, 0], [1, 1, 1]);
  const t = b.at ? b.at(x, z) : b;
  const V = tmp.v, n = tmp.n;
  t.reserve(n, tmp.ni);
  const base = t.n;
  for (let i = 0; i < n; i++) {
    const o = i * 16;
    const px = V[o], py = V[o + 1], pz = V[o + 2], nx = V[o + 3], ny = V[o + 4], nz = V[o + 5];
    const M = { col: [V[o + 6], V[o + 7], V[o + 8]], glow: V[o + 9], rough: V[o + 10], metal: V[o + 11], tex: V[o + 14], kind: V[o + 15] };
    t.vert(m[0] * px + m[8] * pz + m[12], py + m[13], m[2] * px + m[10] * pz + m[14],
      m[0] * nx + m[8] * nz, ny, m[2] * nx + m[10] * nz, M, V[o + 12], V[o + 13]);
  }
  for (let i = 0; i < tmp.ni; i++) t.i[t.ni++] = base + tmp.i[i];
}

function phoneBox(b, x, z, y0, yaw) {
  const F = new Frame(b.at ? b.at(x, z) : b, x, z, yaw, y0);
  F.box(0, 0.08, 0, 1.0, 0.16, 1.0, PM.stone);
  F.box(0, 1.35, 0, 0.9, 2.3, 0.9, PM.red);
  for (const [sx, sz, dy] of [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]]) {
    const cx = sx * 0.455, cz = sz * 0.455;
    const seed = Math.random();
    const W = mat(TX.SASH, [0.62, 0.06, 0.05], { kind: KIND.GLASS, uv: 'prim', rough: 0.4, glow: seed });
    const c = Math.cos(dy), s = Math.sin(dy);
    const P = (u, v) => F.P(cx + u * c * 0.33, v, cz - u * s * 0.33);
    F.b.quad(P(-1, 0.5), P(1, 0.5), P(1, 2.2), P(-1, 2.2), W, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    F.box(sx * 0.46, 2.36, sz * 0.46, sx ? 0.02 : 0.6, 0.12, sz ? 0.02 : 0.6, mat(0, [0.9, 0.9, 0.85], { kind: KIND.LAMP, glow: 0.8 }));
  }
  F.box(0, 2.55, 0, 1.0, 0.25, 1.0, PM.red);
  F.prim(pCyl(16, true, false), 0, 2.75, 0, 0.95, 0.18, 0.95, PM.red);
}

function postBox(b, x, z, y0) {
  b.add(pCyl(14), xform([x, y0 + 0.75, z], [0, 0, 0], [0.5, 1.5, 0.5]), PM.red);
  b.add(pCyl(14, true, false, 0.3, 0.5), xform([x, y0 + 1.58, z], [0, 0, 0], [0.58, 0.18, 0.58]), PM.red);
  b.add(pCyl(14), xform([x, y0 + 0.06, z], [0, 0, 0], [0.56, 0.12, 0.56]), PM.iron);
}

/* the Great Court fountain: octagonal basin, a canopy on eight columns */
function fountain(b, x, z, y0) {
  const R = 5.2;
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * TAU, a1 = ((i + 1) / 8) * TAU, am = (a0 + a1) / 2;
    const seg = 2 * R * Math.sin(Math.PI / 8);
    b.add(BOX, xform([x + Math.cos(am) * R * Math.cos(Math.PI / 8), y0 + 0.35, z + Math.sin(am) * R * Math.cos(Math.PI / 8)], [0, Math.PI / 2 - am, 0], [seg + 0.35, 0.7, 0.45]), PM.stoneF);
    b.add(BOX, xform([x + Math.cos(am) * R * Math.cos(Math.PI / 8), y0 + 0.74, z + Math.sin(am) * R * Math.cos(Math.PI / 8)], [0, Math.PI / 2 - am, 0], [seg + 0.5, 0.1, 0.6]), PM.stoneF);
  }
  b.add(pPrism(8), xform([x, y0 + 0.4, z], [0, Math.PI / 8, 0], [R * 2 - 0.5, 0.02, R * 2 - 0.5]), PM.water);
  // canopy
  const cr = 2.2;
  b.add(pPrism(8), xform([x, y0 + 0.9, z], [0, Math.PI / 8, 0], [cr * 2 + 0.6, 1.0, cr * 2 + 0.6]), PM.stoneF);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    b.add(pCyl(10), xform([x + Math.cos(a) * cr, y0 + 2.9, z + Math.sin(a) * cr], [0, 0, 0], [0.34, 3.2, 0.34]), PM.stoneF);
  }
  b.add(pPrism(8), xform([x, y0 + 4.75, z], [0, Math.PI / 8, 0], [cr * 2 + 0.9, 0.5, cr * 2 + 0.9]), PM.stoneF);
  b.add(pCyl(8, true, false, 0.05, 0.5), xform([x, y0 + 6.1, z], [0, Math.PI / 8, 0], [cr * 2 + 0.6, 2.2, cr * 2 + 0.6]), mat(TX.SEAM, [0.6, 0.62, 0.66], { uv: 'prim', tu: 6, tv: 2 }));
  b.add(SPHERE_LO, xform([x, y0 + 7.4, z], [0, 0, 0], [0.5, 0.5, 0.5]), mat(0, [0.9, 0.7, 0.3], { rough: 0.3, metal: 1 }));
  b.add(pCyl(10), xform([x, y0 + 1.9, z], [0, 0, 0], [0.9, 1.0, 0.9]), PM.stoneF);
  b.add(pCyl(12, true, true, 0.5, 0.3), xform([x, y0 + 2.5, z], [0, 0, 0], [1.6, 0.3, 1.6]), PM.stoneF);
  return { x, z, r: R + 0.2 };
}

/* a bronze figure on a stone plinth */
function statue(b, x, z, y0, yaw) {
  b.add(BOX, xform([x, y0 + 1.1, z], [0, yaw, 0], [1.4, 2.2, 1.4]), PM.stone);
  b.add(BOX, xform([x, y0 + 2.28, z], [0, yaw, 0], [1.6, 0.16, 1.6]), PM.stone);
  const P = (lx, ly, lz) => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), y0 + 2.36 + ly, z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
  b.add(pCyl(12, true, true, 0.3, 0.42), xform(P(0, 0.55, 0), [0, yaw, 0], [0.9, 1.1, 0.7]), PM.bronze);   // coat
  b.add(pCyl(12, true, true, 0.42, 0.3), xform(P(0, 1.35, 0), [0, yaw, 0], [0.8, 0.6, 0.55]), PM.bronze);  // chest
  b.add(SPHERE, xform(P(0, 1.85, 0.02), [0, yaw, 0], [0.26, 0.3, 0.28]), PM.bronze);
  b.add(pCapsule(0.2, 8, 3), xform(P(0.32, 1.2, 0.12), [0.4, yaw, -0.2], [0.2, 0.62, 0.2]), PM.bronze);
  b.add(pCapsule(0.2, 8, 3), xform(P(-0.34, 1.25, 0), [-0.2, yaw, 0.3], [0.2, 0.6, 0.2]), PM.bronze);
  b.add(BOX, xform(P(0.4, 1.0, 0.3), [0.3, yaw, 0], [0.26, 0.34, 0.06]), PM.bronze);   // a book
}

/* a punt: long flat-bottomed boat */
function punt(b, x, z, y, yaw) {
  const P = (lx, ly, lz) => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), y + ly, z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
  const wood = mat(TX.WOOD, [0.45, 0.32, 0.22], { uv: 'local', tile: 1, rough: 0.6 });
  b.add(BOX, xform(P(0, 0.12, 0), [0, yaw, 0], [0.95, 0.12, 7.0]), wood);
  for (const s of [-1, 1]) b.add(BOX, xform(P(s * 0.46, 0.3, 0), [0, yaw, 0], [0.06, 0.36, 7.0]), wood);
  for (const e of [-1, 1]) b.add(BOX, xform(P(0, 0.26, e * 3.45), [0, yaw, 0], [0.95, 0.3, 0.12]), wood);
  b.add(BOX, xform(P(0, 0.2, 2.9), [0, yaw, 0], [0.9, 0.04, 1.0]), wood);   // the till
  for (const zc of [-1.2, 0.2]) b.add(BOX, xform(P(0, 0.34, zc), [0, yaw, 0], [0.86, 0.06, 0.4]), mat(TX.FABRIC, [0.25, 0.3, 0.55], { uv: 'local', tile: 0.4 }));
}

/* café table with two chairs and a parasol */
function cafeSet(b, x, z, y0, rnd, col) {
  b.add(pCyl(12), xform([x, y0 + 0.73, z], [0, 0, 0], [0.7, 0.03, 0.7]), PM.whiteP);
  b.add(pCyl(8), xform([x, y0 + 0.37, z], [0, 0, 0], [0.06, 0.72, 0.06]), PM.iron);
  for (let i = 0; i < 2; i++) {
    const a = rnd() * TAU, cx = x + Math.cos(a) * 0.62, cz = z + Math.sin(a) * 0.62;
    b.add(BOX, xform([cx, y0 + 0.45, cz], [0, -a, 0], [0.42, 0.04, 0.42]), PM.iron);
    b.add(BOX, xform([cx + Math.cos(a) * 0.2, y0 + 0.72, cz + Math.sin(a) * 0.2], [0, -a + Math.PI / 2, 0], [0.42, 0.5, 0.03]), PM.iron);
    for (const d of [[0.18, 0.18], [-0.18, 0.18], [0.18, -0.18], [-0.18, -0.18]]) b.add(BOX, xform([cx + d[0], y0 + 0.22, cz + d[1]], [0, 0, 0], [0.03, 0.44, 0.03]), PM.iron);
  }
  b.add(pCyl(6), xform([x, y0 + 1.3, z], [0, 0, 0], [0.04, 2.6, 0.04]), PM.whiteP);
  b.add(pCyl(8, false, true, 0.02, 0.5), xform([x, y0 + 2.45, z], [0, 0, 0], [2.6, 0.55, 2.6]), mat(TX.FABRIC, col || [0.85, 0.82, 0.74], { uv: 'prim', tu: 3, tv: 1 }));
}

/* a fingerpost with arms toward named places (the names are drawn as signs) */
function fingerpost(b, x, z, y0, arms) {
  b.add(pCyl(8), xform([x, y0 + 1.5, z], [0, 0, 0], [0.12, 3.0, 0.12]), PM.whiteP);
  b.add(SPHERE_LO, xform([x, y0 + 3.05, z], [0, 0, 0], [0.16, 0.16, 0.16]), PM.whiteP);
  arms.forEach((yaw, i) => {
    const h = y0 + 2.6 - i * 0.28;
    b.add(BOX, xform([x + Math.sin(yaw) * 0.5, h, z + Math.cos(yaw) * 0.5], [0, yaw, 0], [0.04, 0.2, 1.0]), PM.whiteP);
  });
}
