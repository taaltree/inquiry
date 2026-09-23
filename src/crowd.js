/* ============================================================
   crowd.js — campus life. Students do things together: talk in
   circles and laugh at each other's stories, sunbathe, play beer
   pong and frisbee, picnic, sing along to a guitar, take selfies at
   the fountain, study on the grass, sit on benches and café chairs.

   Each group is a scene with its own little state machine; the scene
   sets what each member wants to be doing (a posture, overlays such
   as laugh/talk/drink, where to look, what to hold) and every member
   eases toward it, so nobody snaps between poses. Groups are also the
   social network knowledge travels along: teach one member and they
   pass it on to the rest (word of mouth, see Life.update).
   ============================================================ */

const LIN = (h) => hex2rgb(h).map((c) => Math.pow(c, 2.2));

/* ---------- things people hold ---------- */
function buildCrowdProps(gl) {
  const P = {};
  const mk = (fn, cap = 512) => { const b = new Builder(cap); fn(b); return b.upload(gl); };
  const red = mat(0, LIN('#c8201c'), { rough: 0.35 }), white = mat(0, [0.82, 0.82, 0.8], { rough: 0.45 });
  const amber = mat(0, LIN('#e0a83c'), { rough: 0.08, glow: 0.05 });
  // party cup, origin at its base
  P.cup = mk((b) => {
    b.add(pCyl(14, false, true, 0.5, 0.36), xform([0, 0.06, 0], [0, 0, 0], [0.094, 0.12, 0.094]), red);
    b.add(pTorus(0.09, 14, 4), xform([0, 0.12, 0], [0, 0, 0], [0.094, 0.094, 0.094]), white);
    b.add(pCyl(14, true, false), xform([0, 0.1, 0], [0, 0, 0], [0.088, 0.004, 0.088]), amber);
  });
  // takeaway coffee
  P.coffee = mk((b) => {
    b.add(pCyl(14, true, true, 0.5, 0.4), xform([0, 0.065, 0], [0, 0, 0], [0.085, 0.13, 0.085]), white);
    b.add(pCyl(14, false, false, 0.5, 0.46), xform([0, 0.06, 0], [0, 0, 0], [0.088, 0.05, 0.088]), mat(TX.FABRIC, LIN('#8a5a36'), { uv: 'local', tile: 0.2 }));
    b.add(pCyl(14, true, true, 0.46, 0.52), xform([0, 0.138, 0], [0, 0, 0], [0.09, 0.018, 0.09]), mat(0, [0.05, 0.05, 0.05], { rough: 0.4 }));
  });
  // phone: screen faces +z, long side along y
  P.phone = mk((b) => {
    b.add(BOX, xform([0, 0, 0], [0, 0, 0], [0.074, 0.152, 0.009]), mat(0, [0.02, 0.02, 0.025], { rough: 0.25, metal: 0.4 }));
    b.add(BOX, xform([0, 0, 0.0048], [0, 0, 0], [0.066, 0.138, 0.001]), mat(0, [0.35, 0.5, 0.75], { glow: 0.55, rough: 0.1 }));
  });
  // an open book, spine along y, pages facing +z
  P.book = mk((b) => {
    const cover = mat(0, LIN('#2a4a7a'), { rough: 0.7 }), page = mat(0, [0.85, 0.83, 0.76], { rough: 0.9 });
    for (const s of [-1, 1]) {
      b.add(BOX, xform([s * 0.075, 0, -0.012], [0, s * 0.22, 0], [0.15, 0.21, 0.006]), cover);
      b.add(BOX, xform([s * 0.072, 0, -0.004], [0, s * 0.22, 0], [0.14, 0.2, 0.012]), page);
    }
  });
  P.laptop = mk((b) => {
    const alu = mat(0, [0.55, 0.56, 0.58], { rough: 0.35, metal: 0.8 });
    b.add(BOX, xform([0, 0.009, 0], [0, 0, 0], [0.32, 0.018, 0.22]), alu);
    b.add(BOX, xform([0, 0.11, -0.13], [-0.3, 0, 0], [0.32, 0.21, 0.01]), alu);
    b.add(BOX, xform([0, 0.11, -0.124], [-0.3, 0, 0], [0.29, 0.18, 0.002]), mat(0, [0.4, 0.55, 0.8], { glow: 0.6, rough: 0.1 }));
  });
  // guitar: body at the origin, neck along +x, strings facing +z
  P.guitar = mk((b) => {
    const wood = mat(TX.WOOD, LIN('#b87a3a'), { uv: 'local', tile: 0.3, rough: 0.35 });
    const dark = mat(0, LIN('#2a1a10'), { rough: 0.5 });
    b.add(SPHERE, xform([-0.07, 0, 0], [0, 0, 0], [0.38, 0.34, 0.1]), wood);
    b.add(SPHERE, xform([0.14, 0, 0], [0, 0, 0], [0.28, 0.26, 0.1]), wood);
    b.add(pCyl(16), xform([0.04, 0, 0.049], [Math.PI / 2, 0, 0], [0.09, 0.004, 0.09]), dark);
    b.add(BOX, xform([0.5, 0, 0.03], [0, 0, 0], [0.5, 0.05, 0.028]), dark);
    b.add(BOX, xform([0.8, 0, 0.02], [0, 0, 0.12], [0.16, 0.075, 0.022]), wood);
    b.add(BOX, xform([-0.15, 0, 0.05], [0, 0, 0], [0.03, 0.09, 0.012]), dark);
  });
  P.frisbee = mk((b) => {
    const c = mat(0, LIN('#f2a51c'), { rough: 0.4, glow: 0.04 });
    b.add(pCyl(20, true, true, 0.5, 0.46), xform([0, 0, 0], [0, 0, 0], [0.27, 0.024, 0.27]), c);
    b.add(pTorus(0.07, 20, 5), xform([0, -0.008, 0], [0, 0, 0], [0.27, 0.27, 0.27]), c);
  });
  P.sack = mk((b) => {
    b.add(SPHERE_LO, xform([0, 0, 0], [0, 0, 0], [0.06, 0.055, 0.06]), mat(TX.FABRIC, LIN('#3a7ac8'), { uv: 'local', tile: 0.05 }));
    b.add(SPHERE_LO, xform([0, 0.004, 0], [0.5, 0, 0], [0.061, 0.03, 0.061]), mat(TX.FABRIC, LIN('#e0b020'), { uv: 'local', tile: 0.05 }));
  });
  P.ball = mk((b) => b.add(SPHERE_LO, xform([0, 0, 0], [0, 0, 0], [0.04, 0.04, 0.04]), mat(0, [0.95, 0.93, 0.88], { rough: 0.3, glow: 0.08 })));
  P.bottle = mk((b) => {
    const g = mat(0, LIN('#2f6a3a'), { rough: 0.08, metal: 0.1 });
    b.add(pCyl(12), xform([0, 0.075, 0], [0, 0, 0], [0.062, 0.15, 0.062]), g);
    b.add(pCyl(12, true, true, 0.2, 0.5), xform([0, 0.17, 0], [0, 0, 0], [0.062, 0.04, 0.062]), g);
    b.add(pCyl(10), xform([0, 0.21, 0], [0, 0, 0], [0.026, 0.05, 0.026]), g);
  });
  P.sandwich = mk((b) => {
    b.add(TRI, xform([0, 0, 0], [Math.PI / 2, 0, 0], [0.11, 0.035, 0.1]), mat(0, LIN('#e6cf9a'), { rough: 0.9 }));
    b.add(TRI, xform([0, 0, 0.001], [Math.PI / 2, 0, 0], [0.1, 0.037, 0.092]), mat(0, LIN('#6aa84a'), { rough: 0.9 }));
  });
  P.can = mk((b) => {
    b.add(pCyl(12), xform([0, 0.06, 0], [0, 0, 0], [0.066, 0.12, 0.066]), mat(0, LIN('#d8322a'), { rough: 0.3, metal: 0.6 }));
    b.add(pCyl(12), xform([0, 0.121, 0], [0, 0, 0], [0.06, 0.004, 0.06]), mat(0, [0.7, 0.7, 0.72], { rough: 0.3, metal: 0.9 }));
  });
  // held item poses in the hand frame (right hand; the left mirrors x)
  P.hold = {
    cup:      { t: [0.035, -0.035, -0.06], r: [Math.PI / 2, 0, 0], s: 1 },
    coffee:   { t: [0.035, -0.035, -0.065], r: [Math.PI / 2, 0, 0], s: 1 },
    can:      { t: [0.035, -0.035, -0.06], r: [Math.PI / 2, 0, 0], s: 1 },
    bottle:   { t: [0.03, -0.03, -0.1], r: [Math.PI / 2, 0, 0], s: 1 },
    phone:    { t: [0.01, -0.07, 0.0], r: [-Math.PI / 2, Math.PI, 0], s: 1 },
    book:     { t: [0.07, -0.06, 0.02], r: [-Math.PI / 2, Math.PI, 0], s: 1 },
    sandwich: { t: [0.02, -0.06, 0.02], r: [0, 0, 0], s: 1 },
    frisbee:  { t: [0.0, -0.09, 0.04], r: [0, 0, Math.PI / 2], s: 1 },
    sack:     { t: [0.0, -0.05, 0.02], r: [0, 0, 0], s: 1 },
    ball:     { t: [0.0, -0.035, 0.03], r: [0, 0, 0], s: 1 },
  };
  return P;
}

/* ---------- things that stay put: towels, blankets, the pong tables ---------- */
function crowdTowel(b, x, y, z, yaw, cA, cB) {
  const F = (lx, lz) => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), y, z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
  const A = mat(TX.FABRIC, LIN(cA), { uv: 'local', tile: 0.4, rough: 0.95 }), B2 = mat(TX.FABRIC, LIN(cB), { uv: 'local', tile: 0.4, rough: 0.95 });
  b.add(BOX, xform(F(0, 0), [0, yaw, 0], [0.82, 0.014, 1.86]), A);
  for (const lz of [-0.62, 0, 0.62]) { const p = F(0, lz); p[1] += 0.005; b.add(BOX, xform(p, [0, yaw, 0], [0.822, 0.014, 0.14]), B2); }
}
function crowdBlanket(b, x, y, z, yaw, cA, cB, size = 2.1) {
  const F = (lx, lz) => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), y, z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
  const A = mat(TX.FABRIC, LIN(cA), { uv: 'local', tile: 0.5, rough: 0.95 }), B2 = mat(TX.FABRIC, LIN(cB), { uv: 'local', tile: 0.5, rough: 0.95 });
  b.add(BOX, xform(F(0, 0), [0, yaw, 0], [size, 0.012, size]), A);
  const n = 6, q = size / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if ((i + j) % 2) continue;
    const p = F(-size / 2 + (i + 0.5) * q, -size / 2 + (j + 0.5) * q); p[1] += 0.004;
    b.add(BOX, xform(p, [0, yaw, 0], [q, 0.012, q]), B2);
  }
}
function crowdBasket(b, x, y, z, yaw) {
  const wicker = mat(TX.WOOD, LIN('#9a6a38'), { uv: 'local', tile: 0.15, rough: 0.9 });
  b.add(BOX, xform([x, y + 0.12, z], [0, yaw, 0], [0.44, 0.24, 0.3]), wicker);
  b.add(pTorus(0.04, 16, 4), xform([x, y + 0.24, z], [Math.PI / 2, yaw, 0], [0.34, 0.34, 0.34]), wicker);
  b.add(pCyl(12), xform([x + 0.4 * Math.cos(yaw), y + 0.007, z - 0.4 * Math.sin(yaw)], [0, 0, 0], [0.24, 0.014, 0.24]), mat(0, [0.85, 0.85, 0.82], { rough: 0.4 }));
  b.add(SPHERE_LO, xform([x + 0.4 * Math.cos(yaw), y + 0.04, z - 0.4 * Math.sin(yaw)], [0, 0, 0], [0.07, 0.06, 0.07]), mat(0, LIN('#b0282a'), { rough: 0.4 }));
  b.add(SPHERE_LO, xform([x + 0.45 * Math.cos(yaw) + 0.05, y + 0.04, z - 0.45 * Math.sin(yaw)], [0, 0, 0], [0.06, 0.055, 0.06]), mat(0, LIN('#7ab040'), { rough: 0.4 }));
}
function crowdPongTable(b, x, y, z, yaw) {
  const top = mat(0, [0.78, 0.78, 0.76], { rough: 0.45 }), leg = mat(0, [0.15, 0.15, 0.16], { rough: 0.4, metal: 0.6 });
  const F = (lx, ly, lz) => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), y + ly, z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
  b.add(BOX, xform(F(0, 0.72, 0), [0, yaw, 0], [0.62, 0.035, 2.44]), top);
  b.add(BOX, xform(F(0, 0.739, 0), [0, yaw, 0], [0.62, 0.004, 0.05]), mat(0, LIN('#1f3a8a'), { rough: 0.5 }));
  for (const lz of [-1.05, 1.05]) for (const lx of [-0.26, 0.26]) b.add(BOX, xform(F(lx, 0.36, lz), [0, yaw, 0], [0.035, 0.72, 0.035]), leg);
  for (const lz of [-1.05, 1.05]) b.add(BOX, xform(F(0, 0.12, lz), [0, yaw, 0], [0.52, 0.03, 0.03]), leg);
  // a cool box and a little speaker by the table
  const cb = F(0.75, 0, 1.6);
  b.add(BOX, xform([cb[0], y + 0.19, cb[2]], [0, yaw + 0.3, 0], [0.55, 0.36, 0.36]), mat(0, LIN('#2a6ab8'), { rough: 0.4 }));
  b.add(BOX, xform([cb[0], y + 0.39, cb[2]], [0, yaw + 0.3, 0], [0.57, 0.05, 0.38]), mat(0, [0.85, 0.85, 0.83], { rough: 0.4 }));
  const sp = F(-0.72, 0, -1.55);
  b.add(pCyl(14), xform([sp[0], y + 0.08, sp[2]], [0, yaw, Math.PI / 2], [0.14, 0.26, 0.14]), mat(TX.FABRIC, [0.05, 0.05, 0.055], { uv: 'local', tile: 0.1 }));
}
function crowdGuitarCase(b, x, y, z, yaw) {
  b.add(BOX, xform([x, y + 0.04, z], [0, yaw, 0], [0.42, 0.08, 1.05]), mat(0, [0.03, 0.03, 0.035], { rough: 0.5 }));
  b.add(BOX, xform([x, y + 0.075, z], [0, yaw, 0], [0.36, 0.01, 0.98]), mat(TX.FABRIC, LIN('#8a1a2a'), { uv: 'local', tile: 0.2 }));
}

