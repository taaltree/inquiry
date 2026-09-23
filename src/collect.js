/* ============================================================
   collect.js — things to find, and things to do between interviews.

     · 24 overdue library books hidden around campus, each a classic of
       science with a line on why it mattered; every six unlock something
     · the bicycle collection: five odd bikes to find, a golden one to earn
     · twelve noticeboards the feed has plastered with nonsense: pin up
       what the scientists told you and passers-by read it
     · five stunt ramps, GTA-style: hit them fast enough to clear the gap
   ============================================================ */

const BOOK_REWARDS = [
  { at: 6, key: 'run', title: 'LIBRARY CARD', sub: 'Six books returned. You know the shortcuts now: you run a little faster.' },
  { at: 12, key: 'splash', title: 'ANNOTATED EDITION', sub: 'Twelve returned. An insight that lands now reaches someone standing next to them too.' },
  { at: 18, key: 'map', title: 'THE CATALOGUE', sub: 'Eighteen returned. Every missing book and bicycle is marked on your radar and map.' },
  { at: 24, key: 'golden', title: 'THE CHANCELLOR\'S BICYCLE', sub: 'Every book returned. A golden bicycle is waiting on the library steps.' },
];
const BOOK_COLS = ['#7a1f24', '#1f3a6a', '#2a5a34', '#6a4a1a', '#4a2a5a', '#1a4a4a', '#5a1a3a', '#3a3a3a'];

function buildBookMeshes(gl) {
  return BOOK_COLS.map((c) => {
    const b = new Builder(256);
    const cover = mat(TX.FABRIC, LIN(c).map((v) => v * 2.2), { uv: 'local', tile: 0.12, rough: 0.6, glow: 0.12 });
    const gold = mat(0, [1.0, 0.75, 0.3], { rough: 0.3, metal: 1, glow: 0.25 });
    b.add(BOX, xform([0, 0, 0], [0, 0, 0], [0.05, 0.25, 0.18]), cover);
    b.add(BOX, xform([0.004, 0, 0.004], [0, 0, 0], [0.042, 0.236, 0.18]), mat(0, [0.86, 0.82, 0.7], { rough: 0.9 }));
    for (const y of [-0.08, 0.08]) b.add(BOX, xform([-0.001, y, -0.09], [0, 0, 0], [0.052, 0.012, 0.004]), gold);
    return b.upload(gl);
  });
}

/* the feed's flyers: loud, pink, and saying nothing */
function feedBoardTexture(gl) {
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 420;
  const c = cv.getContext('2d');
  c.fillStyle = '#5a3a22'; c.fillRect(0, 0, 640, 420);
  const flyer = (x, y, w, h, rot, bg, fg, lines) => {
    c.save(); c.translate(x, y); c.rotate(rot);
    c.fillStyle = bg; c.fillRect(-w / 2, -h / 2, w, h);
    c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
    const total = lines.reduce((a, [, size]) => a + size + 8, -8);
    let ly = -total / 2;
    for (const [t, size, weight] of lines) { c.font = `${weight || 800} ${size}px "Helvetica Neue", Arial, sans-serif`; c.fillText(t, 0, ly + size / 2); ly += size + 8; }
    c.restore();
  };
  flyer(170, 150, 270, 240, -0.08, '#ff3fa8', '#fff', [['YOU WON\'T', 32], ['BELIEVE', 32], ['WHAT THEY\'RE', 28], ['HIDING', 32], ['share before it\'s deleted', 16, 500]]);
  flyer(460, 130, 250, 200, 0.07, '#ffe14a', '#1a1a1a', [['DOCTORS', 38], ['HATE THIS', 38], ['one weird trick', 20, 600], ['❤ 48.2K  ↻ 12K', 22, 700]]);
  flyer(300, 310, 280, 170, 0.03, '#b44aff', '#fff', [['DO YOUR', 34], ['OWN RESEARCH', 30], ['(watch this video)', 18, 500]]);
  return texFromCanvas(gl, cv);
}

