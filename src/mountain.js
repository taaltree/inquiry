/* ============================================================
   mountain.js — LEVEL 2: THE SUMMIT
   A residential conference at altitude. Everyone gets between
   sessions on a snowboard, so the whole level is one long descent.

   The terrain is a deterministic heightfield: a broad valley
   falling away from the lodge, with a groomed piste down the
   middle and rougher off-piste either side.
   ============================================================ */

const MTN = {
  W: 300,          // valley half-width (x from -W to +W)
  LEN: 1500,       // run length (z from 0 at the top to -LEN at the base)
  DROP: 340,       // total vertical
  GRID_X: 128,     // mesh resolution
  GRID_Z: 320,
};

/* ---------- the heightfield ---------- */
function mtnHeight(x, z) {
  const t = clamp(-z / MTN.LEN, 0, 1);                 // 0 at the top, 1 at the base
  // main fall line: steep at the top, easing out into the valley floor
  let h = MTN.DROP * (1 - Math.pow(t, 0.78)) - MTN.DROP * 0.06;
  // the valley cross-section — a shallow U, so you naturally return to the piste
  const u = x / MTN.W;
  h += u * u * 118;
  // long rolling terrain
  h += Math.sin(z * 0.0090 + 1.7) * 11.5 * (0.35 + t);
  h += Math.cos(x * 0.0130 + z * 0.0042) * 7.5;
  h += Math.sin(x * 0.0225 - z * 0.0098) * 3.4;
  // moguls, but only away from the groomed centre
  const off = clamp((Math.abs(x) - 26) / 40, 0, 1);
  h += off * (Math.sin(x * 0.098) * Math.sin(z * 0.086) * 2.6);
  h += off * (Math.sin(x * 0.052 + 2.0) * Math.cos(z * 0.061) * 3.4);
  // a couple of rollers you can actually catch air off
  h += Math.exp(-((z + 380) ** 2) / 5200) * 15 * (1 - Math.min(1, Math.abs(x) / 90));
  h += Math.exp(-((z + 880) ** 2) / 6400) * 17 * (1 - Math.min(1, Math.abs(x) / 90));
  return h;
}

/* downhill slope at a point, used for both physics and mesh normals */
function mtnSlope(x, z) {
  const e = 1.6;
  return {
    dx: (mtnHeight(x + e, z) - mtnHeight(x - e, z)) / (2 * e),
    dz: (mtnHeight(x, z + e) - mtnHeight(x, z - e)) / (2 * e),
  };
}

const onPiste = (x) => Math.abs(x) < 30;

/* ============================================================ */

