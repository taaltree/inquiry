/* ============================================================
   geom.js — primitives, materials, and a transform-baking mesh
   builder.

   Vertex layout (16 floats, 64 bytes):
     pos3  nrm3  col3  glow1  rough1 metal1  uv2  layer1 kind1

   `layer` picks a slice of the procedural material array
   (textures.js); `kind` tells the scene shader how the surface
   behaves (foliage, window glass, water, lawn, lamp, skinned…).
   UVs are made in metres, divided by the material's tile size, so
   brick courses line up across every box of the same building.
   ============================================================ */

/* compose a mat4 from translate / euler-rotate(YXZ) / scale */
function xform(t = [0,0,0], r = [0,0,0], s = [1,1,1]) {
  const [rx, ry, rz] = r;
  const cx=Math.cos(rx), sx=Math.sin(rx), cy=Math.cos(ry), sy=Math.sin(ry), cz=Math.cos(rz), sz=Math.sin(rz);
  // R = Ry * Rx * Rz, right-handed: a yaw of atan2(dx, dz) points local +z along (dx, dz)
  const m00 =  cy*cz + sy*sx*sz, m01 = -cy*sz + sy*sx*cz, m02 =  sy*cx;
  const m10 =  cx*sz,            m11 =  cx*cz,            m12 = -sx;
  const m20 = -sy*cz + cy*sx*sz, m21 =  sy*sz + cy*sx*cz, m22 =  cy*cx;
  return new Float32Array([
    m00*s[0], m10*s[0], m20*s[0], 0,
    m01*s[1], m11*s[1], m21*s[1], 0,
    m02*s[2], m12*s[2], m22*s[2], 0,
    t[0], t[1], t[2], 1,
  ]);
}

/* slices of the procedural material array — see textures.js */
const TX = {
  NONE: 0, ASHLAR: 1, BRICK: 2, SLATE: 3, CLAY: 4, GRASS: 5, GRAVEL: 6, FLAG: 7, ASPHALT: 8,
  CONCRETE: 9, WOOD: 10, SASH: 11, LEAVES: 12, BARK: 13, HEDGE: 14, COPPER: 15, SETTS: 16,
  RENDER: 17, CURTAIN: 18, GOTHIC: 19, FLOWERS: 20, SOIL: 21, FABRIC: 22, SEAM: 23, WILLOW: 24,
  PAVER: 25, SHOP: 26, NEEDLES: 27,
};
const TX_COUNT = 28;

/* how the scene shader treats a surface */
const KIND = { STD: 0, LEAF: 1, GLASS: 2, WATER: 3, LAWN: 4, LAMP: 5, PANE: 6, SKIN: 16 };

/* A material. `tile` is metres per texture repeat. `uv`:
     'frame'  project onto the builder's current frame (buildings, ground)
     'local'  project in the primitive's own scaled space (props)
     'prim'   the primitive's own UVs × [tu, tv] (cylinders, cards, windows) */
function mat(tex, col, o = {}) {
  return {
    tex, col: typeof col === 'string' ? hex2rgb(col) : col,
    glow: o.glow || 0, rough: o.rough == null ? 0.8 : o.rough, metal: o.metal || 0,
    kind: o.kind || 0, tile: o.tile || 2, uv: o.uv || (tex ? 'frame' : 'local'),
    tu: o.tu || 1, tv: o.tv || 1,
  };
}
const tint = (M, col) => Object.assign({}, M, { col: typeof col === 'string' ? hex2rgb(col) : col });

const WORLD_FRAME = { ox: 0, oy: 0, oz: 0, rx: 1, rz: 0, fx: 0, fz: 1 };
function uvFrame(ox, oz, yaw, oy = 0) {
  // local x = (cos, 0, -sin), local z = (sin, 0, cos) — the xform convention
  return { ox, oy, oz, rx: Math.cos(yaw), rz: -Math.sin(yaw), fx: Math.sin(yaw), fz: Math.cos(yaw) };
}

/* dominant-axis projection; u runs to the viewer's right on every face */
function projUV(x, y, z, nx, ny, nz) {
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
  if (ay >= ax && ay >= az) return [x, ny > 0 ? -z : z];
  if (ax >= az) return [nx > 0 ? -z : z, y];
  return [nz > 0 ? x : -x, y];
}

