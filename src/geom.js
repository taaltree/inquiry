/* ============================================================
   geom.js — primitive generators + a transform-baking mesh builder
   Every primitive returns { pos:[], nrm:[], idx:[] } in local space.
   ============================================================ */

/* compose a mat4 from translate / euler-rotate(YXZ) / scale */
function xform(t = [0,0,0], r = [0,0,0], s = [1,1,1]) {
  const [rx, ry, rz] = r;
  const cx=Math.cos(rx), sx=Math.sin(rx), cy=Math.cos(ry), sy=Math.sin(ry), cz=Math.cos(rz), sz=Math.sin(rz);
  // R = Ry * Rx * Rz
  const m00 =  cy*cz + sy*sx*sz, m01 =  cx*sz, m02 = -sy*cz + cy*sx*sz;
  const m10 = -cy*sz + sy*sx*cz, m11 =  cx*cz, m12 =  sy*sz + cy*sx*cz;
  const m20 =  sy*cx,            m21 = -sx,    m22 =  cy*cx;
  return new Float32Array([
    m00*s[0], m10*s[0], m20*s[0], 0,
    m01*s[1], m11*s[1], m21*s[1], 0,
    m02*s[2], m12*s[2], m22*s[2], 0,
    t[0], t[1], t[2], 1,
  ]);
}

class Builder {
  constructor() { this.v = []; this.i = []; this.n = 0; }

  /* add a primitive, baking the transform into world space */
  add(prim, m, color, glow = 0) {
    const { pos, nrm, idx } = prim;
    const base = this.n;
    // normal matrix = inverse-transpose 3x3; for our uniform-ish scales the
    // cheap route (rotation part / scale) is adequate and much faster
    const nm = new Float32Array(9);
    M4.normalMat(nm, m);
    for (let k = 0; k < pos.length; k += 3) {
      const x = pos[k], y = pos[k+1], z = pos[k+2];
      this.v.push(
        m[0]*x + m[4]*y + m[8]*z  + m[12],
        m[1]*x + m[5]*y + m[9]*z  + m[13],
        m[2]*x + m[6]*y + m[10]*z + m[14],
      );
      const a = nrm[k], b = nrm[k+1], c = nrm[k+2];
      let nx = nm[0]*a + nm[3]*b + nm[6]*c;
      let ny = nm[1]*a + nm[4]*b + nm[7]*c;
      let nz = nm[2]*a + nm[5]*b + nm[8]*c;
      const L = Math.hypot(nx, ny, nz) || 1;
      this.v.push(nx/L, ny/L, nz/L, color[0], color[1], color[2], glow);
    }
    for (let k = 0; k < idx.length; k++) this.i.push(base + idx[k]);
    this.n += pos.length / 3;
    return this;
  }

  get vertexCount() { return this.n; }

  upload(gl) {
    return uploadMesh(gl, new Float32Array(this.v),
      (this.n > 65535 ? new Uint32Array(this.i) : new Uint16Array(this.i)));
  }
}

/* ---------- primitives ---------- */

/* unit cube centred on origin, 1x1x1 */
function pBox() {
  const pos = [], nrm = [], idx = [];
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
    for (let k = 0; k < 4; k++) { pos.push(...f[k]); nrm.push(...f[4]); }
    idx.push(b, b+1, b+2, b, b+2, b+3);
  }
  return { pos, nrm, idx };
}

/* cylinder along +Y, radius 0.5, height 1, centred */
function pCyl(seg = 16, capTop = true, capBot = true, rTop = 0.5, rBot = 0.5) {
  const pos = [], nrm = [], idx = [];
  const slope = (rBot - rTop);
  for (let s = 0; s <= seg; s++) {
    const a = (s / seg) * TAU, c = Math.cos(a), n = Math.sin(a);
    const L = Math.hypot(1, slope) || 1;
    pos.push(c*rTop, 0.5, n*rTop);  nrm.push(c/L, slope/L, n/L);
    pos.push(c*rBot, -0.5, n*rBot); nrm.push(c/L, slope/L, n/L);
  }
  for (let s = 0; s < seg; s++) {
    const a = s*2, b = s*2 + 2;
    idx.push(a, a+1, b+1, a, b+1, b);
  }
  const cap = (y, r, ny) => {
    const c0 = pos.length / 3;
    pos.push(0, y, 0); nrm.push(0, ny, 0);
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * TAU;
      pos.push(Math.cos(a)*r, y, Math.sin(a)*r); nrm.push(0, ny, 0);
    }
    for (let s = 0; s < seg; s++) {
      if (ny > 0) idx.push(c0, c0+1+s, c0+2+s);
      else        idx.push(c0, c0+2+s, c0+1+s);
    }
  };
  if (capTop) cap(0.5, rTop, 1);
  if (capBot) cap(-0.5, rBot, -1);
  return { pos, nrm, idx };
}

/* UV sphere, radius 0.5 */
function pSphere(seg = 16, rings = 10) {
  const pos = [], nrm = [], idx = [];
  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * Math.PI, sp = Math.sin(phi), cp = Math.cos(phi);
    for (let s = 0; s <= seg; s++) {
      const th = (s / seg) * TAU;
      const x = sp * Math.cos(th), y = cp, z = sp * Math.sin(th);
      pos.push(x*0.5, y*0.5, z*0.5); nrm.push(x, y, z);
    }
  }
  const w = seg + 1;
  for (let r = 0; r < rings; r++) for (let s = 0; s < seg; s++) {
    const a = r*w + s, b = a + w;
    idx.push(a, b, a+1, a+1, b, b+1);
  }
  return { pos, nrm, idx };
}

