/* ============================================================
   life.js — everything that moves and isn't the player:
     · student NPCs wandering the station
     · Feed Drones firing manipulative claims
     · insight / misinformation projectiles

   Design note: the five question types are the ammunition. A drone is
   destroyed only by the one question type that structurally dismantles its
   technique, so combat is a knowledge check, never a reflex check.
   ============================================================ */

const STUDENT_COUNT = 22;
const SUMMIT_STUDENTS = 14;
const DRONE_MAX = 4;

/* Education is the win condition, so it has to be legible at a glance.
   Each tier adds an unmistakable silhouette cue and more agency in a fight. */
const TIERS = [
  { at: 0, name: 'Unaware',  aura: 0.00, fire: 0,    chip: 0    },
  { at: 1, name: 'Curious',  aura: 0.35, fire: 0,    chip: 0    },
  { at: 2, name: 'Informed', aura: 0.70, fire: 5.5,  chip: 0.14 },
  { at: 4, name: 'Graduate', aura: 1.00, fire: 3.0,  chip: 0.30 },
];
const tierOf = (taught) => (taught >= 4 ? 3 : taught >= 2 ? 2 : taught >= 1 ? 1 : 0);
const DRONES_PER_DISTRICT = 3;
const SUMMIT_DRONES = 5;

/* ---------- meshes ---------- */

function buildStudentMesh(gl, seed) {
  const rnd = mulberry(seed);
  const b = new Builder();
  const H = 1.60 + rnd() * 0.22;
  const sw = 0.150 + rnd() * 0.055;
  const hipY = H * 0.50, chestY = H * 0.74, neckY = H * 0.855, headY = H * 0.925;

  // muted, matte palette so students never compete with the glowing scientists
  const coats = ['#3d4a63', '#4a3f5c', '#33505a', '#57453c', '#414f42', '#5a4550', '#3a4356'];
  const legsC = ['#2b3040', '#333a46', '#2f3542'];
  const skinI = ['#7d5a48', '#a5795c', '#c99a76', '#5f4235', '#8c6b52', '#d3ab8a'];
  const coat = hex2rgb(coats[(rnd() * coats.length) | 0]);
  const legC = hex2rgb(legsC[(rnd() * legsC.length) | 0]);
  const skin = hex2rgb(skinI[(rnd() * skinI.length) | 0]);
  const hairC = mixc(hex2rgb('#1a1512'), hex2rgb('#6b5744'), rnd());

  for (const s of [-1, 1]) {
    b.add(pCapsule(0.068, 8, 3), xform([s * 0.084, hipY * 0.52, 0], [0, 0, 0], [1, hipY * 1.05, 1]), legC, 0.02);
    b.add(BOX, xform([s * 0.084, 0.030, 0.038], [0, 0, 0], [0.112, 0.058, 0.225]), scalec(legC, 0.7), 0.02);
  }
  b.add(pCyl(12, true, true, sw, sw * 0.72), xform([0, (hipY + chestY) / 2, 0], [0, 0, 0],
    [1, chestY - hipY + 0.10, 0.62]), coat, 0.02);
  b.add(pCapsule(0.050, 8, 3), xform([0, neckY - 0.03, 0], [0, 0, 0], [1, 0.16, 1]), skin, 0.02);

  // backpack — the one silhouette cue that reads instantly as "student"
  if (rnd() > 0.25) {
    const bag = mixc(coat, hex2rgb('#20242e'), 0.55);
    b.add(BOX, xform([0, chestY - 0.24, -0.145], [0, 0, 0], [0.27, 0.36, 0.14]), bag, 0.02);
    b.add(BOX, xform([0, chestY - 0.06, -0.150], [0, 0, 0], [0.19, 0.07, 0.13]), scalec(bag, 1.4), 0.03);
  }
  for (const s of [-1, 1]) {
    b.add(pCapsule(0.052, 8, 3), xform([s * (sw + 0.045), chestY - 0.19, 0.01], [0, 0, s * 0.12],
      [1, 0.42, 1]), coat, 0.02);
    b.add(pCapsule(0.045, 8, 3), xform([s * (sw + 0.095), chestY - 0.53, 0.05], [0.18, 0, s * 0.05],
      [1, 0.34, 1]), skin, 0.02);
  }
  b.add(SPHERE_LO, xform([0, headY, 0], [0, 0, 0], [0.205, 0.245, 0.215]), skin, 0.02);
  const hairStyle = rnd();
  if (hairStyle < 0.3) {
    b.add(SPHERE_LO, xform([0, headY + 0.030, -0.008], [0, 0, 0], [0.222, 0.200, 0.228]), hairC, 0.02);
  } else if (hairStyle < 0.6) {
    b.add(pCyl(10, true, true, 0.126, 0.140), xform([0, headY - 0.050, -0.010], [0, 0, 0], [1, 0.30, 0.92]), hairC, 0.02);
    b.add(SPHERE_LO, xform([0, headY + 0.040, -0.010], [0, 0, 0], [0.228, 0.198, 0.234]), hairC, 0.02);
  } else if (hairStyle < 0.8) {
    b.add(SPHERE_LO, xform([0, headY + 0.046, -0.006], [0, 0, 0], [0.226, 0.190, 0.230]), hairC, 0.02);
    b.add(SPHERE_LO, xform([0, headY + 0.090, -0.120], [0, 0, 0], [0.115, 0.110, 0.115]), hairC, 0.02);
  } else {
    b.add(pCyl(8, true, true, 0.135, 0.128), xform([0, headY + 0.105, -0.005], [0, 0, 0], [1, 0.10, 1]), hairC, 0.05);
    b.add(SPHERE_LO, xform([0, headY + 0.030, -0.008], [0, 0, 0], [0.222, 0.196, 0.228]), hairC, 0.02);
  }
  return b.upload(gl);
}