function buildMountain(gl, roster) {
  const b = new Builder();          // static: snow, rock, trees, lodge
  const spinners = [];
  const lights = [];
  const stations = [];
  const rnd = mulberry(90210);

  const SNOW = hex2rgb('#c9d8ea');
  const SNOW_LIT = hex2rgb('#e8f1ff');
  const PISTE = hex2rgb('#dce8f7');
  const ROCK = hex2rgb('#4a4a55');
  const ROCK_D = hex2rgb('#2e2e38');
  const PINE = hex2rgb('#16301f');
  const PINE_L = hex2rgb('#1f4029');
  const WOOD = hex2rgb('#4a3428');
  const WOOD_L = hex2rgb('#6b4c38');

  /* ---------- terrain mesh ---------- */
  {
    const nx = MTN.GRID_X, nz = MTN.GRID_Z;
    const pos = [], nrm = [], col = [], glow = [], idx = [];
    for (let j = 0; j <= nz; j++) {
      const z = -(j / nz) * MTN.LEN;
      for (let i = 0; i <= nx; i++) {
        const x = (i / nx - 0.5) * 2 * MTN.W;
        const h = mtnHeight(x, z);
        pos.push(x, h, z);
        const s = mtnSlope(x, z);
        const L = Math.hypot(-s.dx, 1, -s.dz);
        nrm.push(-s.dx / L, 1 / L, -s.dz / L);
        // groomed corduroy down the middle, wind-scoured snow outside it
        const steep = Math.min(1, Math.hypot(s.dx, s.dz) * 1.5);
        let c = onPiste(x) ? PISTE : SNOW;
        if (steep > 0.62) c = mixc(c, ROCK, Math.min(0.85, (steep - 0.62) * 2.6));
        if (onPiste(x)) c = mixc(c, SNOW_LIT, 0.35);
        col.push(c[0], c[1], c[2]);
        glow.push(0.015);
      }
    }
    const w = nx + 1;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * w + i;
      idx.push(a, a + w, a + 1, a + 1, a + w, a + w + 1);
    }
    const verts = [];
    for (let v = 0; v < pos.length / 3; v++) {
      verts.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2],
                 nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2],
                 col[v * 3], col[v * 3 + 1], col[v * 3 + 2], glow[v],
                 0.88, 0.0);                       // snow: rough, dielectric
    }
    // the terrain is its own mesh so it can use a 32-bit index buffer
    var terrainMesh = uploadMesh(gl, new Float32Array(verts), new Uint32Array(idx));
  }

  /* ---------- surrounding peaks, as silhouettes beyond the run ---------- */
  for (let i = 0; i < 26; i++) {
    const a = rnd() * TAU;
    const r = MTN.W * 1.9 + rnd() * MTN.W * 2.6;
    const px = Math.cos(a) * r;
    const pz = -MTN.LEN * 0.5 + Math.sin(a) * r * 1.2;
    const hgt = 150 + rnd() * 320;
    const wid = 130 + rnd() * 260;
    b.add(pCyl(5, true, true, 0.04, 0.5), xform([px, mtnHeight(0, pz) + hgt * 0.28, pz],
      [0, rnd() * TAU, 0], [wid, hgt, wid]), mixc(ROCK_D, ROCK, rnd() * 0.6), 0);
    b.add(pCyl(5, true, true, 0.04, 0.30), xform([px, mtnHeight(0, pz) + hgt * 0.70, pz],
      [0, rnd() * TAU, 0], [wid * 0.62, hgt * 0.5, wid * 0.62]), SNOW, 0.05);
  }

  /* ---------- conifers, thickening off-piste ---------- */
  const tree = (x, z, s) => {
    const y = mtnHeight(x, z);
    b.add(pCyl(6), xform([x, y + 0.9 * s, z], [0, 0, 0], [0.42 * s, 1.9 * s, 0.42 * s]), WOOD, 0);
    for (let k = 0; k < 4; k++) {
      const f = 1 - k * 0.20;
      b.add(pCyl(8, true, true, 0.03, 0.5), xform([x, y + (1.9 + k * 1.55) * s, z], [0, k * 0.5, 0],
        [4.4 * f * s, 2.9 * f * s, 4.4 * f * s]), k % 2 ? PINE : PINE_L, 0.02);
    }
    // snow load on the top tier
    b.add(pCyl(8, true, true, 0.03, 0.36), xform([x, y + 6.6 * s, z], [0, 0, 0],
      [2.5 * s, 1.5 * s, 2.5 * s]), SNOW_LIT, 0.10);
  };
  for (let i = 0; i < 620; i++) {
    const z = -rnd() * MTN.LEN;
    let x = (rnd() - 0.5) * 2 * MTN.W;
    if (Math.abs(x) < 34) x += Math.sign(x || 1) * 34;      // keep the piste clear
    if (Math.abs(x) > MTN.W * 0.96) continue;
    tree(x, z, 0.75 + rnd() * 0.8);
  }

  /* ---------- piste markers: orange wands down both edges ---------- */
  for (let j = 0; j < 74; j++) {
    const z = -8 - (j / 74) * (MTN.LEN - 40);
    for (const s of [-1, 1]) {
      const x = s * 30;
      const y = mtnHeight(x, z);
      b.add(pCyl(5), xform([x, y + 1.5, z], [0, 0, 0], [0.13, 3.0, 0.13]), hex2rgb('#2a2f3b'), 0);
      b.add(BOX, xform([x, y + 2.7, z], [0, 0, 0], [0.42, 0.55, 0.06]),
        j % 2 ? hex2rgb('#ff7a2f') : hex2rgb('#ffd23f'), 1.05);
    }
  }

  /* ---------- rock outcrops ---------- */
  for (let i = 0; i < 90; i++) {
    const z = -rnd() * MTN.LEN;
    let x = (rnd() - 0.5) * 2 * MTN.W;
    if (Math.abs(x) < 40) continue;
    const y = mtnHeight(x, z);
    const s = 2 + rnd() * 6;
    b.add(pPrism(6), xform([x, y + s * 0.28, z], [rnd() * 0.3, rnd() * TAU, rnd() * 0.3],
      [s, s * 0.75, s * 0.9]), mixc(ROCK, ROCK_D, rnd()), 0);
  }

  /* ---------- the lodge at the top ---------- */
  {
    const lz = 26, ly = mtnHeight(0, lz);
    b.add(BOX, xform([0, ly + 4.0, lz], [0, 0, 0], [30, 8, 15]), WOOD, 0.03);
    b.add(BOX, xform([0, ly + 8.6, lz], [0, 0, 0], [33, 1.2, 17]), WOOD_L, 0.05);
    // gabled roof
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      b.add(BOX, xform([s * 8, ly + 11.2, lz], [0, 0, s * 0.62], [18, 1.0, 17.5]), SNOW_LIT, 0.12);
    }
    for (let i = 0; i < 7; i++) {
      const wx = -12 + i * 4;
      b.add(BOX, xform([wx, ly + 4.4, lz - 7.6], [0, 0, 0], [2.4, 3.0, 0.3]), hex2rgb('#ffcf87'), 1.5);
    }
    lights.push({ pos: [0, ly + 7, lz - 9], col: hex2rgb('#ffcf87'), range: 60, intensity: 1.3 });
    // banner
    b.add(BOX, xform([0, ly + 10.2, lz - 8.2], [0, 0, 0], [22, 2.0, 0.25]), hex2rgb('#12212f'), 0.05);
  }

  /* ---------- chairlift running up the left flank ---------- */
  {
    const lx = -MTN.W * 0.62;
    let prev = null;
    for (let j = 0; j <= 22; j++) {
      const z = -(j / 22) * MTN.LEN * 0.92;
      const y = mtnHeight(lx, z) + 14;
      b.add(pCyl(6), xform([lx, (y + mtnHeight(lx, z)) / 2, z], [0, 0, 0],
        [1.0, y - mtnHeight(lx, z), 1.0]), ROCK_D, 0);
      b.add(BOX, xform([lx, y, z], [0, 0, 0], [5.0, 0.5, 0.5]), ROCK, 0.05);
      if (prev) { strut(b, prev, [lx, y + 0.2, z], 0.14, hex2rgb('#7a828f'), 0.15); }
      prev = [lx, y + 0.2, z];
      if (j % 3 === 0) {
        b.add(BOX, xform([lx, y - 2.2, z], [0, 0, 0], [1.8, 1.8, 1.6]), hex2rgb('#c4302b'), 0.35);
        b.add(BOX, xform([lx, y - 1.0, z], [0, 0, 0], [0.12, 1.6, 0.12]), hex2rgb('#7a828f'), 0.2);
      }
    }
  }

  /* ---------- session stations: one per professor, down the fall line ---------- */
  const people = roster.filter((p) => p.district === 'summit');
  people.forEach((p, i) => {
    const t = (i + 1) / (people.length + 1);
    const z = -t * MTN.LEN * 0.94;
    const x = (i % 2 === 0 ? -1 : 1) * (13 + (i % 3) * 5);
    const y = mtnHeight(x, z);

    // a flattened platform so the marquee doesn't float
    b.add(pCyl(20), xform([x, y + 0.25, z], [0, 0, 0], [16, 0.9, 16]), hex2rgb('#e6eefb'), 0.10);
    ringFlat(b, x, z, 7.6, 7.0, y + 0.75, hex2rgb('#7fd4ff'), 0.75, 36);

    // an A-frame session marquee
    for (const s of [-1, 1]) {
      b.add(BOX, xform([x + s * 4.4, y + 3.2, z], [0, 0, s * 0.42], [0.5, 8.2, 0.5]), WOOD_L, 0.05);
    }
    b.add(BOX, xform([x, y + 6.4, z], [0, 0, 0], [10.5, 0.45, 0.45]), WOOD_L, 0.08);
    b.add(BOX, xform([x, y + 5.0, z - 2.3], [0.5, 0, 0], [10.0, 5.4, 0.2]), hex2rgb('#16283c'), 0.10);
    b.add(BOX, xform([x, y + 6.7, z], [0, 0, 0], [10.8, 0.30, 0.30]), hex2rgb('#7fd4ff'), 1.15);
    for (const s of [-1, 1]) {
      b.add(pPrism(6), xform([x + s * 6.6, y + 1.2, z + 1.5], [0, 0, 0], [1.1, 2.4, 1.1]), hex2rgb('#2a3444'), 0.05);
      b.add(SPHERE_LO, xform([x + s * 6.6, y + 2.6, z + 1.5], [0, 0, 0], [0.6, 0.6, 0.6]), hex2rgb('#ffcf87'), 1.5);
    }
    lights.push({ pos: [x, y + 4.5, z], col: hex2rgb('#9fd8ff'), range: 34, intensity: 1.0 });

    stations.push({ id: p.id, x, y, z, yaw: 0, district: 'summit' });
  });

  /* ---------- the finish: poster session marquee at the base ---------- */
  {
    const fz = -MTN.LEN * 0.965, fy = mtnHeight(0, fz);
    b.add(pCyl(28), xform([0, fy + 0.3, fz], [0, 0, 0], [58, 1.0, 58]), hex2rgb('#e6eefb'), 0.10);
    for (const s of [-1, 1]) {
      b.add(BOX, xform([s * 16, fy + 5.0, fz], [0, 0, 0], [1.0, 10, 1.0]), WOOD_L, 0.06);
    }
    b.add(BOX, xform([0, fy + 10.2, fz], [0, 0, 0], [34, 1.0, 8]), hex2rgb('#3a2233'), 0.06);
    b.add(BOX, xform([0, fy + 9.3, fz - 3.6], [0, 0, 0], [32, 1.6, 0.3]), hex2rgb('#ffb84d'), 1.35);
    // poster boards
    for (let i = 0; i < 8; i++) {
      const px = -14 + i * 4;
      b.add(BOX, xform([px, fy + 2.4, fz - 3.0], [0, (i % 2 ? 0.2 : -0.2), 0], [3.2, 4.2, 0.2]),
        hex2rgb('#f2f6ff'), 0.35);
      b.add(BOX, xform([px, fy + 3.4, fz - 2.9], [0, (i % 2 ? 0.2 : -0.2), 0], [2.6, 0.5, 0.05]),
        hex2rgb('#7fd4ff'), 0.9);
    }
    lights.push({ pos: [0, fy + 7, fz], col: hex2rgb('#ffb84d'), range: 80, intensity: 1.5 });
    var finish = { x: 0, y: fy, z: fz };
  }

  // one note beside each session marquee, off the piste centre so a rider has to steer for it
  const spots = stations.map((s, i) => ({ district: 'summit', kind: 'session', x: s.x + (i % 2 ? -6 : 6), y: mtnHeight(s.x + (i % 2 ? -6 : 6), s.z) + 1.3, z: s.z }));
  return { spots,
    mesh: b.upload(gl),
    terrain: terrainMesh,
    spinners, lights, stations,
    finish,
    vaults: [],
    districts: [],
  };
}