class Builder {
  constructor(cap = 1024) {
    this.v = new Float32Array(cap * 16);
    this.i = new Uint32Array(cap * 2);
    this.n = 0; this.ni = 0;
    this.frame = null;
    this.min = [Infinity, Infinity, Infinity]; this.max = [-Infinity, -Infinity, -Infinity];
  }

  reserve(nv, ni) {
    if ((this.n + nv) * 16 > this.v.length) {
      let cap = this.v.length; while ((this.n + nv) * 16 > cap) cap *= 2;
      const v = new Float32Array(cap); v.set(this.v.subarray(0, this.n * 16)); this.v = v;
    }
    if (this.ni + ni > this.i.length) {
      let cap = this.i.length; while (this.ni + ni > cap) cap *= 2;
      const i = new Uint32Array(cap); i.set(this.i.subarray(0, this.ni)); this.i = i;
    }
  }

  vert(x, y, z, nx, ny, nz, M, u, v, col) {
    const o = this.n * 16, V = this.v, c = col || M.col;
    V[o] = x; V[o + 1] = y; V[o + 2] = z;
    V[o + 3] = nx; V[o + 4] = ny; V[o + 5] = nz;
    V[o + 6] = c[0]; V[o + 7] = c[1]; V[o + 8] = c[2];
    V[o + 9] = M.glow; V[o + 10] = M.rough; V[o + 11] = M.metal;
    V[o + 12] = u; V[o + 13] = v; V[o + 14] = M.tex; V[o + 15] = M.kind;
    if (x < this.min[0]) this.min[0] = x; if (y < this.min[1]) this.min[1] = y; if (z < this.min[2]) this.min[2] = z;
    if (x > this.max[0]) this.max[0] = x; if (y > this.max[1]) this.max[1] = y; if (z > this.max[2]) this.max[2] = z;
    return this.n++;
  }

  uvFor(M, wx, wy, wz, nx, ny, nz) {
    const F = this.frame || WORLD_FRAME;
    const dx = wx - F.ox, dy = wy - F.oy, dz = wz - F.oz;
    const fx = dx * F.rx + dz * F.rz, fz = dx * F.fx + dz * F.fz;
    const gx = nx * F.rx + nz * F.rz, gz = nx * F.fx + nz * F.fz;
    const uv = projUV(fx, dy, fz, gx, ny, gz);
    return [uv[0] / M.tile, uv[1] / M.tile];
  }

  /* add a primitive, baking the transform into world space.
     Legacy form: add(prim, m, colour[, glow, rough, metal]).
     Material form: add(prim, m, material[, overrides]). */
  add(prim, m, a3, glow = 0, rough = 0.62, metal = 0.0) {
    let M;
    if (a3 && a3.tex !== undefined) M = (glow && typeof glow === 'object') ? Object.assign({}, a3, glow) : a3;
    else M = { col: a3, glow, rough, metal, tex: 0, kind: 0, tile: 2, uv: 'local', tu: 1, tv: 1 };
    const { pos, nrm, idx } = prim;
    const nv = pos.length / 3;
    this.reserve(nv, idx.length);
    const base = this.n;
    const nm = Builder._nm || (Builder._nm = new Float32Array(9));
    M4.normalMat(nm, m);
    const sx = Math.hypot(m[0], m[1], m[2]), sy = Math.hypot(m[4], m[5], m[6]), sz = Math.hypot(m[8], m[9], m[10]);
    const puv = prim.uv;
    for (let k = 0, j = 0; k < pos.length; k += 3, j += 2) {
      const x = pos[k], y = pos[k + 1], z = pos[k + 2];
      const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
      const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
      const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
      const a = nrm[k], b = nrm[k + 1], c = nrm[k + 2];
      let nx = nm[0] * a + nm[3] * b + nm[6] * c;
      let ny = nm[1] * a + nm[4] * b + nm[7] * c;
      let nz = nm[2] * a + nm[5] * b + nm[8] * c;
      const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
      let u = 0, v = 0;
      if (M.tex) {
        if (M.uv === 'prim' && puv) { u = puv[j] * M.tu; v = puv[j + 1] * M.tv; }
        else if (M.uv === 'local') { const uv = projUV(x * sx, y * sy, z * sz, a, b, c); u = uv[0] / M.tile; v = uv[1] / M.tile; }
        else { const uv = this.uvFor(M, wx, wy, wz, nx, ny, nz); u = uv[0]; v = uv[1]; }
      }
      this.vert(wx, wy, wz, nx, ny, nz, M, u, v);
    }
    for (let k = 0; k < idx.length; k++) this.i[this.ni++] = base + idx[k];
    return this;
  }

