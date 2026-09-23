/* ============================================================
   arch.js — the architecture kit.

   A building is a rectangle in its own frame (local x along the
   length, local z toward the front) standing on the ground at y0.
   Facades are built bay by bay: piers, spandrels, recessed windows
   with real reveals, projecting sills and hood moulds, string
   courses, plinth, cornice. Roofs, dormers, chimneys, towers,
   turrets, pinnacles, porticoes and domes are separate calls.
   Every piece shares one UV frame so brick courses run unbroken.
   ============================================================ */

/* ---------- materials ---------- */
const MAT = {
  ashlar:   mat(TX.ASHLAR, [1.0, 0.98, 0.94], { rough: 0.85, tile: 2 }),
  ashlarW:  mat(TX.ASHLAR, [0.95, 0.9, 0.82], { rough: 0.86, tile: 2 }),
  brick:    mat(TX.BRICK, [1, 1, 1], { rough: 0.88, tile: 2 }),
  brickY:   mat(TX.BRICK, [1.35, 1.28, 1.05], { rough: 0.88, tile: 2 }),   // Cambridge gault
  slate:    mat(TX.SLATE, [1, 1, 1], { rough: 0.6, tile: 2 }),
  clay:     mat(TX.CLAY, [1, 1, 1], { rough: 0.8, tile: 2 }),
  lead:     mat(TX.SEAM, [0.62, 0.64, 0.68], { rough: 0.55, tile: 2 }),
  copper:   mat(TX.COPPER, [1, 1, 1], { rough: 0.6, tile: 2 }),
  concrete: mat(TX.CONCRETE, [1, 1, 1], { rough: 0.85, tile: 3 }),
  render:   mat(TX.RENDER, [1, 1, 1], { rough: 0.9, tile: 2 }),
  wood:     mat(TX.WOOD, [0.9, 0.78, 0.62], { rough: 0.7, tile: 1 }),
  timber:   mat(TX.WOOD, [0.78, 0.6, 0.42], { rough: 0.72, tile: 1.2 }),
  door:     mat(TX.WOOD, [0.28, 0.36, 0.30], { rough: 0.55, tile: 1 }),
  paint:    mat(TX.RENDER, [0.92, 0.91, 0.88], { rough: 0.5, tile: 1 }),
  iron:     mat(0, [0.06, 0.065, 0.07], { rough: 0.45, metal: 0.6 }),
  bronze:   mat(0, [0.30, 0.20, 0.10], { rough: 0.35, metal: 0.9 }),
  gold:     mat(0, [0.9, 0.7, 0.3], { rough: 0.3, metal: 1.0 }),
  glassDark:mat(0, [0.03, 0.035, 0.04], { rough: 0.08, metal: 0.2 }),
  sedum:    mat(TX.GRASS, [0.9, 0.85, 0.7], { rough: 0.9, tile: 2 }),
};
const WIN = {
  sash:    (seed) => mat(TX.SASH, [1, 1, 1], { kind: KIND.GLASS, uv: 'prim', rough: 0.5, glow: seed }),
  leaded:  (seed) => mat(TX.SASH, [0.78, 0.72, 0.6], { kind: KIND.GLASS, uv: 'prim', rough: 0.8, glow: seed }),
  gothic:  (seed) => mat(TX.GOTHIC, [1, 1, 1], { kind: KIND.GLASS, uv: 'prim', rough: 0.8, glow: seed }),
  curtain: (seed) => mat(TX.CURTAIN, [1, 1, 1], { kind: KIND.GLASS, uv: 'frame', tile: 3.6, rough: 0.4, glow: seed }),
  shop:    (seed, col) => mat(TX.SHOP, col || [0.3, 0.4, 0.35], { kind: KIND.GLASS, uv: 'prim', rough: 0.5, glow: seed }),
};

/* ---------- frame + face helpers ---------- */
class Frame {
  constructor(b, x, z, yaw, y0 = 0) {
    this.b = b; this.x = x; this.z = z; this.yaw = yaw; this.y0 = y0;
    this.c = Math.cos(yaw); this.s = Math.sin(yaw);
  }
  P(lx, ly, lz) { return [this.x + lx * this.c + lz * this.s, this.y0 + ly, this.z - lx * this.s + lz * this.c]; }
  begin() { this.prev = this.b.frame; this.b.frame = uvFrame(this.x, this.z, this.yaw, this.y0); return this; }
  end() { this.b.frame = this.prev; }
  /* an axis-aligned box in the frame (centre + size), optionally turned by extra yaw */
  box(lx, ly, lz, sx, sy, sz, M, dyaw = 0) {
    this.b.add(BOX, xform(this.P(lx, ly, lz), [0, this.yaw + dyaw, 0], [sx, sy, sz]), M);
  }
  prim(p, lx, ly, lz, sx, sy, sz, M, rot = [0, 0, 0]) {
    this.b.add(p, xform(this.P(lx, ly, lz), [rot[0], this.yaw + rot[1], rot[2]], [sx, sy, sz]), M);
  }
  quad(a, b2, c, d, M, uvs) { this.b.quad(this.P(...a), this.P(...b2), this.P(...c), this.P(...d), M, uvs); }
  tri(a, b2, c, M, uvs) { this.b.tri(this.P(...a), this.P(...b2), this.P(...c), M, uvs); }
}

/* a face of a w×d rectangle: maps (s along the face, y, t outward) to the frame */
function faceOf(F, w, d, side) {
  const hw = w / 2, hd = d / 2;
  const map = {
    front: { len: w, P: (s, y, t) => [s, y, hd + t], yaw: 0 },
    back:  { len: w, P: (s, y, t) => [-s, y, -hd - t], yaw: Math.PI },
    right: { len: d, P: (s, y, t) => [hw + t, y, -s], yaw: Math.PI / 2 },
    left:  { len: d, P: (s, y, t) => [-hw - t, y, s], yaw: -Math.PI / 2 },
  }[side];
  return {
    F, len: map.len, side,
    L: (s, y, t) => map.P(s, y, t),
    box(s0, s1, y0, y1, t0, t1, M) {
      if (s1 - s0 < 1e-3 || y1 - y0 < 1e-3) return;
      const c = map.P((s0 + s1) / 2, (y0 + y1) / 2, (t0 + t1) / 2);
      F.box(c[0], c[1], c[2], s1 - s0, y1 - y0, t1 - t0, M, map.yaw);
    },
    rbox(cs, cy, t0, t1, len, thick, ang, M) {
      const c = map.P(cs, cy, (t0 + t1) / 2);
      F.b.add(BOX, xform(F.P(c[0], c[1], c[2]), [0, F.yaw + map.yaw, ang], [len, thick, t1 - t0]), M);
    },
    quad(s0, s1, y0, y1, t, M, uvs) {
      F.quad(map.P(s0, y0, t), map.P(s1, y0, t), map.P(s1, y1, t), map.P(s0, y1, t), M,
        uvs || [[0, 0], [1, 0], [1, 1], [0, 1]]);
    },
    /* the four inner faces of an opening, from the wall face back to depth t */
    reveal(s0, s1, y0, y1, t, M) {
      F.quad(map.P(s0, y0, 0), map.P(s0, y0, t), map.P(s0, y1, t), map.P(s0, y1, 0), M);   // left jamb, faces +s
      F.quad(map.P(s1, y0, t), map.P(s1, y0, 0), map.P(s1, y1, 0), map.P(s1, y1, t), M);   // right jamb
      F.quad(map.P(s0, y1, 0), map.P(s0, y1, t), map.P(s1, y1, t), map.P(s1, y1, 0), M);   // soffit, faces down
      F.quad(map.P(s0, y0, t), map.P(s0, y0, 0), map.P(s1, y0, 0), map.P(s1, y0, t), M);   // sill board, faces up
    },
  };
}

