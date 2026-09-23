/* ============================================================
   vehicles.js — things you can ride, and the traffic on the town roads.

   Bicycles lean into turns and pedal; campus carts drift a little.
   Both use a kinematic bicycle model (heading turns at v·tan(steer)/L),
   push out of buildings and trees, and slow hard when they hit one.
   Traffic follows lanes on the town street and the east road and
   stops for anyone standing in front of it.
   ============================================================ */

const VEH = {
  bike: { max: 10.5, sprint: 13.5, accel: 4.2, brake: 9, drag: 0.35, steer: 0.62, wheelbase: 1.05, r: 0.45,
          camDist: 4.6, camH: 1.7, seat: 0.92, pose: 'ride', riderY: 0.0, riderZ: -0.08, hop: 3.6, grip: [0.25, 1.02, 0.42] },
  cart: { max: 11.5, sprint: 14, accel: 5.0, brake: 10, drag: 0.4, steer: 0.55, wheelbase: 1.9, r: 1.0,
          camDist: 6.2, camH: 2.2, seat: 0.62, pose: 'drive', riderY: 0.05, riderZ: 0.05, hop: 0 },
  // the collectable ones
  penny:  { max: 7.8, sprint: 9.8, accel: 2.4, brake: 6, drag: 0.35, steer: 0.48, wheelbase: 1.05, r: 0.6,
            camDist: 5.6, camH: 2.5, seat: 1.44, pose: 'ride', riderY: 0, riderZ: 0.13, hop: 1.8, upright: true,
            bbZ: 0.2, bbDrop: 0.8, crankR: 0.13, grip: [0.25, 1.64, 0.3] },
  tandem: { max: 11.5, sprint: 14.5, accel: 3.6, brake: 8, drag: 0.35, steer: 0.5, wheelbase: 1.85, r: 0.6,
            camDist: 5.6, camH: 1.9, seat: 0.92, pose: 'ride', riderY: 0, riderZ: 0.38, hop: 2.4, grip: [0.25, 1.02, 0.42] },
  racer:  { max: 13, sprint: 17, accel: 5.6, brake: 10, drag: 0.3, steer: 0.6, wheelbase: 1.0, r: 0.45,
            camDist: 4.8, camH: 1.6, seat: 0.95, pose: 'ride', riderY: 0, riderZ: -0.1, hop: 3.4, grip: [0.2, 0.9, 0.52] },
  bmx:    { max: 9.2, sprint: 12, accel: 6.2, brake: 11, drag: 0.4, steer: 0.82, wheelbase: 0.9, r: 0.42,
            camDist: 4.2, camH: 1.55, seat: 0.74, pose: 'ride', riderY: 0, riderZ: -0.12, hop: 6.4,
            bbZ: 0.26, bbDrop: 0.44, grip: [0.3, 1.0, 0.36] },
  cargo:  { max: 8.6, sprint: 10.8, accel: 3.0, brake: 8, drag: 0.4, steer: 0.5, wheelbase: 1.9, r: 0.7,
            camDist: 5.8, camH: 1.9, seat: 0.92, pose: 'ride', riderY: 0, riderZ: -0.5, hop: 1.4, upright: true, grip: [0.3, 1.08, 0.38] },
  golden: { max: 14, sprint: 18, accel: 6.4, brake: 11, drag: 0.3, steer: 0.64, wheelbase: 1.05, r: 0.45,
            camDist: 4.8, camH: 1.7, seat: 0.92, pose: 'ride', riderY: 0, riderZ: -0.08, hop: 5.2, grip: [0.25, 1.02, 0.42] },
};
/* the bicycle collection: the first ride on each adds it, with a line of history */
const SPECIAL_BIKES = {
  penny:  { name: 'The Penny-Farthing', fact: 'High-wheelers ruled the 1870s: with the pedals fixed to the front wheel, a bigger wheel went further on every turn. Chain-driven "safety" bicycles replaced them in the late 1880s.' },
  tandem: { name: 'The Tandem', fact: 'Two riders, one frame, nearly the same air resistance as one — so on the flat a good tandem outruns either rider alone.' },
  racer:  { name: 'The Racer', fact: 'Past about 25 km/h most of a cyclist\'s effort goes into pushing air aside. Drop handlebars let you fold down and shrink the hole you punch through it.' },
  bmx:    { name: 'The BMX', fact: 'Bicycle motocross began with kids racing on dirt tracks in 1970s California. It became an Olympic sport at Beijing in 2008.' },
  cargo:  { name: 'The Bakfiets', fact: 'Dutch for "box bike". In Dutch cities cargo bikes carry children, shopping and whole house moves.' },
  golden: { name: 'The Chancellor\'s Bicycle', fact: 'Awarded for returning every overdue book on campus. It is extremely fast and slightly ridiculous.' },
};