/* your notice: what a scientist told you, and who said it */
function yourBoardTexture(gl, concept, who, field, hex, qname) {
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 420;
  const c = cv.getContext('2d');
  c.fillStyle = '#5a3a22'; c.fillRect(0, 0, 640, 420);
  c.save(); c.translate(320, 210); c.rotate(-0.015);
  c.fillStyle = '#f4eedf'; c.fillRect(-270, -180, 540, 360);
  c.fillStyle = hex || '#2a5ab8'; c.fillRect(-270, -180, 540, 66);
  const rgb = hex2rgb(hex || '#2a5ab8'), lum = 0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2];
  c.fillStyle = lum > 0.6 ? '#1b2330' : '#fff'; c.font = '800 38px "Helvetica Neue", Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('DID YOU KNOW?', 0, -147);
  c.fillStyle = '#1b2330'; c.font = '700 34px Georgia, "Times New Roman", serif';
  // wrap the concept onto up to four lines
  const words = String(concept).split(/\s+/), lines = [];
  let cur = '';
  for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (c.measureText(t).width > 480 && cur) { lines.push(cur); cur = wd; } else cur = t; }
  if (cur) lines.push(cur);
  const nl = Math.min(lines.length, 4), y0 = -22 - (nl - 1) * 22;
  lines.slice(0, 4).forEach((ln, i) => c.fillText(ln, 0, y0 + i * 44));
  if (qname) { c.fillStyle = '#6a7280'; c.font = '600 17px "Helvetica Neue", Arial, sans-serif'; c.fillText(`THE ANSWER TO A ${qname} QUESTION`, 0, y0 + nl * 44 + 4); }
  c.fillStyle = '#4a5260'; c.font = 'italic 500 24px Georgia, serif';
  c.fillText(`— ${who}${field ? ', ' + field : ''}`, 0, 118);
  c.font = '600 16px "Helvetica Neue", Arial, sans-serif'; c.fillStyle = '#8a8f98';
  c.fillText('ASK ME ABOUT IT', 0, 156);
  c.restore();
  return texFromCanvas(gl, cv);
}

