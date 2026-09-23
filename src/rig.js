/* ============================================================
   rig.js — skinned people.

   One mesh per character; every vertex belongs to one of twelve
   bones (kind = 16 + bone). Poses are procedural: walking, running,
   sitting, cycling, driving, aiming and talking are all computed from
   a handful of parameters each frame, then uploaded as bone matrices.
   Characters face +z; their left is +x.
   ============================================================ */

const BONE = { PELVIS: 0, CHEST: 1, HEAD: 2, UARM_L: 3, FARM_L: 4, UARM_R: 5, FARM_R: 6, THIGH_L: 7, SHIN_L: 8, THIGH_R: 9, SHIN_R: 10, HAND_R: 11, HAND_L: 12 };

/* write T·Ry·Rx·Rz into o without allocating */
function xformTo(o, tx, ty, tz, rx, ry, rz) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  o[0] = cy * cz + sy * sx * sz; o[1] = cx * sz; o[2] = -sy * cz + cy * sx * sz; o[3] = 0;
  o[4] = -cy * sz + sy * sx * cz; o[5] = cx * cz; o[6] = sy * sz + cy * sx * cz; o[7] = 0;
  o[8] = sy * cx; o[9] = -sx; o[10] = cy * cx; o[11] = 0;
  o[12] = tx; o[13] = ty; o[14] = tz; o[15] = 1;
  return o;
}

const SKIN_TONES = ['#f1d3bd', '#e8b996', '#d49c74', '#b77b52', '#8d5b3a', '#6a4129', '#4e2f1f'];
const HAIR_COLS = ['#1b1512', '#2e2119', '#4a3222', '#6b4a2e', '#8f6a40', '#b58c5a', '#c9b089', '#9a3a1e', '#d8d2c8'];
const TOP_COLS = ['#2f3a4f', '#5a2a2a', '#2f4a3a', '#6b6b6b', '#1f1f24', '#8a6a3e', '#3e5a7a', '#7a3e5a', '#c8c0b0', '#274060', '#6a7a3a', '#a04a2a'];
const SUMMER_COLS = ['#e8e4da', '#d9a33a', '#3a8a8a', '#c94c4c', '#5a7ac8', '#8a5ab8', '#e07a4a', '#f0f0ec', '#2a6a4a', '#e8b4c0', '#7ab0d8', '#f2d06a'];
const BOTTOM_COLS = ['#26324a', '#1d2433', '#3a3a3a', '#5a4a3a', '#2e2e30', '#4a5a6a', '#7a6a50'];

/* a random student, deterministic from its seed. opts.summer dresses them for
   a warm afternoon on the grass; opts.pack = false leaves the backpack at home */
