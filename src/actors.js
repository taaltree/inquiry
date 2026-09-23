/* ============================================================
   actors.js — holographic scientist figures, nameplates,
   the handheld Inquiry Device, and transient VFX.

   The figures are deliberately abstract light-sculptures, not
   portraits: silhouettes only, varied by era and discipline.
   ============================================================ */

/* silhouette recipes — era-appropriate outlines, nothing face-like */
const LOOKS = {
  newton:        { h: 1.80, build: 0.52, hair: 'long',  garment: 'longcoat', prop: 'prism' },
  curie:         { h: 1.63, build: 0.42, hair: 'bun',   garment: 'gown',     prop: 'flask' },
  wu:            { h: 1.60, build: 0.40, hair: 'bun',   garment: 'qipao',    prop: 'coil' },
  strickland:    { h: 1.70, build: 0.46, hair: 'short', garment: 'labcoat',  prop: 'lens' },
  einstein:      { h: 1.72, build: 0.54, hair: 'wild',  garment: 'sweater',  prop: 'none' },
  payne:         { h: 1.68, build: 0.44, hair: 'bob',   garment: 'gown',     prop: 'plate' },
  chandrasekhar: { h: 1.74, build: 0.44, hair: 'short', garment: 'suit',     prop: 'none' },
  rubin:         { h: 1.66, build: 0.44, hair: 'bob',   garment: 'jacket',   prop: 'plate' },
  bouman:        { h: 1.67, build: 0.44, hair: 'long',  garment: 'modern',   prop: 'screen' },
  darwin:        { h: 1.78, build: 0.58, hair: 'bald',  garment: 'longcoat', prop: 'beard' },
  franklin:      { h: 1.66, build: 0.42, hair: 'short', garment: 'labcoat',  prop: 'film' },
  mcclintock:    { h: 1.58, build: 0.40, hair: 'short', garment: 'jacket',   prop: 'cob' },
  tu:            { h: 1.59, build: 0.40, hair: 'bob',   garment: 'labcoat',  prop: 'flask' },
  doudna:        { h: 1.71, build: 0.44, hair: 'long',  garment: 'labcoat',  prop: 'helix' },
  kariko:        { h: 1.62, build: 0.44, hair: 'short', garment: 'labcoat',  prop: 'vial' },
  mendeleev:     { h: 1.79, build: 0.60, hair: 'wild',  garment: 'longcoat', prop: 'beard' },
  hodgkin:       { h: 1.64, build: 0.44, hair: 'bun',   garment: 'labcoat',  prop: 'model' },
  molina:        { h: 1.72, build: 0.50, hair: 'short', garment: 'suit',     prop: 'globe' },
  arnold:        { h: 1.70, build: 0.44, hair: 'long',  garment: 'labcoat',  prop: 'flask' },
  lovelace:      { h: 1.65, build: 0.42, hair: 'ringlets', garment: 'gown',  prop: 'card' },
  noether:       { h: 1.64, build: 0.48, hair: 'bun',   garment: 'gown',     prop: 'ring' },
  turing:        { h: 1.73, build: 0.48, hair: 'short', garment: 'jacket',   prop: 'tape' },
  cajal:         { h: 1.70, build: 0.50, hair: 'bald',  garment: 'suit',     prop: 'beard' },
  li:            { h: 1.64, build: 0.42, hair: 'long',  garment: 'modern',   prop: 'screen' },
  // level 2 — the summit conference
  thompson:      { h: 1.76, build: 0.52, hair: 'short', garment: 'jacket',   prop: 'globe' },
  hayhoe:        { h: 1.66, build: 0.42, hair: 'long',  garment: 'modern',   prop: 'screen' },
  simard:        { h: 1.65, build: 0.42, hair: 'bob',   garment: 'jacket',   prop: 'cob' },
  bertozzi:      { h: 1.68, build: 0.44, hair: 'short', garment: 'labcoat',  prop: 'flask' },
  yamanaka:      { h: 1.70, build: 0.46, hair: 'short', garment: 'labcoat',  prop: 'model' },
  charpentier:   { h: 1.64, build: 0.42, hair: 'long',  garment: 'labcoat',  prop: 'helix' },
};

const DEFAULT_LOOK = { h: 1.70, build: 0.46, hair: 'short', garment: 'jacket', prop: 'none' };