/* ---------- a whole building ----------
   spec: { x, z, yaw, y0, w, d, storeys, sh, plinth, wall, trim, plinthM,
           win: { style, w, h, sill, bay, frame }, sides: ['front',...],
           doors: [{ side, at, w, h, porch, steps }], arches: [{ side, at, w, h }],
           cornice, bands, parapet, crenel, quoins, roof: {...} }
   returns { collider, doors: [{x,z,yaw}], top, frame } */
function building(b, spec, rnd) {
  const S = Object.assign({
    y0: 0, storeys: 3, sh: 3.8, plinth: 0.7, wallT: 0.45, inset: 0.2,
    wall: MAT.ashlar, trim: MAT.ashlarW, plinthM: null,
    win: { style: 'sash', w: 1.3, h: 2.3, sill: 0.95, bay: 3.4 },
    sides: ['front', 'back', 'left', 'right'], doors: [], arches: [], blank: {},
    cornice: true, bands: true, parapet: 0, crenel: false, quoins: false,
    roof: { type: 'gable', pitch: 0.75, M: MAT.slate, overhang: 0.35, dormers: 0, chimneys: 2 },
  }, spec);
  S.win = Object.assign({ style: 'sash', w: 1.3, h: 2.3, sill: 0.95, bay: 3.4, frame: null }, spec.win || {});
  const OPP = { front: 'back', back: 'front', left: 'right', right: 'left' };
  S.arches = S.arches.flatMap((a) => [a, Object.assign({}, a, { side: OPP[a.side], at: 1 - (a.at == null ? 0.5 : a.at), mirror: true })]);
  const F = new Frame(b, S.x, S.z, S.yaw, S.y0).begin();
  const top = S.plinth + S.storeys * S.sh;
  const out = { doors: [], top, frame: F, spec: S };
  const plinthM = S.plinthM || S.trim;

  for (const side of S.sides) {
    const face = faceOf(F, S.w, S.d, side);
    const isEnd = side === 'left' || side === 'right';
    const len = face.len;
    const ls = isEnd ? -len / 2 + S.wallT : -len / 2, le = isEnd ? len / 2 - S.wallT : len / 2;
    const span = le - ls;
    const openings = [];
    let nb = Math.max(1, Math.round(span / S.win.bay));
    const centred = S.doors.concat(S.arches).some((o) => o.side === side && Math.abs((o.at == null ? 0.5 : o.at) - 0.5) < 0.01);
    if (centred && nb % 2 === 0) nb += nb * S.win.bay > span ? -1 : 1;   // a centred door needs a centre bay
    nb = Math.max(1, nb);
    const bw = span / nb;
    for (const dd of S.doors.filter((o) => o.side === side)) openings.push(Object.assign({ kind: 'door', w: 1.7, h: 3.0 }, dd));
    for (const aa of S.arches.filter((o) => o.side === side)) openings.push(Object.assign({ kind: 'arch', w: 4.5, h: 5.2 }, aa));
    // which bay each ground-floor opening replaces
    const bayOf = (at) => clamp(Math.floor((at * len - ls) / bw), 0, nb - 1);
    const special = {};
    for (const o of openings) { o.bay = bayOf(o.at == null ? 0.5 : o.at); special[o.bay] = o; }

    // plinth
    face.box(-len / 2 - (isEnd ? 0 : 0.07), len / 2 + (isEnd ? 0 : 0.07), 0, S.plinth, -S.wallT, 0.07, plinthM);

    for (let k = 0; k < S.storeys; k++) {
      const y0 = S.plinth + k * S.sh, y1 = y0 + S.sh;
      if (S.shop && side === 'front' && k === 0) {
        const p = 0.45;
        face.box(-len / 2, -len / 2 + p, y0, y1, -S.wallT, 0.05, S.trim);
        face.box(len / 2 - p, len / 2, y0, y1, -S.wallT, 0.05, S.trim);
        face.box(-len / 2 + p, len / 2 - p, y1 - 0.35, y1, -S.wallT, 0.12, S.trim);
        face.quad(-len / 2 + p, len / 2 - p, y0, y1 - 0.35, -0.15, WIN.shop(rnd(), S.shop));
        face.reveal(-len / 2 + p, len / 2 - p, y0, y1 - 0.35, -0.15, S.trim);
        const dp = F.P(...face.L(0, 0, 1.4));
        out.doors.push({ x: dp[0], z: dp[2], y: S.y0, yaw: S.yaw, side, shop: true });
        continue;
      }
      for (let i = 0; i < nb; i++) {
        const cx = ls + (i + 0.5) * bw;
        let ow = S.win.w, ob = S.win.sill, ot = S.win.sill + S.win.h, kind = 'win';
        const sp = k === 0 ? special[i] : null;
        const archAbove = special[i] && special[i].kind === 'arch' && special[i].h > (k * S.sh + S.sh) - 0.01;
        if (sp) { ow = sp.w; ob = 0; ot = sp.kind === 'arch' ? Math.min(sp.h, S.sh) : Math.min(sp.h, S.sh - 0.3); kind = sp.kind; }
        if (special[i] && special[i].kind === 'arch' && k > 0 && special[i].h > k * S.sh) {
          // the arch rises through this storey too
          ow = special[i].w; ob = 0; ot = Math.min(special[i].h - k * S.sh, S.sh); kind = 'archUp';
        }
        if (S.blank[side] && S.blank[side].includes(i) && !sp) kind = 'blank';
        const s0 = cx - bw / 2, s1 = cx + bw / 2;
        if (kind === 'blank') { face.box(s0, s1, y0, y1, -S.wallT, 0, S.wall); continue; }
        const o0 = cx - ow / 2, o1 = cx + ow / 2;
        face.box(s0, o0, y0, y1, -S.wallT, 0, S.wall);
        face.box(o1, s1, y0, y1, -S.wallT, 0, S.wall);
        if (ob > 0) face.box(o0, o1, y0, y0 + ob, -S.wallT, 0, S.wall);
        if (ot < S.sh) face.box(o0, o1, y0 + ot, y1, -S.wallT, 0, S.wall);
        const wy0 = y0 + ob, wy1 = y0 + ot;
        if (kind === 'win') {
          const seed = rnd();
          const W = S.win.style === 'gothic' ? WIN.gothic(seed) : S.win.style === 'leaded' ? WIN.leaded(seed) : WIN.sash(seed);
          face.quad(o0, o1, wy0, wy1, -S.inset, W);
          face.reveal(o0, o1, wy0, wy1, -S.inset, S.trim);
          face.box(o0 - 0.1, o1 + 0.1, wy0 - 0.13, wy0, 0, 0.11, S.trim);                  // sill
          if (S.win.frame !== 'none') face.box(o0 - 0.12, o1 + 0.12, wy1, wy1 + 0.2, 0, 0.07, S.trim);  // lintel / hood
          if (S.win.frame === 'surround') {
            face.box(o0 - 0.12, o0, wy0, wy1, 0, 0.05, S.trim);
            face.box(o1, o1 + 0.12, wy0, wy1, 0, 0.05, S.trim);
          }
        } else if (kind === 'door') {
          face.quad(o0, o1, wy0, wy1, -0.35, MAT.door, [[0, 0], [ow, 0], [ow, ot], [0, ot]]);
          face.quad(o0 + 0.08, o1 - 0.08, wy1 - 0.75, wy1 - 0.08, -0.33, WIN.sash(rnd()));   // fanlight
          face.reveal(o0, o1, wy0, wy1, -0.35, S.trim);
          face.box(o0 - 0.22, o0, wy0, wy1 + 0.25, 0, 0.12, S.trim);
          face.box(o1, o1 + 0.22, wy0, wy1 + 0.25, 0, 0.12, S.trim);
          face.box(o0 - 0.34, o1 + 0.34, wy1 + 0.25, wy1 + 0.5, 0, 0.2, S.trim);
          const dp = F.P(...face.L(cx, 0, 1.6));
          out.doors.push({ x: dp[0], z: dp[2], y: S.y0, yaw: S.yaw + { front: 0, right: Math.PI / 2, back: Math.PI, left: -Math.PI / 2 }[side], side });
          const nst = sp.steps == null ? Math.round(S.plinth / 0.17) : sp.steps;
          for (let st = 0; st < nst; st++) {
            const hh = S.plinth * (1 - st / nst);
            face.box(o0 - 0.5, o1 + 0.5, 0, hh, 0, 0.32 * (st + 1), S.trim);
          }
        } else if (kind === 'arch' || kind === 'archUp') {
          if (kind === 'arch') {
            // passage: side walls and a soffit run straight through the building
            const depth = (isEnd ? S.w : S.d) - 0.1;
            const hgt = sp.h;
            if (!sp.mirror) {
              face.box(o0 - 0.25, o0, 0, hgt, -depth, 0, S.trim);
              face.box(o1, o1 + 0.25, 0, hgt, -depth, 0, S.trim);
              face.box(o0, o1, hgt, hgt + 0.3, -depth, 0, S.trim);
            }
            // a ring of voussoirs following the curve
            const r0 = ow / 2, yc = hgt - r0, N = 20, rr = r0 + 0.2;
            for (let j = 0; j < N; j++) {
              const a0 = Math.PI * (j / N), a1 = Math.PI * ((j + 1) / N), am = (a0 + a1) / 2;
              const seg = 2 * rr * Math.sin(Math.PI / (2 * N)) + 0.04;
              face.rbox(cx - Math.cos(am) * rr, yc + Math.sin(am) * rr, 0, 0.12, seg, 0.42, am - Math.PI / 2, S.trim);
            }
            face.rbox(cx, yc + rr + 0.05, 0, 0.16, 0.5, 0.6, 0, S.trim);          // keystone
            // spandrels: fill the corners above the semicircle, slice by slice
            const n = 28;
            for (let j = 0; j < n; j++) {
              const xa = o0 + (j / n) * ow, xb = o0 + ((j + 1) / n) * ow;
              const d0 = Math.abs(xa - cx), d1 = Math.abs(xb - cx), dm = Math.min(d0, d1);
              const ya = yc + Math.sqrt(Math.max(0, r0 * r0 - dm * dm));
              face.box(xa, xb, ya, hgt, -0.6, 0, S.wall);
            }
            if (!sp.mirror) { const ap = F.P(...face.L(cx, 0, 2)); out.arch = { x: ap[0], z: ap[2], s0: o0, s1: o1, side }; }
          }
        }
      }
      // string course between storeys, broken where an arch rises through it
      if (S.bands && k > 0) {
        const cuts = Object.entries(special).filter(([, o]) => o.kind === 'arch' && o.h > k * S.sh - 0.1).map(([bi, o]) => [ls + (+bi + 0.5) * bw - o.w / 2 - 0.25, ls + (+bi + 0.5) * bw + o.w / 2 + 0.25]);
        let a = -len / 2 - (isEnd ? 0 : 0.1);
        for (const [c0, c1] of cuts.sort((p, q) => p[0] - q[0])) { face.box(a, c0, y0 - 0.1, y0 + 0.12 + (isEnd ? 0.003 : 0), 0, 0.1, S.trim); a = c1; }
        face.box(a, len / 2 + (isEnd ? 0 : 0.1), y0 - 0.1, y0 + 0.12 + (isEnd ? 0.003 : 0), 0, 0.1, S.trim);
      }
    }
    // quoins
    if (S.quoins && !isEnd) {
      for (let y = S.plinth; y < top - 0.3; y += 0.6) {
        const alt = Math.round((y - S.plinth) / 0.6) % 2;
        for (const e of [-1, 1]) face.box(e * len / 2 - (e > 0 ? (alt ? 0.9 : 0.55) : 0), e * len / 2 + (e < 0 ? (alt ? 0.9 : 0.55) : 0), y, y + 0.3, 0, 0.04, S.trim);
      }
    }
    // cornice
    if (S.cornice) {
      face.box(-len / 2 - (isEnd ? 0 : 0.3), len / 2 + (isEnd ? 0 : 0.3), top - 0.18, top + 0.22, 0, 0.3, S.trim);
      face.box(-len / 2 - (isEnd ? 0 : 0.15), len / 2 + (isEnd ? 0 : 0.15), top - 0.5, top - 0.18, 0, 0.14, S.trim);
    }
    // parapet, plain or crenellated
    if (S.parapet > 0) {
      face.box(-len / 2 - (isEnd ? 0 : 0.0), len / 2, top + 0.22, top + 0.22 + S.parapet * 0.55, -0.35, 0.02, S.wall);
      if (S.crenel) {
        const n = Math.max(2, Math.round(len / 1.6));
        for (let i = 0; i < n; i += 2) {
          const a = -len / 2 + (i + 0.5) * (len / n);
          face.box(a - len / n / 2, a + len / n / 2, top + 0.22 + S.parapet * 0.55, top + 0.22 + S.parapet, -0.35, 0.02, S.wall);
          face.box(a - len / n / 2 - 0.04, a + len / n / 2 + 0.04, top + 0.22 + S.parapet, top + 0.3 + S.parapet, -0.38, 0.06, S.trim);
        }
      } else {
        face.box(-len / 2 - 0.05, len / 2 + 0.05, top + 0.22 + S.parapet * 0.55, top + 0.34 + S.parapet * 0.55, -0.4, 0.06, S.trim);
      }
    }
  }
  // a floor slab inside so you never see through at the roofline
  F.box(0, top - 0.2, 0, S.w - 0.2, 0.4, S.d - 0.2, S.wall);

  if (S.roof) roof(F, S, top + (S.cornice ? 0.22 : 0), rnd);
  const col = (lx0, lx1, lz0, lz1) => {
    const c = F.P((lx0 + lx1) / 2, 0, (lz0 + lz1) / 2);
    return { x: c[0], z: c[2], hw: (lx1 - lx0) / 2 + 0.1, hd: (lz1 - lz0) / 2 + 0.1, yaw: S.yaw, y0: S.y0, h: top + 6 };
  };
  out.colliders = [];
  const pa = S.arches.find((a) => !a.mirror && (a.side === 'front' || a.side === 'back'));
  if (pa && out.arch) {
    // the passage runs front to back at s0..s1 along the front face (local x)
    const s0 = pa.side === 'front' ? out.arch.s0 : -out.arch.s1, s1 = pa.side === 'front' ? out.arch.s1 : -out.arch.s0;
    out.colliders.push(col(-S.w / 2, s0 - 0.25, -S.d / 2, S.d / 2), col(s1 + 0.25, S.w / 2, -S.d / 2, S.d / 2));
  } else if (S.arches.find((a) => !a.mirror && (a.side === 'left' || a.side === 'right')) && out.arch) {
    const s0 = out.arch.side === 'right' ? -out.arch.s1 : out.arch.s0, s1 = out.arch.side === 'right' ? -out.arch.s0 : out.arch.s1;
    out.colliders.push(col(-S.w / 2, S.w / 2, -S.d / 2, s0 - 0.25), col(-S.w / 2, S.w / 2, s1 + 0.25, S.d / 2));
  } else {
    out.colliders.push(col(-S.w / 2, S.w / 2, -S.d / 2, S.d / 2));
  }
  F.end();
  return out;
}

