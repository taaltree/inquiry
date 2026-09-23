/* ============================================================
   flora.js — trees and hedges.

   A tree is a tapered trunk, a handful of limbs, and a crown of
   alpha-cut leaf cards in clumps. Card normals are bent toward the
   crown's own centre, so a canopy lights like a soft volume instead
   of a pile of flat cards; cards deeper in are darker.
   Foliage goes into its own chunk set, drawn with the alpha-test
   program; trunks go with everything else.
   ============================================================ */

const SPECIES = {
  plane:  { th: [5.5, 7.0], tr: 0.40, cr: [6.5, 8.0], ch: [9, 11], tint: '#8cab58', vary: 0.16, bark: [1.25, 1.18, 1.0], clumps: 104, card: [1.7, 2.4], limbs: 6, leaf: TX.LEAVES },
  lime:   { th: [4.5, 6.0], tr: 0.32, cr: [4.4, 5.4], ch: [10, 13], tint: '#9cbb5c', vary: 0.14, bark: [0.9, 0.85, 0.8], clumps: 92, card: [1.6, 2.2], limbs: 5, leaf: TX.LEAVES },
  oak:    { th: [3.0, 4.2], tr: 0.52, cr: [7.0, 8.8], ch: [7, 9], tint: '#6f8c40', vary: 0.18, bark: [0.8, 0.76, 0.7], clumps: 112, card: [1.8, 2.5], limbs: 7, leaf: TX.LEAVES },
  beech:  { th: [3.5, 4.5], tr: 0.45, cr: [6.0, 7.5], ch: [8, 10], tint: '#7a4a40', vary: 0.14, bark: [1.1, 1.1, 1.1], clumps: 100, card: [1.7, 2.3], limbs: 6, leaf: TX.LEAVES },
  gold:   { th: [5.0, 6.5], tr: 0.36, cr: [5.5, 7.0], ch: [9, 11], tint: '#d9a441', vary: 0.22, bark: [1.2, 1.15, 1.0], clumps: 92, card: [1.6, 2.3], limbs: 6, leaf: TX.LEAVES },
  rust:   { th: [4.5, 6.0], tr: 0.34, cr: [5.0, 6.5], ch: [8, 10], tint: '#c8683a', vary: 0.2, bark: [0.9, 0.85, 0.8], clumps: 88, card: [1.6, 2.2], limbs: 5, leaf: TX.LEAVES },
  birch:  { th: [4.0, 5.0], tr: 0.16, cr: [2.4, 3.2], ch: [6, 8], tint: '#a9c46a', vary: 0.14, bark: [2.2, 2.2, 2.1], clumps: 46, card: [1.1, 1.5], limbs: 4, leaf: TX.LEAVES },
  apple:  { th: [1.6, 2.0], tr: 0.18, cr: [2.6, 3.2], ch: [3.2, 3.8], tint: '#7f9e48', vary: 0.14, bark: [0.8, 0.72, 0.62], clumps: 40, card: [1.0, 1.4], limbs: 5, leaf: TX.LEAVES, fruit: true },
  willow: { th: [3.0, 3.8], tr: 0.42, cr: [6.0, 7.5], ch: [6, 7], tint: '#b4c870', vary: 0.12, bark: [0.85, 0.8, 0.72], clumps: 0, card: [1.2, 1.6], limbs: 7, leaf: TX.WILLOW, weep: true },
  yew:    { th: [1.0, 1.4], tr: 0.3, cr: [2.6, 3.4], ch: [7, 9], tint: '#4e6a3e', vary: 0.1, bark: [0.7, 0.55, 0.45], clumps: 40, card: [1.5, 2.0], limbs: 0, leaf: TX.NEEDLES, cone: true },
};

const BARK = (col, len, circ) => mat(TX.BARK, col, { uv: 'prim', tu: Math.max(1, Math.round(circ)), tv: len, rough: 0.95 });

/* one crossed card with bent normals */
function leafCard(b, cx, cy, cz, size, yaw, tilt, M, centre, col) {
  const cyw = Math.cos(yaw), syw = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
  // card axes: u horizontal (rotated by yaw), v up (tilted toward the card normal)
  const ux = cyw, uz = -syw;
  const nx0 = syw * ct, ny0 = -st, nz0 = cyw * ct;     // card normal
  const vx = syw * st, vy = ct, vz = cyw * st;         // card up
  const h = size / 2;
  const corners = [[-h, -h, 0, 0], [h, -h, 1, 0], [h, h, 1, 1], [-h, h, 0, 1]];
  b.reserve(4, 6);
  const base = b.n;
  for (const [a, c, u, v] of corners) {
    const x = cx + ux * a + vx * c, y = cy + vy * c, z = cz + uz * a + vz * c;
    let rx = x - centre[0], ry = (y - centre[1]) * 1.2, rz = z - centre[2];
    const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
    let nx = rx * 0.8 + nx0 * 0.2, ny = ry * 0.8 + ny0 * 0.2 + 0.25, nz = rz * 0.8 + nz0 * 0.2;
    const nl = Math.hypot(nx, ny, nz) || 1;
    b.vert(x, y, z, nx / nl, ny / nl, nz / nl, M, u, v, col);
  }
  const I = b.i;
  I[b.ni++] = base; I[b.ni++] = base + 1; I[b.ni++] = base + 2;
  I[b.ni++] = base; I[b.ni++] = base + 2; I[b.ni++] = base + 3;
}