Object.assign(Game.prototype, {
  initCollect() {
    const W = this.worlds.colloquium.world, gl = this.gl;
    this.booksFound = this.booksFound || {};
    this.bikesFound = this.bikesFound || {};
    this.boardsDone = this.boardsDone || {};
    this.jumpsDone = this.jumpsDone || {};
    this.bookItems = (W.bookSpots || []).map((sp, i) => ({ ...sp, book: BOOKS[i], i })).filter((b) => b.book);
    this.bookMeshes = buildBookMeshes(gl);
    this.feedTex = feedBoardTexture(gl);
    this.boards = (W.boards || []).map((b, i) => ({ ...b, i, tex: null }));
    for (const b of this.boards) {
      const d = this.boardsDone[b.where];
      if (d) b.tex = yourBoardTexture(gl, d.concept, d.who, d.field, d.hex, d.q);
    }
    this.ramps = W.ramps || [];
    this.timeScale = 1;
    this.applyBookPerks(true);
  },

  booksCount() { return Object.keys(this.booksFound || {}).length; },
  perk(key) { const r = BOOK_REWARDS.find((q) => q.key === key); return !!r && this.booksCount() >= r.at; },
  applyBookPerks(quiet) {
    const golden = (this.vehicles || []).find((v) => v.variant === 'golden');
    if (golden) golden.hidden = !this.perk('golden');
    void quiet;
  },

  /* ---------- per frame ---------- */
  updateCollect(dt) {
    if (this.level !== 'colloquium') return;
    const c = this.cam;
    // books: walk (or ride) over them
    for (const b of this.bookItems) {
      if (this.booksFound[b.book.id]) continue;
      const dy = Math.abs((this.vehicle ? this.vehicle.y : this.footY) - (b.y - 0.55));   // b.y is the book's resting height
      if (dy < 1.7 && (c.x - b.x) ** 2 + (c.z - b.z) ** 2 < (this.vehicle ? 2.4 : 1.7) ** 2) this.collectBook(b);
    }
    this._bkT = (this._bkT || 0) + dt;
    if (this._bkT > 0.35) {
      this._bkT = 0;
      for (const b of this.bookItems) {
        if (this.booksFound[b.book.id] || (c.x - b.x) ** 2 + (c.z - b.z) ** 2 > 70 * 70) continue;
        this.particles.burst(b.x, b.y + 0.1, b.z, 2, { col: [1, 0.85, 0.55], speed: 0.6, life: 1.4, size: 0.1, grav: 0.4, drag: 1.2, alpha: 0.9 });
      }
    }
    // reclaimed noticeboards: people passing stop and read them
    this._bdT = (this._bdT || 0) + dt;
    if (this._bdT > 0.5) {
      this._bdT = 0;
      for (const b of this.boards) {
        const d = this.boardsDone[b.where];
        if (!d) continue;
        for (const s of this.life.students) {
          if (s.cyclist || (s.x - b.x) ** 2 + (s.z - b.z) ** 2 > 36) continue;
          s.readBoards = s.readBoards || {};
          if (s.readBoards[b.i]) continue;
          s.readBoards[b.i] = true;
          if (s.taught < 2) this.life.hear(s, null, hex2rgb(d.hex || '#8fd0ff'), d.hex, d.concept, 'board');
        }
      }
    }
  },

  collectBook(b) {
    this.booksFound[b.book.id] = true;
    const n = this.booksCount();
    this.particles.burst(b.x, b.y, b.z, 50, { cols: [[1, 0.85, 0.5], [1, 1, 1]], speed: 3.4, life: 1.0, size: 0.16, grav: -1, drag: 2 });
    Sfx.tone(660, 0.12, 'triangle', 0.03, 990); setTimeout(() => Sfx.tone(990, 0.2, 'sine', 0.03, 1320), 110);
    const owner = b.book.owner && this.byId[b.book.owner];
    HUD.itemCard(`OVERDUE BOOK · ${n} OF ${this.bookItems.length} RETURNED`, b.book.title, `${b.book.author} · ${b.book.year}`, b.book.text,
      owner ? `${owner.name} is on campus — ask them about it.` : 'Returned to the library.', '#e8b04a');
    const reward = BOOK_REWARDS.find((r) => r.at === n);
    if (reward) {
      setTimeout(() => { HUD.banner(reward.title, reward.sub, '#ffd98a'); Sfx.complete(); }, 1200);
      this.applyBookPerks();
    } else HUD.log(`<b>Book returned</b> — ${esc(b.book.title)} (${n}/${this.bookItems.length}).`);
    this.refreshStats();
    this.save();
  },

  /* the first ride on a collectable bicycle adds it to your collection */
  collectBike(v) {
    if (!v.variant || this.bikesFound[v.variant]) return;
    this.bikesFound[v.variant] = true;
    const info = SPECIAL_BIKES[v.variant];
    const n = Object.keys(this.bikesFound).length, of = Object.keys(SPECIAL_BIKES).length;
    HUD.itemCard(`BICYCLE COLLECTION · ${n} OF ${of}`, info.name, 'Added to your collection', info.fact, 'Ride it anywhere. It will wait where you leave it.', '#8fd0ff');
    Sfx.complete();
    this.refreshStats();
    this.save();
  },

  /* ---------- noticeboards ---------- */
  boardConcept() {
    // the most recent thing you learned, with who told you
    const ids = Object.keys(this.progress).filter((id) => (this.progress[id] || []).length);
    if (!ids.length) return null;
    const recent = this.lastInsight && this.byId[this.lastInsight.id] ? this.lastInsight : null;
    const id = recent ? recent.id : ids[(Math.random() * ids.length) | 0];
    const keys = this.progress[id], key = recent && keys.includes(recent.key) ? recent.key : keys[keys.length - 1];
    const p = this.byId[id], qi = QTYPES.findIndex((q) => q.key === key);
    return { concept: p.answers[key].concept, who: p.name, field: p.field, hex: QHEX[qi], q: QTYPES[qi].name };
  },
  reclaimBoard(b) {
    if (this.boardsDone[b.where]) return;
    const d = this.boardConcept();
    if (!d) { Sfx.deny(); HUD.banner('NOTHING TO PIN UP YET', 'Interview a scientist first — then you will have something true to put here.', '#ffab6a'); return; }
    this.boardsDone[b.where] = d;
    b.tex = yourBoardTexture(this.gl, d.concept, d.who, d.field, d.hex, d.q);
    const n = Object.keys(this.boardsDone).length;
    this.particles.burst(b.face[0], b.face[1], b.face[2], 60, { cols: [hex2rgb(d.hex), [1, 1, 1], [1, 0.3, 0.7]], speed: 3, life: 1, size: 0.16, grav: 2, drag: 1.5 });
    HUD.banner(`NOTICEBOARD RECLAIMED · ${n}/${this.boards.length}`, `The feed's flyers are gone from ${b.where}. Anyone who walks past will read: ${d.concept}.`, d.hex);
    Sfx.complete();
    // whoever is standing nearby reads it straight away
    for (const s of this.life.students) {
      if ((s.x - b.x) ** 2 + (s.z - b.z) ** 2 > 12 * 12) continue;
      s.readBoards = s.readBoards || {}; s.readBoards[b.i] = true;
      if (s.taught < 2) this.life.hear(s, null, hex2rgb(d.hex), d.hex, d.concept, 'board');
    }
    this.refreshStats();
    this.save();
  },

  /* ---------- stunt ramps ---------- */
  rampAt(x, z) {
    let best = -Infinity, hit = null;
    for (const r of this.ramps || []) {
      const dx = x - r.x, dz = z - r.z;
      if (Math.abs(dx) > 3 || Math.abs(dz) > 3) continue;
      const co = Math.cos(r.yaw), si = Math.sin(r.yaw);
      const lx = dx * co - dz * si, lz = dx * si + dz * co;
      if (Math.abs(lx) > r.w / 2 || Math.abs(lz) > r.len / 2) continue;
      const h = r.y0 + r.h * (lz + r.len / 2) / r.len;
      if (h > best) { best = h; hit = r; }
    }
    this._rampHit = hit;
    return best;
  },
  rampUnder(x, z) { return this.rampAt(x, z) > -Infinity ? this._rampHit : null; },
  updateStunt(v, dt) {
    if (v.air && v.launch && v.launch.ramp && !this.stunt && Math.abs(v.launch.speed) > 6) {
      this.stunt = { ramp: v.launch.ramp, from: v.launch };
      HUD.toast('STUNT JUMP', v.launch.ramp.name);
    }
    if (this.stunt && v.landed) {
      const r = this.stunt.ramp, f = this.stunt.from;
      const dist = Math.hypot(v.x - f.x, v.z - f.z);
      this.stunt = null;
      if (dist >= r.target) {
        const first = !this.jumpsDone[r.id];
        this.jumpsDone[r.id] = true;
        const n = Object.keys(this.jumpsDone).length;
        HUD.banner(first ? `STUNT JUMP COMPLETED · ${n}/${this.ramps.length}` : 'STUNT JUMP', `${r.name} — ${dist.toFixed(1)} m`, '#ffd23a');
        Sfx.complete();
        this.shake = Math.max(this.shake, 0.35);
        this.refreshStats(); this.save();
      } else HUD.banner('STUNT JUMP FAILED', `${dist.toFixed(1)} m of ${r.target} — come in faster (hold Shift)`, '#ffab6a');
    }
    // slow motion while you're in the air off a ramp
    const want = this.stunt && v.air ? 0.42 : 1;
    this.timeScale += (want - this.timeScale) * (1 - Math.exp(-(want < 1 ? 10 : 4) * dt));
  },

  /* ---------- drawing ---------- */
  drawCollectOpaque(R, c) {
    if (this.level !== 'colloquium') return;
    for (const b of this.bookItems) {
      if (this.booksFound[b.book.id] || (b.x - c.x) ** 2 + (b.z - c.z) ** 2 > 120 * 120) continue;
      M4.trs(this.tmpM2, b.x, b.y + 0.25 + Math.sin(this.time * 1.8 + b.i) * 0.1, b.z, this.time * 1.3 + b.i, 1.9, 1.9, 1.9);
      R.drawMesh(this.bookMeshes[b.i % this.bookMeshes.length], this.tmpM2, { noShadow: true });
    }
  },
  drawCollectGlow(R, c) {
    if (this.level !== 'colloquium') return;
    // a warm ring under each unfound book, a gold one under each uncollected bicycle
    for (const b of this.bookItems) {
      const d2 = (b.x - c.x) ** 2 + (b.z - c.z) ** 2;
      if (this.booksFound[b.book.id] || d2 > 110 * 110) continue;
      M4.trs(this.tmpM, b.x, b.y - 0.5, b.z, this.time * 0.6, 1.1, 1, 1.1);
      R.drawMesh(this.life.marks.aura, this.tmpM, { alpha: 0.5 + 0.15 * Math.sin(this.time * 3 + b.i), tint: [1.0, 0.72, 0.3] });
      // a faint shaft of light, so you can spot one from across a lawn
      const fade = clamp((Math.sqrt(d2) - 4) / 10, 0, 1);
      M4.trs(this.tmpM, b.x, b.y - 0.55, b.z, 0, 0.16, 0.3, 0.16);
      R.drawMesh(this.beaconMesh, this.tmpM, { alpha: 0.22 * fade, tint: [1.0, 0.75, 0.35] });
    }
    for (const v of this.vehicles) {
      if (!v.variant || v.hidden || this.bikesFound[v.variant] || v === this.vehicle) continue;
      if ((v.x - c.x) ** 2 + (v.z - c.z) ** 2 > 90 * 90) continue;
      M4.trs(this.tmpM, v.x, v.y + 0.06, v.z, -this.time * 0.5, 1.5, 1, 1.5);
      R.drawMesh(this.life.marks.aura, this.tmpM, { alpha: 0.4 + 0.12 * Math.sin(this.time * 2.4), tint: [0.55, 0.85, 1.0] });
    }
  },
  drawBoards(R, c) {
    if (this.level !== 'colloquium' || !this.boards) return;
    const gl = R.gl;
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const night = this.env ? this.env.night || 0 : 0, k = lerp(1.0, 0.32, night);
    for (const b of this.boards) {
      if ((b.x - c.x) ** 2 + (b.z - c.z) ** 2 > 70 * 70) continue;
      const basis = { right: [Math.cos(b.yaw), 0, -Math.sin(b.yaw)], up: [0, 1, 0] };
      const p = [b.face[0] + Math.sin(b.yaw) * 0.035, b.face[1], b.face[2] + Math.cos(b.yaw) * 0.035];
      R.drawBillboard(b.tex || this.feedTex, p, 1.8, 1.18, [k, k, k, 1], b.tex ? 0 : 0.15 * (1 - night) + 0.5 * night, basis);
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  },
});