/* ---------- where the groups are ----------
   type · x z · yaw · n (members) · extra. Positions are nudged at build time
   until they are clear of buildings, trees, lamps, paths and water. */
const CROWD_SCENES = [
  // the Great Court lawns and the fountain
  { type: 'pong', x: -17, z: 18, yaw: Math.PI / 4, n: 7 },
  { type: 'guitar', x: -18, z: -17, yaw: 0.4, n: 5 },
  { type: 'sunbathe', x: 19, z: -18, yaw: 0.25, n: 3 },
  { type: 'frisbee', x: 12, z: 27, x2: 26, z2: 14, n: 2 },
  { type: 'chat', x: 23, z: 25, yaw: 0, n: 4 },
  { type: 'picnic', x: 8.5, z: -22, yaw: 0.6, n: 3 },
  { type: 'selfie', x: -7.2, z: 7.8, yaw: Math.atan2(-0.68, 0.73), n: 3 },
  { type: 'rim', x: 0, z: 0, n: 2, a0: 2.25 },
  { type: 'chat', x: 9, z: 38.5, yaw: 0, n: 3 },
  { type: 'chat', x: -26, z: -37.5, yaw: 0, n: 2 },
  // the Backs
  { type: 'pong', x: -100, z: 30, yaw: 0.1, n: 7 },
  { type: 'sunbathe', x: -142, z: -26, yaw: 0.4, n: 4 },
  { type: 'frisbee', x: -120, z: -38, x2: -103, z2: -24, n: 3 },
  { type: 'picnic', x: -172, z: 20, yaw: 0.2, n: 4 },
  { type: 'hacky', x: -84, z: -28, yaw: 0, n: 4 },
  { type: 'chat', x: -197, z: -42, yaw: 0, n: 3 },
  { type: 'study', x: -128, z: 30, yaw: -0.4, n: 2 },
  { type: 'bank', x: -226, z: -18, yaw: -Math.PI / 2, n: 2 },
  { type: 'guitar', x: -160, z: 44, yaw: 2.4, n: 4 },
  // the playing fields and the pavilion
  { type: 'frisbee', x: -48, z: -254, x2: -26, z2: -240, n: 3 },
  { type: 'chat', x: 16, z: -210, yaw: 0, n: 4 },
  { type: 'picnic', x: 46, z: -232, yaw: -0.3, n: 3 },
  { type: 'sunbathe', x: -72, z: -226, yaw: 0.1, n: 2 },
  { type: 'hacky', x: 72, z: -262, yaw: 0, n: 3 },
  // the Engine House roof
  { type: 'pong', dept: 'engine', roof: true, n: 6 },
];
/* two groups outside each department, on the side you walk up from */
const DEPT_SCENES = {
  foundry:     [{ type: 'chat', n: 4 }, { type: 'picnic', n: 3 }],
  observatory: [{ type: 'sunbathe', n: 3 }, { type: 'study', n: 2 }, { type: 'chat', n: 2 }],
  helix:       [{ type: 'frisbee', n: 2 }, { type: 'chat', n: 3 }, { type: 'sunbathe', n: 2 }],
  lattice:     [{ type: 'hacky', n: 4 }, { type: 'sunbathe', n: 2 }],
  engine:      [{ type: 'chat', n: 3 }, { type: 'selfie', n: 3 }],
};

/* ============================================================ */
const ACT_KEYS = ['talk', 'laugh', 'nod', 'phone', 'drink', 'eat', 'clap', 'cheer', 'handsHead', 'wave', 'point', 'shade', 'crossArms', 'pockets', 'hipR', 'sway'];
const newAct = () => { const o = {}; for (const k of ACT_KEYS) o[k] = 0; return o; };
const POST_STATE = { stand: 'idle', seat: 'sit', cross: 'cross', sitGround: 'sitGround', lieBack: 'lieBack', lieFront: 'lieFront', squat: 'squat', kneel: 'kneel' };
const SURF_LIFT = 0.06;        // lawns +0.078, paths +0.07, paving +0.035 above groundH
const PONG_CUPS = [[-0.094, 1.12], [0, 1.12], [0.094, 1.12], [-0.047, 1.039], [0.047, 1.039], [0, 0.958]];
const TABLE_TOP = 0.7375;

class Crowd {
  constructor(gl, life, game) {
    this.gl = gl; this.life = life; this.game = game;
    this.rnd = mulberry(80801);
    this.props = buildCrowdProps(gl);
    this.scenes = [];
    this.flying = [];          // balls, discs and sacks in the air
    this.bubbles = [];         // speech bubbles over heads
    this.bubbleTex = new Map();
    this.m = M4.create(); this.m2 = M4.create(); this.m3 = M4.create();
    const B = new ChunkedBuilder(64);
    this.B = B;
    for (const def of CROWD_SCENES) this.addScene(def);
    for (const d of DISTRICTS) {
      const list = DEPT_SCENES[d.id] || [];
      list.forEach((def, k) => { if (!def.roof) this.addScene(Object.assign({ dept: d.id, k, m: list.length }, def)); });
    }
    this.addSeats();
    this.staticChunks = B.upload(gl);
    this.B = null;
  }