/* torus in the XZ plane; R = major radius 0.5, r = minor */
function pTorus(r = 0.12, seg = 32, side = 10) {
  const pos = [], nrm = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const u = (i / seg) * TAU, cu = Math.cos(u), su = Math.sin(u);
    for (let j = 0; j <= side; j++) {
      const v = (j / side) * TAU, cv = Math.cos(v), sv = Math.sin(v);
      const nx = cu*cv, ny = sv, nz = su*cv;
      pos.push(cu*(0.5 + r*cv), r*sv, su*(0.5 + r*cv));
      nrm.push(nx, ny, nz);
    }
  }
  const w = side + 1;
  for (let i = 0; i < seg; i++) for (let j = 0; j < side; j++) {
    const a = i*w + j, b = a + w;
    idx.push(a, b, a+1, a+1, b, b+1);
  }
  return { pos, nrm, idx };
}

/* flat annulus on the XZ plane, outer radius 0.5 */
function pRing(inner = 0.4, seg = 48) {
  const pos = [], nrm = [], idx = [];
  for (let s = 0; s <= seg; s++) {
    const a = (s / seg) * TAU, c = Math.cos(a), n = Math.sin(a);
    pos.push(c*0.5, 0, n*0.5);      nrm.push(0, 1, 0);
    pos.push(c*inner, 0, n*inner);  nrm.push(0, 1, 0);
  }
  for (let s = 0; s < seg; s++) {
    const a = s*2, b = a + 2;
    idx.push(a, a+1, b+1, a, b+1, b);
  }
  return { pos, nrm, idx };
}

/* unit quad on XY, facing +Z, 1x1 */
function pQuad() {
  return {
    pos: [-.5,-.5,0,  .5,-.5,0,  .5,.5,0, -.5,.5,0],
    nrm: [0,0,1, 0,0,1, 0,0,1, 0,0,1],
    idx: [0,1,2, 0,2,3],
  };
}

/* regular n-gon prism along Y (height 1, circumradius 0.5) — crystals, columns */
function pPrism(sides = 6, rTop = 0.5) { return pCyl(sides, true, true, rTop, 0.5); }

/* capsule along +Y: total height 1 including caps, given radius */
function pCapsule(r = 0.2, seg = 12, rings = 6) {
  const pos = [], nrm = [], idx = [];
  const half = Math.max(0.0001, 0.5 - r);
  const push = (x, y, z, nx, ny, nz) => { pos.push(x, y, z); nrm.push(nx, ny, nz); };
  const rows = [];
  for (let i = 0; i <= rings; i++) {            // top hemisphere
    const phi = (i / rings) * (Math.PI / 2);
    rows.push({ y: half + Math.cos(phi)*r, rad: Math.sin(phi)*r, ny: Math.cos(phi) });
  }
  for (let i = 0; i <= rings; i++) {            // bottom hemisphere
    const phi = (i / rings) * (Math.PI / 2);
    rows.push({ y: -half - Math.sin(phi)*r, rad: Math.cos(phi)*r, ny: -Math.sin(phi) });
  }
  for (const row of rows) {
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * TAU, c = Math.cos(a), n = Math.sin(a);
      const hl = Math.hypot(c*(row.rad/r || 1), row.ny) || 1;
      push(c*row.rad, row.y, n*row.rad, c*(row.rad/r||1)/hl, row.ny/hl, n*(row.rad/r||1)/hl);
    }
  }
  const w = seg + 1;
  for (let r0 = 0; r0 < rows.length - 1; r0++) for (let s = 0; s < seg; s++) {
    const a = r0*w + s, b = a + w;
    idx.push(a, b, a+1, a+1, b, b+1);
  }
  return { pos, nrm, idx };
}

/* subdivided ground plane (XZ), size 1, with a vertex-noise displacement hook */
function pGround(n = 1) {
  const pos = [], nrm = [], idx = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
    pos.push(i/n - 0.5, 0, j/n - 0.5); nrm.push(0, 1, 0);
  }
  const w = n + 1;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const a = i*w + j;
    idx.push(a, a+1, a+w, a+1, a+w+1, a+w);
  }
  return { pos, nrm, idx };
}

/* thin line-segment as a box, from p0 to p1 — girders, cables, lattice edges */
function strut(b, p0, p1, thick, color, glow = 0) {
  const dx = p1[0]-p0[0], dy = p1[1]-p0[1], dz = p1[2]-p0[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-5) return;
  const yaw = Math.atan2(dx, dz);
  const pitch = -Math.asin(dy / len) + Math.PI/2;
  const m = xform(
    [(p0[0]+p1[0])/2, (p0[1]+p1[1])/2, (p0[2]+p1[2])/2],
    [pitch, yaw, 0],
    [thick, len, thick],
  );
  b.add(BOX, m, color, glow);
}

/* shared primitive instances — built once */
const BOX     = pBox();
const SPHERE  = pSphere(18, 12);
const SPHERE_LO = pSphere(10, 7);
const CYL     = pCyl(18);
const CYL_LO  = pCyl(10);
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
