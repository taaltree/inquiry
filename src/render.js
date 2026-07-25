/* ============================================================
   render.js — shader programs and the frame pipeline
     scene -> HDR buffer -> bright pass -> 2x separable blur -> composite
   ============================================================ */

const MAX_LIGHTS = 16;

const VS_SCENE = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec3 aCol;
layout(location=3) in float aGlow;
uniform mat4 uVP, uModel;
uniform mat3 uNormalMat;
out vec3 vWorld, vNrm, vCol;
out float vGlow;
void main(){
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorld = wp.xyz;
  vNrm   = normalize(uNormalMat * aNrm);
  vCol   = aCol;
  vGlow  = aGlow;
  gl_Position = uVP * wp;
}`;

const FS_SCENE = `#version 300 es
precision highp float;
in vec3 vWorld, vNrm, vCol;
in float vGlow;

uniform vec3  uCam, uSunDir, uSunCol, uSkyCol, uGroundCol, uFogCol;
uniform float uFogDensity, uTime, uHolo, uAlpha, uEmissive;
uniform vec3  uTint;
uniform int   uLightCount;
uniform vec3  uLightPos[${MAX_LIGHTS}];
uniform vec3  uLightCol[${MAX_LIGHTS}];
uniform float uLightRange[${MAX_LIGHTS}];
out vec4 frag;

float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

void main(){
  vec3 N = normalize(vNrm);
  vec3 V = normalize(uCam - vWorld);
  float dist = length(uCam - vWorld);
  vec3 albedo = vCol * uTint;

  // ---- procedural floor grid (upward faces near ground level) -------------
  float floorMask = step(0.94, N.y) * (1.0 - smoothstep(0.05, 0.5, abs(vWorld.y)));
  if (floorMask > 0.0) {
    vec2 g = abs(fract(vWorld.xz * 0.5) - 0.5) / fwidth(vWorld.xz * 0.5);
    float line = 1.0 - min(min(g.x, g.y), 1.0);
    vec2 g2 = abs(fract(vWorld.xz * 0.05) - 0.5) / fwidth(vWorld.xz * 0.05);
    float major = 1.0 - min(min(g2.x, g2.y), 1.0);
    albedo = mix(albedo, albedo * 2.6 + 0.05, line * 0.5 * floorMask);
    albedo = mix(albedo, albedo * 3.0 + 0.12, major * 0.7 * floorMask);
  }

  // ---- lighting ------------------------------------------------------------
  float ndl = max(dot(N, uSunDir), 0.0);
  float wrap = (dot(N, uSunDir) * 0.5 + 0.5);              // soft wrap term
  vec3 diffuse = uSunCol * (ndl * 0.88 + wrap * 0.12);

  float hemi = N.y * 0.5 + 0.5;
  vec3 ambient = mix(uGroundCol, uSkyCol, hemi * hemi);

  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(N, H), 0.0), 64.0) * 0.30;

  vec3 pointSum = vec3(0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec3 d = uLightPos[i] - vWorld;
    float dd = length(d);
    float att = max(0.0, 1.0 - dd / uLightRange[i]);
    att *= att;
    if (att <= 0.001) continue;
    float nl = max(dot(N, d / max(dd, 0.001)), 0.0) * 0.8 + 0.2;
    pointSum += uLightCol[i] * att * nl;
  }

  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);

  vec3 col = albedo * (ambient + diffuse + pointSum) + spec * uSunCol;
  col += albedo * fres * 0.20;                              // rim
  col += albedo * vGlow * 3.60 * uEmissive;                  // emissive
  col += vGlow * 0.30 * uEmissive * albedo * (0.78 + 0.22 * sin(uTime * 2.0 + vWorld.y * 3.0));

  float alpha = uAlpha;

  // ---- holographic figures --------------------------------------------------
  if (uHolo > 0.5) {
    float scan = sin(vWorld.y * 42.0 - uTime * 2.2) * 0.5 + 0.5;
    float band = smoothstep(0.35, 1.0, scan);
    col += albedo * band * 0.16;
    col *= 0.88 + 0.22 * fres * 2.0;
    col += albedo * fres * 0.85;
    float flick = 0.97 + 0.03 * hash21(vec2(floor(uTime * 18.0), floor(vWorld.y * 8.0)));
    col *= flick;
    alpha *= clamp(0.62 + fres * 0.85 + band * 0.12, 0.0, 1.0);
  }

  // ---- fog ------------------------------------------------------------------
  float fog = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
  float height = exp(-max(vWorld.y, 0.0) * 0.035);
  fog = clamp(fog * mix(0.55, 1.0, height), 0.0, 1.0);
  col = mix(col, uFogCol, fog);

  frag = vec4(col, alpha);
}`;

/* ---- sky: procedural gradient + stars + nebula, drawn as a fullscreen quad ---- */
const VS_FS = `#version 300 es
layout(location=0) in vec3 aPos;
out vec2 vUV;
void main(){ vUV = aPos.xy + 0.5; gl_Position = vec4(aPos.xy * 2.0, 0.0, 1.0); }`;

const FS_SKY = `#version 300 es
precision highp float;
in vec2 vUV;
uniform mat4  uInvVP;
uniform vec3  uCam, uSkyTop, uSkyHorizon, uFogCol;
uniform float uTime;
out vec4 frag;