/* Worn marks of education, drawn over the base student mesh. */
function buildStudentMarks(gl) {
  const gown = hex2rgb('#1d2a44');
  const trim = hex2rgb('#ffd98a');
  const paper = hex2rgb('#dfe9ff');

  const book = new Builder();
  book.add(BOX, xform([0, 0, 0], [0.2, 0, 0.35], [0.19, 0.045, 0.26]), paper, 0.42);
  book.add(BOX, xform([0, 0.03, 0], [0.2, 0, 0.35], [0.20, 0.02, 0.27]), hex2rgb('#7fd4ff'), 0.85);

  // Everything worn has to read at 30 m in a dark scene, so the marks are emissive.
  const crimson = hex2rgb('#ff5d72');
  const scarf = new Builder();
  scarf.add(pTorus(0.13, 18, 6), xform([0, 0, 0], [0.12, 0, 0], [0.42, 0.42, 0.36]), crimson, 0.52);
  scarf.add(BOX, xform([0.12, -0.24, 0.12], [0.1, 0, 0.12], [0.13, 0.50, 0.05]), crimson, 0.48);
  scarf.add(BOX, xform([0.12, -0.40, 0.12], [0.1, 0, 0.12], [0.135, 0.09, 0.055]), trim, 0.85);
  scarf.add(BOX, xform([-0.12, -0.18, 0.12], [0.1, 0, -0.10], [0.11, 0.34, 0.05]), crimson, 0.48);

  const cap = new Builder();
  cap.add(pCyl(12), xform([0, 0, 0], [0, 0, 0], [0.27, 0.085, 0.27]), hex2rgb('#26334f'), 0.20);
  cap.add(BOX, xform([0, 0.065, 0], [0, 0.35, 0], [0.52, 0.032, 0.52]), hex2rgb('#26334f'), 0.22);
  // glowing gold trim around the board is what makes it legible at range
  for (const [dx, dz, sx, sz] of [[0, 0.245, 0.52, 0.035], [0, -0.245, 0.52, 0.035],
                                  [0.245, 0, 0.035, 0.52], [-0.245, 0, 0.035, 0.52]]) {
    cap.add(BOX, xform([dx, 0.075, dz], [0, 0.35, 0], [sx, 0.030, sz]), trim, 0.80);
  }
  cap.add(SPHERE_LO, xform([0, 0.10, 0], [0, 0, 0], [0.070, 0.070, 0.070]), trim, 1.05);
  for (let i = 0; i < 6; i++) {
    cap.add(BOX, xform([0.19 + i * 0.014, 0.062 - i * 0.034, 0.19 + i * 0.014], [0, 0.78, 0.25],
      [0.026, 0.052, 0.026]), trim, 0.75);
  }

  const gownM = new Builder();
  for (const s of [-1, 1]) {
    gownM.add(BOX, xform([s * 0.235, 0, -0.03], [0, 0, s * 0.14], [0.10, 0.56, 0.20]), gown, 0.06);
    gownM.add(BOX, xform([s * 0.155, 0, 0.115], [0, 0, s * 0.14], [0.026, 0.54, 0.040]), trim, 0.70);
  }
  gownM.add(pTorus(0.10, 18, 6), xform([0, 0.22, 0], [0.1, 0, 0], [0.46, 0.46, 0.36]), gown, 0.12);
  gownM.add(pTorus(0.04, 20, 6), xform([0, 0.235, 0], [0.1, 0, 0], [0.48, 0.48, 0.38]), trim, 0.68);

  const aura = new Builder();
  aura.add(pRing(0.74, 40), xform([0, 0, 0], [0, 0, 0], [1.7, 1, 1.7]), [1, 1, 1], 1.5);

  const halo = new Builder();
  halo.add(pTorus(0.045, 28, 6), xform([0, 0, 0], [0, 0, 0], [0.60, 0.60, 0.60]), [1, 1, 1], 1.5);

  return {
    book: book.upload(gl), scarf: scarf.upload(gl), cap: cap.upload(gl),
    gown: gownM.upload(gl), aura: aura.upload(gl), halo: halo.upload(gl),
  };
}

