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
          camDist: 4.6, camH: 1.7, seat: 0.92, pose: 'ride', riderY: 0.0, riderZ: -0.08 },
  cart: { max: 11.5, sprint: 14, accel: 5.0, brake: 10, drag: 0.4, steer: 0.55, wheelbase: 1.9, r: 1.0,
          camDist: 6.2, camH: 2.2, seat: 0.62, pose: 'drive', riderY: 0.05, riderZ: 0.05 },
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

function buildBikeMesh(gl, col, basket) {
  const b = new Builder(1024);
  bicycleMesh(b, col, { basket });
  return b.upload(gl);
}

class Vehicle {
  constructor(gl, spec, i) {
    this.type = spec.type;
    this.P = VEH[this.type];
    this.x = spec.x; this.z = spec.z; this.yaw = spec.yaw || 0;
    this.y = groundH(this.x, this.z);
    this.speed = 0; this.steer = 0; this.lean = 0; this.crank = 0; this.pitch = 0;
    this.home = { x: this.x, z: this.z, yaw: this.yaw };
    const cols = [[0.08, 0.1, 0.12], [0.45, 0.06, 0.05], [0.08, 0.22, 0.4], [0.75, 0.74, 0.7], [0.12, 0.3, 0.16]];
    this.mesh = this.type === 'bike' ? buildBikeMesh(gl, cols[i % cols.length], i % 3 === 0) : buildCartMesh(gl, [[0.1, 0.25, 0.14], [0.6, 0.58, 0.55], [0.12, 0.16, 0.3]][i % 3]);
    this.model = M4.create();
    Object.assign(this, { camDist: this.P.camDist, camH: this.P.camH, seat: this.P.seat, pose: this.P.pose, riderY: this.P.riderY, riderZ: this.P.riderZ });
    this.updateModel();
  }

  updateModel() {
    const tilt = this.type === 'bike' ? this.lean : 0;
    xformTo(this.model, this.x, this.y, this.z, this.pitch, this.yaw, -tilt);
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
    const gy = game.groundAt(this.x, this.z, this.y + 0.6);
    this.y += ((gy === -Infinity ? this.y : gy) - this.y) * (1 - Math.exp(-14 * dt));
    // a bike leans into the corner; the cranks turn with the wheels
    const lat = this.speed * this.speed * Math.tan(this.steer) / P.wheelbase;
    this.lean += (clamp(Math.atan(lat / 9.8), -0.5, 0.5) - this.lean) * (1 - Math.exp(-6 * dt));
    this.crank += (fwd ? Math.max(this.speed, 2) : this.speed * 0.3) * dt / 0.34 * 0.5;
    // pitch with the slope under the wheels
    const ahead = groundH(this.x + Math.sin(this.yaw) * 0.8, this.z + Math.cos(this.yaw) * 0.8), behind = groundH(this.x - Math.sin(this.yaw) * 0.8, this.z - Math.cos(this.yaw) * 0.8);
    this.pitch += (-Math.atan2(ahead - behind, 1.6) - this.pitch) * (1 - Math.exp(-8 * dt));
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