float hash13(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i+vec3(0,0,0)), hash13(i+vec3(1,0,0)), f.x),
                 mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), f.x),
                 mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * noise3(p); p *= 2.1; a *= 0.5; } return s; }

void main(){
  vec4 clip = vec4(vUV * 2.0 - 1.0, 1.0, 1.0);
  vec4 wp = uInvVP * clip;
  vec3 dir = normalize(wp.xyz / wp.w - uCam);

  float h = clamp(dir.y * 1.4 + 0.06, -1.0, 1.0);
  vec3 col = mix(uSkyHorizon, uSkyTop, smoothstep(-0.05, 0.75, h));

  // nebula wash, only in the upper hemisphere
  float up = smoothstep(-0.05, 0.6, dir.y);
  float n = fbm(dir * 3.2 + vec3(0.0, 0.0, uTime * 0.004));
  vec3 neb = mix(vec3(0.10, 0.05, 0.28), vec3(0.03, 0.16, 0.26), fbm(dir * 1.7 + 4.0));
  col += neb * pow(n, 2.6) * 0.85 * up;

  // stars: quantise the direction into cells, one star per cell
  vec3 sp = dir * 190.0;
  vec3 cell = floor(sp);
  float r = hash13(cell);
  if (r > 0.976) {
    vec3 jitter = vec3(hash13(cell + 1.7), hash13(cell + 5.3), hash13(cell + 9.1)) - 0.5;
    float d = length(fract(sp) - 0.5 - jitter * 0.6);
    float bright = smoothstep(0.30, 0.0, d);
    float tw = 0.65 + 0.35 * sin(uTime * 1.6 + r * 60.0);
    vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.88, 0.72), hash13(cell + 21.0));
    col += tint * bright * tw * (0.5 + (r - 0.976) * 34.0) * up;
  }

  // horizon haze so the ground plane dissolves into the sky
  col = mix(uFogCol, col, smoothstep(-0.16, 0.22, dir.y));
  frag = vec4(col, 1.0);
}`;

/* ---- world-space textured billboard (nameplates, markers) ---- */
const VS_BILLBOARD = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uVP;
uniform vec3 uCenter, uCamRight, uCamUp;
uniform vec2 uSize;
out vec2 vUV;
void main(){
  vUV = vec2(aPos.x + 0.5, 0.5 - aPos.y);
  vec3 wp = uCenter + uCamRight * (aPos.x * uSize.x) + uCamUp * (aPos.y * uSize.y);
  gl_Position = uVP * vec4(wp, 1.0);
}`;

const FS_BILLBOARD = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec4 uTintA;
uniform float uGlow;
out vec4 frag;
void main(){
  vec4 t = texture(uTex, vUV);
  if (t.a < 0.01) discard;
  frag = vec4(t.rgb * uTintA.rgb * (1.0 + uGlow), t.a * uTintA.a);
}`;

const FS_BRIGHT = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform float uThreshold;
out vec4 frag;
void main(){
  vec3 c = texture(uTex, vUV).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = max(0.0, l - uThreshold) / max(l, 0.0001);
  frag = vec4(c * k, 1.0);
}`;

const FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uDir;
out vec4 frag;
void main(){
  // 9-tap gaussian
  float w[5] = float[5](0.227027, 0.194595, 0.121622, 0.054054, 0.016216);
  vec3 s = texture(uTex, vUV).rgb * w[0];
  for (int i = 1; i < 5; i++) {
    vec2 o = uDir * float(i);
    s += texture(uTex, vUV + o).rgb * w[i];
    s += texture(uTex, vUV - o).rgb * w[i];
  }
  frag = vec4(s, 1.0);
}`;

const FS_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene, uBloom;
uniform vec2  uRes;
uniform float uTime, uBloomAmt, uPulse, uPulseHue, uFade, uAberration, uDim, uNoise;
out vec4 frag;

vec3 aces(vec3 x){
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

void main(){
  vec2 uv = vUV;

  // ---- mind pollution: torn scan bands and a creeping magenta cast --------
  if (uNoise > 0.001) {
    float band = floor(uv.y * 42.0);
    float jitter = hash12(vec2(band, floor(uTime * 9.0)));
    float torn = step(1.0 - uNoise * 0.30, jitter);
    uv.x += (jitter - 0.5) * 0.020 * uNoise * torn;
  }

  vec2 fromC = uv - 0.5;
  float r2 = dot(fromC, fromC);

  // barrel-ish chromatic split, strongest at the edges
  float ab = uAberration * (0.0016 + r2 * 0.010);
  vec3 col;
  col.r = texture(uScene, uv + fromC * ab).r;
  col.g = texture(uScene, uv).g;
  col.b = texture(uScene, uv - fromC * ab).b;

  col += texture(uBloom, uv).rgb * uBloomAmt;

  // insight pulse — a coloured wash that blooms out from the reticle
  if (uPulse > 0.001) {
    float ring = abs(length(fromC * vec2(uRes.x / uRes.y, 1.0)) - (1.0 - uPulse) * 0.85);
    float band = smoothstep(0.16, 0.0, ring) * uPulse;
    vec3 hue = mix(vec3(0.35, 0.85, 1.0), vec3(1.0, 0.82, 0.35), uPulseHue);
    col += hue * band * 0.5;
    col += hue * uPulse * uPulse * 0.10;
  }

  // pollution desaturates toward a sickly feed-magenta before tonemapping
  if (uNoise > 0.001) {
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(col, vec3(lum) * vec3(1.10, 0.68, 0.98), uNoise * 0.34);
    col *= 1.0 - uNoise * 0.16;                 // clouded, not blown out
    col += vec3(0.018, 0.0, 0.014) * uNoise;
  }

  col = aces(col * 1.12);

  // scanlines + grain + vignette
  float scan = 0.988 + 0.012 * sin(uv.y * uRes.y * 1.6);
  col *= scan;
  col += (hash12(uv * uRes + fract(uTime) * 311.0) - 0.5) * (0.016 + uNoise * 0.032);
  float vig = smoothstep(1.08, 0.20, length(fromC * vec2(1.05, 1.25)));
  col *= mix(0.26, 1.0, vig);
  col *= uDim;

  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  frag = vec4(col * uFade, 1.0);
}`;

/* ============================================================ */