function buildCartMesh(gl, col) {
  const b = new Builder(2048);
  const paint = mat(0, col, { rough: 0.3, metal: 0.4 });
  const dark = mat(0, [0.04, 0.04, 0.045], { rough: 0.6 });
  const seat = mat(TX.FABRIC, [0.25, 0.25, 0.27], { uv: 'local', tile: 0.4 });
  b.add(BOX, xform([0, 0.45, 0], [0, 0, 0], [1.25, 0.35, 2.5]), paint);            // body
  b.add(BOX, xform([0, 0.72, 0.95], [-0.25, 0, 0], [1.2, 0.35, 0.55]), paint);      // front cowl
  b.add(BOX, xform([0, 0.7, -0.35], [0, 0, 0], [1.1, 0.14, 0.6]), seat);            // seat base
  b.add(BOX, xform([0, 1.0, -0.66], [-0.15, 0, 0], [1.1, 0.5, 0.12]), seat);        // seat back
  b.add(BOX, xform([0, 0.62, -1.0], [0, 0, 0], [1.2, 0.3, 0.5]), dark);             // load bed
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.add(pCyl(14), xform([sx * 0.6, 0.26, sz * 0.82], [0, 0, Math.PI / 2], [0.52, 0.18, 0.52]), dark);
    b.add(BOX, xform([sx * 0.56, 1.45, sz * 0.62], [0, 0, 0], [0.05, 1.5, 0.05]), mat(0, [0.8, 0.8, 0.78], { rough: 0.3, metal: 0.8 }));
  }
  b.add(BOX, xform([0, 2.22, 0], [0, 0, 0], [1.3, 0.06, 1.55]), mat(0, [0.85, 0.85, 0.82], { rough: 0.5 }));   // canopy
  b.add(BOX, xform([0, 1.35, 0.72], [0.35, 0, 0], [1.05, 0.7, 0.02]), mat(0, [0.03, 0.035, 0.04], { rough: 0.05, metal: 0.3 }));  // screen
  b.add(pTorus(0.12, 16, 6), xform([-0.28, 1.02, 0.42], [1.1, 0, 0], [0.34, 0.34, 0.34]), dark);                      // wheel
  b.add(BOX, xform([0, 0.62, 1.26], [0, 0, 0], [0.9, 0.12, 0.02]), mat(0, [1, 0.95, 0.85], { kind: KIND.LAMP, glow: 0.9 }));
  return b.upload(gl);
}

function buildBikeMesh(gl, col, basket, lod) {
  const b = new Builder(1024);
  bicycleMesh(b, col, { basket, lod });
  return b.upload(gl);
}