function buildFigure(gl, person, accent, accent2) {
  const L = LOOKS[person.id] || DEFAULT_LOOK;
  const b = new Builder();
  // Figures read as projections first, district members second: a cool holographic
  // body carrying the district accent in the clothing. Keeps everyone legible
  // against their own district's ambient colour.
  const core = mixc(accent, hex2rgb('#35b2ff'), 0.82);   // saturated holo body
  const trim = accent2;                                   // clothing keeps the district hue
  const pale = hex2rgb('#8ed6ff');                        // skin/highlights, still tinted
  const H = L.h;
  /* NOTE ON UNITS: pCyl / pCapsule take a *radius* in metres (the xform X/Z
     scale stays 1 for the body), while BOX and SPHERE scales are full sizes. */
  const sw = 0.150 + L.build * 0.095;      // shoulder half-width, ~0.19 m typical

  const hipY = H * 0.50, chestY = H * 0.74, neckY = H * 0.855, headY = H * 0.925;

  /* legs */
  for (const s of [-1, 1]) {
    b.add(pCapsule(0.070, 10, 4), xform([s * 0.088, hipY * 0.52, 0], [0, 0, s * 0.02], [1, hipY * 1.05, 1]), core, 0.35);
    b.add(BOX, xform([s * 0.088, 0.030, 0.040], [0, 0, 0], [0.115, 0.060, 0.235]), trim, 0.5);
  }

  /* torso: shoulders at the top, tapering to the waist */
  b.add(pCyl(14, true, true, sw, sw * 0.70), xform([0, (hipY + chestY) / 2, 0], [0, 0, 0],
    [1, chestY - hipY + 0.10, 0.62]), core, 0.4);
  b.add(pCapsule(0.052, 10, 4), xform([0, neckY - 0.03, 0], [0, 0, 0], [1, 0.17, 1]), pale, 0.5);

  /* garment */
  const G = L.garment;
  if (G === 'longcoat') {
    b.add(pCyl(16, false, true, sw * 1.10, sw * 1.62), xform([0, hipY * 0.46, 0], [0, 0, 0],
      [1, hipY * 0.95, 0.80]), trim, 0.45);
    for (const s of [-1, 1]) b.add(BOX, xform([s * 0.075, chestY - 0.13, 0.098], [0.06, 0, s * 0.16],
      [0.085, 0.36, 0.045]), pale, 0.7);
    b.add(BOX, xform([0, chestY + 0.03, 0.105], [0, 0, 0], [0.145, 0.105, 0.05]), pale, 0.85);   // cravat
  } else if (G === 'gown') {
    b.add(pCyl(18, false, true, sw * 1.05, sw * 1.95), xform([0, hipY * 0.44, 0], [0, 0, 0],
      [1, hipY * 0.92, 0.92]), trim, 0.42);
    b.add(pTorus(0.045, 20, 6), xform([0, chestY + 0.02, 0], [0, 0, 0], [sw * 2.3, 1, sw * 1.5]), pale, 0.9);
  } else if (G === 'qipao') {
    b.add(pCyl(16, false, true, sw * 1.02, sw * 1.22), xform([0, hipY * 0.50, 0], [0, 0, 0],
      [1, hipY * 1.02, 0.70]), trim, 0.45);
    b.add(BOX, xform([0.035, chestY - 0.03, 0.100], [0, 0, 0.5], [0.175, 0.038, 0.045]), pale, 0.9);
  } else if (G === 'labcoat') {
    b.add(pCyl(16, false, true, sw * 1.08, sw * 1.42), xform([0, hipY * 0.66, 0], [0, 0, 0],
      [1, hipY * 0.74, 0.76]), pale, 0.55);
    b.add(BOX, xform([0, hipY * 0.68, 0.112], [0, 0, 0], [0.032, hipY * 0.72, 0.035]), trim, 1.0);
    b.add(BOX, xform([0.088, hipY * 0.56, 0.108], [0, 0, 0], [0.090, 0.085, 0.025]), trim, 0.8);  // pocket
  } else if (G === 'robe' || G === 'suit') {
    b.add(pCyl(14, false, true, sw * 1.05, sw * 1.30), xform([0, hipY * 0.58, 0], [0, 0, 0],
      [1, hipY * 0.92, 0.72]), trim, 0.42);
    for (const s of [-1, 1]) b.add(BOX, xform([s * 0.068, chestY - 0.10, 0.100], [0.05, 0, s * 0.18],
      [0.072, 0.30, 0.040]), pale, 0.65);
  } else if (G === 'sweater') {
    b.add(pCyl(14, true, true, sw * 1.06, sw * 1.14), xform([0, chestY - 0.18, 0], [0, 0, 0],
      [1, 0.48, 0.68]), trim, 0.5);
  } else if (G === 'modern') {
    b.add(pCyl(14, false, true, sw * 1.06, sw * 1.24), xform([0, hipY * 0.78, 0], [0, 0, 0],
      [1, hipY * 0.52, 0.72]), trim, 0.5);
    b.add(BOX, xform([0, chestY - 0.04, 0.105], [0, 0, 0], [0.042, 0.36, 0.032]), pale, 0.9);
  } else { /* jacket */
    b.add(pCyl(14, false, true, sw * 1.06, sw * 1.28), xform([0, hipY * 0.74, 0], [0, 0, 0],
      [1, hipY * 0.60, 0.72]), trim, 0.45);
    b.add(BOX, xform([0, chestY - 0.06, 0.105], [0, 0, 0], [0.038, 0.32, 0.032]), pale, 0.8);
  }

  /* arms — relaxed, slightly out from the body */
  for (const s of [-1, 1]) {
    const shx = s * (sw + 0.048);
    b.add(pCapsule(0.055, 10, 4), xform([shx, chestY - 0.19, 0.01], [0, 0, s * 0.13],
      [1, 0.42, 1]), core, 0.35);
    b.add(pCapsule(0.048, 10, 4), xform([shx + s * 0.052, chestY - 0.53, 0.055], [0.18, 0, s * 0.06],
      [1, 0.36, 1]), core, 0.35);
    b.add(SPHERE_LO, xform([shx + s * 0.066, chestY - 0.705, 0.105], [0, 0, 0], [0.072, 0.088, 0.072]), pale, 0.6);
  }

  /* head + hair */
  b.add(SPHERE, xform([0, headY, 0], [0, 0, 0], [0.212, 0.252, 0.222]), pale, 0.40);
  const hair = L.hair;
  if (hair === 'long') {
    b.add(pCyl(14, true, true, 0.135, 0.115), xform([0, headY - 0.155, -0.030], [0.10, 0, 0], [1, 0.42, 0.80]), trim, 0.5);
    b.add(SPHERE, xform([0, headY + 0.048, -0.020], [0, 0, 0], [0.236, 0.212, 0.244]), trim, 0.5);
  } else if (hair === 'bun') {
    b.add(SPHERE, xform([0, headY + 0.052, -0.010], [0, 0, 0], [0.238, 0.196, 0.240]), trim, 0.5);
    b.add(SPHERE_LO, xform([0, headY + 0.115, -0.135], [0, 0, 0], [0.135, 0.125, 0.135]), trim, 0.55);
  } else if (hair === 'bob') {
    b.add(pCyl(14, true, true, 0.132, 0.148), xform([0, headY - 0.045, -0.012], [0, 0, 0], [1, 0.30, 0.94]), trim, 0.5);
    b.add(SPHERE, xform([0, headY + 0.044, -0.012], [0, 0, 0], [0.240, 0.208, 0.246]), trim, 0.5);
  } else if (hair === 'wild') {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      b.add(SPHERE_LO, xform([Math.cos(a) * 0.115, headY + 0.088 + Math.sin(i * 2.1) * 0.045, Math.sin(a) * 0.10 - 0.015],
        [0, 0, 0], [0.125, 0.115, 0.125]), trim, 0.55);
    }
  } else if (hair === 'ringlets') {
    b.add(SPHERE, xform([0, headY + 0.040, -0.012], [0, 0, 0], [0.238, 0.204, 0.242]), trim, 0.5);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++)
      b.add(SPHERE_LO, xform([s * 0.135, headY - 0.045 - i * 0.072, -0.030], [0, 0, 0], [0.098, 0.092, 0.098]), trim, 0.55);
  } else if (hair === 'bald') {
    b.add(pTorus(0.030, 16, 6), xform([0, headY - 0.045, -0.010], [0, 0, 0], [0.235, 1, 0.235]), trim, 0.45);
  } else { /* short */
    b.add(SPHERE, xform([0, headY + 0.032, -0.010], [0, 0, 0], [0.230, 0.208, 0.236]), trim, 0.5);
  }

  /* signature prop — a floating emblem of the work, above the right hand */
  const px = sw * 1.02 + 0.30, py = chestY - 0.52, pz = 0.30;
  const P = L.prop;
  if (P === 'beard') {
    b.add(pCyl(12, true, true, 0.105, 0.042), xform([0, headY - 0.175, 0.050], [0.14, 0, 0], [1, 0.28, 0.86]), trim, 0.5);
  } else if (P === 'prism') {
    b.add(pPrism(3), xform([px, py, pz], [0.3, 0.6, 0.2], [0.30, 0.30, 0.30]), [1, 1, 1], 2.0);
  } else if (P === 'flask' || P === 'vial') {
    b.add(pCyl(10, true, true, 0.06, 0.17), xform([px, py, pz], [0, 0, 0], [1, 0.28, 1]), trim, 1.6);
    b.add(pCyl(8), xform([px, py + 0.16, pz], [0, 0, 0], [0.06, 0.10, 0.06]), pale, 1.2);
  } else if (P === 'coil') {
    for (let i = 0; i < 7; i++) b.add(pTorus(0.028, 14, 5), xform([px, py - 0.10 + i * 0.035, pz], [0, 0, 0], [0.24, 1, 0.24]), trim, 1.8);
  } else if (P === 'lens') {
    b.add(pCyl(18), xform([px, py, pz], [Math.PI / 2, 0.4, 0], [0.30, 0.05, 0.30]), trim, 2.0);
    b.add(pTorus(0.05, 20, 6), xform([px, py, pz], [Math.PI / 2, 0.4, 0], [0.34, 1, 0.34]), pale, 1.4);
  } else if (P === 'plate' || P === 'film' || P === 'screen' || P === 'card') {
    b.add(BOX, xform([px, py, pz], [0.12, -0.35, 0.08], [0.30, 0.36, 0.014]), trim, 1.7);
    if (P === 'film') for (let i = 0; i < 4; i++)
      b.add(BOX, xform([px, py, pz + 0.012], [0.12, -0.35, 0.08 + i * 0.7], [0.24, 0.024, 0.006]), [1, 1, 1], 2.0);
    if (P === 'card') for (let i = 0; i < 6; i++)
      b.add(BOX, xform([px - 0.10 + (i % 3) * 0.09, py + 0.10 - Math.floor(i / 3) * 0.09, pz + 0.014], [0.12, -0.35, 0.08],
        [0.035, 0.035, 0.008]), [0.05, 0.05, 0.08], 0);
  } else if (P === 'helix') {
    for (let i = 0; i < 12; i++) {
      const t = i / 11, a = t * TAU * 1.3;
      b.add(SPHERE_LO, xform([px + Math.cos(a) * 0.09, py - 0.16 + t * 0.34, pz + Math.sin(a) * 0.09], [0, 0, 0], [0.055, 0.055, 0.055]), trim, 1.9);
      b.add(SPHERE_LO, xform([px - Math.cos(a) * 0.09, py - 0.16 + t * 0.34, pz - Math.sin(a) * 0.09], [0, 0, 0], [0.055, 0.055, 0.055]), pale, 1.9);
    }
  } else if (P === 'cob') {
    b.add(pCyl(10, true, true, 0.055, 0.075), xform([px, py, pz], [0, 0, 0.35], [1, 0.34, 1]), trim, 1.5);
    for (let i = 0; i < 10; i++) b.add(SPHERE_LO, xform([px + Math.cos(i * 2.4) * 0.062, py - 0.13 + i * 0.028, pz + Math.sin(i * 2.4) * 0.062],
      [0, 0, 0], [0.042, 0.042, 0.042]), i % 3 ? pale : [1, 1, 1], 2.0);
  } else if (P === 'model' || P === 'ring') {
    b.add(pTorus(0.055, 26, 7), xform([px, py, pz], [0.7, 0.3, 0], [0.34, 0.34, 0.34]), trim, 1.9);
    if (P === 'model') b.add(pTorus(0.055, 26, 7), xform([px, py, pz], [-0.5, 1.1, 0], [0.30, 0.30, 0.30]), pale, 1.9);
  } else if (P === 'globe') {
    b.add(SPHERE, xform([px, py, pz], [0, 0, 0], [0.30, 0.30, 0.30]), trim, 1.3);
    b.add(pTorus(0.022, 26, 6), xform([px, py, pz], [0.25, 0, 0], [0.36, 0.36, 0.36]), [1, 1, 1], 2.0);
  } else if (P === 'tape') {
    for (let i = 0; i < 9; i++) b.add(BOX, xform([px - 0.20 + i * 0.05, py + Math.sin(i * 0.8) * 0.03, pz], [0, 0, Math.sin(i) * 0.2],
      [0.048, 0.11, 0.008]), i % 2 ? trim : pale, 1.8);
  }

  /* contact glow at the feet */
  b.add(pRing(0.55, 32), xform([0, 0.012, 0], [0, 0, 0], [1.5, 1, 1.5]), accent, 2.0);

  return b.upload(gl);
}