function studentLook(seed, opts = {}) {
  const r = mulberry(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const fem = r() < 0.5;
  const L = {
    fem, H: fem ? 1.6 + r() * 0.12 : 1.7 + r() * 0.14, build: fem ? 0.9 + r() * 0.12 : 1.0 + r() * 0.14,
    skin: pick(SKIN_TONES), hair: fem ? pick(['long', 'bun', 'bob', 'pony', 'long', 'short']) : pick(['short', 'short', 'crop', 'curly', 'bald', 'short']),
    hairCol: pick(HAIR_COLS.slice(0, 8)),
    top: pick(['tee', 'jumper', 'hoodie', 'jacket', 'shirt', 'coat', 'jumper']), topCol: pick(TOP_COLS),
    bottom: fem && r() < 0.3 ? 'skirt' : pick(['jeans', 'jeans', 'trousers', 'trousers']), bottomCol: pick(BOTTOM_COLS),
    shoes: pick(['#1a1a1a', '#e8e6e0', '#5a3a22', '#2a2a3a']),
    backpack: r() < 0.55 ? pick(['#2a2a30', '#6a2020', '#1f3a5a', '#3a4a2a', '#8a7a5a']) : null,
    scarf: r() < 0.18 ? pick(['#7a1a1a', '#1a2a5a', '#2a4a2a']) : null,
    glasses: r() < 0.25, beard: !fem && r() < 0.2,
  };
  const hatRoll = r(), shadeRoll = r(), summerRoll = r();
  if (opts.summer || (opts.mixed && summerRoll < 0.45)) {
    L.top = fem ? pick(['tee', 'vest', 'tee', 'dress', 'shirt']) : pick(['tee', 'tee', 'vest', 'shirt']);
    L.topCol = pick(SUMMER_COLS);
    L.bottom = L.top === 'dress' ? 'trousers' : pick(['shorts', 'shorts', 'jeans', fem ? 'skirt' : 'shorts']);
    if (L.top === 'dress') L.bottomCol = L.topCol;
    L.bottomCol = L.bottom === 'shorts' ? pick(['#2e3f5c', '#c8b890', '#3a3a3a', '#6a8aa8', '#4a5a3a']) : L.bottomCol;
    L.scarf = null;
    L.shoes = pick(['#e8e6e0', '#1a1a1a', '#b85a3a', '#e8e6e0']);
    L.shades = shadeRoll < 0.45;
  }
  if (opts.pack === false) L.backpack = null;
  if (hatRoll < (opts.summer ? 0.28 : 0.1)) L.hat = pick(['cap', 'cap', 'beanie', 'bucket']);
  L.hatCol = pick(['#1f2a44', '#b23a2a', '#e8e4da', '#2a4a2a', '#d9a33a', '#1a1a1a']);
  return L;
}

/* the scientists: era clothes from their LOOKS entry (actors.js) */
function scientistLook(person) {
  const L = (typeof LOOKS !== 'undefined' && LOOKS[person.id]) || { h: 1.7, build: 0.46, hair: 'short', garment: 'jacket' };
  const r = mulberry([...person.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const hist = person.era === 'historical';
  const G = L.garment;
  const top = { longcoat: 'frock', gown: 'dress', qipao: 'qipao', labcoat: 'labcoat', suit: 'suit', robe: 'suit', sweater: 'jumper', modern: 'jacket', jacket: 'jacket' }[G] || 'jacket';
  const topCol = G === 'labcoat' ? '#e8e8e2' : G === 'gown' ? pick(['#2a2230', '#3a2a2a', '#1f2a3a']) : G === 'longcoat' ? pick(['#2a2420', '#1f2430', '#3a2a1f'])
    : G === 'suit' ? pick(['#2a2c33', '#3a3530', '#1f2228']) : G === 'qipao' ? '#2a4a6a' : G === 'sweater' ? '#6a6a60' : pick(['#3a4a5a', '#5a4a3a', '#2f3a2f']);
  const hair = { long: 'long', bun: 'bun', short: 'short', wild: 'wild', bob: 'bob', bald: 'bald', ringlets: 'ringlets' }[L.hair] || 'short';
  const grey = hist ? r() < 0.7 : r() < 0.3;
  return {
    H: L.h, build: 0.8 + L.build * 0.45, skin: person.id === 'tu' || person.id === 'wu' || person.id === 'yamanaka' ? '#e0b48e'
      : person.id === 'chandrasekhar' ? '#9a6a48' : person.id === 'li' ? '#e2b690' : pick(SKIN_TONES.slice(0, 3)),
    hair, hairCol: grey ? pick(['#c9c4ba', '#a8a29a', '#e0dcd4']) : pick(HAIR_COLS.slice(0, 6)),
    top, topCol, bottom: G === 'gown' || G === 'qipao' ? 'long skirt' : 'trousers',
    bottomCol: G === 'gown' || G === 'qipao' ? topCol : pick(['#26262a', '#2e2a26', '#3a3a3e']),
    shoes: '#1a1614', backpack: null, scarf: null, glasses: ['einstein', 'rubin', 'turing', 'hodgkin', 'molina', 'arnold', 'hayhoe', 'bertozzi', 'yamanaka'].includes(person.id) && r() < 0.8,
    beard: L.prop === 'beard' || person.id === 'einstein', moustache: person.id === 'einstein' || person.id === 'cajal',
    cravat: G === 'longcoat', prop: L.prop, scientist: true,
  };
}

/* build the skinned mesh; returns { mesh, lod, J } where J holds joint offsets.
   `lod` is a coarse version (about a fifth of the triangles) for distance and shadows. */
function buildCharacter(gl, look) {
  const full = buildCharacterMesh(gl, look, 0);
  const lod = buildCharacterMesh(gl, look, 1);
  return { mesh: full.mesh, lod: lod.mesh, J: full.J, look };
}
/* a surface of revolution with an elliptical, front/back-asymmetric section.
   rings: [y, rx, rzFront, rzBack] from bottom to top; a zero radius closes it. */
function pLathe(rings, seg) {
  const pos = [], nrm = [], idx = [], uv = [];
  const R = rings.length, W = seg + 1;
  const P = (i, j) => { const k = (i * W + j) * 3; return [pos[k], pos[k + 1], pos[k + 2]]; };
  for (let i = 0; i < R; i++) {
    const [y, rx, rf, rb] = rings[i];
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * TAU, c = Math.cos(a), n = Math.sin(a);
      pos.push(c * rx, y, n * (n > 0 ? rf : (rb == null ? rf : rb)));
      uv.push(j / seg, i / (R - 1));
    }
  }
  for (let i = 0; i < R; i++) for (let j = 0; j <= seg; j++) {
    const up0 = P(Math.max(0, i - 1), j), up1 = P(Math.min(R - 1, i + 1), j);
    const ar0 = P(i, (j - 1 + seg) % seg), ar1 = P(i, (j + 1) % seg);
    const ux = up1[0] - up0[0], uy = up1[1] - up0[1], uz = up1[2] - up0[2];
    const ax = ar1[0] - ar0[0], ay = ar1[1] - ar0[1], az = ar1[2] - ar0[2];
    let nx = uy * az - uz * ay, ny = uz * ax - ux * az, nz = ux * ay - uy * ax;
    const L = Math.hypot(nx, ny, nz);
    if (L < 1e-9) { const p = P(i, j); nx = 0; ny = p[1] > 0 ? 1 : -1; nz = 0; } else { nx /= L; ny /= L; nz /= L; }
    nrm.push(nx, ny, nz);
  }
  for (let i = 0; i < R - 1; i++) for (let j = 0; j < seg; j++) {
    const top = (i + 1) * W + j, bot = i * W + j;
    idx.push(top, bot, bot + 1, top, bot + 1, top + 1);
  }
  return { pos, nrm, idx, uv };
}

/* how far each bone's vertices near its joint follow the parent instead:
   [joint plane y, length of the blend] in the bone's own frame */
const SKIN_ZONES = { 1: [0.0, 0.1], 2: [0.0, 0.04], 3: [0.02, 0.08], 4: [0.0, 0.07], 5: [0.02, 0.08], 6: [0.0, 0.07], 7: [0.0, 0.08], 8: [0.0, 0.07], 9: [0.0, 0.08], 10: [0.0, 0.07] };

function buildCharacterMesh(gl, look, lod) {
  const b = new Builder(lod ? 2048 : 6144);
  const SPHERE_HI = lod ? SPHERE_LO : SPHERE;
  const H = look.H, s = H / 1.75, w = look.build;
  const J = {
    hipY: 0.93 * s, chest: 0.12 * s, neck: 0.46 * s, shY: 0.42 * s, shX: 0.19 * s * w,
    ua: 0.29 * s, fa: 0.27 * s, hipX: 0.095 * s * w, th: 0.43 * s, sh: 0.43 * s, H,
  };
  // look colours are sRGB hex; the renderer shades in linear light
  const lin = (h) => hex2rgb(h).map((c) => Math.pow(c, 2.2));
  const skin = lin(look.skin), hairC = lin(look.hairCol), topC = lin(look.topCol).map((c) => c * 1.6), botC = lin(look.bottomCol).map((c) => c * 1.6), shoeC = lin(look.shoes);
  const fabric = (col, bone, rough = 0.9) => mat(TX.FABRIC, col, { uv: 'local', tile: 0.35, rough, kind: 16 + bone });
  const plain = (col, bone, rough = 0.6, metal = 0) => mat(0, col, { rough, metal, kind: 16 + bone });
  const skinM = (bone) => plain(skin, bone, 0.6);
  // add a part to a bone; vertices near the bone's joint get a blend weight
  // (in the glow slot, which skinned vertices do not otherwise use)
  const A = (bone, prim, t, r, sc, M) => {
    const n0 = b.n;
    b.add(prim, xform(t, r, sc), M);
    const z = SKIN_ZONES[bone];
    if (!z) return;
    const j0 = z[0] * s, len = z[1] * s;
    for (let v = n0; v < b.n; v++) {
      const y = b.v[v * 16 + 1];
      b.v[v * 16 + 9] = 1 - smoothstep(clamp((j0 - y) / len, 0, 1));
    }
  };
  const seg = lod ? 8 : 16;
  const lathe = (rings) => pLathe(rings.map(([y, rx, rf, rb]) => [y * s, rx * s * w, rf * s, (rb == null ? rf : rb) * s]), seg);
  const fem = !!look.fem;

  // ---------------- legs ----------------
  const longSkirt = look.bottom === 'long skirt', skirt = look.bottom === 'skirt';
  const shorts = look.bottom === 'shorts', bareLegs = shorts || skirt || (look.top === 'dress' && !look.scientist);
  const th = 0.43, sh = 0.43;
  const thighRings = [[-th - 0.035, 0.001, 0.001], [-th - 0.02, 0.048, 0.05, 0.048], [-th + 0.03, 0.053, 0.056, 0.05], [-th * 0.62, 0.066, 0.07, 0.066],
    [-th * 0.3, 0.078, 0.082, 0.082], [-0.03, 0.086, 0.088, 0.092], [0.05, 0.074, 0.078, 0.08], [0.08, 0.001, 0.001]];
  const shinRings = [[-sh - 0.02, 0.001, 0.001], [-sh, 0.034, 0.036, 0.036], [-sh * 0.74, 0.04, 0.042, 0.047], [-sh * 0.36, 0.051, 0.047, 0.062],
    [-sh * 0.1, 0.05, 0.05, 0.054], [0.02, 0.047, 0.05, 0.046], [0.05, 0.001, 0.001]];
  for (const [T, S] of [[BONE.THIGH_L, BONE.SHIN_L], [BONE.THIGH_R, BONE.SHIN_R]]) {
    A(T, lathe(thighRings), [0, 0, 0], [0, 0, 0], [1, 1, 1], bareLegs && !shorts ? skinM(T) : shorts ? skinM(T) : fabric(botC, T));
    if (shorts) {
      // shorts: cloth over the top of the thigh, ending above the knee
      A(T, lathe([[-th * 0.55, 0.001, 0.001], [-th * 0.54, 0.074, 0.078, 0.076], [-th * 0.3, 0.088, 0.092, 0.092], [-0.03, 0.095, 0.097, 0.1], [0.06, 0.08, 0.084, 0.086], [0.09, 0.001, 0.001]]),
        [0, 0, 0], [0, 0, 0], [1, 1, 1], fabric(botC, T));
    }
    A(S, lathe(shinRings), [0, 0, 0], [0, 0, 0], [1, 1, 1], bareLegs ? (skirt && !shorts ? plain(hex2rgb('#2a2622'), S, 0.4) : skinM(S)) : fabric(botC, S));
    // shoe: a rounded foot with a sole
    A(S, SPHERE_LO, [0, -J.sh - 0.035 * s, 0.055 * s], [0, 0, 0], [0.105 * s, 0.085 * s, 0.27 * s], plain(shoeC, S, 0.45));
    A(S, BOX, [0, -J.sh - 0.072 * s, 0.055 * s], [0, 0, 0], [0.1 * s, 0.022 * s, 0.26 * s], plain(shoeC.map((c) => c * 0.5), S, 0.7));
  }
  // ---------------- hips ----------------
  const hipK = fem ? 1.08 : 1, waistK = fem ? 0.9 : 1;
  A(BONE.PELVIS, lathe([[-0.125, 0.001, 0.001], [-0.105, 0.12 * hipK, 0.09, 0.1], [-0.05, 0.16 * hipK, 0.105, 0.128], [0.02, 0.168 * hipK, 0.108, 0.122],
    [0.08, 0.155 * waistK, 0.1, 0.106], [0.13, 0.145 * waistK, 0.096, 0.098], [0.16, 0.001, 0.001]]), [0, 0, 0], [0, 0, 0], [1, 1, 1], fabric(botC, BONE.PELVIS));
  if (skirt || longSkirt) {
    const len = longSkirt ? J.hipY - 0.06 : 0.42 * s;
    A(BONE.PELVIS, pCyl(lod ? 10 : 16, false, true, 0.5, longSkirt ? 0.95 : 0.78), [0, -len / 2, 0], [0, 0, 0], [0.36 * s * w * hipK, len, 0.3 * s], fabric(longSkirt ? topC : botC, BONE.PELVIS));
  }
  // ---------------- torso ----------------
  const tc = BONE.CHEST;
  const topM = fabric(topC, tc, look.top === 'labcoat' ? 0.8 : 0.9);
  const bust = fem ? 0.022 : 0;
  A(tc, lathe([[-0.06, 0.001, 0.001], [-0.045, 0.15 * waistK, 0.104, 0.104], [0.04, 0.152 * waistK, 0.102, 0.1], [0.14, 0.162, 0.11, 0.106],
    [0.24, 0.17, 0.118 + bust, 0.11], [0.31, 0.176, 0.114 + bust * 0.5, 0.11], [0.37, 0.172, 0.1, 0.1], [0.415, 0.14, 0.08, 0.086],
    [0.445, 0.075, 0.062, 0.062], [0.47, 0.001, 0.001]]), [0, 0, 0], [0, 0, 0], [1, 1, 1], topM);
  for (const sx of [-1, 1]) A(tc, SPHERE_LO, [sx * J.shX * 0.9, J.shY - 0.025 * s, -0.003 * s], [0, 0, 0], [0.125 * s, 0.12 * s, 0.14 * s], topM);
  if (look.top === 'hoodie') A(tc, pTorus(0.3, lod ? 10 : 16, 6), [0, J.neck - 0.07 * s, -0.04 * s], [0.35, 0, 0], [0.26 * s, 0.26 * s, 0.22 * s], topM);
  if (look.top === 'shirt' || look.top === 'suit' || look.top === 'frock') {
    A(tc, BOX, [0, J.neck - 0.14 * s, 0.112 * s], [0.08, 0, 0], [0.08 * s, 0.2 * s, 0.02 * s], plain(look.top === 'shirt' ? [0.9, 0.9, 0.88] : [0.92, 0.9, 0.86], tc, 0.8));
  }
  if (look.cravat) A(tc, BOX, [0, J.neck - 0.08 * s, 0.11 * s], [0, 0, 0], [0.12 * s, 0.09 * s, 0.05 * s], plain([0.9, 0.88, 0.82], tc, 0.8));
  // coats and gowns hang from the hips as a skirt of cloth
  if (['coat', 'frock', 'labcoat', 'dress', 'qipao'].includes(look.top)) {
    const len = look.top === 'dress' ? (look.scientist ? J.hipY - 0.05 : 0.46 * s) : look.top === 'qipao' ? J.hipY * 0.75 : look.top === 'frock' ? 0.6 * s : 0.52 * s;
    A(BONE.PELVIS, pCyl(lod ? 10 : 16, false, false, 0.52, look.top === 'dress' ? 0.95 : 0.66), [0, -len / 2 + 0.06 * s, 0], [0, 0, 0], [0.4 * s * w * hipK, len, 0.3 * s], fabric(topC, BONE.PELVIS, 0.85));
  }
  if (look.backpack) {
    const bc = lin(look.backpack).map((c) => c * 1.5);
    A(tc, BOX, [0, J.shY - 0.2 * s, -0.18 * s], [0, 0, 0], [0.3 * s, 0.38 * s, 0.16 * s], fabric(bc, tc, 0.85));
    A(tc, BOX, [0, J.shY - 0.03 * s, -0.18 * s], [0.4, 0, 0], [0.24 * s, 0.07 * s, 0.13 * s], fabric(bc.map((c) => c * 1.2), tc, 0.85));
    for (const sx of [-1, 1]) A(tc, BOX, [sx * 0.1 * s, J.shY - 0.06 * s, 0.1 * s], [0.25, 0, 0], [0.035 * s, 0.22 * s, 0.012 * s], fabric(bc.map((c) => c * 0.8), tc, 0.85));
  }
  if (look.scarf) A(tc, pTorus(0.35, lod ? 10 : 16, 6), [0, J.neck - 0.04 * s, 0], [0.15, 0, 0], [0.24 * s, 0.24 * s, 0.22 * s], fabric(lin(look.scarf).map((c) => c * 1.5), tc, 0.9));
  // ---------------- head ----------------
  const hb = BONE.HEAD;
  A(hb, pLathe([[-0.025 * s, 0.001, 0.001], [-0.02 * s, 0.056 * s, 0.05 * s, 0.054 * s], [0.04 * s, 0.05 * s, 0.047 * s, 0.05 * s], [0.09 * s, 0.05 * s, 0.047 * s, 0.05 * s], [0.11 * s, 0.001, 0.001]], lod ? 8 : 12), [0, 0, 0], [0, 0, 0], [1, 1, 1], skinM(hb));
  const hy = 0.16 * s;
  A(hb, SPHERE_HI, [0, hy, 0.005 * s], [0, 0, 0], [0.19 * s, 0.235 * s, 0.215 * s], skinM(hb));
  A(hb, SPHERE_LO, [0, hy - 0.075 * s, 0.035 * s], [0, 0, 0], [0.15 * s, 0.1 * s, 0.14 * s], skinM(hb));      // jaw
  if (!lod) A(hb, BOX, [0, hy - 0.005 * s, 0.108 * s], [0.25, 0, 0], [0.032 * s, 0.06 * s, 0.035 * s], skinM(hb));      // nose
  if (!lod) A(hb, BOX, [0, hy - 0.06 * s, 0.1 * s], [0, 0, 0], [0.045 * s, 0.009 * s, 0.01 * s], plain(skin.map((c) => c * 0.55), hb, 0.5));   // mouth
  if (!lod) for (const sx of [-1, 1]) {
    A(hb, SPHERE_LO, [sx * 0.098 * s, hy, 0], [0, 0, 0], [0.035 * s, 0.06 * s, 0.045 * s], skinM(hb));        // ears
    A(hb, SPHERE_LO, [sx * 0.041 * s, hy + 0.027 * s, 0.09 * s], [0, 0, 0], [0.034 * s, 0.022 * s, 0.014 * s], plain([0.75, 0.74, 0.72], hb, 0.3));   // eyes
    A(hb, SPHERE_LO, [sx * 0.041 * s, hy + 0.026 * s, 0.096 * s], [0, 0, 0], [0.016 * s, 0.017 * s, 0.008 * s], plain([0.04, 0.03, 0.025], hb, 0.2));
    A(hb, BOX, [sx * 0.045 * s, hy + 0.058 * s, 0.098 * s], [0.1, 0, 0], [0.05 * s, 0.009 * s, 0.01 * s], plain(hairC.map((c) => c * 0.8), hb, 0.8));  // brows
  }
  if (look.glasses && !lod) {
    for (const sx of [-1, 1]) A(hb, pTorus(0.12, 14, 4), [sx * 0.043 * s, hy + 0.025 * s, 0.103 * s], [Math.PI / 2, 0, 0], [0.05 * s, 0.05 * s, 0.05 * s], plain([0.1, 0.1, 0.1], hb, 0.3, 0.5));
    A(hb, BOX, [0, hy + 0.028 * s, 0.105 * s], [0, 0, 0], [0.03 * s, 0.006 * s, 0.006 * s], plain([0.1, 0.1, 0.1], hb, 0.3, 0.5));
  }
  const hm = plain(hairC, hb, 0.75);
  const hairStyle = look.hair;
  // a cap of hair that sits back from the forehead, with a little lift on top
  if (hairStyle !== 'bald') {
    A(hb, SPHERE_HI, [0, hy + 0.058 * s, -0.03 * s], [-0.25, 0, 0], [0.2 * s, 0.17 * s, 0.215 * s], hm);
    A(hb, SPHERE_LO, [0, hy + 0.1 * s, 0.0], [0, 0, 0], [0.16 * s, 0.07 * s, 0.17 * s], hm);
    if (!lod) for (const sx of [-1, 1]) A(hb, BOX, [sx * 0.093 * s, hy + 0.02 * s, 0.02 * s], [0, 0, 0], [0.02 * s, 0.07 * s, 0.05 * s], hm);   // sideburns
  }
  else A(hb, pTorus(0.25, 16, 5), [0, hy - 0.02 * s, -0.015 * s], [0.25, 0, 0], [0.2 * s, 0.2 * s, 0.21 * s], hm);
  if (hairStyle === 'long') A(hb, pCyl(12, false, true, 0.5, 0.58), [0, hy - 0.08 * s, -0.06 * s], [0.12, 0, 0], [0.215 * s, 0.34 * s, 0.15 * s], hm);
  if (hairStyle === 'bob') A(hb, pCyl(12, false, true, 0.5, 0.56), [0, hy - 0.02 * s, -0.035 * s], [0, 0, 0], [0.225 * s, 0.15 * s, 0.19 * s], hm);
  if (hairStyle === 'bun') A(hb, SPHERE_LO, [0, hy + 0.09 * s, -0.12 * s], [0, 0, 0], [0.1 * s, 0.1 * s, 0.1 * s], hm);
  if (hairStyle === 'pony') A(hb, pCapsule(0.3, 8, 3), [0, hy - 0.04 * s, -0.14 * s], [0.4, 0, 0], [0.06 * s, 0.22 * s, 0.06 * s], hm);
  if (hairStyle === 'curly' || hairStyle === 'wild') for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    A(hb, SPHERE_LO, [Math.cos(a) * 0.1 * s, hy + 0.07 * s + Math.sin(i * 2.3) * 0.02 * s, Math.sin(a) * 0.1 * s - 0.02 * s], [0, 0, 0], [0.1 * s, 0.09 * s, 0.1 * s], hm);
  }
  if (hairStyle === 'ringlets') for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) A(hb, SPHERE_LO, [sx * 0.1 * s, hy - 0.05 * s - i * 0.05 * s, -0.02 * s], [0, 0, 0], [0.06 * s, 0.06 * s, 0.06 * s], hm);
  if (look.beard) A(hb, SPHERE_LO, [0, hy - 0.085 * s, 0.05 * s], [0.2, 0, 0], [0.16 * s, 0.13 * s, 0.13 * s], hm);
  if (look.moustache) A(hb, BOX, [0, hy - 0.04 * s, 0.1 * s], [0, 0, 0], [0.08 * s, 0.02 * s, 0.03 * s], hm);
  if (look.shades && !lod) {
    const sm = plain([0.012, 0.012, 0.016], hb, 0.08, 0.4);
    for (const sx of [-1, 1]) A(hb, BOX, [sx * 0.043 * s, hy + 0.026 * s, 0.101 * s], [0, 0, 0], [0.056 * s, 0.034 * s, 0.012 * s], sm);
    A(hb, BOX, [0, hy + 0.034 * s, 0.103 * s], [0, 0, 0], [0.04 * s, 0.008 * s, 0.008 * s], sm);
    for (const sx of [-1, 1]) A(hb, BOX, [sx * 0.094 * s, hy + 0.03 * s, 0.045 * s], [0, 0, 0], [0.008 * s, 0.008 * s, 0.1 * s], sm);
  }
  if (look.hat) {
    const hc = lin(look.hatCol || '#1f2a44').map((c) => c * 1.5);
    const hatM = fabric(hc, hb, 0.85);
    if (look.hat === 'cap') {
      A(hb, SPHERE_HI, [0, hy + 0.07 * s, -0.004 * s], [-0.12, 0, 0], [0.214 * s, 0.155 * s, 0.232 * s], hatM);
      A(hb, BOX, [0, hy + 0.066 * s, 0.13 * s], [-0.12, 0, 0], [0.17 * s, 0.014 * s, 0.13 * s], hatM);
    } else if (look.hat === 'beanie') {
      A(hb, SPHERE_HI, [0, hy + 0.078 * s, -0.012 * s], [-0.15, 0, 0], [0.218 * s, 0.2 * s, 0.232 * s], hatM);
      A(hb, pTorus(0.3, 16, 5), [0, hy + 0.05 * s, -0.012 * s], [-0.15, 0, 0], [0.225 * s, 0.225 * s, 0.24 * s], hatM);
    } else {
      A(hb, pCyl(16, true, true, 0.42, 0.5), [0, hy + 0.1 * s, -0.005 * s], [0, 0, 0], [0.22 * s, 0.11 * s, 0.23 * s], hatM);
      A(hb, pCyl(18, true, true, 0.5, 0.5), [0, hy + 0.058 * s, -0.005 * s], [-0.05, 0, 0], [0.33 * s, 0.012 * s, 0.34 * s], hatM);
    }
  }
  // ---------------- arms ----------------
  const shortSleeve = look.top === 'tee' || look.top === 'vest' || (look.top === 'dress' && !look.scientist);
  const bareArm = look.top === 'vest';
  const ua = 0.29, fa = 0.27;
  const upperRings = [[-ua - 0.03, 0.001, 0.001], [-ua - 0.012, 0.041, 0.043, 0.043], [-ua * 0.55, 0.049, 0.05, 0.05], [-0.05, 0.055, 0.055, 0.057], [0.03, 0.049, 0.05, 0.05], [0.06, 0.001, 0.001]];
  const foreRings = [[-fa - 0.012, 0.001, 0.001], [-fa, 0.03, 0.028, 0.028], [-fa * 0.6, 0.037, 0.036, 0.035], [-fa * 0.25, 0.044, 0.042, 0.042], [0.0, 0.041, 0.041, 0.041], [0.03, 0.001, 0.001]];
  for (const [U, F, side] of [[BONE.UARM_L, BONE.FARM_L, 1], [BONE.UARM_R, BONE.FARM_R, -1]]) {
    A(U, lathe(upperRings), [0, 0, 0], [0, 0, 0], [1, 1, 1], shortSleeve ? skinM(U) : fabric(topC, U));
    if (shortSleeve && !bareArm) {
      // a short sleeve over the top of the arm
      A(U, lathe([[-ua * 0.5, 0.001, 0.001], [-ua * 0.49, 0.06, 0.061, 0.061], [-0.05, 0.066, 0.066, 0.068], [0.04, 0.058, 0.06, 0.06], [0.07, 0.001, 0.001]]), [0, 0, 0], [0, 0, 0], [1, 1, 1], fabric(topC, U));
    }
    A(F, lathe(foreRings), [0, 0, 0], [0, 0, 0], [1, 1, 1], shortSleeve ? skinM(F) : fabric(topC, F));
    if (!shortSleeve && !lod) A(F, pCyl(10), [0, -J.fa + 0.03 * s, 0], [0, 0, 0], [0.084 * s, 0.03 * s, 0.08 * s], fabric(topC.map((c) => c * 0.8), F));
    // a hand: palm and fingers in one rounded mitt, and a thumb
    A(F, SPHERE_LO, [0, -J.fa - 0.05 * s, 0.006 * s], [0, 0, 0], [0.042 * s, 0.1 * s, 0.078 * s], skinM(F));
    if (!lod) A(F, SPHERE_LO, [-side * 0.006 * s, -J.fa - 0.03 * s, 0.04 * s], [0.5, 0, 0], [0.022 * s, 0.05 * s, 0.022 * s], skinM(F));
  }
  return { mesh: b.upload(gl), J };
}

