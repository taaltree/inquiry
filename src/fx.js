/* ============================================================
   fx.js — CPU particle pool. Cheap objects, updated in place,
   handed to Renderer.drawParticles() as-is.

   A particle is {x,y,z, vx,vy,vz, life,max, size, r,g,b, a0,
   grav, drag, streak, shrink}. The renderer reads x,y,z, ax,ay,az
   (streak axis, zero for a disc), r,g,b,a, sx,sy — which update()
   fills in every frame.
   ============================================================ */

class Particles {
  constructor(max = 2400) {
    this.max = max;
    this.items = [];
  }

  emit(p) {
    if (this.items.length >= this.max) this.items.shift();
    p.life = p.max = p.life || 1;
    p.a = p.a0 == null ? 1 : p.a0;
    p.grav = p.grav == null ? 0 : p.grav;
    p.drag = p.drag == null ? 0 : p.drag;
    p.ax = 0; p.ay = 0; p.az = 0;
    p.sx = p.size; p.sy = p.size;
    this.items.push(p);
    return p;
  }

  /* a radial burst */
  burst(x, y, z, n, o) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, b = (Math.random() - 0.5) * Math.PI;
      const sp = (o.speed || 4) * (0.35 + Math.random() * 0.9);
      const c = o.cols ? o.cols[(Math.random() * o.cols.length) | 0] : (o.col || [1, 1, 1]);
      this.emit({
        x, y, z,
        vx: Math.cos(a) * Math.cos(b) * sp + (o.vx || 0),
        vy: Math.sin(b) * sp + (o.vy || 0),
        vz: Math.sin(a) * Math.cos(b) * sp + (o.vz || 0),
        life: (o.life || 0.8) * (0.6 + Math.random() * 0.7),
        size: (o.size || 0.18) * (0.6 + Math.random() * 0.8),
        r: c[0], g: c[1], b: c[2], a0: o.alpha == null ? 1 : o.alpha,
        grav: o.grav == null ? -6 : o.grav, drag: o.drag == null ? 1.2 : o.drag,
        streak: !!o.streak, shrink: o.shrink == null ? true : o.shrink,
      });
    }
  }

  update(dt) {
    const it = this.items;
    let w = 0;
    for (let i = 0; i < it.length; i++) {
      const p = it[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += p.grav * dt;
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const t = p.life / p.max;
      p.a = (p.a0 == null ? 1 : p.a0) * Math.min(1, t * 2.2);
      const s = p.shrink ? p.size * (0.35 + 0.65 * t) : p.size;
      if (p.streak) {
        const sp = Math.hypot(p.vx, p.vy, p.vz);
        const k = sp > 0.01 ? Math.min(0.9, sp * 0.05) / sp : 0;
        p.ax = p.vx * k; p.ay = p.vy * k; p.az = p.vz * k;
        p.sx = s * 0.55; p.sy = s * 2.6;
      } else { p.ax = 0; p.ay = 0; p.az = 0; p.sx = s; p.sy = s; }
      it[w++] = p;
    }
    it.length = w;
  }

  get list() { return this.items; }
}


/* ============================================================
   Ambience — a quiet procedural soundscape: wind through the trees,
   birdsong by day, crickets after dark, a freewheel ticking on a bike.
   Everything is synthesised; nothing is loaded.
   ============================================================ */
const Ambience = {
  started: false, t: 0, birdT: 2, crickT: 0,
  start() {
    if (this.started || !Sfx.ctx) return;
    this.started = true;
    const ctx = Sfx.ctx;
    // wind: brown noise through a slowly wandering low-pass
    const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'lowpass'; this.windF.frequency.value = 420;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    src.connect(this.windF); this.windF.connect(this.windG); this.windG.connect(ctx.destination);
    src.start();
  },
  chirp(f0, f1, dur, gain, delay = 0) {
    const ctx = Sfx.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  },
  update(game, dt) {
    if (!Sfx.on || !Sfx.ctx || game.mode === 'title') return;
    this.start();
    if (!this.windG) return;
    const night = game.env ? game.env.night || 0 : 0;
    const outdoorsK = game.level === 'summit' ? 1.6 : 1;
    this.t += dt;
    const gust = 0.5 + 0.5 * Math.sin(this.t * 0.23) * Math.sin(this.t * 0.071 + 1);
    const speed = game.vehicle ? Math.min(1, Math.abs(game.vehicle.speed) / 12) : 0;
    this.windG.gain.value = (0.012 + 0.014 * gust + speed * 0.03) * outdoorsK;
    this.windF.frequency.value = 280 + gust * 380 + speed * 900;
    if (game.level !== 'colloquium') return;
    // birdsong by day: short phrases of two or three rising notes
    this.birdT -= dt;
    if (night < 0.4 && this.birdT <= 0) {
      this.birdT = 1.5 + Math.random() * 4;
      const base = 2400 + Math.random() * 1800, n = 2 + (Math.random() * 3 | 0);
      for (let i = 0; i < n; i++) this.chirp(base * (1 + i * 0.08), base * (1.25 + i * 0.1), 0.09 + Math.random() * 0.05, 0.006 + Math.random() * 0.006, i * 0.13);
    }
    // crickets after dark
    this.crickT -= dt;
    if (night > 0.5 && this.crickT <= 0) {
      this.crickT = 0.35 + Math.random() * 0.6;
      for (let i = 0; i < 3; i++) this.chirp(4300, 4200, 0.035, 0.004, i * 0.06);
    }
    // a freewheel ticking when you coast on a bike
    const v = game.vehicle;
    if (v && v.type === 'bike' && Math.abs(v.speed) > 1 && !(game.keys['w'] || game.keys['arrowup'])) {
      this.tickT = (this.tickT || 0) - dt;
      if (this.tickT <= 0) { this.tickT = 0.9 / Math.max(2, Math.abs(v.speed)); this.chirp(5200, 5000, 0.012, 0.004); }
    }
  },
};