/* the collectable bicycles, each built around the same origin and facing +z */
function buildSpecialBike(gl, type, lod) {
  const b = new Builder(2048);
  const wheel = (c, R, tube = 0.07, spokes = 10, rim = PM.rubber) => {
    b.add(pTorus(tube, lod ? 14 : 32, lod ? 4 : 6), xform(c, [0, 0, Math.PI / 2], [R * 2, R * 2, R * 2]), rim);
    if (!lod) for (let s = 0; s < spokes; s++) { const a = (s / spokes) * TAU; strut(b, c, [c[0], c[1] + Math.sin(a) * R * 0.92, c[2] + Math.cos(a) * R * 0.92], 0.01, PM.steel); }
    b.add(pCyl(10), xform(c, [0, 0, Math.PI / 2], [0.07, 0.09, 0.07]), PM.steel);
  };
  if (type === 'penny') {
    const frame = mat(0, [0.02, 0.02, 0.025], { rough: 0.3, metal: 0.5 });
    const F = [0, 0.66, 0.35], Rr = [0, 0.2, -0.78];
    wheel(F, 0.66, 0.04, 24); wheel(Rr, 0.2, 0.09, 8);
    // the backbone curves down from the head to the little wheel
    let prev = [0, 1.38, 0.3];
    for (let i = 1; i <= 8; i++) {
      const t = i / 8, a = t * Math.PI / 2;
      const p = [0, lerp(1.38, 0.28, Math.sin(a)), lerp(0.3, -0.74, 1 - Math.cos(a))];
      strut(b, prev, p, 0.05, frame); prev = p;
    }
    strut(b, [0, 1.38, 0.3], F, 0.05, frame);
    b.add(BOX, xform([0, 1.58, 0.36], [0, 0, 0], [0.62, 0.03, 0.03]), frame);
    strut(b, [0, 1.38, 0.3], [0, 1.58, 0.36], 0.04, frame);
    b.add(BOX, xform([0, 1.45, 0.12], [0.1, 0, 0], [0.14, 0.05, 0.26]), mat(TX.WOOD, [0.3, 0.18, 0.1], { uv: 'local', tile: 0.3, rough: 0.6 }));
    for (const sx of [-1, 1]) b.add(BOX, xform([sx * 0.12, 0.66, 0.35], [0, 0, 0], [0.08, 0.03, 0.1]), PM.iron);
  } else if (type === 'bmx') {
    const frame = mat(0, [0.9, 0.12, 0.08], { rough: 0.35, metal: 0.5 });
    const A = [0, 0.26, -0.44], Fw = [0, 0.26, 0.44];
    wheel(A, 0.26, 0.13, 12, mat(0, [0.03, 0.03, 0.03], { rough: 0.9 })); wheel(Fw, 0.26, 0.13, 12, mat(0, [0.03, 0.03, 0.03], { rough: 0.9 }));
    const bb = [0, 0.3, 0], seat = [0, 0.66, -0.2], head = [0, 0.72, 0.3], bar = [0, 1.0, 0.24];
    for (const [p, q] of [[bb, seat], [bb, head], [seat, head], [bb, A], [seat, A], [head, Fw], [head, bar]]) strut(b, p, q, 0.05, frame);
    b.add(BOX, xform(bar, [0, 0, 0], [0.66, 0.04, 0.04]), PM.iron);
    b.add(BOX, xform([0, 0.9, 0.26], [0, 0, 0], [0.4, 0.03, 0.03]), PM.iron);
    b.add(BOX, xform([0, 0.7, -0.22], [0.1, 0, 0], [0.12, 0.05, 0.24]), PM.iron);
    for (const sx of [-1, 1]) b.add(pCyl(8), xform([sx * 0.1, 0.26, 0.44], [0, 0, Math.PI / 2], [0.05, 0.12, 0.05]), PM.steel);   // pegs
  } else if (type === 'tandem') {
    const frame = mat(0, [0.1, 0.35, 0.3], { rough: 0.35, metal: 0.5 });
    const A = [0, 0.34, -0.95], Fw = [0, 0.34, 0.95];
    wheel(A, 0.34); wheel(Fw, 0.34);
    const bb1 = [0, 0.3, 0.46], bb2 = [0, 0.3, -0.42], s1 = [0, 0.86, 0.32], s2 = [0, 0.86, -0.56], head = [0, 0.84, 0.82], bar = [0, 1.02, 0.8];
    for (const [p, q] of [[bb1, s1], [bb2, s2], [bb1, head], [s1, head], [s1, s2], [bb1, bb2], [bb2, A], [s2, A], [head, Fw], [head, bar]]) strut(b, p, q, 0.045, frame);
    b.add(BOX, xform(bar, [0, 0, 0], [0.56, 0.035, 0.035]), PM.iron);
    b.add(BOX, xform([0, 1.0, 0.28], [0, 0, 0], [0.46, 0.035, 0.035]), PM.iron);   // the stoker's bar
    for (const s of [s1, s2]) b.add(BOX, xform([0, 0.9, s[2] - 0.02], [0.1, 0, 0], [0.13, 0.05, 0.26]), PM.iron);
  } else if (type === 'cargo') {
    const frame = mat(0, [0.12, 0.14, 0.13], { rough: 0.4, metal: 0.4 });
    const A = [0, 0.34, -0.9], Fw = [0, 0.24, 1.0];
    wheel(A, 0.34); wheel(Fw, 0.24);
    const bb = [0, 0.3, -0.45], seat = [0, 0.86, -0.62], head = [0, 0.9, 0.2];
    for (const [p, q] of [[bb, seat], [bb, head], [seat, head], [bb, A], [seat, A], [head, [0, 0.3, 0.3]], [[0, 0.3, 0.3], Fw], [head, [0, 1.1, 0.08]]]) strut(b, p, q, 0.05, frame);
    b.add(BOX, xform([0, 1.1, 0.08], [0, 0, 0], [0.62, 0.035, 0.035]), PM.iron);
    b.add(BOX, xform([0, 0.9, -0.64], [0.1, 0, 0], [0.13, 0.05, 0.26]), PM.iron);
    // the wooden box on the front
    const wood = mat(TX.WOOD, [0.6, 0.42, 0.25], { uv: 'local', tile: 0.5, rough: 0.6 });
    b.add(BOX, xform([0, 0.42, 0.62], [0, 0, 0], [0.62, 0.04, 0.8]), wood);
    for (const [x, z, w, d] of [[0.3, 0.62, 0.03, 0.8], [-0.3, 0.62, 0.03, 0.8], [0, 0.22, 0.62, 0.03], [0, 1.02, 0.62, 0.03]]) b.add(BOX, xform([x, 0.65, z], [0, 0, 0], [w, 0.46, d]), wood);
  } else {
    // racer and golden: a lean diamond frame with drop bars
    const gold = type === 'golden';
    const frame = gold ? mat(0, [1.0, 0.72, 0.28], { rough: 0.22, metal: 1, glow: 0.12 }) : mat(0, [0.95, 0.78, 0.1], { rough: 0.3, metal: 0.5 });
    const A = [0, 0.35, -0.5], Fw = [0, 0.35, 0.5];
    wheel(A, 0.35, gold ? 0.06 : 0.035, 14); wheel(Fw, 0.35, gold ? 0.06 : 0.035, 14);
    const bb = [0, 0.3, 0], seat = [0, 0.9, -0.18], head = [0, 0.86, 0.4], bar = [0, 0.94, 0.46];
    for (const [p, q] of [[bb, seat], [bb, head], [seat, head], [bb, A], [seat, A], [head, Fw], [head, bar]]) strut(b, p, q, gold ? 0.05 : 0.035, frame);
    b.add(BOX, xform(bar, [0, 0, 0], [0.42, 0.03, 0.03]), PM.iron);
    for (const sx of [-1, 1]) {
      strut(b, [sx * 0.2, 0.94, 0.46], [sx * 0.2, 0.86, 0.58], 0.025, PM.iron);
      strut(b, [sx * 0.2, 0.86, 0.58], [sx * 0.2, 0.8, 0.5], 0.025, PM.iron);
    }
    b.add(BOX, xform([0, 0.94, -0.2], [0.08, 0, 0], [0.1, 0.04, 0.26]), PM.iron);
  }
  // pedals and chainring for all of them
  return b.upload(gl);
}

