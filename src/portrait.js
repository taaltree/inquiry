/* ============================================================
   portrait.js — procedurally drawn "archive plate" portraits.

   HONEST FRAMING: these are stylised interpretive prints, not likenesses.
   Everything is drawn from a small parameter set (face shape, hair, facial
   hair, eyewear, headwear, collar) chosen to match the documented visual
   description of each person. The duotone engraving treatment is deliberate:
   it signals "archival illustration" rather than "photograph", and it avoids
   inventing skin tones for real people. The game states this in plain words
   on the title screen and under every portrait.
   ============================================================ */

const FACES = {
  //                face   jaw   hair              beard        eyes      extras
  newton:        { f: 0.52, j: 0.45, hair: 'flow-long',  beard: 'none',    eyes: 'plain',   collar: 'cravat' },
  curie:         { f: 0.44, j: 0.34, hair: 'updo-soft',  beard: 'none',    eyes: 'plain',   collar: 'high' },
  wu:            { f: 0.42, j: 0.32, hair: 'updo-tight', beard: 'none',    eyes: 'plain',   collar: 'mandarin' },
  strickland:    { f: 0.46, j: 0.38, hair: 'bob-short',  beard: 'none',    eyes: 'plain',   collar: 'lab' },
  einstein:      { f: 0.50, j: 0.44, hair: 'halo-wild',  beard: 'moustache', eyes: 'plain', collar: 'soft' },
  payne:         { f: 0.45, j: 0.35, hair: 'wave-set',   beard: 'none',    eyes: 'round',   collar: 'high' },
  chandrasekhar: { f: 0.46, j: 0.40, hair: 'side-part',  beard: 'none',    eyes: 'round',   collar: 'suit' },
  rubin:         { f: 0.45, j: 0.36, hair: 'bob-set',    beard: 'none',    eyes: 'square',  collar: 'soft' },
  bouman:        { f: 0.44, j: 0.34, hair: 'long-straight', beard: 'none', eyes: 'plain',   collar: 'modern' },
  darwin:        { f: 0.52, j: 0.48, hair: 'bald-high',  beard: 'full-long', eyes: 'heavy', collar: 'high' },
  franklin:      { f: 0.44, j: 0.35, hair: 'curl-short', beard: 'none',    eyes: 'plain',   collar: 'lab' },
  mcclintock:    { f: 0.42, j: 0.34, hair: 'crop-short', beard: 'none',    eyes: 'round',   collar: 'soft' },
  tu:            { f: 0.43, j: 0.33, hair: 'bob-blunt',  beard: 'none',    eyes: 'plain',   collar: 'mandarin' },
  doudna:        { f: 0.45, j: 0.35, hair: 'long-layer', beard: 'none',    eyes: 'plain',   collar: 'lab' },
  kariko:        { f: 0.44, j: 0.36, hair: 'bob-short',  beard: 'none',    eyes: 'plain',   collar: 'lab' },
  mendeleev:     { f: 0.53, j: 0.47, hair: 'mane-long',  beard: 'full-vast', eyes: 'heavy', collar: 'high' },
  hodgkin:       { f: 0.45, j: 0.36, hair: 'updo-soft',  beard: 'none',    eyes: 'round',   collar: 'lab' },
  molina:        { f: 0.48, j: 0.42, hair: 'side-part',  beard: 'none',    eyes: 'square',  collar: 'suit' },
  arnold:        { f: 0.45, j: 0.35, hair: 'long-layer', beard: 'none',    eyes: 'plain',   collar: 'lab' },
  lovelace:      { f: 0.43, j: 0.33, hair: 'ringlet-set', beard: 'none',   eyes: 'plain',   collar: 'gown' },
  noether:       { f: 0.46, j: 0.39, hair: 'updo-round', beard: 'none',    eyes: 'round',   collar: 'high' },
  turing:        { f: 0.46, j: 0.40, hair: 'side-sweep', beard: 'none',    eyes: 'plain',   collar: 'soft' },
  cajal:         { f: 0.49, j: 0.44, hair: 'bald-high',  beard: 'full-short', eyes: 'heavy', collar: 'suit' },
  li:            { f: 0.43, j: 0.33, hair: 'long-straight', beard: 'none', eyes: 'plain',   collar: 'modern' },
};