/* ---------- roofs ---------- */
function roof(F, S, E, rnd) {
  const R = Object.assign({ type: 'gable', pitch: 0.75, M: MAT.slate, overhang: 0.35, dormers: 0, chimneys: 0, along: 'x' }, S.roof);
  const hw = S.w / 2, hd = S.d / 2, o = R.overhang;
  if (R.type === 'flat') {
    F.quad([-hw + 0.3, E - 0.1, hd - 0.3], [hw - 0.3, E - 0.1, hd - 0.3], [hw - 0.3, E - 0.1, -hd + 0.3], [-hw + 0.3, E - 0.1, -hd + 0.3], R.M);
    if (R.plant) {   // a rooftop plant room
      F.box(R.plant[0], E + 1.4, R.plant[1], R.plant[2], 2.8, R.plant[3], MAT.concrete);
      F.box(R.plant[0], E + 2.9, R.plant[1], R.plant[2] + 0.3, 0.2, R.plant[3] + 0.3, MAT.lead);
    }
    return;
  }
  const alongX = R.along !== 'z';
  // swapping axes (ridge along z) mirrors the frame, so winding flips with it
  const q = (p0, p1, p2, p3, M, uvs) => alongX ? F.quad(p0, p1, p2, p3, M, uvs)
    : F.quad(p1, p0, p3, p2, M, uvs && [uvs[1], uvs[0], uvs[3], uvs[2]]);
  const t3 = (p0, p1, p2, M, uvs) => alongX ? F.tri(p0, p1, p2, M, uvs) : F.tri(p1, p0, p2, M, uvs && [uvs[1], uvs[0], uvs[2]]);
  const A = alongX ? hw : hd, B = alongX ? hd : hw;    // A along the ridge, B across
  const rise = B * R.pitch;
  const H = E + rise;
  const L = (a, y, bb) => alongX ? [a, y, bb] : [bb, y, a];
  const slopeLen = Math.hypot(B + o, rise + o * R.pitch);
  const hip = R.type === 'hip' ? Math.min(B, A * 0.9) : 0;
  // the two long slopes (trapezoids for a hip roof)
  for (const sgn of [1, -1]) {
    const e0 = L(-A - o, E - o * R.pitch, sgn * (B + o)), e1 = L(A + o, E - o * R.pitch, sgn * (B + o));
    const r1 = L(A - hip, H, 0), r0 = L(-A + hip, H, 0);
    const uvs = [[0, 0], [2 * (A + o), 0], [2 * (A + o) - (hip + o), slopeLen], [hip + o, slopeLen]];
    if (sgn > 0 === alongX) F.quad(e0, e1, r1, r0, R.M, uvs);
    else F.quad(e1, e0, r0, r1, R.M, uvs);
  }
  if (R.type === 'hip') {
    for (const sgn of [1, -1]) {
      const a0 = L(sgn * (A + o), E - o * R.pitch, -(B + o)), a1 = L(sgn * (A + o), E - o * R.pitch, B + o), ap = L(sgn * (A - hip), H, 0);
      const uvs = [[0, 0], [2 * (B + o), 0], [B + o, slopeLen]];
      if (sgn > 0) t3(a1, a0, ap, R.M, uvs); else t3(a0, a1, ap, R.M, uvs);
    }
  } else {
    // gable ends in the wall material, with a coping stone along the verge
    for (const sgn of [1, -1]) {
      const g0 = L(sgn * A, E, -B), g1 = L(sgn * A, E, B), gp = L(sgn * A, H, 0);
      if ((sgn > 0) === alongX) F.tri(g0, gp, g1, S.wall); else F.tri(g1, gp, g0, S.wall);
      if ((sgn > 0) === alongX) F.tri(g1, gp, g0, S.wall); else F.tri(g0, gp, g1, S.wall);
      for (const side of [-1, 1]) {
        const p0 = L(sgn * (A + 0.05), E, side * (B + 0.15)), p1 = L(sgn * (A + 0.05), H + 0.12, 0);
        const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
        const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
        const ang = Math.atan2(p1[1] - p0[1], Math.hypot(p1[0] - p0[0], p1[2] - p0[2])) * (side > 0 ? 1 : -1);
        const w = F.P(...mid);
        F.b.add(BOX, xform(w, alongX ? [ang, F.yaw, 0] : [0, F.yaw, -ang], alongX ? [0.5, 0.22, len] : [len, 0.22, 0.5]), S.trim);
      }
    }
  }
  // ridge
  const r0 = L(-A + hip, H + 0.06, 0), r1 = L(A - hip, H + 0.06, 0);
  const rl = Math.hypot(r1[0] - r0[0], r1[2] - r0[2]);
  if (rl > 0.1) F.box((r0[0] + r1[0]) / 2, H + 0.06, (r0[2] + r1[2]) / 2, alongX ? rl : 0.3, 0.2, alongX ? 0.3 : rl, MAT.lead);
  // dormers on the front slope
  for (let i = 0; i < (R.dormers || 0); i++) {
    const a = -A + (i + 0.5) * (2 * A / R.dormers);
    const bb = B * 0.42, y = E + (B - bb) * R.pitch;
    const dw = 1.6, dh = 1.8, dd = 1.8;
    const c = L(a, y + dh / 2 - 0.25, bb);
    F.box(c[0], c[1], c[2], alongX ? dw : dd, dh + 0.5, alongX ? dd : dw, S.wall);
    const zf = bb + dd / 2 + 0.01;
    q(L(a - 0.5, y + 0.05, zf), L(a + 0.5, y + 0.05, zf), L(a + 0.5, y + 1.3, zf), L(a - 0.5, y + 1.3, zf), WIN.sash(rnd()), [[0, 0], [1, 0], [1, 1], [0, 1]]);
    const yb = y + dh - 0.15, yr = yb + 0.8, zF = bb + dd / 2 + 0.25, zB = bb - dd / 2 - 0.4;
    const xl = a - dw / 2 - 0.2, xr = a + dw / 2 + 0.2;
    q(L(xl, yb, zB), L(xl, yb, zF), L(a, yr, zF), L(a, yr, zB), R.M, [[0, 0], [zF - zB, 0], [zF - zB, 1.2], [0, 1.2]]);
    q(L(xr, yb, zF), L(xr, yb, zB), L(a, yr, zB), L(a, yr, zF), R.M, [[0, 0], [zF - zB, 0], [zF - zB, 1.2], [0, 1.2]]);
    t3(L(a - dw / 2, yb, zf), L(a + dw / 2, yb, zf), L(a, yr - 0.05, zf), S.wall);
  }
  // chimneys, astride the ridge
  for (let i = 0; i < (R.chimneys || 0); i++) {
    const a = (R.chimneys === 1 ? 0 : -A * 0.7 + (i / (R.chimneys - 1)) * A * 1.4);
    const c = L(a, H + 0.9, 0);
    F.box(c[0], c[1] - 0.6, c[2], alongX ? 1.1 : 0.8, 3.2, alongX ? 0.8 : 1.1, MAT.brick);
    F.box(c[0], c[1] + 1.05, c[2], alongX ? 1.25 : 0.95, 0.18, alongX ? 0.95 : 1.25, S.trim);
    for (const k of [-0.25, 0.25]) {
      const p = alongX ? [c[0] + k, c[1] + 1.4, c[2]] : [c[0], c[1] + 1.4, c[2] + k];
      F.prim(CYL_LO, p[0], p[1], p[2], 0.22, 0.55, 0.22, mat(TX.CLAY, [0.9, 0.7, 0.6], { uv: 'local', tile: 1 }));
    }
  }
}