const BIKE_MESHES = {};
class Vehicle {
  constructor(gl, spec, i) {
    this.type = spec.type;
    this.variant = spec.variant || null;           // a collectable bicycle
    this.P = VEH[this.variant || this.type];
    this.x = spec.x; this.z = spec.z; this.yaw = spec.yaw || 0;
    this.y = groundH(this.x, this.z);
    this.speed = 0; this.steer = 0; this.lean = 0; this.crank = 0; this.pitch = 0;
    this.vy = 0; this.air = false; this.airT = 0; this.climb = 0;
    this.hidden = !!spec.hidden;
    this.home = { x: this.x, z: this.z, yaw: this.yaw };
    const cols = [[0.08, 0.1, 0.12], [0.45, 0.06, 0.05], [0.08, 0.22, 0.4], [0.75, 0.74, 0.7], [0.12, 0.3, 0.16]];
    // ordinary bikes share a handful of meshes
    const key = this.variant || (this.type === 'bike' ? 'bike' + (i % 10) : 'cart' + (i % 3));
    this.mesh = BIKE_MESHES[key] || (BIKE_MESHES[key] = this.variant ? buildSpecialBike(gl, this.variant)
      : this.type === 'bike' ? buildBikeMesh(gl, cols[i % cols.length], i % 3 === 0) : buildCartMesh(gl, [[0.1, 0.25, 0.14], [0.6, 0.58, 0.55], [0.12, 0.16, 0.3]][i % 3]));
    // no spokes past thirty metres
    this.lod = this.type !== 'bike' ? this.mesh : BIKE_MESHES[key + 'L'] || (BIKE_MESHES[key + 'L'] = this.variant ? buildSpecialBike(gl, this.variant, true)
      : buildBikeMesh(gl, cols[i % cols.length], i % 3 === 0, true));
    this.model = M4.create();
    Object.assign(this, { camDist: this.P.camDist, camH: this.P.camH, seat: this.P.seat, pose: this.P.pose, riderY: this.P.riderY, riderZ: this.P.riderZ });
    this.updateModel();
  }