const PW = 420, PH = 520;

/* Duotone logic, stated once so it stays consistent:
   the plate is dark; INK is a bright district hue. More ink = more light.
   So the lit face carries the most ink, hair and garment sit at mid tones,
   and features are cut back OUT in the dark plate colour. */
const T = { garment: 0.22, hairBack: 0.30, hair: 0.38, beard: 0.34, face: 0.84, lit: 0.99 };

function toneRamp(plateHex, inkHex) {
  const p = parseInt(plateHex.slice(1), 16), k = parseInt(inkHex.slice(1), 16);
  const pr = (p >> 16) & 255, pg = (p >> 8) & 255, pb = p & 255;
  const kr = (k >> 16) & 255, kg = (k >> 8) & 255, kb = k & 255;
  return (t) => {
    const u = clamp(t, 0, 1);
    return `rgb(${Math.round(pr + (kr - pr) * u)},${Math.round(pg + (kg - pg) * u)},${Math.round(pb + (kb - pb) * u)})`;
  };
}

function headPath(c, cx, cy, w, h, jaw) {
  const hw = w / 2, hh = h / 2;
  c.beginPath();
  c.moveTo(cx - hw, cy - hh * 0.12);
  c.bezierCurveTo(cx - hw, cy - hh * 1.06, cx + hw, cy - hh * 1.06, cx + hw, cy - hh * 0.12);
  c.bezierCurveTo(cx + hw * 0.97, cy + hh * 0.44, cx + hw * jaw, cy + hh * 0.94, cx, cy + hh * 1.02);
  c.bezierCurveTo(cx - hw * jaw, cy + hh * 0.94, cx - hw * 0.97, cy + hh * 0.44, cx - hw, cy - hh * 0.12);
  c.closePath();
}

