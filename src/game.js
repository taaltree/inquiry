/* ============================================================
   game.js — player, input, interaction, main loop
   ============================================================ */

const SAVE_KEY = 'inquiry.save.v1';
const PREF_KEY = 'inquiry.prefs.v1';

/* one colour per question type — bolts, slot chrome and taught-student sparks */
const QHEX = ['#7fd4ff', '#8affc8', '#ffe37a', '#ffab6a', '#c9a6ff'];
const QCOLOURS = [
  hex2rgb('#7fd4ff'),   // PROBE
  hex2rgb('#8affc8'),   // METHOD
  hex2rgb('#ffe37a'),   // EVIDENCE
  hex2rgb('#ffab6a'),   // IMPACT
  hex2rgb('#c9a6ff'),   // DOUBT
];
const EYE = 1.68;
const LEVELS = [
  { id: 'colloquium', n: 1, name: 'THE COLLOQUIUM', sub: 'A university campus, on foot and on two wheels',
    blurb: 'Twenty-four scientists across five departments, a Great Court, a river and a town. Walk or ride, interview, teach, and secure all five.' },
  { id: 'summit', n: 2, name: 'THE SUMMIT', sub: 'A mountain conference, on a snowboard',
    blurb: 'A residential meeting at altitude. Six professors hold sessions down the run, grad students ride it with you, and the feed is airborne. Ends at the poster session.' },
];
const PLAYER_R = 0.42;
const STEP = 0.62;          // how high a ledge you can simply walk up
const GRAV = 22;
const JUMP_V = 8.2;

const ENV = {
  // the station's overhead array: a hard, cool key from high on the right,
  // strong enough to throw real shadows across the platforms
  sunDir: (() => { const v = [0.42, 0.74, 0.52]; const L = Math.hypot(...v); return v.map((x) => x / L); })(),
  sunCol: hex2rgb('#c9dcff').map((c) => c * 0.92),
  sunDisc: hex2rgb('#c9dcff').map((c) => c * 0.35),
  ambSky: hex2rgb('#2b3d66').map((c) => c * 0.78),
  ambGround: hex2rgb('#1a1528').map((c) => c * 1.15),
  fog: hex2rgb('#02030a'),
  fogDensity: 0.0034,
  skyTop: hex2rgb('#010206'),
  skyHorizon: hex2rgb('#060911'),
  shadows: true, grid: true, detail: 0.8, stars: 1,
  post: { ao: 0.85, rays: 0.30, exposure: 1.10, bloomThreshold: 1.0 },
};

const ENV_SUMMIT = {
  // low winter sun, long shadows down the run
  sunDir: (() => { const v = [-0.48, 0.34, 0.81]; const L = Math.hypot(...v); return v.map((x) => x / L); })(),
  sunCol: hex2rgb('#ffd9ae').map((c) => c * 1.55 * Math.PI),
  sunDisc: hex2rgb('#fff1d6').map((c) => c * 1.0),
  ambSky: hex2rgb('#7fa6d8').map((c) => c * 0.62),
  ambGround: hex2rgb('#9fb8d8').map((c) => c * 0.58),   // light bouncing off snow
  fog: hex2rgb('#8ba6c8'),
  fogDensity: 0.0021,
  skyTop: hex2rgb('#132747'),
  skyHorizon: hex2rgb('#c98f6b'),
  shadows: true, grid: false, detail: 0.5, stars: 0, night: 0, cloud: 0.35,
  cloudLit: [1.0, 0.95, 0.9], cloudShade: [0.55, 0.62, 0.75],
  post: { ao: 0.70, rays: 0.45, exposure: 0.72, bloomThreshold: 1.3, grade: 1 },
};

/* --- tiny UI synth: short tones, no music, no external assets --- */
const Sfx = {
  ctx: null,
  on: true,
  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.on = false; }
  },
  tone(freq, dur, type = 'sine', gain = 0.05, slideTo) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  },
  blip()    { this.tone(880, 0.07, 'triangle', 0.028); },
  select()  { this.tone(520, 0.10, 'sine', 0.035, 780); },
  insight() { this.tone(440, 0.30, 'sine', 0.045, 1320); this.tone(660, 0.34, 'triangle', 0.020, 1760); },
  complete(){ [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.34, 'sine', 0.038), i * 90)); },
  deny()    { this.tone(200, 0.16, 'sawtooth', 0.024, 130); },
  open()    { this.tone(300, 0.22, 'sine', 0.035, 600); },
};

