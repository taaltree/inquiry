/* ============================================================
   nav.js — the GPS, the radar and the map.

   Every path and road the world was built from also becomes a graph;
   A* over it gives a route like a sat-nav. The campus is drawn once
   onto a large canvas; the radar shows a rotated window of it with
   blips clamped to the edge, and the full map pans, zooms and takes
   a waypoint.
   ============================================================ */

class NavGraph {
  constructor(world) {
    this.nodes = [];      // { x, z, e: [indices] }
    const lines = world.paths.map((p) => p.pts);
    // walkways across the Great Court and through its arches
    lines.push([[-36, -36], [36, -36], [36, 36], [-36, 36], [-36, -36]]);
    lines.push([[0, -36], [0, -12], [0, 12], [0, 60]], [[-60, 0], [-12, 0], [12, 0], [36, 0]]);
    lines.push([[0, -36], [0, -33.5]], [[-36, 36], [-42, 42]], [[36, 36], [44, 42]], [[-36, -36], [-40, -43]], [[36, -36], [41, -45]]);
    for (const d of DISTRICTS) lines.push(this.ring(d.cx, d.cz, 12, 10));
    for (const pts of lines) {
      let prev = -1;
      for (let k = 0; k < pts.length - 1; k++) {
        const [x0, z0] = pts[k], [x1, z1] = pts[k + 1];
        const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(len / 9));
        for (let i = (k === 0 ? 0 : 1); i <= n; i++) {
          const x = lerp(x0, x1, i / n), z = lerp(z0, z1, i / n);
          if (Math.abs(x) > WORLD_HALF + 5 || Math.abs(z) > WORLD_HALF + 5) { prev = -1; continue; }
          const id = this.add(x, z);
          if (prev >= 0 && prev !== id) this.link(prev, id);
          prev = id;
        }
      }
    }
    // stitch junctions: anything within a few metres of another line joins it
    for (let i = 0; i < this.nodes.length; i++) for (let j = i + 1; j < this.nodes.length; j++) {
      const a = this.nodes[i], b = this.nodes[j];
      if (Math.abs(a.x - b.x) < 5.5 && Math.abs(a.z - b.z) < 5.5 && Math.hypot(a.x - b.x, a.z - b.z) < 5.5) this.link(i, j);
    }
  }
  ring(cx, cz, r, n) { const o = []; for (let i = 0; i <= n; i++) { const a = (i / n) * TAU; o.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } return o; }
  add(x, z) {
    for (let i = 0; i < this.nodes.length; i++) { const n = this.nodes[i]; if (Math.abs(n.x - x) < 1 && Math.abs(n.z - z) < 1) return i; }
    this.nodes.push({ x, z, e: [] }); return this.nodes.length - 1;
  }
  link(a, b) { if (!this.nodes[a].e.includes(b)) { this.nodes[a].e.push(b); this.nodes[b].e.push(a); } }
  nearest(x, z) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < this.nodes.length; i++) { const n = this.nodes[i], d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = i; } }
    return best;
  }
  /* A* from a point to a point; returns a polyline [[x,z],…] */
  route(x0, z0, x1, z1) {
    const s = this.nearest(x0, z0), t = this.nearest(x1, z1);
    if (s < 0 || t < 0) return [[x0, z0], [x1, z1]];
    const N = this.nodes, g = new Float64Array(N.length).fill(Infinity), from = new Int32Array(N.length).fill(-1);
    const open = [s]; g[s] = 0;
    const h = (i) => Math.hypot(N[i].x - N[t].x, N[i].z - N[t].z);
    const f = (i) => g[i] + h(i);
    const closed = new Uint8Array(N.length);
    while (open.length) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (f(open[k]) < f(open[bi])) bi = k;
      const cur = open.splice(bi, 1)[0];
      if (cur === t) break;
      closed[cur] = 1;
      for (const nb of N[cur].e) {
        if (closed[nb]) continue;
        const ng = g[cur] + Math.hypot(N[cur].x - N[nb].x, N[cur].z - N[nb].z);
        if (ng < g[nb]) { g[nb] = ng; from[nb] = cur; if (!open.includes(nb)) open.push(nb); }
      }
    }
    const path = [];
    for (let c = t; c >= 0; c = from[c]) { path.push([N[c].x, N[c].z]); if (c === s) break; }
    path.reverse();
    if (!path.length || (path[0][0] !== N[s].x || path[0][1] !== N[s].z)) return [[x0, z0], [x1, z1]];
    // drop the first node if we are already past it
    if (path.length > 1 && Math.hypot(path[1][0] - x0, path[1][1] - z0) < Math.hypot(path[1][0] - path[0][0], path[1][1] - path[0][1])) path.shift();
    return [[x0, z0], ...path, [x1, z1]];
  }
}