function buildSnowboard(gl) {
  const b = new Builder();
  const deck = hex2rgb('#1d2a44'), edge = hex2rgb('#8fd0ff'), base = hex2rgb('#2b3a56');
  b.add(pCyl(4, true, true, 0.5, 0.42), xform([0, 0.055, 0], [0, Math.PI / 4, 0], [0.34, 0.07, 1.62]), deck, 0.06);
  b.add(BOX, xform([0, 0.020, 0], [0, 0, 0], [0.30, 0.035, 1.50]), base, 0.10);
  b.add(BOX, xform([0, 0.058, 0.74], [0.34, 0, 0], [0.26, 0.05, 0.24]), deck, 0.06);
  b.add(BOX, xform([0, 0.058, -0.74], [-0.34, 0, 0], [0.26, 0.05, 0.24]), deck, 0.06);
  b.add(BOX, xform([0, 0.088, 0], [0, 0, 0], [0.055, 0.02, 1.30]), edge, 0.85);
  for (const s of [-1, 1]) {
    b.add(BOX, xform([s * 0.10, 0.13, s * 0.16], [0, s * 0.35, 0], [0.20, 0.10, 0.28]), hex2rgb('#3a2f28'), 0.05);
  }
  return b.upload(gl);
}

/* the "learned it" mote that pops over a taught student */
function buildSpark(gl) {
  const b = new Builder();
  b.add(pPrism(4, 0.02), xform([0, 0.13, 0], [0, 0, 0], [0.34, 0.26, 0.34]), [1, 1, 1], 2.4);
  b.add(pPrism(4, 0.02), xform([0, -0.13, 0], [Math.PI, 0, 0], [0.34, 0.26, 0.34]), [1, 1, 1], 2.4);
  return b.upload(gl);
}

/* Feed Drone: a hovering slab with a too-bright screen and restless shards */
function buildDroneMesh(gl) {
  const b = new Builder();
  const shell = hex2rgb('#1a1620');
  const edge = hex2rgb('#4a3350');
  b.add(BOX, xform([0, 0, 0], [0, 0, 0], [1.85, 2.35, 0.42]), shell, 0.02);
  b.add(BOX, xform([0, 0, -0.24], [0, 0, 0], [1.62, 2.06, 0.05]), hex2rgb('#ff3fa8'), 1.05);
  // scrolling "post" bars — the screen always has something to say
  for (let i = 0; i < 5; i++) {
    b.add(BOX, xform([-0.10 + (i % 2) * 0.12, 0.74 - i * 0.36, -0.28], [0, 0, 0],
      [1.05 - (i % 3) * 0.24, 0.11, 0.04]), hex2rgb('#ffe8f6'), 1.7);
  }
  for (const s of [-1, 1]) {
    b.add(BOX, xform([s * 1.00, 0, 0], [0, 0, 0], [0.18, 2.4, 0.48]), edge, 0.1);
    b.add(pPrism(3), xform([s * 1.38, 0.88, 0], [0, 0, s * 0.5], [0.46, 0.46, 0.46]), hex2rgb('#a13aff'), 1.25);
    b.add(pPrism(3), xform([s * 1.30, -0.92, 0], [0, 0, -s * 0.4], [0.34, 0.34, 0.34]), hex2rgb('#a13aff'), 1.1);
  }
  b.add(BOX, xform([0, 1.34, 0], [0, 0, 0], [2.00, 0.18, 0.56]), edge, 0.12);
  b.add(BOX, xform([0, -1.34, 0], [0, 0, 0], [2.00, 0.18, 0.56]), edge, 0.12);
  b.add(pTorus(0.05, 26, 6), xform([0, 0, 0.26], [0, 0, 0], [2.5, 2.5, 2.5]), hex2rgb('#ff3fa8'), 1.15);
  return b.upload(gl);
}

function buildBoltMesh(gl, colour, glow) {
  const b = new Builder();
  b.add(pCyl(8, true, true, 0.10, 0.02), xform([0, 0, 0], [Math.PI / 2, 0, 0], [1, 0.9, 1]), colour, glow);
  b.add(SPHERE_LO, xform([0, 0, 0.16], [0, 0, 0], [0.20, 0.20, 0.20]), [1, 1, 1], glow + 0.6);
  b.add(pTorus(0.18, 14, 6), xform([0, 0, 0.02], [Math.PI / 2, 0, 0], [0.42, 0.42, 0.42]), colour, glow);
  return b.upload(gl);
}

/* ============================================================ */

class Life {
  constructor(gl, game, mode) {
    this.game = game;
    this.gl = gl;
    this.mode = mode || 'walk';         // 'walk' = station, 'ride' = mountain
    this.rnd = mulberry(mode === 'ride' ? 5150 : 4242);

    this.studentMeshes = [];
    for (let i = 0; i < 8; i++) this.studentMeshes.push(buildStudentMesh(gl, 900 + i * 137));
    this.sparkMesh = buildSpark(gl);
    this.marks = buildStudentMarks(gl);
    this.boardMesh = buildSnowboard(gl);
    this.droneMesh = buildDroneMesh(gl);
    this.insightBolt = buildBoltMesh(gl, hex2rgb('#8ff0ff'), 2.2);
    this.misinfoBolt = buildBoltMesh(gl, hex2rgb('#ff45a6'), 2.0);
    this.studentBolt = buildBoltMesh(gl, hex2rgb('#9fe8c0'), 1.6);

    // Every student has a home district so "educate this district" is countable.
    // Four per district, the remainder loitering in the atrium.
    this.students = [];
    if (this.mode === 'ride') {
      // grad students strung down the run, each looping their own stretch of it
      for (let i = 0; i < SUMMIT_STUDENTS; i++) this.students.push(this.spawnRider(i));
    } else {
      for (let i = 0; i < STUDENT_COUNT; i++) {
        const home = i < DISTRICTS.length * 4 ? DISTRICTS[i % DISTRICTS.length] : null;
        this.students.push(this.spawnStudent(i, home));
      }
    }

    this.gainPlates = {};        // "+1" / "+2" motes, built lazily
    this.drones = [];
    this.bolts = [];
    this.motes = [];
    this.spawnTimer = 8;
    this.model = M4.create();
  }