  updateModel() {
    const tilt = this.type === 'bike' ? this.lean : 0;
    // lawns and paths sit a few centimetres above the terrain height
    xformTo(this.model, this.x, this.y + 0.06, this.z, this.pitch, this.yaw, -tilt);
  }

  /* one step of driving: input {throttle, brake, steer (-1..1), sprint} */
  drive(inp, dt, game) {
    const P = this.P;
    const fwd = inp.throttle ? 1 : 0, back = inp.brake ? 1 : 0;
    const top = inp.sprint ? P.sprint : P.max;
    if (fwd) this.speed += (this.speed < top ? P.accel : -P.accel * 0.5) * dt;
    if (back) this.speed -= (this.speed > 0.2 ? P.brake : P.accel * 0.6) * dt;
    if (!fwd && !back) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), (P.drag + Math.abs(this.speed) * 0.08) * dt);
    this.speed = clamp(this.speed, -3.5, P.sprint);
    // steering eases in, and tightens less at speed
    const want = inp.steer * P.steer / (1 + Math.abs(this.speed) * 0.06);
    this.steer += (want - this.steer) * (1 - Math.exp(-7 * dt));
    this.yaw += this.speed * Math.tan(this.steer) / P.wheelbase * dt;
    const nx = this.x + Math.sin(this.yaw) * this.speed * dt, nz = this.z + Math.cos(this.yaw) * this.speed * dt;
    // resolve against the world, the way the player does
    const res = game.pushOut(nx, nz, P.r, this.y);
    const hit = Math.hypot(res[0] - nx, res[1] - nz) > 0.02;
    if (hit) {
      if (Math.abs(this.speed) > 6) { game.shake = Math.max(game.shake, Math.min(0.6, Math.abs(this.speed) * 0.05)); Sfx.tone(90, 0.18, 'sawtooth', 0.03, 50); }
      this.speed *= 0.55;
    }
    if (isWalkable(res[0], res[1])) { this.x = res[0]; this.z = res[1]; } else this.speed *= -0.3;
    // the ground, ramps, and time in the air
    const g0 = game.groundAt(this.x, this.z, this.y + 0.6);
    const gy = g0 === -Infinity ? this.y : g0;
    this.landed = null;
    if (this.air) {
      this.vy -= 17 * dt; this.y += this.vy * dt; this.airT += dt;
      if (this.y <= gy) { this.landed = { airT: this.airT, impact: -this.vy }; this.y = gy; this.air = false; this.vy = 0; }
    } else if (inp.hop && this.P.hop) {
      this.vy = this.P.hop + Math.max(0, this.climb) * 0.5; this.air = true; this.airT = 0; this.launch = null;
    } else if (gy < this.y - 0.2 && Math.abs(this.speed) > 2.5) {
      // the ground falls away under you — off a ramp's lip or a step — and you fly
      this.air = true; this.airT = 0; this.vy = Math.max(0, this.climb);
      this.launch = { x: this.x, z: this.z, y: this.y, ramp: this.onRamp || null, speed: this.speed };
    } else {
      // track the ground exactly going up (a ramp's slope is your launch), ease down small steps
      const ny = gy > this.y ? gy : this.y + (gy - this.y) * (1 - Math.exp(-18 * dt));
      this.climb = (ny - this.y) / Math.max(dt, 1e-3);
      this.y = ny;
    }
    this.onRamp = game.rampUnder ? game.rampUnder(this.x, this.z) : null;
    // a bike leans into the corner; the cranks turn with the wheels
    const lat = this.speed * this.speed * Math.tan(this.steer) / P.wheelbase;
    this.lean += (clamp(Math.atan(lat / 9.8), -0.5, 0.5) - this.lean) * (1 - Math.exp(-6 * dt));
    this.crank += (fwd ? Math.max(this.speed, 2) : this.speed * 0.3) * dt / 0.34 * 0.5;
    // pitch with the slope under the wheels, or with the flight path in the air
    let wantPitch;
    if (this.air) wantPitch = -Math.atan2(this.vy, Math.max(3, Math.abs(this.speed))) * 0.8;
    else {
      const gA = game.groundAt(this.x + Math.sin(this.yaw) * 0.8, this.z + Math.cos(this.yaw) * 0.8, this.y + 0.9);
      const gB = game.groundAt(this.x - Math.sin(this.yaw) * 0.8, this.z - Math.cos(this.yaw) * 0.8, this.y + 0.9);
      const ahead = gA === -Infinity ? this.y : gA, behind = gB === -Infinity ? this.y : gB;
      wantPitch = -Math.atan2(ahead - behind, 1.6);
    }
    this.pitch += (wantPitch - this.pitch) * (1 - Math.exp(-8 * dt));
    this.updateModel();
  }

  /* where the rider gets off: beside the left of the vehicle */
  dismountPoint() {
    const s = this.type === 'bike' ? 0.9 : 1.4;
    return [this.x + Math.cos(this.yaw) * s, this.z - Math.sin(this.yaw) * s];
  }
}