/* ---------- snowboard physics ----------
   Arcade, not simulation: gravity pulls you down the fall line, steering is
   direct, and carving across the slope scrubs speed. Forgiving on purpose. */
function rideStep(P, input, dt) {
  const s = mtnSlope(P.x, P.z);
  const grade = Math.hypot(s.dx, s.dz);

  // steer
  const turn = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  P.yaw += turn * (2.05 - Math.min(1.0, P.speed / 44) * 0.85) * dt;
  P.lean += (turn * -0.44 - P.lean) * (1 - Math.exp(-7 * dt));

  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);

  if (P.air) {
    P.vy -= 30 * dt;
  } else {
    // component of gravity along the heading; carving across the slope brakes
    const along = -(fx * s.dx + fz * s.dz);
    P.speed += (along * 44 - 0.30 * grade * 20) * dt;
    if (input.brake) P.speed -= 26 * dt;
    if (input.tuck) P.speed += 9 * dt;
    P.speed -= P.speed * 0.075 * dt;                  // drag
    P.speed -= Math.abs(turn) * P.speed * 0.16 * dt;  // carve scrub
    P.speed = clamp(P.speed, 0, 40);
    if (input.jump && P.jumpCd <= 0) {
      P.air = true; P.vy = 11.0; P.jumpCd = 0.5;
      P.tricks = (P.tricks || 0);
    }
  }
  P.jumpCd = Math.max(0, P.jumpCd - dt);

  P.x += fx * P.speed * dt;
  P.z += fz * P.speed * dt;

  const ground = mtnHeight(P.x, P.z);
  if (P.air) {
    P.y += P.vy * dt;
    if (P.y <= ground) { P.y = ground; P.air = false; P.vy = 0; P.landT = 0.32; }
  } else {
    // hug the surface, with a little suspension so rollers feel smooth
    P.y += (ground - P.y) * (1 - Math.exp(-16 * dt));
    if (ground - P.y < -1.4) { P.air = true; P.vy = 0; }   // launched off a roller
  }
  P.landT = Math.max(0, (P.landT || 0) - dt);

  // stay inside the valley
  const lim = MTN.W * 0.95;
  if (Math.abs(P.x) > lim) { P.x = Math.sign(P.x) * lim; P.speed *= 0.92; }
  if (P.z > 12) { P.z = 12; P.speed *= 0.5; }
  // the run-out: you coast to a stop in the finish area rather than off the map
  const base = -MTN.LEN * 0.978;
  if (P.z < base) { P.z = base; P.speed *= 0.86; }

  return P;
}