  /* ---------- students ---------- */
  spawnStudent(i, home) {
    const p = home ? this.randomPoint(home.cx, home.cz, 24) : this.randomPoint();
    return {
      id: i, home: home ? home.id : null,
      hx: home ? home.cx : 0, hz: home ? home.cz : 0, roam: home ? 26 : 20,
      x: p.x, z: p.z, yaw: this.rnd() * TAU,
      tx: p.x, tz: p.z,
      mesh: this.studentMeshes[i % this.studentMeshes.length],
      speed: 1.5 + this.rnd() * 1.1,
      state: 'idle', timer: this.rnd() * 4,
      taught: 0, confused: 0, sparkT: 0, sparkCol: [1, 1, 1],
      phase: this.rnd() * TAU, bob: 0, fireCd: 3 + this.rnd() * 5,
      wants: (this.rnd() * 5) | 0,          // the question type that helps them most
      line: '', lineT: 0,
    };
  }

  spawnRider(i) {
    const band = (i + 0.5) / SUMMIT_STUDENTS;
    const z = -band * MTN.LEN * 0.92 - 20;
    const x = (this.rnd() - 0.5) * 46;
    return {
      id: i, home: 'summit', hx: x, hz: z, roam: 0,
      x, z, y: mtnHeight(x, z), yaw: 0,
      mesh: this.studentMeshes[i % this.studentMeshes.length],
      speed: 9 + this.rnd() * 6, drift: this.rnd() * TAU, band,
      state: 'ride', timer: 0,
      taught: 0, confused: 0, sparkT: 0, sparkCol: [1, 1, 1],
      phase: this.rnd() * TAU, bob: 0, fireCd: 3 + this.rnd() * 5,
      wants: (this.rnd() * 5) | 0,
      line: '', lineT: 0,
    };
  }

  tier(s) { return tierOf(s.confused > 0 ? Math.max(0, s.taught - 2) : s.taught); }

  /* how many students in a district have reached Informed or better */
  districtEducated(id) {
    const all = this.students.filter((s) => s.home === id);
    return { done: all.filter((s) => this.tier(s) >= 2).length, total: all.length };
  }

  randomPoint(nearX, nearZ, spread) {
    for (let k = 0; k < 60; k++) {
      let x, z;
      if (nearX != null) {
        const a = this.rnd() * TAU, r = 8 + this.rnd() * (spread || 40);
        x = nearX + Math.cos(a) * r; z = nearZ + Math.sin(a) * r;
      } else {
        const a = this.rnd() * TAU, r = this.rnd() * 145;
        x = Math.cos(a) * r; z = Math.sin(a) * r;
      }
      if (!isWalkable(x, z)) continue;
      let blocked = false;
      for (const c of this.game.colliders) {
        const rr = c.r + 1.0;
        if ((x - c.x) ** 2 + (z - c.z) ** 2 < rr * rr) { blocked = true; break; }
      }
      if (!blocked) return { x, z };
    }
    return { x: 0, z: 18 };
  }

  teach(s, conceptCol, line, matched) {
    const wasConfused = s.confused > 0;
    s.confused = 0;
    s.taught += matched ? 2 : 1;
    if (matched) s.wants = (s.wants + 1 + ((this.rnd() * 4) | 0)) % 5;
    s.sparkT = 1.6;
    s.sparkCol = conceptCol;
    s.state = 'idle';
    s.timer = 1.4;
    s.line = line;
    s.lineT = 3.2;
    return wasConfused;
  }

  /* ---------- drones ---------- */
  /* Which district is the player standing in (or nearest to)? Drones spawn
     against that district's quota, so "clear the feed here" can be finished. */
  currentDistrict() {
    const cam = this.game.cam;
    let best = null, bd = 1e9;
    for (const d of DISTRICTS) {
      const dist = Math.hypot(cam.x - d.cx, cam.z - d.cz);
      if (dist < bd) { bd = dist; best = d; }
    }
    return bd < R_PLATFORM + 34 ? best : null;
  }