/* ---------- a square tower with optional turrets and a crenellated top ---------- */
function tower(b, spec, rnd) {
  const S = Object.assign({ y0: 0, w: 8, d: 8, h: 24, wall: MAT.ashlar, trim: MAT.ashlarW, turrets: false,
    crenel: true, spire: 0, pinnacles: false, clock: false, openings: 1, arch: null }, spec);
  const out = building(b, {
    x: S.x, z: S.z, yaw: S.yaw, y0: S.y0, w: S.w, d: S.d, storeys: Math.round(S.h / 4), sh: S.h / Math.round(S.h / 4),
    plinth: 0.8, wall: S.wall, trim: S.trim,
    win: { style: S.gothicWin ? 'gothic' : 'leaded', w: S.winW || 1.3, h: S.winH || 2.4, sill: 0.9, bay: S.w / (S.openings || 1) + 0.01 },
    arches: S.arch ? [S.arch] : [], doors: S.doors || [],
    parapet: S.crenel ? 1.3 : 0, crenel: S.crenel, cornice: true, bands: true,
    roof: S.spire ? null : { type: 'flat', M: MAT.lead },
  }, rnd);
  const F = new Frame(b, S.x, S.z, S.yaw, S.y0).begin();
  const top = out.top;
  if (S.turrets) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const tx = sx * S.w / 2, tz = sz * S.d / 2, tr = S.turretR || 1.3;
      F.prim(OCT, tx, (top + 3.2) / 2, tz, tr * 2, top + 3.2, tr * 2, S.wall);
      for (let k = 0; k < 8; k += 2) {
        const a = (k / 8) * TAU;
        F.box(tx + Math.cos(a) * tr * 0.95, top + 3.6, tz + Math.sin(a) * tr * 0.95, 0.45, 0.8, 0.45, S.trim);
      }
      F.prim(CONE, tx, top + 5.4, tz, tr * 1.7, 3.2, tr * 1.7, MAT.lead);
      F.prim(SPHERE_LO, tx, top + 7.1, tz, 0.35, 0.35, 0.35, MAT.gold);
    }
  }
  if (S.pinnacles) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      F.box(sx * (S.w / 2 - 0.4), top + 2.4, sz * (S.d / 2 - 0.4), 0.8, 2.6, 0.8, S.trim);
      F.prim(CONE, sx * (S.w / 2 - 0.4), top + 4.6, sz * (S.d / 2 - 0.4), 0.9, 2.2, 0.9, S.trim);
    }
  }
  if (S.spire) {
    F.prim(pCyl(8, false, true, 0.02, 0.5), 0, top + S.spire / 2, 0, S.w * 0.9, S.spire, S.d * 0.9, MAT.lead);
    F.prim(SPHERE_LO, 0, top + S.spire + 0.2, 0, 0.5, 0.5, 0.5, MAT.gold);
  }
  if (S.lantern) {
    // an open cupola with a lead cap, for a clock tower
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) F.box(sx * S.w * 0.28, top + 2.2, sz * S.d * 0.28, 0.5, 3.6, 0.5, S.trim);
    F.box(0, top + 4.2, 0, S.w * 0.72, 0.5, S.d * 0.72, S.trim);
    F.prim(pCyl(8, false, true, 0.05, 0.5), 0, top + 6.1, 0, S.w * 0.8, 3.4, S.d * 0.8, MAT.copper);
    F.box(0, top + 8.4, 0, 0.12, 1.4, 0.12, MAT.iron);
    F.prim(SPHERE_LO, 0, top + 7.9, 0, 0.45, 0.45, 0.45, MAT.gold);
  }
  F.end();
  out.top = top;
  return out;
}