function portraitDataURL(person, inkHex, plateHex) {
  const F = FACES[person.id] ||
    { f: 0.46, j: 0.38, hair: 'crop-short', beard: 'none', eyes: 'plain', collar: 'soft' };
  const cv = document.createElement('canvas');
  cv.width = PW; cv.height = PH;
  const c = cv.getContext('2d');

  const ink = inkHex, plate = plateHex;
  // One opaque ramp from plate (0) to full ink (1). Everything is drawn solid so
  // a beard actually covers the mouth instead of glazing over it.
  const tn = toneRamp(plateHex, inkHex);
  const I = (a) => tn(a);                             // step up the ramp
  const D = (a) => tn(clamp(T.face - a * 0.82, 0, 1)); // step down, to cut features back
  const cx = PW / 2, cy = PH * 0.40;
  const w = PW * F.f, h = w * 1.36;
  const jaw = 0.55 + F.j * 0.9;
  const eyeY = cy + h * 0.05;

  /* ---- plate ---- */
  c.fillStyle = plate; c.fillRect(0, 0, PW, PH);
  const g = c.createRadialGradient(cx, cy, w * 0.2, cx, cy, PW * 0.75);
  g.addColorStop(0, hexA(ink, 0.10)); g.addColorStop(1, hexA(ink, 0));
  c.fillStyle = g; c.fillRect(0, 0, PW, PH);

  /* ---- shoulders ---- */
  const shY = cy + h * 0.62;
  c.fillStyle = I(T.garment);
  c.beginPath();
  c.moveTo(cx - PW * 0.44, PH);
  c.quadraticCurveTo(cx - PW * 0.31, shY + 30, cx - w * 0.44, shY + 2);
  c.lineTo(cx + w * 0.44, shY + 2);
  c.quadraticCurveTo(cx + PW * 0.31, shY + 30, cx + PW * 0.44, PH);
  c.closePath(); c.fill();

  /* ---- hair mass behind the silhouette ---- */
  drawHairBack(c, F.hair, cx, cy, w, h, I(T.hairBack));

  /* ---- neck, then head ---- */
  c.fillStyle = I(T.face * 0.72);
  c.beginPath(); c.roundRect(cx - w * 0.16, cy + h * 0.30, w * 0.32, h * 0.40, 10); c.fill();

  c.fillStyle = I(T.face);
  headPath(c, cx, cy, w, h, jaw); c.fill();

  /* ---- engraved shading: hatch the shadow side back toward the plate ---- */
  c.save();
  headPath(c, cx, cy, w, h, jaw); c.clip();
  c.strokeStyle = tn(T.face * 0.62); c.lineWidth = 2.4;
  for (let i = 0; i < 26; i++) {
    const x = cx - w * 0.58 + i * 5.5;
    if (x > cx + w * 0.02) break;
    c.globalAlpha = clamp(1 - (x - (cx - w * 0.58)) / (w * 0.62), 0.10, 1);
    c.beginPath(); c.moveTo(x, cy - h); c.lineTo(x + h * 0.55, cy + h); c.stroke();
  }
  c.globalAlpha = 1;
  // socket shadow under the brow
  c.fillStyle = tn(T.face * 0.70);
  c.beginPath(); ellipse(c, cx, cy - h * 0.02, w * 0.44, h * 0.085); c.fill();
  c.restore();

  /* ---- features, cut back into the plate colour ---- */
  const eyeDX = w * 0.205;
  c.fillStyle = D(0.86);
  for (const s of [-1, 1]) { ellipse(c, cx + s * eyeDX, eyeY, w * 0.058, w * 0.036); c.fill(); }
  c.fillStyle = I(T.lit);
  for (const s of [-1, 1]) { ellipse(c, cx + s * eyeDX - w * 0.012, eyeY - w * 0.008, w * 0.014, w * 0.011); c.fill(); }

  c.strokeStyle = D(0.9);
  c.lineWidth = F.eyes === 'heavy' ? 7 : 4;
  c.lineCap = 'round';
  for (const s of [-1, 1]) {
    c.beginPath();
    c.moveTo(cx + s * (eyeDX - w * 0.11), eyeY - h * 0.070);
    c.quadraticCurveTo(cx + s * eyeDX, eyeY - h * 0.094, cx + s * (eyeDX + w * 0.11), eyeY - h * 0.062);
    c.stroke();
  }
  // nose
  c.strokeStyle = D(0.55); c.lineWidth = 3;
  c.beginPath();
  c.moveTo(cx + w * 0.012, eyeY + h * 0.01);
  c.quadraticCurveTo(cx - w * 0.055, eyeY + h * 0.125, cx - w * 0.020, eyeY + h * 0.150);
  c.stroke();
  c.fillStyle = D(0.4);
  for (const s of [-1, 1]) { ellipse(c, cx + s * w * 0.045, eyeY + h * 0.152, w * 0.018, w * 0.012); c.fill(); }

  if (F.beard === 'none' || F.beard === 'moustache') {
    c.strokeStyle = D(0.8); c.lineWidth = 3.4;
    c.beginPath();
    c.moveTo(cx - w * 0.115, eyeY + h * 0.245);
    c.quadraticCurveTo(cx, eyeY + h * 0.277, cx + w * 0.115, eyeY + h * 0.245);
    c.stroke();
  }
  // ears
  c.fillStyle = I(T.face * 0.86);
  for (const s of [-1, 1]) { ellipse(c, cx + s * w * 0.465, eyeY + h * 0.015, w * 0.038, h * 0.058); c.fill(); }

  drawBeard(c, F.beard, cx, cy, w, h, eyeY, I(T.beard), D);
  drawHairFront(c, F.hair, cx, cy, w, h, I(T.hair));
  drawEyewear(c, F.eyes, cx, eyeY, w, h, D, I);
  drawCollar(c, F.collar, cx, shY, w, I, D);

  /* ---- plate border ---- */
  c.strokeStyle = I(0.5); c.lineWidth = 2; c.strokeRect(9.5, 9.5, PW - 19, PH - 19);
  c.strokeStyle = I(0.22); c.lineWidth = 1; c.strokeRect(15.5, 15.5, PW - 31, PH - 31);

  return cv.toDataURL('image/png');
}

