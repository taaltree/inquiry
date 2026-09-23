/* ============================================================
   rig.js — skinned people.

   One mesh per character; every vertex belongs to one of twelve
   bones (kind = 16 + bone). Poses are procedural: walking, running,
   sitting, cycling, driving, aiming and talking are all computed from
   a handful of parameters each frame, then uploaded as bone matrices.
   Characters face +z; their left is +x.
   ============================================================ */

const BONE = { PELVIS: 0, CHEST: 1, HEAD: 2, UARM_L: 3, FARM_L: 4, UARM_R: 5, FARM_R: 6, THIGH_L: 7, SHIN_L: 8, THIGH_R: 9, SHIN_R: 10, HAND_R: 11 };

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
const BOTTOM_COLS = ['#26324a', '#1d2433', '#3a3a3a', '#5a4a3a', '#2e2e30', '#4a5a6a', '#7a6a50'];

/* a random student, deterministic from its seed */
function studentLook(seed) {
  const r = mulberry(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const fem = r() < 0.5;
  return {
    H: fem ? 1.6 + r() * 0.12 : 1.7 + r() * 0.14, build: fem ? 0.9 + r() * 0.12 : 1.0 + r() * 0.14,
    skin: pick(SKIN_TONES), hair: fem ? pick(['long', 'bun', 'bob', 'pony', 'long', 'short']) : pick(['short', 'short', 'crop', 'curly', 'bald', 'short']),
    hairCol: pick(HAIR_COLS.slice(0, 8)),
    top: pick(['tee', 'jumper', 'hoodie', 'jacket', 'shirt', 'coat', 'jumper']), topCol: pick(TOP_COLS),
    bottom: fem && r() < 0.3 ? 'skirt' : pick(['jeans', 'jeans', 'trousers', 'trousers']), bottomCol: pick(BOTTOM_COLS),
    shoes: pick(['#1a1a1a', '#e8e6e0', '#5a3a22', '#2a2a3a']),
    backpack: r() < 0.55 ? pick(['#2a2a30', '#6a2020', '#1f3a5a', '#3a4a2a', '#8a7a5a']) : null,
    scarf: r() < 0.18 ? pick(['#7a1a1a', '#1a2a5a', '#2a4a2a']) : null,
    glasses: r() < 0.25, beard: !fem && r() < 0.2,
  };
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

/* build the skinned mesh; returns { mesh, J } where J holds joint offsets */
function buildCharacter(gl, look) {
  const b = new Builder(4096);
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
  const skinM = (bone) => plain(skin, bone, 0.55);
  const A = (bone, prim, t, r, sc, M) => b.add(prim, xform(t, r, sc), M);
  const cap = (r) => pCapsule(r, 10, 4);

  // ---------------- legs ----------------
  const longSkirt = look.bottom === 'long skirt', skirt = look.bottom === 'skirt';
  for (const [side, T, S] of [[1, BONE.THIGH_L, BONE.SHIN_L], [-1, BONE.THIGH_R, BONE.SHIN_R]]) {
    const legM = look.bottom === 'shorts' ? skinM(T) : fabric(botC, T);
    A(T, cap(0.078 * s * w), [0, -J.th / 2, 0], [0, 0, 0], [1, J.th + 0.1 * s, 1], legM);
    const shinM = skirt ? plain(hex2rgb('#2a2622'), S, 0.4) : fabric(botC, S);
    A(S, cap(0.058 * s * w), [0, -J.sh / 2, 0], [0, 0, 0], [1, J.sh + 0.06 * s, 1], shinM);
    // shoe: a box with a rounded toe
    A(S, BOX, [0, -J.sh - 0.035 * s, 0.045 * s], [0, 0, 0], [0.1 * s, 0.07 * s, 0.24 * s], plain(shoeC, S, 0.45));
    A(S, SPHERE_LO, [0, -J.sh - 0.035 * s, 0.15 * s], [0, 0, 0], [0.1 * s, 0.075 * s, 0.1 * s], plain(shoeC, S, 0.45));
    void side;
  }
  // ---------------- hips ----------------
  A(BONE.PELVIS, pCyl(12, true, true, 0.5, 0.46), [0, -0.02 * s, 0], [0, 0, 0], [0.34 * s * w, 0.2 * s, 0.22 * s], fabric(botC, BONE.PELVIS));
  if (skirt || longSkirt) {
    const len = longSkirt ? J.hipY - 0.06 : 0.42 * s;
    A(BONE.PELVIS, pCyl(14, false, true, 0.5, longSkirt ? 0.95 : 0.78), [0, -len / 2, 0], [0, 0, 0], [0.36 * s * w, len, 0.3 * s], fabric(longSkirt ? topC : botC, BONE.PELVIS));
  }
  // ---------------- torso ----------------
  const tc = BONE.CHEST;
  const topM = fabric(topC, tc, look.top === 'labcoat' ? 0.8 : 0.9);
  const tl = J.neck - 0.02;
  A(tc, pCyl(16, true, true, 0.5, 0.38), [0, tl * 0.55, 0.005 * s], [0, 0, 0], [0.43 * s * w, tl * 0.78, 0.25 * s], topM);
  A(tc, SPHERE, [0, tl * 0.7, 0.02 * s], [0, 0, 0], [0.4 * s * w, 0.26 * s, 0.25 * s], topM);
  A(tc, pCyl(14, true, true, 0.38, 0.44), [0, tl * 0.08, 0], [0, 0, 0], [0.34 * s * w, 0.2 * s, 0.22 * s], topM);
  for (const sx of [-1, 1]) A(tc, SPHERE_LO, [sx * J.shX * 0.92, J.shY - 0.02 * s, 0], [0, 0, 0], [0.15 * s, 0.13 * s, 0.17 * s], topM);
  if (look.top === 'hoodie') A(tc, pTorus(0.3, 16, 6), [0, J.neck - 0.07 * s, -0.04 * s], [0.35, 0, 0], [0.26 * s, 0.26 * s, 0.22 * s], topM);
  if (look.top === 'shirt' || look.top === 'suit' || look.top === 'frock') {
    A(tc, BOX, [0, J.neck - 0.14 * s, 0.118 * s], [0.08, 0, 0], [0.08 * s, 0.2 * s, 0.02 * s], plain(look.top === 'shirt' ? [0.9, 0.9, 0.88] : [0.92, 0.9, 0.86], tc, 0.8));
  }
  if (look.cravat) A(tc, BOX, [0, J.neck - 0.08 * s, 0.12 * s], [0, 0, 0], [0.12 * s, 0.09 * s, 0.05 * s], plain([0.9, 0.88, 0.82], tc, 0.8));
  // coats and gowns hang from the hips as a skirt of cloth
  if (['coat', 'frock', 'labcoat', 'dress', 'qipao'].includes(look.top)) {
    const len = look.top === 'dress' ? J.hipY - 0.05 : look.top === 'qipao' ? J.hipY * 0.75 : look.top === 'frock' ? 0.6 * s : 0.52 * s;
    A(BONE.PELVIS, pCyl(14, false, false, 0.52, look.top === 'dress' ? 0.95 : 0.66), [0, -len / 2 + 0.06 * s, 0], [0, 0, 0], [0.4 * s * w, len, 0.3 * s], fabric(topC, BONE.PELVIS, 0.85));
  }
  if (look.backpack) {
    const bc = lin(look.backpack).map((c) => c * 1.5);
    A(tc, BOX, [0, J.shY - 0.2 * s, -0.19 * s], [0, 0, 0], [0.3 * s, 0.38 * s, 0.16 * s], fabric(bc, tc, 0.85));
    A(tc, BOX, [0, J.shY - 0.03 * s, -0.19 * s], [0.4, 0, 0], [0.24 * s, 0.07 * s, 0.13 * s], fabric(bc.map((c) => c * 1.2), tc, 0.85));
  }
  if (look.scarf) A(tc, pTorus(0.35, 16, 6), [0, J.neck - 0.04 * s, 0], [0.15, 0, 0], [0.24 * s, 0.24 * s, 0.22 * s], fabric(lin(look.scarf).map((c) => c * 1.5), tc, 0.9));
  // ---------------- head ----------------
  const hb = BONE.HEAD;
  A(hb, pCyl(10), [0, 0.03 * s, 0], [0, 0, 0], [0.1 * s, 0.1 * s, 0.1 * s], skinM(hb));
  const hy = 0.16 * s;
  A(hb, SPHERE, [0, hy, 0.005 * s], [0, 0, 0], [0.19 * s, 0.235 * s, 0.215 * s], skinM(hb));
  A(hb, SPHERE_LO, [0, hy - 0.075 * s, 0.035 * s], [0, 0, 0], [0.15 * s, 0.1 * s, 0.14 * s], skinM(hb));      // jaw
  A(hb, BOX, [0, hy - 0.005 * s, 0.108 * s], [0.25, 0, 0], [0.032 * s, 0.06 * s, 0.035 * s], skinM(hb));      // nose
  A(hb, BOX, [0, hy - 0.06 * s, 0.1 * s], [0, 0, 0], [0.045 * s, 0.009 * s, 0.01 * s], plain(skin.map((c) => c * 0.55), hb, 0.5));   // mouth
  for (const sx of [-1, 1]) {
    A(hb, SPHERE_LO, [sx * 0.098 * s, hy, 0], [0, 0, 0], [0.035 * s, 0.06 * s, 0.045 * s], skinM(hb));        // ears
    A(hb, SPHERE_LO, [sx * 0.042 * s, hy + 0.028 * s, 0.093 * s], [0, 0, 0], [0.028 * s, 0.018 * s, 0.012 * s], plain([0.05, 0.04, 0.035], hb, 0.3));   // eyes
    A(hb, BOX, [sx * 0.045 * s, hy + 0.058 * s, 0.098 * s], [0.1, 0, 0], [0.05 * s, 0.009 * s, 0.01 * s], plain(hairC.map((c) => c * 0.8), hb, 0.8));  // brows
  }
  if (look.glasses) {
    for (const sx of [-1, 1]) A(hb, pTorus(0.12, 14, 4), [sx * 0.043 * s, hy + 0.025 * s, 0.103 * s], [Math.PI / 2, 0, 0], [0.05 * s, 0.05 * s, 0.05 * s], plain([0.1, 0.1, 0.1], hb, 0.3, 0.5));
    A(hb, BOX, [0, hy + 0.028 * s, 0.105 * s], [0, 0, 0], [0.03 * s, 0.006 * s, 0.006 * s], plain([0.1, 0.1, 0.1], hb, 0.3, 0.5));
  }
  const hm = plain(hairC, hb, 0.75);
  const hairStyle = look.hair;
  // a cap of hair that sits back from the forehead, with a little lift on top
  if (hairStyle !== 'bald') {
    A(hb, SPHERE, [0, hy + 0.058 * s, -0.03 * s], [-0.25, 0, 0], [0.2 * s, 0.17 * s, 0.215 * s], hm);
    A(hb, SPHERE_LO, [0, hy + 0.1 * s, 0.0], [0, 0, 0], [0.16 * s, 0.07 * s, 0.17 * s], hm);
    for (const sx of [-1, 1]) A(hb, BOX, [sx * 0.093 * s, hy + 0.02 * s, 0.02 * s], [0, 0, 0], [0.02 * s, 0.07 * s, 0.05 * s], hm);   // sideburns
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
  // ---------------- arms ----------------
  const shortSleeve = look.top === 'tee';
  for (const [U, F] of [[BONE.UARM_L, BONE.FARM_L], [BONE.UARM_R, BONE.FARM_R]]) {
    A(U, cap(0.055 * s * w), [0, -J.ua / 2, 0], [0, 0, 0], [1, J.ua + 0.08 * s, 1], shortSleeve ? fabric(topC, U) : fabric(topC, U));
    A(F, cap(0.045 * s * w), [0, -J.fa / 2 + 0.02 * s, 0], [0, 0, 0], [1, J.fa, 1], shortSleeve ? skinM(F) : fabric(topC, F));
    if (!shortSleeve) A(F, pCyl(8), [0, -J.fa + 0.03 * s, 0], [0, 0, 0], [0.085 * s, 0.03 * s, 0.085 * s], fabric(topC.map((c) => c * 0.8), F));
    A(F, BOX, [0, -J.fa - 0.035 * s, 0.005 * s], [0, 0, 0], [0.045 * s, 0.1 * s, 0.085 * s], skinM(F));     // hand
  }
  return { mesh: b.upload(gl), J, look };
}

/* ---------- posing ---------- */
const _pm = { L: new Float32Array(16), T: new Float32Array(16) };
function setBone(out, i, parentIdx, tx, ty, tz, rx, ry, rz) {
  const L = xformTo(_pm.L, tx, ty, tz, rx, ry, rz);
  const o = out.subarray(i * 16, i * 16 + 16);
  if (parentIdx < 0) o.set(L);
  else M4.mul(o, out.subarray(parentIdx * 16, parentIdx * 16 + 16), L);
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

/* P: { state, phase, speed (0..1 run blend), lean, turn, t, aim, talk, crank, seat } */
function poseCharacter(ch, P, out) {
  const J = ch.J, t = P.t || 0;
  const st = P.state || 'idle';
  let pelY = J.hipY, pelZ = 0, pelRx = 0, pelRy = 0, pelRz = 0, chestRx = 0, chestRy = 0;
  let tL = 0, tR = 0, kL = 0.05, kR = 0.05, uaL = 0.05, uaR = 0.05, faL = 0.18, faR = 0.18, outL = 0.1, outR = 0.1, headRx = 0, headRy = 0;
  let rollL = 0, rollR = 0;
  if (st === 'walk' || st === 'run' || st === 'idle' || st === 'air') {
    const run = clamp(P.speed || 0, 0, 1);
    const moving = st === 'idle' ? 0 : 1;
    const ph = P.phase || 0;
    const s = Math.sin(ph), c = Math.cos(ph);
    const At = lerp(0.42, 0.78, run) * moving, Ak = lerp(0.55, 1.35, run) * moving;
    tL = At * s; tR = -At * s;
    kL = 0.06 + Math.max(0, Math.sin(ph + 1.1)) * Ak * (1 - 0.2 * run) + Math.max(0, -s) * 0.15 * run * moving;
    kR = 0.06 + Math.max(0, Math.sin(ph + Math.PI + 1.1)) * Ak * (1 - 0.2 * run) + Math.max(0, s) * 0.15 * run * moving;
    pelY = J.hipY - Math.abs(c) * lerp(0.02, 0.06, run) * moving - run * 0.05 * moving;
    pelRy = s * 0.1 * moving; chestRy = -s * 0.16 * moving;
    pelRx = lerp(0.02, 0.2, run) * moving; chestRx = lerp(0.02, 0.1, run) * moving;
    uaL = -At * 0.85 * s * lerp(0.7, 1.1, run); uaR = At * 0.85 * s * lerp(0.7, 1.1, run);
    faL = lerp(0.25, 1.25, run * moving) + 0.1; faR = faL;
    outL = 0.1; outR = 0.1;
    // breathing and a little weight shift when still
    const idle = 1 - moving;
    chestRx += Math.sin(t * 1.4) * 0.015 * idle;
    pelRz = Math.sin(t * 0.5 + (P.seed || 0)) * 0.025 * idle;
    headRy = Math.sin(t * 0.4 + (P.seed || 0) * 3) * 0.3 * idle;
    if (st === 'air') { kL = 0.9; kR = 0.5; tL = 0.5; tR = 0.1; uaL = -0.4; uaR = -0.4; outL = 0.5; outR = 0.5; }
  } else if (st === 'sit') {
    pelY = (P.seat || 0.46) + 0.02; tL = tR = 1.45; kL = kR = 1.45; pelRx = -0.05; chestRx = 0.05;
    uaL = uaR = 0.35; faL = faR = 0.9; outL = outR = 0.12; headRx = 0.1 + Math.sin(t * 0.3 + (P.seed || 0)) * 0.08;
    headRy = Math.sin(t * 0.2 + (P.seed || 0)) * 0.25;
  } else if (st === 'ride') {
    // on a bicycle: feet on a crank circle below and ahead of the saddle, hands on the bars
    const cr = P.crank || 0, seatY = P.seat || 0.92;
    pelY = seatY; pelZ = -0.04; pelRx = 0.5; chestRx = 0.32;
    const hipY = seatY - 0.05, bbZ = 0.24, bbY = seatY - 0.6, R = 0.17;
    const foot = (a) => legIK(bbZ + Math.cos(a) * R - pelZ, hipY - (bbY + Math.sin(a) * R), J.th, J.sh);
    const iL = foot(cr), iR = foot(cr + Math.PI);
    tL = iL[0]; kL = iL[1]; tR = iR[0]; kR = iR[1];
    uaL = uaR = 1.0; faL = faR = 0.3; outL = outR = 0.2; headRx = 0.4;
  } else if (st === 'sitGround') {
    pelY = 0.16; pelRx = -0.2; chestRx = -0.12; tL = tR = 1.42; kL = 0.25; kR = 0.55;
    uaL = uaR = -0.55; faL = faR = 0.1; outL = outR = 0.28; headRx = 0.05 + Math.sin(t * 0.3 + (P.seed || 0)) * 0.1;
    headRy = Math.sin(t * 0.25 + (P.seed || 0) * 2) * 0.35;
  } else if (st === 'board') {
    pelY = J.hipY - 0.16; pelRx = 0.25; chestRx = 0.1; tL = 0.55; tR = 0.35; kL = 0.95; kR = 0.8;
    uaL = 0.3; uaR = 0.2; outL = 0.9 + (P.lean || 0) * 0.4; outR = 0.8 - (P.lean || 0) * 0.4; faL = faR = 0.5; headRy = -1.1;
  } else if (st === 'drive') {
    pelY = P.seat || 0.55; tL = tR = 1.35; kL = kR = 1.2; uaL = uaR = 0.95; faL = faR = 0.55; outL = outR = 0.15; headRx = -0.05;
  }
  // aiming: the right arm brings the book up to the chest, the left steadies it
  const aim = P.aim || 0;
  if (aim > 0) {
    uaR = lerp(uaR, 1.25, aim); faR = lerp(faR, 1.35, aim); outR = lerp(outR, 0.25, aim); rollR = lerp(0, -0.4, aim);
    uaL = lerp(uaL, 1.05, aim); faL = lerp(faL, 1.5, aim); outL = lerp(outL, 0.45, aim);
    chestRy += 0.12 * aim;
  } else if (P.hold) {
    // carrying the book at the hip when not aiming
    uaR = lerp(uaR, 0.1, 0.6); faR = lerp(faR, 1.05, 0.7); outR = 0.18;
  }
  // talking: slow open-handed gestures
  const talk = P.talk || 0;
  if (talk > 0) {
    const g = t * 1.3 + (P.seed || 0);
    uaR = lerp(uaR, 0.5 + Math.sin(g) * 0.3, talk); faR = lerp(faR, 1.3 + Math.sin(g * 1.7) * 0.25, talk); outR = lerp(outR, 0.3, talk);
    uaL = lerp(uaL, 0.3 + Math.sin(g * 0.8 + 1) * 0.2, talk * 0.7); faL = lerp(faL, 1.1, talk * 0.7);
    headRx += Math.sin(g * 0.9) * 0.06 * talk; headRy += Math.sin(g * 0.5) * 0.15 * talk;
  }
  headRy += P.lookYaw || 0; headRx += P.lookPitch || 0;
  // bones. A positive X rotation tips a bone's top forward, so a hanging limb's
  // end swings forward under a negative one.
  setBone(out, BONE.PELVIS, -1, 0, pelY, pelZ, pelRx * 0.5, pelRy, pelRz);
  setBone(out, BONE.CHEST, BONE.PELVIS, 0, J.chest, 0, chestRx + pelRx * 0.5, chestRy, 0);
  setBone(out, BONE.HEAD, BONE.CHEST, 0, J.neck, 0.01, -headRx - chestRx * 0.8 - pelRx * 0.8, headRy, 0);
  setBone(out, BONE.UARM_L, BONE.CHEST, J.shX, J.shY, 0, -uaL - chestRx * 0.5, 0, outL);
  setBone(out, BONE.FARM_L, BONE.UARM_L, 0, -J.ua, 0, -faL, 0, 0);
  setBone(out, BONE.UARM_R, BONE.CHEST, -J.shX, J.shY, 0, -uaR - chestRx * 0.5, rollR, -outR);
  setBone(out, BONE.FARM_R, BONE.UARM_R, 0, -J.ua, 0, -faR, 0, 0);
  setBone(out, BONE.THIGH_L, BONE.PELVIS, J.hipX, -0.05, 0, -tL - pelRx * 0.5, 0, 0.02);
  setBone(out, BONE.SHIN_L, BONE.THIGH_L, 0, -J.th, 0, kL, 0, 0);
  setBone(out, BONE.THIGH_R, BONE.PELVIS, -J.hipX, -0.05, 0, -tR - pelRx * 0.5, 0, -0.02);
  setBone(out, BONE.SHIN_R, BONE.THIGH_R, 0, -J.th, 0, kR, 0, 0);
  setBone(out, BONE.HAND_R, BONE.FARM_R, 0, -J.fa - 0.06, 0.04, 0, 0, 0);
  return out;
}

function newBones() {
  const b = new Float32Array(14 * 16);
  for (let i = 0; i < 14; i++) b.set(M4.create(), i * 16);
  return b;
}