class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', {
      antialias: true, alpha: false, depth: true,
      powerPreference: 'high-performance', preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.canvas = canvas;

    this.floatOK = !!gl.getExtension('EXT_color_buffer_half_float') || !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');

    this.pScene  = makeProgram(gl, VS_SCENE, FS_SCENE, 'scene');
    this.pSky    = makeProgram(gl, VS_FS, FS_SKY, 'sky');
    this.pBill   = makeProgram(gl, VS_BILLBOARD, FS_BILLBOARD, 'billboard');
    this.pBright = makeProgram(gl, VS_FS, FS_BRIGHT, 'bright');
    this.pBlur   = makeProgram(gl, VS_FS, FS_BLUR, 'blur');
    this.pComp   = makeProgram(gl, VS_FS, FS_COMPOSITE, 'composite');

    // fullscreen / billboard quad
    const b = new Builder();
    b.add(QUAD, xform(), [1,1,1], 0);
    this.quad = b.upload(gl);

    this.vp   = M4.create();
    this.proj = M4.create();
    this.viewM = M4.create();
    this.invVP = M4.create();
    this.model = M4.create();
    this.nrmM  = new Float32Array(9);

    this.lights = [];
    this.resize();
  }

  /* drop resolution rather than framerate on weak GPUs */
  setQuality(scale) {
    const s = clamp(scale, 0.55, 1.0);
    if (Math.abs(s - (this.qScale || 1)) < 0.04) return;
    this.qScale = s;
    this.sceneFBO = null;              // force resize() to rebuild the targets
    this.resize();
  }

  resize() {
    const gl = this.gl, c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75) * (this.qScale || 1);
    const w = Math.max(2, Math.floor(c.clientWidth * dpr));
    const h = Math.max(2, Math.floor(c.clientHeight * dpr));
    if (c.width === w && c.height === h && this.sceneFBO) return;
    c.width = w; c.height = h;
    this.W = w; this.H = h;

    const del = (f) => { if (f) { gl.deleteFramebuffer(f.fbo); gl.deleteTexture(f.tex); if (f.depth) gl.deleteRenderbuffer(f.depth); } };
    del(this.sceneFBO); del(this.bright); del(this.blurA); del(this.blurB);

    this.sceneFBO = makeFBO(gl, w, h, { depth: true, float: this.floatOK });
    const bw = Math.max(2, w >> 2), bh = Math.max(2, h >> 2);
    this.bright = makeFBO(gl, bw, bh, { float: this.floatOK });
    this.blurA  = makeFBO(gl, bw, bh, { float: this.floatOK });
    this.blurB  = makeFBO(gl, bw, bh, { float: this.floatOK });
  }

  /* pick the strongest N lights near the camera */
  setLights(all, cx, cy, cz) {
    const scored = all.map((l) => {
      const d = Math.hypot(l.pos[0]-cx, l.pos[1]-cy, l.pos[2]-cz);
      return { l, s: (l.range + 20) / (d + 1) };
    }).sort((a, b) => b.s - a.s).slice(0, MAX_LIGHTS).map((x) => x.l);
    this.active = scored;
  }

  uploadLights(p) {
    const gl = this.gl, ls = this.active || [];
    const pos = new Float32Array(MAX_LIGHTS * 3), col = new Float32Array(MAX_LIGHTS * 3), rng = new Float32Array(MAX_LIGHTS);
    for (let i = 0; i < ls.length; i++) {
      pos[i*3] = ls[i].pos[0]; pos[i*3+1] = ls[i].pos[1]; pos[i*3+2] = ls[i].pos[2];
      const inten = (ls[i].intensity == null ? 1 : ls[i].intensity) * 1.3;
      col[i*3] = ls[i].col[0]*inten; col[i*3+1] = ls[i].col[1]*inten; col[i*3+2] = ls[i].col[2]*inten;
      rng[i] = ls[i].range;
    }
    gl.uniform1i(p.u.uLightCount, ls.length);
    gl.uniform3fv(p.u.uLightPos, pos);
    gl.uniform3fv(p.u.uLightCol, col);
    gl.uniform1fv(p.u.uLightRange, rng);
  }

  beginScene(cam, env, time) {
    const gl = this.gl;
    M4.perspective(this.proj, cam.fov, this.W / this.H, 0.08, 900);
    M4.view(this.viewM, cam.x, cam.y, cam.z, cam.yaw, cam.pitch);
    M4.mul(this.vp, this.proj, this.viewM);
    this.cam = cam; this.env = env; this.time = time;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO.fbo);
    gl.viewport(0, 0, this.W, this.H);
    gl.clearColor(env.fog[0], env.fog[1], env.fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // sky first, no depth
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    const invView = M4.create();
    // inverse of (proj*view) via inverse view (transpose rotation) then inverse proj — do it numerically
    invertMat4(this.invVP, this.vp);
    gl.useProgram(this.pSky);
    gl.uniformMatrix4fv(this.pSky.u.uInvVP, false, this.invVP);
    gl.uniform3f(this.pSky.u.uCam, cam.x, cam.y, cam.z);
    gl.uniform3fv(this.pSky.u.uSkyTop, env.skyTop);
    gl.uniform3fv(this.pSky.u.uSkyHorizon, env.skyHorizon);
    gl.uniform3fv(this.pSky.u.uFogCol, env.fog);
    gl.uniform1f(this.pSky.u.uTime, time);
    gl.bindVertexArray(this.quad.vao);
    gl.drawElements(gl.TRIANGLES, this.quad.count, gl.UNSIGNED_SHORT, 0);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    // prime the scene program
    const p = this.pScene;
    gl.useProgram(p);
    gl.uniformMatrix4fv(p.u.uVP, false, this.vp);
    gl.uniform3f(p.u.uCam, cam.x, cam.y, cam.z);
    gl.uniform3fv(p.u.uSunDir, env.sunDir);
    gl.uniform3fv(p.u.uSunCol, env.sunCol);
    gl.uniform3fv(p.u.uSkyCol, env.ambSky);
    gl.uniform3fv(p.u.uGroundCol, env.ambGround);
    gl.uniform3fv(p.u.uFogCol, env.fog);
    gl.uniform1f(p.u.uFogDensity, env.fogDensity);
    gl.uniform1f(p.u.uTime, time);
    gl.uniform1f(p.u.uHolo, 0);
    gl.uniform1f(p.u.uAlpha, 1);
    gl.uniform1f(p.u.uEmissive, 1);
    gl.uniform3f(p.u.uTint, 1, 1, 1);
    this.uploadLights(p);
  }

  /* draw an uploaded mesh with a model transform */
  drawMesh(mesh, model, opts = {}) {
    const gl = this.gl, p = this.pScene;
    const m = model || IDENT;
    gl.uniformMatrix4fv(p.u.uModel, false, m);
    M4.normalMat(this.nrmM, m);
    gl.uniformMatrix3fv(p.u.uNormalMat, false, this.nrmM);
    gl.uniform1f(p.u.uHolo, opts.holo ? 1 : 0);
    gl.uniform1f(p.u.uAlpha, opts.alpha == null ? 1 : opts.alpha);
    gl.uniform1f(p.u.uEmissive, opts.emissive == null ? 1 : opts.emissive);
    const t = opts.tint || WHITE3;
    gl.uniform3f(p.u.uTint, t[0], t[1], t[2]);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.u32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
  }

  useSceneProgram() { this.gl.useProgram(this.pScene); }

  /* override the light set — used to light the viewmodel from the camera */
  overrideLights(list) {
    this.active = list;
    this.gl.useProgram(this.pScene);
    this.uploadLights(this.pScene);
  }

  drawBillboard(tex, center, w, h, tint, glow, faceCam) {
    const gl = this.gl, p = this.pBill;
    gl.useProgram(p);
    gl.uniformMatrix4fv(p.u.uVP, false, this.vp);
    gl.uniform3fv(p.u.uCenter, center);
    gl.uniform3fv(p.u.uCamRight, faceCam.right);
    gl.uniform3fv(p.u.uCamUp, faceCam.up);
    gl.uniform2f(p.u.uSize, w, h);
    gl.uniform4f(p.u.uTintA, tint[0], tint[1], tint[2], tint[3]);
    gl.uniform1f(p.u.uGlow, glow || 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(p.u.uTex, 0);
    gl.bindVertexArray(this.quad.vao);
    gl.drawElements(gl.TRIANGLES, this.quad.count, gl.UNSIGNED_SHORT, 0);
  }

  fsPass(prog, target, setup) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, target ? target.w : this.W, target ? target.h : this.H);
    gl.useProgram(prog);
    setup(prog);
    gl.bindVertexArray(this.quad.vao);
    gl.drawElements(gl.TRIANGLES, this.quad.count, gl.UNSIGNED_SHORT, 0);
  }

  post(state) {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);

    const bind = (tex, unit, loc) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(loc, unit);
    };

    this.fsPass(this.pBright, this.bright, (p) => {
      bind(this.sceneFBO.tex, 0, p.u.uTex);
      gl.uniform1f(p.u.uThreshold, 1.00);
    });
    const bw = this.bright.w, bh = this.bright.h;
    this.fsPass(this.pBlur, this.blurA, (p) => {
      bind(this.bright.tex, 0, p.u.uTex);
      gl.uniform2f(p.u.uDir, 0.70 / bw, 0);
    });
    this.fsPass(this.pBlur, this.blurB, (p) => {
      bind(this.blurA.tex, 0, p.u.uTex);
      gl.uniform2f(p.u.uDir, 0, 0.70 / bh);
    });
    this.fsPass(this.pBlur, this.blurA, (p) => {
      bind(this.blurB.tex, 0, p.u.uTex);
      gl.uniform2f(p.u.uDir, 1.35 / bw, 0);
    });
    this.fsPass(this.pBlur, this.blurB, (p) => {
      bind(this.blurA.tex, 0, p.u.uTex);
      gl.uniform2f(p.u.uDir, 0, 1.35 / bh);
    });

    this.fsPass(this.pComp, null, (p) => {
      bind(this.sceneFBO.tex, 0, p.u.uScene);
      bind(this.blurB.tex, 1, p.u.uBloom);
      gl.uniform2f(p.u.uRes, this.W, this.H);
      gl.uniform1f(p.u.uTime, this.time);
      gl.uniform1f(p.u.uBloomAmt, state.bloom);
      gl.uniform1f(p.u.uPulse, state.pulse);
      gl.uniform1f(p.u.uPulseHue, state.pulseHue || 0);
      gl.uniform1f(p.u.uFade, state.fade);
      gl.uniform1f(p.u.uAberration, state.aberration);
      gl.uniform1f(p.u.uDim, state.dim == null ? 1 : state.dim);
      gl.uniform1f(p.u.uNoise, state.noise || 0);
    });
  }
}