/* ---------- posing ----------
   A pose is a set of joint parameters. Each body state (standing, walking,
   sitting, lying…) writes all of them, so two states can be blended while
   someone sits down or lies back. Overlays — laughing, nodding, a phone,
   a drink, clapping — are added on top, and hands that have somewhere to
   be (a mouth, a phone, a guitar neck, handlebars) get there by two-bone IK. */
const _pm = { L: new Float32Array(16), T: new Float32Array(16), U: new Float32Array(16), F: new Float32Array(16) };
function setBone(out, i, parentIdx, tx, ty, tz, rx, ry, rz) {
  const L = xformTo(_pm.L, tx, ty, tz, rx, ry, rz);
  const o = out.subarray(i * 16, i * 16 + 16);
  if (parentIdx < 0) o.set(L);
  else M4.mul(o, out.subarray(parentIdx * 16, parentIdx * 16 + 16), L);
}
function setBoneL(out, i, parentIdx, L) {
  const o = out.subarray(i * 16, i * 16 + 16);
  if (parentIdx < 0) o.set(L);
  else M4.mul(o, out.subarray(parentIdx * 16, parentIdx * 16 + 16), L);
}
/* T·Rx·Rz·Ry — flex, then abduct, then twist about the bone's own axis (hips) */
function xformXZY(o, tx, ty, tz, rx, rz, ry) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cz = Math.cos(rz), sz = Math.sin(rz), cy = Math.cos(ry), sy = Math.sin(ry);
  o[0] = cz * cy; o[1] = cx * sz * cy + sx * sy; o[2] = sx * sz * cy - cx * sy; o[3] = 0;
  o[4] = -sz; o[5] = cx * cz; o[6] = sx * cz; o[7] = 0;
  o[8] = cz * sy; o[9] = cx * sz * sy - sx * cy; o[10] = sx * sz * sy + cx * cy; o[11] = 0;
  o[12] = tx; o[13] = ty; o[14] = tz; o[15] = 1;
  return o;
}
/* 2-bone IK in the sagittal plane: returns [hipAngle, kneeBend] to put a foot
   at (fz forward, fy down) from the hip. Angles: forward swing positive. */