  /* ---------- placement ---------- */
  clearAt(x, z, r, paths) {
    if (!isWalkable(x, z) || Math.abs(x - riverX(z)) < 13.5 + r) return false;
    if (Math.abs(x) > WORLD_HALF - 10 || Math.abs(z) > WORLD_HALF - 10) return false;
    for (const c of this.game.colliders) {
      if (c.obb) {
        const dx = x - c.x, dz = z - c.z, co = Math.cos(c.yaw), si = Math.sin(c.yaw);
        const lx = dx * co - dz * si, lz = dx * si + dz * co;
        if (Math.abs(lx) < c.hw + r && Math.abs(lz) < c.hd + r) return false;
      } else if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + r) ** 2) return false;
    }
    if (paths) for (const p of this.game.world.paths) {
      for (let k = 0; k < p.pts.length - 1; k++) {
        const [x0, z0] = p.pts[k], [x1, z1] = p.pts[k + 1];
        const vx = x1 - x0, vz = z1 - z0, L2 = vx * vx + vz * vz || 1;
        const u = clamp(((x - x0) * vx + (z - z0) * vz) / L2, 0, 1);
        if (Math.hypot(x - (x0 + vx * u), z - (z0 + vz * u)) < p.w / 2 + r + 0.6) return false;
      }
    }
    for (const sc of this.scenes) if (Math.hypot(x - sc.x, z - sc.z) < sc.r + r + 1.5) return false;
    for (const d of DISTRICTS) if (Math.hypot(x - d.cx, z - d.cz) < 13 + r) return false;
    return true;
  }
  nudge(x, z, r, paths = true) {
    if (this.clearAt(x, z, r, paths)) return [x, z];
    for (let rad = 1.5; rad < 30; rad += 1.5) {
      const n = Math.max(8, Math.round(rad * 3));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rad;
        const nx = x + Math.cos(a) * rad, nz = z + Math.sin(a) * rad;
        if (this.clearAt(nx, nz, r, paths)) return [nx, nz];
      }
    }
    return null;
  }

  /* a new member of a scene: a student with a place, a posture and a routine */
  member(sc, x, z, yaw, post, o = {}) {
    const L = this.life, R = this.rnd;
    const s = L.makeStudent(L.students.length, x, z, yaw);
    s.scene = sc; s.state = 'scene';
    s.post = post; s.postFrom = post; s.pblend = 1;
    s.hx = x; s.hz = z; s.faceYaw = yaw; s.yaw = yaw;
    s.y0 = o.y0 == null ? null : o.y0;
    s.seat = o.seat || 0.46; s.v = o.v == null ? (R() * 4) | 0 : o.v;
    s.hold = { R: o.holdR || null, L: o.holdL || null };
    s.act = newAct(); s.W = newAct(); s.base = newAct();
    s.lv = (R() * 3) | 0; s.look = null; s.ly = 0; s.lp = 0;
    s.laughFrom = 0; s.laughUntil = 0; s.laughAmp = 1;
    s.lookOpts = { summer: !!o.summer, mixed: !o.summer, pack: o.pack !== false && post === 'stand' };
    s.goal = null; s.moving = false; s.ikL = null; s.ikR = null; s.kickNow = 0; s.jumpNow = 0;
    s.idle = R() * 6; s.sipT = 3 + R() * 10;
    // standing habits: some people fold their arms, some keep their hands in their pockets
    if (post === 'stand' && !o.holdR) {
      const h = R();
      if (h < 0.22) s.base.crossArms = 0.9; else if (h < 0.4) s.base.pockets = 0.9; else if (h < 0.5) s.base.hipR = 0.8;
    }
    sc.members.push(s);
    L.students.push(s);
    return s;
  }

  addScene(def) {
    const R = this.rnd, B = this.B;
    let x = def.x, z = def.z, yaw = def.yaw || 0, y0 = null;
    if (def.dept) {
      const D = DEPT[def.dept], d = DISTRICTS.find((q) => q.id === def.dept);
      if (def.roof) { x = D.bx; z = D.bz; yaw = D.yaw; y0 = 11.1; }
      else {
        // out on the approach side of the forecourt, spread either side of the path
        let ax = d.cx - D.bx, az = d.cz - D.bz; const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
        const lat = (def.k - (def.m - 1) / 2) * 15;
        x = d.cx + ax * (24 + (def.k % 2) * 5) + az * lat; z = d.cz + az * (24 + (def.k % 2) * 5) - ax * lat;
        yaw = Math.atan2(ax, az) + (R() - 0.5);
      }
    }
    const radius = { pong: 2.6, chat: 1.3, sunbathe: 1.2 * (def.n || 2) + 0.6, picnic: 1.9, frisbee: 1.2, hacky: 1.4, selfie: 1.0, guitar: 2.2, study: 1.4, bank: 1.6, rim: 0 }[def.type] || 1.5;
    if (def.type === 'frisbee' && def.x2 == null) {
      // a department's frisbee pair: a line across the lawn
      const a = yaw + Math.PI / 2;
      def = Object.assign({}, def, { x: x - Math.sin(a) * 7, z: z - Math.cos(a) * 7, x2: x + Math.sin(a) * 7, z2: z + Math.cos(a) * 7 });
      x = def.x; z = def.z;
    }
    if (y0 == null && def.type !== 'rim' && def.type !== 'bank') {
      const p = this.nudge(x, z, radius, def.type !== 'chat' || !!def.dept);
      if (!p) return null;
      x = p[0]; z = p[1];
    }
    const sc = { type: def.type, x, z, yaw, y0, r: radius, members: [], clock: R() * 10, near: false, dist: 999, def };
    // lawns and paths sit a few centimetres above the terrain height
    const gy = (px, pz) => (y0 == null ? groundH(px, pz) + SURF_LIFT : y0);
    const F = (lx, lz) => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
    const n = def.n || 3;
    const TOWELS = [['#e84a5f', '#ffffff'], ['#2a9df4', '#ffe066'], ['#3ac47d', '#ffffff'], ['#f7a440', '#8a3ab9'], ['#ffffff', '#1f5fa8'], ['#ff7eb6', '#fff3b0']];
    switch (def.type) {
      case 'chat': {
        const rr = 0.55 + n * 0.14;
        for (let i = 0; i < n; i++) {
          const a = yaw + (i / n) * TAU + (R() - 0.5) * 0.3;
          const px = x + Math.sin(a) * rr, pz = z + Math.cos(a) * rr;
          const hold = R() < 0.35 ? (R() < 0.5 ? 'coffee' : 'cup') : null;
          this.member(sc, px, pz, Math.atan2(x - px, z - pz) + (R() - 0.5) * 0.25, 'stand', { holdR: hold, y0, summer: R() < 0.4 });
        }
        break;
      }
      case 'pong': {
        const p0 = [x, z];
        crowdPongTable(B.at(x, z), x, gy(x, z), z, yaw);
        sc.cups = [];
        for (const side of [1, -1]) for (const [lx, lz] of PONG_CUPS) sc.cups.push({ lx: lx * side, lz: lz * side, side, up: true });
        const spots = [[0.36, 1.55, Math.PI], [-0.36, 1.55, Math.PI], [0.36, -1.55, 0], [-0.36, -1.55, 0],
          [1.3, 0.45, -Math.PI / 2], [-1.35, -0.3, Math.PI / 2], [1.35, -0.55, -Math.PI / 2], [-1.3, 0.6, Math.PI / 2]];
        for (let i = 0; i < Math.min(n, spots.length); i++) {
          const [lx, lz, ly] = spots[i], p = F(lx + (i >= 4 ? (R() - 0.5) * 0.3 : 0), lz);
          this.member(sc, p[0], p[1], yaw + ly + (i >= 4 ? (R() - 0.5) * 0.4 : 0), 'stand', { y0, summer: R() < 0.6, holdR: i >= 4 && R() < 0.6 ? 'cup' : null, pack: false });
        }
        sc.pong = { team: 0, shooter: 0, phase: 'aim', timer: 2 + R() * 2, streak: 0 };
        void p0;
        break;
      }
      case 'sunbathe': {
        for (let i = 0; i < n; i++) {
          const lx = (i - (n - 1) / 2) * 1.15, p = F(lx, (R() - 0.5) * 0.4);
          const col = TOWELS[(i + Math.abs((x * 7) | 0)) % TOWELS.length];
          crowdTowel(B.at(p[0], p[1]), p[0], gy(p[0], p[1]) + 0.028, p[1], yaw, col[0], col[1]);
          const front = R() < 0.35;
          // shift the pelvis toward the head end so the whole body lies on the towel
          const sh = front ? 0.1 : -0.1;
          const m = this.member(sc, p[0] + Math.sin(yaw) * sh, p[1] + Math.cos(yaw) * sh, yaw, front ? 'lieFront' : 'lieBack', { y0, summer: true, pack: false, holdR: front ? (R() < 0.5 ? 'book' : 'phone') : null });
          m.routine = 0; m.nextT = 4 + R() * 16;
        }
        break;
      }
      case 'picnic': {
        crowdBlanket(B.at(x, z), x, gy(x, z) + 0.026, z, yaw, R() < 0.5 ? '#c8283a' : '#2a5ab8', '#f2efe6');
        crowdBasket(B.at(x, z), x + 0.2, gy(x, z) + 0.03, z - 0.1, yaw + 0.4);
        const posts = ['cross', 'sitGround', 'cross', 'lieFront', 'sitGround'];
        for (let i = 0; i < n; i++) {
          const a = yaw + (i / n) * TAU + 0.3;
          const rr = posts[i % posts.length] === 'lieFront' ? 1.35 : 1.0;
          const px = x + Math.sin(a) * rr, pz = z + Math.cos(a) * rr;
          const post = posts[i % posts.length];
          const faceIn = Math.atan2(x - px, z - pz);
          this.member(sc, px, pz, post === 'lieFront' ? faceIn : faceIn, post, { y0, summer: R() < 0.7, pack: false, holdR: R() < 0.5 ? (R() < 0.5 ? 'can' : 'sandwich') : null });
        }
        break;
      }
      case 'frisbee': {
        const pts = [[def.x, def.z], [def.x2, def.z2]];
        if (n >= 3) {
          const mx = (def.x + def.x2) / 2, mz = (def.z + def.z2) / 2, dx = def.x2 - def.x, dz = def.z2 - def.z;
          pts.push([mx - dz * 0.55, mz + dx * 0.55]);
        }
        const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
        sc.x = cx; sc.z = cz;
        pts.forEach(([px, pz], i) => {
          const q = y0 == null ? (this.nudge(px, pz, 0.8, true) || [px, pz]) : [px, pz];
          const m = this.member(sc, q[0], q[1], Math.atan2(cx - q[0], cz - q[1]), 'stand', { y0, summer: true, pack: false, holdR: i === 0 ? 'frisbee' : null });
          m.base.crossArms = 0; m.base.pockets = 0; m.base.hipR = 0;
        });
        sc.fr = { holder: 0, phase: 'hold', timer: 1.5 + R() * 2, target: 1 };
        break;
      }
      case 'hacky': {
        for (let i = 0; i < n; i++) {
          const a = yaw + (i / n) * TAU, px = x + Math.sin(a) * 1.05, pz = z + Math.cos(a) * 1.05;
          const m = this.member(sc, px, pz, Math.atan2(x - px, z - pz), 'stand', { y0, summer: R() < 0.5, pack: false });
          m.base.crossArms = 0; m.base.pockets = 0; m.base.hipR = 0;
        }
        sc.hk = { kicker: 0, phase: 'toss', timer: 1 + R(), sack: null, count: 0 };
        break;
      }
      case 'selfie': {
        const offs = [[0, 0.25], [-0.55, 0], [0.55, 0], [-0.3, -0.45], [0.3, -0.45]];
        for (let i = 0; i < n; i++) {
          const [lx, lz] = offs[i], p = F(lx, lz);
          const m = this.member(sc, p[0], p[1], yaw + (R() - 0.5) * 0.2 - lx * 0.4, 'stand', { y0, holdR: i === 0 ? 'phone' : null, summer: R() < 0.5, pack: false });
          m.base.crossArms = 0; m.base.pockets = 0;
        }
        sc.sf = { phase: 'pose', timer: 2 + R() * 2 };
        break;
      }
      case 'guitar': {
        crowdGuitarCase(B.at(x, z), x + Math.cos(yaw) * 0.9, gy(x, z) + 0.02, z - Math.sin(yaw) * 0.9, yaw + 0.3);
        const g = this.member(sc, x, z, yaw, 'cross', { y0, pack: false, v: 0 });
        g.guitar = true;
        const posts = ['sitGround', 'cross', 'lieFront', 'sitGround', 'cross'];
        for (let i = 1; i < n; i++) {
          const a = yaw + (i - n / 2) * 0.62, rr = 1.9 + (i % 2) * 0.35;
          const px = x + Math.sin(a) * rr, pz = z + Math.cos(a) * rr;
          const post = posts[(i - 1) % posts.length];
          this.member(sc, px, pz, Math.atan2(x - px, z - pz), post, { y0, summer: R() < 0.5, pack: false, holdR: R() < 0.35 ? 'can' : null });
        }
        sc.gu = { playing: false, timer: 3 + R() * 4, beat: 0, chord: 0, song: (R() * 3) | 0 };
        break;
      }
      case 'study': {
        for (let i = 0; i < n; i++) {
          const p = F((i - (n - 1) / 2) * 1.4, 0);
          const lap = i % 2 === 0;
          const m = this.member(sc, p[0], p[1], yaw + (R() - 0.5) * 0.6, lap ? 'cross' : 'lieFront', { y0, pack: false, holdR: lap ? null : 'book' });
          m.laptop = lap;
        }
        break;
      }
      case 'bank': {
        // sitting on the bank above the river, feet toward the water
        for (let i = 0; i < n; i++) {
          const zz = z + i * 1.3, xx = riverX(zz) + 14.6;
          this.member(sc, xx, zz, -Math.PI / 2 + (R() - 0.5) * 0.3, 'sitGround', { summer: R() < 0.5, pack: false, holdR: R() < 0.5 ? 'bottle' : null });
        }
        sc.x = riverX(z) + 14.6;
        break;
      }
      case 'rim': {
        // on the fountain's rim, facing out
        for (let i = 0; i < n; i++) {
          const a = (def.a0 || 2.3) + i * 0.3, rr = 5.05;
          const px = Math.cos(a) * rr, pz = Math.sin(a) * rr;
          this.member(sc, px, pz, Math.atan2(px, pz), 'seat', { seat: 0.78, y0: 0.035, holdR: i === 0 ? 'coffee' : 'phone' });
        }
        sc.x = Math.cos(def.a0 || 2.3) * 5; sc.z = Math.sin(def.a0 || 2.3) * 5;
        break;
      }
    }
    if (!sc.members.length) return null;
    this.scenes.push(sc);
    return sc;
  }

  /* benches and café chairs from the world, some of them occupied */
  addSeats() {
    const R = this.rnd, seats = this.game.world.seats || [];
    let benches = 0, cafes = 0;
    for (const st of seats) {
      if (st.kind === 'bench') {
        if (benches >= 12 || R() > 0.3) continue;
        if (st.x < -300 || Math.abs(st.z - 205) < 12) continue;
        benches++;
        const sc = { type: 'seat', x: st.x, z: st.z, yaw: st.yaw, y0: null, r: 1, members: [], clock: R() * 10, near: false, dist: 999, def: {} };
        const two = R() < 0.55;
        const places = two ? [-0.42, 0.42] : [(R() - 0.5) * 0.6];
        for (const lx of places) {
          const px = st.x + Math.cos(st.yaw) * lx - Math.sin(st.yaw) * 0.05, pz = st.z - Math.sin(st.yaw) * lx - Math.cos(st.yaw) * 0.05;
          const pick = R();
          this.member(sc, px, pz, st.yaw, 'seat', { seat: 0.44, holdR: pick < 0.3 ? 'book' : pick < 0.55 ? 'phone' : pick < 0.75 ? 'coffee' : pick < 0.85 ? 'sandwich' : null });
        }
        this.scenes.push(sc);
      } else if (st.kind === 'cafe') {
        if (cafes >= 9 || R() > 0.75) continue;
        cafes++;
        const sc = { type: 'seat', x: st.x, z: st.z, yaw: st.yaw, y0: null, r: 1, members: [], clock: R() * 10, near: false, dist: 999, def: {}, cafe: st.table };
        // café chairs are grouped per table: find the table's scene if it exists
        const same = this.scenes.find((q) => q.cafe === st.table && q.members.length < 2);
        const host = same || sc;
        this.member(host, st.x, st.z, st.yaw, 'seat', { seat: 0.45, holdR: R() < 0.7 ? 'coffee' : 'phone' });
        if (!same) this.scenes.push(sc);
      }
    }
  }

  /* ---------- every frame ---------- */
  update(dt, t) {
    const G = this.game, px = G.cam.x, pz = G.cam.z;
    this.night = G.env ? G.env.night || 0 : 0;
    for (const sc of this.scenes) {
      sc.dist = Math.hypot(sc.x - px, sc.z - pz);
      sc.near = sc.dist < 45;
      sc.acc = (sc.acc || 0) + dt;
      // far-off groups carry on at a gentler tick; nobody can see them anyway
      if (sc.dist > 150 && sc.acc < 0.25) continue;
      const sdt = Math.min(sc.acc, 0.3);
      sc.acc = 0;
      sc.clock += sdt;
      for (const m of sc.members) {
        const A = m.act, B0 = m.base;
        for (const k of ACT_KEYS) A[k] = B0[k];
        m.look = null; m.ikL = null; m.ikR = null; m.jumpNow = 0; m.kickNow = 0; m.readDown = 0;
      }
      const fn = this['up_' + sc.type];
      if (fn) fn.call(this, sc, sdt, sc.clock);
      for (const m of sc.members) this.react(m, sc, sdt, t);
      for (const m of sc.members) this.ease(m, sdt);
    }
    this.updateFlying(dt);
    for (const b of this.bubbles) b.t += dt;
    this.bubbles = this.bubbles.filter((b) => b.t < b.dur);
  }

  /* ---------- small helpers ---------- */
  baseY(s) { return s.y0 != null ? s.y0 : groundH(s.x, s.z) + (s.post === 'seat' ? 0 : SURF_LIFT); }
  head(s) {
    if (s.hw) return s.hw;
    const k = s.post === 'stand' ? 1.55 : s.post === 'seat' ? 1.2 : s.post === 'lieBack' || s.post === 'lieFront' ? 0.35 : 0.85;
    return [s.x, this.baseY(s) + k, s.z];
  }
  hand(s) { return s.handR || [s.x + Math.sin(s.yaw) * 0.3, this.baseY(s) + 1.3, s.z + Math.cos(s.yaw) * 0.3]; }
  sceneP(sc, lx, lz) { return [sc.x + lx * Math.cos(sc.yaw) + lz * Math.sin(sc.yaw), sc.z - lx * Math.sin(sc.yaw) + lz * Math.cos(sc.yaw)]; }
  /* a world point in someone's own (root) frame */
  toRoot(s, wx, wy, wz) {
    const dx = wx - s.x, dz = wz - s.z, c = Math.cos(s.yaw), n = Math.sin(s.yaw);
    return [dx * c - dz * n, wy - this.baseY(s), dx * n + dz * c];
  }
  ik(s, side, x, y, z, w, px, py, pz, f) {
    const key = side > 0 ? 'IKL' : 'IKR';
    const o = s[key] || (s[key] = {});
    o.x = x; o.y = y; o.z = z; o.w = w; o.px = px; o.py = py; o.pz = pz; o.f = f || null; o.pf = f === 'root' ? 'root' : null;
    if (side > 0) s.ikL = o; else s.ikR = o;
  }
  setPost(s, post) { if (s.post === post) return; s.postFrom = s.post; s.post = post; s.pblend = 0; }
  say(s, text, dur = 3.2) {
    if (!text || !s) return;
    const G = this.game;
    if (Math.hypot(G.cam.x - s.x, G.cam.z - s.z) > 26) return;
    this.bubbles = this.bubbles.filter((b) => b.s !== s);
    if (this.bubbles.length >= 5) this.bubbles.shift();
    this.bubbles.push({ s, text, t: 0, dur });
  }
  chatter(s, sc) {
    const pool = CHATTER[sc.type] || CHATTER.chat;
    const night = (this.night || 0) > 0.55;
    let line;
    if (s.taught > 0 && s.lastConcept && this.rnd() < 0.5) line = pick(CHATTER.learned, this.rnd).replace('{c}', s.lastConcept);
    else if (sc.members.some((m) => m.confused > 0) && this.rnd() < 0.5) line = pick(CHATTER.feed, this.rnd);
    else if (night && CHATTER[sc.type + 'Night'] && this.rnd() < 0.6) line = pick(CHATTER[sc.type + 'Night'], this.rnd);
    else line = pick(this.rnd() < 0.3 ? CHATTER.chat : pool, this.rnd);
    this.say(s, line);
  }
  groupLaugh(sc, M, t) {
    let n = 0;
    for (const m of M) {
      if (m.confused > 0) continue;
      const d = this.rnd() * 0.45;
      m.laughFrom = t + d; m.laughUntil = t + d + 1.1 + this.rnd() * 1.9; m.laughAmp = 0.65 + this.rnd() * 0.35;
      n++;
    }
    if (n && sc.dist < 30) CrowdAudio.laughGroup(this.game, M);
    if (n && sc.near && this.rnd() < 0.3) this.say(M[(this.rnd() * M.length) | 0], pick(CHATTER.laugh, this.rnd), 1.8);
  }

  /* conversation: someone holds the floor, the others look at them and nod,
     and every so often a punchline sets the whole group off */
  social(sc, dt, t, M) {
    if (!M.length) return;
    const S = sc.soc || (sc.soc = { speaker: 0, speakT: 1 + this.rnd() * 3, laughAt: 1e9 });
    if (M.length > 1) {
      S.speakT -= dt;
      if (S.speakT <= 0) {
        if (this.rnd() < 0.4) S.laughAt = t + 0.2 + this.rnd() * 0.5;
        let nx = S.speaker;
        for (let k = 0; k < 5 && nx === S.speaker; k++) nx = (this.rnd() * M.length) | 0;
        S.speaker = nx; S.speakT = 2.5 + this.rnd() * 5;
        if (sc.near && this.rnd() < 0.6) this.chatter(M[nx], sc);
      }
      if (t >= S.laughAt) { S.laughAt = 1e9; this.groupLaugh(sc, M, t); }
    }
    for (let i = 0; i < M.length; i++) {
      const m = M[i], A = m.act;
      const lying = m.post === 'lieBack' || m.post === 'lieFront';
      if (M.length > 1 && i === S.speaker % M.length) {
        A.talk = Math.max(A.talk, m.post === 'stand' ? 0.85 : 0.5);
        A.crossArms = 0; A.pockets *= 0.3; A.hipR = 0;
        if (!m.lookT || t > m.lookT) { m.lookT = t + 0.8 + this.rnd() * 2; m.lookIdx = (i + 1 + ((this.rnd() * (M.length - 1)) | 0)) % M.length; }
        if (!lying) m.look = this.head(M[m.lookIdx % M.length]);
      } else if (M.length > 1) {
        if (!lying) m.look = this.head(M[S.speaker % M.length]);
        if (Math.sin(t * 0.9 + m.phase * 3) > 0.6) A.nod = Math.max(A.nod, 0.6);
      }
      if (t > m.laughFrom && t < m.laughUntil) { A.laugh = m.laughAmp; A.talk = 0; }
    }
  }
  /* drinks get drunk and sandwiches eaten */
  sips(sc, dt, t) {
    for (const m of sc.members) {
      const h = m.hold.R;
      if (!h) continue;
      if (h === 'sandwich') { m.act.eat = Math.max(m.act.eat, 0.9); continue; }
      if (h !== 'cup' && h !== 'coffee' && h !== 'can' && h !== 'bottle') continue;
      m.sipT -= dt;
      if (m.sipT <= 0) { m.sipUntil = t + 1.2 + this.rnd() * 0.6; m.sipT = 7 + this.rnd() * 12; }
      if (t < (m.sipUntil || 0)) { m.act.drink = 1; m.act.talk = 0; m.act.laugh *= 0.3; }
    }
  }
  /* phones come out between other things */
  fidget(sc, dt, t) {
    for (const m of sc.members) {
      if (m.hold.R && m.hold.R !== 'phone') continue;
      m.idle -= dt;
      if (m.idle <= 0) { m.idle = 8 + this.rnd() * 20; m.phoneUntil = t + 3 + this.rnd() * 5; }
      if (t < (m.phoneUntil || 0) && m.act.talk < 0.1) { m.act.phone = 0.85; m.holdTmp2 = 'phone'; }
      else m.holdTmp2 = null;
    }
  }

  up_chat(sc, dt, t) { this.social(sc, dt, t, sc.members); this.sips(sc, dt, t); this.fidget(sc, dt, t); }
  up_rim(sc, dt, t) { this.up_seat(sc, dt, t); }
  up_bank(sc, dt, t) { this.social(sc, dt, t, sc.members); this.sips(sc, dt, t); }

  up_seat(sc, dt, t) {
    this.social(sc, dt, t, sc.members);
    this.sips(sc, dt, t);
    for (const m of sc.members) {
      const J = m.ch ? m.ch.J : null;
      if (!J) continue;
      if (m.hold.R === 'book' && m.act.talk < 0.2 && !(t > m.laughFrom && t < m.laughUntil)) {
        // reading: the book held open in both hands, eyes down
        this.ik(m, -1, -0.07, J.shY - 0.14, 0.3, 0.95, -1, -0.5, -0.3);
        this.ik(m, 1, 0.07, J.shY - 0.14, 0.3, 0.95, 1, -0.5, -0.3);
        m.act.phone = 0; m.lp = 0; m.look = null; m.readDown = 0.45;
      } else if (m.hold.R === 'phone' && m.act.talk < 0.2) { m.act.phone = 0.8; m.readDown = 0; }
      else m.readDown = 0;
    }
  }

  up_picnic(sc, dt, t) {
    this.social(sc, dt, t, sc.members);
    this.sips(sc, dt, t);
    // now and then someone leans in for something from the basket
    for (const m of sc.members) {
      if (m.post === 'lieFront') continue;
      m.reachT = (m.reachT || 5 + this.rnd() * 15) - dt;
      if (m.reachT <= 0) { m.reachT = 9 + this.rnd() * 18; m.reachUntil = t + 1.4; }
      if (t < (m.reachUntil || 0)) {
        const r = this.toRoot(m, sc.x, this.baseY(m) + 0.12, sc.z);
        const k = Math.sin(clamp((m.reachUntil - t) / 1.4, 0, 1) * Math.PI);
        this.ik(m, -1, r[0] * 0.7, 0.14, Math.min(r[2] * 0.75, 0.75), k, -1, 0, -0.4, 'root');
      }
    }
  }

  up_sunbathe(sc, dt, t) {
    const night = (this.night || 0) > 0.55;
    const M = sc.members;
    for (let i = 0; i < M.length; i++) {
      const m = M[i], A = m.act, J = m.ch ? m.ch.J : null;
      m.nextT -= dt;
      if (m.nextT <= 0) {
        m.nextT = 8 + this.rnd() * 20;
        if (m.post === 'lieFront') m.routine = this.rnd() < 0.7 ? 0 : 1;          // read / chat
        else m.routine = night ? (this.rnd() < 0.3 ? 3 : 0) : [0, 0, 1, 2, 2][(this.rnd() * 5) | 0];   // rest, chat, sit up for a drink / stargaze
        if (m.routine === 2) m.nextT = 5 + this.rnd() * 5;
      }
      if (m.post !== 'lieFront') this.setPost(m, m.routine === 2 ? 'sitGround' : 'lieBack');
      const nb = M[i + 1] || M[i - 1];
      if (m.routine === 1 && nb) {
        if (m.post !== 'lieBack') m.look = this.head(nb);
        A.talk = Math.max(A.talk, 0.35);
        if (m.post === 'lieBack') m.lySet = (i + 1 < M.length ? -0.9 : 0.9);
      } else m.lySet = 0;
      if (m.routine === 0 && m.post === 'lieBack' && J && (m.v & 2) === 0) {
        // hands behind the head
        this.ik(m, 1, 0.1, J.neck + 0.2, -0.1, 0.9, 1, 0.4, 0);
        this.ik(m, -1, -0.1, J.neck + 0.2, -0.1, 0.9, -1, 0.4, 0);
      }
      if (m.routine === 2) {
        if (!m.hold.R) m.holdTmp2 = 'bottle';
        if (Math.sin(t * 0.7 + m.phase) > 0.5) A.drink = 1; else if (!night) A.shade = 0.8;
      } else m.holdTmp2 = null;
      if (m.routine === 3) A.point = Math.sin(t * 0.5 + m.phase) > 0.3 ? 0.9 : 0;
      if (m.post === 'lieFront' && m.hold.R === 'book' && m.routine === 0) m.readDown = 0.2;
      if (t > m.laughFrom && t < m.laughUntil) A.laugh = m.laughAmp;
    }
    if (M.length > 1) {
      sc.lt = (sc.lt || 10 + this.rnd() * 20) - dt;
      if (sc.lt <= 0) { sc.lt = 14 + this.rnd() * 26; this.groupLaugh(sc, M, t); if (sc.near) this.chatter(M[(this.rnd() * M.length) | 0], sc); }
    }
  }

  up_study(sc, dt, t) {
    for (const m of sc.members) {
      const J = m.ch ? m.ch.J : null;
      if (!J) continue;
      m.stretchT = (m.stretchT || 12 + this.rnd() * 30) - dt;
      if (m.stretchT <= 0) { m.stretchT = 25 + this.rnd() * 40; m.stretchUntil = t + 2.2; if (sc.near && this.rnd() < 0.5) this.say(m, pick(CHATTER.study, this.rnd)); }
      if (t < (m.stretchUntil || 0)) { m.act.cheer = 0.8; m.act.laugh = 0; continue; }
      if (m.laptop) {
        // typing: hands over the keys, fingers busy
        const jig = Math.sin(t * 17 + m.phase) * 0.012;
        this.ik(m, 1, 0.1, 0.22 + jig, 0.34, 1, 1, -0.3, -0.6, 'root');
        this.ik(m, -1, -0.1, 0.22 - jig, 0.34, 1, -1, -0.3, -0.6, 'root');
        m.readDown = 0.5;
      } else m.readDown = 0.2;
    }
    this.social(sc, dt, t, sc.members.length > 1 && Math.sin(t * 0.05 + sc.x) > 0.4 ? sc.members : []);
  }

  up_selfie(sc, dt, t) {
    const F = sc.sf, M = sc.members, h = M[0], J = h.ch ? h.ch.J : null;
    F.timer -= dt;
    const phone = [h.x + Math.sin(h.yaw) * 0.55, this.baseY(h) + 2.0, h.z + Math.cos(h.yaw) * 0.55];
    if (F.phase === 'pose' || F.phase === 'snap') {
      if (J) this.ik(h, -1, -0.14, J.shY + 0.36, 0.48, 1, -1, -0.6, 0);
      for (let i = 1; i < M.length; i++) {
        const m = M[i], Jm = m.ch ? m.ch.J : null;
        m.look = phone;
        if (Jm && i % 2) this.ik(m, i % 4 === 1 ? 1 : -1, (i % 4 === 1 ? 1 : -1) * 0.17, Jm.shY + 0.3, 0.12, 1, i % 4 === 1 ? 1 : -1, -0.8, 0);   // a peace sign by the face
      }
      h.look = phone;
      if (F.phase === 'pose' && F.timer <= 0) {
        F.phase = 'snap'; F.timer = 0.5;
        if (sc.dist < 40) this.game.particles.burst(phone[0], phone[1] - 0.2, phone[2], 10, { col: [1, 1, 1], speed: 0.6, life: 0.25, size: 0.35, grav: 0, drag: 3 });
        if (sc.dist < 20) CrowdAudio.click(this.game, h);
      } else if (F.phase === 'snap' && F.timer <= 0) { F.phase = 'look'; F.timer = 3.5 + this.rnd() * 2; if (this.rnd() < 0.6) this.groupLaugh(sc, M, t); if (sc.near && this.rnd() < 0.5) this.say(M[(this.rnd() * M.length) | 0], pick(CHATTER.selfie, this.rnd)); }
    } else {
      // everyone crowds round the screen to see how it came out
      h.act.phone = 1;
      const scr = [h.x + Math.sin(h.yaw) * 0.3, this.baseY(h) + 1.35, h.z + Math.cos(h.yaw) * 0.3];
      for (let i = 1; i < M.length; i++) M[i].look = scr;
      if (F.timer <= 0) { F.phase = 'pose'; F.timer = 2.5 + this.rnd() * 3; }
      for (const m of M) if (t > m.laughFrom && t < m.laughUntil) m.act.laugh = m.laughAmp;
    }
  }

  up_guitar(sc, dt, t) {
    const U = sc.gu, M = sc.members, g = M[0], J = g.ch ? g.ch.J : null;
    U.timer -= dt;
    if (U.timer <= 0) {
      if (U.playing) {
        U.playing = false; U.timer = 7 + this.rnd() * 6; U.clapUntil = t + 2.6;
        if (sc.near) this.say(M[1 + ((this.rnd() * (M.length - 1)) | 0)], pick(CHATTER.guitarEnd, this.rnd));
      } else { U.playing = true; U.timer = 34 + this.rnd() * 16; U.song = (U.song + 1) % 3; U.bar = 0; }
    }
    const strum = U.playing ? Math.sin(t * TAU * 2.2) : 0;
    if (J) {
      // left hand on the neck, right hand over the sound hole
      this.ik(g, 1, 0.34, 0.2, 0.26, 1, 1, -0.6, -0.4, 'pelvis');
      this.ik(g, -1, -0.02, 0.08 + strum * 0.05, 0.28, 1, -1, -0.4, -0.3, 'pelvis');
      if (g.ikL) g.ikL.f = 'pelvis'; if (g.ikR) g.ikR.f = 'pelvis';
    }
    g.act.sway = U.playing ? 0.55 : 0; g.act.nod = U.playing ? 0.3 : 0;
    if (!U.playing) this.social(sc, dt, t, M);
    for (let i = 1; i < M.length; i++) {
      const m = M[i];
      if (U.playing) {
        m.look = this.head(g);
        m.act.sway = 0.7; m.act.talk = Math.sin(t * 0.8 + i) > 0.7 ? 0.3 : 0;    // singing along, some of it
      } else if (t < (U.clapUntil || 0)) { m.act.clap = 1; m.look = this.head(g); }
    }
    if (U.playing && sc.dist < 38) CrowdAudio.guitar(this.game, sc, t);
  }

  up_frisbee(sc, dt, t) {
    const F = sc.fr, M = sc.members, R = this.rnd;
    const hold = M[F.holder], tgt = M[F.target % M.length];
    for (const m of M) { m.act.crossArms = 0; m.act.pockets = 0; }
    if (F.phase === 'hold' || F.phase === 'windup') {
      hold.hold.R = 'frisbee';
      hold.faceYaw = Math.atan2(tgt.x - hold.x, tgt.z - hold.z);
      hold.look = this.head(tgt);
      for (const m of M) if (m !== hold) m.look = this.head(hold);
      F.timer -= dt;
      const J = hold.ch ? hold.ch.J : null;
      if (F.phase === 'hold' && F.timer <= 0) { F.phase = 'windup'; F.timer = 0.38; }
      if (F.phase === 'windup' && J) {
        // backhand: the disc comes across the body, then snaps out
        const k = 1 - F.timer / 0.38;
        this.ik(hold, -1, lerp(0.05, 0.2, k), J.shY - 0.12, lerp(0.35, 0.18, k), 1, -1, 0.2, -0.3);
        if (F.timer <= 0) {
          const d = Math.hypot(tgt.hx - hold.x, tgt.hz - hold.z);
          const lat = (R() - 0.5) * 5, dep = (R() - 0.5) * 3.5;
          const dx = (tgt.hx - hold.x) / d, dz = (tgt.hz - hold.z) / d;
          const cx = tgt.hx + dx * dep - dz * lat, cz = tgt.hz + dz * dep + dx * lat;
          const dur = clamp(d / 8.5, 1.1, 2.4);
          const from = this.hand(hold);
          const to = [cx, this.baseY(tgt) + 1.15 + R() * 0.5, cz];
          this.flying.push({ kind: 'frisbee', p0: from, p1: to, t: 0, dur, h: 1.2 + R() * 1.4, curve: (R() - 0.5) * 2.2, sc, spin: 0 });
          hold.hold.R = null; F.phase = 'fly'; F.throwT = t;
          // the catcher sets off at once; a long way off is a dive or a drop
          tgt.goal = [cx - dx * 0.35, cz - dz * 0.35]; tgt.goalSpeed = Math.min(4.8, Math.hypot(cx - tgt.x, cz - tgt.z) / (dur * 0.9) + 0.4);
          F.canCatch = Math.hypot(cx - tgt.x, cz - tgt.z) / (dur * 0.9) < 4.6 && R() < 0.86;
        }
      }
    } else if (F.phase === 'fly') {
      const disc = this.flying.find((f) => f.kind === 'frisbee' && f.sc === sc);
      for (const m of M) if (disc) m.look = [disc.x, disc.y, disc.z];
      if (disc && disc.t / disc.dur > 0.72 && F.canCatch) {
        // reach for it
        const r = this.toRoot(tgt, disc.x, disc.y, disc.z);
        const k = clamp((disc.t / disc.dur - 0.72) / 0.2, 0, 1);
        this.ik(tgt, -1, r[0], Math.min(r[1], 2.1), Math.max(0.25, r[2]), k, -1, -0.4, -0.2, 'root');
        this.ik(tgt, 1, r[0] + 0.12, Math.min(r[1], 2.1), Math.max(0.25, r[2]), k * 0.8, 1, -0.4, -0.2, 'root');
      }
      if (!disc) { F.phase = 'hold'; F.timer = 1; }
    } else if (F.phase === 'caught') {
      F.timer -= dt;
      if (F.timer <= 0) { tgt.goal = [tgt.hx, tgt.hz]; tgt.goalSpeed = 1.3; F.phase = 'return'; }
    } else if (F.phase === 'return') {
      if (!tgt.goal) {
        F.holder = F.target % M.length;
        let nx = F.holder;
        for (let k = 0; k < 5 && nx === F.holder; k++) nx = (R() * M.length) | 0;
        F.target = nx === F.holder ? (F.holder + 1) % M.length : nx;
        F.phase = 'hold'; F.timer = 0.8 + R() * 2;
      }
    } else if (F.phase === 'dropped') {
      const disc = F.disc;
      if (!tgt.goal && disc) {
        tgt.faceYaw = Math.atan2(disc[0] - tgt.x, disc[2] - tgt.z);
        F.pick = (F.pick || 0) + dt;
        this.setPost(tgt, 'squat');
        if (F.pick > 0.9) { this.setPost(tgt, 'stand'); tgt.hold.R = 'frisbee'; F.disc = null; F.pick = 0; tgt.goal = [tgt.hx, tgt.hz]; tgt.goalSpeed = 1.3; F.phase = 'return'; }
      }
    }
  }
  /* a frisbee or ball reached the end of its arc */
  land(f) {
    const sc = f.sc;
    if (f.kind === 'frisbee') {
      const F = sc.fr, tgt = sc.members[F.target % sc.members.length];
      const d = Math.hypot(tgt.x - f.p1[0], tgt.z - f.p1[2]);
      if (F.canCatch && d < 1.3) {
        tgt.hold.R = 'frisbee'; tgt.goal = null; F.phase = 'caught'; F.timer = 0.5 + this.rnd() * 0.6;
        if (sc.near && this.rnd() < 0.35) this.say(sc.members[F.holder], pick(CHATTER.frisbeeGood, this.rnd), 1.8);
        if (this.rnd() < 0.3) for (const m of sc.members) if (m !== tgt) m.act.clap = 1;
        return true;
      }
      // it skids to a stop on the grass; somebody has to go and get it
      const dx = f.p1[0] - f.p0[0], dz = f.p1[2] - f.p0[2], L = Math.hypot(dx, dz) || 1;
      const gx = f.p1[0] + dx / L * (1 + this.rnd() * 2.5), gz = f.p1[2] + dz / L * (1 + this.rnd() * 2.5);
      F.disc = [gx, groundH(gx, gz) + SURF_LIFT + 0.02, gz];
      F.phase = 'dropped';
      tgt.goal = [gx - dx / L * 0.5, gz - dz / L * 0.5]; tgt.goalSpeed = 2.2;
      if (sc.near && this.rnd() < 0.5) this.say(tgt, pick(CHATTER.frisbeeMiss, this.rnd), 1.8);
      if (this.rnd() < 0.5) this.groupLaugh(sc, sc.members, sc.clock);
      return true;
    }
    return true;
  }

  up_hacky(sc, dt, t) {
    const H = sc.hk, M = sc.members, R = this.rnd;
    for (const m of M) { m.act.crossArms = 0; m.act.pockets = 0; m.faceYaw = Math.atan2(sc.x - m.x, sc.z - m.z); }
    const sack = H.sack;
    if (sack) for (const m of M) m.look = [sack.x, sack.y, sack.z];
    if (H.phase === 'toss') {
      H.timer -= dt;
      const k = M[H.kicker];
      k.hold.R = 'sack';
      if (H.timer <= 0) {
        k.hold.R = null;
        const from = this.hand(k), to = this.footPt(k, 1);
        this.flying.push({ kind: 'sack', p0: from, p1: to, t: 0, dur: 0.55, h: 0.5, sc, to: H.kicker, side: 1 });
        H.phase = 'fly'; H.count = 0;
      }
    } else if (H.phase === 'fly') {
      const f = this.flying.find((q) => q.kind === 'sack' && q.sc === sc);
      if (f) {
        const m = M[f.to], u = f.t / f.dur;
        m.kickNow = u > 0.55 ? Math.sin(clamp((u - 0.55) / 0.55, 0, 1) * Math.PI) * f.side : 0;
      }
    } else if (H.phase === 'dropped') {
      H.timer -= dt;
      const m = M[H.kicker];
      if (H.timer < 1.6 && H.timer > 0.5) this.setPost(m, 'squat');
      else this.setPost(m, 'stand');
      if (H.timer <= 0) { H.sack = null; H.phase = 'toss'; H.timer = 0.6; }
    }
  }
  footPt(m, side) {
    const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw), rx = Math.cos(m.yaw), rz = -Math.sin(m.yaw);
    return [m.x + fx * 0.28 + rx * 0.06 * side, this.baseY(m) + 0.38, m.z + fz * 0.28 + rz * 0.06 * side];
  }
  landSack(f) {
    const sc = f.sc, H = sc.hk, M = sc.members;
    H.count++;
    if (this.rnd() < 0.13 && H.count > 2) {
      // dropped: it falls at their feet and the circle laughs
      const m = M[f.to], p = this.footPt(m, f.side);
      H.sack = { x: p[0], y: this.baseY(m) + 0.03, z: p[2] };
      H.phase = 'dropped'; H.timer = 2.4; H.kicker = f.to;
      this.groupLaugh(sc, M, sc.clock);
      if (sc.near && this.rnd() < 0.4) this.say(M[(f.to + 1) % M.length], pick(CHATTER.hacky, this.rnd), 1.8);
      if (sc.dist < 25) CrowdAudio.tok(this.game, p, 0.4);
      return;
    }
    let nx = f.to;
    if (this.rnd() > 0.25) { for (let k = 0; k < 5 && nx === f.to; k++) nx = (this.rnd() * M.length) | 0; }
    const side = this.rnd() < 0.5 ? 1 : -1;
    const from = this.footPt(M[f.to], f.side), to = this.footPt(M[nx], side);
    const same = nx === f.to;
    this.flying.push({ kind: 'sack', p0: from, p1: to, t: 0, dur: same ? 0.62 : 0.8 + this.rnd() * 0.15, h: same ? 0.55 : 1.0 + this.rnd() * 0.5, sc, to: nx, side });
    if (sc.dist < 22) CrowdAudio.tok(this.game, from, 0.25);
  }

  up_pong(sc, dt, t) {
    const P = sc.pong, M = sc.members, R = this.rnd;
    const si = P.team * 2 + P.shooter, sh = M[si];
    if (!sc.spect) sc.spect = M.slice(4);
    const ball = this.flying.find((f) => f.kind === 'ball' && f.sc === sc);
    for (let i = 0; i < M.length; i++) {
      const m = M[i];
      m.act.crossArms = i < 4 ? 0 : m.act.crossArms;
      if (i !== si) m.look = ball ? [ball.x, ball.y, ball.z] : this.head(sh);
    }
    if (P.phase !== 'fly' && P.phase !== 'aim') this.social(sc, dt, t, sc.spect);
    else for (const m of sc.spect) if (t > m.laughFrom && t < m.laughUntil) m.act.laugh = m.laughAmp;
    this.sips(sc, dt, t);
    const J = sh.ch ? sh.ch.J : null;
    const defSide = P.team === 0 ? -1 : 1;
    if (P.phase === 'aim') {
      P.timer -= dt;
      sh.hold.R = 'ball';
      sh.act.drink = 0; sh.act.talk = 0;
      const cups = sc.cups.filter((c) => c.side === defSide && c.up);
      if (!P.aimCup || !P.aimCup.up || P.aimCup.side !== defSide) P.aimCup = cups[(R() * cups.length) | 0];
      if (P.aimCup) { const w = this.sceneP(sc, P.aimCup.lx, P.aimCup.lz); sh.look = [w[0], (sc.y0 == null ? groundH(w[0], w[1]) + SURF_LIFT : sc.y0) + TABLE_TOP, w[1]]; }
      if (J) {
        // ball cocked in front of the face, a little bounce of the wrist
        const bob = Math.sin(t * 6) * 0.025 * clamp(P.timer, 0, 1);
        this.ik(sh, -1, -0.12, J.shY + 0.2 + bob, 0.3, 1, -1, -0.8, 0);
      }
      if (P.timer <= 0) this.pongThrow(sc);
    } else if (P.phase === 'fly') {
      P.since += dt;
      if (J) this.ik(sh, -1, -0.08, J.shY + 0.14, 0.55, Math.max(0, 1 - P.since * 1.5), -1, -0.6, 0);
    } else if (P.phase === 'react') {
      P.timer -= dt; P.since += dt;
      const make = P.result === 'make';
      for (let i = 0; i < M.length; i++) {
        const m = M[i], team = i < 2 ? 0 : i < 4 ? 1 : -1;
        if (make) {
          if (team === P.team && P.since < 1.7) { m.act.cheer = 1; m.jumpNow = Math.max(0, Math.sin(P.since * 10)) * 0.07 * (P.since < 1 ? 1 : 0); m.act.drink = 0; }
          else if (team === -1 && P.since < 1.6) { if (i % 2) m.act.clap = 1; else m.act.cheer = 0.9; }
          else if (team === 1 - P.team && m !== P.drinker && P.since < 1.0) m.act.handsHead = 1;
        } else if (i === si && P.since < 0.8 && P.dramatic) m.act.handsHead = 1;
      }
      // the defender nearest the cup picks it up and drinks it
      if (make && P.drinker && P.cup) {
        const d = P.drinker, J2 = d.ch ? d.ch.J : null;
        if (P.since > 0.8 && P.since < 1.35 && P.cup.up) {
          const w = this.sceneP(sc, P.cup.lx, P.cup.lz);
          const r = this.toRoot(d, w[0], (sc.y0 == null ? groundH(w[0], w[1]) + SURF_LIFT : sc.y0) + TABLE_TOP + 0.08, w[1]);
          this.ik(d, -1, r[0], r[1], r[2], Math.sin(clamp((P.since - 0.8) / 0.55, 0, 1) * Math.PI) + 0.01, -1, -0.5, -0.3, 'root');
          d.look = [w[0], this.baseY(d) + TABLE_TOP, w[1]];
        }
        if (P.since >= 1.35 && P.cup.up) { P.cup.up = false; d.hold.R = 'cup'; d.tmpCup = true; }
        if (P.since > 1.45 && P.since < 2.8) { d.act.drink = 1; d.act.handsHead = 0; }
        if (P.since >= 2.8 && d.tmpCup) { d.hold.R = null; d.tmpCup = false; }
        void J2;
      }
      if (P.timer <= 0) {
        if (P.drinker && P.drinker.tmpCup) { P.drinker.hold.R = null; P.drinker.tmpCup = false; }
        if (P.cup && P.cup.up && make) P.cup.up = false;
        const left = sc.cups.filter((c) => c.side === defSide && c.up).length;
        if (!left) {
          P.phase = 'rerack'; P.timer = 3.4; P.winner = P.team; P.since = 0;
          if (sc.near) this.say(M[P.team * 2], pick(CHATTER.pongWin, R), 2.4);
          if (sc.dist < 30) CrowdAudio.cheer(this.game, M[P.team * 2], 3);
        } else {
          P.shooter++;
          if (P.shooter > 1) { P.shooter = 0; P.team = 1 - P.team; }
          P.phase = 'aim'; P.timer = 1.0 + R() * 1.2; P.aimCup = null;
        }
      }
    } else if (P.phase === 'rerack') {
      P.timer -= dt; P.since += dt;
      for (let i = 0; i < M.length; i++) {
        const m = M[i], team = i < 2 ? 0 : i < 4 ? 1 : -1;
        if (team === P.winner) { m.act.cheer = P.since < 2 ? 1 : 0; m.jumpNow = P.since < 1.2 ? Math.max(0, Math.sin(P.since * 10)) * 0.08 : 0; }
        else if (team === -1) m.act.clap = P.since < 2.2 ? 1 : 0;
        else m.act.handsHead = P.since < 1.2 ? 1 : 0;
      }
      if (P.timer <= 0) {
        for (const c of sc.cups) c.up = true;
        P.team = 1 - P.winner; P.shooter = 0; P.phase = 'aim'; P.timer = 1.6;
        if (sc.near) this.say(M[4] || M[0], 'Rerack!', 1.6);
      }
    }
  }
  pongThrow(sc) {
    const P = sc.pong, M = sc.members, R = this.rnd;
    const sh = M[P.team * 2 + P.shooter];
    const defSide = P.team === 0 ? -1 : 1;
    const cups = sc.cups.filter((c) => c.side === defSide && c.up);
    const cup = P.aimCup && P.aimCup.up ? P.aimCup : cups[(R() * cups.length) | 0];
    const make = !!cup && R() < 0.3 + (6 - cups.length) * 0.015;
    const baseY = sc.y0 == null ? groundH(sc.x, sc.z) + SURF_LIFT : sc.y0;
    const from = this.hand(sh).slice();
    let to;
    if (make) { const w = this.sceneP(sc, cup.lx, cup.lz); to = [w[0], baseY + TABLE_TOP + 0.09, w[1]]; }
    else {
      const a = R() * TAU, r = 0.13 + R() * 0.22;
      const lx = (cup ? cup.lx : 0) + Math.cos(a) * r, lz = (cup ? cup.lz : defSide) + Math.sin(a) * r * 0.8;
      const w = this.sceneP(sc, clamp(lx, -0.28, 0.28), clamp(lz, -1.2, 1.2));
      to = [w[0], baseY + TABLE_TOP + 0.02, w[1]];
    }
    const dist = Math.hypot(to[0] - from[0], to[2] - from[2]);
    this.flying.push({ kind: 'ball', p0: from, p1: to, t: 0, dur: 0.62 + dist * 0.07, h: 0.42 + R() * 0.2, sc, make, cup: make ? cup : null });
    sh.hold.R = null;
    P.phase = 'fly'; P.since = 0; P.dramatic = R() < 0.5;
    // the drinker, if it goes in: whichever defender stands nearer the cup
    const d0 = M[(1 - P.team) * 2], d1 = M[(1 - P.team) * 2 + 1];
    if (cup) { const w = this.sceneP(sc, cup.lx, cup.lz); P.drinker = Math.hypot(d0.x - w[0], d0.z - w[1]) < Math.hypot(d1.x - w[0], d1.z - w[1]) ? d0 : d1; }
  }
  landBall(f) {
    const sc = f.sc, P = sc.pong;
    if (f.make) {
      P.phase = 'react'; P.result = 'make'; P.timer = 3.1; P.since = 0; P.cup = f.cup;
      if (sc.dist < 60) this.game.particles.burst(f.p1[0], f.p1[1] + 0.02, f.p1[2], 12, { col: [1, 0.85, 0.5], speed: 1.1, life: 0.35, size: 0.035, grav: 6, drag: 1 });
      if (sc.dist < 30) { CrowdAudio.plip(this.game, f.p1); CrowdAudio.cheer(this.game, sc.members[P.team * 2], 2); }
      if (sc.near && this.rnd() < 0.7) this.say(sc.members[P.team * 2 + (1 - P.shooter)] || sc.members[0], pick(CHATTER.pongMake, this.rnd), 1.8);
      return true;
    }
    // it hits the table and bounces away
    P.phase = 'react'; P.result = 'miss'; P.timer = 1.5; P.since = 0; P.cup = null;
    if (sc.dist < 30) CrowdAudio.tok(this.game, f.p1, 0.8);
    if (sc.near && this.rnd() < 0.3) this.say(sc.spect && sc.spect[0] || sc.members[0], pick(CHATTER.pongMiss, this.rnd), 1.6);
    const dx = f.p1[0] - f.p0[0], dz = f.p1[2] - f.p0[2], L = Math.hypot(dx, dz) || 1, sp = L / f.dur;
    f.phys = { vx: dx / L * sp * 0.6 + (this.rnd() - 0.5), vy: 2.4, vz: dz / L * sp * 0.6 + (this.rnd() - 0.5), life: 2.2, top: f.p1[1] - 0.001, bounces: 0 };
    return false;
  }

  /* ---------- per-member reactions, easing and movement ---------- */
  react(m, sc, dt, t) {
    const G = this.game, A = m.act;
    m.holdTmp = null;
    if (m.confused > 0) {
      // the feed has them: head down, thumb scrolling
      for (const k of ACT_KEYS) A[k] = 0;
      A.phone = 1; m.holdTmp = 'phone'; m.look = null; m.ikL = null; m.ikR = null;
      return;
    }
    if (m.tellT > 0) {
      m.tellT -= dt;
      A.talk = 1; A.laugh = 0; A.drink = 0; A.phone = 0; A.crossArms = 0; A.pockets = 0;
      const o = sc.members.find((q) => q !== m);
      if (o && m.post !== 'lieBack' && m.post !== 'lieFront') m.look = this.head(o);
    }
    if (m.hearT > 0) { m.hearT -= dt; A.nod = 1; A.talk = 0; if (m.teller && m.post !== 'lieBack' && m.post !== 'lieFront') m.look = this.head(m.teller); }
    if (m.sparkT > 0.5) { A.point = 0.75; A.phone = 0; m.look = [G.cam.x, G.cam.y, G.cam.z]; }
    const dp = Math.hypot(G.cam.x - m.x, G.cam.z - m.z);
    if (dp < 3.4 && !m.moving && ((m.id % 3) !== 0 || dp < 1.7) && m.post !== 'lieFront') m.look = [G.cam.x, G.cam.y, G.cam.z];
    if (m.bumpT > 0) { m.bumpT -= dt; m.look = [G.cam.x, G.cam.y, G.cam.z]; A.talk = 0; if (m.bumpT > 0.5) A.handsHead = 0.3; }
    // a drone low overhead gets looked at, and filmed
    const dr = G.life.nearDrone(m.x, m.z, 15);
    if (dr && dr.y - this.baseY(m) < 16 && m.post !== 'lieFront') {
      m.look = [dr.x, dr.y, dr.z];
      if (m.id % 4 === 0 && !m.hold.R) { A.phone = 0.7; m.holdTmp = 'phone'; }
    }
  }
  ease(m, dt) {
    const W = m.W, A = m.act, k = 1 - Math.exp(-6 * dt);
    for (const key of ACT_KEYS) W[key] += (A[key] - W[key]) * k;
    if (m.pblend < 1) m.pblend = Math.min(1, m.pblend + dt / 0.9);
    // turn the head (and a little of the chest) toward whatever they are looking at
    let ly = 0, lp = 0;
    const lying = m.post === 'lieBack' || m.post === 'lieFront';
    if (m.look && !lying) {
      const h = m.hw || this.head(m);
      const dx = m.look[0] - m.x, dz = m.look[2] - m.z;
      let a = Math.atan2(dx, dz) - m.yaw;
      while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU;
      ly = clamp(a, -1.3, 1.3);
      lp = clamp(Math.atan2(m.look[1] - h[1], Math.hypot(dx, dz) + 0.01), -0.7, 0.9);
      if (Math.abs(a) > 1.5) { ly = 0; lp = 0; }
    }
    if (lying) ly = m.lySet || 0;
    lp -= m.readDown || 0;
    m.ly += (ly - m.ly) * (1 - Math.exp(-4 * dt));
    m.lp += (lp - m.lp) * (1 - Math.exp(-4 * dt));
    // walking somewhere (a catcher, someone fetching a ball), then turning to face the right way
    if (m.goal) {
      const dx = m.goal[0] - m.x, dz = m.goal[1] - m.z, d = Math.hypot(dx, dz);
      if (d < 0.12) { m.goal = null; m.moving = false; }
      else {
        const sp = Math.min(m.goalSpeed || 1.3, d / Math.max(dt, 1e-3));
        m.x += dx / d * sp * dt; m.z += dz / d * sp * dt;
        m.moving = true; m.moveSpeed = sp; m.bob += dt * sp * 3.4;
        const want = Math.atan2(dx, dz);
        let a = want - m.yaw; while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU;
        m.yaw += a * Math.min(1, dt * 7);
      }
    } else {
      m.moving = false;
      let a = m.faceYaw - m.yaw; while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU;
      m.yaw += a * Math.min(1, dt * 4);
    }
  }

  /* ---------- arcs: pong balls, frisbees, hacky sacks ---------- */
  updateFlying(dt) {
    for (const f of this.flying) {
      if (f.phys) {
        // a missed pong ball: bounce off the table, then off the ground
        const p = f.phys;
        p.life -= dt; p.vy -= 9.8 * dt;
        f.x += p.vx * dt; f.y += p.vy * dt; f.z += p.vz * dt;
        const sc = f.sc, r = this.toRoot({ x: sc.x, z: sc.z, yaw: sc.yaw, y0: sc.y0 }, f.x, f.y, f.z);
        const onTable = Math.abs(r[0]) < 0.31 && Math.abs(r[2]) < 1.22;
        const floor = onTable ? p.top : (sc.y0 == null ? groundH(f.x, f.z) + SURF_LIFT : sc.y0) + 0.02;
        if (f.y < floor && p.vy < 0) {
          f.y = floor; p.vy *= -0.55; p.vx *= 0.8; p.vz *= 0.8; p.bounces++;
          if (Math.abs(p.vy) > 0.6 && sc.dist < 25) CrowdAudio.tok(this.game, [f.x, f.y, f.z], onTable ? 0.6 : 0.3);
        }
        f.dead = p.life <= 0;
        continue;
      }
      f.t += dt;
      const u = Math.min(1, f.t / f.dur);
      f.x = lerp(f.p0[0], f.p1[0], u); f.z = lerp(f.p0[2], f.p1[2], u);
      f.y = lerp(f.p0[1], f.p1[1], u) + 4 * f.h * u * (1 - u);
      if (f.kind === 'frisbee') {
        // a backhand hyzer: the flight bends off to one side and floats at the top
        const dx = f.p1[0] - f.p0[0], dz = f.p1[2] - f.p0[2], L = Math.hypot(dx, dz) || 1;
        const bend = Math.sin(u * Math.PI) * f.curve;
        f.x += -dz / L * bend; f.z += dx / L * bend;
        f.spin += dt * 22;
      }
      if (u >= 1) {
        if (f.kind === 'frisbee') { this.land(f); f.dead = true; }
        else if (f.kind === 'sack') { this.landSack(f); f.dead = true; }
        else if (f.kind === 'ball') { f.dead = this.landBall(f); }
      }
    }
    this.flying = this.flying.filter((f) => !f.dead);
  }

  /* ---------- word of mouth ----------
     Teach one member of a group and they turn and tell the others. */
  spread(s, concept, col, hex) {
    const sc = s.scene;
    if (!sc) return 0;
    const others = sc.members.filter((m) => m !== s && m.hearAt == null);
    if (!others.length) return 0;
    s.tellT = 2.6; s.lastConcept = concept;
    this.say(s, pick(CHATTER.tell, this.rnd).replace('{c}', concept), 3.6);
    others.forEach((m, i) => { m.hearAt = 1.1 + i * 0.4; m.teller = s; m.hearCol = col; m.hearHex = hex; m.hearConcept = concept; });
    return others.length;
  }
  tickHearing(dt) {
    for (const m of this.life.students) {
      if (m.hearAt == null) continue;
      m.hearAt -= dt;
      if (m.hearAt <= 0) { m.hearAt = null; m.hearT = 1.6; this.life.hear(m, m.teller, m.hearCol, m.hearHex, m.hearConcept); }
    }
  }

  /* ---------- drawing ---------- */
  poseInto(s, P, t) {
    const W = s.W;
    for (const k of ACT_KEYS) P[k] = W[k];
    P.t = t; P.seed = s.phase; P.v = s.v; P.lv = s.lv; P.seat = s.seat;
    P.phone2 = W.phone > 0.1 && (s.id % 2 === 0) ? 1 : 0;
    P.lookYaw = s.ly; P.lookPitch = s.lp;
    P.ikL = s.ikL; P.ikR = s.ikR; P.kick = s.kickNow; P.jump = s.jumpNow;
    P.aim = 0; P.hold = false; P.grip = null; P.crank = 0; P.lean = 0; P.upright = false; P.stride = 1; P.swing = 1;
    if (s.moving) {
      P.state = s.moveSpeed > 2.6 ? 'run' : 'walk'; P.phase = s.bob * 1.15; P.speed = clamp((s.moveSpeed - 1.6) / 3, 0, 1);
      P.state2 = null; P.blend = 0;
    } else {
      const to = POST_STATE[s.post] || 'idle';
      if (s.pblend < 1) { P.state = POST_STATE[s.postFrom] || 'idle'; P.state2 = to; P.blend = smoothstep(s.pblend); }
      else { P.state = to; P.state2 = null; P.blend = 0; }
      P.phase = 0; P.speed = 0;
    }
  }
  drawInHand(R, s, bm, key, side) {
    const mesh = this.props[key], H = this.props.hold[key];
    if (!mesh || !H) return;
    const bone = side < 0 ? BONE.HAND_R : BONE.HAND_L;
    M4.mul(this.m, bm, s.bones.subarray(bone * 16, bone * 16 + 16));
    const L = xformTo(this.m3, side < 0 ? H.t[0] : -H.t[0], H.t[1], H.t[2], H.r[0], side < 0 ? H.r[1] : -H.r[1], side < 0 ? H.r[2] : -H.r[2]);
    R.drawMesh(mesh, M4.mul(this.m2, this.m, L), { noShadow: true });
  }
  drawHeld(R, s, bm) {
    const hk = s.holdTmp || s.holdTmp2 || s.hold.R;
    if (hk) this.drawInHand(R, s, bm, hk, -1);
    if (s.hold.L) this.drawInHand(R, s, bm, s.hold.L, 1);
    if (s.guitar) {
      M4.mul(this.m, bm, s.bones.subarray(BONE.PELVIS * 16, BONE.PELVIS * 16 + 16));
      R.drawMesh(this.props.guitar, M4.mul(this.m2, this.m, xformTo(this.m3, 0.02, 0.1, 0.2, 0.1, 0, 0.32)), { noShadow: true });
    }
    if (s.laptop) {
      R.drawMesh(this.props.laptop, M4.mul(this.m2, bm, xformTo(this.m3, 0, s.post === 'cross' ? 0.13 : 0.02, 0.36, 0.08, Math.PI, 0)), { noShadow: true });
    }
  }
  drawScene(R, cam) {
    if (this.staticChunks.length) R.drawChunks(this.staticChunks);
    if (R.shadowPass) return;
    for (const sc of this.scenes) {
      if (sc.dist > 95) continue;
      if (sc.cups) {
        const by = sc.y0 == null ? groundH(sc.x, sc.z) + SURF_LIFT : sc.y0;
        for (const c of sc.cups) {
          if (!c.up) continue;
          const w = this.sceneP(sc, c.lx, c.lz);
          M4.trs(this.m, w[0], by + TABLE_TOP, w[1], 0, 1, 1, 1);
          R.drawMesh(this.props.cup, this.m);
        }
      }
      if (sc.fr && sc.fr.disc) { M4.trs(this.m, sc.fr.disc[0], sc.fr.disc[1], sc.fr.disc[2], 0, 1, 1, 1); R.drawMesh(this.props.frisbee, this.m); }
      if (sc.hk && sc.hk.sack && sc.hk.phase === 'dropped') { M4.trs(this.m, sc.hk.sack.x, sc.hk.sack.y, sc.hk.sack.z, 0, 1, 1, 1); R.drawMesh(this.props.sack, this.m); }
    }
    for (const f of this.flying) {
      if ((f.x - cam.x) ** 2 + (f.z - cam.z) ** 2 > 90 * 90) continue;
      const mesh = this.props[f.kind];
      if (f.kind === 'frisbee') xformTo(this.m, f.x, f.y, f.z, 0.12, f.spin, 0.22);
      else M4.trs(this.m, f.x, f.y, f.z, (f.t || 0) * 9, 1, 1, 1);
      R.drawMesh(mesh, this.m);
    }
  }
  bubbleTexture(text) {
    let e = this.bubbleTex.get(text);
    if (e) return e;
    const cv = document.createElement('canvas'), c = cv.getContext('2d');
    const font = '600 30px "Helvetica Neue", Helvetica, Arial, sans-serif';
    c.font = font;
    const tw = Math.ceil(c.measureText(text).width);
    const W = Math.max(90, tw + 46), H = 66, T = 16;
    cv.width = W; cv.height = H + T;
    c.font = font;
    const r = 24;
    c.beginPath();
    c.moveTo(r, 2); c.lineTo(W - r, 2); c.quadraticCurveTo(W - 2, 2, W - 2, r); c.lineTo(W - 2, H - r); c.quadraticCurveTo(W - 2, H - 2, W - r, H - 2);
    c.lineTo(W / 2 + 12, H - 2); c.lineTo(W / 2 - 4, H + T - 2); c.lineTo(W / 2 - 6, H - 2);
    c.lineTo(r, H - 2); c.quadraticCurveTo(2, H - 2, 2, H - r); c.lineTo(2, r); c.quadraticCurveTo(2, 2, r, 2); c.closePath();
    c.fillStyle = 'rgba(252,250,244,0.96)'; c.fill();
    c.lineWidth = 2.5; c.strokeStyle = 'rgba(30,36,48,0.55)'; c.stroke();
    c.fillStyle = '#1b2330'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, W / 2, H / 2 + 1);
    e = { tex: texFromCanvas(this.gl, cv), w: W / 210, h: (H + T) / 210 };
    if (this.bubbleTex.size > 300) this.bubbleTex.clear();
    this.bubbleTex.set(text, e);
    return e;
  }
  drawBubbles(R, cam, basis) {
    if (!this.bubbles.length) return;
    const gl = R.gl;
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const k = this.game.env && this.game.env.night > 0.5 ? 0.75 : 1.35;
    for (const b of this.bubbles) {
      const s = b.s, h = s.hw || this.head(s);
      const d = Math.hypot(h[0] - cam.x, h[1] - cam.y, h[2] - cam.z);
      if (d > 30) continue;
      const e = this.bubbleTexture(b.text);
      const a = Math.min(1, b.t * 6, (b.dur - b.t) * 3) * clamp((30 - d) / 6, 0, 1);
      if (a <= 0.01) continue;
      const sc = 0.7 + Math.min(d / 18, 1) * 0.55;
      R.drawBillboard(e.tex, [h[0], h[1] + 0.34 + e.h * sc * 0.5, h[2]], e.w * sc, e.h * sc, [k, k, k, a], 0, basis);
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  }
}