  /* a flat quad from four world points (counter-clockwise seen from the front).
     uvs: [[u,v]×4] in metres, or null to project with the current frame. */
  quad(p0, p1, p2, p3, M, uvs, col) {
    this.reserve(4, 6);
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    const P = [p0, p1, p2, p3], b = this.n;
    for (let k = 0; k < 4; k++) {
      const p = P[k];
      let u = 0, v = 0;
      if (M.tex) {
        if (uvs) { u = uvs[k][0] / (M.uv === 'prim' ? 1 : M.tile); v = uvs[k][1] / (M.uv === 'prim' ? 1 : M.tile); }
        else { const uv = this.uvFor(M, p[0], p[1], p[2], nx, ny, nz); u = uv[0]; v = uv[1]; }
      }
      this.vert(p[0], p[1], p[2], nx, ny, nz, M, u, v, col);
    }
    const I = this.i;
    I[this.ni++] = b; I[this.ni++] = b + 1; I[this.ni++] = b + 2;
    I[this.ni++] = b; I[this.ni++] = b + 2; I[this.ni++] = b + 3;
    return this;
  }

  tri(p0, p1, p2, M, uvs, col) {
    this.reserve(3, 3);
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    const P = [p0, p1, p2], b = this.n;
    for (let k = 0; k < 3; k++) {
      const p = P[k];
      let u = 0, v = 0;
      if (M.tex) {
        if (uvs) { u = uvs[k][0] / M.tile; v = uvs[k][1] / M.tile; }
        else { const uv = this.uvFor(M, p[0], p[1], p[2], nx, ny, nz); u = uv[0]; v = uv[1]; }
      }
      this.vert(p[0], p[1], p[2], nx, ny, nz, M, u, v, col);
    }
    this.i[this.ni++] = b; this.i[this.ni++] = b + 1; this.i[this.ni++] = b + 2;
    return this;
  }

  /* a ribbon laid along a polyline on a height function: paths and roads.
     u runs across (metres from the left edge), v along the length. */
  ribbon(pts, width, M, heightAt, lift = 0.05, uvAlong = true) {
    if (pts.length < 2) return this;
    const n = pts.length;
    this.reserve(n * 2, (n - 1) * 6);
    let along = 0;
    const base = this.n;
    for (let k = 0; k < n; k++) {
      const p = pts[k], a = pts[Math.max(0, k - 1)], c = pts[Math.min(n - 1, k + 1)];
      let tx = c[0] - a[0], tz = c[1] - a[1];
      const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      if (k > 0) along += Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]);
      const lx = -tz * width / 2, lz = tx * width / 2;   // left of travel
      for (const s of [1, -1]) {
        const x = p[0] + lx * s, z = p[1] + lz * s;
        const y = heightAt(x, z) + lift;
        let u, v;
        if (uvAlong) { u = (s > 0 ? 0 : width) / M.tile; v = along / M.tile; }
        else { const uv = this.uvFor(M, x, y, z, 0, 1, 0); u = uv[0]; v = uv[1]; }
        this.vert(x, y, z, 0, 1, 0, M, u, v);
      }
    }
    for (let k = 0; k < n - 1; k++) {
      const a = base + k * 2, b = a + 2;
      this.i[this.ni++] = a; this.i[this.ni++] = b + 1; this.i[this.ni++] = a + 1;
      this.i[this.ni++] = a; this.i[this.ni++] = b; this.i[this.ni++] = b + 1;
    }
    return this;
  }

  /* a polygon on the ground (convex or star-shaped around its centroid) */
  fan(pts, M, heightAt, lift = 0.04) {
    const n = pts.length;
    let cx = 0, cz = 0; for (const p of pts) { cx += p[0]; cz += p[1]; } cx /= n; cz /= n;
    this.reserve(n + 1, n * 3);
    const put = (x, z) => { const y = heightAt(x, z) + lift; const uv = this.uvFor(M, x, y, z, 0, 1, 0); return this.vert(x, y, z, 0, 1, 0, M, uv[0], uv[1]); };
    const c = put(cx, cz), b = this.n;
    for (const p of pts) put(p[0], p[1]);
    for (let k = 0; k < n; k++) {
      this.i[this.ni++] = c; this.i[this.ni++] = b + ((k + 1) % n); this.i[this.ni++] = b + k;
    }
    return this;
  }

  get vertexCount() { return this.n; }

  upload(gl) {
    const idx = this.n > 65535 ? this.i.slice(0, this.ni) : Uint16Array.from(this.i.subarray(0, this.ni));
    const mesh = uploadMesh(gl, this.v.subarray(0, this.n * 16), idx);
    mesh.min = this.min.slice(); mesh.max = this.max.slice();
    mesh.verts = this.n;
    return mesh;
  }
}