/* ---------- feature painters ---------- */

function drawHairBack(c, style, cx, cy, w, h, fill) {
  c.fillStyle = fill;
  const B = (fn) => { c.beginPath(); fn(); c.fill(); };
  if (style === 'flow-long' || style === 'mane-long') {
    B(() => { ellipse(c, cx, cy + h * 0.02, w * 0.72, h * 0.64); });
  } else if (style === 'long-straight' || style === 'long-layer') {
    B(() => { c.roundRect(cx - w * 0.62, cy - h * 0.40, w * 1.24, h * 1.16, w * 0.32); });
  } else if (style === 'halo-wild') {
    for (let i = 0; i < 24; i++) {
      const a = Math.PI * 0.95 + (i / 23) * Math.PI * 1.1;
      B(() => { ellipse(c, cx + Math.cos(a) * w * 0.54, cy - h * 0.14 + Math.sin(a) * h * 0.36, w * 0.17, h * 0.13); });
    }
  } else if (style === 'ringlet-set') {
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
      B(() => { ellipse(c, cx + s * w * 0.52, cy - h * 0.02 + i * h * 0.16, w * 0.16, h * 0.115); });
    }
  } else if (style === 'updo-round' || style === 'updo-soft' || style === 'updo-tight') {
    B(() => { ellipse(c, cx, cy - h * 0.44, w * 0.42, h * 0.22); });
  } else if (style === 'wave-set' || style === 'bob-set' || style === 'bob-blunt' || style === 'bob-short' || style === 'curl-short') {
    B(() => { ellipse(c, cx, cy - h * 0.08, w * 0.60, h * 0.54); });
  }
}

function drawHairFront(c, style, cx, cy, w, h, fill) {
  c.fillStyle = fill;
  const top = cy - h * 0.50;
  const B = (fn) => { c.beginPath(); fn(); c.fill(); };

  if (style === 'bald-high') {
    for (const s of [-1, 1]) B(() => { ellipse(c, cx + s * w * 0.435, cy - h * 0.20, w * 0.095, h * 0.145); });
    return;
  }
  if (style === 'halo-wild') {
    for (let i = 0; i < 15; i++) {
      const a = Math.PI * 0.06 + (i / 14) * Math.PI * 0.88;
      B(() => { ellipse(c, cx - Math.cos(a) * w * 0.47, top + h * 0.00 - Math.sin(a) * h * 0.13, w * 0.13, h * 0.10); });
    }
    return;
  }
  if (style === 'flow-long' || style === 'mane-long') {
    B(() => { ellipse(c, cx, top + h * 0.03, w * 0.53, h * 0.15); });
    for (const s of [-1, 1]) B(() => { ellipse(c, cx + s * w * 0.46, cy - h * 0.20, w * 0.15, h * 0.26); });
    return;
  }
  if (style === 'updo-tight' || style === 'updo-round' || style === 'updo-soft') {
    B(() => { ellipse(c, cx, top + h * 0.02, w * 0.51, h * 0.13); });
    return;
  }
  if (style === 'ringlet-set') {
    B(() => { ellipse(c, cx, top + h * 0.02, w * 0.50, h * 0.12); });
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++)
      B(() => { ellipse(c, cx + s * w * 0.45, cy - h * 0.10 + i * h * 0.14, w * 0.12, h * 0.10); });
    return;
  }
  if (style === 'side-part' || style === 'side-sweep') {
    B(() => {
      c.moveTo(cx - w * 0.53, cy - h * 0.16);
      c.quadraticCurveTo(cx - w * 0.42, top - h * 0.07, cx + w * 0.08, top - h * 0.01);
      c.quadraticCurveTo(cx + w * 0.50, top + h * 0.05, cx + w * 0.53, cy - h * 0.14);
      c.quadraticCurveTo(cx + w * 0.28, top + h * 0.10, cx - w * 0.18, top + h * 0.11);
      c.quadraticCurveTo(cx - w * 0.45, top + h * 0.10, cx - w * 0.53, cy - h * 0.16);
    });
    return;
  }
  if (style === 'crop-short') {
    B(() => { ellipse(c, cx, top + h * 0.03, w * 0.49, h * 0.12); });
    return;
  }
  if (style === 'curl-short') {
    for (let i = 0; i < 10; i++) {
      const a = Math.PI * 0.06 + (i / 9) * Math.PI * 0.88;
      B(() => { ellipse(c, cx - Math.cos(a) * w * 0.455, top + h * 0.03 - Math.sin(a) * h * 0.07, w * 0.11, h * 0.085); });
    }
    return;
  }
  B(() => { ellipse(c, cx, top + h * 0.02, w * 0.51, h * 0.12); });
  for (const s of [-1, 1]) {
    B(() => {
      c.moveTo(cx + s * w * 0.52, cy - h * 0.34);
      c.quadraticCurveTo(cx + s * w * 0.62, cy + h * 0.10, cx + s * w * 0.46, cy + h * 0.30);
      c.quadraticCurveTo(cx + s * w * 0.41, cy - h * 0.06, cx + s * w * 0.35, cy - h * 0.34);
    });
  }
}