  spawnDrone(forceDistrict) {
    if (this.drones.length >= DRONE_MAX) return null;
    const G = this.game;

    if (this.mode === 'ride') {
      if ((G.feedCleared.summit || 0) >= SUMMIT_DRONES) return null;
      const live = this.drones.filter((x) => !x.dead).length;
      if (live + (G.feedCleared.summit || 0) >= SUMMIT_DRONES) return null;
      const px = G.ride.x + (this.rnd() - 0.5) * 60;
      const pz = G.ride.z - 55 - this.rnd() * 70;         // ahead, down the run
      const card = MISINFO[(this.rnd() * MISINFO.length) | 0];
      const drone = {
        x: px, y: mtnHeight(px, pz) + 7 + this.rnd() * 5, z: pz,
        district: 'summit', card, cooldown: 3 + this.rnd() * 3,
        integrity: 1, yaw: 0, phase: this.rnd() * TAU,
        dying: 0, dead: false, scanned: false, born: 0, stagger: 0, hover: true,
      };
      this.drones.push(drone);
      return drone;
    }

    const d = forceDistrict || this.currentDistrict();
    if (!d) return null;
    if ((G.feedCleared[d.id] || 0) >= DRONES_PER_DISTRICT) return null;
    const live = this.drones.filter((x) => x.district === d.id && !x.dead).length;
    if (live + (G.feedCleared[d.id] || 0) >= DRONES_PER_DISTRICT) return null;

    const p = this.randomPoint(d.cx, d.cz, 30);
    const card = MISINFO[(this.rnd() * MISINFO.length) | 0];
    const drone = {
      x: p.x, y: 3.0 + this.rnd() * 1.4, z: p.z,
      district: d.id, card, cooldown: 2.2 + this.rnd() * 2.5,
      integrity: 1, yaw: 0, phase: this.rnd() * TAU,
      dying: 0, dead: false, scanned: false, born: 0, stagger: 0,
    };
    this.drones.push(drone);
    return drone;
  }

  /* a student's contribution: chips integrity, staggers, and can finish it off */
  chipDrone(d, amount, byTier) {
    if (d.dead) return;
    d.integrity -= amount;
    d.stagger = 0.7;
    d.cooldown = Math.max(d.cooldown, 1.6);
    if (d.integrity <= 0) this.game.onDroneOverwhelmed(d, byTier);
  }

  /* ---------- projectiles ---------- */
  fireInsight(from, dir, qtype, colour) {
    this.bolts.push({
      kind: 'insight', qtype,
      x: from[0], y: from[1], z: from[2],
      vx: dir[0] * 42, vy: dir[1] * 42, vz: dir[2] * 42,
      life: 2.2, col: colour,
    });
  }

  fireMisinfo(d, tx, ty, tz, atPlayer) {
    const dx = tx - d.x, dy = ty - d.y, dz = tz - d.z;
    const L = Math.hypot(dx, dy, dz) || 1;
    this.bolts.push({
      kind: 'misinfo', card: d.card, drone: d,
      x: d.x, y: d.y, z: d.z,
      vx: (dx / L) * 15, vy: (dy / L) * 15, vz: (dz / L) * 15,
      life: 3.4, col: hex2rgb('#ff45a6'), wob: this.rnd() * TAU, atPlayer: !!atPlayer,
    });
  }

  /* ---------- per-frame ---------- */
  gainPlate(text, hex) {
    const key = text + hex;
    if (!this.gainPlates[key]) this.gainPlates[key] = buildGainPlate(this.gl, text, hex);
    return this.gainPlates[key];
  }

  addMote(x, y, z, text, hex) {
    this.motes.push({ x, y, z, tex: this.gainPlate(text, hex), t: 0 });
  }

