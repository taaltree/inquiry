/* ============================================================
   life.js — everything that moves and isn't the player:
     · student NPCs wandering the station
     · Feed Drones firing manipulative claims
     · insight / misinformation projectiles

   Design note: the five question types are the ammunition. A drone is
   destroyed only by the one question type that structurally dismantles its
   technique, so combat is a knowledge check, never a reflex check.
   ============================================================ */

const STUDENT_COUNT = 26;
const SUMMIT_STUDENTS = 14;
const DRONE_MAX = 4;
const DRONE_MAX_UNARMED = 2;
const WALKERS = 18;    // before you can answer back, the feed only works the crowd

/* Education is the win condition, so it has to be legible at a glance.
   Each tier adds an unmistakable silhouette cue and more agency in a fight. */
const TIERS = [
  { at: 0, name: 'Unaware',  aura: 0.00, fire: 0,    chip: 0    },
  { at: 1, name: 'Curious',  aura: 0.35, fire: 0,    chip: 0    },
  { at: 2, name: 'Informed', aura: 0.70, fire: 5.5,  chip: 0.14 },
  { at: 4, name: 'Graduate', aura: 1.00, fire: 3.0,  chip: 0.30 },
];
const tierOf = (taught) => (taught >= 4 ? 3 : taught >= 2 ? 2 : taught >= 1 ? 1 : 0);
const DRONES_PER_DISTRICT = 5;   // per department; the fifth is its Peer Review
const FEED_MAX = 14;             // drones alive across the campus at once
const HUNTERS_MAX = 3;           // how many break off to chase an armed player
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

  // limbs are separate meshes, each built around its own pivot so it can swing
  const limbs = {};
  for (const s of [-1, 1]) {
    const lb = new Builder();
    lb.add(pCapsule(0.068, 8, 3), xform([s * 0.084, hipY * 0.52 - hipY, 0], [0, 0, 0], [1, hipY * 1.05, 1]), legC, 0.02);
    lb.add(BOX, xform([s * 0.084, 0.030 - hipY, 0.038], [0, 0, 0], [0.112, 0.058, 0.225]), scalec(legC, 0.7), 0.02);
    limbs[s < 0 ? 'legL' : 'legR'] = lb.upload(gl);
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
  const shY = chestY + 0.02;
  for (const s of [-1, 1]) {
    const ab = new Builder();
    ab.add(pCapsule(0.052, 8, 3), xform([s * (sw + 0.045), chestY - 0.19 - shY, 0.01], [0, 0, s * 0.12],
      [1, 0.42, 1]), coat, 0.02);
    ab.add(pCapsule(0.045, 8, 3), xform([s * (sw + 0.095), chestY - 0.53 - shY, 0.05], [0.18, 0, s * 0.05],
      [1, 0.34, 1]), skin, 0.02);
    limbs[s < 0 ? 'armL' : 'armR'] = ab.upload(gl);
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
  return { body: b.upload(gl), ...limbs, hipY, shY };
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

/* Feed Drone: a quadcopter carrying a too-bright phone screen full of posts */
function buildDroneMesh(gl) {
  const b = new Builder();
  const shell = mat(0, [0.03, 0.03, 0.035], { rough: 0.35, metal: 0.4 });
  const trim = mat(0, [0.12, 0.12, 0.14], { rough: 0.4, metal: 0.6 });
  const pink = mat(0, [1.0, 0.25, 0.66], { glow: 1.1, rough: 0.3 });
  const white = mat(0, [1.0, 0.9, 0.96], { glow: 1.5, rough: 0.3 });
  const rotor = mat(0, [0.08, 0.08, 0.09], { rough: 0.5, metal: 0.3 });
  b.add(pCyl(16, true, true, 0.42, 0.5), xform([0, 0.1, 0], [0, 0, 0], [0.9, 0.22, 0.7]), shell);
  b.add(SPHERE, xform([0, 0.2, 0], [0, 0, 0], [0.62, 0.22, 0.5]), shell);
  b.add(BOX, xform([0, 0.1, 0.34], [0, 0, 0], [0.6, 0.04, 0.02]), pink);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const hx = sx * 0.78, hz = sz * 0.6;
    strut(b, [sx * 0.25, 0.12, sz * 0.18], [hx, 0.16, hz], 0.07, trim);
    b.add(pCyl(12), xform([hx, 0.2, hz], [0, 0, 0], [0.13, 0.14, 0.13]), trim);
    b.add(pCyl(24, true, true), xform([hx, 0.28, hz], [0, 0, 0], [0.74, 0.012, 0.74]), rotor);
    b.add(SPHERE_LO, xform([hx, 0.12, hz], [0, 0, 0], [0.06, 0.06, 0.06]), sz > 0 ? pink : mat(0, [0.2, 0.9, 1.0], { glow: 1.2 }));
  }
  // the screen, hung below on a gimbal, facing forward
  strut(b, [0, 0.0, 0.1], [0, -0.25, 0.2], 0.05, trim);
  b.add(BOX, xform([0, -0.68, 0.22], [0.12, 0, 0], [1.05, 0.72, 0.06]), shell);
  b.add(BOX, xform([0, -0.68, 0.26], [0.12, 0, 0], [0.95, 0.62, 0.02]), pink);
  for (let i = 0; i < 5; i++) {
    b.add(BOX, xform([-0.08 + (i % 2) * 0.1, -0.44 - i * 0.11, 0.278 + i * 0.013], [0.12, 0, 0], [0.7 - (i % 3) * 0.15, 0.05, 0.01]), white);
  }
  b.add(SPHERE_LO, xform([0, -0.02, 0.33], [0, 0, 0], [0.12, 0.12, 0.12]), mat(0, [0.9, 0.1, 0.2], { glow: 1.6 }));
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

    this.studentMeshes = [];      // superseded by rigged characters, built per student below
    this.sparkMesh = buildSpark(gl);
    this.marks = buildStudentMarks(gl);
    this.boardMesh = buildSnowboard(gl);
    this.droneMesh = buildDroneMesh(gl);
    this.shieldRing = (() => { const b = new Builder(); b.add(pTorus(0.035, 48, 8), xform([0, 0, 0], [0, 0, 0], [1, 1, 1]), [1, 1, 1], 2.2); return b.upload(gl); })();
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
      // passers-by: they walk the campus paths between buildings, like pedestrians on a street
      for (let i = 0; i < WALKERS; i++) {
        const s = this.spawnStudent(STUDENT_COUNT + i, null);
        s.walker = true; s.path = null; s.pi = 0; s.speed = 1.25 + this.rnd() * 0.45;
        this.students.push(s);
      }
    }

    for (const s of this.students) {
      s.ch = buildCharacter(gl, studentLook(900 + s.id * 137 + (this.mode === 'ride' ? 5000 : 0)));
      s.bones = newBones();
      s.sit = false;
    }
    this.gainPlates = {};        // "+1" / "+2" motes, built lazily
    this.drones = [];
    this.bolts = [];
    this.motes = [];
    this.spawnTimer = 5;
    this.model = M4.create();
  }

  /* ---------- students ---------- */
  spawnStudent(i, home) {
    // the homeless ones loiter in the atrium, which is otherwise an empty hub
    const p = home ? this.randomPoint(home.cx, home.cz, 24) : this.randomPoint(0, 0, 18);
    return {
      id: i, home: home ? home.id : null,
      hx: home ? home.cx : 0, hz: home ? home.cz : 0, roam: home ? 26 : 22,
      x: p.x, z: p.z, yaw: this.rnd() * TAU,
      tx: p.x, tz: p.z,
      speed: 1.2 + this.rnd() * 0.6,
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
    if (bd < R_PLATFORM + 34) return best;
    // Off-platform — atrium, causeway, ring — you are still inside one of the
    // station's five wedges, so the feed still has a district to answer to.
    const a = Math.atan2(cam.z, cam.x);
    let wedge = null, wd = 1e9;
    for (const d of DISTRICTS) {
      const diff = Math.abs(((a - d.angle + Math.PI * 3) % TAU) - Math.PI);
      if (diff < wd) { wd = diff; wedge = d; }
    }
    return wedge;
  }

  spawnDrone(forceDistrict) {
    const G = this.game;
    const armed = G.unlockedTypes().length > 0;
    if (this.drones.length >= (armed ? DRONE_MAX : DRONE_MAX_UNARMED)) return null;

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

    // near the player, not near the district centre — otherwise a drone
    // credited to the Foundry spawns 110 m away while you stand in the atrium
    const cam = G.cam;
    const p = this.randomPoint(cam.x, cam.z, 34);
    const card = MISINFO[(this.rnd() * MISINFO.length) | 0];
    // the district's last drone is its Peer Review: five shields, in argument order
    const cleared = G.feedCleared[d.id] || 0;
    const boss = cleared === DRONES_PER_DISTRICT - 1 && !(G.bossDone || {})[d.id]
      && !this.drones.some((x) => x.boss && !x.dead);
    const drone = {
      x: p.x, y: boss ? 4.6 : 3.0 + this.rnd() * 1.4, z: p.z,
      district: d.id, card, cooldown: boss ? 4 : 2.2 + this.rnd() * 2.5,
      integrity: 1, yaw: 0, phase: this.rnd() * TAU,
      dying: 0, dead: false, scanned: false, born: 0, stagger: 0,
      boss, shields: boss ? QTYPES.map((q) => q.key) : null,
    };
    if (boss) G.onBossSpawn(drone);
    this.drones.push(drone);
    return drone;
  }

  /* ---------- the summit: drones come at you down the run (unchanged) ---------- */
  updateRideDrones(dt, t) {
    const G = this.game, cam = G.cam;
    /* Drones are in the world from the first minute. Until you can answer one
       they ignore you and work on the students, which is both the honest version
       of the metaphor and the reason to go and ask somebody something. */
    const armed = G.unlockedTypes().length > 0;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = (armed ? 9 : 14) + this.rnd() * 9;
      const born = this.spawnDrone();
      if (born && !G.feedIntroduced) {
        G.feedIntroduced = true;
        if (armed) {
          HUD.banner('THE FEED HAS FOUND YOU',
            'A drone is circling. Aim at it to read its technique.', '#ff3fa8');
        } else {
          HUD.banner('THE FEED IS ALREADY HERE',
            'It is working on the students, not on you — you have nothing to answer it with yet. Go and ask a scientist a question.', '#ff3fa8');
          HUD.log('<b>FEED DRONE</b> — it is pushing claims at the students. Interview someone and that question becomes your counter.');
        }
        Sfx.deny();
      }
    }
    if (armed && !G.feedNoticedYou && this.drones.some((d) => !d.dead)) {
      G.feedNoticedYou = true;
      if (G.feedIntroduced) {
        HUD.banner('THE FEED HAS NOTICED YOU',
          'Now it aims at you as well. A claim that reaches you stops the world until you answer it.', '#ff3fa8');
      }
    }

    for (const d of this.drones) {
      d.born += dt;
      if (d.dead) { d.dying -= dt; continue; }
      if (d.stagger > 0) { d.stagger -= dt; }
      // leash: a drone the player has walked away from gives up its slot, so the
      // global cap can never deadlock a district that still owes you kills
      const far = Math.hypot(cam.x - d.x, cam.z - d.z);
      d.away = far > (armed ? 95 : 150) ? (d.away || 0) + dt : 0;
      if (d.away > 20) { d.despawn = true; continue; }
      // drift toward the player but keep an uneasy distance
      let ax = cam.x, az = cam.z;
      if (!armed) {
        // it has no interest in you yet: it goes where the crowd is
        let bs = null, bd = 1e9;
        for (const s of this.students) {
          const sd = Math.hypot(s.x - d.x, s.z - d.z);
          if (sd < bd) { bd = sd; bs = s; }
        }
        if (bs && bd > 12) { ax = bs.x; az = bs.z; }
      }
      const dx = ax - d.x, dz = az - d.z;
      const dist = Math.hypot(dx, dz);
      const want = dist > (d.boss ? 22 : 16) ? 1 : dist < (d.boss ? 12 : 9) ? -0.7 : 0;
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
      } else { const gy = groundH(d.x, d.z); d.y = clamp(d.y, gy + (d.boss ? 4.0 : 2.3), gy + (d.boss ? 6.5 : 5.2)); }
      d.yaw = Math.atan2(dx, dz);

      d.cooldown -= dt;
      if (d.cooldown <= 0 && (dist < 34 || !armed)) {
        d.cooldown = d.boss ? 5.0 + this.rnd() * 3.0 : (armed ? 6.5 : 9.0) + this.rnd() * 5.0;
        if (d.boss && d.shields && d.shields.length) {
          // its claims are always ones the next shield's question dismantles
          const pool = MISINFO.filter((m) => m.weakness === d.shields[0]);
          if (pool.length) d.card = pool[(this.rnd() * pool.length) | 0];
        }
        // Never aim at a player who is still processing the last claim, and never
        // let two claims be in the air at you at once — reading time is protected.
        const grace = t < (G.graceUntil || 0);
        const incoming = this.bolts.some((b) => b.kind === 'misinfo' && b.atPlayer);
        let target = null;
        if (!armed || grace || incoming || this.rnd() > 0.5) {
          const near = this.students.filter((s) =>
            Math.hypot(s.x - d.x, s.z - d.z) < (armed ? 26 : 46) && s.confused <= 0);
          if (near.length) target = near[(this.rnd() * near.length) | 0];
        }
        if (target) this.fireMisinfo(d, target.x, (this.mode === 'ride' ? target.y : groundH(target.x, target.z)) + 1.3, target.z);
        else if (armed && !grace && !incoming) this.fireMisinfo(d, cam.x, cam.y - 0.1, cam.z, true);
        else d.cooldown = 2.5;
      }
    }
    this.drones = this.drones.filter((d) => !d.despawn && !(d.dead && d.dying <= 0));
  }

  /* ---------- the campus: the feed is an occupying force ----------
     Drones circle the Great Court and every department still owed, and come
     back after you dismantle them until that department's feed is cleared.
     Unarmed, you are beneath their notice and they work on the students; once
     you can answer them, the nearest few break off and hunt you. */
  feedRoosts() {
    if (this._roosts) return this._roosts;
    const out = [{ id: 'court', x: 0, z: 0, r0: 10, r1: 26, h0: 12, h1: 18, district: null }];
    for (const d of DISTRICTS) {
      const D = DEPT[d.id];
      // circle over the forecourt, shifted away from the building so they never clip it
      out.push({ id: d.id, x: d.cx + Math.sin(D.yaw) * 8, z: d.cz + Math.cos(D.yaw) * 8, r0: 8, r1: 16, h0: 10, h1: 16, district: d.id });
    }
    return (this._roosts = out);
  }

  roostWant(r, armed) {
    const G = this.game;
    if (r.district) {
      if ((G.feedCleared[r.district] || 0) >= DRONES_PER_DISTRICT) return 0;
      return armed ? 2 : 1;
    }
    return DISTRICTS.every((d) => G.secured[d.id]) ? 0 : (armed ? 3 : 2);
  }

  spawnAt(r, boss, arriving) {
    const G = this.game;
    const a = this.rnd() * TAU;
    const far = arriving ? 45 + this.rnd() * 25 : 0;
    const orbitR = lerp(r.r0, r.r1, this.rnd()), orbitH = lerp(r.h0, r.h1, this.rnd());
    const x = r.x + Math.cos(a) * (arriving ? far : orbitR), z = r.z + Math.sin(a) * (arriving ? far : orbitR);
    const card = MISINFO[(this.rnd() * MISINFO.length) | 0];
    const drone = {
      x, y: groundH(x, z) + (arriving ? 26 + this.rnd() * 8 : orbitH), z,
      roost: r.id, district: r.district, orbitA: a, orbitR, orbitH, orbitDir: this.rnd() < 0.5 ? -1 : 1,
      orbitSp: 0.14 + this.rnd() * 0.1, strafe: this.rnd() * TAU,
      card, cooldown: 3 + this.rnd() * 7, integrity: 1, yaw: 0, phase: this.rnd() * TAU,
      dying: 0, dead: false, scanned: false, born: 0, stagger: 0, state: 'patrol', vx: 0, vy: 0, vz: 0,
      boss, shields: boss ? QTYPES.map((q) => q.key) : null,
    };
    if (boss) drone.orbitR = r.r0 + 2;
    this.drones.push(drone);
    if (boss) G.onBossSpawn(drone);
    return drone;
  }

  /* fill every roost at once: the campus is already occupied when you arrive */
  fillFeed() {
    const armed = this.game.unlockedTypes().length > 0;
    for (const r of this.feedRoosts()) {
      const want = this.roostWant(r, armed);
      let alive = this.drones.filter((d) => !d.dead && d.roost === r.id).length;
      while (alive < want && this.drones.filter((d) => !d.dead).length < FEED_MAX) { this.spawnAt(r, false, false); alive++; }
      r.cool = 0;
    }
    this.feedFilled = true;
  }

  updateFeed(dt, t) {
    const G = this.game, cam = G.cam;
    const armed = G.unlockedTypes().length > 0;
    if (!this.feedFilled) this.fillFeed();

    // ---- keep the population up: a roost that has lost a drone calls another in ----
    this.feedT = (this.feedT || 0) - dt;
    if (this.feedT <= 0) {
      this.feedT = 0.5;
      const aliveAll = this.drones.filter((d) => !d.dead).length;
      for (const r of this.feedRoosts()) {
        r.cool = (r.cool || 0) - 0.5;
        const want = this.roostWant(r, armed);
        const alive = this.drones.filter((d) => !d.dead && d.roost === r.id).length;
        if (alive >= want || r.cool > 0 || aliveAll >= FEED_MAX) continue;
        const needBoss = !!r.district && (G.feedCleared[r.district] || 0) >= DRONES_PER_DISTRICT - 1
          && !(G.bossDone || {})[r.district] && !this.drones.some((d) => d.boss && !d.dead && d.district === r.district);
        this.spawnAt(r, needBoss, true);
        r.cool = 9 + this.rnd() * 8;
        break;
      }
    }

    // ---- first sight ----
    const alive = this.drones.filter((d) => !d.dead);
    let nearest = Infinity;
    for (const d of alive) nearest = Math.min(nearest, Math.hypot(d.x - cam.x, d.z - cam.z));
    G.feedNearest = nearest;
    if (!G.feedIntroduced && nearest < 70) {
      G.feedIntroduced = true;
      if (armed) G.feedNoticedYou = true;          // one banner, not two
      if (armed) {
        HUD.banner('THE FEED IS HERE', 'Drones over every court and department. The nearest will come for you — aim at one to read its technique.', '#ff3fa8');
      } else {
        HUD.banner('THE FEED IS ALREADY HERE',
          'Drones over every court and department, pushing claims at the students. You have nothing to answer them with yet — go and ask a scientist a question.', '#ff3fa8');
        HUD.log('<b>FEED DRONES</b> — they circle the court and every department. Interview someone and that question becomes your counter.');
      }
      Sfx.deny();
    }
    if (armed && !G.feedNoticedYou && G.feedIntroduced) {
      G.feedNoticedYou = true;
      HUD.banner('THE FEED HAS NOTICED YOU',
        'Now the nearest drones come for you. A claim that reaches you stops the world until you answer it.', '#ff3fa8');
    }

    // ---- who is hunting: the nearest few, if you are armed and close ----
    const hunters = new Set();
    if (armed && G.mode !== 'talk') {
      alive.map((d) => ({ d, k: Math.hypot(d.x - cam.x, d.z - cam.z) }))
        .filter((o) => o.k < (o.d.boss ? 70 : 52))
        .sort((p, q) => p.k - q.k).slice(0, HUNTERS_MAX).forEach((o) => hunters.add(o.d));
    }
    G.feedHunters = hunters.size;
    const grace = t < (G.graceUntil || 0);
    const incoming = this.bolts.some((b) => b.kind === 'misinfo' && b.atPlayer);
    const canShootPlayer = armed && !grace && !incoming && t - (G.feedShotT || -99) > 8.0;

    for (const d of this.drones) {
      d.born += dt;
      if (d.dead) { d.dying -= dt; continue; }
      if (d.stagger > 0) d.stagger -= dt;
      const r = this.feedRoosts().find((x) => x.id === d.roost) || this.feedRoosts()[0];
      let tx, ty, tz, speed;
      d.state = hunters.has(d) ? 'hunt' : 'patrol';
      if (d.state === 'hunt') {
        // hold a harassing distance, drifting side to side, above head height
        d.strafe += dt * 0.35;
        const want = d.boss ? 21 : 15;
        let ox = d.x - cam.x, oz = d.z - cam.z; const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
        const sa = Math.sin(d.strafe) * 0.7, cs = Math.cos(sa), sn = Math.sin(sa);
        const rx = ox * cs - oz * sn, rz = ox * sn + oz * cs;
        tx = cam.x + rx * want; tz = cam.z + rz * want; ty = (G.footY || 0) + (d.boss ? 7.5 : 5.2) + Math.sin(t * 1.1 + d.phase) * 0.8;
        speed = 7;
      } else {
        d.orbitA += d.orbitSp * dt * d.orbitDir;
        tx = r.x + Math.cos(d.orbitA) * d.orbitR; tz = r.z + Math.sin(d.orbitA) * d.orbitR;
        ty = groundH(tx, tz) + d.orbitH + Math.sin(t * 0.9 + d.phase) * 0.9;
        speed = d.born < 8 ? 8 : 4.5;
      }
      // never fly through a building: rise over anything below you
      for (const o of G.colliders) {
        if (!o.obb) continue;
        const ex = tx - o.x, ez = tz - o.z;
        if (Math.abs(ex) > o.hw + o.hd + 4 || Math.abs(ez) > o.hw + o.hd + 4) continue;
        const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
        if (Math.abs(ex * c - ez * s) < o.hw + 3 && Math.abs(ex * s + ez * c) < o.hd + 3) ty = Math.max(ty, o.y0 + o.h + 2);
      }
      // steer with a little inertia
      const dx = tx - d.x, dy = ty - d.y, dz = tz - d.z, L = Math.hypot(dx, dy, dz) || 1;
      const sp = Math.min(speed, L * 1.2);
      const k = 1 - Math.exp(-2.5 * dt);
      d.vx += ((dx / L) * sp - d.vx) * k; d.vy += ((dy / L) * sp - d.vy) * k; d.vz += ((dz / L) * sp - d.vz) * k;
      const stag = d.stagger > 0 ? 0.3 : 1;
      d.x += d.vx * dt * stag; d.y += d.vy * dt * stag; d.z += d.vz * dt * stag;
      d.y = Math.max(d.y, groundH(d.x, d.z) + 2.5);
      // face the player when hunting, the way it is going otherwise
      const face = d.state === 'hunt' ? Math.atan2(cam.x - d.x, cam.z - d.z) : Math.atan2(d.vx, d.vz);
      let df = face - d.yaw; while (df > Math.PI) df -= TAU; while (df < -Math.PI) df += TAU;
      d.yaw += df * Math.min(1, dt * 3);

      // ---- fire ----
      d.cooldown -= dt;
      if (d.cooldown > 0) continue;
      if (d.boss && d.shields && d.shields.length) {
        const pool = MISINFO.filter((m) => m.weakness === d.shields[0]);
        if (pool.length) d.card = pool[(this.rnd() * pool.length) | 0];
      }
      const pd = Math.hypot(cam.x - d.x, cam.z - d.z);
      if (d.state === 'hunt' && canShootPlayer && pd < 40 && this.rnd() < 0.75) {
        this.fireMisinfo(d, cam.x, cam.y - 0.1, cam.z, true);
        G.feedShotT = t;
        d.cooldown = (d.boss ? 4.5 : 6) + this.rnd() * 4;
        continue;
      }
      const near = this.students.filter((s) => Math.hypot(s.x - d.x, s.z - d.z) < 34 && s.confused <= 0);
      if (near.length) {
        const s = near[(this.rnd() * near.length) | 0];
        this.fireMisinfo(d, s.x, groundH(s.x, s.z) + 1.3, s.z);
        d.cooldown = 7 + this.rnd() * 6;
      } else d.cooldown = 2.5;
    }
    this.drones = this.drones.filter((d) => !(d.dead && d.dying <= 0));
  }

  /* a student's contribution: chips integrity, staggers, and can finish it off */
  chipDrone(d, amount, byTier) {
    if (d.dead) return;
    if (d.boss) amount *= 0.35;                 // a Peer Review is heavier going
    d.integrity -= amount;
    d.stagger = 0.7;
    d.cooldown = Math.max(d.cooldown, 1.6);
    if (d.integrity <= 0) {
      if (d.boss) { d.integrity = 1; this.game.onBossShieldBroken(d, null, byTier); }
      else this.game.onDroneOverwhelmed(d, byTier);
    }
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

      if (s.walker && G.nav) {
        // follow a sat-nav route to somewhere else on campus, then choose another
        if (!s.path || s.pi >= s.path.length) {
          if (!s.path) { const n0 = G.nav.nodes[(this.rnd() * G.nav.nodes.length) | 0]; s.x = n0.x; s.z = n0.z; }
          const n = G.nav.nodes[(this.rnd() * G.nav.nodes.length) | 0];
          s.path = G.nav.route(s.x, s.z, n.x, n.z); s.pi = 1;
          // stay on the paths, a little to one side like real people
          s.side = (this.rnd() - 0.5) * 1.6;
        }
        const [tx0, tz0] = s.path[Math.min(s.pi, s.path.length - 1)];
        const dx = tx0 - s.x, dz = tz0 - s.z, d = Math.hypot(dx, dz);
        if (d < 1.2) s.pi++;
        else {
          const sp = s.speed * (s.confused > 0 ? 0.55 : 1);
          const nx = dx / d, nz = dz / d;
          s.x += (nx - nz * s.side * 0.05) * sp * dt; s.z += (nz + nx * s.side * 0.05) * sp * dt;
          s.bob += dt * sp * 3.4;
          const want = Math.atan2(dx, dz);
          let diff = want - s.yaw; while (diff > Math.PI) diff -= TAU; while (diff < -Math.PI) diff += TAU;
          s.yaw += diff * Math.min(1, dt * 5);
        }
        s.state = 'walk';
        if (s.confused > 0) s.confused -= dt;
        continue;
      }
      if (s.state === 'idle' && s.timer <= 0) {
        s.sit = false;
        const p = this.randomPoint(s.hx, s.hz, s.roam);
        s.tx = p.x; s.tz = p.z;
        s.state = 'walk';
      }
      if (s.state === 'walk') {
        const dx = s.tx - s.x, dz = s.tz - s.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.6) {
          s.state = 'idle'; s.timer = 1.5 + this.rnd() * 5;
          if (this.rnd() < 0.28) { s.sit = true; s.timer = 10 + this.rnd() * 18; }
        }
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
            const gy = groundH(s.x, s.z);
            const dx = best.x - s.x, dy = best.y - (gy + 1.5), dz = best.z - s.z;
            const L = Math.hypot(dx, dy, dz) || 1;
            const spread = this.tier(s) === 3 ? 0.02 : 0.075;   // graduates aim better
            this.bolts.push({
              kind: 'student', chip: tier.chip, byTier: this.tier(s),
              x: s.x, y: gy + 1.5, z: s.z,
              vx: (dx / L + (this.rnd() - 0.5) * spread) * 30,
              vy: (dy / L + (this.rnd() - 0.5) * spread) * 30,
              vz: (dz / L + (this.rnd() - 0.5) * spread) * 30,
              life: 1.8, col: hex2rgb('#9fe8c0'),
            });
          } else s.fireCd = 2.5;
        }
      }
    }

    if (this.mode === 'ride') this.updateRideDrones(dt, t);
    else this.updateFeed(dt, t);

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
            const hy = (this.mode === 'ride' ? s.y : groundH(s.x, s.z)) + 1.15;
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
            const sy = (this.mode === 'ride' ? s.y : groundH(s.x, s.z)) + 1.15;
            if ((b.x - s.x) ** 2 + (b.y - sy) ** 2 + (b.z - s.z) ** 2 < 1.0 * 1.0) {
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
        : groundH(s.x, s.z) + walkBob + idleBob;
      const t = this.tier(s);
      const ride = this.mode === 'ride';
      M4.trs(this.model, s.x, y, s.z, s.yaw, 1, 1, 1);
      if (ride) R.drawMesh(this.boardMesh, this.model, { tint: [1, 1, 1] });
      const tint = s.confused > 0 ? [1.35, 0.7, 1.1] : WHITE3;
      // pose: walking, standing, sitting in the grass, riding a board
      const walking = s.state === 'walk';
      const P = this._pose || (this._pose = {});
      P.state = ride ? 'board' : walking ? 'walk' : (s.sit ? 'sitGround' : 'idle');
      P.phase = s.bob * 1.15; P.speed = 0; P.t = time; P.seed = s.phase; P.lean = 0; P.aim = 0; P.hold = false; P.talk = 0;
      P.lookYaw = 0; P.lookPitch = 0;
      poseCharacter(s.ch, P, s.bones);
      const bm = this.bodyM || (this.bodyM = M4.create());
      if (ride) M4.mul(bm, this.model, xformTo(this.tmpX || (this.tmpX = M4.create()), 0, 0.07, 0, 0, Math.PI / 2, 0));
      else bm.set(this.model);
      R.drawMesh(s.ch.mesh, bm, { bones: s.bones, tint });
      if (R.shadowPass && (s.x - cam.x) ** 2 + (s.z - cam.z) ** 2 > 60 * 60) continue;

      // worn marks of education — the whole win condition has to be readable
      const boneM = (i, ox, oy, oz, ry = 0, sc = 1) => {
        const o = this.markM || (this.markM = M4.create());
        M4.mul(o, bm, s.bones.subarray(i * 16, i * 16 + 16));
        return M4.mul(this.markM2 || (this.markM2 = M4.create()), o, xform([ox, oy, oz], [0, ry, 0], [sc, sc, sc]));
      };
      const J = s.ch.J;
      if (t >= 2) R.drawMesh(this.marks.scarf, boneM(BONE.CHEST, 0, J.neck - 0.1, 0.01, 0, 0.62), {});
      if (t >= 3) {
        R.drawMesh(this.marks.gown, boneM(BONE.CHEST, 0, J.neck - 0.34, -0.02, 0, 0.95), {});
        R.drawMesh(this.marks.cap, boneM(BONE.HEAD, 0, 0.36, 0, 0.2, 0.85), {});
      }
      if (t >= 1) R.drawMesh(this.marks.book, boneM(BONE.HAND_R, 0, -0.02, 0.08, 0, 0.8), {});
    }

    for (const d of this.drones) {
      const k = d.dying > 0 ? Math.max(0.02, d.dying / 0.5) : 1;
      const spin = d.dying > 0 ? (1 - k) * 6 : 0;
      const sc = k * (d.boss ? 2.6 : 1.65);
      M4.trs(this.model, d.x, d.y, d.z, d.yaw + spin, sc, sc, sc);
      const flick = 0.9 + 0.35 * Math.sin(time * 21 + d.phase) * Math.sin(time * 7.3);
      R.drawMesh(this.droneMesh, this.model, { tint: [flick, flick * 0.9, flick] });
      if (d.boss && !d.dead && d.shields) {
        // the remaining shields orbit it; the next one to fall burns brightest
        const ringM = this.ringM || (this.ringM = M4.create());
        d.shields.forEach((key, i) => {
          const qi = QTYPES.findIndex((q) => q.key === key), col = QCOLOURS[qi];
          const r = 3.1 + i * 0.45, bright = i === 0 ? 1.7 + 0.6 * Math.sin(time * 6) : 0.55;
          M4.trs(this.model, d.x, d.y, d.z, time * (0.5 + i * 0.13) + i * 1.3, 1, 1, 1);
          M4.mul(ringM, this.model, xform([0, 0, 0], [0.55 + i * 0.28, 0, 0.2 * i], [r, r, r]));
          R.drawMesh(this.shieldRing, ringM, { tint: [col[0] * bright, col[1] * bright, col[2] * bright] });
        });
      }
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
    // a pink ring of light under every drone, so the feed reads from across a lawn
    const ringM = this.glowRingM || (this.glowRingM = M4.create());
    for (const d of this.drones) {
      if (d.dead) continue;
      const pulse = 0.75 + 0.25 * Math.sin(time * 5 + d.phase);
      const s = d.boss ? 5.2 : 3.4;
      M4.trs(ringM, d.x, d.y - (d.boss ? 1.6 : 1.1), d.z, time * 0.8 + d.phase, s, 1, s);
      R.drawMesh(this.marks.aura, ringM, { alpha: (d.state === 'hunt' ? 0.55 : 0.32) * pulse, tint: [1.0, 0.25, 0.66] });
    }
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