/* Routes geometry into square chunks so the renderer can cull and sort.
   Everything added lands in the chunk under its transform's origin. */
class ChunkedBuilder {
  constructor(size = 64) { this.size = size; this.map = new Map(); this.frame = null; }
  at(x, z) {
    const key = Math.floor(x / this.size) + ',' + Math.floor(z / this.size);
    let b = this.map.get(key);
    if (!b) { b = new Builder(4096); this.map.set(key, b); }
    b.frame = this.frame;
    return b;
  }
  add(prim, m, a3, g, r, mt) { this.at(m[12], m[14]).add(prim, m, a3, g, r, mt); return this; }
  quad(p0, p1, p2, p3, M, uvs, col) {
    this.at((p0[0] + p2[0]) / 2, (p0[2] + p2[2]) / 2).quad(p0, p1, p2, p3, M, uvs, col); return this;
  }
  tri(p0, p1, p2, M, uvs, col) { this.at((p0[0] + p1[0] + p2[0]) / 3, (p0[2] + p1[2] + p2[2]) / 3).tri(p0, p1, p2, M, uvs, col); return this; }
  ribbon(pts, width, M, h, lift, along) {
    // long ribbons are split so no chunk is dragged across the map
    const step = 16;
    for (let s = 0; s < pts.length - 1; s += step) {
      const seg = pts.slice(s, Math.min(pts.length, s + step + 1));
      const mid = seg[seg.length >> 1];
      this.at(mid[0], mid[1]).ribbon(seg, width, M, h, lift, along);
    }
    return this;
  }
  fan(pts, M, h, lift) {
    let cx = 0, cz = 0; for (const p of pts) { cx += p[0]; cz += p[1]; }
    this.at(cx / pts.length, cz / pts.length).fan(pts, M, h, lift); return this;
  }
  get vertexCount() { let n = 0; for (const b of this.map.values()) n += b.n; return n; }
  upload(gl) {
    const out = [];
    for (const b of this.map.values()) if (b.n) out.push(b.upload(gl));
    return out;
  }
}

/* ---------- primitives (each carries UVs for 'prim' mapping) ---------- */

/* unit cube centred on origin, 1x1x1 */
function pBox() {
  const pos = [], nrm = [], idx = [], uv = [];
  const faces = [
    [[ .5,-.5,-.5],[ .5, .5,-.5],[ .5, .5, .5],[ .5,-.5, .5],[ 1, 0, 0]],
    [[-.5,-.5, .5],[-.5, .5, .5],[-.5, .5,-.5],[-.5,-.5,-.5],[-1, 0, 0]],
    [[-.5, .5,-.5],[-.5, .5, .5],[ .5, .5, .5],[ .5, .5,-.5],[ 0, 1, 0]],
    [[-.5,-.5, .5],[-.5,-.5,-.5],[ .5,-.5,-.5],[ .5,-.5, .5],[ 0,-1, 0]],
    [[-.5,-.5, .5],[ .5,-.5, .5],[ .5, .5, .5],[-.5, .5, .5],[ 0, 0, 1]],
    [[ .5,-.5,-.5],[-.5,-.5,-.5],[-.5, .5,-.5],[ .5, .5,-.5],[ 0, 0,-1]],
  ];
  for (const f of faces) {
    const b = pos.length / 3;
    for (let k = 0; k < 4; k++) {
      pos.push(...f[k]); nrm.push(...f[4]);
      const t = projUV(f[k][0], f[k][1], f[k][2], f[4][0], f[4][1], f[4][2]);
      uv.push(t[0] + 0.5, t[1] + 0.5);
    }
    idx.push(b, b+1, b+2, b, b+2, b+3);
  }
  return { pos, nrm, idx, uv };
}