/* ---------- nameplate texture ---------- */
const PLATE_W = 768, PLATE_H = 224;

function makeNameplate(gl, person, accentHex, accent2Hex) {
  const cv = document.createElement('canvas');
  cv.width = PLATE_W; cv.height = PLATE_H;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, PLATE_W, PLATE_H);

  const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';

  c.textAlign = 'center';
  c.fillStyle = '#ffffff';
  c.font = `600 62px ${SANS}`;
  let name = person.name;
  if (c.measureText(name).width > PLATE_W - 40) c.font = `600 50px ${SANS}`;
  if (c.measureText(name).width > PLATE_W - 40) c.font = `600 42px ${SANS}`;
  c.shadowColor = accentHex; c.shadowBlur = 26;
  c.fillText(name, PLATE_W / 2, 76);
  c.shadowBlur = 0;

  c.fillStyle = accent2Hex;
  c.font = `500 30px ${SANS}`;
  c.fillText(person.lifespan, PLATE_W / 2, 122);

  c.fillStyle = 'rgba(255,255,255,0.82)';
  c.font = `400 27px ${SANS}`;
  let field = person.field.toUpperCase();
  c.save();
  const step = 2.4;
  const wide = field.split('').join(String.fromCharCode(8202));
  c.fillText(c.measureText(wide).width < PLATE_W - 60 ? wide : field, PLATE_W / 2, 164);
  c.restore();

  c.strokeStyle = accentHex; c.lineWidth = 3; c.globalAlpha = 0.85;
  c.beginPath(); c.moveTo(PLATE_W / 2 - 150, 188); c.lineTo(PLATE_W / 2 + 150, 188); c.stroke();
  c.globalAlpha = 1;

  return texFromCanvas(gl, cv);
}