/* ============================================================
   CrowdAudio — voices without samples. Laughter is a train of
   voiced "ha" syllables through two formant filters; a cheer is a
   rising "woo"; the guitar is Karplus-Strong plucked strings.
   ============================================================ */
const CrowdAudio = {
  ok() { return Sfx.on && Sfx.ctx && Sfx.ctx.state !== 'suspended'; },
  // distance falloff and left/right placement relative to where you are looking
  out(game, p, gain) {
    const ctx = Sfx.ctx;
    const dx = p[0] - game.cam.x, dz = p[2] - game.cam.z, d = Math.hypot(dx, dz);
    const g = ctx.createGain(); g.gain.value = gain / (1 + (d / 7) * (d / 7));
    let node = g;
    if (ctx.createStereoPanner) {
      const pn = ctx.createStereoPanner();
      const yaw = game.view && game.view.yaw != null ? game.view.yaw : game.cam.yaw;
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);        // the camera's right
      pn.pan.value = clamp((dx * rx + dz * rz) / (d + 1), -0.85, 0.85);
      g.connect(pn); pn.connect(ctx.destination);
      node = g;
    } else g.connect(ctx.destination);
    return { node, d };
  },
  noise() {
    if (this._noise) return this._noise;
    const ctx = Sfx.ctx, n = ctx.sampleRate, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return (this._noise = b);
  },
  laugh(game, s, delay = 0) {
    if (!this.ok()) return;
    const ctx = Sfx.ctx, t0 = ctx.currentTime + delay;
    const p = s.hw || [s.x, 1.5, s.z];
    const { node, d } = this.out(game, p, 0.075);
    if (d > 34) return;
    const high = !s.ch || s.ch.J.H < 1.72;
    const f0 = (high ? 230 : 135) * (0.88 + ((s.id * 37) % 10) / 40);
    const n = 4 + ((s.id + Math.floor(t0 * 3)) % 4), rate = 5.2 + ((s.id * 13) % 7) / 6;
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0 * 1.12, t0); osc.frequency.linearRampToValueAtTime(f0 * 0.86, t0 + n / rate);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = high ? 900 : 720; f1.Q.value = 5;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = high ? 1500 : 1180; f2.Q.value = 7;
    const env = ctx.createGain(); env.gain.value = 0;
    osc.connect(f1); osc.connect(f2); f1.connect(env); f2.connect(env); env.connect(node);
    // breath between the syllables
    const nz = ctx.createBufferSource(); nz.buffer = this.noise();
    const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 1600; hp.Q.value = 0.8;
    const ne = ctx.createGain(); ne.gain.value = 0;
    nz.connect(hp); hp.connect(ne); ne.connect(node);
    for (let i = 0; i < n; i++) {
      const ts = t0 + i / rate, amp = 1 - i / (n + 2);
      ne.gain.setValueAtTime(0, ts); ne.gain.linearRampToValueAtTime(0.35 * amp, ts + 0.02); ne.gain.linearRampToValueAtTime(0, ts + 0.06);
      env.gain.setValueAtTime(0, ts + 0.02); env.gain.linearRampToValueAtTime(amp, ts + 0.045); env.gain.exponentialRampToValueAtTime(0.001, ts + 0.16);
    }
    const end = t0 + n / rate + 0.2;
    osc.start(t0); osc.stop(end); nz.start(t0); nz.stop(end);
  },
  laughGroup(game, M) {
    const list = M.filter((m) => m.confused <= 0).slice(0, 4);
    list.forEach((m, i) => this.laugh(game, m, 0.05 + i * 0.13 + Math.random() * 0.15));
  },
  cheer(game, s, voices = 2) {
    if (!this.ok()) return;
    const ctx = Sfx.ctx;
    const p = s.hw || [s.x, 1.5, s.z];
    for (let v = 0; v < voices; v++) {
      const t0 = ctx.currentTime + v * 0.09 + Math.random() * 0.05;
      const { node, d } = this.out(game, p, 0.05);
      if (d > 40) return;
      const f = (v % 2 ? 330 : 190) * (0.9 + Math.random() * 0.2);
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t0); o.frequency.linearRampToValueAtTime(f * 1.45, t0 + 0.28); o.frequency.linearRampToValueAtTime(f * 1.2, t0 + 0.75);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 6.5; const lg = ctx.createGain(); lg.gain.value = f * 0.03; lfo.connect(lg); lg.connect(o.frequency);
      const a = ctx.createBiquadFilter(); a.type = 'bandpass'; a.frequency.value = 380; a.Q.value = 4;
      const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = 850; b.Q.value = 6;
      const e = ctx.createGain(); e.gain.value = 0;
      o.connect(a); o.connect(b); a.connect(e); b.connect(e); e.connect(node);
      e.gain.setValueAtTime(0, t0); e.gain.linearRampToValueAtTime(1, t0 + 0.08); e.gain.setValueAtTime(1, t0 + 0.5); e.gain.linearRampToValueAtTime(0, t0 + 0.8);
      o.start(t0); o.stop(t0 + 0.85); lfo.start(t0); lfo.stop(t0 + 0.85);
    }
  },
  tok(game, p, g = 0.6) {
    if (!this.ok()) return;
    const ctx = Sfx.ctx, t0 = ctx.currentTime;
    const { node, d } = this.out(game, p, 0.05 * g);
    if (d > 30) return;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(2300, t0); o.frequency.exponentialRampToValueAtTime(1200, t0 + 0.04);
    const e = ctx.createGain(); e.gain.setValueAtTime(1, t0); e.gain.exponentialRampToValueAtTime(0.001, t0 + 0.06);
    o.connect(e); e.connect(node); o.start(t0); o.stop(t0 + 0.07);
  },
  plip(game, p) {
    if (!this.ok()) return;
    const ctx = Sfx.ctx, t0 = ctx.currentTime;
    const { node } = this.out(game, p, 0.05);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(900, t0); o.frequency.exponentialRampToValueAtTime(260, t0 + 0.09);
    const e = ctx.createGain(); e.gain.setValueAtTime(0.9, t0); e.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
    o.connect(e); e.connect(node); o.start(t0); o.stop(t0 + 0.13);
  },
  bell(game, s) {
    if (!this.ok()) return;
    const ctx = Sfx.ctx;
    const { node, d } = this.out(game, [s.x, 1.2, s.z], 0.045);
    if (d > 25) return;
    for (const dt of [0, 0.16]) {
      const t0 = ctx.currentTime + dt;
      for (const [f, a] of [[2350, 1], [3390, 0.5], [5120, 0.25]]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const e = ctx.createGain(); e.gain.setValueAtTime(a, t0); e.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55);
        o.connect(e); e.connect(node); o.start(t0); o.stop(t0 + 0.6);
      }
    }
  },
  click(game, s) {
    if (!this.ok()) return;
    const ctx = Sfx.ctx, t0 = ctx.currentTime;
    const { node } = this.out(game, s.hw || [s.x, 1.5, s.z], 0.05);
    for (const dt of [0, 0.07]) {
      const nz = ctx.createBufferSource(); nz.buffer = this.noise();
      const e = ctx.createGain(); e.gain.setValueAtTime(0.8, t0 + dt); e.gain.exponentialRampToValueAtTime(0.001, t0 + dt + 0.03);
      nz.connect(e); e.connect(node); nz.start(t0 + dt); nz.stop(t0 + dt + 0.04);
    }
  },
  /* plucked strings: Karplus-Strong, rendered once per chord and strum direction */
  CHORDS: {
    C: [130.81, 164.81, 196.0, 261.63, 329.63], G: [98.0, 123.47, 146.83, 196.0, 246.94, 392.0],
    Am: [110.0, 164.81, 220.0, 261.63, 329.63], F: [87.31, 130.81, 174.61, 220.0, 261.63, 349.23],
    D: [146.83, 220.0, 293.66, 369.99], Em: [82.41, 123.47, 164.81, 196.0, 246.94, 329.63],
  },
  SONGS: [['C', 'G', 'Am', 'F'], ['G', 'D', 'Em', 'C'], ['Am', 'F', 'C', 'G']],
  strumBuf(name, up) {
    this._strums = this._strums || {};
    const key = name + (up ? 'u' : 'd');
    if (this._strums[key]) return this._strums[key];
    const ctx = Sfx.ctx, sr = ctx.sampleRate, len = Math.floor(sr * 2.0);
    const buf = ctx.createBuffer(1, len, sr), out = buf.getChannelData(0);
    let notes = this.CHORDS[name];
    if (up) notes = notes.slice(-3).reverse();
    notes.forEach((f, i) => {
      const N = Math.max(2, Math.round(sr / f)), ring = new Float32Array(N);
      for (let k = 0; k < N; k++) ring[k] = Math.random() * 2 - 1;
      const off = Math.floor(sr * (up ? 0.009 : 0.014) * i), amp = (up ? 0.55 : 0.8) / notes.length;
      let idx = 0, prev = 0;
      for (let k = off; k < len; k++) {
        const cur = ring[idx];
        const nxt = 0.4985 * (cur + ring[(idx + 1) % N]);
        ring[idx] = nxt; idx = (idx + 1) % N;
        const s = cur * amp; out[k] += s * 0.7 + prev * 0.3; prev = s;
      }
    });
    return (this._strums[key] = buf);
  },
  guitar(game, sc, t) {
    if (!this.ok()) return;
    const ctx = Sfx.ctx, U = sc.gu;
    const eighth = 60 / 92 / 2;
    if (!U.next || U.next < ctx.currentTime - 0.3) { U.next = ctx.currentTime + 0.05; U.step = 0; }
    const pattern = ['d', '', 'd', 'u', '', 'u', 'd', 'u'];
    const g = sc.members[0];
    const p = g.hw || [sc.x, 1, sc.z];
    while (U.next < ctx.currentTime + 0.12) {
      const st = pattern[U.step % 8];
      const bar = Math.floor(U.step / 8) % 4;
      if (st) {
        const buf = this.strumBuf(this.SONGS[U.song % 3][bar], st === 'u');
        const src = ctx.createBufferSource(); src.buffer = buf;
        const { node, d } = this.out(game, p, st === 'u' ? 0.16 : 0.22);
        if (d < 40) { src.connect(node); src.start(U.next); src.stop(U.next + 1.9); }
      }
      U.step++; U.next += eighth;
    }
  },
};