/* a hanging strand card for a willow: top at (x,y,z), `len` long */
function strandCard(b, x, y, z, w, len, yaw, M, col, centre) {
  const cyw = Math.cos(yaw), syw = Math.sin(yaw);
  const ux = cyw * w / 2, uz = -syw * w / 2;
  const corners = [[-1, -len, 0, 0], [1, -len, 1, 0], [1, 0, 1, 1], [-1, 0, 0, 1]];
  b.reserve(4, 6);
  const base = b.n;
  for (const [a, dy, u, v] of corners) {
    const px = x + ux * a, py = y + dy, pz = z + uz * a;
    let rx = px - centre[0], rz = pz - centre[2];
    const rl = Math.hypot(rx, rz) || 1;
    const nx = rx / rl * 0.8, ny = 0.45, nz = rz / rl * 0.8, nl = Math.hypot(nx, ny, nz);
    b.vert(px, py, pz, nx / nl, ny / nl, nz / nl, M, u, v, col);
  }
  const I = b.i;
  I[b.ni++] = base; I[b.ni++] = base + 1; I[b.ni++] = base + 2;
  I[b.ni++] = base; I[b.ni++] = base + 2; I[b.ni++] = base + 3;
}

function limb(b, p0, p1, r0, r1, barkCol) {
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  const prim = pCyl(7, false, false, r1 / Math.max(r0, 1e-3) * 0.5, 0.5);
  strut(b, p0, p1, r0 * 2, BARK(barkCol, len, r0 * 6.3), 0, 0, 0, prim);
}