/* a generic text billboard (vault labels, district signs, tips) */
function makeTextPlate(gl, lines, opts = {}) {
  const W = opts.w || 768, H = opts.h || 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  c.textAlign = 'center';
  let y = opts.top || 60;
  for (const ln of lines) {
    c.font = `${ln.weight || 600} ${ln.size || 48}px ${ln.mono ? 'ui-monospace, Menlo, monospace' : SANS}`;
    c.fillStyle = ln.color || '#ffffff';
    c.shadowColor = ln.glow || ln.color || '#ffffff';
    c.shadowBlur = ln.glow ? 24 : 0;
    const txt = ln.spaced ? ln.text.split('').join(String.fromCharCode(8202)) : ln.text;
    c.fillText(txt, W / 2, y);
    c.shadowBlur = 0;
    y += (ln.gap || (ln.size || 48) + 16);
  }
  return texFromCanvas(gl, cv);
}

/* ---------- the Inquiry Device (viewmodel) ---------- */
/* The player's own board, seen from above as you ride. Built with +Z toward
   the viewer so it matches the viewmodel basis, same as the Inquiry Device. */
function buildRideModel(gl) {
  const b = new Builder();
  const deck = hex2rgb('#1b2740'), edge = hex2rgb('#8fd0ff'), base = hex2rgb('#26354f');
  const boot = hex2rgb('#2e2620'), trouser = hex2rgb('#39485f');
  b.add(pCyl(4, true, true, 0.5, 0.44), xform([0, 0, 0], [0, Math.PI / 4, 0], [0.36, 0.055, 1.72]), deck, 0.05);
  b.add(BOX, xform([0, -0.030, 0], [0, 0, 0], [0.32, 0.030, 1.58]), base, 0.08);
  b.add(BOX, xform([0, 0.030, -0.80], [-0.36, 0, 0], [0.28, 0.045, 0.26]), deck, 0.05);
  b.add(BOX, xform([0, 0.030, 0.80], [0.36, 0, 0], [0.28, 0.045, 0.26]), deck, 0.05);
  b.add(BOX, xform([0, 0.058, 0], [0, 0, 0], [0.062, 0.018, 1.36]), edge, 0.75);
  b.add(BOX, xform([0, 0.050, -0.52], [0, 0, 0], [0.30, 0.014, 0.16]), edge, 0.5);
  for (const [dz, ang] of [[-0.30, 0.30], [0.30, 0.16]]) {
    b.add(BOX, xform([0, 0.075, dz], [0, ang, 0], [0.24, 0.055, 0.30]), hex2rgb('#4a3a2e'), 0.05);
    b.add(BOX, xform([0, 0.145, dz], [0, ang, 0], [0.22, 0.115, 0.30]), boot, 0.04);
    b.add(BOX, xform([0, 0.240, dz], [0, ang, 0], [0.20, 0.085, 0.26]), trouser, 0.03);
  }
  return b.upload(gl);
}