/* ============================================================
   Overheard. Short, so they fit a speech bubble; written for this game.
   ============================================================ */
const CHATTER = {
  chat: [
    'The lab meeting ran two hours over.', 'Is the problem set due Friday?', 'The pigeons here have tenure.',
    'Who books a seminar at 8 a.m.?', 'My flatmate labels her oat milk now.', 'I had one espresso. I can hear colours.',
    'Wait, there was a reading?', 'He said "interesting". That means wrong.', 'I emailed my supervisor a meme.',
    'Office hours are just therapy with graphs.', 'Library closes at ten, right?', 'I only came for the free pizza.',
    'My code works and I don\'t know why.', 'Is it a formal? Do I need a tie?', 'Sorry, I was thinking about lunch.',
    'She reviewed my essay in green ink.', 'We should do this every day.', 'Have you seen the chapel ceiling?',
    'Twelve pages. Single spaced.', 'I think the cat in the porter\'s lodge likes me.',
  ],
  feed: ['I saw a video about this…', 'Everyone\'s sharing it, so…', 'It had a chart. Charts are real.',
    'My feed says the opposite of yours.', 'Apparently one study proved it.', 'A doctor said it. On a podcast.'],
  learned: ['Apparently: {c}.', 'Someone explained {c} to me.', 'Okay, {c} actually makes sense now.', 'Did you know about {c}?'],
  tell: ['Guys — {c}!', 'Listen: {c}.', 'So it turns out, {c}.', 'You have to hear this: {c}.'],
  laugh: ['HAHA', 'Stop it!', 'I can\'t!', 'No way!', 'Hahaha!', 'Dead.'],
  pong: ['You\'re on!', 'Elbows!', 'Bounce it!', 'Aim for the middle.'],
  pongMake: ['LET\'S GO!', 'Drink up!', 'He\'s heating up!', 'Clutch!', 'Nothing but cup!', 'Too easy.'],
  pongMiss: ['Airball!', 'Ooh, so close.', 'Rim!', 'Shake it off.'],
  pongWin: ['GAME!', 'Rerack!', 'Who\'s next?', 'Undefeated!'],
  sunbathe: ['Ten more minutes.', 'Is it rude to nap here?', 'Sun cream?', 'I\'m not moving till June.', 'This is my revision.'],
  sunbatheNight: ['Is that Jupiter?', 'That one\'s a satellite.', 'Make a wish.', 'The stars are so clear tonight.'],
  picnic: ['Pass the grapes?', 'Who brought only crisps?', 'This is the best sandwich.', 'Is there any more?'],
  frisbee: ['Yours!', 'Heads up!'], frisbeeGood: ['Nice grab!', 'Beautiful!', 'Show-off!'],
  frisbeeMiss: ['Sorry! My bad!', 'Wind got it!', 'Oops!'],
  hacky: ['So close!', 'Keep it up!', 'Twenty-three!', 'Ugh, my fault.'],
  selfie: ['Send me that.', 'I blinked!', 'One more!', 'That\'s the one.'],
  guitar: ['Play Wonderwall!', 'Do the one from last week!'], guitarEnd: ['Encore!', 'Play another!', 'You\'re so good!', 'Again!'],
  study: ['I\'ve read this line six times.', 'Five more pages.', 'Is it Tuesday?', '*yawn*'],
  seat: ['This bench is the best on campus.', 'Just five minutes of sun.', 'Wait, look at this.'],
  bump: ['Oi!', 'Watch it!', 'Excuse you!', 'Sorry — oh, hi.', 'Careful!'],
  bike: ['Bell! Use your bell!', 'Whoa!', 'Slow down!'],
  greet: ['Hi!', 'Hey.', 'Morning!', 'Alright?'],
  rim: ['This fountain is older than my college.', 'I dropped a coin in for the exam.'],
  bank: ['Want to go punting later?', 'That duck is staring at me.', 'The river smells like summer.'],
};
