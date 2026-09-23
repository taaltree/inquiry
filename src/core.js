/* ============================================================
   core.js — math + WebGL plumbing
   ============================================================ */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);

/* deterministic PRNG so the world is identical every load */
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- mat4 (column-major, WebGL order) ---------- */
const M4 = {
  create: () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),

  ident(o) { o.set([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); return o; },

  mul(o, a, b) {
    const a00=a[0],a01=a[1],a02=a[2],a03=a[3], a10=a[4],a11=a[5],a12=a[6],a13=a[7],
          a20=a[8],a21=a[9],a22=a[10],a23=a[11], a30=a[12],a31=a[13],a32=a[14],a33=a[15];
    for (let i = 0; i < 4; i++) {
      const b0=b[i*4], b1=b[i*4+1], b2=b[i*4+2], b3=b[i*4+3];
      o[i*4]   = b0*a00 + b1*a10 + b2*a20 + b3*a30;
      o[i*4+1] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
      o[i*4+2] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
      o[i*4+3] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
    }
    return o;
  },

  perspective(o, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    o.set([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
    return o;
  },

  ortho(o, l, r, b, t, n, f) {
    const lr=1/(l-r), bt=1/(b-t), nf=1/(n-f);
    o.set([-2*lr,0,0,0, 0,-2*bt,0,0, 0,0,2*nf,0, (l+r)*lr,(t+b)*bt,(f+n)*nf,1]);
    return o;
  },

  /* first-person view matrix from position + yaw/pitch */
  view(o, px, py, pz, yaw, pitch, roll) {
    const cy=Math.cos(yaw), sy=Math.sin(yaw), cp=Math.cos(pitch), sp=Math.sin(pitch);
    // camera basis: right, up, back(-forward)
    let rx=cy,  ry=0,  rz=-sy;
    let ux=sy*sp, uy=cp, uz=cy*sp;
    const bx=sy*cp, by=-sp, bz=cy*cp;
    if (roll) {                       // bank the view around the look axis
      const cr=Math.cos(roll), sr=Math.sin(roll);
      const nrx=rx*cr+ux*sr, nry=ry*cr+uy*sr, nrz=rz*cr+uz*sr;
      const nux=ux*cr-rx*sr, nuy=uy*cr-ry*sr, nuz=uz*cr-rz*sr;
      rx=nrx; ry=nry; rz=nrz; ux=nux; uy=nuy; uz=nuz;
    }
    o[0]=rx; o[1]=ux; o[2]=bx; o[3]=0;
    o[4]=ry; o[5]=uy; o[6]=by; o[7]=0;
    o[8]=rz; o[9]=uz; o[10]=bz; o[11]=0;
    o[12]=-(rx*px+ry*py+rz*pz);
    o[13]=-(ux*px+uy*py+uz*pz);
    o[14]=-(bx*px+by*py+bz*pz);
    o[15]=1;
    return o;
  },

  trs(o, tx, ty, tz, ry, sx, sy, sz) {
    const c = Math.cos(ry), s = Math.sin(ry);
    o[0]=c*sx;  o[1]=0;    o[2]=-s*sx; o[3]=0;
    o[4]=0;     o[5]=sy;   o[6]=0;     o[7]=0;
    o[8]=s*sz;  o[9]=0;    o[10]=c*sz; o[11]=0;
    o[12]=tx;   o[13]=ty;  o[14]=tz;   o[15]=1;
    return o;
  },

  /* right-handed look-at, for the light camera */
  lookAt(o, ex, ey, ez, cx, cy, cz, ux, uy, uz) {
    let fx=cx-ex, fy=cy-ey, fz=cz-ez; let L=Math.hypot(fx,fy,fz)||1; fx/=L; fy/=L; fz/=L;
    let rx=fy*uz-fz*uy, ry=fz*ux-fx*uz, rz=fx*uy-fy*ux; L=Math.hypot(rx,ry,rz)||1; rx/=L; ry/=L; rz/=L;
    const nx=ry*fz-rz*fy, ny=rz*fx-rx*fz, nz=rx*fy-ry*fx;
    o[0]=rx; o[1]=nx; o[2]=-fx; o[3]=0;
    o[4]=ry; o[5]=ny; o[6]=-fy; o[7]=0;
    o[8]=rz; o[9]=nz; o[10]=-fz; o[11]=0;
    o[12]=-(rx*ex+ry*ey+rz*ez);
    o[13]=-(nx*ex+ny*ey+nz*ez);
    o[14]=(fx*ex+fy*ey+fz*ez);
    o[15]=1;
    return o;
  },

  /* inverse-transpose of the upper 3x3, as a mat3 in a 9-float array */
  normalMat(o, m) {
    const a=m[0],b=m[1],c=m[2], d=m[4],e=m[5],f=m[6], g=m[8],h=m[9],i=m[10];
    const A=e*i-f*h, B=f*g-d*i, C=d*h-e*g;
    let det = a*A + b*B + c*C;
    if (!det) { o.set([1,0,0,0,1,0,0,0,1]); return o; }
    det = 1 / det;
    o[0]=A*det;         o[1]=B*det;         o[2]=C*det;
    o[3]=(c*h-b*i)*det; o[4]=(a*i-c*g)*det; o[5]=(b*g-a*h)*det;
    o[6]=(b*f-c*e)*det; o[7]=(c*d-a*f)*det; o[8]=(a*e-b*d)*det;
    return o;
  },
};

/* ---------- colour ---------- */
function hex2rgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function mixc(a, b, t) { return [lerp(a[0],b[0],t), lerp(a[1],b[1],t), lerp(a[2],b[2],t)]; }
function scalec(a, s) { return [a[0]*s, a[1]*s, a[2]*s]; }

/* ---------- GL helpers ---------- */
function makeProgram(gl, vsSrc, fsSrc, name) {
  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      console.error(`[${name}] ${type === gl.VERTEX_SHADER ? 'vertex' : 'fragment'} shader:\n${log}`);
      throw new Error(`shader compile failed (${name})`);
    }
    return sh;
  };
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`link failed (${name}): ${gl.getProgramInfoLog(p)}`);
  }
  // cache uniform + attribute locations
  p.u = {}; p.a = {};
  const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < nu; i++) {
    const info = gl.getActiveUniform(p, i);
    const nm = info.name.replace(/\[0\]$/, '');
    p.u[nm] = gl.getUniformLocation(p, nm);
  }
  const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
  for (let i = 0; i < na; i++) {
    const info = gl.getActiveAttrib(p, i);
    p.a[info.name] = gl.getAttribLocation(p, info.name);
  }
  return p;
}