/* ---------- classical portico: columns, entablature, pediment, steps ---------- */
function portico(b, spec) {
  const S = Object.assign({ y0: 0, cols: 6, w: 16, d: 5, h: 9, base: 1.2, M: MAT.ashlarW, colR: 0.45 }, spec);
  const F = new Frame(b, S.x, S.z, S.yaw, S.y0).begin();
  // podium + steps (stepped toward the front)
  F.box(0, S.base / 2, 0, S.w + 1, S.base, S.d + 0.5, S.M);
  const nSteps = Math.max(1, Math.round(S.base / 0.18));
  for (let i = 0; i < nSteps; i++) {
    const yy = S.base - (i + 1) * (S.base / nSteps);
    F.box(0, yy / 2 + 0.001 * i, S.d / 2 + 0.25 + (i + 1) * 0.34, S.w - 1 + i * 0.1, Math.max(0.02, yy), 0.34, S.M);
  }
  for (let i = 0; i < S.cols; i++) {
    const x = -S.w / 2 + 0.9 + i * ((S.w - 1.8) / (S.cols - 1));
    for (const z of [S.d / 2 - 0.6]) {
      F.box(x, S.base + 0.2, z, S.colR * 2.6, 0.4, S.colR * 2.6, S.M);
      F.prim(pCyl(16, false, false, S.colR * 0.9, S.colR), x, S.base + 0.4 + (S.h - 1.4) / 2, z, 2, S.h - 1.4, 2, S.M);
      F.box(x, S.base + S.h - 0.8, z, S.colR * 2.8, 0.45, S.colR * 2.8, S.M);
    }
  }
  const eb = S.base + S.h - 0.5;
  F.box(0, eb + 0.55, 0, S.w + 0.4, 1.1, S.d + 0.3, S.M);                  // entablature
  F.box(0, eb + 1.2, 0, S.w + 0.8, 0.3, S.d + 0.6, S.M);                   // cornice
  // pediment: a low triangular prism across the front
  const ph = S.w * 0.2;
  F.tri([-S.w / 2 - 0.3, eb + 1.35, S.d / 2 + 0.3], [S.w / 2 + 0.3, eb + 1.35, S.d / 2 + 0.3], [0, eb + 1.35 + ph, S.d / 2 + 0.3], S.M);
  for (const sg of [-1, 1]) {
    const a = [sg * (S.w / 2 + 0.4), eb + 1.3, S.d / 2 + 0.4], p = [0, eb + 1.4 + ph, S.d / 2 + 0.4];
    const q0 = [a[0], a[1], -S.d / 2 - 0.2], q1 = [p[0], p[1], -S.d / 2 - 0.2];
    if (sg > 0) F.quad(a, q0, q1, p, MAT.lead); else F.quad(q0, a, p, q1, MAT.lead);
  }
  F.end();
  return { top: eb + 1.35 + ph };
}