const IDENT = M4.create();
const WHITE3 = [1, 1, 1];

/* general 4x4 inverse — only used once a frame for the sky ray */
function invertMat4(o, m) {
  const a00=m[0],a01=m[1],a02=m[2],a03=m[3], a10=m[4],a11=m[5],a12=m[6],a13=m[7],
        a20=m[8],a21=m[9],a22=m[10],a23=m[11], a30=m[12],a31=m[13],a32=m[14],a33=m[15];
  const b00=a00*a11-a01*a10, b01=a00*a12-a02*a10, b02=a00*a13-a03*a10,
        b03=a01*a12-a02*a11, b04=a01*a13-a03*a11, b05=a02*a13-a03*a12,
        b06=a20*a31-a21*a30, b07=a20*a32-a22*a30, b08=a20*a33-a23*a30,
        b09=a21*a32-a22*a31, b10=a21*a33-a23*a31, b11=a22*a33-a23*a32;
  let det = b00*b11 - b01*b10 + b02*b09 + b03*b08 - b04*b07 + b05*b06;
  if (!det) return o;
  det = 1 / det;
  o[0]=(a11*b11-a12*b10+a13*b09)*det;  o[1]=(a02*b10-a01*b11-a03*b09)*det;
  o[2]=(a31*b05-a32*b04+a33*b03)*det;  o[3]=(a22*b04-a21*b05-a23*b03)*det;
  o[4]=(a12*b08-a10*b11-a13*b07)*det;  o[5]=(a00*b11-a02*b08+a03*b07)*det;
  o[6]=(a32*b02-a30*b05-a33*b01)*det;  o[7]=(a20*b05-a22*b02+a23*b01)*det;
  o[8]=(a10*b10-a11*b08+a13*b06)*det;  o[9]=(a01*b08-a00*b10-a03*b06)*det;
  o[10]=(a30*b04-a31*b02+a33*b00)*det; o[11]=(a21*b02-a20*b04-a23*b00)*det;
  o[12]=(a11*b07-a10*b09-a12*b06)*det; o[13]=(a00*b09-a01*b07+a02*b06)*det;
  o[14]=(a31*b01-a30*b03-a32*b00)*det; o[15]=(a20*b03-a21*b01+a22*b00)*det;
  return o;
}