/* Vertex layout shared by every 3D mesh in the game (see geom.js):
   pos3 nrm3 col3 glow1 rough1 metal1 uv2 layer1 kind1 = 16 floats / 64 bytes */
const STRIDE = 16;

function uploadMesh(gl, verts, idx) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

  const bs = STRIDE * 4;
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, bs, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, bs, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, bs, 24);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, bs, 36);
  gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 2, gl.FLOAT, false, bs, 40);
  gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 2, gl.FLOAT, false, bs, 48);
  gl.enableVertexAttribArray(6); gl.vertexAttribPointer(6, 2, gl.FLOAT, false, bs, 56);

  const ebo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

  gl.bindVertexArray(null);
  return { vao, vbo, count: idx.length, u32: idx instanceof Uint32Array };
}

function makeTargetTex(gl, w, h, internal, format, type, filter) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

function makeDepthTex(gl, w, h, shadow) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  const f = shadow ? gl.LINEAR : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (shadow) {
    // hardware 2x2 PCF: sampler2DShadow compares the reference depth for us
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  }
  return t;
}

/* opts: float, depth (renderbuffer), depthTex (readable), mrt (second colour
   attachment for the g-buffer), shadow (depth-only target) */
function makeFBO(gl, w, h, opts = {}) {
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  const out = { fbo, w, h, tex: null, tex2: null, depth: null, depthTex: null };
  if (opts.shadow) {
    out.depthTex = makeDepthTex(gl, w, h, true);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, out.depthTex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return out;
  }
  const internal = opts.float ? gl.RGBA16F : gl.RGBA8;
  const type = opts.float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
  out.tex = makeTargetTex(gl, w, h, internal, gl.RGBA, type, gl.LINEAR);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, out.tex, 0);
  if (opts.mrt) {
    out.tex2 = makeTargetTex(gl, w, h, internal, gl.RGBA, type, gl.NEAREST);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, out.tex2, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  }
  if (opts.depthTex) {
    out.depthTex = makeDepthTex(gl, w, h, false);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, out.depthTex, 0);
  } else if (opts.depth) {
    out.depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, out.depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, out.depth);
  }
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) console.warn('FBO incomplete', status, opts);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return out;
}

/* a mipmapped 2D texture array, filled later by rendering into its layers */
function makeArrayTex(gl, size, layers, internal, levels) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, internal, size, size, layers);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
  const an = gl.getExtension('EXT_texture_filter_anisotropic');
  if (an) gl.texParameterf(gl.TEXTURE_2D_ARRAY, an.TEXTURE_MAX_ANISOTROPY_EXT,
    Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  return t;
}

/* canvas2d -> GL texture, used for every piece of world-space text */
function texFromCanvas(gl, cv) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.generateMipmap(gl.TEXTURE_2D);
  return t;
}