/* trunks → `wood`, crowns → `leaves`; both are ChunkedBuilders */
function tree(wood, leaves, x, z, y0, kind, rnd, scale = 1) {
  const S = SPECIES[kind] || SPECIES.plane;
  const R = (a) => lerp(a[0], a[1], rnd()) * scale;
  const th = R(S.th), crR = R(S.cr), crH = R(S.ch);
  const tr = S.tr * scale * (0.9 + rnd() * 0.25);
  const W = wood.at(x, z), Lb = leaves.at(x, z);
  const barkCol = S.bark;
  // trunk with a slight lean and a root flare
  const lean = [(rnd() - 0.5) * 0.35 * (S.weep ? 3 : 1), 0, (rnd() - 0.5) * 0.35 * (S.weep ? 3 : 1)];
  const top = [x + lean[0], y0 + th, z + lean[2]];
  W.add(pCyl(9, false, false, 0.5 * 0.8, 0.5), xform([x, y0 + 0.45, z], [0, rnd() * TAU, 0], [tr * 2.8, 0.9, tr * 2.8]), BARK(barkCol, 1, tr * 8));
  limb(W, [x, y0 + 0.2, z], top, tr, tr * 0.7, barkCol);
  const centre = [top[0], y0 + th + crH * 0.42, top[2]];
  // limbs reaching into the crown
  for (let i = 0; i < S.limbs; i++) {
    const a = (i / S.limbs) * TAU + rnd() * 0.6;
    const up = S.weep ? 0.55 : 0.75 + rnd() * 0.25;
    const reach = crR * (0.45 + rnd() * 0.25);
    const from = [top[0], top[1] - rnd() * th * 0.25, top[2]];
    const to = [top[0] + Math.cos(a) * reach, top[1] + crH * 0.45 * up, top[2] + Math.sin(a) * reach];
    limb(W, from, to, tr * 0.5, tr * 0.18, barkCol);
    // a fork
    const to2 = [to[0] + Math.cos(a + 0.8) * reach * 0.4, to[1] + crH * 0.18, to[2] + Math.sin(a + 0.8) * reach * 0.4];
    limb(W, to, to2, tr * 0.2, tr * 0.08, barkCol);
  }
  const tint = hex2rgb(S.tint);
  const leafM = mat(S.leaf, tint, { kind: KIND.LEAF, uv: 'prim', rough: 0.7 });
  if (S.weep) {
    // a dome of arching branches, streamers hanging almost to the ground
    const n = 70;
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, r = crR * Math.sqrt(0.15 + rnd() * 0.85);
      const px = top[0] + Math.cos(a) * r, pz = top[2] + Math.sin(a) * r;
      const py = top[1] + crH * 0.5 * (1 - (r / crR) * (r / crR)) + 0.8;
      const len = Math.max(1.5, py - y0 - 0.6 - rnd() * 1.4);
      const v = 0.85 + rnd() * 0.3;
      const col = [tint[0] * v, tint[1] * v, tint[2] * v];
      strandCard(Lb, px, py, pz, 1.3, len, a + Math.PI / 2 + (rnd() - 0.5) * 0.6, leafM, col, centre);
      strandCard(Lb, px, py, pz, 1.3, len * 0.9, a + (rnd() - 0.5) * 0.6, leafM, col, centre);
    }
    return { x, z, r: tr + 0.25, crown: crR, h: th + crH };
  }
  const n = S.clumps;
  for (let i = 0; i < n; i++) {
    let dx, dy, dz, rr;
    if (S.cone) {
      const t = rnd(), a = rnd() * TAU;
      const rad = crR * (1 - t) * (0.7 + rnd() * 0.35);
      dx = Math.cos(a) * rad; dz = Math.sin(a) * rad; dy = (t - 0.5) * crH; rr = 1 - t * 0.5;
    } else {
      // points on and inside an ellipsoid, biased to the shell, flattened below
      const u = rnd() * 2 - 1, a = rnd() * TAU, s = Math.sqrt(1 - u * u);
      rr = 0.55 + 0.45 * Math.sqrt(rnd());
      dx = Math.cos(a) * s * crR * rr; dz = Math.sin(a) * s * crR * rr; dy = u * crH * 0.5 * rr;
      if (dy < -crH * 0.32) dy = -crH * 0.32 + rnd() * 0.5;
    }
    const cx = centre[0] + dx, cy = centre[1] + dy, cz = centre[2] + dz;
    const size = R(S.card);
    // deeper, lower clumps are darker: cheap self-shadowing
    const depth = 0.55 + 0.45 * rr;
    const low = 0.8 + 0.2 * clamp((dy / (crH * 0.5)) * 0.5 + 0.5, 0, 1);
    const v = (1 - S.vary / 2 + rnd() * S.vary) * depth * low;
    const col = [tint[0] * v, tint[1] * v * (0.97 + rnd() * 0.06), tint[2] * v];
    const yaw = rnd() * TAU;
    leafCard(Lb, cx, cy, cz, size, yaw, (rnd() - 0.5) * 0.5, leafM, centre, col);
    leafCard(Lb, cx, cy, cz, size * 0.95, yaw + Math.PI / 2, (rnd() - 0.5) * 0.5, leafM, centre, col);
    leafCard(Lb, cx, cy + 0.1, cz, size * 0.9, yaw + 0.8, Math.PI / 2 - 0.25, leafM, centre, col);
  }
  // an inner fill of darker cards so the crown never reads as a sieve
  if (!S.cone) {
    for (let i = 0; i < Math.round(n * 0.18); i++) {
      const a = rnd() * TAU, u = rnd() * 1.2 - 0.6;
      const cx = centre[0] + Math.cos(a) * crR * 0.45, cy = centre[1] + u * crH * 0.3, cz = centre[2] + Math.sin(a) * crR * 0.45;
      const col = [tint[0] * 0.5, tint[1] * 0.52, tint[2] * 0.5];
      leafCard(Lb, cx, cy, cz, R(S.card) * 1.5, rnd() * TAU, (rnd() - 0.5) * 0.6, leafM, centre, col);
    }
  }
  if (S.fruit) {
    for (let i = 0; i < 24; i++) {
      const u = rnd() * 2 - 1, a = rnd() * TAU, s = Math.sqrt(1 - u * u);
      const p = [centre[0] + Math.cos(a) * s * crR * 0.92, centre[1] + u * crH * 0.4, centre[2] + Math.sin(a) * s * crR * 0.92];
      W.add(SPHERE_LO, xform(p, [0, 0, 0], [0.1, 0.1, 0.1]), mat(0, [0.55, 0.06, 0.04], { rough: 0.35 }));
    }
  }
  return { x, z, r: tr + 0.2, crown: crR, h: th + crH };
}

/* a clipped hedge along a polyline */
function hedge(b, pts, h, w, y0f) {
  const M = mat(TX.HEDGE, [1, 1, 1], { uv: 'local', tile: 1.2, rough: 0.9 });
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, y0 = y0f(mx, mz);
    b.add(BOX, xform([mx, y0 + h / 2, mz], [0, yaw, 0], [w, h, len + w * 0.6]), M);
    b.add(BOX, xform([mx, y0 + h + 0.12, mz], [0, yaw, 0], [w * 0.75, 0.3, len + w * 0.4]), M);
  }
}