/* ---------- drum + dome ---------- */
function dome(b, x, z, y, r, spec = {}) {
  const S = Object.assign({ drumH: r * 0.9, M: MAT.copper, drumM: MAT.ashlarW, lantern: true, windows: 8 }, spec);
  b.add(pCyl(28, false, false), xform([x, y + S.drumH / 2, z], [0, 0, 0], [r * 2.08, S.drumH, r * 2.08]), S.drumM);
  b.add(pCyl(28, true, false), xform([x, y + S.drumH + 0.2, z], [0, 0, 0], [r * 2.3, 0.4, r * 2.3]), S.drumM);
  // windows around the drum
  for (let i = 0; i < S.windows; i++) {
    const a = (i / S.windows) * TAU;
    const px = x + Math.cos(a) * (r * 1.04 + 0.02), pz = z + Math.sin(a) * (r * 1.04 + 0.02);
    const tx = -Math.sin(a) * 0.6, tz = Math.cos(a) * 0.6;
    const y0 = y + S.drumH * 0.25, y1 = y + S.drumH * 0.8;
    b.quad([px - tx, y0, pz - tz], [px + tx, y0, pz + tz], [px + tx, y1, pz + tz], [px - tx, y1, pz - tz], WIN.sash(Math.random()), [[1, 0], [0, 0], [0, 1], [1, 1]]);
    b.add(BOX, xform([px + Math.cos(a) * 0.1, (y0 + y1) / 2, pz + Math.sin(a) * 0.1], [0, Math.atan2(Math.cos(a), Math.sin(a)) + Math.PI / 2, 0], [0.35, y1 - y0 + 0.5, 0.25]), S.drumM);
  }
  b.add(DOME, xform([x, y + S.drumH + 0.35, z], [0, 0, 0], [r * 2, r * 2.1, r * 2]), mat(S.M.tex, S.M.col, { uv: 'prim', tu: 12, tv: 3, rough: 0.6 }));
  // ribs
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    for (let k = 0; k < 6; k++) {
      const p0 = k / 6 * Math.PI / 2, p1 = (k + 1) / 6 * Math.PI / 2;
      const A = [x + Math.cos(a) * Math.cos(p0) * r * 1.01, y + S.drumH + 0.35 + Math.sin(p0) * r * 1.06, z + Math.sin(a) * Math.cos(p0) * r * 1.01];
      const B = [x + Math.cos(a) * Math.cos(p1) * r * 1.01, y + S.drumH + 0.35 + Math.sin(p1) * r * 1.06, z + Math.sin(a) * Math.cos(p1) * r * 1.01];
      strut(b, A, B, 0.12, S.M);
    }
  }
  const topY = y + S.drumH + 0.35 + r * 1.05;
  if (S.lantern) {
    b.add(pCyl(8), xform([x, topY + 0.9, z], [0, 0, 0], [r * 0.45, 1.8, r * 0.45]), S.drumM);
    b.add(pCyl(8, true, false, 0.02, 0.5), xform([x, topY + 2.4, z], [0, 0, 0], [r * 0.5, 1.2, r * 0.5]), S.M);
    b.add(SPHERE_LO, xform([x, topY + 3.2, z], [0, 0, 0], [0.4, 0.4, 0.4]), MAT.gold);
  }
  return topY;
}