function drawBeard(c, style, cx, cy, w, h, eyeY, fill, D) {
  if (style === 'none') return;
  c.fillStyle = fill;

  if (style === 'moustache') {
    c.beginPath();
    c.moveTo(cx - w * 0.185, eyeY + h * 0.192);
    c.quadraticCurveTo(cx, eyeY + h * 0.168, cx + w * 0.185, eyeY + h * 0.192);
    c.quadraticCurveTo(cx, eyeY + h * 0.252, cx - w * 0.185, eyeY + h * 0.192);
    c.fill();
    return;
  }

  // A beard is everything BELOW a cheek line, clipped to a chin-shaped mass.
  // Drawing it that way keeps the cheeks and eyes clear instead of masking them.
  const hang = style === 'full-vast' ? 1.02 : style === 'full-long' ? 0.76 : 0.50;
  c.save();
  c.beginPath();
  c.ellipse(cx, eyeY + h * 0.13, w * 0.505, h * (0.34 + hang * 0.52), 0, 0, TAU);
  c.clip();
  c.beginPath();
  c.moveTo(cx - w * 0.70, eyeY + h * 0.105);
  c.quadraticCurveTo(cx, eyeY + h * 0.42, cx + w * 0.70, eyeY + h * 0.105);
  c.lineTo(cx + w * 0.70, eyeY + h * 2.0);
  c.lineTo(cx - w * 0.70, eyeY + h * 2.0);
  c.closePath();
  c.fill();
  // strand lines, kept faint
  c.strokeStyle = D(0.14); c.lineWidth = 1.5;
  for (let i = -2; i <= 2; i++) {
    c.beginPath();
    c.moveTo(cx + i * w * 0.12, eyeY + h * 0.30);
    c.quadraticCurveTo(cx + i * w * 0.14, eyeY + h * (0.30 + hang * 0.45), cx + i * w * 0.08, eyeY + h * (0.30 + hang * 0.72));
    c.stroke();
  }
  c.restore();

  // moustache bridges nose to beard so no lip gap shows through
  c.fillStyle = fill;
  c.beginPath();
  c.moveTo(cx - w * 0.215, eyeY + h * 0.185);
  c.quadraticCurveTo(cx, eyeY + h * 0.150, cx + w * 0.215, eyeY + h * 0.185);
  c.quadraticCurveTo(cx, eyeY + h * 0.315, cx - w * 0.215, eyeY + h * 0.185);
  c.fill();
}