/* cylinder along +Y, radius 0.5, height 1, centred; u around, v up */
function pCyl(seg = 16, capTop = true, capBot = true, rTop = 0.5, rBot = 0.5) {
  const pos = [], nrm = [], idx = [], uv = [];
  const slope = (rBot - rTop);
  for (let s = 0; s <= seg; s++) {
    const a = (s / seg) * TAU, c = Math.cos(a), n = Math.sin(a);
    const L = Math.hypot(1, slope) || 1;
    pos.push(c*rTop, 0.5, n*rTop);  nrm.push(c/L, slope/L, n/L); uv.push(s / seg, 1);
    pos.push(c*rBot, -0.5, n*rBot); nrm.push(c/L, slope/L, n/L); uv.push(s / seg, 0);
  }
  for (let s = 0; s < seg; s++) {
    const a = s*2, b = s*2 + 2;
    idx.push(a, a+1, b+1, a, b+1, b);
  }
  const cap = (y, r, ny) => {
    const c0 = pos.length / 3;
    pos.push(0, y, 0); nrm.push(0, ny, 0); uv.push(0.5, 0.5);
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * TAU;
      pos.push(Math.cos(a)*r, y, Math.sin(a)*r); nrm.push(0, ny, 0); uv.push(0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r);
    }
    for (let s = 0; s < seg; s++) {
      if (ny > 0) idx.push(c0, c0+1+s, c0+2+s);
      else        idx.push(c0, c0+2+s, c0+1+s);
    }
  };
  if (capTop) cap(0.5, rTop, 1);
  if (capBot) cap(-0.5, rBot, -1);
  return { pos, nrm, idx, uv };
}

/* UV sphere, radius 0.5 */
function pSphere(seg = 16, rings = 10, phiMax = Math.PI) {
  const pos = [], nrm = [], idx = [], uv = [];
  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * phiMax, sp = Math.sin(phi), cp = Math.cos(phi);
    for (let s = 0; s <= seg; s++) {
      const th = (s / seg) * TAU;
      const x = sp * Math.cos(th), y = cp, z = sp * Math.sin(th);
      pos.push(x*0.5, y*0.5, z*0.5); nrm.push(x, y, z); uv.push(s / seg, 1 - r / rings);
    }
  }
  const w = seg + 1;
  for (let r = 0; r < rings; r++) for (let s = 0; s < seg; s++) {
    const a = r*w + s, b = a + w;
    idx.push(a, b, a+1, a+1, b, b+1);
  }
  return { pos, nrm, idx, uv };
}

/* torus in the XZ plane; R = major radius 0.5, r = minor */
function pTorus(r = 0.12, seg = 32, side = 10) {
  const pos = [], nrm = [], idx = [], uv = [];
  for (let i = 0; i <= seg; i++) {
    const u = (i / seg) * TAU, cu = Math.cos(u), su = Math.sin(u);
    for (let j = 0; j <= side; j++) {
      const v = (j / side) * TAU, cv = Math.cos(v), sv = Math.sin(v);
      pos.push(cu*(0.5 + r*cv), r*sv, su*(0.5 + r*cv));
      nrm.push(cu*cv, sv, su*cv); uv.push(i / seg, j / side);
    }
  }
  const w = side + 1;
  for (let i = 0; i < seg; i++) for (let j = 0; j < side; j++) {
    const a = i*w + j, b = a + w;
    idx.push(a, b, a+1, a+1, b, b+1);
  }
  return { pos, nrm, idx, uv };
}

/* flat annulus on the XZ plane, outer radius 0.5 */
function pRing(inner = 0.4, seg = 48) {
  const pos = [], nrm = [], idx = [], uv = [];
  for (let s = 0; s <= seg; s++) {
    const a = (s / seg) * TAU, c = Math.cos(a), n = Math.sin(a);
    pos.push(c*0.5, 0, n*0.5);      nrm.push(0, 1, 0); uv.push(s / seg, 1);
    pos.push(c*inner, 0, n*inner);  nrm.push(0, 1, 0); uv.push(s / seg, 0);
  }
  for (let s = 0; s < seg; s++) {
    const a = s*2, b = a + 2;
    idx.push(a, a+1, b+1, a, b+1, b);
  }
  return { pos, nrm, idx, uv };
}