/* ---------- traffic on the town street and the east road ---------- */
const LANES = [
  { pts: [[-WORLD_HALF - 30, 207.4], [WORLD_HALF + 30, 207.4]] },                  // eastbound
  { pts: [[WORLD_HALF + 30, 202.6], [-WORLD_HALF - 30, 202.6]] },                  // westbound
  { pts: [[264.2, 202], [264.2, -WORLD_HALF - 30]] },                             // northbound on the east road
  { pts: [[259.8, -WORLD_HALF - 30], [259.8, 200]] },                             // southbound
];

class Traffic {
  constructor(gl) {
    this.cars = [];
    const cols = [[0.55, 0.06, 0.05], [0.1, 0.16, 0.32], [0.72, 0.72, 0.7], [0.06, 0.06, 0.07], [0.25, 0.36, 0.28], [0.5, 0.46, 0.4], [0.62, 0.5, 0.12]];
    this.meshes = cols.map((c, i) => {
      const b = new Builder(1024);
      carMesh(b, c, i === 6 ? { len: 5.2, wid: 2.0, hgt: 2.1 } : i % 3 === 0 ? { len: 4.5 } : {});
      return b.upload(gl);
    });
    const rnd = mulberry(99);
    let k = 0;
    LANES.forEach((L, li) => {
      const n = li < 2 ? 5 : 3;
      for (let i = 0; i < n; i++) {
        this.cars.push({ lane: li, s: (i / n) * this.laneLen(li) + rnd() * 20, speed: 9 + rnd() * 3, v: 0, mesh: this.meshes[k++ % this.meshes.length], model: M4.create(), x: 0, z: 0, yaw: 0 });
      }
    });
  }
  laneLen(li) { const p = LANES[li].pts; return Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]); }

  update(dt, game) {
    for (const c of this.cars) {
      const [a, b] = LANES[c.lane].pts, L = this.laneLen(c.lane);
      const dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
      // brake for anyone (you, a vehicle you ride, a student) a few metres ahead in the lane
      let want = c.speed;
      const ax = c.x + dx * 6, az = c.z + dz * 6;
      const blocked = (x, z) => Math.hypot(x - ax, z - az) < 4.2;
      if (blocked(game.cam.x, game.cam.z) || (game.vehicle && blocked(game.vehicle.x, game.vehicle.z))) want = 0;
      for (const o of this.cars) if (o !== c && o.lane === c.lane) {
        const ahead = ((o.s - c.s) % L + L) % L;
        if (ahead > 0 && ahead < 11) want = Math.min(want, o.v * 0.9);
      }
      c.v += (want - c.v) * (1 - Math.exp(-(want < c.v ? 4 : 1.2) * dt));
      c.s = (c.s + c.v * dt) % L;
      c.x = a[0] + dx * c.s; c.z = a[1] + dz * c.s; c.yaw = Math.atan2(dx, dz);
      M4.trs(c.model, c.x, 0.05, c.z, c.yaw, 1, 1, 1);
      // a car that meets you at speed knocks you back, gently
      const pd = Math.hypot(game.cam.x - c.x, game.cam.z - c.z);
      if (!game.vehicle && pd < 1.9 && c.v > 2) {
        game.vel.x += dx * c.v * 0.6; game.vel.z += dz * c.v * 0.6; game.vy = 4; game.grounded = false;
        game.shake = 0.5; Sfx.tone(120, 0.2, 'square', 0.03, 60);
        HUD.toast('WATCH THE ROAD', 'Cars stop for pedestrians — mostly.');
      }
    }
  }

  draw(R, cam) {
    for (const c of this.cars) {
      if ((c.x - cam.x) ** 2 + (c.z - cam.z) ** 2 > 260 * 260) continue;
      R.drawMesh(c.mesh, c.model);
    }
  }
}