  update(dt, t) {
    const G = this.game;
    const cam = G.cam;
    for (const m of this.motes) { m.t += dt; m.y += dt * 0.85; }
    this.motes = this.motes.filter((m) => m.t < 2.4);

    /* students */
    for (const s of this.students) {
      s.timer -= dt;
      if (s.lineT > 0) s.lineT -= dt;
      if (s.sparkT > 0) s.sparkT -= dt;

      if (this.mode === 'ride') {
        s.drift += dt * 0.55;
        const targetX = Math.sin(s.drift) * 34;
        s.x += (targetX - s.x) * dt * 0.55;
        s.z -= s.speed * dt * (s.confused > 0 ? 0.55 : 1);
        s.y = mtnHeight(s.x, s.z);
        s.yaw = Math.cos(s.drift) * 0.55;
        s.bob += dt * 6;
        // loop back to the top of their stretch so the run always feels populated
        if (s.z < -MTN.LEN * 0.97) {
          s.z = -Math.max(0, s.band - 0.12) * MTN.LEN - 12;
          s.x = (this.rnd() - 0.5) * 40;
        }
        if (s.lineT > 0) s.lineT -= dt;
        if (s.sparkT > 0) s.sparkT -= dt;
        if (s.confused > 0) s.confused -= dt;
        const tierR = TIERS[this.tier(s)];
        if (tierR.fire > 0 && s.confused <= 0) {
          s.fireCd -= dt;
          if (s.fireCd <= 0) {
            let best = null, bd = 42;
            for (const d of this.drones) {
              if (d.dead) continue;
              const dd = Math.hypot(d.x - s.x, d.z - s.z);
              if (dd < bd) { bd = dd; best = d; }
            }
            if (best) {
              s.fireCd = tierR.fire * (0.7 + this.rnd() * 0.6);
              const dx = best.x - s.x, dy = best.y - (s.y + 1.4), dz = best.z - s.z;
              const L = Math.hypot(dx, dy, dz) || 1;
              const spread = this.tier(s) === 3 ? 0.02 : 0.075;
              this.bolts.push({
                kind: 'student', chip: tierR.chip, byTier: this.tier(s),
                x: s.x, y: s.y + 1.4, z: s.z,
                vx: (dx / L + (this.rnd() - 0.5) * spread) * 34,
                vy: (dy / L + (this.rnd() - 0.5) * spread) * 34,
                vz: (dz / L + (this.rnd() - 0.5) * spread) * 34,
                life: 1.8, col: hex2rgb('#9fe8c0'),
              });
            } else s.fireCd = 2.5;
          }
        }
        continue;
      }

      if (s.state === 'idle' && s.timer <= 0) {
        const p = this.randomPoint(s.hx, s.hz, s.roam);
        s.tx = p.x; s.tz = p.z;
        s.state = 'walk';
      }
      if (s.state === 'walk') {
        const dx = s.tx - s.x, dz = s.tz - s.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.6) { s.state = 'idle'; s.timer = 1.5 + this.rnd() * 5; }
        else {
          const sp = s.speed * (s.confused > 0 ? 0.55 : 1);
          const nx = s.x + (dx / d) * sp * dt, nz = s.z + (dz / d) * sp * dt;
          let ok = isWalkable(nx, nz);
          if (ok) {
            for (const c of G.colliders) {
              const rr = c.r + 0.7;
              if ((nx - c.x) ** 2 + (nz - c.z) ** 2 < rr * rr) { ok = false; break; }
            }
          }
          if (ok) { s.x = nx; s.z = nz; s.bob += dt * sp * 3.4; }
          else { s.state = 'idle'; s.timer = 0.4; }
          const want = Math.atan2(dx, dz);
          let diff = want - s.yaw;
          while (diff > Math.PI) diff -= TAU;
          while (diff < -Math.PI) diff += TAU;
          s.yaw += diff * Math.min(1, dt * 6);
        }
      }
      if (s.confused > 0) s.confused -= dt;

      // Informed students defend themselves; graduates are markedly better at it.
      const tier = TIERS[this.tier(s)];
      if (tier.fire > 0 && s.confused <= 0) {
        s.fireCd -= dt;
        if (s.fireCd <= 0) {
          let best = null, bd = 30;
          for (const d of this.drones) {
            if (d.dead) continue;
            const dd = Math.hypot(d.x - s.x, d.z - s.z);
            if (dd < bd) { bd = dd; best = d; }
          }
          if (best) {
            s.fireCd = tier.fire * (0.7 + this.rnd() * 0.6);
            s.yaw = Math.atan2(best.x - s.x, best.z - s.z);
            const dx = best.x - s.x, dy = best.y - 1.5, dz = best.z - s.z;
            const L = Math.hypot(dx, dy, dz) || 1;
            const spread = this.tier(s) === 3 ? 0.02 : 0.075;   // graduates aim better
            this.bolts.push({
              kind: 'student', chip: tier.chip, byTier: this.tier(s),
              x: s.x, y: 1.5, z: s.z,
              vx: (dx / L + (this.rnd() - 0.5) * spread) * 30,
              vy: (dy / L + (this.rnd() - 0.5) * spread) * 30,
              vz: (dz / L + (this.rnd() - 0.5) * spread) * 30,
              life: 1.8, col: hex2rgb('#9fe8c0'),
            });
          } else s.fireCd = 2.5;
        }
      }
    }