/* unit quad on XY, facing +Z, 1x1 */
function pQuad() {
  return {
    pos: [-.5,-.5,0,  .5,-.5,0,  .5,.5,0, -.5,.5,0],
    nrm: [0,0,1, 0,0,1, 0,0,1, 0,0,1],
    idx: [0,1,2, 0,2,3],
    uv: [0,0, 1,0, 1,1, 0,1],
  };
}

/* regular n-gon prism along Y (height 1, circumradius 0.5) */
function pPrism(sides = 6, rTop = 0.5) { return pCyl(sides, true, true, rTop, 0.5); }

/* capsule along +Y: total height 1 including caps, given radius */
function pCapsule(r = 0.2, seg = 12, rings = 6) {
  const pos = [], nrm = [], idx = [], uv = [];
  const half = Math.max(0.0001, 0.5 - r);
  const rows = [];
  for (let i = 0; i <= rings; i++) {
    const phi = (i / rings) * (Math.PI / 2);
    rows.push({ y: half + Math.cos(phi)*r, rad: Math.sin(phi)*r, ny: Math.cos(phi) });
  }
  for (let i = 0; i <= rings; i++) {
    const phi = (i / rings) * (Math.PI / 2);
    rows.push({ y: -half - Math.sin(phi)*r, rad: Math.cos(phi)*r, ny: -Math.sin(phi) });
  }
  for (const row of rows) {
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * TAU, c = Math.cos(a), n = Math.sin(a);
      const k = row.rad / r || 0;
      const hl = Math.hypot(c * k, row.ny, n * k) || 1;
      pos.push(c*row.rad, row.y, n*row.rad);
      nrm.push(c*k/hl, row.ny/hl, n*k/hl);
      uv.push(s / seg, row.y + 0.5);
    }
  }
  const w = seg + 1;
  for (let r0 = 0; r0 < rows.length - 1; r0++) for (let s = 0; s < seg; s++) {
    const a = r0*w + s, b = a + w;
    idx.push(a, b, a+1, a+1, b, b+1);
  }
  return { pos, nrm, idx, uv };
}

/* subdivided ground plane (XZ), size 1 */
function pGround(n = 1) {
  const pos = [], nrm = [], idx = [], uv = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
    pos.push(i/n - 0.5, 0, j/n - 0.5); nrm.push(0, 1, 0); uv.push(i / n, j / n);
  }
  const w = n + 1;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const a = i*w + j;
    idx.push(a, a+1, a+w, a+1, a+w+1, a+w);
  }
  return { pos, nrm, idx, uv };
}

/* a box from p0 to p1 of the given thickness — girders, cables, branches */
function strut(b, p0, p1, thick, color, glow = 0, rough = 0.5, metal = 0.6, prim) {
  const dx = p1[0]-p0[0], dy = p1[1]-p0[1], dz = p1[2]-p0[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-5) return;
  const yaw = Math.atan2(dx, dz);
  const pitch = -Math.asin(clamp(dy / len, -1, 1)) + Math.PI/2;
  const m = xform(
    [(p0[0]+p1[0])/2, (p0[1]+p1[1])/2, (p0[2]+p1[2])/2],
    [pitch, yaw, 0],
    [thick, len, thick],
  );
  if (color && color.tex !== undefined) b.add(prim || BOX, m, color);
  else b.add(prim || BOX, m, color, glow, rough, metal);
}

/* shared primitive instances — built once */
const BOX     = pBox();
const SPHERE  = pSphere(18, 12);
const SPHERE_LO = pSphere(10, 7);
const DOME    = pSphere(28, 10, Math.PI / 2);
const CYL     = pCyl(18);
const CYL_LO  = pCyl(10);
const TUBE    = pCyl(8, false, false);
const HEX     = pPrism(6);
const TRI     = pPrism(3);
const OCT     = pPrism(8);
const RING    = pRing(0.42, 56);
const RING_TN = pRing(0.485, 64);
const TORUS   = pTorus(0.05, 48, 8);
const TORUS_F = pTorus(0.14, 40, 10);
const QUAD    = pQuad();
const CAPSULE = pCapsule(0.22, 14, 6);
const CONE    = pCyl(14, true, true, 0.02, 0.5);