/* expanding ring pulse, used when an insight lands */
function buildPulseRing(gl) {
  const b = new Builder();
  b.add(pRing(0.86, 56), xform([0, 0, 0], [0, 0, 0], [1, 1, 1]), [1, 1, 1], 2.4);
  return b.upload(gl);
}

/* vertical beacon over a scientist who still has unasked questions */
function buildBeacon(gl) {
  const b = new Builder();
  b.add(pCyl(12, false, false), xform([0, 9, 0], [0, 0, 0], [1.5, 18, 1.5]), [1, 1, 1], 1.5);
  b.add(pCyl(12, false, false), xform([0, 9, 0], [0, 0, 0], [0.55, 18, 0.55]), [1, 1, 1], 2.2);
  return b.upload(gl);
}

/* diamond marker that floats above a completed scientist */
function buildCompleteMark(gl) {
  const b = new Builder();
  b.add(pPrism(4, 0.02), xform([0, 0.22, 0], [0, 0, 0], [0.66, 0.44, 0.66]), [1, 1, 1], 2.4);
  b.add(pPrism(4, 0.02), xform([0, -0.22, 0], [Math.PI, 0, 0], [0.66, 0.44, 0.66]), [1, 1, 1], 2.4);
  b.add(pTorus(0.06, 24, 6), xform([0, 0, 0], [0, 0, 0], [1.05, 1, 1.05]), [1, 1, 1], 2.0);
  return b.upload(gl);
}


