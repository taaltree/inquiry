/* ============================================================
   campus.js — the title-screen backdrop: a collegiate court at dusk,
   drawn procedurally. Gatehouse tower, chapel range with traceried
   windows, cloister arcade, lawn, plane trees, lit windows.

   Not a depiction of any real college — a composite of the English
   collegiate-gothic vocabulary, which is what "university grounds"
   reads as at a glance.
   ============================================================ */

function drawCampus(W, H) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const rnd = mulberry(77213);

  const HZ = H * 0.755;                 // horizon / lawn line
  const stoneL = '#8f8674', stoneM = '#6d6555', stoneD = '#4c4639', stoneX = '#332f27';
  const warm = '#ffcf87';

  /* ---------------- dusk sky ---------------- */
  const sky = c.createLinearGradient(0, 0, 0, HZ);
  sky.addColorStop(0.00, '#0d1730');
  sky.addColorStop(0.35, '#26314e');
  sky.addColorStop(0.66, '#6b5566');
  sky.addColorStop(0.86, '#c3805c');
  sky.addColorStop(1.00, '#e8a86e');
  c.fillStyle = sky; c.fillRect(0, 0, W, HZ);

  // a few early stars, only high up
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W, y = rnd() * H * 0.34;
    const a = (1 - y / (H * 0.34)) * 0.55 * rnd();
    c.fillStyle = `rgba(255,252,240,${a.toFixed(3)})`;
    c.fillRect(x, y, 1.6, 1.6);
  }
  // low cloud banding
  for (let i = 0; i < 7; i++) {
    const y = H * (0.30 + rnd() * 0.34);
    const h = H * (0.012 + rnd() * 0.03);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(255,205,160,0)');
    g.addColorStop(0.5, `rgba(255,196,148,${(0.05 + rnd() * 0.09).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,205,160,0)');
    c.fillStyle = g; c.fillRect(0, y, W, h);
  }

  /* ---------------- helpers ---------------- */
  const lancet = (x, y, w, h, lit, tracery) => {
    // pointed-arch window
    c.beginPath();
    c.moveTo(x, y + h);
    c.lineTo(x, y + w * 0.55);
    c.quadraticCurveTo(x, y, x + w / 2, y);
    c.quadraticCurveTo(x + w, y, x + w, y + w * 0.55);
    c.lineTo(x + w, y + h);
    c.closePath();
    c.fillStyle = lit ? warm : '#20222c';
    c.globalAlpha = lit ? (0.55 + rnd() * 0.45) : 0.9;
    c.fill();
    c.globalAlpha = 1;
    if (tracery) {
      c.strokeStyle = stoneD; c.lineWidth = Math.max(1, w * 0.09);
      c.beginPath(); c.moveTo(x + w / 2, y + w * 0.30); c.lineTo(x + w / 2, y + h); c.stroke();
      c.beginPath(); c.moveTo(x, y + h * 0.52); c.lineTo(x + w, y + h * 0.52); c.stroke();
    }
    c.strokeStyle = stoneM; c.lineWidth = Math.max(1.2, w * 0.13);
    c.beginPath();
    c.moveTo(x, y + h); c.lineTo(x, y + w * 0.55);
    c.quadraticCurveTo(x, y, x + w / 2, y);
    c.quadraticCurveTo(x + w, y, x + w, y + w * 0.55);
    c.lineTo(x + w, y + h);
    c.stroke();
  };

  const crenellate = (x, y, w, unit) => {
    c.fillStyle = stoneM;
    for (let px = x; px < x + w - unit; px += unit * 2) {
      c.fillRect(px, y - unit * 1.15, unit, unit * 1.15);
    }
  };

  const pinnacle = (x, base, h, w) => {
    c.fillStyle = stoneM;
    c.fillRect(x - w / 2, base - h * 0.55, w, h * 0.55);
    c.beginPath();
    c.moveTo(x - w * 0.62, base - h * 0.55);
    c.lineTo(x, base - h);
    c.lineTo(x + w * 0.62, base - h * 0.55);
    c.closePath(); c.fill();
    c.fillStyle = stoneL;
    c.fillRect(x - w * 0.72, base - h * 0.57, w * 1.44, h * 0.045);
  };

  /* ---------------- distant spires ---------------- */
  c.fillStyle = 'rgba(48,44,60,0.55)';
  for (let i = 0; i < 9; i++) {
    const x = (i / 8) * W + (rnd() - 0.5) * W * 0.06;
    const h = H * (0.08 + rnd() * 0.13);
    const w = W * (0.012 + rnd() * 0.02);
    c.fillRect(x - w / 2, HZ - h, w, h);
    c.beginPath();
    c.moveTo(x - w * 0.75, HZ - h); c.lineTo(x, HZ - h - H * 0.05); c.lineTo(x + w * 0.75, HZ - h);
    c.closePath(); c.fill();
  }

  /* ---------------- left range: chapel ---------------- */
  const chW = W * 0.30, chX = W * 0.015, chTop = HZ - H * 0.40;
  c.fillStyle = stoneD; c.fillRect(chX, chTop, chW, HZ - chTop);
  // buttresses
  for (let i = 0; i <= 4; i++) {
    const bx = chX + (i / 4) * chW;
    c.fillStyle = stoneM;
    c.fillRect(bx - W * 0.008, chTop + H * 0.02, W * 0.016, HZ - chTop - H * 0.02);
    pinnacle(bx, chTop + H * 0.02, H * 0.075, W * 0.014);
  }
  // the great east window
  const gwW = chW * 0.42, gwX = chX + chW * 0.29, gwY = chTop + H * 0.075;
  lancet(gwX, gwY, gwW, H * 0.20, true, true);
  for (let i = 0; i < 4; i++) {
    lancet(gwX + gwW * (0.06 + i * 0.235), gwY + H * 0.055, gwW * 0.17, H * 0.135, rnd() > 0.35, false);
  }
  // roofline
  c.fillStyle = stoneX;
  c.beginPath();
  c.moveTo(chX - W * 0.006, chTop); c.lineTo(chX + chW * 0.5, chTop - H * 0.045);
  c.lineTo(chX + chW + W * 0.006, chTop); c.closePath(); c.fill();

  /* ---------------- right range: cloister arcade ---------------- */
  const clX = W * 0.63, clW = W * 0.36, clTop = HZ - H * 0.28;
  c.fillStyle = stoneD; c.fillRect(clX, clTop, clW, HZ - clTop);
  crenellate(clX, clTop, clW, W * 0.011);
  // upper windows
  for (let i = 0; i < 7; i++) {
    lancet(clX + clW * (0.045 + i * 0.135), clTop + H * 0.035, clW * 0.062, H * 0.085, rnd() > 0.4, false);
  }
  // ground arcade — open arches with the court glimpsed behind
  for (let i = 0; i < 6; i++) {
    const ax = clX + clW * (0.05 + i * 0.158), aw = clW * 0.10, ay = HZ - H * 0.115;
    c.beginPath();
    c.moveTo(ax, HZ); c.lineTo(ax, ay + aw * 0.5);
    c.quadraticCurveTo(ax, ay, ax + aw / 2, ay);
    c.quadraticCurveTo(ax + aw, ay, ax + aw, ay + aw * 0.5);
    c.lineTo(ax + aw, HZ); c.closePath();
    c.fillStyle = '#191b22'; c.fill();
    c.strokeStyle = stoneM; c.lineWidth = W * 0.0035; c.stroke();
    if (rnd() > 0.55) {
      c.fillStyle = `rgba(255,200,130,${(0.10 + rnd() * 0.16).toFixed(2)})`;
      c.fillRect(ax + aw * 0.2, HZ - H * 0.055, aw * 0.6, H * 0.055);
    }
  }

  /* ---------------- centre: the gatehouse tower ---------------- */
  const tW = W * 0.215, tX = W / 2 - tW / 2, tTop = HZ - H * 0.585;
  c.fillStyle = stoneD; c.fillRect(tX, tTop, tW, HZ - tTop);
  c.fillStyle = 'rgba(255,255,255,0.045)'; c.fillRect(tX, tTop, tW * 0.34, HZ - tTop);
  // octagonal corner turrets
  for (const s of [0, 1]) {
    const bx = s ? tX + tW - W * 0.021 : tX;
    c.fillStyle = stoneM; c.fillRect(bx, tTop - H * 0.045, W * 0.021, HZ - tTop + H * 0.045);
    crenellate(bx, tTop - H * 0.045, W * 0.021, W * 0.0068);
    pinnacle(bx + W * 0.0105, tTop - H * 0.062, H * 0.055, W * 0.013);
  }
  crenellate(tX + W * 0.021, tTop, tW - W * 0.042, W * 0.0105);
  // oriel window over the gate
  const orW = tW * 0.40, orX = tX + tW / 2 - orW / 2;
  c.fillStyle = stoneM; c.fillRect(orX - W * 0.006, HZ - H * 0.315, orW + W * 0.012, H * 0.115);
  for (let i = 0; i < 3; i++) {
    lancet(orX + orW * (0.06 + i * 0.32), HZ - H * 0.305, orW * 0.24, H * 0.095, true, false);
  }
  // clock roundel
  c.beginPath(); c.arc(tX + tW / 2, tTop + H * 0.075, tW * 0.115, 0, TAU);
  c.fillStyle = '#1d2029'; c.fill();
  c.strokeStyle = warm; c.lineWidth = W * 0.0035; c.globalAlpha = 0.75; c.stroke(); c.globalAlpha = 1;
  c.strokeStyle = warm; c.lineWidth = W * 0.0026; c.globalAlpha = 0.85;
  c.beginPath(); c.moveTo(tX + tW / 2, tTop + H * 0.075);
  c.lineTo(tX + tW / 2 + tW * 0.055, tTop + H * 0.055); c.stroke();
  c.beginPath(); c.moveTo(tX + tW / 2, tTop + H * 0.075);
  c.lineTo(tX + tW / 2 - tW * 0.022, tTop + H * 0.100); c.stroke();
  c.globalAlpha = 1;
  // the gate arch itself, warm light spilling through
  const gW = tW * 0.34, gX = tX + tW / 2 - gW / 2, gY = HZ - H * 0.165;
  const gg = c.createLinearGradient(0, gY, 0, HZ);
  gg.addColorStop(0, '#3a2a1e'); gg.addColorStop(1, '#ffcf87');
  c.beginPath();
  c.moveTo(gX, HZ); c.lineTo(gX, gY + gW * 0.5);
  c.quadraticCurveTo(gX, gY, gX + gW / 2, gY);
  c.quadraticCurveTo(gX + gW, gY, gX + gW, gY + gW * 0.5);
  c.lineTo(gX + gW, HZ); c.closePath();
  c.fillStyle = gg; c.fill();
  c.strokeStyle = stoneM; c.lineWidth = W * 0.005; c.stroke();

  /* ---------------- lawn and path ---------------- */
  const lawn = c.createLinearGradient(0, HZ, 0, H);
  lawn.addColorStop(0, '#2c3a2a'); lawn.addColorStop(1, '#141c18');
  c.fillStyle = lawn; c.fillRect(0, HZ, W, H - HZ);
  c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(0, HZ, W, 2);
  // gravel path running to the gate
  c.beginPath();
  c.moveTo(W / 2 - W * 0.035, HZ); c.lineTo(W / 2 + W * 0.035, HZ);
  c.lineTo(W * 0.72, H); c.lineTo(W * 0.28, H); c.closePath();
  const path = c.createLinearGradient(0, HZ, 0, H);
  path.addColorStop(0, '#5a5346'); path.addColorStop(1, '#2b2823');
  c.fillStyle = path; c.fill();
  // warm pool of gatelight on the gravel
  const pool = c.createRadialGradient(W / 2, HZ + H * 0.01, 0, W / 2, HZ + H * 0.01, W * 0.20);
  pool.addColorStop(0, 'rgba(255,190,120,0.30)'); pool.addColorStop(1, 'rgba(255,190,120,0)');
  c.fillStyle = pool; c.fillRect(W * 0.28, HZ - H * 0.03, W * 0.44, H - HZ);

  /* ---------------- lamp posts ---------------- */
  for (const lx of [W * 0.335, W * 0.665]) {
    c.strokeStyle = '#1a1c22'; c.lineWidth = W * 0.0035;
    c.beginPath(); c.moveTo(lx, HZ + H * 0.055); c.lineTo(lx, HZ - H * 0.10); c.stroke();
    c.fillStyle = warm; c.globalAlpha = 0.95;
    c.beginPath(); c.arc(lx, HZ - H * 0.105, W * 0.006, 0, TAU); c.fill();
    c.globalAlpha = 1;
    const lg = c.createRadialGradient(lx, HZ - H * 0.105, 0, lx, HZ - H * 0.105, W * 0.055);
    lg.addColorStop(0, 'rgba(255,200,130,0.34)'); lg.addColorStop(1, 'rgba(255,200,130,0)');
    c.fillStyle = lg; c.fillRect(lx - W * 0.06, HZ - H * 0.17, W * 0.12, H * 0.16);
  }

  /* ---------------- plane trees, in silhouette ---------------- */
  const tree = (x, base, h, spread) => {
    c.strokeStyle = '#14181a'; c.lineCap = 'round';
    c.lineWidth = h * 0.055;
    c.beginPath(); c.moveTo(x, base); c.lineTo(x, base - h * 0.42); c.stroke();
    const branch = (bx, by, len, ang, depth) => {
      if (depth === 0) return;
      const ex = bx + Math.cos(ang) * len, ey = by - Math.abs(Math.sin(ang)) * len;
      c.lineWidth = Math.max(1, len * 0.10);
      c.beginPath(); c.moveTo(bx, by); c.lineTo(ex, ey); c.stroke();
      branch(ex, ey, len * 0.68, ang - 0.42 - rnd() * 0.3, depth - 1);
      branch(ex, ey, len * 0.68, ang + 0.42 + rnd() * 0.3, depth - 1);
    };
    branch(x, base - h * 0.42, h * 0.30, Math.PI / 2 - 0.5, 4);
    branch(x, base - h * 0.42, h * 0.30, Math.PI / 2 + 0.5, 4);
    // canopy
    c.fillStyle = 'rgba(14,20,18,0.92)';
    for (let i = 0; i < 26; i++) {
      const a = rnd() * TAU, r = rnd();
      const px = x + Math.cos(a) * spread * r, py = base - h * 0.72 + Math.sin(a) * spread * 0.62 * r;
      c.beginPath(); c.arc(px, py, spread * (0.16 + rnd() * 0.16), 0, TAU); c.fill();
    }
  };
  tree(W * 0.115, HZ + H * 0.035, H * 0.44, W * 0.085);
  tree(W * 0.885, HZ + H * 0.045, H * 0.40, W * 0.078);

  /* ---------------- atmosphere ---------------- */
  const haze = c.createLinearGradient(0, HZ - H * 0.16, 0, HZ + H * 0.05);
  haze.addColorStop(0, 'rgba(226,166,116,0)');
  haze.addColorStop(0.6, 'rgba(226,166,116,0.13)');
  haze.addColorStop(1, 'rgba(226,166,116,0)');
  c.fillStyle = haze; c.fillRect(0, HZ - H * 0.16, W, H * 0.21);

  // vignette + a deep scrim so the title copy always reads over it
  const vg = c.createRadialGradient(W / 2, H * 0.44, H * 0.22, W / 2, H * 0.46, H * 0.95);
  vg.addColorStop(0, 'rgba(4,6,12,0)'); vg.addColorStop(1, 'rgba(4,6,12,0.88)');
  c.fillStyle = vg; c.fillRect(0, 0, W, H);
  const scrim = c.createLinearGradient(0, 0, 0, H);
  scrim.addColorStop(0.00, 'rgba(4,6,12,0.62)');
  scrim.addColorStop(0.42, 'rgba(4,6,12,0.30)');
  scrim.addColorStop(1.00, 'rgba(4,6,12,0.90)');
  c.fillStyle = scrim; c.fillRect(0, 0, W, H);

  return cv.toDataURL('image/jpeg', 0.86);
}

function installCampusBackdrop() {
  const el = document.getElementById('title-bg');
  if (!el) return;
  const W = 1600, H = 1000;
  el.style.backgroundImage = `url(${drawCampus(W, H)})`;
}