function drawEyewear(c, style, cx, eyeY, w, h, D, I) {
  if (style !== 'round' && style !== 'square') return;
  const r = w * 0.155, dx = w * 0.21;
  c.strokeStyle = D(0.95); c.lineWidth = 5;
  for (const s of [-1, 1]) {
    c.beginPath();
    if (style === 'round') c.arc(cx + s * dx, eyeY, r, 0, TAU);
    else c.roundRect(cx + s * dx - r, eyeY - r * 0.76, r * 2, r * 1.52, 5);
    c.stroke();
  }
  c.lineWidth = 4;
  c.beginPath(); c.moveTo(cx - dx + r, eyeY - 1); c.lineTo(cx + dx - r, eyeY - 1); c.stroke();
  c.beginPath(); c.moveTo(cx - dx - r, eyeY - 2); c.lineTo(cx - w * 0.50, eyeY - h * 0.02); c.stroke();
  c.beginPath(); c.moveTo(cx + dx + r, eyeY - 2); c.lineTo(cx + w * 0.50, eyeY - h * 0.02); c.stroke();
  // glass glint
  c.strokeStyle = I(0.55); c.lineWidth = 2.5;
  for (const s of [-1, 1]) {
    c.beginPath();
    c.moveTo(cx + s * dx - r * 0.55, eyeY + r * 0.35);
    c.lineTo(cx + s * dx + r * 0.10, eyeY - r * 0.45);
    c.stroke();
  }
}

function drawCollar(c, style, cx, shY, w, I, D) {
  if (style === 'cravat') {
    c.fillStyle = I(0.72);
    c.beginPath();
    c.moveTo(cx - w * 0.26, shY + 6);
    c.quadraticCurveTo(cx, shY + w * 0.40, cx + w * 0.26, shY + 6);
    c.quadraticCurveTo(cx, shY + w * 0.14, cx - w * 0.26, shY + 6);
    c.fill();
  } else if (style === 'high' || style === 'gown') {
    c.fillStyle = I(0.52);
    c.beginPath(); c.roundRect(cx - w * 0.30, shY - 4, w * 0.60, w * 0.15, 6); c.fill();
    c.strokeStyle = D(0.5); c.lineWidth = 2;
    c.beginPath(); c.moveTo(cx, shY - 4); c.lineTo(cx, shY + w * 0.11); c.stroke();
  } else if (style === 'lab') {
    c.fillStyle = I(0.60);
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(cx + s * w * 0.40, shY + 4);
      c.lineTo(cx + s * w * 0.05, shY + w * 0.32);
      c.lineTo(cx + s * w * 0.015, shY + 8);
      c.closePath(); c.fill();
    }
  } else if (style === 'mandarin') {
    c.fillStyle = I(0.50);
    c.beginPath(); c.roundRect(cx - w * 0.27, shY - 3, w * 0.54, w * 0.13, 4); c.fill();
    c.fillStyle = D(0.6);
    c.beginPath(); c.arc(cx, shY + w * 0.045, w * 0.028, 0, TAU); c.fill();
  } else {
    c.strokeStyle = I(0.42); c.lineWidth = 6;
    c.beginPath();
    c.moveTo(cx - w * 0.32, shY + 6); c.lineTo(cx, shY + w * 0.26); c.lineTo(cx + w * 0.32, shY + 6);
    c.stroke();
  }
}

/* ---------- helpers ---------- */
function ellipse(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); }
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

const PORTRAIT_CACHE = {};
function getPortrait(person, district) {
  if (!PORTRAIT_CACHE[person.id]) {
    PORTRAIT_CACHE[person.id] = portraitDataURL(person, district.accent2, '#080c14');
  }
  return PORTRAIT_CACHE[person.id];
}