class Game {
  constructor() {
    this.canvas = document.getElementById('gl');
    try {
      this.R = new Renderer(this.canvas);
    } catch (e) {
      this.fail(e.message || 'WebGL 2 is required and could not be initialised.');
      throw e;
    }
    const gl = this.R.gl;
    this.gl = gl;

    /* ---- data ---- */
    this.roster = ROSTER;
    this.byId = {};
    for (const p of this.roster) this.byId[p.id] = p;

    /* ---- state ---- */
    this.progress = {};              // id -> [answered keys]
    this.connectionsFound = [];      // indices into CONNECTIONS
    this.vaultAnswers = {};          // district -> { qIndex: optionIndex }
    this.load();

    /* ---- worlds (level 2 is built the first time it is entered) ---- */
    this.level = 'colloquium';
    this.world = buildWorld(gl, this.roster);
    this.colliders = buildColliders(this.world);
    this.worlds = { colloquium: { world: this.world, colliders: this.colliders } };
    this.districtById = {};
    for (const d of DISTRICTS) this.districtById[d.id] = d;
    // level 2 is one venue rather than five districts, but the station drawing
    // code looks its colours up the same way
    this.districtById.summit = {
      id: 'summit', name: 'THE SUMMIT', sub: 'Mountain conference',
      accent: '#8fd0ff', accent2: '#d8ecff',
      rgb: hex2rgb('#8fd0ff'), rgb2: hex2rgb('#d8ecff'),
      cx: 0, cz: -MTN.LEN / 2, angle: 0,
    };

    /* ---- actors ---- */
    for (const s of this.world.stations) {
      const p = this.byId[s.id];
      const d = this.districtById[s.district];
      s.person = p;
      s.ch = buildCharacter(gl, scientistLook(p));
      s.bones = newBones();
      s.faceYaw = s.yaw;
      s.plate = makeNameplate(gl, p, d.accent, d.accent2);
      s.model = M4.create();
      s.phase = Math.random() * TAU;
    }
    for (const d of DISTRICTS) {
      d.signTex = makeTextPlate(gl, [
        { text: d.name, size: 60, color: '#ffffff', glow: d.accent, spaced: true },
        { text: d.sub.toUpperCase(), size: 26, color: d.accent2, weight: 400 },
      ], { top: 78 });
    }
    for (const v of this.world.vaults) {
      const d = this.districtById[v.district];
      v.tex = makeTextPlate(gl, [
        { text: 'INSIGHT VAULT', size: 44, color: '#ffffff', glow: d.accent, spaced: true, mono: true },
        { text: (VAULTS[v.district] || {}).title || '', size: 26, color: d.accent2, weight: 400 },
      ], { top: 70, h: 180 });
    }
    this.atriumTex = makeTextPlate(gl, [
      { text: 'SYNTHESIS TERMINAL', size: 46, color: '#ffffff', glow: '#ffd98a', spaced: true, mono: true },
      { text: 'CONNECT TWO MINDS', size: 24, color: '#ffd98a', weight: 400 },
    ], { top: 72, h: 180 });

    this.life = new Life(gl, this, 'walk');
    this.lives = { colloquium: this.life };

    this.codex = { body: buildCodex(gl), sigil: buildCodexSigil(gl), page: buildCodexPage(gl), tabs: buildCodexTabs(gl) };
    this.pageTurn = 0; this._pt = 0;
    this.rideModel = buildRideModel(gl);
    this.particles = new Particles(2400);
    this.pulseMesh = buildPulseRing(gl);
    this.beaconMesh = buildBeacon(gl);
    this.markerMesh = buildMissionMarker(gl);
    this.markMesh = buildCompleteMark(gl);

    /* ---- player ---- */
    this.cam = { x: 12.5, y: EYE, z: 12.5, yaw: Math.PI / 4, pitch: 0.10, fov: 1.31 };
    this.vel = { x: 0, z: 0 };
    this.footY = 0; this.vy = 0; this.grounded = true; this.landT = 0;
    this.lastSafe = { x: 12.5, z: 12.5, y: 0 };
    this.zip = null;                    // active zipline ride
    this.bob = 0; this.bobAmt = 0; this.sway = 0;
    this.keys = {};
    this.look = {
      locked: false, unavailable: false, triedLock: false,
      down: false, moved: 0, t0: 0, lastX: 0, lastY: 0,
      sens: 1.0, invert: false,
    };
    this.loadPrefs();
    this.mode = 'title';             // title | play | talk | screen
    this.target = null;
    this.talking = null;
    this.selSlot = 0;
    this.pulses = [];
    this.fx = { pulse: 0, pulseHue: 0, fade: 0, aberration: 1, bloom: 0.44, dim: 1 };
    this.time = 0;
    this.hour = 17.35; this.clockRun = true;     // late afternoon: long light across the courts
    this.camAnim = null;
    this.visited = new Set();
    this.noise = 0; this.shake = 0; this.fireCd = 0;
    this.feedCleared = this.feedCleared || {};   // district id -> drones dismantled there
    this.secured = this.secured || {};           // district id -> true
    this.taught = this.taught || 0;
    this.rescued = this.rescued || 0;
    this.debunked = this.debunked || 0;
    this.tmpM = M4.create(); this.tmpM2 = M4.create();
    this.found = this.found || {};            // marginalia collected, by id
    this.challenged = this.challenged || {};  // the scientists' own questions, answered
    this.bossDone = this.bossDone || {};      // districts whose Peer Review has been passed
    this.citations = this.citations || 0; this.citeCd = 0;
    this.challenge = null; this.pendingChallenge = null;
    this.pageMark = buildPageMark(gl);
    this.pickups = [];

    /* third person: `cam` stays the player's own eye (gameplay); `view` is the
       orbiting camera that actually renders */
    this.camMode = 'third';
    this.view = { x: 0, y: 2, z: 0, yaw: 0, pitch: 0, fov: 1.15, roll: 0, near: 0.2 };
    this.viewInit = false;
    this.bodyYaw = 0;
    this.avatar = buildCharacter(gl, Object.assign(studentLook(4077), {
      H: 1.76, build: 1.02, top: 'jacket', topCol: '#2e4058', bottom: 'jeans', bottomCol: '#273047',
      backpack: '#6a4526', hair: 'short', hairCol: '#3a2a1c', skin: '#d6a47e', scarf: '#7a1f24', glasses: false, beard: false }));
    this.avatarBones = newBones();
    this.avatarM = M4.create();
    this.anim = { phase: 0, speed: 0, aim: 0, air: 0 };
    this.vehicles = (this.world.vehicles || []).map((v, i) => new Vehicle(gl, v, i));
    this.traffic = new Traffic(gl);
    this.vehicle = null;
    this.lastLook = 0;
    // a few birds wheeling over the court
    this.birdMesh = (() => {
      const b = new Builder(64);
      const M = mat(0, [0.03, 0.03, 0.035], { rough: 0.8 });
      b.add(BOX, xform([0, 0, 0], [0, 0, 0], [0.09, 0.07, 0.3]), M);
      b.add(BOX, xform([-0.22, 0.02, 0.02], [0, 0, 0.25], [0.42, 0.015, 0.14]), M);
      b.add(BOX, xform([0.22, 0.02, 0.02], [0, 0, -0.25], [0.42, 0.015, 0.14]), M);
      return b.upload(gl);
    })();
    this.birds = Array.from({ length: 14 }, (_, i) => ({ a: (i / 14) * TAU, r: 30 + (i % 5) * 9, h: 34 + (i % 4) * 5, sp: 0.09 + (i % 3) * 0.02, ph: i * 1.7, cx: (i % 2 ? -20 : 25), cz: (i % 3 ? -10 : 30) }));
    this.aimHeld = false; this.aimTimer = 0;

    this.nav = new NavGraph(this.world);
    this.route = null; this.navTarget = null; this.userWaypoint = null; this.navTick = 99;
    HUD.init(this);
    HUD.addCompassDistricts(DISTRICTS);
    this.bindInput();
    this.refreshStats();

    window.addEventListener('resize', () => this.R.resize());
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  /* ---------- level switching ---------- */
  buildSummit() {
    if (this.worlds.summit) return this.worlds.summit;
    const gl = this.gl;
    const w = buildMountain(gl, this.roster);
    for (const s of w.stations) {
      const p = this.byId[s.id];
      s.person = p;
      s.ch = buildCharacter(gl, scientistLook(p));
      s.bones = newBones();
      s.faceYaw = s.yaw;
      s.plate = makeNameplate(gl, p, '#7fd4ff', '#cfe9ff');
      s.model = M4.create();
      s.phase = Math.random() * TAU;
    }
    const entry = { world: w, colliders: [] };
    this.worlds.summit = entry;
    this.lives.summit = new Life(gl, this, 'ride');
    return entry;
  }

  enterLevel(id) {
    this.level = id;
    if (id === 'summit') {
      const e = this.buildSummit();
      this.world = e.world; this.colliders = e.colliders;
      this.life = this.lives.summit;
      this.ride = { x: 0, y: mtnHeight(0, 8) + 0.1, z: 8, yaw: 0, speed: 0,
                    vy: 0, air: false, lean: 0, jumpCd: 0, landT: 0 };
      this.cam.fov = 1.34;
      this.summitReached = this.summitReached || false;
    } else {
      const e = this.worlds.colloquium;
      this.world = e.world; this.colliders = e.colliders;
      if (this.vehicle) this.dismount(true);
      this.life = this.lives.colloquium;
      const sp = this.world.spawn || { x: 0, z: 30, yaw: 0 };
      this.cam.x = sp.x; this.cam.z = sp.z;
      this.footY = groundH(sp.x, sp.z); this.cam.y = this.footY + EYE;
      this.vy = 0; this.grounded = true; this.zip = null;
      this.lastSafe = { x: sp.x, z: sp.z, y: this.footY };
      this.cam.yaw = sp.yaw; this.cam.pitch = 0.04; this.cam.fov = 1.15;
      this.cam.roll = 0; this.rideRoll = 0;
    }
    this.noise = 0; this.target = null; this.talking = null; this.camAnim = null;
    this.buildPickups();
    HUD.setLevel(this);
  }

  /* ================= marginalia ================= */
  /* each district's notes go to that district's lecterns, best sites first */
  buildPickups() {
    this.pickups = [];
    const groups = {};
    for (const s of (this.world.spots || [])) (groups[s.district] = groups[s.district] || []).push(s);
    for (const dId in groups) {
      const items = MARGINALIA.filter((m) => m.district === dId);
      groups[dId].forEach((s, i) => { if (items[i]) this.pickups.push({ ...s, item: items[i] }); });
    }
  }

  updatePickups(dt) {
    const c = this.cam;
    const reach = this.level === 'summit' ? 3.4 : 1.7;
    for (const p of this.pickups) {
      if (this.found[p.item.id]) continue;
      const dy = this.level === 'summit' ? 0 : this.footY - (p.y - 1.45);
      if (Math.abs(dy) < 1.6 && (c.x - p.x) ** 2 + (c.z - p.z) ** 2 < reach * reach) this.collect(p);
    }
    // a slow sparkle at unfound notes so they read as pickups from a distance
    this._spT = (this._spT || 0) + dt;
    if (this._spT > 0.4) {
      this._spT = 0;
      for (const p of this.pickups) {
        if (this.found[p.item.id]) continue;
        if ((c.x - p.x) ** 2 + (c.z - p.z) ** 2 > 80 * 80) continue;
        this.particles.burst(p.x, p.y + 0.15, p.z, 2, { col: [1, 0.93, 0.72], speed: 0.5, life: 1.3, size: 0.09, grav: 0.5, drag: 1.0, alpha: 0.85 });
      }
    }
  }

  collect(p) {
    this.found[p.item.id] = true;
    this.save();
    const owner = this.roster.find((r) => r.id === p.item.owner);
    HUD.marginaliaCard(p.item, owner);
    this.particles.burst(p.x, p.y, p.z, 44, { cols: [[1, 0.95, 0.75], [1, 1, 1]], speed: 3.2, life: 0.9, size: 0.15, grav: -1, drag: 2 });
    Sfx.tone(880, 0.14, 'sine', 0.03, 1320);
    this.fx.pulse = Math.max(this.fx.pulse, 0.25);
    HUD.log(`Marginalia: ${p.item.title} — ${Object.keys(this.found).length} of ${MARGINALIA.length}.`);
    this.refreshStats();
  }

  fail(msg) {
    document.getElementById('crash-msg').textContent = msg;
    document.getElementById('crash').classList.add('on');
    document.getElementById('title').classList.remove('on');
  }

  /* ================= persistence ================= */
  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 1, progress: this.progress, conns: this.connectionsFound, vaults: this.vaultAnswers,
        taught: this.taught || 0, rescued: this.rescued || 0, debunked: this.debunked || 0,
        feed: this.feedCleared, secured: this.secured, found: this.found || {},
        challenged: this.challenged || {}, bossDone: this.bossDone || {},
        citations: this.citations || 0,
      }));
    } catch (e) { /* private browsing — play on without saving */ }
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s && s.v === 1) {
        this.progress = s.progress || {};
        this.connectionsFound = s.conns || [];
        this.vaultAnswers = s.vaults || {};
        this.feedCleared = s.feed || {};
        this.secured = s.secured || {};
        this.taught = s.taught || 0;
        this.rescued = s.rescued || 0;
        this.debunked = s.debunked || 0;
        this.found = s.found || {};
        this.challenged = s.challenged || {};
        this.bossDone = s.bossDone || {};
        this.citations = s.citations || 0;
      }
    } catch (e) { /* ignore corrupt saves */ }
  }

  resetSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    location.reload();
  }

  loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      if (typeof p.sens === 'number') this.look.sens = clamp(p.sens, 0.25, 3);
      if (typeof p.invert === 'boolean') this.look.invert = p.invert;
    } catch (e) { /* defaults are fine */ }
  }

  savePrefs() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ sens: this.look.sens, invert: this.look.invert }));
    } catch (e) { /* ignore */ }
  }

  /* ================= input =================
     Pointer lock is unavailable in a sandboxed frame, so it is treated as a
     bonus rather than a requirement: the game is fully playable with
     drag-to-look, and switches to true mouselook the moment lock succeeds. */
  bindInput() {
    const cv = this.canvas;
    const L = this.look;

    /* ---- pointer lock, opportunistically ---- */
    document.addEventListener('pointerlockchange', () => {
      L.locked = document.pointerLockElement === cv;
      HUD.controlMode(L.locked ? 'lock' : (L.unavailable ? 'drag' : 'idle'));
    });
    document.addEventListener('pointerlockerror', () => {
      L.unavailable = true;
      HUD.controlMode('drag');
    });

    /* ---- look: drag when unlocked, raw delta when locked ---- */
    cv.addEventListener('pointerdown', (e) => {
      if (this.mode === 'title' || this.mode === 'intercept' || this.anyScreenOpen()) return;
      if (e.button === 2) { this.aimHeld = true; return; }   // hold to aim over the shoulder
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
      L.down = true;
      L.moved = 0;
      L.t0 = performance.now();
      L.lastX = e.clientX; L.lastY = e.clientY;
      if (this.mode === 'talk') return;
      if (L.locked) this.fire();                        // true FPS: fire on press
    });

    const applyLook = (dx, dy, sens) => {
      this.lastLook = performance.now();
      this.cam.yaw -= dx * sens;
      const dp = dy * sens * (L.invert ? -1 : 1);
      this.cam.pitch = clamp(this.cam.pitch - dp, -1.35, 1.35);
    };

    document.addEventListener('pointermove', (e) => {
      if (this.mode === 'talk' || this.mode === 'intercept' || this.anyScreenOpen()) return;
      if (L.locked) {
        applyLook(e.movementX, e.movementY, 0.0022 * L.sens);
      } else if (L.down) {
        const dx = e.clientX - L.lastX, dy = e.clientY - L.lastY;
        L.lastX = e.clientX; L.lastY = e.clientY;
        L.moved += Math.abs(dx) + Math.abs(dy);
        applyLook(dx, dy, 0.0044 * L.sens);
      }
    });

    const endPointer = (e) => {
      if (!L.down) return;
      L.down = false;
      try { cv.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
      if (this.mode === 'talk') { HUD.skipType(); return; }
      if (this.anyScreenOpen()) return;
      const tap = L.moved < 7 && performance.now() - L.t0 < 400;
      if (!tap) return;
      if (L.locked) return;                             // already fired on press
      // A tap tries to capture the pointer once; after that it just fires.
      if (!L.unavailable && !L.triedLock) { L.triedLock = true; this.tryLock(); return; }
      this.fire();
    };
    cv.addEventListener('pointerup', endPointer);
    cv.addEventListener('pointercancel', endPointer);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('pointerup', (e) => { if (e.button === 2) this.aimHeld = false; });

    /* ---- keyboard ---- */
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'tab') { e.preventDefault(); this.toggleCodex(); return; }
      if (k === 'm' && document.getElementById('mapscreen').classList.contains('on')) { HUD.screen('mapscreen', false); return; }
      if (k === 'escape') {
        if (this.mode === 'intercept') { e.preventDefault(); if (this.intercept.done) this.closeIntercept(); }
        else if (this.anyScreenOpen()) { e.preventDefault(); this.closeAllScreens(); }
        else if (this.mode === 'talk') this.endInterview();
        else if (this.mode === 'play') { e.preventDefault(); this.togglePause(); }
        return;
      }
      if (this.mode === 'title') { if (k === 'enter') HUD.openLevels(); return; }
      if (this.anyScreenOpen()) return;

      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      this.keys[k] = true;

      if (k >= '1' && k <= '5') {
        e.preventDefault();
        if (this.mode === 'intercept') this.answerIntercept(+k - 1);
        else if (this.mode === 'talk') this.ask(+k - 1);
        else this.selectSlot(+k - 1);
        return;
      }
      if (k === 'e') {
        e.preventDefault();
        if (this.mode === 'talk') this.endInterview();
        else this.interact();
        return;
      }
      if (k === ' ') {
        if (this.mode === 'intercept') { if (this.intercept.done) this.closeIntercept(); }
        else if (this.mode === 'talk') HUD.skipType();
        else if (this.level !== 'summit') this.jump();   // riding reads the key directly
        return;
      }
      if (k === 'f') {
        if (this.mode === 'intercept') { if (this.intercept.done) this.closeIntercept(); }
        else if (this.mode === 'talk') HUD.skipType();
        else this.fire();
        return;
      }
      if (k === 'c') { e.preventDefault(); this.cite(); return; }
      if (k === 'v' && this.level !== 'summit') {
        this.camMode = this.camMode === 'third' ? 'first' : 'third';
        HUD.toast(this.camMode === 'third' ? 'THIRD PERSON' : 'FIRST PERSON', 'V to switch');
        return;
      }
      if (k === 'q') { this.cycleSlot(-1); return; }
      if (k === 'r') { this.cycleSlot(1); return; }
      if (k === 'm') { this.toggleMap(); return; }
    });

    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.look.down = false; this.aimHeld = false; });
    window.addEventListener('wheel', (e) => {
      if (this.mode !== 'play' || this.anyScreenOpen()) return;
      this.cycleSlot(e.deltaY > 0 ? 1 : -1);
    }, { passive: true });
  }

  tryLock() {
    const p = this.canvas.requestPointerLock?.();
    if (p && typeof p.catch === 'function') {
      p.catch(() => { this.look.unavailable = true; HUD.controlMode('drag'); });
    }
    // If lock silently no-ops, the next frame's controlMode call settles the hint.
    setTimeout(() => {
      if (document.pointerLockElement !== this.canvas) {
        this.look.unavailable = true;
        HUD.controlMode('drag');
      }
    }, 350);
  }

  /* camera basis on demand — firing must not depend on a frame having drawn */
  camBasis() {
    const c = this.cam;
    const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    return {
      right: [cy, 0, -sy],
      up: [sy * sp, cp, cy * sp],
      back: [sy * cp, -sp, cy * cp],
    };
  }

  selectSlot(i) {
    if (clamp(i, 0, 4) !== this.selSlot) { this.pageTurn = 1; Sfx.tone(1400, 0.07, 'triangle', 0.010, 700); }
    this.selSlot = clamp(i, 0, 4);
    HUD.showSlots(true, [], this.selSlot, this.ammo());
    Sfx.blip();
  }

  cycleSlot(dir) { this.selectSlot((this.selSlot + dir + 5) % 5); }

  togglePause() {
    const open = document.getElementById('pause').classList.contains('on');
    if (!open && this.mode !== 'play') return;
    if (!this._pauseWired) {
      this._pauseWired = true;
      document.getElementById('btn-resume').addEventListener('click', () => HUD.screen('pause', false));
      document.getElementById('btn-pause-levels').addEventListener('click', () => { HUD.screen('pause', false); HUD.openLevels(); });
      document.getElementById('btn-pause-codex').addEventListener('click', () => { HUD.screen('pause', false); HUD.openCodex(); });
    }
    HUD.screen('pause', !open);
    for (const k in this.keys) this.keys[k] = false;
  }

  anyScreenOpen() {
    return ['codex', 'quiz', 'synth', 'endgame', 'win', 'poster', 'levels', 'pause', 'mapscreen'].some((id) => document.getElementById(id).classList.contains('on'));
  }

  closeAllScreens() {
    ['codex', 'quiz', 'synth', 'endgame', 'win', 'poster', 'mapscreen'].forEach((id) => this.closeScreen(id));
  }

  closeScreen(id) {
    HUD.screen(id, false);
    document.getElementById('hud').classList.remove('dimmed');
    if (this.mode === 'play' && !this.anyScreenOpen()) this.canvas.requestPointerLock();
  }

  toggleCodex() {
    if (this.mode === 'title') return;
    if (document.getElementById('codex').classList.contains('on')) this.closeScreen('codex');
    else {
      document.exitPointerLock();
      document.getElementById('hud').classList.add('dimmed');
      HUD.openCodex();
      Sfx.open();
    }
  }

  /* ================= lifecycle ================= */
  start(levelId) {
    Sfx.init();
    HUD.screen('title', false);
    HUD.screen('levels', false);
    this.enterLevel(levelId || 'colloquium');
    if ((levelId || 'colloquium') === 'colloquium') { this.hour = 17.25; this.clockRun = true; }
    document.getElementById('hud').classList.add('on');
    this.mode = 'play';
    this.fx.fade = 0;
    this.canvas.requestPointerLock();
    this.refreshSecured();
    HUD.showSlots(true, [], this.selSlot, this.ammo());
    HUD.controlMode(this.look.locked ? 'lock' : 'drag');
    HUD.log('<b>ARRIVAL</b> — the Great Court. Twenty-four scientists are on campus today.');
    HUD.log('Your Codex carries five questions. All five, on everyone, is the goal.');
    Sfx.open();
    this.navTick = 99;
  }

  /* ================= interaction ================= */
  findTarget() {
    const c = this.cam;
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    // -Infinity, not -1: the gates below already decide what is eligible, and a
    // -1 floor was silently rejecting anything you were not squarely facing
    let best = null, bestScore = -Infinity;

    const consider = (obj, x, z, maxDist, minDot) => {
      const dx = x - c.x, dz = z - c.z;
      const dist = Math.hypot(dx, dz);
      if (dist > maxDist) return;
      const dot = (dx * fx + dz * fz) / (dist || 1);
      if (dot < minDot) return;
      const score = dot * 2 + (1 - dist / maxDist);
      if (score > bestScore) { bestScore = score; best = { ...obj, dist }; }
    };

    for (const s of this.world.stations) consider({ kind: 'person', s }, s.x, s.z, 9.5, 0.62);
    if (!this.vehicle) for (const v of (this.vehicles || [])) consider({ kind: 'vehicle', v }, v.x, v.z, 3.0, -0.2);
    if (this.level === 'summit' && this.world.finish) {
      const f = this.world.finish;
      // the marquee is a place you stand in, not something you aim at
      consider({ kind: 'poster' }, f.x, f.z, 42, -1.01);   // works whichever way you face
    }
    for (const v of this.world.vaults) {
      if (!this.districtDone(v.district)) continue;
      consider({ kind: 'vault', v }, v.x, v.z, 8.0, 0.72);
    }
    const sy = this.world.synth || { x: 0, z: 0 };
    if (this.countInterviews() >= 2 || this.allSecured()) consider({ kind: 'synth' }, sy.x, sy.z, 9.0, 0.55);
    return best;
  }

  interact() {
    if (this.vehicle) { this.dismount(); return; }
    if (this.target && this.target.kind === 'vehicle') { this.mount(this.target.v); return; }
    const nz = this.level !== 'summit' && !this.zip ? this.nearZip() : null;
    if (nz) { this.startZip(nz); return; }
    const t = this.target;
    if (!t) return;
    if (t.kind === 'poster') {
      if (!this.summitWon()) {
        Sfx.deny();
        const left = this.summitStatus().tasks.filter((x) => x.n < x.of).map((x) => x.label);
        HUD.banner('NOT YET', `Still to do: ${left.join(' · ')}`, '#ffab6a');
        return;
      }
      document.getElementById('hud').classList.add('dimmed');
      HUD.openPoster(); Sfx.complete();
      return;
    }
    if (t.kind === 'person') this.beginInterview(t.s);
    else if (t.kind === 'vault') {
      document.exitPointerLock();
      document.getElementById('hud').classList.add('dimmed');
      HUD.openQuiz(t.v.district);
      Sfx.open();
    } else if (t.kind === 'synth') {
      document.exitPointerLock();
      document.getElementById('hud').classList.add('dimmed');
      if (this.allSecured()) { HUD.openWin(); Sfx.complete(); }
      else { HUD.openSynth(); Sfx.open(); }
    }
  }

  beginInterview(station) {
    this.mode = 'talk';
    this.talking = station;
    document.exitPointerLock();
    const p = station.person;
    const d = this.districtById[station.district];
    HUD.setAccent(d.accent, d.accent2);
    document.getElementById('hud').classList.add('talking');
    HUD.openDialogue(p, d.accent);
    HUD.showSlots(true, this.progress[p.id] || [], -1);
    HUD.prompt('');
    Sfx.select();

    // ease the camera into a framing shot of the figure
    const dx = this.cam.x - station.x, dz = this.cam.z - station.z;
    const L = Math.hypot(dx, dz) || 1;
    const D = 4.9;
    const tx = station.x + (dx / L) * D, tz = station.z + (dz / L) * D;
    const groundY = this.level === 'summit' ? mtnHeight(tx, tz) : 0;
    const yaw = Math.atan2(-(station.x - tx), -(station.z - tz));
    this.camAnim = {
      t: 0, dur: 0.75,
      from: { x: this.cam.x, y: this.cam.y, z: this.cam.z, yaw: this.cam.yaw, pitch: this.cam.pitch, fov: this.cam.fov },
      to: { x: tx, y: (this.level === 'summit' ? groundY : this.footY) + 2.05, z: tz, yaw: this.shortestYaw(this.cam.yaw, yaw), pitch: -0.055, fov: 1.16 },
    };
    if (!this.visited.has(station.id)) {
      this.visited.add(station.id);
      HUD.log(`<b>${esc(p.name)}</b> — ${esc(p.hook)}`);
    }
  }

  shortestYaw(from, to) {
    let d = to - from;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    return from + d;
  }

  endInterview() {
    this.challenge = null; this.pendingChallenge = null;
    if (this.mode !== 'talk') return;
    this.mode = 'play';
    document.getElementById('hud').classList.remove('talking');
    HUD.closeDialogue();
    HUD.showSlots(false, [], -1);
    if (this.level === 'summit') {
      const P = this.ride;
      P.x = this.cam.x; P.z = this.cam.z; P.y = mtnHeight(P.x, P.z);
      P.speed = 0; P.air = false; P.vy = 0; P.yaw = this.cam.yaw;
      this.camAnim = null;
    } else {
      this.camAnim = {
        t: 0, dur: 0.45,
        from: { ...this.cam },
        to: { x: this.cam.x, y: this.footY + EYE, z: this.cam.z, yaw: this.cam.yaw, pitch: this.cam.pitch, fov: 1.31 },
      };
    }
    this.talking = null;
    HUD.showSlots(true, [], this.selSlot, this.ammo());
  }

  ask(slot) {
    if (this.mode !== 'talk' || !this.talking) return;
    if (HUD.skipType()) return;                       // first press finishes the current text
    // the role reversal: once all five are asked, they ask you one
    if (this.challenge) {
      if (!this.challenge.done) { if (slot < 4) this.answerChallenge(slot); return; }
      this.challenge = null;
      HUD.showSlots(true, this.progress[this.talking.person.id] || [], slot);
    }
    if (this.pendingChallenge) { this.openChallenge(); return; }
    const q = QTYPES[slot];
    const p = this.talking.person;
    const a = p.answers[q.key];
    if (!a) return;

    const asked = this.progress[p.id] || (this.progress[p.id] = []);
    const isNew = !asked.includes(q.key);
    if (isNew) asked.push(q.key);

    this.selSlot = slot;
    HUD.setDialogueText(a.text, q, isNew ? a.concept : null, false);
    HUD.showSlots(true, asked, slot);
    HUD.updatePips(p);

    if (isNew) {
      Sfx.insight();
      this.spawnPulse(this.talking.x, this.talking.z, this.districtById[p.district].rgb);
      this.fx.pulse = 1;
      this.fx.pulseHue = q.key === 'doubt' ? 1 : 0;
      HUD.toast('+ INSIGHT', a.concept);
      this.refreshStats();
      this.save();

      if (asked.length === 5) {
        Sfx.complete();
        HUD.log(`<b>INTERVIEW COMPLETE</b> — ${esc(p.name)}. Codex entry unlocked.`);
        setTimeout(() => HUD.toast('INTERVIEW COMPLETE', p.name), 500);
        this.refreshSecured();
        const d = this.districtById[p.district];
        if (this.districtDone(d.id)) {
          setTimeout(() => {
            HUD.log(`<b>VAULT UNSEALED</b> — the Insight Vault in ${esc(d.name)} will now open.`);
            HUD.toast('VAULT UNSEALED', d.name);
          }, 1400);
        }
        if (this.countInterviews() === this.roster.length) {
          setTimeout(() => HUD.log('<b>ALL RECORDS OPEN</b> — return to the atrium terminal for your debrief.'), 2200);
        }
        if (CHALLENGES[p.id] && !this.challenged[p.id]) {
          this.pendingChallenge = p;
          HUD.dialogueHint('They have a question for you — press any question key to hear it.');
        }
      }
    } else {
      Sfx.blip();
    }
  }

  openChallenge() {
    const p = this.pendingChallenge; this.pendingChallenge = null;
    const ch = p && CHALLENGES[p.id];
    if (!ch) return;
    this.challenge = { p, ch, done: false };
    HUD.showSlots(false);
    HUD.openChallenge(p, ch);
    Sfx.blip();
  }

  answerChallenge(i) {
    const C = this.challenge;
    if (!C || C.done) return;
    C.done = true;
    const right = i === C.ch.correct;
    this.challenged[C.p.id] = { pick: i, right };
    if (right) {
      Sfx.complete();
      this.fx.pulse = 0.8; this.fx.pulseHue = 0;
      HUD.toast('+ ENDORSEMENT', C.p.name);
      HUD.log(`<b>ENDORSED</b> — ${esc(C.p.name)} will vouch for your reasoning.`);
    } else {
      Sfx.deny();
      HUD.log(`${esc(C.p.name)} asked you something back. Read why the answer they wanted is the one that holds.`);
    }
    HUD.resolveChallenge(C.ch, i);
    this.refreshStats();
    this.save();
  }

  countEndorsements() { return Object.values(this.challenged || {}).filter((c) => c.right).length; }

  spawnPulse(x, z, col) {
    this.pulses.push({ x, z, t: 0, col });
  }

  /* ================= the inquiry beam =================
     Ammunition is knowledge: a question type can only be fired once you have
     actually asked it of someone. */
  unlockedTypes() {
    const set = new Set();
    for (const arr of Object.values(this.progress)) for (const k of arr) set.add(k);
    return QTYPES.filter((q) => set.has(q.key)).map((q) => q.key);
  }

  ammo() {
    const un = new Set(this.unlockedTypes());
    return QTYPES.map((q) => un.has(q.key));
  }

  fire() {
    if (this.mode !== 'play' || this.anyScreenOpen()) return;
    if ((this.fireCd || 0) > 0) return;
    const q = QTYPES[this.selSlot];
    if (!this.unlockedTypes().includes(q.key)) {
      Sfx.deny();
      // This is the one message a brand-new player needs, so it gets the banner
      // rather than the small toast.
      HUD.banner(`${q.name} NOT CHARGED`,
        `Ask a scientist "${q.ask}" and this question becomes ammunition.`, '#ffab6a');
      return;
    }
    this.fireCd = 0.26;
    const c = this.cam, bs = this.basis || this.camBasis();
    let fwd = [-bs.back[0], -bs.back[1], -bs.back[2]];
    let muzzle = [
      c.x + bs.right[0] * 0.50 + bs.up[0] * -0.40 + fwd[0] * 1.0,
      c.y + bs.right[1] * 0.50 + bs.up[1] * -0.40 + fwd[1] * 1.0,
      c.z + bs.right[2] * 0.50 + bs.up[2] * -0.40 + fwd[2] * 1.0,
    ];
    if (this.camMode === 'third' && this.level !== 'summit') {
      // from the book in the hand toward whatever the crosshair is on
      this.aimTimer = 1.4;
      const hp = this.handWorld ? this.handWorld : [c.x, this.footY + 1.3, c.z];
      const ap = this.aimPoint();
      const dx = ap[0] - hp[0], dy = ap[1] - hp[1], dz = ap[2] - hp[2], L = Math.hypot(dx, dy, dz) || 1;
      muzzle = hp.slice(); fwd = [dx / L, dy / L, dz / L];
    }
    const col = QCOLOURS[this.selSlot];
    this.life.fireInsight(muzzle, fwd, q.key, col);
    // page-glyph burst off the codex
    this.particles.burst(muzzle[0], muzzle[1], muzzle[2], 14,
      { cols: [col, [1, 1, 1]], speed: 3.2, life: 0.35, size: 0.14, grav: -2, drag: 4,
        vx: fwd[0] * 6, vy: fwd[1] * 6, vz: fwd[2] * 6, streak: true });
    this.fx.pulse = Math.max(this.fx.pulse, 0.45);
    this.fx.pulseHue = this.selSlot === 4 ? 1 : 0;
    Sfx.tone(620 + this.selSlot * 90, 0.13, 'triangle', 0.032, 1400);
  }

  /* ================= citations =================
     The right question type beats a claim generically. Somebody's actual work
     beats it specifically — and you only hold that work if you went and asked
     them about it. Citing also spreads: a sourced refutation is the kind that
     other people can repeat, so the students nearby learn it too. */
  citeSources(card) {
    if (!card || !card.counters) return [];
    return card.counters.filter((c) => (this.progress[c.id] || []).length > 0 && this.byId[c.id]);
  }

  cite() {
    if (this.anyScreenOpen()) return;
    const inIntercept = this.mode === 'intercept' && this.intercept;
    if (!inIntercept && this.mode !== 'play') return;
    const drone = inIntercept ? this.intercept.drone : this.aimDrone();
    const card = inIntercept ? this.intercept.card : (drone && drone.card);
    if (!card) { HUD.toast('NOTHING TO CITE', 'Put a feed drone under the crosshair.'); return; }
    if (inIntercept && this.intercept.cited) return;
    if (!inIntercept && (this.citeCd || 0) > 0) {
      HUD.toast('STILL FINDING THE PAGE', `${this.citeCd.toFixed(1)} s`);
      return;
    }
    const src = this.citeSources(card);
    if (!src.length) {
      // naming who *would* answer it turns the feed into a reading list
      const who = (card.counters || []).map((c) => (this.byId[c.id] || {}).name).filter(Boolean);
      HUD.banner('NO SOURCE IN HAND', who.length
        ? `Nobody you have interviewed speaks to this one. ${who[0]} would.`
        : 'Nothing you have learned touches this claim yet.', '#ffab6a');
      Sfx.deny();
      return;
    }
    const s = src[(Math.random() * src.length) | 0];
    const person = this.byId[s.id];
    this.citations = (this.citations || 0) + 1;
    const district = this.districtById[person.district];
    Sfx.complete();
    this.fx.pulse = 1; this.fx.pulseHue = 0;

    if (inIntercept) {
      this.intercept.cited = true;
      HUD.markCited(person, s, district);
      this.spreadCitation(this.cam.x, this.cam.z, person, 22);
    } else {
      HUD.citationCard(card, s, person, district);
      this.citeCd = 9;
      this.citeBeam(drone);
      if (drone.boss && !drone.dead) this.onBossShieldBroken(drone, drone.shields[0], null);
      else if (!drone.dead) this.killDroneByCitation(drone, person);
      this.spreadCitation(drone.x, drone.z, person, 20);
    }
    this.refreshStats();
    this.save();
  }

  /* a line of gold from the Codex to the thing being answered */
  citeBeam(drone) {
    const bs = this.basis || this.camBasis(), c = this.cam;
    const ox = c.x + bs.right[0] * 0.5 - bs.up[0] * 0.4, oy = c.y + bs.right[1] * 0.5 - bs.up[1] * 0.4,
          oz = c.z + bs.right[2] * 0.5 - bs.up[2] * 0.4;
    const n = 26;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      this.particles.burst(ox + (drone.x - ox) * u, oy + (drone.y - oy) * u, oz + (drone.z - oz) * u, 1,
        { cols: [[1, 0.88, 0.55], [1, 1, 1]], speed: 0.6, life: 0.5 + u * 0.3, size: 0.13, grav: 0, drag: 2, alpha: 0.95 });
    }
    this.shake = Math.max(this.shake, 0.25);
  }

  killDroneByCitation(d, person) {
    d.dying = 0.5; d.dead = true;
    this.particles.burst(d.x, d.y, d.z, 90, { cols: [[1, 0.88, 0.55], [1, 1, 1], [0.62, 0.23, 1]],
      speed: 10, life: 1.2, size: 0.28, grav: -6, drag: 1.3, streak: true });
    this.debunked = (this.debunked || 0) + 1;
    if (d.district) this.feedCleared[d.district] = (this.feedCleared[d.district] || 0) + 1;
    this.noise = Math.max(0, (this.noise || 0) - 0.42);
    HUD.resolveClutter(d, d.card);
    HUD.log(`<b>CITED</b> — ${esc(person.name)} settles “${esc(d.card.technique)}”.`);
    this.refreshSecured();
  }

  /* everyone in earshot picks up a sourced answer */
  spreadCitation(x, z, person, radius) {
    const col = hex2rgb('#ffd98a');
    let n = 0, grads = 0;
    for (const s of this.life.students) {
      if (Math.hypot(s.x - x, s.z - z) > radius) continue;
      const before = this.life.tier(s);
      const rescued = this.life.teach(s, col, `${person.name} showed that, apparently.`, false);
      this.life.addMote(s.x, 2.0, s.z, '+1', '#ffd98a');
      this.particles.burst(s.x, (s.y || 0) + 1.4, s.z, 16,
        { cols: [col, [1, 1, 1]], speed: 3.0, life: 0.8, size: 0.15, grav: 1.4, drag: 1.8 });
      this.taught = (this.taught || 0) + 1;
      if (rescued) this.rescued = (this.rescued || 0) + 1;
      if (this.life.tier(s) >= 3 && before < 3) grads++;
      n++;
    }
    if (n) {
      HUD.banner('THE CITATION SPREADS',
        `${n} student${n > 1 ? 's' : ''} in earshot picked it up${grads ? ` · ${grads} graduated` : ''}`, '#ffd98a');
      this.refreshSecured();
    }
    return n;
  }

  /* ---------- Peer Review: the district's last drone ---------- */
  onBossSpawn(d) {
    HUD.banner('PEER REVIEW', 'A claim with five layers. Strip them in the order of an argument: PROBE, METHOD, EVIDENCE, IMPACT, DOUBT.', '#ff5fb0');
    HUD.log("<b>PEER REVIEW</b> — the feed's editor has arrived. Its shields fall only in order.");
    Sfx.tone(90, 0.6, 'sawtooth', 0.035, 60);
    this.shake = 0.4;
  }

  onBossShieldBroken(d, qtype, byTier) {
    if (d.dead || !d.shields || !d.shields.length) return;
    const gone = d.shields.shift();
    const qi = QTYPES.findIndex((q) => q.key === gone), col = QCOLOURS[qi] || [1, 1, 1];
    this.particles.burst(d.x, d.y, d.z, 40, { cols: [col, [1, 1, 1]], speed: 7, life: 0.8, size: 0.24, grav: -3, drag: 1.6, streak: true });
    d.stagger = 1.2;
    if (d.shields.length) {
      const next = QTYPES.find((q) => q.key === d.shields[0]);
      Sfx.insight();
      HUD.toast(byTier != null ? 'STUDENTS STRIPPED A LAYER' : 'LAYER STRIPPED', `Next: ${next.name}`);
    } else {
      this.killBoss(d, byTier);
    }
  }

  killBoss(d, byTier) {
    d.dying = 0.5; d.dead = true;
    this.particles.burst(d.x, d.y, d.z, 140, { cols: [[1, 0.25, 0.66], [0.62, 0.23, 1], [1, 1, 1], [1, 0.9, 0.5]],
      speed: 12, life: 1.4, size: 0.32, grav: -6, drag: 1.2, streak: true });
    this.particles.burst(d.x, d.y, d.z, 40, { col: [1, 1, 1], speed: 3, life: 0.7, size: 1.4, grav: 0, drag: 3, alpha: 0.5 });
    this.debunked = (this.debunked || 0) + 1;
    if (d.district) { this.feedCleared[d.district] = (this.feedCleared[d.district] || 0) + 1; this.bossDone[d.district] = true; }
    this.noise = Math.max(0, (this.noise || 0) - 0.5);
    HUD.resolveClutter(d, d.card);
    HUD.banner('PEER REVIEW PASSED', 'What, how, evidence, impact, doubt — the anatomy of an argument.', '#7df0ae');
    HUD.log(`<b>PEER REVIEW PASSED</b> in ${esc((this.districtById[d.district] || {}).name || 'the district')}.`);
    this.shake = 0.6;
    Sfx.complete();
    this.refreshStats();
    this.refreshSecured();
    this.save();
  }

  onInsightHitsDrone(d, qtype) {
    if (d.boss) {
      if (d.dead) return;
      if (qtype === d.shields[0]) this.onBossShieldBroken(d, qtype, null);
      else {
        d.scanned = true;
        Sfx.deny();
        this.particles.burst(d.x, d.y, d.z, 10, { col: [1, 0.6, 0.8], speed: 3, life: 0.4, size: 0.16, grav: -4, drag: 3 });
        HUD.toast('OUT OF ORDER', `Peer Review wants ${QTYPES.find((q) => q.key === d.shields[0]).name} next.`);
      }
      return;
    }
    if (qtype === d.card.weakness) {
      d.dying = 0.5; d.dead = true;
      this.particles.burst(d.x, d.y, d.z, 70, { cols: [[1, 0.25, 0.66], [0.62, 0.23, 1], [1, 1, 1]],
        speed: 9, life: 1.1, size: 0.26, grav: -7, drag: 1.4, streak: true });
      this.particles.burst(d.x, d.y, d.z, 28, { col: [1, 1, 1], speed: 2, life: 0.5, size: 0.9, grav: 0, drag: 3, alpha: 0.6 });
      this.debunked = (this.debunked || 0) + 1;
      if (d.district) this.feedCleared[d.district] = (this.feedCleared[d.district] || 0) + 1;
      this.noise = Math.max(0, (this.noise || 0) - 0.34);
      HUD.resolveClutter(d, d.card);
      HUD.techniqueCard(d.card);
      Sfx.complete();
      this.refreshStats();
      this.refreshSecured();
      this.save();
    } else {
      d.scanned = true;
      this.particles.burst(d.x, d.y, d.z, 12, { col: [1, 0.6, 0.8], speed: 3, life: 0.4, size: 0.16, grav: -4, drag: 3 });
      Sfx.deny();
      const want = QTYPES.find((q) => q.key === d.card.weakness);
      HUD.toast('WRONG INSTRUMENT', `That claim survives ${QTYPES[this.selSlot].name}. Try ${want.name}.`);
      HUD.markDroneWeakness(d);
    }
  }

  /* a drone worn down by educated students rather than by the player */
  onDroneOverwhelmed(d, byTier) {
    if (d.dead) return;
    d.dying = 0.5; d.dead = true;
    this.debunked = (this.debunked || 0) + 1;
    if (d.district) this.feedCleared[d.district] = (this.feedCleared[d.district] || 0) + 1;
    this.noise = Math.max(0, (this.noise || 0) - 0.20);
    HUD.resolveClutter(d, d.card);
    HUD.techniqueCard(d.card, true);
    HUD.toast(byTier >= 3 ? 'GRADUATES TOOK IT DOWN' : 'STUDENTS TOOK IT DOWN', d.card.technique);
    Sfx.complete();
    this.refreshStats();
    this.refreshSecured();
    this.save();
  }

  onInsightHitsStudent(s, qtype) {
    // hand over a concept you actually collected under that question type
    const pool = [];
    for (const [id, keys] of Object.entries(this.progress)) {
      if (keys.includes(qtype) && this.byId[id]) pool.push(this.byId[id].answers[qtype].concept);
    }
    if (!pool.length) return;
    const concept = pool[(Math.random() * pool.length) | 0];
    const qi = QTYPES.findIndex((q) => q.key === qtype);
    const col = QCOLOURS[qi];
    const line = pick(STUDENT_LINES.taught);
    const before = this.life.tier(s);
    const matched = s.wants === qi;
    const rescued = this.life.teach(s, col, line, matched);
    this.life.addMote(s.x, 2.0, s.z, matched ? '+2' : '+1', QHEX[qi]);
    this.particles.burst(s.x, (s.y || 0) + 1.4, s.z, matched ? 40 : 22,
      { cols: [col, [1, 1, 1]], speed: 3.4, life: 0.9, size: 0.17, grav: 1.5, drag: 1.8 });
    this.taught = (this.taught || 0) + 1;
    if (rescued) this.rescued = (this.rescued || 0) + 1;
    const t = this.life.tier(s);
    if (t >= 3 && before < 3) {
      HUD.banner('GRADUATE', `${concept} — they can teach this one themselves now`, '#ffd98a');
      Sfx.complete();
    } else if (t > before) {
      HUD.banner(TIERS[t].name.toUpperCase(),
        `${concept}${t >= 2 ? ' — they will start answering drones' : ''}`,
        t >= 2 ? '#7df0ae' : '#8fd0ff');
      if (t >= 2) Sfx.complete(); else Sfx.insight();
    } else if (rescued) {
      HUD.banner('MIND CLEARED', concept, '#7df0ae');
      Sfx.insight();
    } else {
      HUD.banner(matched ? 'EXACTLY WHAT THEY NEEDED' : 'PARTLY USEFUL',
        matched ? concept : `${concept} — they wanted ${QTYPES[s.wants].name}`,
        matched ? QHEX[qi] : '#a9b9cd');
      Sfx.insight();
    }
    this.refreshStats();
    this.refreshSecured();
    this.save();
  }

  /* A claim that reaches you stops the world. There is no timer: the whole
     point is to read it and reason, not to mash question types until one works. */
  /* ---------- 3D waypoints: where to go next, projected onto the screen ---------- */
  projectPoint(x, y, z) {
    const v = this.R.vp;
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    const cw = v[3] * x + v[7] * y + v[11] * z + v[15];
    if (cw <= 0.01) {
      // behind the camera: park it on the screen edge on the side it lies
      const yaw = this.cam.yaw, tx = x - this.cam.x, tz = z - this.cam.z;
      const side = tx * Math.cos(yaw) - tz * Math.sin(yaw);
      return { sx: side > 0 ? W - 40 : 40, sy: H * 0.45, on: false };
    }
    const cx = (v[0] * x + v[4] * y + v[8] * z + v[12]) / cw;
    const cy = (v[1] * x + v[5] * y + v[9] * z + v[13]) / cw;
    return { sx: (cx * 0.5 + 0.5) * W, sy: (1 - (cy * 0.5 + 0.5)) * H, on: Math.abs(cx) < 1.05 && Math.abs(cy) < 1.05 };
  }

  updateWaypoints() {
    const c = this.cam, list = [];
    const add = (x, y, z, label, sub, color, key, opts = {}) => {
      const dist = Math.hypot(x - c.x, z - c.z);
      if (dist < (opts.minDist || 7)) return;
      const p = this.projectPoint(x, y, z);
      if (!p) return;
      list.push({ key, sx: p.sx, sy: p.sy, on: p.on, label, sub: `${sub ? sub + ' · ' : ''}${Math.round(dist)} m`, color, faint: opts.faint });
    };
    if (this.level === 'summit') {
      const ahead = this.world.stations.filter((s) => s.z < this.ride.z - 6 && (this.progress[s.id] || []).length < 5)
        .sort((a, b) => b.z - a.z)[0];
      if (ahead) {
        const p = this.roster.find((r) => r.id === ahead.id);
        add(ahead.x, ahead.y + 3.2, ahead.z, p ? p.name : 'SESSION', `${(this.progress[ahead.id] || []).length}/5`, '#ffd9ae', 'next');
      } else if (this.world.finish) {
        add(this.world.finish.x, this.world.finish.y + 4, this.world.finish.z, 'POSTER SESSION', 'finish', '#ffd9ae', 'finish');
      }
    } else {
      const d = this.life.currentDistrict();
      const dId = d && d.id;
      let best = null, bd = 1e9;
      for (const s of this.world.stations) {
        if (s.district !== dId) continue;
        if ((this.progress[s.id] || []).length >= 5) continue;
        const dist = Math.hypot(s.x - c.x, s.z - c.z);
        if (dist < bd) { bd = dist; best = s; }
      }
      if (best) {
        const p = this.roster.find((r) => r.id === best.id);
        add(best.x, 3.4, best.z, p ? p.name : 'RESEARCHER', `${(this.progress[best.id] || []).length}/5`, d.accent, 'next');
      } else if (d && this.districtDone(dId) && !this.vaultSealed(dId)) {
        const v = this.world.vaults.find((x) => x.district === dId);
        if (v) add(v.x, 8.5, v.z, 'INSIGHT VAULT', 'unsealed', d.accent, 'next');
      } else {
        // everything here is done: point at the nearest district still open
        let nd = null, ndd = 1e9;
        for (const o of DISTRICTS) {
          if (o.id === dId || this.secured[o.id]) continue;
          const dist = Math.hypot(o.cx - c.x, o.cz - c.z);
          if (dist < ndd) { ndd = dist; nd = o; }
        }
        if (nd) add(nd.cx, 20, nd.cz, nd.name, 'next district', nd.accent, 'next', { minDist: 30 });
        else if (Object.keys(this.secured).length >= 5) add(0, 22, 0, 'CONVOCATION', 'atrium terminal', '#ffd98a', 'next', { minDist: 12 });
      }
      for (const p of this.pickups) {
        if (this.found[p.item.id]) continue;
        const dist = Math.hypot(p.x - c.x, p.z - c.z);
        if (dist < 48) add(p.x, p.y + 0.6, p.z, 'MARGINALIA', p.kind, '#e9c877', 'm:' + p.item.id, { faint: true, minDist: 4 });
      }
    }
    const drones = this.life.drones.filter((dr) => !dr.dead)
      .map((dr) => ({ dr, dist: Math.hypot(dr.x - c.x, dr.z - c.z) })).sort((a, b) => a.dist - b.dist).slice(0, 2);
    for (const { dr } of drones) {
      if (dr.boss) add(dr.x, dr.y + 3.0, dr.z, 'PEER REVIEW', `next ${QTYPES.find((q) => q.key === dr.shields[0]).name}`, '#ff8fcb', 'boss', { minDist: 3 });
      else add(dr.x, dr.y + 1.2, dr.z, 'FEED DRONE', dr.scanned ? 'weakness known' : '', '#ff5fb0', 'd:' + dr.phase, { minDist: 3 });
    }
    HUD.waypoints(list);
    HUD.bossBar(this.life.drones.find((x) => x.boss && !x.dead) || null);
  }

  onMisinfoHitsPlayer(b) {
    this.shake = 0.55;
    if (b.drone) {
      const tx = b.drone.x - this.cam.x, tz = b.drone.z - this.cam.z, yaw = this.cam.yaw;
      HUD.hitFrom(Math.atan2(tx * Math.cos(yaw) - tz * Math.sin(yaw), -tx * Math.sin(yaw) - tz * Math.cos(yaw)));
    }
    Sfx.tone(150, 0.32, 'sawtooth', 0.030, 90);
    if (this.mode === 'intercept') { HUD.addClutter(b.card, b.drone); return; }
    this.intercept = { card: b.card, drone: b.drone, wrong: [], done: false };
    this.prevMode = this.mode;
    this.mode = 'intercept';
    this.fx.pulse = 0.8; this.fx.pulseHue = 1;
    HUD.openIntercept(this.intercept);
  }

  answerIntercept(slot) {
    const it = this.intercept;
    if (!it || it.done) return;
    const q = QTYPES[slot];
    if (it.wrong.includes(q.key)) return;

    if (q.key === it.card.weakness) {
      it.done = true; it.outcome = 'held';
      this.debunked = (this.debunked || 0) + 1;
      const d = it.drone;
      if (d && !d.dead) {
        d.dead = true; d.dying = 0.5;
        if (d.district) this.feedCleared[d.district] = (this.feedCleared[d.district] || 0) + 1;
      }
      this.noise = Math.max(0, (this.noise || 0) - 0.12);
      Sfx.complete();
      this.refreshStats();
      this.refreshSecured();
      this.save();
    } else {
      it.wrong.push(q.key);
      Sfx.deny();
      if (it.wrong.length >= 2) {
        it.done = true; it.outcome = 'landed';
        this.noise = Math.min(1, (this.noise || 0) + 0.16);
        HUD.addClutter(it.card, it.drone);
        if (it.drone) it.drone.scanned = true;
      }
    }
    HUD.renderIntercept(it);
  }

  closeIntercept() {
    this.intercept = null;
    this.mode = this.prevMode === 'talk' ? 'talk' : 'play';
    HUD.closeIntercept();
    // breathing room, so you are never hit again while still processing the last one
    this.graceUntil = this.time + 6;
  }

  /* ================= synthesis ================= */
  trySynthesis(a, b) {
    const idx = CONNECTIONS.findIndex((c) =>
      (c.a === a && c.b === b) || (c.a === b && c.b === a));
    if (idx < 0) {
      Sfx.deny();
      return { found: false, hint: 'These two are not linked in the terminal’s index. That does not mean nothing connects them — it means this game does not assert a link. Try pairing along a shared method, a direct lineage, or a genuine disagreement.' };
    }
    if (!this.connectionsFound.includes(idx)) {
      this.connectionsFound.push(idx);
      Sfx.complete();
      HUD.log(`<b>CONNECTION</b> — ${esc(CONNECTIONS[idx].title)}`);
      this.refreshStats();
      this.save();
    } else Sfx.select();
    return { found: true, conn: CONNECTIONS[idx] };
  }

  recordVaultAnswer(district, qi, oi) {
    const v = this.vaultAnswers[district] || (this.vaultAnswers[district] = {});
    if (v[qi] == null) {
      v[qi] = oi;
      const correct = VAULTS[district].questions[qi].correct === oi;
      if (correct) Sfx.insight(); else Sfx.deny();
      if (Object.keys(v).length === VAULTS[district].questions.length) {
        Sfx.complete();
        HUD.log(`<b>VAULT SEALED</b> — ${esc(this.districtById[district].name)}`);
      }
      this.refreshStats();
      this.refreshSecured();
      this.save();
    }
  }

  /* ================= queries ================= */
  countInsights() { return Object.values(this.progress).reduce((n, a) => n + a.length, 0); }
  countInterviews() { return this.roster.filter((p) => (this.progress[p.id] || []).length >= 5).length; }
  countVaults() {
    return DISTRICTS.filter((d) => {
      const v = this.vaultAnswers[d.id];
      return v && Object.keys(v).length === VAULTS[d.id].questions.length;
    }).length;
  }
  districtDone(id) {
    const people = this.roster.filter((p) => p.district === id);
    return people.length > 0 && people.every((p) => (this.progress[p.id] || []).length >= 5);
  }

  refreshStats() {
    HUD.stats({
      insights: this.countInsights(), insightsMax: this.roster.length * 5,
      interviews: this.countInterviews(), interviewsMax: this.roster.length,
      connections: this.connectionsFound.length, connectionsMax: CONNECTIONS.length,
      vaults: this.countVaults(),
      taught: this.taught || 0,
      debunked: this.debunked || 0,
      marginalia: Object.keys(this.found || {}).length, marginaliaMax: MARGINALIA.length,
      endorsements: this.countEndorsements(), endorsementsMax: Object.keys(CHALLENGES).length,
      citations: this.citations || 0,
    });
  }

  outcomeScores() {
    const R = this.roster, n = R.length;
    const frac = (key) => R.filter((p) => (this.progress[p.id] || []).includes(key)).length / n;
    const vaultFrac = (() => {
      let got = 0, tot = 0;
      for (const d of DISTRICTS) {
        const qs = VAULTS[d.id].questions; tot += qs.length;
        const a = this.vaultAnswers[d.id] || {};
        for (let i = 0; i < qs.length; i++) if (a[i] === qs[i].correct) got++;
      }
      return tot ? got / tot : 0;
    })();
    return [
      { name: '01 · Evidence & Inference', pct: frac('evidence'),
        detail: `You asked ${Math.round(frac('evidence') * n)} of ${n} researchers what their data actually showed.` },
      { name: '02 · Method Literacy', pct: frac('method'),
        detail: `You asked ${Math.round(frac('method') * n)} of ${n} how the work was physically done.` },
      { name: '03 · Nature of Science', pct: vaultFrac,
        detail: `Vault reasoning questions answered correctly on first attempt: ${Math.round(vaultFrac * 100)}%.` },
      { name: '04 · Interdisciplinary Transfer', pct: this.connectionsFound.length / CONNECTIONS.length,
        detail: `${this.connectionsFound.length} of ${CONNECTIONS.length} cross-field connections opened.` },
      { name: '05 · Epistemic Humility', pct: frac('doubt'),
        detail: `You asked ${Math.round(frac('doubt') * n)} of ${n} what they got wrong or still don’t know.` },
      { name: '06 · Science in Context', pct: frac('impact'),
        detail: `You asked ${Math.round(frac('impact') * n)} of ${n} where the work went afterwards.` },
      { name: '07 · Media Literacy', pct: Math.min(1, (this.debunked || 0) / 12),
        detail: `${this.debunked || 0} manipulative claims dismantled by naming the technique that ` +
          `carried them, rather than by arguing the topic.` },
      { name: '08 · Teaching as Learning', pct: Math.min(1, (this.taught || 0) / 15),
        detail: `You handed an insight to ${this.taught || 0} students` +
          `${this.rescued ? `, ${this.rescued} of them while they were carrying misinformation` : ''}.` },
    ];
  }

  /* ================= objectives =================
     A district is SECURED when all four of its tasks are done. Securing all five
     opens the Convocation at the atrium terminal, which is the win. */
  summitStatus() {
    const people = this.roster.filter((p) => p.district === 'summit');
    const interviewed = people.filter((p) => (this.progress[p.id] || []).length >= 5).length;
    const L = this.lives.summit;
    const ed = L ? L.students.filter((s) => L.tier(s) >= 2).length : 0;
    const edTotal = L ? L.students.length : SUMMIT_STUDENTS;
    const feed = this.feedCleared.summit || 0;
    const tasks = [
      { key: 'profs',   label: 'Interview the professors', n: interviewed, of: people.length },
      { key: 'grads',   label: 'Educate the grad students', n: ed, of: edTotal },
      { key: 'feed',    label: 'Clear the feed', n: feed, of: SUMMIT_DRONES },
      { key: 'finish',  label: 'Reach the poster session', n: this.summitReached ? 1 : 0, of: 1 },
    ];
    return { tasks, complete: tasks.every((t) => t.n >= t.of) };
  }

  summitWon() { return this.summitStatus().complete; }

  districtStatus(d) {
    const people = this.roster.filter((p) => p.district === d.id);
    const interviewed = people.filter((p) => (this.progress[p.id] || []).length >= 5).length;
    const v = this.vaultAnswers[d.id] || {};
    const vTotal = VAULTS[d.id].questions.length;
    const vDone = Object.keys(v).length;
    const ed = this.life ? this.life.districtEducated(d.id) : { done: 0, total: 4 };
    const feed = this.feedCleared[d.id] || 0;
    const tasks = [
      { key: 'interview', label: `Interview the researchers`, n: interviewed, of: people.length },
      { key: 'vault',     label: `Seal the Insight Vault`,    n: vDone,       of: vTotal,
        locked: interviewed < people.length },
      { key: 'educate',   label: `Educate the students`,      n: ed.done,     of: ed.total },
      { key: 'feed',      label: `Clear the feed`,            n: feed,        of: DRONES_PER_DISTRICT },
    ];
    const complete = tasks.every((t) => t.n >= t.of);
    return { d, tasks, complete };
  }

  refreshSecured() {
    if (this.level === 'summit') {
      if (this.summitWon() && !this.summitCelebrated) {
        this.summitCelebrated = true;
        this.secured.summit = true;
        Sfx.complete();
        HUD.banner('THE SUMMIT IS YOURS', 'Head into the marquee — E at the poster session', '#ffb84d');
        this.save();
      }
      return null;
    }
    let newly = null;
    for (const d of DISTRICTS) {
      if (this.secured[d.id]) continue;
      if (this.districtStatus(d).complete) { this.secured[d.id] = true; newly = d; }
    }
    if (newly) {
      Sfx.complete();
      HUD.districtSecured(newly);
      HUD.log(`<b>${esc(newly.name)} SECURED</b> — researchers logged, vault sealed, students graduating, feed clear.`);
      this.save();
      if (this.allSecured() && !this.convocationOffered) {
        this.convocationOffered = true;
        setTimeout(() => {
          HUD.log('<b>ALL FIVE DISTRICTS SECURED</b> — the Convocation is open at the atrium terminal.');
          HUD.toast('CONVOCATION OPEN', 'Return to the Synthesis Terminal');
        }, 2600);
      }
    }
    return newly;
  }

  allSecured() { return DISTRICTS.every((d) => this.secured[d.id]); }
  securedCount() { return DISTRICTS.filter((d) => this.secured[d.id]).length; }

  toggleMap() {
    if (this.level !== 'colloquium' || this.mode === 'title') return;
    const on = document.getElementById('mapscreen').classList.contains('on');
    if (on) HUD.screen('mapscreen', false);
    else { document.exitPointerLock(); HUD.openMapScreen(this); Sfx.open(); }
  }

  /* where the GPS should take you: your own waypoint, or the next thing to do */
  computeNavTarget() {
    if (this.userWaypoint) {
      if (Math.hypot(this.userWaypoint.x - this.cam.x, this.userWaypoint.z - this.cam.z) < 6) {
        this.userWaypoint = null; HUD.toast('WAYPOINT REACHED', ''); Sfx.blip();
      } else return this.userWaypoint;
    }
    const c = this.cam;
    const byDist = DISTRICTS.slice().sort((a, b) => Math.hypot(a.cx - c.x, a.cz - c.z) - Math.hypot(b.cx - c.x, b.cz - c.z));
    const here = byDist.find((d) => !this.secured[d.id] && Math.hypot(d.cx - c.x, d.cz - c.z) < R_PLATFORM + 25);
    const order = here ? [here, ...byDist.filter((d) => d !== here)] : byDist;
    for (const d of order) {
      const left = this.world.stations.filter((s) => s.district === d.id && (this.progress[s.id] || []).length < 5);
      if (left.length) {
        left.sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z));
        return { x: left[0].x, z: left[0].z, label: left[0].person.name };
      }
      const v = this.vaultAnswers[d.id] || {};
      if (Object.keys(v).length < VAULTS[d.id].questions.length) {
        const vt = this.world.vaults.find((x) => x.district === d.id);
        return { x: vt.x, z: vt.z, label: 'Insight Vault · ' + d.short };
      }
    }
    return { x: this.world.synth.x, z: this.world.synth.z, label: 'The Library' };
  }

  updateNav(dt) {
    this.navTick += dt;
    if (this.level !== 'colloquium') { this.route = null; this.navTarget = null; return; }
    if (this.navTick < 0.75) return;
    this.navTick = 0;
    this.navTarget = this.computeNavTarget();
    const t = this.navTarget;
    this.route = t ? this.nav.route(this.cam.x, this.cam.z, t.x, t.z) : null;
    // the area you are in, GTA-style
    let area = null;
    for (const d of DISTRICTS) if (Math.hypot(d.cx - this.cam.x, d.cz - this.cam.z) < 48) area = [d.short, d.sub];
    if (!area) {
      const x = this.cam.x, z = this.cam.z;
      if (Math.abs(x) < 60 && Math.abs(z) < 60) area = ['Great Court', 'The heart of the college'];
      else if (x < -175) area = ['The Backs', 'Lawns running down to the river'];
      else if (z > 190) area = ["King's Parade", 'The town street'];
      else if (z < -180) area = ['The Playing Fields', 'Cricket in summer, mud in winter'];
      else if (x > 240) area = ['Parkside', 'The east road'];
    }
    HUD.areaName(area ? area[0] : null, area ? area[1] : '');
  }

  focusDistrict() {
    let here = null, hd = 1e9;
    for (const d of DISTRICTS) {
      const dist = Math.hypot(this.cam.x - d.cx, this.cam.z - d.cz);
      if (dist < hd) { hd = dist; here = d; }
    }
    if (hd < R_PLATFORM + 30 && !this.secured[here.id]) return here;
    for (const d of DISTRICTS) if (!this.secured[d.id]) return d;
    return null;
  }

  nextObjective() {
    // 1. finish the district you are standing in
    let here = null, hereD = 1e9;
    for (const d of DISTRICTS) {
      const dist = Math.hypot(this.cam.x - d.cx, this.cam.z - d.cz);
      if (dist < hereD) { hereD = dist; here = d; }
    }
    const order = hereD < R_PLATFORM + 20 ? [here, ...DISTRICTS.filter((d) => d !== here)] : DISTRICTS;

    for (const d of order) {
      const people = this.roster.filter((p) => p.district === d.id);
      const left = people.filter((p) => (this.progress[p.id] || []).length < 5);
      if (left.length) {
        return {
          title: left.length === people.length
            ? `Interview the ${people.length} researchers in ${d.name}`
            : `${left.length} interview${left.length > 1 ? 's' : ''} left in ${d.name}`,
          where: `Next: ${left[0].name} — ${left[0].field}`,
        };
      }
      const v = this.vaultAnswers[d.id] || {};
      if (Object.keys(v).length < VAULTS[d.id].questions.length) {
        return { title: `Open the Insight Vault in ${d.name}`,
                 where: 'At the far edge of the platform' };
      }
    }
    if (this.connectionsFound.length < CONNECTIONS.length) {
      return { title: `Link ${CONNECTIONS.length - this.connectionsFound.length} more pairs of minds`,
               where: 'Synthesis Terminal — centre of the atrium' };
    }
    return { title: 'Field record complete — collect your debrief',
             where: 'Synthesis Terminal — centre of the atrium' };
  }

  /* ================= movement ================= */
  /* Does slab s contain point (x,z)? Slabs may be rotated about Y. */
  slabHas(s, x, z) {
    let lx = x - s.x, lz = z - s.z;
    if (s.ry) { const c = Math.cos(s.ry), n = Math.sin(s.ry); const tx = lx * c - lz * n; lz = lx * n + lz * c; lx = tx; }
    return Math.abs(lx) <= s.w / 2 && Math.abs(lz) <= s.d / 2;
  }

  /* Highest standable surface under (x,z) that is not above footY + STEP.
     -Infinity means void. */
  groundAt(x, z, footY) {
    let g = -Infinity;
    if (isWalkable(x, z)) g = this.level === 'summit' ? 0 : groundH(x, z);
    for (const s of (this.world.slabs || [])) {
      if (s.y <= footY + STEP && s.y > g && this.slabHas(s, x, z)) g = s.y;
    }
    return g;
  }

  /* a raised slab whose top is above step height is a wall */
  wallAt(x, z, footY) {
    for (const s of (this.world.slabs || [])) {
      if (s.y > footY + STEP && s.y - (s.h || 4) < footY + EYE && this.slabHas(s, x, z)) return true;
    }
    return false;
  }

  canStand(x, z) {
    if (this.groundAt(x, z, this.footY) === -Infinity) return false;
    if (this.wallAt(x, z, this.footY)) return false;
    for (const c of this.colliders) {
      if (c.obb) {
        if (this.footY > c.y0 + c.h - 0.2) continue;
        const dx = x - c.x, dz = z - c.z, co = Math.cos(c.yaw), s = Math.sin(c.yaw);
        if (Math.abs(dx * co - dz * s) < c.hw + PLAYER_R && Math.abs(dx * s + dz * co) < c.hd + PLAYER_R) return false;
        continue;
      }
      const rr = c.r + PLAYER_R;
      if ((x - c.x) ** 2 + (z - c.z) ** 2 < rr * rr) return false;
    }
    return true;
  }

  /* Move, then push back out of any prop we ended up inside. Push-out is what
     makes you slide around a pillar instead of stopping dead against it. */
  resolveMove(dx, dz) {
    const c = this.cam;
    let px = c.x, pz = c.z;
    const nx = c.x + dx, nz = c.z + dz;
    // on the ground you stop at the edge; in the air you carry over the void
    const ok = (x, z) => (this.grounded ? this.groundAt(x, z, this.footY) !== -Infinity : true) && !this.wallAt(x, z, this.footY);
    if (ok(nx, nz)) { px = nx; pz = nz; }
    else {
      if (ok(nx, c.z)) px = nx;
      if (ok(c.x, nz)) pz = nz;
    }
    const preX = px, preZ = pz;

    [px, pz] = this.pushOut(px, pz, PLAYER_R, this.footY, null);
    for (let iter = 0; iter < 0; iter++) {
      let hit = false;
      for (const col of this.colliders) {
        if (col.obb) {
          if (this.footY > col.y0 + col.h - 0.2) continue;       // standing on top of it
          const dx = px - col.x, dz = pz - col.z;
          if (Math.abs(dx) > col.hw + col.hd + 2 || Math.abs(dz) > col.hw + col.hd + 2) continue;
          const c = Math.cos(col.yaw), s = Math.sin(col.yaw);
          const lx = dx * c - dz * s, lz = dx * s + dz * c;
          const ex = col.hw + PLAYER_R, ez = col.hd + PLAYER_R;
          if (Math.abs(lx) >= ex || Math.abs(lz) >= ez) continue;
          let nlx = lx, nlz = lz;
          if (ex - Math.abs(lx) < ez - Math.abs(lz)) nlx = Math.sign(lx || 1) * ex; else nlz = Math.sign(lz || 1) * ez;
          px = col.x + nlx * c + nlz * s; pz = col.z - nlx * s + nlz * c;
          hit = true;
          continue;
        }
        const ex = px - col.x, ez = pz - col.z;
        const rr = col.r + PLAYER_R;
        const d2 = ex * ex + ez * ez;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2);
        hit = true;
        if (d < 1e-4) { px = col.x + rr; continue; }        // dead centre: shove east
        px += (ex / d) * (rr - d);
        pz += (ez / d) * (rr - d);
      }
      if (!hit) break;
    }

    if ((this.grounded ? this.groundAt(px, pz, this.footY) !== -Infinity : true) && !this.wallAt(px, pz, this.footY)) { c.x = px; c.z = pz; }
    else if (this.canStand(preX, preZ)) { c.x = preX; c.z = preZ; }
  }

  jump() {
    if (this.mode !== 'play' || this.level === 'summit' || this.zip) return;
    if (!this.grounded) return;
    this.vy = JUMP_V; this.grounded = false;
    Sfx.tone(300, 0.10, 'sine', 0.02, 420);
  }

  /* jump pads, gravity, landing, and stepping up and down ledges */
  updateVertical(dt) {
    const c = this.cam;
    if (this.grounded) {
      for (const p of (this.world.pads || [])) {
        if ((c.x - p.x) ** 2 + (c.z - p.z) ** 2 < p.r * p.r && Math.abs(this.footY - p.y) < 0.8) {
          this.vy = p.power || 15; this.grounded = false;
          if (p.push) { this.vel.x = p.dir[0] * p.push; this.vel.z = p.dir[1] * p.push; }
          this.particles.burst(c.x, this.footY + 0.2, c.z, 26, { col: [0.6, 0.95, 1], speed: 5, life: 0.6, size: 0.22, grav: 2, drag: 1.5 });
          Sfx.tone(220, 0.25, 'sine', 0.03, 660);
        }
      }
    }
    this.vy -= GRAV * dt;
    this.footY += this.vy * dt;
    const g = this.groundAt(c.x, c.z, this.footY);
    if (g === -Infinity) {
      this.grounded = false;
      if (this.footY < -9) {              // fell off the station: put them back
        c.x = this.lastSafe.x; c.z = this.lastSafe.z; this.footY = this.lastSafe.y; this.vy = 0;
        this.vel.x = this.vel.z = 0;
        this.fx.pulse = 0.6; this.fx.pulseHue = 1;
        HUD.banner('BACK ON THE DECK', 'The Colloquium has no floor down there.', '#8fd0ff');
      }
    } else if (this.footY <= g) {
      if (!this.grounded && this.vy < -6) this.landT = Math.min(0.45, -this.vy * 0.03);
      this.footY = g; this.vy = 0; this.grounded = true;
      this.lastSafe = { x: c.x, z: c.z, y: g };
    } else if (this.grounded && this.footY - g <= STEP) {
      this.footY = g;                   // walking down a small step
    } else {
      this.grounded = false;
    }
    this.landT = Math.max(0, this.landT - dt * 1.6);
  }

  /* ---- ziplines: grab at either post, ride to the other ---- */
  nearZip() {
    const c = this.cam;
    for (const z of (this.world.zips || [])) {
      for (const [from, to] of [[z.a, z.b], [z.b, z.a]]) {
        const dy = from[1] - this.footY;
        if (Math.hypot(c.x - from[0], c.z - from[2]) < 2.8 && dy > 1.0 && dy < 4.2) return { from, to, z };
      }
    }
    return null;
  }

  startZip(nz) {
    const L = Math.hypot(nz.to[0] - nz.from[0], nz.to[1] - nz.from[1], nz.to[2] - nz.from[2]);
    this.zip = { from: nz.from, to: nz.to, t: 0, dur: Math.max(1.2, L / 15), sag: Math.min(1.2, L / 40) };
    this.vel.x = this.vel.z = 0;
    Sfx.tone(500, 0.3, 'triangle', 0.025, 1200);
  }

  updateZip(dt) {
    const Z = this.zip, c = this.cam;
    Z.t += dt;
    const u = smoothstep(clamp(Z.t / Z.dur, 0, 1));
    c.x = lerp(Z.from[0], Z.to[0], u); c.z = lerp(Z.from[2], Z.to[2], u);
    const sag = Math.sin(u * Math.PI) * Z.sag;
    this.footY = lerp(Z.from[1], Z.to[1], u) - 1.9 - sag;
    c.y = this.footY + EYE;
    const want = Math.atan2(-(Z.to[0] - Z.from[0]), -(Z.to[2] - Z.from[2]));
    this.cam.yaw += this.shortestYaw(this.cam.yaw, want) - this.cam.yaw;
    if (Z.t >= Z.dur) { this.zip = null; this.vy = -1; this.grounded = false; }
  }

  updateRider(dt) {
    const K = this.keys, P = this.ride, c = this.cam;
    rideStep(P, {
      left: !!(K['a'] || K['arrowleft']),
      right: !!(K['d'] || K['arrowright']),
      brake: !!(K['s'] || K['arrowdown']),
      tuck: !!(K['w'] || K['arrowup'] || K['shift']),
      jump: !!K[' '],
    }, dt);

    // camera rides just above the board, leaning into the carve
    c.x = P.x; c.z = P.z; c.y = P.y + 1.55;
    c.yaw = P.yaw;
    this.rideRoll = (this.rideRoll || 0);
    this.rideRoll += (P.lean * 0.42 - this.rideRoll) * (1 - Math.exp(-8 * dt));
    c.roll = this.rideRoll;
    const targetFov = 1.30 + Math.min(0.26, P.speed / 40 * 0.28);
    c.fov += (targetFov - c.fov) * (1 - Math.exp(-4 * dt));
    this.bobAmt = Math.min(1, P.speed / 22);
    this.bob += dt * P.speed * 0.55;

    // reaching the poster session is the last objective
    const f = this.world.finish;
    if (f && !this.summitReached && Math.hypot(P.x - f.x, P.z - f.z) < 26) {
      this.summitReached = true;
      HUD.banner('POSTER SESSION', 'You made it down. The bar is open.', '#ffb84d');
      this.refreshSecured();
      this.save();
    }
  }

  updatePlayer(dt) {
    const c = this.cam;
    const K = this.keys;

    // arrow left/right steer, so the whole game is playable without a mouse
    let turn = 0;
    if (K['arrowleft']) turn += 1;
    if (K['arrowright']) turn -= 1;
    if (turn) c.yaw += turn * 2.1 * dt;

    let ix = 0, iz = 0;
    if (K['w'] || K['arrowup']) iz += 1;
    if (K['s'] || K['arrowdown']) iz -= 1;
    if (K['a']) ix -= 1;
    if (K['d']) ix += 1;
    const mag = Math.hypot(ix, iz);
    if (mag > 0) { ix /= mag; iz /= mag; }

    const sprint = (K['shift'] === true) && mag > 0;
    const tp = this.camMode === 'third';
    const speed = sprint ? (tp ? 9.6 : 11.5) : (tp ? 5.4 : 6.2);

    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
    const wx = (fx * iz + rx * ix) * speed;
    const wz = (fz * iz + rz * ix) * speed;

    const k = 1 - Math.exp(-(this.grounded ? 14 : 2.2) * dt);   // little steering in the air
    this.vel.x += (wx - this.vel.x) * k;
    this.vel.z += (wz - this.vel.z) * k;

    if (this.zip) { this.updateZip(dt); return; }
    const bx = c.x, bz = c.z;
    this.resolveMove(this.vel.x * dt, this.vel.z * dt);
    // bleed off velocity in whichever axis actually got stopped
    if (Math.abs(c.x - bx) < Math.abs(this.vel.x * dt) * 0.5) this.vel.x *= 0.3;
    if (Math.abs(c.z - bz) < Math.abs(this.vel.z * dt) * 0.5) this.vel.z *= 0.3;
    this.updateVertical(dt);

    // the body turns toward where it is going, or toward the aim
    const spd = Math.hypot(this.vel.x, this.vel.z);
    const aiming = this.aimHeld || this.aimTimer > 0;
    const faceYaw = aiming ? c.yaw + Math.PI : (spd > 0.6 ? Math.atan2(this.vel.x, this.vel.z) : this.bodyYaw);
    this.bodyYaw = this.shortestYaw(this.bodyYaw, faceYaw);
    this.bodyYaw += (faceYaw - this.bodyYaw) * (1 - Math.exp(-(aiming ? 18 : 10) * dt));
    this.bodyYaw = this.shortestYaw(0, this.bodyYaw);
    const runK = clamp((spd - 3.2) / 5, 0, 1);
    this.anim.speed += (runK - this.anim.speed) * (1 - Math.exp(-6 * dt));
    this.anim.phase += spd * dt * Math.PI / lerp(0.78, 1.2, runK);
    this.anim.air = this.grounded ? 0 : 1;
    // head bob and lean (first person)
    this.bobAmt += (Math.min(spd / 6.4, 1.35) - this.bobAmt) * (1 - Math.exp(-9 * dt));
    this.bob += dt * spd * 1.42;
    this.sway += ((ix * -0.022) - this.sway) * (1 - Math.exp(-7 * dt));
    const targetFov = 1.31 + (sprint ? 0.10 : 0) * Math.min(spd / 9, 1);
    c.fov += (targetFov - c.fov) * (1 - Math.exp(-6 * dt));
    const airK = this.grounded ? 1 : 0.15;
    const bobK = this.camMode === 'third' ? 0 : 1;
    c.y = this.footY + EYE + (Math.sin(this.bob * 2) * 0.036 * this.bobAmt * airK - this.landT * 0.35) * bobK;
  }

  /* ---------- vehicles ---------- */
  mount(v) {
    this.vehicle = v;
    v.speed = 0;
    this.vel.x = this.vel.z = 0;
    this.cam.x = v.x; this.cam.z = v.z; this.footY = v.y;
    this.cam.yaw = v.yaw + Math.PI;
    Sfx.tone(v.type === 'bike' ? 900 : 160, 0.12, v.type === 'bike' ? 'triangle' : 'sawtooth', 0.02, v.type === 'bike' ? 1200 : 220);
    HUD.toast(v.type === 'bike' ? 'ON THE BIKE' : 'IN THE CART', 'W / S · A D steer · Shift to pedal hard · E to get off');
  }

  dismount(silent) {
    const v = this.vehicle;
    if (!v) return;
    this.vehicle = null;
    let [x, z] = v.dismountPoint();
    if (!this.canStand(x, z)) { x = v.x - (x - v.x); z = v.z - (z - v.z); }
    if (!this.canStand(x, z)) { x = v.x; z = v.z; }
    this.cam.x = x; this.cam.z = z; this.footY = groundH(x, z); this.cam.y = this.footY + EYE;
    this.vel.x = Math.sin(v.yaw) * v.speed * 0.3; this.vel.z = Math.cos(v.yaw) * v.speed * 0.3;
    v.speed = 0; v.lean = 0; v.updateModel();
    this.bodyYaw = v.yaw;
    this.grounded = true;
    if (!silent) Sfx.tone(500, 0.1, 'triangle', 0.02, 300);
  }

  updateVehicle(dt) {
    const v = this.vehicle, K = this.keys, c = this.cam;
    let steer = 0;
    if (K['a'] || K['arrowleft']) steer += 1;
    if (K['d'] || K['arrowright']) steer -= 1;
    v.drive({ throttle: !!(K['w'] || K['arrowup']), brake: !!(K['s'] || K['arrowdown']), steer, sprint: !!K['shift'] }, dt, this);
    c.x = v.x; c.z = v.z; this.footY = v.y; c.y = v.y + 1.6;
    // like GTA: when you stop steering the camera, it swings back behind you
    if (performance.now() - this.lastLook > 1400 && Math.abs(v.speed) > 1.5) {
      const want = this.shortestYaw(c.yaw, v.yaw + Math.PI + v.steer * 0.35);
      c.yaw += (want - c.yaw) * (1 - Math.exp(-2.2 * dt));
      c.pitch += (-0.12 - c.pitch) * (1 - Math.exp(-1.5 * dt));
    }
    const sp = Math.abs(v.speed);
    c.fov += (1.15 + Math.min(0.2, sp / 60) - c.fov) * (1 - Math.exp(-3 * dt));
    this.vel.x = Math.sin(v.yaw) * v.speed; this.vel.z = Math.cos(v.yaw) * v.speed;
    this.grounded = true;
  }

  /* push a circle of radius r out of everything solid */
  pushOut(px, pz, r, footY, skip) {
    for (let iter = 0; iter < 3; iter++) {
      let hit = false;
      for (const col of this.colliders) {
        if (col.obb) {
          if (footY > col.y0 + col.h - 0.2) continue;
          const dx = px - col.x, dz = pz - col.z;
          if (Math.abs(dx) > col.hw + col.hd + r + 2 || Math.abs(dz) > col.hw + col.hd + r + 2) continue;
          const c = Math.cos(col.yaw), s = Math.sin(col.yaw);
          const lx = dx * c - dz * s, lz = dx * s + dz * c;
          const ex = col.hw + r, ez = col.hd + r;
          if (Math.abs(lx) >= ex || Math.abs(lz) >= ez) continue;
          let nlx = lx, nlz = lz;
          if (ex - Math.abs(lx) < ez - Math.abs(lz)) nlx = Math.sign(lx || 1) * ex; else nlz = Math.sign(lz || 1) * ez;
          px = col.x + nlx * c + nlz * s; pz = col.z - nlx * s + nlz * c;
          hit = true;
          continue;
        }
        const ex = px - col.x, ez = pz - col.z, rr = col.r + r, d2 = ex * ex + ez * ez;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-4;
        px += (ex / d) * (rr - d); pz += (ez / d) * (rr - d);
        hit = true;
      }
      for (const v of (this.vehicles || [])) {
        if (v === skip || v === this.vehicle) continue;
        const ex = px - v.x, ez = pz - v.z, rr = v.P.r + r, d2 = ex * ex + ez * ez;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-4;
        px += (ex / d) * (rr - d); pz += (ez / d) * (rr - d);
        hit = true;
      }
      if (!hit) break;
    }
    return [px, pz];
  }

  /* GTA-style follow camera: over the right shoulder, pulled in by walls,
     tighter and lower when aiming. In first person, or while talking, it is
     simply the player's eye. */
  updateView(dt) {
    const c = this.cam, V = this.view;
    const orbit = this.camMode === 'third' && this.level !== 'summit' && this.mode !== 'talk' && !this.camAnim && this.mode !== 'title';
    this.aimTimer = Math.max(0, this.aimTimer - dt);
    const aimT = (this.aimHeld || this.aimTimer > 0.6) && orbit ? 1 : 0;
    this.anim.aim += (aimT - this.anim.aim) * (1 - Math.exp(-10 * dt));
    if (!orbit) {
      V.x = c.x; V.y = c.y; V.z = c.z; V.yaw = c.yaw; V.pitch = c.pitch; V.fov = c.fov; V.roll = c.roll || 0; V.near = 0.08;
      this.viewInit = false;
      return;
    }
    const a = this.anim.aim;
    const sprint = this.keys['shift'] && Math.hypot(this.vel.x, this.vel.z) > 6;
    const dist = lerp(this.vehicle ? this.vehicle.camDist : 3.9, 1.9, a) + (sprint ? 0.6 : 0);
    const shoulder = this.vehicle ? 0 : lerp(0.42, 0.6, a);
    const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    const fx = -sy * cp, fy = sp, fz = -cy * cp, rx = cy, rz = -sy;
    const baseY = this.vehicle ? this.vehicle.y + this.vehicle.camH : this.footY + lerp(1.62, 1.58, a);
    const px = c.x + rx * shoulder, py = baseY, pz = c.z + rz * shoulder;
    // pull in against buildings between the pivot and the camera
    let t = 1;
    const ex = px - fx * dist, ey = py - fy * dist, ez = pz - fz * dist;
    for (const o of this.colliders) {
      if (!o.obb) continue;
      const dx0 = px - o.x, dz0 = pz - o.z;
      if (Math.abs(dx0) > o.hw + o.hd + dist + 2 || Math.abs(dz0) > o.hw + o.hd + dist + 2) continue;
      const co = Math.cos(o.yaw), si = Math.sin(o.yaw);
      const ax = dx0 * co - dz0 * si, az = dx0 * si + dz0 * co;
      const dx1 = ex - o.x, dz1 = ez - o.z;
      const bx = dx1 * co - dz1 * si, bz = dx1 * si + dz1 * co;
      let t0 = 0, t1 = 1;
      const slab = (p0, p1, h) => {
        const d = p1 - p0;
        if (Math.abs(d) < 1e-6) return p0 > -h && p0 < h;
        let u0 = (-h - p0) / d, u1 = (h - p0) / d;
        if (u0 > u1) { const tt = u0; u0 = u1; u1 = tt; }
        t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
        return t0 <= t1;
      };
      if (!slab(ax, bx, o.hw + 0.25) || !slab(az, bz, o.hd + 0.25)) continue;
      const yHit = py + (ey - py) * t0;
      if (yHit > o.y0 + o.h) continue;
      t = Math.min(t, Math.max(0, t0));
    }
    const d = Math.max(0.5, dist * t - (t < 1 ? 0.25 : 0));
    let tx = px - fx * d, ty = py - fy * d, tz = pz - fz * d;
    ty = Math.max(ty, groundH(tx, tz) + 0.35);
    if (!this.viewInit) { V.x = tx; V.y = ty; V.z = tz; this.viewInit = true; }
    const k = 1 - Math.exp(-(t < 1 ? 26 : 14) * dt);
    V.x += (tx - V.x) * k; V.y += (ty - V.y) * k; V.z += (tz - V.z) * k;
    V.yaw = c.yaw; V.pitch = c.pitch; V.roll = 0; V.near = 0.2;
    V.fov = lerp(c.fov, 0.92, a);
  }

  /* the point under the crosshair, for aiming from the hand */
  aimPoint() {
    const V = this.view;
    const fwd = [-Math.sin(V.yaw) * Math.cos(V.pitch), Math.sin(V.pitch), -Math.cos(V.yaw) * Math.cos(V.pitch)];
    let D = 45;
    const d = this.aimDrone(), s = this.aimStudent();
    const hit = d || s;
    if (hit) D = Math.hypot(hit.x - V.x, (hit.y != null ? hit.y : 1.2) - V.y, hit.z - V.z);
    return [V.x + fwd[0] * D, V.y + fwd[1] * D, V.z + fwd[2] * D];
  }

  applyCamAnim(dt) {
    const a = this.camAnim;
    if (!a) return;
    a.t += dt;
    const t = smoothstep(clamp(a.t / a.dur, 0, 1));
    for (const k of ['x', 'y', 'z', 'yaw', 'pitch', 'fov']) this.cam[k] = lerp(a.from[k], a.to[k], t);
    if (a.t >= a.dur) this.camAnim = null;
  }

  /* ================= particles ================= */
  updateParticles(dt) {
    const P = this.particles, c = this.cam;
    // bolt trails
    for (const b of this.life.bolts) {
      const col = b.kind === 'misinfo' ? [1.0, 0.30, 0.68] : b.kind === 'student' ? [0.62, 0.92, 0.75] : (b.col || [0.6, 0.95, 1]);
      P.emit({ x: b.x + (Math.random() - 0.5) * 0.12, y: b.y + (Math.random() - 0.5) * 0.12, z: b.z + (Math.random() - 0.5) * 0.12,
        vx: -b.vx * 0.04, vy: -b.vy * 0.04 + 0.3, vz: -b.vz * 0.04,
        life: 0.42, size: b.kind === 'misinfo' ? 0.30 : 0.22, r: col[0], g: col[1], b: col[2],
        a0: 0.9, grav: 0, drag: 2.5, streak: true, shrink: true });
    }
    // ambient: dust motes on the station, snow on the mountain
    this._ambT = (this._ambT || 0) + dt;
    const rate = this.level === 'summit' ? 0.012 : 0.12;
    while (this._ambT > rate) {
      this._ambT -= rate;
      const a = Math.random() * TAU, r = 3 + Math.random() * 22;
      if (this.level === 'summit') {
        const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        P.emit({ x, y: c.y + 6 + Math.random() * 10, z,
          vx: (Math.random() - 0.5) * 0.8 - 0.6, vy: -1.6 - Math.random() * 1.2, vz: (Math.random() - 0.5) * 0.8,
          life: 6, size: 0.09 + Math.random() * 0.08, r: 1, g: 1, b: 1, a0: 0.85, grav: 0, drag: 0.1, shrink: false });
      } else if (this.env && this.env.night > 0.5 && Math.random() < 0.35) {
        // fireflies over the lawns on a summer night
        const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        P.emit({ x, y: groundH(x, z) + 0.4 + Math.random() * 1.6, z,
          vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.2, vz: (Math.random() - 0.5) * 0.4,
          life: 3 + Math.random() * 3, size: 0.06, r: 0.9, g: 1.0, b: 0.45, a0: 0.9, grav: 0, drag: 0.2, shrink: false });
      }
    }
    P.update(dt);
  }

  /* ================= frame ================= */
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    let dt = (now - this.last) / 1000;
    this.last = now;
    dt = Math.min(dt, 0.05);
    this.time += dt;

    this.R.resize();

    // adaptive resolution: sustained slow frames shrink the render target
    if (this.mode !== 'title') {
      this._avgDt = this._avgDt ? this._avgDt * 0.94 + dt * 0.06 : dt;
      this._qTick = (this._qTick || 0) + dt;
      if (this._qTick > 2.0) {
        this._qTick = 0;
        const q = this.R.qScale || 1;
        if (this._avgDt > 0.026 && q > 0.56) this.R.setQuality(q - 0.14);
        else if (this._avgDt < 0.0165 && q < 1) this.R.setQuality(q + 0.10);
      }
    }

    if (this.mode === 'title' && this.level === 'colloquium') {
      const t = this.time * 0.035;
      const R = 112, cx = 0, cz = -6;
      this.hour = 18.2;
      this.cam.x = cx + Math.cos(t + 2.0) * R; this.cam.z = cz + Math.sin(t + 2.0) * R;
      this.cam.y = 34 + Math.sin(t * 1.7) * 6;
      this.cam.yaw = Math.atan2(this.cam.x - cx, this.cam.z - cz);
      this.cam.pitch = -Math.atan2(this.cam.y - 6, R); this.cam.fov = 0.9;
      this.view.x = this.cam.x; this.view.y = this.cam.y; this.view.z = this.cam.z;
      this.view.yaw = this.cam.yaw; this.view.pitch = this.cam.pitch; this.view.fov = this.cam.fov; this.view.near = 0.3;
      this.fx.fade += (1 - this.fx.fade) * (1 - Math.exp(-1.2 * dt));
    }
    const paused = this.mode === 'intercept';
    if (this.mode === 'play' && !this.anyScreenOpen() && !this.camAnim && !paused) {
      if (this.level === 'summit') this.updateRider(dt);
      else if (this.vehicle) this.updateVehicle(dt);
      else this.updatePlayer(dt);
      this.updatePickups(dt);
    }
    this.applyCamAnim(dt);
    this.updateView(dt);
    Ambience.update(this, dt);
    if (this.mode === 'play') this.updateNav(dt);
    this._radarT = (this._radarT || 0) + dt;
    if (this._radarT > 0.05 && this.mode !== 'title') { this._radarT = 0; HUD.drawRadarHUD(this); }
    HUD.tickHit();

    // targeting
    if (this.mode === 'play' && !this.anyScreenOpen() && !paused) {
      this.target = this.findTarget();
      this.updateTargetHud();
      this.updateWaypoints();
    } else if (this.mode !== 'play') {
      HUD.prompt('');
      HUD.waypoints([]);
    } else {
      HUD.waypoints([]);
    }

    // ambient accent follows whichever district you are standing in
    let near = null, nd = 1e9;
    for (const d of DISTRICTS) {
      const dist = Math.hypot(this.cam.x - d.cx, this.cam.z - d.cz);
      if (dist < nd) { nd = dist; near = d; }
    }
    this._nearD = nd < R_PLATFORM + 40 ? near : null;
    if (this.mode === 'play') {
      if (nd < R_PLATFORM + 26) HUD.setAccent(near.accent, near.accent2);
      else HUD.setAccent('#ffd98a', '#fff0c4');
    }

    // objective + hud, refreshed a few times a second
    this._hudTick = (this._hudTick || 0) + dt;
    if (this._hudTick > 0.2) {
      this._hudTick = 0;
      HUD.objectivePanel(this);
      if (this.mode === 'play') HUD.showSlots(true, [], this.selSlot, this.ammo());
      const done = new Set(DISTRICTS.filter((d) => this.districtDone(d.id)).map((d) => d.id));
      void done;
    }

    // living world + combat
    if (this.mode !== 'title' && !paused) this.life.update(dt, this.time);
    if (this.level === 'colloquium' && !paused) this.traffic.update(dt, this);
    if (!paused) this.updateParticles(dt);
    this.fireCd = Math.max(0, this.fireCd - dt);
    if (this.clockRun && this.mode !== 'title') this.hour = (this.hour + dt / 120) % 24;
    this.citeCd = Math.max(0, (this.citeCd || 0) - dt);
    this.noise = Math.max(0, this.noise - dt * 0.040);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    HUD.setNoise(this.noise);

    // fx decay
    this.fx.pulse = Math.max(0, this.fx.pulse - dt * 1.5);
    this.fx.fade += (1 - this.fx.fade) * (1 - Math.exp(-3 * dt));
    this.fx.dim += ((this.anyScreenOpen() ? 0.45 : 1) - this.fx.dim) * (1 - Math.exp(-8 * dt));
    this.fx.noise = this.noise;
    this.fx.aberration = 1 + this.noise * 2.2;
    for (const p of this.pulses) p.t += dt;
    this.pulses = this.pulses.filter((p) => p.t < 1.4);

    this.draw();
  }

  aimDrone() {
    const c = this.cam;
    const fx = -Math.sin(c.yaw) * Math.cos(c.pitch);
    const fy = Math.sin(c.pitch);
    const fz = -Math.cos(c.yaw) * Math.cos(c.pitch);
    let best = null, bestDot = 0.972;
    for (const d of this.life.drones) {
      if (d.dead) continue;
      const dx = d.x - c.x, dy = d.y - c.y, dz = d.z - c.z;
      const L = Math.hypot(dx, dy, dz);
      if (L > 46) continue;
      const dot = (dx * fx + dy * fy + dz * fz) / (L || 1);
      if (dot > bestDot) { bestDot = dot; best = d; }
    }
    return best;
  }

  aimStudent() {
    const c = this.cam;
    const fx = -Math.sin(c.yaw) * Math.cos(c.pitch);
    const fy = Math.sin(c.pitch);
    const fz = -Math.cos(c.yaw) * Math.cos(c.pitch);
    let best = null, bestDot = 0.965;
    for (const s of this.life.students) {
      const dx = s.x - c.x, dy = 1.2 - c.y, dz = s.z - c.z;
      const L = Math.hypot(dx, dy, dz);
      if (L > 45) continue;
      const dot = (dx * fx + dy * fy + dz * fz) / (L || 1);
      if (dot > bestDot) { bestDot = dot; best = s; }
    }
    return best;
  }

  updateTargetHud() {
    const drone = this.aimDrone();
    if (drone && (!this.target || this.target.dist > 6)) {
      const w = QTYPES.find((q) => q.key === drone.card.weakness);
      const src = this.citeSources(drone.card);
      const who = src.length ? (this.byId[src[0].id] || {}).name : null;
      const ready = (this.citeCd || 0) <= 0;
      HUD.setReticle('lock', 1, drone.boss ? 'PEER REVIEW' : 'FEED DRONE',
        drone.scanned ? `${drone.card.technique} · COUNTER WITH ${w.name}`
                      : 'UNIDENTIFIED TECHNIQUE · FIRE TO PROBE');
      HUD.prompt(`<kbd>Click</kbd> fire ${QTYPES[this.selSlot].name}`
        + (who ? `&nbsp; · &nbsp;<kbd>C</kbd> cite ${esc(who)}${ready ? '' : ' (reloading)'}` : ''));
      if (who && !this.citeTaught) {
        this.citeTaught = true;
        HUD.banner('YOU HAVE A SOURCE FOR THIS',
          `${who} answered this kind of claim with their own work. Press C to cite them — a sourced answer also spreads to every student in earshot.`, '#ffd98a');
      }
      return;
    }
    // a student under the crosshair spells out exactly what they still need
    const st = this.aimStudent();
    if (st && (!this.target || this.target.dist > 6)) {
      const tier = this.life.tier(st);
      const q = QTYPES[st.wants];
      HUD.setReticle('lock', (tier + 1) / 4, `STUDENT · ${TIERS[tier].name.toUpperCase()}`,
        tier >= 3 ? 'FULLY EDUCATED — NOTHING MORE NEEDED'
                  : `NEEDS ${q.name}  ·  PRESS ${st.wants + 1} THEN FIRE`);
      HUD.prompt(tier >= 3 ? '' : `<kbd>${st.wants + 1}</kbd> ${q.name} &nbsp;→&nbsp; <kbd>Click</kbd>`);
      return;
    }
    const t = this.target;
    if (!t) {
      HUD.setReticle('idle', 0, null, null);
      HUD.prompt(this.level !== 'summit' && !this.zip && this.nearZip() ? '<kbd>E</kbd> ride the line' : '');
      return;
    }
    if (t.kind === 'vehicle') {
      HUD.setReticle('near', 0, t.v.type === 'bike' ? 'BICYCLE' : 'CAMPUS CART', 'BORROWED, NOT STOLEN');
      HUD.prompt(`<kbd>E</kbd> ${t.v.type === 'bike' ? 'ride the bike' : 'drive the cart'}`);
      return;
    }
    if (t.kind === 'poster') {
      const st = this.summitStatus();
      const n = st.tasks.filter((x) => x.n >= x.of).length;
      HUD.setReticle('lock', n / st.tasks.length, 'POSTER SESSION',
        st.complete ? 'OPEN — THE BAR IS THAT WAY' : `${n}/${st.tasks.length} TASKS DONE`);
      HUD.prompt(st.complete ? '<kbd>E</kbd> join the poster session' : '<kbd>E</kbd> check what is left');
      return;
    }
    if (t.kind === 'person') {
      const asked = this.progress[t.s.id] || [];
      HUD.setReticle(t.dist < 4.5 ? 'lock' : 'near', asked.length / 5, t.s.person.name,
        `${t.s.person.field.toUpperCase()} · ${asked.length}/5 LOGGED`);
      HUD.prompt(asked.length >= 5
        ? '<kbd>E</kbd> revisit the record'
        : '<kbd>E</kbd> begin interview');
    } else if (t.kind === 'vault') {
      const d = this.districtById[t.v.district];
      const v = this.vaultAnswers[t.v.district] || {};
      const n = Object.keys(v).length, tot = VAULTS[t.v.district].questions.length;
      HUD.setReticle('lock', n / tot, 'INSIGHT VAULT', `${d.name} · ${n}/${tot} ANSWERED`);
      HUD.prompt('<kbd>E</kbd> enter the vault');
    } else if (this.allSecured()) {
      HUD.setReticle('lock', 1, 'CONVOCATION', 'ALL FIVE DISTRICTS SECURED');
      HUD.prompt('<kbd>E</kbd> collect your Convocation');
    } else {
      HUD.setReticle('lock', this.securedCount() / 5, 'SYNTHESIS TERMINAL',
        `${this.connectionsFound.length}/${CONNECTIONS.length} CONNECTIONS · ${this.securedCount()}/5 SECURED`);
      HUD.prompt('<kbd>E</kbd> connect two minds');
    }
  }

  /* Opaque geometry is drawn twice a frame: once into the shadow map and
     once for real. drawMesh() routes to the depth program while a shadow
     pass is open, so this one function serves both. */
  drawOpaque(R, c) {
    const gl = this.gl;
    R.useLeaf(false);
    if (this.world.terrain) R.drawMesh(this.world.terrain, IDENT);
    if (this.world.chunks) R.drawChunks(this.world.chunks);
    else if (this.world.mesh) R.drawMesh(this.world.mesh, IDENT);
    if (this.world.water && !R.shadowPass) R.drawMesh(this.world.water, IDENT);
    for (const p of this.pickups) {
      if (this.found[p.item.id]) continue;
      M4.trs(this.tmpM2, p.x, p.y + Math.sin(this.time * 1.7 + p.x) * 0.08, p.z, this.time * 1.4 + p.z, 1, 1, 1);
      R.drawMesh(this.pageMark, this.tmpM2);
    }

    for (const s of (this.world.spinners || [])) {
      const a = this.time * s.speed;
      const m = s.spinZ
        ? xform(s.pivot, [0, s.yawFix || 0, a], [1, 1, 1])
        : xform(s.pivot, [s.tiltX || 0, a, 0], [1, 1, 1]);
      R.drawMesh(s.mesh, m);
    }

    for (const s of this.world.stations) {
      const dx = s.x - c.x, dz = s.z - c.z;
      if (dx * dx + dz * dz > 145 * 145) continue;
      // they turn toward you as you come close, and talk with their hands
      const px = this.cam.x - s.x, pz = this.cam.z - s.z, pd = Math.hypot(px, pz);
      const talking = this.talking === s;
      const want = pd < 9 ? Math.atan2(px, pz) : s.yaw;
      s.faceYaw = this.shortestYaw(s.faceYaw, want);
      if (!R.shadowPass) s.faceYaw += (want - s.faceYaw) * 0.04;
      const P = this._sPose || (this._sPose = {});
      P.state = 'idle'; P.t = this.time; P.seed = s.phase; P.talk = talking ? 1 : pd < 7 ? 0.45 : 0.12; P.aim = 0; P.hold = false;
      P.phase = 0; P.speed = 0; P.lookYaw = 0; P.lookPitch = talking ? 0.05 : 0;
      poseCharacter(s.ch, P, s.bones);
      M4.trs(s.model, s.x, (s.y || 0) + (this.level === 'summit' ? 0.3 : 0.08), s.z, s.faceYaw, 1, 1, 1);
      R.drawMesh(s.ch.mesh, s.model, { bones: s.bones });
    }

    this.life.draw(R, c, this.basis, this.time);
    if (this.level === 'colloquium') {
      for (const v of this.vehicles) {
        if ((v.x - c.x) ** 2 + (v.z - c.z) ** 2 > 160 * 160) continue;
        R.drawMesh(v.mesh, v.model);
      }
      this.traffic.draw(R, c);
    }
    this.drawAvatar(R);
    if (this.level === 'colloquium' && !R.shadowPass && (this.env ? this.env.night : 0) < 0.6) {
      const bm = this.tmpM2;
      for (const b of this.birds) {
        const a = b.a + this.time * b.sp;
        const x = b.cx + Math.cos(a) * b.r, z = b.cz + Math.sin(a) * b.r, y = b.h + Math.sin(this.time * 0.7 + b.ph) * 2;
        const flap = Math.sin(this.time * 9 + b.ph) * 0.7;
        xformTo(bm, x, y, z, 0, a + Math.PI, flap * 0.3);
        R.drawMesh(this.birdMesh, bm, { noShadow: true });
      }
    }
    if (this.world.foliage) {
      R.useLeaf(true);
      if (!R.shadowPass) gl.disable(gl.CULL_FACE);
      R.drawChunks(this.world.foliage);
      if (!R.shadowPass) gl.enable(gl.CULL_FACE);
      R.useLeaf(false);
    }
  }

  drawAvatar(R) {
    if (this.level === 'summit' || this.mode === 'title') return;
    const third = this.camMode === 'third' && this.mode !== 'talk';
    if (!third && !R.shadowPass) return;               // in first person you still cast a shadow
    const v = this.vehicle;
    const P = {
      state: v ? v.pose : (this.grounded ? (Math.hypot(this.vel.x, this.vel.z) > 0.4 ? 'walk' : 'idle') : 'air'),
      phase: this.anim.phase, speed: this.anim.speed, t: this.time, aim: this.anim.aim, hold: true,
      crank: v ? v.crank : 0, seat: v ? v.seat : 0,
    };
    poseCharacter(this.avatar, P, this.avatarBones);
    if (v) M4.mul(this.avatarM, v.model, xformTo(this.tmpM2, 0, v.riderY || 0, v.riderZ || 0, 0, 0, 0));
    else M4.trs(this.avatarM, this.cam.x, this.footY, this.cam.z, this.bodyYaw, 1, 1, 1);
    R.drawMesh(this.avatar.mesh, this.avatarM, { bones: this.avatarBones });
    // the Codex in the right hand
    const hand = this.avatarBones.subarray(BONE.HAND_R * 16, BONE.HAND_R * 16 + 16);
    const hm = M4.mul(this.tmpM, this.avatarM, hand);
    this.handWorld = [hm[12], hm[13], hm[14]];
    const bookM = M4.mul(this.tmpM2, hm, xform([0, -0.02, 0.1], [lerp(-1.3, -0.2, this.anim.aim), 0, lerp(0.2, 0, this.anim.aim)], [0.55, 0.55, 0.55]));
    R.drawMesh(this.codex.body, bookM);
    const qc = QCOLOURS[this.selSlot], armed = this.unlockedTypes().includes(QTYPES[this.selSlot].key);
    const gk = armed ? 1.0 + this.fx.pulse * 1.6 : 0.2;
    if (!R.shadowPass) R.drawMesh(this.codex.sigil, bookM, { tint: [qc[0] * gk, qc[1] * gk, qc[2] * gk] });
  }

  envNow() {
    if (this.level === 'summit') return ENV_SUMMIT;
    const e = todEnv(this.hour);
    return e;
  }

  draw() {
    const gl = this.gl, R = this.R;
    if (this.shake > 0.001) {
      const k = this.shake * this.shake * 0.055;
      this.cam.yaw += (Math.random() - 0.5) * k;
      this.cam.pitch = clamp(this.cam.pitch + (Math.random() - 0.5) * k, -1.35, 1.35);
    }
    let lightSet = this.world.lights;
    if (this.talking) {
      const t = this.talking;
      lightSet = lightSet.concat([{
        pos: [t.x + (this.cam.x - t.x) * 0.42, (t.y || 0) + 2.5, t.z + (this.cam.z - t.z) * 0.42],
        col: [1.0, 0.96, 0.90], range: 8.5, intensity: 1.6,
      }]);
    }
    const c = this.view.yaw === undefined ? this.cam : this.view;
    if (!this.viewInit && !(this.camMode === 'third')) Object.assign(this.view, { x: this.cam.x, y: this.cam.y, z: this.cam.z, yaw: this.cam.yaw, pitch: this.cam.pitch, fov: this.cam.fov });
    const env = this.envNow();
    this.env = env;
    this.basis = this.camBasis();
    const { right, up, back } = this.basis;
    R.setLights(lightSet, c.x, c.y, c.z, env.night || 0);

    /* --- 1. shadow cascades --- */
    R.time = this.time;
    R.renderShadows(c, env, () => this.drawOpaque(R, c));

    /* --- 2. scene: sky + opaque --- */
    R.beginScene(c, env, this.time);
    this.drawOpaque(R, c);

    /* --- 2b. glass panes: alpha-blended, both sides --- */
    if (this.world.glass) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false); gl.disable(gl.CULL_FACE); R.gbufWrite(false); R.useSceneProgram();
      R.drawMesh(this.world.glass, IDENT);
      gl.enable(gl.CULL_FACE); gl.depthMask(true); gl.disable(gl.BLEND); R.gbufWrite(true);
    }

    /* --- 3. transparent: beacons, glows, particles, billboards --- */
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    R.gbufWrite(false);
    R.useSceneProgram();

    for (const s of this.world.stations) {
      const dist = Math.hypot(s.x - c.x, s.z - c.z);
      if (dist > 150) continue;
      const asked = (this.progress[s.id] || []).length;
      const d = this.districtById[s.district];
      if (asked < 5) {
        const near = clamp((dist - 3) / 6, 0, 1);
        const pulse = 0.75 + 0.25 * Math.sin(this.time * 2.4 + s.phase);
        M4.trs(this.tmpM, s.x, (s.y || 0) + 0.02, s.z, this.time * 0.3, 1.25, 1, 1.25);
        R.drawMesh(this.markerMesh, this.tmpM, { alpha: 0.32 * pulse * near * (1 - asked / 7), tint: d.rgb });
      } else {
        M4.trs(this.tmpM, s.x, (s.y || 0) + s.ch.J.H + 0.75 + Math.sin(this.time * 1.1 + s.phase) * 0.08, s.z, this.time * 0.5, 0.55, 0.55, 0.55);
        R.drawMesh(this.markMesh, this.tmpM, { alpha: 0.85, tint: d.rgb2 });
      }
    }
    this.life.drawGlows(R, c, this.time);
    for (const p of this.pulses) {
      const t = p.t / 1.4;
      const sc = 2 + t * 26;
      M4.trs(this.tmpM, p.x, 0.42 + t * 1.6, p.z, 0, sc, 1, sc);
      R.drawMesh(this.pulseMesh, this.tmpM, { alpha: (1 - t) * (1 - t) * 0.75, tint: p.col });
    }

    R.drawParticles(this.particles.list, this.basis);

    this.life.drawPlates(R, c, this.basis);
    for (const s of this.world.stations) {
      const dist = Math.hypot(s.x - c.x, s.z - c.z);
      if (dist > 62) continue;
      const a = clamp((62 - dist) / 18, 0, 1) * clamp((dist - 2.2) / 2, 0, 1);
      if (a < 0.02) continue;
      const sc = 1 + Math.min(dist / 42, 0.55);
      R.drawBillboard(s.plate, [s.x, (s.y || 0) + s.ch.J.H + 0.62, s.z], 2.4 * sc, 0.7 * sc, [1, 1, 1, a], 0.2, this.basis);
    }
    for (const v of this.world.vaults) {
      const dist = Math.hypot(v.x - c.x, v.z - c.z);
      if (dist > 60) continue;
      const ready = this.districtDone(v.district);
      const a = clamp((60 - dist) / 18, 0, 1) * (ready ? 1 : 0.5);
      R.drawBillboard(v.tex, [v.x, (v.y || 0) + 5.2, v.z], 7.5, 1.75, [1, 1, 1, a], ready ? 0.3 : 0, this.basis);
    }
    if (this.level === 'colloquium' && this.world.synth) {
      const S = this.world.synth, dist = Math.hypot(S.x - c.x, S.z - c.z);
      if (dist < 60 && dist > 4) R.drawBillboard(this.atriumTex, [S.x, 4.6, S.z], 7.5, 1.75, [1, 1, 1, clamp((60 - dist) / 20, 0, 1)], 0.2, this.basis);
    }

    gl.depthMask(true);
    gl.disable(gl.BLEND);
    R.gbufWrite(true);

    /* --- 4. viewmodel: fresh depth so it never intersects the world --- */
    gl.clear(gl.DEPTH_BUFFER_BIT);
    const acc = this._nearD ? this._nearD.rgb : [1, 0.85, 0.55];
    const fw = [-back[0], -back[1], -back[2]];
    R.overrideLights([
      { pos: [c.x + up[0] * 0.55 + right[0] * 0.30, c.y + up[1] * 0.55 + right[1] * 0.30,
              c.z + up[2] * 0.55 + right[2] * 0.30], col: [0.85, 0.90, 1.0], range: 3.0, intensity: 2.1 },
      { pos: [c.x + fw[0] * 1.5 + right[0] * 0.9, c.y + fw[1] * 1.5 + right[1] * 0.9 - 0.4,
              c.z + fw[2] * 1.5 + right[2] * 0.9], col: acc, range: 3.4, intensity: 2.4 },
      { pos: [c.x - right[0] * 0.8 + up[0] * 0.1, c.y - right[1] * 0.8 + up[1] * 0.1,
              c.z - right[2] * 0.8 + up[2] * 0.1], col: [0.35, 0.45, 0.75], range: 2.6, intensity: 1.4 },
    ]);
    const bobX = Math.sin(this.bob) * 0.012 * this.bobAmt + this.sway;
    const bobY = Math.abs(Math.cos(this.bob)) * -0.010 * this.bobAmt;
    const kick = this.fx.pulse * 0.06;
    const ox = 0.40 + bobX * 1.6, oy = -0.47 + bobY * 1.6, oz = 1.00 - kick;
    const px = c.x + right[0] * ox + up[0] * oy + fw[0] * oz;
    const py = c.y + right[1] * ox + up[1] * oy + fw[1] * oz;
    const pz = c.z + right[2] * ox + up[2] * oy + fw[2] * oz;
    const basisM = this.basisM || (this.basisM = M4.create());
    basisM[0] = right[0]; basisM[1] = right[1]; basisM[2] = right[2]; basisM[3] = 0;
    basisM[4] = up[0];    basisM[5] = up[1];    basisM[6] = up[2];    basisM[7] = 0;
    basisM[8] = back[0];  basisM[9] = back[1];  basisM[10] = back[2]; basisM[11] = 0;
    basisM[12] = px;      basisM[13] = py;      basisM[14] = pz;      basisM[15] = 1;

    const postState = Object.assign({}, this.fx, env.post || {});

    if (this.level === 'summit') {
      const P = this.ride;
      const bob = Math.sin(this.bob) * 0.012 * this.bobAmt + (P.landT || 0) * 0.09;
      const bvm = M4.mul(this.tmpM, basisM,
        xform([0, 0, 0], [0.02, P.lean * 0.30, -P.lean * 0.55], [1, 1, 1]));
      const bd = 2.95, bh = -1.34 - bob;
      bvm[12] = c.x + up[0] * bh + fw[0] * bd;
      bvm[13] = c.y + up[1] * bh + fw[1] * bd;
      bvm[14] = c.z + up[2] * bh + fw[2] * bd;
      R.drawMesh(this.rideModel, bvm);
      R.post(postState);
      return;
    }
    if (this.camMode === 'third' && this.mode !== 'talk') { R.post(postState); return; }
    /* the Codex: a large open tome; the sigil on the right page is the muzzle */
    this.pageTurn = Math.max(0, this.pageTurn - Math.max(0, this.time - this._pt) * 3.4); this._pt = this.time;
    const sel = this.selSlot;
    const unlocked = this.unlockedTypes();
    const armed = unlocked.includes(QTYPES[sel].key);
    const recoil = this.fx.pulse;
    const vm = M4.mul(this.tmpM, basisM, xform([0, 0, 0], [0.80 - recoil * 0.30, 0.30, 0.05], [1, 1, 1]));
    R.drawMesh(this.codex.body, vm);
    const qc = QCOLOURS[sel];
    const glowK = armed ? 1.05 + recoil * 1.8 + 0.15 * Math.sin(this.time * 3.1) : 0.16;
    R.drawMesh(this.codex.sigil, vm, { tint: [qc[0] * glowK, qc[1] * glowK, qc[2] * glowK] });
    for (let i = 0; i < 5; i++) {
      const c2 = QCOLOURS[i];
      let k = i === sel ? 1.0 : 0.28;
      if (this.mode === 'talk' && this.talking) k = (this.progress[this.talking.id] || []).includes(QTYPES[i].key) ? 1 : 0.12;
      else if (!unlocked.includes(QTYPES[i].key)) k *= 0.35;
      R.drawMesh(this.codex.tabs[i], vm, { tint: [c2[0] * k, c2[1] * k, c2[2] * k] });
    }
    if (this.pageTurn > 0) {
      const a = (1 - this.pageTurn) * (Math.PI - 2 * CODEX.theta);
      const pm = M4.mul(this.tmpM2, vm, xform([0, 0, 0], [0, 0, a], [1, 1, 1]));
      R.drawMesh(this.codex.page, pm);
    }
    R.post(postState);
  }
}

/* ================= boot ================= */
window.addEventListener('DOMContentLoaded', () => {
  try {
    window.GAME = new Game();
  } catch (e) {
    console.error(e);
    const el = document.getElementById('crash');
    if (el && !el.classList.contains('on')) {
      document.getElementById('crash-msg').textContent = String(e && e.message || e);
      el.classList.add('on');
      document.getElementById('title').classList.remove('on');
    }
  }
});