function legIK(fz, fy, a, b) {
  const d = clamp(Math.hypot(fz, fy), 0.05, a + b - 1e-3);
  const cosK = (a * a + b * b - d * d) / (2 * a * b);
  const knee = Math.PI - Math.acos(clamp(cosK, -1, 1));
  const base = Math.atan2(fz, fy);
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  return [base + Math.acos(clamp(cosA, -1, 1)), knee];
}

/* Two-bone arm IK in the chest frame. S shoulder, T target, pole a hint for
   where the elbow points. Writes the upper-arm matrix (relative to the chest)
   into Lu and returns the elbow flexion. The hand point sits phi off the
   forearm's axis, which the flexion compensates for. */
function armIK(Lu, S, T, pole, a, b, phi) {
  let dx = T[0] - S[0], dy = T[1] - S[1], dz = T[2] - S[2];
  let d = Math.hypot(dx, dy, dz);
  if (d < 1e-5) { dx = 0; dy = -1; dz = 0; d = 1; }
  const tx = dx / d, ty = dy / d, tz = dz / d;
  const dc = clamp(d, Math.abs(a - b) + 0.02, a + b - 0.002);
  const cosA = clamp((a * a + dc * dc - b * b) / (2 * a * dc), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  let px = pole[0], py = pole[1], pz = pole[2];
  let pd = px * tx + py * ty + pz * tz;
  px -= pd * tx; py -= pd * ty; pz -= pd * tz;
  let pl = Math.hypot(px, py, pz);
  if (pl < 1e-3) {
    // pole along the reach: fall back to "elbow behind"
    px = 0; py = 0; pz = -1; pd = pz * tz; px -= pd * tx; py -= pd * ty; pz -= pd * tz;
    pl = Math.hypot(px, py, pz) || 1;
  }
  px /= pl; py /= pl; pz /= pl;
  const ux = cosA * tx + sinA * px, uy = cosA * ty + sinA * py, uz = cosA * tz + sinA * pz;
  const ex = S[0] + ux * a, ey = S[1] + uy * a, ez = S[2] + uz * a;
  let fx = S[0] + tx * dc - ex, fy = S[1] + ty * dc - ey, fz = S[2] + tz * dc - ez;
  const fu = fx * ux + fy * uy + fz * uz;
  let wx = fx - fu * ux, wy = fy - fu * uy, wz = fz - fu * uz;
  let wl = Math.hypot(wx, wy, wz);
  if (wl < 1e-4) { wx = -px; wy = -py; wz = -pz; wl = 1; }
  wx /= wl; wy /= wl; wz /= wl;
  const Yx = -ux, Yy = -uy, Yz = -uz;
  Lu[0] = Yy * wz - Yz * wy; Lu[1] = Yz * wx - Yx * wz; Lu[2] = Yx * wy - Yy * wx; Lu[3] = 0;
  Lu[4] = Yx; Lu[5] = Yy; Lu[6] = Yz; Lu[7] = 0;
  Lu[8] = wx; Lu[9] = wy; Lu[10] = wz; Lu[11] = 0;
  Lu[12] = S[0]; Lu[13] = S[1]; Lu[14] = S[2]; Lu[15] = 1;
  const cosG = clamp((a * a + b * b - dc * dc) / (2 * a * b), -1, 1);
  return Math.max(0, Math.PI - Math.acos(cosG) - phi);
}

/* every body state writes all of these, so any two can be blended */
const PK = ['pelX', 'pelY', 'pelZ', 'pelRx', 'pelRy', 'pelRz', 'rootRx', 'chestRx', 'chestRy', 'chestRz', 'headRx', 'headRy', 'headRz',
  'tL', 'tR', 'kL', 'kR', 'sL', 'sR', 'wL', 'wR', 'uaL', 'uaR', 'faL', 'faR', 'outL', 'outR', 'rollL', 'rollR'];
const _PA = {}, _PB = {};

function baseParams(J, P, st, o) {
  const t = P.t || 0, seed = P.seed || 0, sc = J.H / 1.75;
  o.pelX = 0; o.pelY = J.hipY; o.pelZ = 0; o.pelRx = 0; o.pelRy = 0; o.pelRz = 0; o.rootRx = 0;
  o.chestRx = 0; o.chestRy = 0; o.chestRz = 0; o.headRx = 0; o.headRy = 0; o.headRz = 0;
  o.tL = 0; o.tR = 0; o.kL = 0.05; o.kR = 0.05; o.sL = 0.02; o.sR = 0.02; o.wL = 0; o.wR = 0;
  o.uaL = 0.05; o.uaR = 0.05; o.faL = 0.18; o.faR = 0.18; o.outL = 0.1; o.outR = 0.1; o.rollL = 0; o.rollR = 0;
  if (st === 'walk' || st === 'run' || st === 'idle' || st === 'air') {
    const run = clamp(P.speed || 0, 0, 1);
    const moving = st === 'idle' ? 0 : 1;
    const ph = P.phase || 0;
    const s = Math.sin(ph), c = Math.cos(ph);
    const stride = P.stride || 1, swing = P.swing == null ? 1 : P.swing;
    const At = lerp(0.42, 0.78, run) * moving * stride, Ak = lerp(0.55, 1.35, run) * moving;
    o.tL = At * s; o.tR = -At * s;
    o.kL = 0.06 + Math.max(0, Math.sin(ph + 1.1)) * Ak * (1 - 0.2 * run) + Math.max(0, -s) * 0.15 * run * moving;
    o.kR = 0.06 + Math.max(0, Math.sin(ph + Math.PI + 1.1)) * Ak * (1 - 0.2 * run) + Math.max(0, s) * 0.15 * run * moving;
    o.pelY = J.hipY - Math.abs(c) * lerp(0.02, 0.06, run) * moving - run * 0.05 * moving;
    o.pelRy = s * 0.1 * moving; o.chestRy = -s * 0.16 * moving;
    o.pelRz = -c * 0.03 * moving * (1 - run);
    o.pelRx = lerp(0.02, 0.2, run) * moving; o.chestRx = lerp(0.02, 0.1, run) * moving;
    o.uaL = -At * 0.85 * s * lerp(0.7, 1.1, run) * swing; o.uaR = At * 0.85 * s * lerp(0.7, 1.1, run) * swing;
    o.faL = lerp(0.25, 1.25, run * moving) + 0.1; o.faR = o.faL;
    o.outL = 0.1; o.outR = 0.1;
    // standing still: breathing, a slow shift of weight from one leg to the other, a wandering gaze
    const idle = 1 - moving;
    if (idle > 0) {
      const side = clamp(Math.sin(t * 0.11 + seed * 5.3) * 2.4, -1, 1);
      o.chestRx += Math.sin(t * 1.4 + seed) * 0.015;
      o.pelRz += 0.045 * side; o.pelX += 0.028 * side;
      o.kL += Math.max(0, -side) * 0.16; o.tL += Math.max(0, -side) * 0.07;
      o.kR += Math.max(0, side) * 0.16; o.tR += Math.max(0, side) * 0.07;
      o.sL += Math.max(0, -side) * 0.04; o.sR += Math.max(0, side) * 0.04;
      o.chestRz -= 0.03 * side;
      o.headRy = Math.sin(t * 0.4 + seed * 3) * 0.3;
      o.headRx = Math.sin(t * 0.23 + seed * 1.7) * 0.05;
    }
    if (st === 'air') { o.kL = 0.9; o.kR = 0.5; o.tL = 0.5; o.tR = 0.1; o.uaL = -0.4; o.uaR = -0.4; o.outL = 0.5; o.outR = 0.5; }
  } else if (st === 'sit') {
    o.pelY = (P.seat || 0.46) + 0.02; o.tL = o.tR = 1.45; o.kL = o.kR = 1.45; o.pelRx = -0.05; o.chestRx = 0.05;
    o.uaL = o.uaR = 0.35; o.faL = o.faR = 0.9; o.outL = o.outR = 0.12; o.headRx = 0.1 + Math.sin(t * 0.3 + seed) * 0.08;
    o.headRy = Math.sin(t * 0.2 + seed) * 0.25;
    if ((P.v || 0) & 1) { o.kL = 1.25; o.tL = 1.55; o.kR = 1.6; }            // one foot tucked back
  } else if (st === 'ride') {
    // on a bicycle: feet on a crank circle below and ahead of the saddle, hands on the bars
    const cr = P.crank || 0, seatY = P.seat || 0.92;
    o.pelY = seatY; o.pelZ = -0.04; o.pelRx = P.upright ? 0.12 : 0.5; o.chestRx = P.upright ? 0.08 : 0.32;
    const hipY = seatY - 0.05, bbZ = P.bbZ == null ? 0.24 : P.bbZ, bbY = seatY - (P.bbDrop || 0.6), R = P.crankR || 0.17;
    const foot = (a) => legIK(bbZ + Math.cos(a) * R - o.pelZ, hipY - (bbY + Math.sin(a) * R), J.th, J.sh);
    const iL = foot(cr), iR = foot(cr + Math.PI);
    o.tL = iL[0]; o.kL = iL[1]; o.tR = iR[0]; o.kR = iR[1];
    o.uaL = o.uaR = 1.0; o.faL = o.faR = 0.3; o.outL = o.outR = 0.2; o.headRx = P.upright ? 0.1 : 0.4;
  } else if (st === 'sitGround') {
    // legs out, leaning back on the hands
    o.pelY = 0.16; o.pelRx = -0.2; o.chestRx = -0.12; o.tL = o.tR = 1.42; o.kL = 0.25; o.kR = 0.55;
    o.uaL = o.uaR = -0.55; o.faL = o.faR = 0.1; o.outL = o.outR = 0.28; o.headRx = 0.05 + Math.sin(t * 0.3 + seed) * 0.1;
    o.headRy = Math.sin(t * 0.25 + seed * 2) * 0.35;
    if ((P.v || 0) & 1) { o.tL = 2.1; o.kL = 2.2; }                          // one knee drawn up
  } else if (st === 'cross') {
    // cross-legged on the grass, leaning a little forward
    o.pelY = 0.15 * sc + 0.01; o.pelRx = 0.08; o.chestRx = 0.06;
    o.tL = o.tR = 1.32; o.sL = o.sR = 0.78; o.kL = o.kR = 2.62; o.wL = o.wR = -0.55;
    o.uaL = o.uaR = 0.42; o.faL = o.faR = 0.55; o.outL = o.outR = 0.34;
    o.headRx = -0.05 + Math.sin(t * 0.27 + seed) * 0.08; o.headRy = Math.sin(t * 0.21 + seed * 2) * 0.3;
  } else if (st === 'lieBack') {
    // on your back in the sun (or under the stars)
    o.rootRx = -Math.PI / 2 + 0.07; o.pelY = 0.115 * sc + 0.012;
    o.tL = o.tR = 0.03; o.kL = o.kR = 0.05; o.sL = 0.07; o.sR = 0.09;
    o.uaL = o.uaR = 0.04; o.outL = o.outR = 0.32; o.faL = o.faR = 0.12;
    o.headRy = Math.sin(t * 0.13 + seed * 2) * 0.25;
    if ((P.v || 0) & 1) { o.tL = 1.0; o.kL = 2.0; o.sL = 0.12; }             // one knee up
    if ((P.v || 0) & 2) { o.tR = 0.25; o.kR = 0.35; o.sR = -0.12; o.wR = 0.2; }   // ankles crossed-ish
  } else if (st === 'lieFront') {
    // on your front, up on the elbows, feet in the air
    o.rootRx = Math.PI / 2 - 0.1; o.pelY = 0.115 * sc + 0.012;
    o.chestRx = -0.52; o.headRx = -0.1 + Math.sin(t * 0.2 + seed) * 0.08; o.headRy = Math.sin(t * 0.17 + seed * 3) * 0.2;
    o.tL = o.tR = -0.02; o.sL = o.sR = 0.06;
    const kick = Math.sin(t * 1.9 + seed * 4);
    o.kL = 1.25 + kick * 0.5; o.kR = 1.25 - kick * 0.5;
    o.uaL = o.uaR = 0.9; o.faL = o.faR = 1.2; o.outL = o.outR = 0.25;
  } else if (st === 'squat') {
    o.pelY = J.hipY * 0.5; o.pelRx = 0.5; o.chestRx = 0.35; o.tL = o.tR = 1.85; o.kL = o.kR = 2.35; o.sL = o.sR = 0.25;
    o.headRx = -0.2; o.uaL = o.uaR = 0.6; o.faL = o.faR = 0.5; o.outL = o.outR = 0.2;
  } else if (st === 'kneel') {
    o.pelY = J.sh + 0.07; o.tL = o.tR = 0.08; o.kL = o.kR = 1.62; o.chestRx = 0.05;
    o.uaL = o.uaR = 0.2; o.faL = o.faR = 0.5;
  } else if (st === 'board') {
    o.pelY = J.hipY - 0.16; o.pelRx = 0.25; o.chestRx = 0.1; o.tL = 0.55; o.tR = 0.35; o.kL = 0.95; o.kR = 0.8;
    o.uaL = 0.3; o.uaR = 0.2; o.outL = 0.9 + (P.lean || 0) * 0.4; o.outR = 0.8 - (P.lean || 0) * 0.4; o.faL = o.faR = 0.5; o.headRy = -1.1;
  } else if (st === 'drive') {
    o.pelY = P.seat || 0.55; o.tL = o.tR = 1.35; o.kL = o.kR = 1.2; o.uaL = o.uaR = 0.95; o.faL = o.faR = 0.55; o.outL = o.outR = 0.15; o.headRx = -0.05;
  }
  return o;
}

/* hand targets: [x, y, z, poleX, poleY, poleZ, weight], accumulated per hand */
const _hand = { L: new Float64Array(7), R: new Float64Array(7), tmp: new Float64Array(3), tmp2: new Float64Array(3) };
function _accHand(acc, x, y, z, px, py, pz, w) {
  if (!(w > 0.001)) return;
  if (acc[6] <= 0.001) { acc[0] = x; acc[1] = y; acc[2] = z; acc[3] = px; acc[4] = py; acc[5] = pz; acc[6] = w; return; }
  acc[0] += (x - acc[0]) * w; acc[1] += (y - acc[1]) * w; acc[2] += (z - acc[2]) * w;
  acc[3] += (px - acc[3]) * w; acc[4] += (py - acc[4]) * w; acc[5] += (pz - acc[5]) * w;
  acc[6] = acc[6] + (1 - acc[6]) * w;
}
/* point p in bone frame B (model space) → chest frame C; dir: rotation only */
function _toChest(out, C, B, x, y, z, dir) {
  let mx = x, my = y, mz = z;
  if (B) {
    mx = B[0] * x + B[4] * y + B[8] * z + (dir ? 0 : B[12]);
    my = B[1] * x + B[5] * y + B[9] * z + (dir ? 0 : B[13]);
    mz = B[2] * x + B[6] * y + B[10] * z + (dir ? 0 : B[14]);
  }
  if (!dir) { mx -= C[12]; my -= C[13]; mz -= C[14]; }
  out[0] = C[0] * mx + C[1] * my + C[2] * mz;
  out[1] = C[4] * mx + C[5] * my + C[6] * mz;
  out[2] = C[8] * mx + C[9] * my + C[10] * mz;
  return out;
}

/* P: { state, state2, blend, phase, speed, t, seed, v, lean, crank, seat, aim, hold, talk,
        laugh, lv, nod, sway, jump, kick, phone, phone2, drink, eat, clap, cheer, handsHead, wave,
        point, shade, crossArms, hipR, pockets, ikL, ikR, lookYaw, lookPitch, grip } */
function poseCharacter(ch, P, out) {
  const J = ch.J, t = P.t || 0, seed = P.seed || 0, sc = J.H / 1.75;
  const st = P.state || 'idle';
  const o = baseParams(J, P, st, _PA);
  if (P.state2 && P.blend > 0.001) {
    const B = baseParams(J, P, P.state2, _PB), k = Math.min(1, P.blend);
    for (let i = 0; i < PK.length; i++) { const key = PK[i]; o[key] += (B[key] - o[key]) * k; }
  }
  const standing = o.rootRx === 0 && o.pelY > J.hipY * 0.75;

  // ---- whole-body overlays ----
  const laugh = P.laugh || 0, lv = P.lv || 0;
  if (laugh > 0) {
    const back = lv % 3 !== 1;
    const shake = Math.sin(t * 19 + seed) * 0.05 + Math.sin(t * 11.3 + seed * 2) * 0.03;
    o.chestRx += ((back ? -0.14 : 0.3) + shake * 0.7) * laugh;
    o.headRx += ((back ? 0.34 : -0.16) + shake) * laugh;
    o.headRy += Math.sin(t * 3.1 + seed) * 0.1 * laugh;
    if (standing) { o.pelY += Math.abs(Math.sin(t * 9.5 + seed)) * 0.012 * laugh; o.kL += 0.08 * laugh; o.kR += 0.08 * laugh; }
  }
  if (P.nod) o.headRx += Math.sin(t * 7.5 + seed) * 0.11 * P.nod;
  if (P.sway) {
    o.pelRz += Math.sin(t * 2.6 + seed) * 0.035 * P.sway;
    o.chestRz += Math.sin(t * 2.6 + seed + 0.6) * 0.05 * P.sway;
    o.headRz += Math.sin(t * 2.6 + seed + 1.2) * 0.09 * P.sway;
  }
  if (P.jump) { o.pelY += P.jump; o.tL += P.jump * 1.4; o.tR += P.jump * 1.4; o.kL += P.jump * 2.8; o.kR += P.jump * 2.8; }
  if (P.kick) {
    // hacky sack: the inside of the foot comes up in front of the other knee
    const k = Math.abs(P.kick), L = P.kick > 0;
    if (L) { o.tL += 0.95 * k; o.sL += 0.55 * k; o.wL -= 0.9 * k; o.kL += 1.2 * k; o.kR += 0.12 * k; }
    else { o.tR += 0.95 * k; o.sR += 0.55 * k; o.wR -= 0.9 * k; o.kR += 1.2 * k; o.kL += 0.12 * k; }
    o.chestRx += 0.12 * k; o.headRx -= 0.35 * k; o.outL += 0.3 * k; o.outR += 0.3 * k;
  }
  if (P.phone) o.headRx -= 0.5 * P.phone;
  if (P.drink) o.headRx += 0.28 * P.drink;
  if (P.cheer) o.headRx += 0.2 * P.cheer;
  if (P.handsHead) o.headRx -= 0.15 * P.handsHead;

  // aiming: the right arm brings the book up to the chest, the left steadies it
  const aim = P.aim || 0;
  if (aim > 0) {
    o.uaR = lerp(o.uaR, 1.25, aim); o.faR = lerp(o.faR, 1.35, aim); o.outR = lerp(o.outR, 0.25, aim); o.rollR = lerp(0, -0.4, aim);
    o.uaL = lerp(o.uaL, 1.05, aim); o.faL = lerp(o.faL, 1.5, aim); o.outL = lerp(o.outL, 0.45, aim);
    o.chestRy += 0.12 * aim;
  } else if (P.hold) {
    o.uaR = lerp(o.uaR, 0.1, 0.6); o.faR = lerp(o.faR, 1.05, 0.7); o.outR = 0.18;
  }
  // talking: open-handed gestures, one or both hands depending on the person
  const talk = P.talk || 0;
  if (talk > 0) {
    const g = t * 1.3 + seed, beat = Math.max(0, Math.sin(t * 3.7 + seed * 5)) * 0.18;
    o.uaR = lerp(o.uaR, 0.5 + Math.sin(g) * 0.3 + beat, talk); o.faR = lerp(o.faR, 1.3 + Math.sin(g * 1.7) * 0.25, talk); o.outR = lerp(o.outR, 0.3, talk);
    const both = (lv + ((seed * 7) | 0)) % 2 === 0 ? 0.7 : 0.25;
    o.uaL = lerp(o.uaL, 0.3 + Math.sin(g * 0.8 + 1) * 0.2 + beat * 0.6, talk * both); o.faL = lerp(o.faL, 1.1, talk * both);
    o.headRx += Math.sin(g * 0.9) * 0.06 * talk; o.headRy += Math.sin(g * 0.5) * 0.15 * talk;
  }
  const ly = clamp(P.lookYaw || 0, -1.35, 1.35);
  o.headRy += ly * 0.72; o.chestRy += ly * 0.28;
  o.headRx += P.lookPitch || 0;

  // ---- bones: spine ----
  setBone(out, BONE.PELVIS, -1, o.pelX, o.pelY, o.pelZ, o.pelRx * 0.5 + o.rootRx, o.pelRy, o.pelRz);
  setBone(out, BONE.CHEST, BONE.PELVIS, 0, J.chest, 0, o.chestRx + o.pelRx * 0.5, o.chestRy, o.chestRz);
  setBone(out, BONE.HEAD, BONE.CHEST, 0, J.neck, 0.01, -o.headRx - o.chestRx * 0.8 - o.pelRx * 0.8, o.headRy, o.headRz);

  // ---- arms: forward kinematics first ----
  const UL = xformTo(_pm.U, J.shX, J.shY, 0, -o.uaL - o.chestRx * 0.5, -o.rollL, o.outL);
  setBoneL(out, BONE.UARM_L, BONE.CHEST, UL);
  setBone(out, BONE.FARM_L, BONE.UARM_L, 0, -J.ua, 0, -o.faL, 0, 0);
  const UR = xformTo(_pm.F, -J.shX, J.shY, 0, -o.uaR - o.chestRx * 0.5, o.rollR, -o.outR);
  setBoneL(out, BONE.UARM_R, BONE.CHEST, UR);
  setBone(out, BONE.FARM_R, BONE.UARM_R, 0, -J.ua, 0, -o.faR, 0, 0);

  // ---- hands that have somewhere to be ----
  const C = out.subarray(BONE.CHEST * 16, BONE.CHEST * 16 + 16);
  const Hd = out.subarray(BONE.HEAD * 16, BONE.HEAD * 16 + 16);
  const Pv = out.subarray(BONE.PELVIS * 16, BONE.PELVIS * 16 + 16);
  const aL = _hand.L, aR = _hand.R, v = _hand.tmp, q = _hand.tmp2;
  aL[6] = 0; aR[6] = 0;
  const shY = J.shY, hy = 0.16 * sc;
  // a point in some frame (a bone matrix, 'root' for the character's own space,
  // or null for the chest itself) into the chest frame, accumulated for one hand
  const put = (acc, F, x, y, z, px, py, pz, w, pf) => {
    if (!(w > 0.001)) return;
    let X = x, Y = y, Z = z;
    if (F) { const pp = _toChest(v, C, F === 'root' ? null : F, x, y, z, false); X = pp[0]; Y = pp[1]; Z = pp[2]; }
    let qx = px, qy = py, qz = pz;
    if (pf === 'root') { const d = _toChest(q, C, null, px, py, pz, true); qx = d[0]; qy = d[1]; qz = d[2]; }
    _accHand(acc, X, Y, Z, qx, qy, qz, w);
  };
  const putC = (acc, x, y, z, px, py, pz, w) => _accHand(acc, x, y, z, px, py, pz, w);
  if (P.pockets) { put(aL, Pv, 0.17 * sc, -0.07 * sc, 0.07 * sc, 1, 0, -0.5, P.pockets); put(aR, Pv, -0.17 * sc, -0.07 * sc, 0.07 * sc, -1, 0, -0.5, P.pockets); }
  if (P.hipR) put(aR, Pv, -0.2 * sc, 0.03 * sc, 0.0, -1, 0.1, -0.7, P.hipR);
  if (P.crossArms) { putC(aL, -0.1 * sc, 0.2 * sc, 0.15 * sc, 1, -0.6, 0, P.crossArms); putC(aR, 0.1 * sc, 0.23 * sc, 0.16 * sc, -1, -0.6, 0, P.crossArms); }
  if (P.phone) {
    putC(aR, -0.03 * sc, 0.33 * sc, 0.3 * sc, -1, -0.4, -0.5, P.phone);
    if (P.phone2) putC(aL, 0.05 * sc, 0.32 * sc, 0.29 * sc, 1, -0.4, -0.5, P.phone * P.phone2);
  }
  if (P.eat) {
    const up = smoothstep(clamp(Math.sin(t * 1.5 + seed) * 2.2 - 0.9, 0, 1));
    put(aR, Hd, -0.03 * sc, hy - 0.06 * sc, 0.15 * sc, -1, -0.7, 0, P.eat * up);
    putC(aR, -0.08 * sc, 0.12 * sc, 0.26 * sc, -1, -0.4, -0.3, P.eat * (1 - up) * 0.8);
  }
  if (P.drink) put(aR, Hd, -0.035 * sc, hy - 0.05 * sc, 0.16 * sc, -1, -0.8, 0.1, P.drink);
  if (P.shade) put(aR, Hd, -0.02 * sc, hy + 0.08 * sc, 0.16 * sc, -1, 0.2, 0, P.shade);
  if (laugh > 0.05) {
    if (lv % 3 === 0) putC(aR, -0.04 * sc, 0.1 * sc, 0.16 * sc, -1, -0.3, 0, laugh * 0.9);        // hand on the belly
    else if (lv % 3 === 1) put(aL, Hd, 0.02 * sc, hy - 0.05 * sc, 0.15 * sc, 1, -0.6, 0, laugh * 0.9);   // hand over the mouth
  }
  if (P.clap) {
    const sep = 0.035 + 0.075 * Math.abs(Math.sin(t * 12.5 + seed));
    putC(aL, sep, 0.33 * sc, 0.27 * sc, 1, -0.5, -0.3, P.clap); putC(aR, -sep, 0.33 * sc, 0.27 * sc, -1, -0.5, -0.3, P.clap);
  }
  if (P.cheer) {
    const pump = Math.sin(t * 8 + seed) * 0.06;
    putC(aL, 0.24 * sc, shY + 0.52 * sc + pump, 0.1 * sc, 1, 0, 0.1, P.cheer); putC(aR, -0.24 * sc, shY + 0.52 * sc - pump, 0.1 * sc, -1, 0, 0.1, P.cheer);
  }
  if (P.handsHead) { put(aL, Hd, 0.085 * sc, hy + 0.14 * sc, 0.0, 1, 0.5, 0.3, P.handsHead); put(aR, Hd, -0.085 * sc, hy + 0.14 * sc, 0.0, -1, 0.5, 0.3, P.handsHead); }
  if (P.wave) putC(aR, -0.34 * sc + Math.sin(t * 9 + seed) * 0.08, shY + 0.3 * sc, 0.12 * sc, -1, -1, 0, P.wave);
  if (P.point) putC(aR, -0.1 * sc, shY + 0.1 * sc, 0.62 * sc, -1, -0.5, 0, P.point);
  if (P.grip) {
    // hands on the handlebars (grip: [halfWidth, y, z] in the rider's root frame)
    const g = P.grip;
    put(aL, 'root', g[0], g[1], g[2], 1, -0.2, -1, 1, 'root'); put(aR, 'root', -g[0], g[1], g[2], -1, -0.2, -1, 1, 'root');
  }
  if (st === 'lieFront' || P.state2 === 'lieFront') {
    // forearms flat on the ground in front of the shoulders
    const k = st === 'lieFront' ? 1 - (P.state2 ? P.blend || 0 : 0) : P.blend || 0;
    for (const [acc, sx] of [[aL, 1], [aR, -1]]) {
      // shoulder in the root frame
      const Sx = C[0] * sx * J.shX + C[4] * shY + C[12], Sy = C[1] * sx * J.shX + C[5] * shY + C[13], Sz = C[2] * sx * J.shX + C[6] * shY + C[14];
      put(acc, 'root', Sx - sx * 0.02, 0.07, Sz + 0.3 * sc, sx, -1, 0, k, 'root');
    }
  }
  const ik = (acc, E) => { if (E && E.w > 0.001) put(acc, E.f === 'root' ? 'root' : E.f === 'head' ? Hd : E.f === 'pelvis' ? Pv : null, E.x, E.y, E.z, E.px == null ? 0 : E.px, E.py == null ? -1 : E.py, E.pz == null ? 0 : E.pz, E.w, E.pf); };
  ik(aL, P.ikL); ik(aR, P.ikR);

  // ---- solve the arms that have targets, blending from their FK pose ----
  const handLen = J.fa + 0.06, phi = Math.atan2(0.04, handLen), b = Math.hypot(handLen, 0.04);
  for (const [acc, side, U, Ui, Fi] of [[aL, 1, UL, BONE.UARM_L, BONE.FARM_L], [aR, -1, UR, BONE.UARM_R, BONE.FARM_R]]) {
    if (acc[6] <= 0.001) continue;
    const w = Math.min(1, acc[6]);
    // FK hand and elbow in the chest frame
    const Fk = side > 0 ? o.faL : o.faR;
    const cf = Math.cos(-Fk), sf = Math.sin(-Fk);
    // hand point in the upper-arm frame: T(0,-ua,0)·Rx(-fa)·(0,-hl,0.04)
    const hy2 = -handLen * cf - 0.04 * sf - J.ua, hz2 = -handLen * sf + 0.04 * cf;
    const fx = U[4] * hy2 + U[8] * hz2 + U[12], fy = U[5] * hy2 + U[9] * hz2 + U[13], fz = U[6] * hy2 + U[10] * hz2 + U[14];
    const ex = -U[4] * J.ua + U[12], ey = -U[5] * J.ua + U[13], ez = -U[6] * J.ua + U[14];
    const Sx = side * J.shX, Sy = shY;
    const T = [lerp(fx, acc[0], w), lerp(fy, acc[1], w), lerp(fz, acc[2], w)];
    const pole = [lerp(ex - Sx, acc[3], w), lerp(ey - Sy, acc[4], w), lerp(ez, acc[5], w)];
    const Lu = _pm.T;
    const flex = armIK(Lu, [Sx, Sy, 0], T, pole, J.ua, b, phi);
    setBoneL(out, Ui, BONE.CHEST, Lu);
    setBone(out, Fi, Ui, 0, -J.ua, 0, -flex, 0, 0);
  }

  // ---- legs ----
  setBoneL(out, BONE.THIGH_L, BONE.PELVIS, xformXZY(_pm.L, J.hipX, -0.05, 0, -o.tL - o.pelRx * 0.5, o.sL, o.wL));
  setBone(out, BONE.SHIN_L, BONE.THIGH_L, 0, -J.th, 0, o.kL, 0, 0);
  setBoneL(out, BONE.THIGH_R, BONE.PELVIS, xformXZY(_pm.L, -J.hipX, -0.05, 0, -o.tR - o.pelRx * 0.5, -o.sR, -o.wR));
  setBone(out, BONE.SHIN_R, BONE.THIGH_R, 0, -J.th, 0, o.kR, 0, 0);
  setBone(out, BONE.HAND_R, BONE.FARM_R, 0, -J.fa - 0.06, 0.04, 0, 0, 0);
  setBone(out, BONE.HAND_L, BONE.FARM_L, 0, -J.fa - 0.06, 0.04, 0, 0, 0);
  // Each bone's parent, carried straight on through the joint: vertices near a
  // joint blend toward this, so elbows, knees, shoulders and hips bend smoothly.
  if (out.length >= 448) {
    const setP = (i, p, rx, ry, rz) => {
      const pb = p * 16, o = 224 + i * 16;
      for (let k = 0; k < 12; k++) out[o + k] = out[pb + k];
      out[o + 12] = out[pb] * rx + out[pb + 4] * ry + out[pb + 8] * rz + out[pb + 12];
      out[o + 13] = out[pb + 1] * rx + out[pb + 5] * ry + out[pb + 9] * rz + out[pb + 13];
      out[o + 14] = out[pb + 2] * rx + out[pb + 6] * ry + out[pb + 10] * rz + out[pb + 14];
      out[o + 15] = 1;
    };
    out.copyWithin(224, 0, 16);
    setP(BONE.CHEST, BONE.PELVIS, 0, J.chest, 0); setP(BONE.HEAD, BONE.CHEST, 0, J.neck, 0.01);
    setP(BONE.UARM_L, BONE.CHEST, J.shX, J.shY, 0); setP(BONE.FARM_L, BONE.UARM_L, 0, -J.ua, 0);
    setP(BONE.UARM_R, BONE.CHEST, -J.shX, J.shY, 0); setP(BONE.FARM_R, BONE.UARM_R, 0, -J.ua, 0);
    setP(BONE.THIGH_L, BONE.PELVIS, J.hipX, -0.05, 0); setP(BONE.SHIN_L, BONE.THIGH_L, 0, -J.th, 0);
    setP(BONE.THIGH_R, BONE.PELVIS, -J.hipX, -0.05, 0); setP(BONE.SHIN_R, BONE.THIGH_R, 0, -J.th, 0);
  }
  return out;
}

/* 14 bone matrices, then their 14 parent-continuation matrices */
function newBones() {
  const b = new Float32Array(28 * 16);
  for (let i = 0; i < 28; i++) b.set(M4.create(), i * 16);
  return b;
}
