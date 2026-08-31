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
  { id: 'colloquium', n: 1, name: 'THE COLLOQUIUM', sub: 'A research station, on foot',
    blurb: 'Twenty-four scientists across five discipline districts. Walk, interview, teach, and secure all five.' },
  { id: 'summit', n: 2, name: 'THE SUMMIT', sub: 'A mountain conference, on a snowboard',
    blurb: 'A residential meeting at altitude. Six professors hold sessions down the run, grad students ride it with you, and the feed is airborne. Ends at the poster session.' },
];
const PLAYER_R = 0.42;

const ENV = {
  sunDir: (() => { const v = [0.36, 0.72, 0.59]; const L = Math.hypot(...v); return v.map((x) => x / L); })(),
  sunCol: hex2rgb('#8fa8d8').map((c) => c * 0.44),
  ambSky: hex2rgb('#1d2947').map((c) => c * 0.64),
  ambGround: hex2rgb('#0a0710').map((c) => c * 1.1),
  fog: hex2rgb('#02030a'),
  fogDensity: 0.0034,
  skyTop: hex2rgb('#010206'),
  skyHorizon: hex2rgb('#060911'),
};

const ENV_SUMMIT = {
  sunDir: (() => { const v = [-0.42, 0.44, 0.79]; const L = Math.hypot(...v); return v.map((x) => x / L); })(),
  sunCol: hex2rgb('#ffd7a8').map((c) => c * 0.72),
  ambSky: hex2rgb('#7fa6d8').map((c) => c * 0.72),
  ambGround: hex2rgb('#9fb8d8').map((c) => c * 0.62),   // light bouncing off snow
  fog: hex2rgb('#8ba6c8'),
  fogDensity: 0.0021,
  skyTop: hex2rgb('#132747'),
  skyHorizon: hex2rgb('#c98f6b'),
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
      s.mesh = buildFigure(gl, p, d.rgb, d.rgb2);
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

    this.device = buildDevice(gl);
    this.rideModel = buildRideModel(gl);
    this.pips = buildDevicePips(gl);
    this.pulseMesh = buildPulseRing(gl);
    this.beaconMesh = buildBeacon(gl);
    this.markMesh = buildCompleteMark(gl);

    /* ---- player ---- */
    this.cam = { x: 12.5, y: EYE, z: 12.5, yaw: Math.PI / 4, pitch: 0.10, fov: 1.31 };
    this.vel = { x: 0, z: 0 };
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
    this.camAnim = null;
    this.visited = new Set();
    this.noise = 0; this.shake = 0; this.fireCd = 0;
    this.feedCleared = this.feedCleared || {};   // district id -> drones dismantled there
    this.secured = this.secured || {};           // district id -> true
    this.taught = this.taught || 0;
    this.rescued = this.rescued || 0;
    this.debunked = this.debunked || 0;
    this.tmpM = M4.create();

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
      s.mesh = buildFigure(gl, p, hex2rgb('#7fd4ff'), hex2rgb('#bfe6ff'));
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
      this.life = this.lives.colloquium;
      this.cam.x = 12.5; this.cam.z = 12.5; this.cam.y = EYE;
      this.cam.yaw = Math.PI / 4; this.cam.pitch = 0.10; this.cam.fov = 1.31;
      this.cam.roll = 0; this.rideRoll = 0;
    }
    this.noise = 0; this.target = null; this.talking = null; this.camAnim = null;
    HUD.setLevel(this);
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
        feed: this.feedCleared, secured: this.secured,
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
      if (e.button === 2) return;                       // right button handled below
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
      L.down = true;
      L.moved = 0;
      L.t0 = performance.now();
      L.lastX = e.clientX; L.lastY = e.clientY;
      if (this.mode === 'talk') return;
      if (L.locked) this.fire();                        // true FPS: fire on press
    });

    const applyLook = (dx, dy, sens) => {
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
    cv.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.mode === 'play' && !this.anyScreenOpen()) this.interact();
    });

    /* ---- keyboard ---- */
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'tab') { e.preventDefault(); this.toggleCodex(); return; }
      if (k === 'escape') {
        if (this.mode === 'intercept') { e.preventDefault(); if (this.intercept.done) this.closeIntercept(); }
        else if (this.anyScreenOpen()) { e.preventDefault(); this.closeAllScreens(); }
        else if (this.mode === 'talk') this.endInterview();
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
      if (k === ' ' || k === 'f') {
        if (this.mode === 'intercept') { if (this.intercept.done) this.closeIntercept(); }
        else if (this.mode === 'talk') HUD.skipType();
        else this.fire();
        return;
      }
      if (k === 'q') { this.cycleSlot(-1); return; }
      if (k === 'r') { this.cycleSlot(1); return; }
      if (k === 'm') { this.route(); return; }
    });

    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.look.down = false; });
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
    this.selSlot = clamp(i, 0, 4);
    HUD.showSlots(true, [], this.selSlot, this.ammo());
    Sfx.blip();
  }

  cycleSlot(dir) { this.selectSlot((this.selSlot + dir + 5) % 5); }

  anyScreenOpen() {
    return ['codex', 'quiz', 'synth', 'endgame', 'win', 'poster', 'levels'].some((id) => document.getElementById(id).classList.contains('on'));
  }

  closeAllScreens() {
    ['codex', 'quiz', 'synth', 'endgame', 'win', 'poster'].forEach((id) => this.closeScreen(id));
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
    document.getElementById('hud').classList.add('on');
    this.mode = 'play';
    this.fx.fade = 0;
    this.canvas.requestPointerLock();
    this.refreshSecured();
    HUD.showSlots(true, [], this.selSlot, this.ammo());
    HUD.controlMode(this.look.locked ? 'lock' : 'drag');
    HUD.log('<b>ARRIVAL</b> — atrium of the Colloquium. Twenty-four records online.');
    HUD.log('Your device carries five questions. All five, on everyone, is the goal.');
    Sfx.open();
    this.route();
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
    if (this.level === 'summit' && this.world.finish) {
      const f = this.world.finish;
      // the marquee is a place you stand in, not something you aim at
      consider({ kind: 'poster' }, f.x, f.z, 42, -1.01);   // works whichever way you face
    }
    for (const v of this.world.vaults) {
      if (!this.districtDone(v.district)) continue;
      consider({ kind: 'vault', v }, v.x, v.z, 8.0, 0.72);
    }
    if (this.countInterviews() >= 2 || this.allSecured()) consider({ kind: 'synth' }, 0, 0, 9.0, 0.55);
    return best;
  }

  interact() {
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
      to: { x: tx, y: groundY + 2.05, z: tz, yaw: this.shortestYaw(this.cam.yaw, yaw), pitch: -0.055, fov: 1.16 },
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
        to: { x: this.cam.x, y: EYE, z: this.cam.z, yaw: this.cam.yaw, pitch: this.cam.pitch, fov: 1.31 },
      };
    }
    this.talking = null;
    HUD.showSlots(true, [], this.selSlot, this.ammo());
  }

  ask(slot) {
    if (this.mode !== 'talk' || !this.talking) return;
    if (HUD.skipType()) return;                       // first press finishes the current text
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
      }
    } else {
      Sfx.blip();
    }
  }

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
    const fwd = [-bs.back[0], -bs.back[1], -bs.back[2]];
    const muzzle = [
      c.x + bs.right[0] * 0.30 + bs.up[0] * -0.20 + fwd[0] * 1.1,
      c.y + bs.right[1] * 0.30 + bs.up[1] * -0.20 + fwd[1] * 1.1,
      c.z + bs.right[2] * 0.30 + bs.up[2] * -0.20 + fwd[2] * 1.1,
    ];
    const col = QCOLOURS[this.selSlot];
    this.life.fireInsight(muzzle, fwd, q.key, col);
    this.fx.pulse = Math.max(this.fx.pulse, 0.45);
    this.fx.pulseHue = this.selSlot === 4 ? 1 : 0;
    Sfx.tone(620 + this.selSlot * 90, 0.13, 'triangle', 0.032, 1400);
  }

  onInsightHitsDrone(d, qtype) {
    if (qtype === d.card.weakness) {
      d.dying = 0.5; d.dead = true;
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
  onMisinfoHitsPlayer(b) {
    this.shake = 0.55;
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

  /* the "recalculate route" key */
  route() {
    const next = this.nextObjective();
    if (next) {
      HUD.log(`<b>ROUTE</b> — ${esc(next.title)}`);
      Sfx.blip();
    }
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
  canStand(x, z) {
    if (!isWalkable(x, z)) return false;
    for (const c of this.colliders) {
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
    if (isWalkable(nx, nz)) { px = nx; pz = nz; }
    else {
      if (isWalkable(nx, c.z)) px = nx;
      if (isWalkable(c.x, nz)) pz = nz;
    }
    const preX = px, preZ = pz;

    for (let iter = 0; iter < 3; iter++) {
      let hit = false;
      for (const col of this.colliders) {
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

    if (isWalkable(px, pz)) { c.x = px; c.z = pz; }
    else if (this.canStand(preX, preZ)) { c.x = preX; c.z = preZ; }
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
    const speed = sprint ? 12.2 : 6.4;

    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
    const wx = (fx * iz + rx * ix) * speed;
    const wz = (fz * iz + rz * ix) * speed;

    const k = 1 - Math.exp(-14 * dt);
    this.vel.x += (wx - this.vel.x) * k;
    this.vel.z += (wz - this.vel.z) * k;

    const bx = c.x, bz = c.z;
    this.resolveMove(this.vel.x * dt, this.vel.z * dt);
    // bleed off velocity in whichever axis actually got stopped
    if (Math.abs(c.x - bx) < Math.abs(this.vel.x * dt) * 0.5) this.vel.x *= 0.3;
    if (Math.abs(c.z - bz) < Math.abs(this.vel.z * dt) * 0.5) this.vel.z *= 0.3;

    // head bob and lean
    const spd = Math.hypot(this.vel.x, this.vel.z);
    this.bobAmt += (Math.min(spd / 6.4, 1.35) - this.bobAmt) * (1 - Math.exp(-9 * dt));
    this.bob += dt * spd * 1.42;
    this.sway += ((ix * -0.022) - this.sway) * (1 - Math.exp(-7 * dt));
    const targetFov = 1.31 + (sprint ? 0.10 : 0) * Math.min(spd / 9, 1);
    c.fov += (targetFov - c.fov) * (1 - Math.exp(-6 * dt));
    c.y = EYE + Math.sin(this.bob * 2) * 0.036 * this.bobAmt;
  }

  applyCamAnim(dt) {
    const a = this.camAnim;
    if (!a) return;
    a.t += dt;
    const t = smoothstep(clamp(a.t / a.dur, 0, 1));
    for (const k of ['x', 'y', 'z', 'yaw', 'pitch', 'fov']) this.cam[k] = lerp(a.from[k], a.to[k], t);
    if (a.t >= a.dur) this.camAnim = null;
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

    const paused = this.mode === 'intercept';
    if (this.mode === 'play' && !this.anyScreenOpen() && !this.camAnim && !paused) {
      if (this.level === 'summit') this.updateRider(dt); else this.updatePlayer(dt);
    }
    this.applyCamAnim(dt);

    // targeting
    if (this.mode === 'play' && !this.anyScreenOpen() && !paused) {
      this.target = this.findTarget();
      this.updateTargetHud();
    } else if (this.mode !== 'play') {
      HUD.prompt('');
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
      if (this.level === 'colloquium') {
        HUD.updateCompass(this.cam.yaw, this.cam.x, this.cam.z, done);
        HUD.drawMap(this);
      }
    }

    // living world + combat
    if (this.mode !== 'title' && !paused) this.life.update(dt, this.time);
    this.fireCd = Math.max(0, this.fireCd - dt);
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
      HUD.setReticle('lock', 1, 'FEED DRONE',
        drone.scanned ? `${drone.card.technique} · COUNTER WITH ${w.name}`
                      : 'UNIDENTIFIED TECHNIQUE · FIRE TO PROBE');
      HUD.prompt(`<kbd>Click</kbd> fire ${QTYPES[this.selSlot].name}`);
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
    if (!t) { HUD.setReticle('idle', 0, null, null); HUD.prompt(''); return; }
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

  draw() {
    const gl = this.gl, R = this.R;
    // brief camera kick when the feed lands a hit
    if (this.shake > 0.001) {
      const k = this.shake * this.shake * 0.055;
      this.cam.yaw += (Math.random() - 0.5) * k;
      this.cam.pitch = clamp(this.cam.pitch + (Math.random() - 0.5) * k, -1.35, 1.35);
    }
    // during an interview, add a key light between camera and subject
    let lightSet = this.world.lights;
    if (this.talking) {
      const t = this.talking;
      lightSet = lightSet.concat([{
        pos: [t.x + (this.cam.x - t.x) * 0.42, (t.y || 0) + 2.5, t.z + (this.cam.z - t.z) * 0.42],
        col: [1.0, 0.96, 0.90], range: 8.5, intensity: 1.6,
      }]);
    }
    R.setLights(lightSet, this.cam.x, this.cam.y, this.cam.z);
    R.beginScene(this.cam, this.level === 'summit' ? ENV_SUMMIT : ENV, this.time);

    // camera basis, reused for billboards and the viewmodel
    const c = this.cam;
    this.basis = this.camBasis();
    const { right, up, back } = this.basis;

    /* --- static world --- */
    if (this.world.terrain) R.drawMesh(this.world.terrain, IDENT);
    R.drawMesh(this.world.mesh, IDENT);

    /* --- spinners --- */
    for (const s of this.world.spinners) {
      const a = this.time * s.speed;
      let m;
      if (s.spinZ) {
        m = xform(s.pivot, [0, s.yawFix || 0, a], [1, 1, 1]);
      } else {
        m = xform(s.pivot, [s.tiltX || 0, a, 0], [1, 1, 1]);
      }
      R.drawMesh(s.mesh, m);
    }

    /* --- scientist figures --- */
    for (const s of this.world.stations) {
      const dx = s.x - c.x, dz = s.z - c.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 145 * 145) continue;
      const bobY = Math.sin(this.time * 0.9 + s.phase) * 0.022;
      const turn = Math.sin(this.time * 0.32 + s.phase) * 0.10;
      const isTarget = this.target && this.target.kind === 'person' && this.target.s === s;
      const talking = this.talking === s;
      M4.trs(s.model, s.x, (s.y || 0) + 0.38 + bobY, s.z, s.yaw + turn, 1, 1, 1);
      const glowUp = talking ? 1.55 : isTarget ? 1.28 : 1;
      R.drawMesh(s.mesh, s.model, { holo: true, emissive: 0.26 * glowUp, tint: [glowUp, glowUp, glowUp] });
    }

    /* --- students and drones: solid, lit normally, no hologram shading --- */
    this.life.draw(R, c, this.basis, this.time);

    /* --- transparent VFX: beacons, pulses, completion marks --- */
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    R.useSceneProgram();

    for (const s of this.world.stations) {
      const dx = s.x - c.x, dz = s.z - c.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 150) continue;
      const asked = (this.progress[s.id] || []).length;
      const d = this.districtById[s.district];
      if (asked < 5) {
        const fade = clamp((dist - 5) / 10, 0, 1) * (1 - asked / 6.5);
        if (fade > 0.01) {
          M4.trs(this.tmpM, s.x, (s.y || 0), s.z, 0, 1, 1, 1);
          R.drawMesh(this.beaconMesh, this.tmpM,
            { alpha: 0.055 * fade * (0.8 + 0.2 * Math.sin(this.time * 2 + s.phase)), tint: d.rgb });
        }
      } else {
        M4.trs(this.tmpM, s.x, (s.y || 0) + 2.9 + Math.sin(this.time * 1.1 + s.phase) * 0.10, s.z, this.time * 0.5, 1, 1, 1);
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

    /* --- billboards --- */
    this.life.drawPlates(R, c, this.basis);
    for (const s of this.world.stations) {
      const dist = Math.hypot(s.x - c.x, s.z - c.z);
      if (dist > 62) continue;
      const a = clamp((62 - dist) / 18, 0, 1) * clamp((dist - 2.2) / 2, 0, 1);
      if (a < 0.02) continue;
      const d = this.districtById[s.district];
      const sc = 1 + Math.min(dist / 42, 0.55);
      R.drawBillboard(s.plate, [s.x, (s.y || 0) + 2.62, s.z], 3.0 * sc, 0.875 * sc, [1, 1, 1, a], 0.3, this.basis);
      void d;
    }
    for (const d of (this.level === 'colloquium' ? DISTRICTS : [])) {
      const dist = Math.hypot(d.cx - c.x, d.cz - c.z);
      if (dist > 190) continue;
      const gx = d.cx - Math.cos(d.angle) * (R_PLATFORM - 4);
      const gz = d.cz - Math.sin(d.angle) * (R_PLATFORM - 4);
      const gd = Math.hypot(gx - c.x, gz - c.z);
      const a = clamp((150 - gd) / 40, 0, 1);
      if (a < 0.02) continue;
      R.drawBillboard(d.signTex, [gx, 11.5, gz], 26, 8.7, [1, 1, 1, a], 0.25, this.basis);
    }
    for (const v of this.world.vaults) {
      const dist = Math.hypot(v.x - c.x, v.z - c.z);
      if (dist > 80) continue;
      const ready = this.districtDone(v.district);
      const a = clamp((80 - dist) / 22, 0, 1) * (ready ? 1 : 0.4);
      R.drawBillboard(v.tex, [v.x, 10.4, v.z], 13, 3.05, [1, 1, 1, a], ready ? 0.4 : 0, this.basis);
    }
    if (this.level === 'colloquium') {
      const dist = Math.hypot(c.x, c.z);
      if (dist < 70 && dist > 6) {
        const a = clamp((70 - dist) / 26, 0, 1);
        R.drawBillboard(this.atriumTex, [0, 13.8, 0], 14, 3.3, [1, 1, 1, a], 0.35, this.basis);
      }
    }

    gl.depthMask(true);
    gl.disable(gl.BLEND);

    /* --- viewmodel: clear depth so it never intersects the world --- */
    gl.clear(gl.DEPTH_BUFFER_BIT);
    // light it from the camera, tinted by the district, so it never sinks into the dark
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
    const ox = 0.625 + bobX * 1.6, oy = -0.455 + bobY * 1.6, oz = 1.30 - kick;
    const px = c.x + right[0] * ox + up[0] * oy + fw[0] * oz;
    const py = c.y + right[1] * ox + up[1] * oy + fw[1] * oz;
    const pz = c.z + right[2] * ox + up[2] * oy + fw[2] * oz;
    const basisM = this.basisM || (this.basisM = M4.create());
    basisM[0] = right[0]; basisM[1] = right[1]; basisM[2] = right[2]; basisM[3] = 0;
    basisM[4] = up[0];    basisM[5] = up[1];    basisM[6] = up[2];    basisM[7] = 0;
    basisM[8] = back[0];  basisM[9] = back[1];  basisM[10] = back[2]; basisM[11] = 0;
    basisM[12] = px;      basisM[13] = py;      basisM[14] = pz;      basisM[15] = 1;
    // angle the instrument inward and up a touch so it reads as held, not floating
    if (this.level === 'summit') {
      const P = this.ride;
      const bob = Math.sin(this.bob) * 0.012 * this.bobAmt + (P.landT || 0) * 0.09;
      const bvm = M4.mul(this.tmpM, basisM,
        xform([0, 0, 0], [0.02, P.lean * 0.30, -P.lean * 0.55], [1, 1, 1]));
      // sit the board below the eye, nose away
      // far enough forward that it sits inside the frustum, low in frame
      const bd = 2.95, bh = -1.34 - bob;
      bvm[12] = c.x + up[0] * bh + fw[0] * bd;
      bvm[13] = c.y + up[1] * bh + fw[1] * bd;
      bvm[14] = c.z + up[2] * bh + fw[2] * bd;
      R.drawMesh(this.rideModel, bvm);
      R.post(this.fx);
      return;
    }
    const vm = M4.mul(this.tmpM, basisM, xform([0, 0, 0], [0.13, 0.42, -0.11], [1, 1, 1]));
    R.drawMesh(this.device, vm);
    for (let i = 0; i < 5; i++) {
      const lit = this.mode === 'talk' && this.talking
        ? ((this.progress[this.talking.id] || []).includes(QTYPES[i].key) ? 1 : 0.14)
        : 0.18 + 0.14 * Math.sin(this.time * 2 + i * 1.1);
      R.drawMesh(this.pips[i], vm, { tint: [lit, lit, lit] });
    }

    R.post(this.fx);
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