    /* drones — only once the player has something to fight back with */
    if (G.unlockedTypes().length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 11 + this.rnd() * 12;
        this.spawnDrone();
      }
    }

    for (const d of this.drones) {
      d.born += dt;
      if (d.dead) { d.dying -= dt; continue; }
      if (d.stagger > 0) { d.stagger -= dt; }
      // leash: a drone the player has walked away from gives up its slot, so the
      // global cap can never deadlock a district that still owes you kills
      const far = Math.hypot(cam.x - d.x, cam.z - d.z);
      d.away = far > 95 ? (d.away || 0) + dt : 0;
      if (d.away > 20) { d.despawn = true; continue; }
      // drift toward the player but keep an uneasy distance
      const dx = cam.x - d.x, dz = cam.z - d.z;
      const dist = Math.hypot(dx, dz);
      const want = dist > 16 ? 1 : dist < 9 ? -0.7 : 0;
      if (want) {
        const sp = 3.4 * want;
        const nx = d.x + (dx / dist) * sp * dt, nz = d.z + (dz / dist) * sp * dt;
        d.x = nx; d.z = nz;                       // drones fly, so no walkable test
      }
      d.x += Math.sin(t * 0.7 + d.phase) * 0.6 * dt;
      d.z += Math.cos(t * 0.55 + d.phase) * 0.6 * dt;
      d.y += Math.sin(t * 1.3 + d.phase) * 0.32 * dt;
      if (d.hover) {
        const g = mtnHeight(d.x, d.z) + 8.5;
        d.y += (g - d.y) * (1 - Math.exp(-2.4 * dt));
      } else d.y = clamp(d.y, 2.3, 5.2);
      d.yaw = Math.atan2(dx, dz);

      d.cooldown -= dt;
      if (d.cooldown <= 0 && dist < 34) {
        d.cooldown = 6.5 + this.rnd() * 5.0;
        // Never aim at a player who is still processing the last claim, and never
        // let two claims be in the air at you at once — reading time is protected.
        const grace = t < (G.graceUntil || 0);
        const incoming = this.bolts.some((b) => b.kind === 'misinfo' && b.atPlayer);
        let target = null;
        if (grace || incoming || this.rnd() > 0.5) {
          const near = this.students.filter((s) =>
            Math.hypot(s.x - d.x, s.z - d.z) < 26 && s.confused <= 0);
          if (near.length) target = near[(this.rnd() * near.length) | 0];
        }
        if (target) this.fireMisinfo(d, target.x, 1.3, target.z);
        else if (!grace && !incoming) this.fireMisinfo(d, cam.x, cam.y - 0.1, cam.z, true);
        else d.cooldown = 2.5;
      }
    }
    this.drones = this.drones.filter((d) => !d.despawn && !(d.dead && d.dying <= 0));

    /* projectiles */
    for (const b of this.bolts) {
      b.life -= dt;
      if (b.kind === 'misinfo') {
        b.wob += dt * 7;
        b.x += Math.sin(b.wob) * 1.4 * dt;
        b.y += Math.cos(b.wob * 0.8) * 0.9 * dt;
      }
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;

      if (b.kind === 'student') {
        for (const d of this.drones) {
          if (d.dead) continue;
          if ((b.x - d.x) ** 2 + (b.y - d.y) ** 2 + (b.z - d.z) ** 2 < 2.6 * 2.6) {
            this.chipDrone(d, b.chip, b.byTier);
            b.life = 0;
            break;
          }
        }
      } else if (b.kind === 'insight') {
        for (const d of this.drones) {
          if (d.dead) continue;
          if ((b.x - d.x) ** 2 + (b.y - d.y) ** 2 + (b.z - d.z) ** 2 < 2.6 * 2.6) {
            G.onInsightHitsDrone(d, b.qtype);
            b.life = 0;
            break;
          }
        }
        if (b.life > 0) {
          for (const s of this.students) {
            const hy = 1.15;
            if ((b.x - s.x) ** 2 + (b.y - hy) ** 2 + (b.z - s.z) ** 2 < 1.15 * 1.15) {
              G.onInsightHitsStudent(s, b.qtype);
              b.life = 0;
              break;
            }
          }
        }
      } else {
        // misinformation: hits the player, or a student
        if ((b.x - cam.x) ** 2 + (b.y - cam.y) ** 2 + (b.z - cam.z) ** 2 < 1.1 * 1.1) {
          G.onMisinfoHitsPlayer(b);
          b.life = 0;
        } else {
          for (const s of this.students) {
            if (s.confused > 0) continue;
            if ((b.x - s.x) ** 2 + (b.y - 1.15) ** 2 + (b.z - s.z) ** 2 < 1.0 * 1.0) {
              if (s.taught > 0) { s.taught = Math.max(0, s.taught - 1); s.sparkT = 0.5; s.sparkCol = [0.6, 0.9, 1]; }
              else { s.confused = 26 + this.rnd() * 20; s.line = pick(STUDENT_LINES.confused, this.rnd); s.lineT = 4; }
              b.life = 0;
              break;
            }
          }
        }
      }
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);
  }

  /* ---------- drawing ---------- */
  draw(R, cam, basis, time) {
    const gl = R.gl;

    for (const s of this.students) {
      const dx = s.x - cam.x, dz = s.z - cam.z;
      if (dx * dx + dz * dz > 130 * 130) continue;
      const walkBob = s.state === 'walk' ? Math.abs(Math.sin(s.bob)) * 0.045 : 0;
      const idleBob = Math.sin(time * 1.1 + s.phase) * 0.012;
      const y = this.mode === 'ride'
        ? s.y + Math.abs(Math.sin(s.bob)) * 0.06
        : walkBob + idleBob;
      const t = this.tier(s);
      M4.trs(this.model, s.x, y, s.z, s.yaw, 1, 1, 1);
      if (this.mode === 'ride') {
        R.drawMesh(this.boardMesh, this.model, { tint: [1, 1, 1] });
      }
      const tint = s.confused > 0
        ? [1.40, 0.60, 1.05]
        : [1 + t * 0.10, 1 + t * 0.13, 1 + t * 0.16];
      R.drawMesh(s.mesh, this.model, { tint });

      // worn marks of education — the whole win condition has to be readable
      if (t >= 2) {
        M4.trs(this.model, s.x, y + 1.20, s.z, s.yaw, 1, 1, 1);
        R.drawMesh(this.marks.scarf, this.model, {});
      }
      if (t >= 3) {
        M4.trs(this.model, s.x, y + 1.12, s.z, s.yaw, 1, 1, 1);
        R.drawMesh(this.marks.gown, this.model, {});
        M4.trs(this.model, s.x, y + 1.64, s.z, s.yaw + 0.2, 1, 1, 1);
        R.drawMesh(this.marks.cap, this.model, {});
      }
      if (t >= 1) {
        const bx = s.x + Math.cos(s.yaw) * 0.40, bz = s.z - Math.sin(s.yaw) * 0.40;
        M4.trs(this.model, bx, y + 1.02 + Math.sin(time * 1.6 + s.phase) * 0.045, bz,
          s.yaw + Math.sin(time * 0.6 + s.phase) * 0.3, 1, 1, 1);
        R.drawMesh(this.marks.book, this.model, {});
      }
    }

    for (const d of this.drones) {
      const k = d.dying > 0 ? Math.max(0.02, d.dying / 0.5) : 1;
      const spin = d.dying > 0 ? (1 - k) * 6 : 0;
      M4.trs(this.model, d.x, d.y, d.z, d.yaw + spin, k, k, k);
      const flick = 0.9 + 0.35 * Math.sin(time * 21 + d.phase) * Math.sin(time * 7.3);
      R.drawMesh(this.droneMesh, this.model, { tint: [flick, flick * 0.9, flick] });
    }
  }

  /* Status plates: which tier a student is at and what they still need.
     Persistent, not a toast — you should be able to plan a route by reading them. */
  drawPlates(R, cam, basis) {
    for (const s of this.students) {
      const dist = Math.hypot(s.x - cam.x, s.z - cam.z);
      if (dist > 62 || dist < 1.2) continue;
      const t = this.tier(s);
      const q = QTYPES[s.wants];
      const tex = studentPlate(this.gl, t, s.wants, TIERS[t].name, q.name, QHEX[s.wants]);
      const fade = clamp((62 - dist) / 16, 0, 1) * clamp((dist - 1.4) / 1.6, 0, 1);
      if (fade < 0.02) continue;
      const sc = 1 + Math.min(dist / 26, 1.5);        // keep it readable far away
      const baseY = (this.mode === 'ride' ? s.y : 0) + 2.34;
      R.drawBillboard(tex, [s.x, baseY, s.z], 2.15 * sc, 1.01 * sc,
        [1, 1, 1, fade * (s.confused > 0 ? 0.65 : 1)], 0.28, basis);
    }
    for (const m of this.motes) {
      const k = clamp(1 - m.t / 2.4, 0, 1);
      R.drawBillboard(m.tex, [m.x, m.y, m.z], 1.5 * (1 + (1 - k) * 0.5), 0.57 * (1 + (1 - k) * 0.5),
        [1, 1, 1, Math.min(1, k * 2.2)], 0.5, basis);
    }
  }

  drawGlows(R, cam, time) {
    /* additive pass — bolts and the sparks over taught students */
    for (const b of this.bolts) {
      const yaw = Math.atan2(b.vx, b.vz);
      M4.trs(this.model, b.x, b.y, b.z, yaw, 1, 1, 1);
      const mesh = b.kind === 'insight' ? this.insightBolt
        : b.kind === 'student' ? this.studentBolt : this.misinfoBolt;
      const sc = b.kind === 'student' ? 0.7 : 1;
      M4.trs(this.model, b.x, b.y, b.z, yaw, sc, sc, sc);
      R.drawMesh(mesh, this.model, { alpha: 0.95, tint: [1, 1, 1] });
    }
    // education auras and graduate halos, in the additive pass
    for (const s of this.students) {
      const dist = Math.hypot(s.x - cam.x, s.z - cam.z);
      if (dist > 110) continue;
      const t = this.tier(s);
      if (s.confused > 0) {
        M4.trs(this.model, s.x, 0.05, s.z, -time * 0.8, 1, 1, 1);
        R.drawMesh(this.marks.aura, this.model,
          { alpha: 0.30 + 0.10 * Math.sin(time * 5 + s.phase), tint: [1.0, 0.30, 0.75] });
        continue;
      }
      if (t >= 1) {
        const a = TIERS[t].aura;
        M4.trs(this.model, s.x, 0.05, s.z, time * 0.5, 1, 1, 1);
        R.drawMesh(this.marks.aura, this.model, { alpha: 0.34 * a, tint: [0.55, 1.0, 0.78] });
      }
      if (t >= 3) {
        M4.trs(this.model, s.x, 1.98 + Math.sin(time * 1.3 + s.phase) * 0.05, s.z, time * 1.1, 1, 1, 1);
        R.drawMesh(this.marks.halo, this.model, { alpha: 0.42, tint: [1.0, 0.86, 0.52] });
      }
    }
    for (const s of this.students) {
      if (s.sparkT <= 0) continue;
      const k = clamp(s.sparkT / 1.6, 0, 1);
      M4.trs(this.model, s.x, 2.15 + (1 - k) * 0.75, s.z, time * 2.4, k, k, k);
      R.drawMesh(this.sparkMesh, this.model, { alpha: k, tint: s.sparkCol });
    }
  }
}

function pick(arr, rnd) { return arr[((rnd ? rnd() : Math.random()) * arr.length) | 0]; }