/* ============================================================
   Student status plates. Persistent and legible at range — a
   1.5 s toast is not enough to tell you what a student needs.
   Cached by (tier, wants) so there are at most 20 textures.
   ============================================================ */
const SPLATE_W = 640, SPLATE_H = 300;
const SPLATE_CACHE = {};

function studentPlate(gl, tier, wants, tierName, qName, qHex) {
  const key = `${tier}|${wants}`;
  if (SPLATE_CACHE[key]) return SPLATE_CACHE[key];

  const cv = document.createElement('canvas');
  cv.width = SPLATE_W; cv.height = SPLATE_H;
  const c = cv.getContext('2d');
  const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  const MONO = 'ui-monospace, Menlo, monospace';
  const tierHex = ['#9fb0c6', '#8fd0ff', '#7df0ae', '#ffd98a'][tier];
  const done = tier >= 3;

  c.textAlign = 'center';

  // tier name
  c.font = `600 46px ${SANS}`;
  c.fillStyle = tierHex;
  c.shadowColor = tierHex; c.shadowBlur = 22;
  c.fillText(tierName.toUpperCase(), SPLATE_W / 2, 52);
  c.shadowBlur = 0;

  // progress pips: 4 steps from Unaware to Graduate
  const pipW = 76, gap = 12, total = 4 * pipW + 3 * gap;
  for (let i = 0; i < 4; i++) {
    const x = SPLATE_W / 2 - total / 2 + i * (pipW + gap);
    c.fillStyle = i < tier + 1 ? tierHex : 'rgba(255,255,255,0.16)';
    if (i < tier + 1) { c.shadowColor = tierHex; c.shadowBlur = 14; }
    c.fillRect(x, 78, pipW, 13);
    c.shadowBlur = 0;
  }

  if (done) {
    c.font = `600 34px ${SANS}`;
    c.fillStyle = '#ffd98a';
    c.shadowColor = '#ffd98a'; c.shadowBlur = 18;
    c.fillText('FULLY EDUCATED', SPLATE_W / 2, 148);
    c.shadowBlur = 0;
  } else {
    c.font = `500 27px ${MONO}`;
    c.fillStyle = 'rgba(233,242,255,0.80)';
    c.fillText('NEEDS', SPLATE_W / 2, 142);

    // the wanted question type, big and in its own colour
    c.font = `700 62px ${SANS}`;
    c.fillStyle = qHex;
    c.shadowColor = qHex; c.shadowBlur = 26;
    c.fillText(qName, SPLATE_W / 2, 208);
    c.shadowBlur = 0;

    c.font = `500 26px ${MONO}`;
    c.fillStyle = 'rgba(233,242,255,0.62)';
    c.fillText(`PRESS ${wants + 1}  ·  THEN FIRE`, SPLATE_W / 2, 252);

    // a key-cap around the number
    c.strokeStyle = qHex; c.lineWidth = 3; c.globalAlpha = 0.75;
    const kx = SPLATE_W / 2 - 100;
    c.strokeRect(kx, 228, 34, 32);
    c.globalAlpha = 1;
  }

  const tex = texFromCanvas(gl, cv);
  SPLATE_CACHE[key] = tex;
  return tex;
}

