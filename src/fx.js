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