/* ---------- gothic buttress with a pinnacle ---------- */
function buttress(F, lx, lz, h, dir, M, trim) {
  // dir: outward unit in the frame (dx, dz)
  const [dx, dz] = dir;
  const steps = [[1.2, h * 0.45], [0.9, h * 0.8], [0.6, h]];
  let y0 = 0;
  for (const [depth, y1] of steps) {
    const cx = lx + dx * depth / 2, cz = lz + dz * depth / 2;
    F.box(cx, (y0 + y1) / 2, cz, Math.abs(dz) > 0.5 ? 1.0 : depth, y1 - y0, Math.abs(dz) > 0.5 ? depth : 1.0, M);
    F.box(cx + dx * 0.05, y1 + 0.12, cz + dz * 0.05, Math.abs(dz) > 0.5 ? 1.1 : depth + 0.1, 0.25, Math.abs(dz) > 0.5 ? depth + 0.1 : 1.1, trim);
    y0 = y1;
  }
  const px = lx + dx * 0.3, pz = lz + dz * 0.3;
  F.box(px, h + 1.4, pz, 0.75, 2.6, 0.75, trim);
  F.prim(CONE, px, h + 4.0, pz, 0.85, 2.8, 0.85, trim);
  for (let k = 0; k < 4; k++) F.box(px, h + 3.0 + k * 0.55, pz, 0.95 - k * 0.18, 0.12, 0.95 - k * 0.18, trim);
}


/* ---------- a perpendicular gothic chapel ---------- */
function chapel(b, spec, rnd) {
  const S = Object.assign({ y0: 0, w: 82, d: 16, h: 23.5 }, spec);
  const bay = S.w / 12;
  const out = building(b, {
    x: S.x, z: S.z, yaw: S.yaw, y0: S.y0, w: S.w, d: S.d, storeys: 1, sh: S.h, plinth: 0.8,
    wall: MAT.ashlar, trim: MAT.ashlarW, bands: false, cornice: true, parapet: 1.4, crenel: true,
    win: { style: 'gothic', w: bay * 0.66, h: bay * 0.66 * 3, sill: 3.6, bay, frame: 'none' },
    doors: [{ side: 'front', at: 0.5, w: 2.6, h: 4.6, steps: 3 }],
    roof: { type: 'gable', pitch: 0.32, M: MAT.lead, overhang: 0.0, chimneys: 0 },
  }, rnd);
  const F = new Frame(b, S.x, S.z, S.yaw, S.y0).begin();
  const top = out.top;
  // buttresses between every bay on both long sides
  for (let i = 0; i <= 12; i++) {
    const lx = -S.w / 2 + i * bay;
    if (i === 0 || i === 12) continue;
    buttress(F, lx, S.d / 2, top, [0, 1], MAT.ashlar, MAT.ashlarW);
    buttress(F, lx, -S.d / 2, top, [0, -1], MAT.ashlar, MAT.ashlarW);
  }
  // four corner turrets with ogee caps
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const tx = sx * (S.w / 2 + 0.6), tz = sz * (S.d / 2 + 0.6), tr = 1.9;
    F.prim(OCT, tx, (top + 7) / 2, tz, tr * 2, top + 7, tr * 2, MAT.ashlar);
    for (let k = 0; k < 4; k++) F.prim(OCT, tx, 6 + k * 6, tz, tr * 2.12, 0.3, tr * 2.12, MAT.ashlarW);
    for (let k = 0; k < 8; k += 2) { const a = (k / 8) * TAU; F.box(tx + Math.cos(a) * tr * 0.9, top + 7.5, tz + Math.sin(a) * tr * 0.9, 0.5, 1.0, 0.5, MAT.ashlarW); }
    F.prim(pCyl(8, false, true, 0.02, 0.5), tx, top + 10.6, tz, tr * 1.9, 5.4, tr * 1.9, MAT.ashlarW);
    F.prim(SPHERE_LO, tx, top + 13.5, tz, 0.5, 0.5, 0.5, MAT.gold);
  }
  F.end();
  return out;
}