/* rising "+N" mote when an insight lands on a student */
function buildGainPlate(gl, text, hex) {
  const cv = document.createElement('canvas');
  cv.width = 420; cv.height = 160;
  const c = cv.getContext('2d');
  c.textAlign = 'center';
  c.font = `700 96px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  c.fillStyle = hex; c.shadowColor = hex; c.shadowBlur = 30;
  c.fillText(text, 210, 108);
  return texFromCanvas(gl, cv);
}

/* ============================================================
   The Codex — a large open tome held low and to the right; knowledge
   fires from the sigil on its right-hand page. Built in viewmodel space:
   +X right, +Y up, +Z toward the viewer; the muzzle direction is -Z.
   Page frame: u runs from the spine outward, v is height above the
   page mid-plane, z runs along the spine.
   ============================================================ */
const CODEX = { theta: 0.26, pageW: 0.215, pageT: 0.030, pageH: 0.320, gap: 0.012 };
function codexPt(s, u, v, z) {
  const th = CODEX.theta;
  return [s * (u * Math.cos(th) - v * Math.sin(th)), u * Math.sin(th) + v * Math.cos(th), z];
}

function buildCodex(gl) {
  const b = new Builder();
  const th = CODEX.theta, W = CODEX.pageW, T = CODEX.pageT, H = CODEX.pageH, G0 = CODEX.gap;
  const leather = hex2rgb('#4b1d24'), brass = hex2rgb('#c9a35a'), gilt = hex2rgb('#d8b464');
  const paper = hex2rgb('#e9e0c9'), paperD = hex2rgb('#cfc4a6'), ink = hex2rgb('#3a3350');
  const glove = hex2rgb('#2a2d38'), ribbon = hex2rgb('#a8202c');

  /* spine, running along z */
  b.add(pCyl(12), xform([0, -0.014, 0], [Math.PI / 2, 0, 0], [0.056, H + 0.03, 0.056]), leather, 0.02, 0.55, 0.05);
  for (const ez of [-1, 1]) b.add(pCyl(12), xform([0, -0.014, ez * (H / 2 + 0.006)], [Math.PI / 2, 0, 0], [0.062, 0.012, 0.062]), brass, 0.1, 0.3, 0.95);

  for (const s of [-1, 1]) {
    const rz = s * th, uc = G0 + W / 2;
    b.add(BOX, xform(codexPt(s, uc, -T / 2 - 0.007, 0), [0, 0, rz], [W + 0.03, 0.012, H + 0.03]), leather, 0.02, 0.6, 0.05);  // cover
    b.add(BOX, xform(codexPt(s, uc, 0, 0), [0, 0, rz], [W, T, H]), paperD, 0, 0.9, 0);                                        // page block
    b.add(BOX, xform(codexPt(s, uc, T / 2 - 0.001, 0), [0, 0, rz], [W - 0.008, 0.003, H - 0.008]), paper, 0.05, 0.95, 0);     // top sheet
    b.add(BOX, xform(codexPt(s, G0 + W - 0.004, 0, 0), [0, 0, rz], [0.008, T - 0.004, H - 0.004]), gilt, 0.15, 0.3, 0.9);    // gilt fore-edge
    for (const ez of [-1, 1]) {
      b.add(BOX, xform(codexPt(s, G0 + W + 0.006, -T / 2 - 0.007, ez * (H / 2 + 0.006)), [0, 0, rz], [0.03, 0.018, 0.03]), brass, 0.12, 0.3, 0.95);
    }
    // a thumb holding the page down near the bottom corner
    b.add(CAPSULE, xform(codexPt(s, G0 + W - 0.05, T / 2 + 0.013, H / 2 - 0.07), [0.25, 0, rz + s * 1.25], [0.030, 0.080, 0.030]), glove, 0.02, 0.7, 0);
  }
  /* the left page is written; the right page carries the sigil (drawn separately, tinted) */
  for (let i = 0; i < 12; i++) {
    const len = 0.125 + Math.sin(i * 2.3) * 0.03;
    b.add(BOX, xform(codexPt(-1, G0 + 0.026 + len / 2, T / 2 + 0.002, -H / 2 + 0.032 + i * 0.022), [0, 0, -th], [len, 0.002, 0.006]), ink, 0, 0.8, 0);
  }
  b.add(BOX, xform(codexPt(-1, G0 + 0.020, T / 2 + 0.002, -H / 2 + 0.028), [0, 0, -th], [0.018, 0.003, 0.018]), gilt, 0.3, 0.3, 0.9);   // illuminated capital
  b.add(BOX, xform([0, -0.055, H / 2 + 0.02], [0.35, 0, 0], [0.018, 0.10, 0.003]), ribbon, 0.05, 0.7, 0);                       // bookmark
  return b.upload(gl);
}

/* the sigil on the right page: white, tinted by the question type at draw time */
function buildCodexSigil(gl) {
  const b = new Builder();
  const th = CODEX.theta, W = CODEX.pageW, T = CODEX.pageT;
  const c = codexPt(1, CODEX.gap + W / 2, T / 2 + 0.004, -0.015);
  b.add(pTorus(0.045, 40, 6), xform(c, [0, 0, th], [0.135, 0.135, 0.135]), [1, 1, 1], 2.2);
  b.add(pTorus(0.06, 32, 6), xform(c, [0, 0, th], [0.085, 0.085, 0.085]), [1, 1, 1], 1.8);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const p = codexPt(1, CODEX.gap + W / 2 + Math.cos(a) * 0.052, T / 2 + 0.004, -0.015 + Math.sin(a) * 0.052);
    b.add(BOX, xform(p, [0, -a, th], [0.004, 0.002, 0.020]), [1, 1, 1], 2.4);
  }
  b.add(SPHERE_LO, xform(codexPt(1, CODEX.gap + W / 2, T / 2 + 0.010, -0.015), [0, 0, 0], [0.020, 0.012, 0.020]), [1, 1, 1], 3.0);
  return b.upload(gl);
}

/* a single loose sheet, hinged at the spine, animated on a slot change */
function buildCodexPage(gl) {
  const b = new Builder();
  const W = CODEX.pageW, T = CODEX.pageT, H = CODEX.pageH;
  b.add(BOX, xform(codexPt(1, CODEX.gap + W / 2, T / 2 + 0.003, 0), [0, 0, CODEX.theta], [W - 0.01, 0.002, H - 0.012]), hex2rgb('#f1e9d4'), 0.08, 0.95, 0);
  return b.upload(gl);
}

/* five index tabs on the right page's fore-edge, one per question type */
function buildCodexTabs(gl) {
  const out = [];
  const W = CODEX.pageW, H = CODEX.pageH;
  for (let i = 0; i < 5; i++) {
    const b = new Builder();
    const z = -H / 2 + 0.055 + i * 0.052;
    b.add(BOX, xform(codexPt(1, CODEX.gap + W + 0.014, 0, z), [0, 0, CODEX.theta], [0.024, 0.014, 0.040]), [1, 1, 1], 2.2);
    out.push(b.upload(gl));
  }
  return out;
}

/* a floating page — a marginal note waiting to be found */
function buildPageMark(gl) {
  const b = new Builder();
  const paper = hex2rgb('#f3ecd8'), ink = hex2rgb('#4a3d6a'), gilt = hex2rgb('#d8b464');
  b.add(BOX, xform([0, 0, 0], [0, 0, 0.08], [0.46, 0.60, 0.016]), paper, 1.1, 0.9, 0);
  for (let i = 0; i < 7; i++) {
    const len = 0.30 - (i % 3) * 0.05;
    for (const side of [1, -1]) {
      b.add(BOX, xform([-0.02, 0.19 - i * 0.065, side * 0.011], [0, 0, 0.08], [len, 0.014, 0.004]), ink, 0.4, 0.8, 0);
    }
  }
  b.add(BOX, xform([-0.15, 0.20, 0.011], [0, 0, 0.08], [0.06, 0.06, 0.004]), gilt, 1.6, 0.3, 0.9);
  return b.upload(gl);
}

/* A GTA-style mission marker: a soft cylinder of light standing on a ring,
   brightest at the ground. Drawn additively, tinted per department. */
function buildMissionMarker(gl) {
  const b = new Builder(512);
  const M = mat(0, [1, 1, 1], { glow: 1.0 });
  const seg = 36, R0 = 1.05, H = 1.5;
  b.reserve((seg + 1) * 2, seg * 6);
  const base = b.n;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * TAU, c = Math.cos(a), s = Math.sin(a);
    b.vert(c * R0, 0, s * R0, c, 0, s, Object.assign({}, M, { glow: 1.4 }), 0, 0);
    b.vert(c * R0, H, s * R0, c, 0, s, Object.assign({}, M, { glow: 0.0 }), 0, 1);
  }
  for (let i = 0; i < seg; i++) {
    const a = base + i * 2, c2 = a + 2;
    b.i[b.ni++] = a; b.i[b.ni++] = c2; b.i[b.ni++] = a + 1;
    b.i[b.ni++] = a + 1; b.i[b.ni++] = c2; b.i[b.ni++] = c2 + 1;
  }
  b.add(pRing(0.86, 48), xform([0, 0.03, 0], [0, 0, 0], [R0 * 2.1, 1, R0 * 2.1]), mat(0, [1, 1, 1], { glow: 2.2 }));
  b.add(pRing(0.9, 48), xform([0, 0.03, 0], [0, 0, 0], [R0 * 1.3, 1, R0 * 1.3]), mat(0, [1, 1, 1], { glow: 1.4 }));
  return b.upload(gl);
}