/* ---------- the campus drawn once, for the radar and the map ---------- */
const MAP_PX = 2048, MAP_M = 720;               // pixels, metres across
const mapX = (x) => (x + MAP_M / 2) * (MAP_PX / MAP_M);
const mapZ = (z) => (z + MAP_M / 2) * (MAP_PX / MAP_M);

function renderCampusMap(world) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = MAP_PX;
  const c = cv.getContext('2d');
  const k = MAP_PX / MAP_M;
  c.fillStyle = '#5b7a42'; c.fillRect(0, 0, MAP_PX, MAP_PX);
  // mottled fields
  const r = mulberry(5);
  for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '40,70,30' : '120,150,80'},0.06)`; c.beginPath(); c.arc(r() * MAP_PX, r() * MAP_PX, 10 + r() * 40, 0, TAU); c.fill(); }
  const poly = (pts, fill) => { c.beginPath(); pts.forEach(([x, z], i) => (i ? c.lineTo(mapX(x), mapZ(z)) : c.moveTo(mapX(x), mapZ(z)))); c.closePath(); c.fillStyle = fill; c.fill(); };
  for (const L of world.map.lawns) if (L) poly(L, '#79a151');
  // the river
  for (const w of world.map.water) {
    c.strokeStyle = '#6f8f5a'; c.lineWidth = (w.w + 10) * k; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); w.pts.forEach(([x, z], i) => (i ? c.lineTo(mapX(x), mapZ(z)) : c.moveTo(mapX(x), mapZ(z)))); c.stroke();
    c.strokeStyle = '#4f86a8'; c.lineWidth = w.w * k; c.stroke();
  }
  // paths and roads
  const col = { road: '#50555c', lane: '#5a5f66', pave: '#c9c2b4', path: '#d9c8a0' };
  for (const p of world.paths) {
    c.strokeStyle = p.kind === 'path' && p.M === GM.flag ? '#cfc6b6' : (col[p.kind] || '#ccc'); c.lineWidth = p.w * k; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); p.pts.forEach(([x, z], i) => (i ? c.lineTo(mapX(x), mapZ(z)) : c.moveTo(mapX(x), mapZ(z)))); c.stroke();
    if (p.kind === 'road') {
      c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 0.35 * k; c.setLineDash([3 * k, 6 * k]); c.stroke(); c.setLineDash([]);
    }
  }
  // the court's paving
  c.fillStyle = '#cfc6b6'; c.fillRect(mapX(-42), mapZ(-42), 84 * k, 84 * k);
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { c.fillStyle = '#79a151'; c.fillRect(mapX(Math.min(sx * 3.2, sx * 31)), mapZ(Math.min(sz * 3.2, sz * 31)), 27.8 * k, 27.8 * k); }
  c.fillStyle = '#cfc6b6'; c.beginPath(); c.arc(mapX(0), mapZ(0), 10.8 * k, 0, TAU); c.fill();
  // trees
  for (const t of world.map.trees) { c.fillStyle = t.kind === 'willow' ? 'rgba(90,120,60,.55)' : 'rgba(40,70,32,.5)'; c.beginPath(); c.arc(mapX(t.x), mapZ(t.z), Math.max(2, t.r * k * 0.8), 0, TAU); c.fill(); }
  // buildings, with a soft drop shadow
  const rect = (o, dx, dy) => {
    const co = Math.cos(o.yaw), si = Math.sin(o.yaw);
    const pts = [[-o.hw, -o.hd], [o.hw, -o.hd], [o.hw, o.hd], [-o.hw, o.hd]].map(([lx, lz]) => [o.x + lx * co + lz * si, o.z - lx * si + lz * co]);
    c.beginPath(); pts.forEach(([x, z], i) => (i ? c.lineTo(mapX(x) + dx, mapZ(z) + dy) : c.moveTo(mapX(x) + dx, mapZ(z) + dy))); c.closePath();
  };
  for (const o of world.map.buildings) { rect(o, 4, 4); c.fillStyle = 'rgba(0,0,0,.28)'; c.fill(); }
  for (const o of world.map.buildings) { rect(o, 0, 0); c.fillStyle = '#e9e1cf'; c.fill(); c.strokeStyle = '#9e917a'; c.lineWidth = 2; c.stroke(); }
  // labels
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const L of world.map.labels) {
    const fs = Math.round(16 * (L.size || 0.7) * 1.6);
    c.font = `700 ${fs}px "Helvetica Neue", Arial, sans-serif`;
    c.lineWidth = 5; c.strokeStyle = 'rgba(20,24,20,.75)'; c.strokeText(L.text, mapX(L.x), mapZ(L.z));
    c.fillStyle = L.col || '#f4efe4'; c.fillText(L.text, mapX(L.x), mapZ(L.z));
  }
  return cv;
}

/* ---------- blips ---------- */
function drawBlip(c, kind, x, y, col, label, s = 1) {
  c.save(); c.translate(x, y);
  if (kind === 'person') {
    c.beginPath(); c.arc(0, 0, 8 * s, 0, TAU); c.fillStyle = col; c.fill();
    c.lineWidth = 2; c.strokeStyle = '#111'; c.stroke();
    if (label) { c.fillStyle = '#111'; c.font = `800 ${Math.round(10 * s)}px Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, 0, 0.5); }
  } else if (kind === 'done') {
    c.beginPath(); c.arc(0, 0, 4 * s, 0, TAU); c.fillStyle = col; c.fill();
  } else if (kind === 'objective') {
    c.rotate(Math.PI / 4); c.fillStyle = '#ffd23a'; c.fillRect(-7 * s, -7 * s, 14 * s, 14 * s); c.lineWidth = 2; c.strokeStyle = '#111'; c.strokeRect(-7 * s, -7 * s, 14 * s, 14 * s);
  } else if (kind === 'waypoint') {
    c.fillStyle = '#c86bff'; c.beginPath(); c.moveTo(0, 8 * s); c.lineTo(-7 * s, -4 * s); c.arc(0, -5 * s, 7 * s, Math.PI, 0); c.closePath(); c.fill(); c.lineWidth = 2; c.strokeStyle = '#111'; c.stroke();
  } else if (kind === 'vault') {
    c.fillStyle = col; c.fillRect(-7 * s, -7 * s, 14 * s, 14 * s); c.lineWidth = 2; c.strokeStyle = '#111'; c.strokeRect(-7 * s, -7 * s, 14 * s, 14 * s);
    c.fillStyle = '#111'; c.font = `800 ${Math.round(10 * s)}px Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('V', 0, 0.5);
  } else if (kind === 'library') {
    c.fillStyle = '#ffd98a'; c.fillRect(-8 * s, -6 * s, 16 * s, 12 * s); c.lineWidth = 2; c.strokeStyle = '#111'; c.strokeRect(-8 * s, -6 * s, 16 * s, 12 * s);
    c.beginPath(); c.moveTo(0, -6 * s); c.lineTo(0, 6 * s); c.stroke();
  } else if (kind === 'drone') {
    c.beginPath(); c.arc(0, 0, 6 * s, 0, TAU); c.fillStyle = '#ff3fa8'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#111'; c.stroke();
  } else if (kind === 'note') {
    c.fillStyle = '#f1e6c8'; c.fillRect(-4 * s, -5 * s, 8 * s, 10 * s); c.strokeStyle = '#6a5a3a'; c.lineWidth = 1.2; c.strokeRect(-4 * s, -5 * s, 8 * s, 10 * s);
  } else if (kind === 'bike') {
    c.strokeStyle = '#e8eef4'; c.lineWidth = 1.6; c.beginPath(); c.arc(-4 * s, 2 * s, 3 * s, 0, TAU); c.arc(4 * s, 2 * s, 3 * s, 0, TAU); c.stroke();
  } else if (kind === 'book') {
    c.fillStyle = '#b0282a'; c.fillRect(-4 * s, -5.5 * s, 8 * s, 11 * s); c.strokeStyle = '#ffd98a'; c.lineWidth = 1.5; c.strokeRect(-4 * s, -5.5 * s, 8 * s, 11 * s);
  } else if (kind === 'sbike') {
    c.shadowColor = '#8fd0ff'; c.shadowBlur = 6; c.strokeStyle = '#bfe6ff'; c.lineWidth = 2; c.beginPath(); c.arc(-4.5 * s, 2 * s, 3.4 * s, 0, TAU); c.arc(4.5 * s, 2 * s, 3.4 * s, 0, TAU); c.stroke(); c.shadowBlur = 0;
  } else if (kind === 'board') {
    c.fillStyle = col; c.fillRect(-5 * s, -4 * s, 10 * s, 8 * s); c.lineWidth = 1.6; c.strokeStyle = '#111'; c.strokeRect(-5 * s, -4 * s, 10 * s, 8 * s);
    c.fillStyle = '#fff'; c.beginPath(); c.arc(0, -2 * s, 1.4 * s, 0, TAU); c.fill();
  } else if (kind === 'ramp') {
    c.fillStyle = '#ffd23a'; c.beginPath(); c.moveTo(0, -6 * s); c.lineTo(6 * s, 5 * s); c.lineTo(-6 * s, 5 * s); c.closePath(); c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#111'; c.stroke();
  } else if (kind === 'student') {
    c.beginPath(); c.arc(0, 0, 2.6 * s, 0, TAU); c.fillStyle = col; c.fill();
  }
  c.restore();
}

/* everything worth a blip, from the game's state */
function collectBlips(g) {
  const out = [];
  const tgt = g.navTarget;
  for (const s of g.world.stations) {
    const asked = (g.progress[s.id] || []).length;
    const d = g.districtById[s.district];
    out.push(asked >= 5 ? { kind: 'done', x: s.x, z: s.z, col: d.accent2 } : { kind: 'person', x: s.x, z: s.z, col: d.accent, label: s.person.name.split(' ').pop()[0], edge: true });
  }
  for (const v of g.world.vaults) if (g.districtDone(v.district)) out.push({ kind: 'vault', x: v.x, z: v.z, col: g.districtById[v.district].accent, edge: true });
  if (g.world.synth) out.push({ kind: 'library', x: g.world.synth.x, z: g.world.synth.z, edge: true });
  for (const s of g.life.students) {
    if (Math.hypot(s.x - g.cam.x, s.z - g.cam.z) > 70) continue;
    const t = g.life.tier(s);
    out.push({ kind: 'student', x: s.x, z: s.z, col: s.confused > 0 ? '#ff45a6' : t >= 3 ? '#ffd98a' : t >= 2 ? '#7df0ae' : t >= 1 ? '#8fb8d8' : 'rgba(220,225,235,.75)' });
  }
  for (const p of g.pickups) if (!g.found[p.item.id] && Math.hypot(p.x - g.cam.x, p.z - g.cam.z) < 80) out.push({ kind: 'note', x: p.x, z: p.z });
  for (const v of g.vehicles) if (v !== g.vehicle && v.type === 'bike' && !v.hidden && !(v.variant && !g.bikesFound[v.variant]) && Math.hypot(v.x - g.cam.x, v.z - g.cam.z) < 45) out.push({ kind: 'bike', x: v.x, z: v.z });
  for (const d of g.life.drones) if (!d.dead) out.push({ kind: 'drone', x: d.x, z: d.z, edge: true, s: d.boss ? 1.5 : 1 });
  // things to collect: close by, or everywhere once you have the catalogue
  const all = g.perk && g.perk('map');
  const near = (x, z, r) => all || Math.hypot(x - g.cam.x, z - g.cam.z) < r;
  for (const b of g.bookItems || []) if (!g.booksFound[b.book.id] && near(b.x, b.z, 40)) out.push({ kind: 'book', x: b.x, z: b.z, edge: all });
  for (const v of g.vehicles) if (v.variant && !v.hidden && !g.bikesFound[v.variant] && v !== g.vehicle && near(v.x, v.z, 70)) out.push({ kind: 'sbike', x: v.x, z: v.z, edge: all });
  for (const b of g.boards || []) { const mine = !!g.boardsDone[b.where]; if (mine || Math.hypot(b.x - g.cam.x, b.z - g.cam.z) < 160) out.push({ kind: 'board', x: b.x, z: b.z, col: mine ? (g.boardsDone[b.where].hex || '#8fd0ff') : '#ff3fa8', edge: !mine }); }
  for (const r of g.ramps || []) if (!g.jumpsDone[r.id] && Math.hypot(r.x - g.cam.x, r.z - g.cam.z) < 100) out.push({ kind: 'ramp', x: r.x, z: r.z });
  if (tgt) out.push({ kind: tgt.waypoint ? 'waypoint' : 'objective', x: tgt.x, z: tgt.z, edge: true });
  return out;
}

/* ---------- the radar: a rotated window on the map ---------- */
function drawRadar(ctx, W, H, g, mapImg, route) {
  const c = ctx, px = g.cam.x, pz = g.cam.z;
  const scale = g.vehicle ? 1.35 : 1.9;     // px per metre: zoom out when riding
  const yaw = g.view ? g.view.yaw : g.cam.yaw;
  c.save();
  c.clearRect(0, 0, W, H);
  c.beginPath(); c.roundRect ? c.roundRect(0, 0, W, H, 10) : c.rect(0, 0, W, H); c.clip();
  c.fillStyle = '#44583a'; c.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H * 0.58;
  c.translate(cx, cy);
  c.rotate(yaw);                             // camera forward is up
  const k = MAP_PX / MAP_M;
  c.scale(scale / k, scale / k);
  c.drawImage(mapImg, -mapX(px), -mapZ(pz));
  c.setTransform(1, 0, 0, 1, 0, 0);
  // the route
  const toScreen = (x, z) => {
    const dx = (x - px) * scale, dz = (z - pz) * scale;
    const co = Math.cos(yaw), si = Math.sin(yaw);
    return [cx + dx * co - dz * si, cy + dx * si + dz * co];
  };
  if (route && route.length > 1) {
    c.save();
    c.beginPath(); c.roundRect ? c.roundRect(0, 0, W, H, 10) : c.rect(0, 0, W, H); c.clip();
    c.lineWidth = 5; c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = g.navTarget && g.navTarget.waypoint ? '#c86bff' : '#ffd23a';
    c.beginPath(); route.forEach(([x, z], i) => { const [sx, sy] = toScreen(x, z); if (i) c.lineTo(sx, sy); else c.moveTo(sx, sy); }); c.stroke();
    c.restore();
  }
  // blips, clamped to the edge if they are important
  for (const b of collectBlips(g)) {
    let [sx, sy] = toScreen(b.x, b.z);
    const inside = sx > 8 && sx < W - 8 && sy > 8 && sy < H - 8;
    if (!inside) {
      if (!b.edge) continue;
      const dx = sx - cx, dy = sy - cy, t = Math.min((W / 2 - 10) / Math.abs(dx || 1e-4), (H / 2 - 10 + (dy > 0 ? -H * 0.08 : H * 0.08)) / Math.abs(dy || 1e-4));
      sx = cx + dx * t; sy = cy + dy * t;
    }
    drawBlip(c, b.kind, sx, sy, b.col, b.label, (b.s || 1) * (inside ? 1 : 0.8));
  }
  // north
  const [nx, ny] = toScreen(px, pz - 1000);
  const dx = nx - cx, dy = ny - cy, t = Math.min((W / 2 - 12) / Math.abs(dx || 1e-4), (H / 2 - 12) / Math.abs(dy || 1e-4));
  c.fillStyle = '#fff'; c.font = '800 12px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.beginPath(); c.arc(cx + dx * t, cy + dy * t, 8, 0, TAU); c.fillStyle = 'rgba(0,0,0,.6)'; c.fill();
  c.fillStyle = '#fff'; c.fillText('N', cx + dx * t, cy + dy * t + 0.5);
  // the player
  const bodyYaw = g.vehicle ? g.vehicle.yaw : g.bodyYaw;
  c.save(); c.translate(cx, cy); c.rotate(yaw - bodyYaw + Math.PI);
  c.beginPath(); c.moveTo(0, -9); c.lineTo(6.5, 7); c.lineTo(0, 3.5); c.lineTo(-6.5, 7); c.closePath();
  c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#111'; c.stroke();
  c.restore();
  c.restore();
}