/* ---------- a modern block: ribbon glazing or a full curtain wall ---------- */
function modernBlock(b, spec, rnd) {
  const S = Object.assign({ y0: 0, storeys: 4, sh: 3.6, style: 'ribbon', wall: MAT.brick, fins: 0, green: false,
    endWalls: true, doors: [] }, spec);
  const F = new Frame(b, S.x, S.z, S.yaw, S.y0).begin();
  const H = S.storeys * S.sh;
  const out = { doors: [], top: H, frame: F, spec: S };
  for (const side of ['front', 'back', 'left', 'right']) {
    const face = faceOf(F, S.w, S.d, side);
    const isEnd = side === 'left' || side === 'right';
    const len = face.len;
    if (isEnd && S.endWalls) {
      face.box(-len / 2, len / 2, 0, H + 0.6, -0.4, 0, S.wall);
      continue;
    }
    // the glazing sits back behind the slab edges
    const seed = rnd();
    const G = mat(TX.CURTAIN, [1, 1, 1], { kind: KIND.GLASS, uv: 'frame', tile: S.sh, rough: 0.4, glow: seed });
    face.quad(-len / 2, len / 2, 0, H, -0.35, G);
    face.box(-len / 2, len / 2, -1, 0, -0.9, -0.36, S.wall);
    for (let k = 0; k <= S.storeys; k++) {
      const y = k * S.sh;
      face.box(-len / 2 - 0.05, len / 2 + 0.05, y - 0.25, y + 0.2, -0.36, 0.25, MAT.concrete);
    }
    if (S.fins) {
      for (let x = -len / 2 + S.fins / 2; x < len / 2; x += S.fins) face.box(x - 0.06, x + 0.06, 0.2, H - 0.2, -0.35, 0.45, MAT.timber);
    }
    // mullion shadows at each end
    face.box(-len / 2, -len / 2 + 0.4, 0, H, -0.4, 0.0, S.wall);
    face.box(len / 2 - 0.4, len / 2, 0, H, -0.4, 0.0, S.wall);
    for (const dd of S.doors.filter((o) => o.side === side)) {
      const cx = (dd.at - 0.5) * len;
      face.box(cx - 2.2, cx + 2.2, 3.0, 3.35, 0, 1.6, MAT.concrete);   // canopy
      const dp = F.P(...face.L(cx, 0, 1.8));
      out.doors.push({ x: dp[0], z: dp[2], y: S.y0, yaw: S.yaw + (side === 'back' ? Math.PI : 0), side });
    }
  }
  // roof: parapet, and either membrane or sedum
  F.box(0, H + 0.1, 0, S.w - 0.5, 0.3, S.d - 0.5, S.green ? MAT.sedum : MAT.lead);
  for (const side of ['front', 'back', 'left', 'right']) {
    const face = faceOf(F, S.w, S.d, side);
    face.box(-face.len / 2, face.len / 2, H, H + 0.9, -0.3, 0.05, side === 'left' || side === 'right' ? S.wall : MAT.concrete);
  }
  if (S.plant) F.box(S.plant[0], H + 1.6, S.plant[1], S.plant[2], 2.8, S.plant[3], MAT.concrete);
  out.colliders = [{ x: S.x, z: S.z, hw: S.w / 2 + 0.2, hd: S.d / 2 + 0.2, yaw: S.yaw, y0: S.y0, h: H + 2 }];
  F.end();
  return out;
}

/* ---------- a Victorian glasshouse: a barrel vault with a domed crossing ---------- */
function glasshouse(b, glass, spec) {
  const S = Object.assign({ y0: 0, w: 34, d: 12, wallH: 3.2 }, spec);
  const F = new Frame(b, S.x, S.z, S.yaw, S.y0).begin();
  const G = new Frame(glass, S.x, S.z, S.yaw, S.y0);
  const white = mat(0, [0.86, 0.87, 0.85], { rough: 0.45, metal: 0.2 });
  const pane = mat(0, [0.8, 0.9, 0.88], { kind: KIND.PANE, rough: 0.05 });
  const r = S.d / 2, H0 = S.wallH;
  // brick dwarf wall
  for (const side of ['front', 'back', 'left', 'right']) {
    const face = faceOf(F, S.w, S.d, side);
    face.box(-face.len / 2, face.len / 2, 0, 0.8, -0.3, 0, MAT.brick);
    face.box(-face.len / 2 - 0.05, face.len / 2 + 0.05, 0.8, 0.9, -0.35, 0.05, MAT.ashlarW);
  }
  // ribs along the length, glazed between them
  const nr = Math.round(S.w / 2.4), seg = 10;
  const arc = (t) => [Math.cos(Math.PI * t) * r, H0 + Math.sin(Math.PI * t) * r * 0.85];   // (z, y) across the vault
  for (let i = 0; i <= nr; i++) {
    const x = -S.w / 2 + i * (S.w / nr);
    F.box(x, (0.9 + H0) / 2, r - 0.05, 0.1, H0 - 0.9, 0.1, white);
    F.box(x, (0.9 + H0) / 2, -r + 0.05, 0.1, H0 - 0.9, 0.1, white);
    for (let k = 0; k < seg; k++) {
      const [z0, y0] = arc(k / seg), [z1, y1] = arc((k + 1) / seg);
      strut(F.b, F.P(x, y0, z0), F.P(x, y1, z1), 0.1, white);
    }
    if (i < nr) {
      const x1 = -S.w / 2 + (i + 1) * (S.w / nr);
      for (const zz of [r - 0.05, -r + 0.05]) G.quad(zz > 0 ? [x, 0.9, zz] : [x1, 0.9, zz], zz > 0 ? [x1, 0.9, zz] : [x, 0.9, zz], zz > 0 ? [x1, H0, zz] : [x, H0, zz], zz > 0 ? [x, H0, zz] : [x1, H0, zz], pane);
      for (let k = 0; k < seg; k++) {
        const [z0, y0] = arc(k / seg), [z1, y1] = arc((k + 1) / seg);
        G.quad([x, y0, z0], [x, y1, z1], [x1, y1, z1], [x1, y0, z0], pane);
        if (k % 2 === 0) strut(F.b, F.P(x, y0, z0), F.P(x1, y0, z0), 0.05, white);
      }
    }
  }
  // glazed end walls
  for (const sx of [-1, 1]) {
    const x = sx * S.w / 2;
    for (let k = 0; k < seg; k++) {
      const [z0, y0] = arc(k / seg), [z1, y1] = arc((k + 1) / seg);
      if (sx > 0) G.quad([x, 0.9, z0], [x, 0.9, z1], [x, y1, z1], [x, y0, z0], pane); else G.quad([x, 0.9, z1], [x, 0.9, z0], [x, y0, z0], [x, y1, z1], pane);
      F.box(x, (0.9 + (y0 + y1) / 2) / 2, (z0 + z1) / 2, 0.08, (y0 + y1) / 2 - 0.9, 0.06, white);
    }
  }
  // the domed crossing
  const dr = r * 1.15, dy = H0 + r * 0.85 - 0.6;
  const dseg = 16, drings = 6;
  for (let i = 0; i < dseg; i++) {
    const a0 = (i / dseg) * TAU, a1 = ((i + 1) / dseg) * TAU;
    for (let k = 0; k < drings; k++) {
      const p0 = (k / drings) * Math.PI / 2, p1 = ((k + 1) / drings) * Math.PI / 2;
      const P = (a, p) => [Math.cos(a) * Math.cos(p) * dr, dy + Math.sin(p) * dr * 0.9, Math.sin(a) * Math.cos(p) * dr];
      G.quad(P(a1, p0), P(a0, p0), P(a0, p1), P(a1, p1), pane);
      strut(F.b, F.P(...P(a0, p0)), F.P(...P(a0, p1)), 0.07, white);
    }
  }
  F.prim(SPHERE_LO, 0, dy + dr * 0.9 + 0.3, 0, 0.6, 0.6, 0.6, white);
  F.end();
  return { colliders: [{ x: S.x, z: S.z, hw: S.w / 2 + 0.2, hd: S.d / 2 + 0.2, yaw: S.yaw, y0: S.y0, h: 12 }], frame: F };
}
