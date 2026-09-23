/* ============================================================
   render.js — the v3 pipeline

     materials     procedural texture arrays (textures.js), bound once
     shadows       two cascades in one 4096×2048 atlas, fitted to the view,
                   texel-snapped; alpha-tested foliage casts dappled shade
     scene pass    MRT: HDR colour + g-buffer (view normal, linear depth).
                   PBR (GGX / Schlick / Smith), normal maps via a
                   derivative cotangent frame, per-kind behaviour: foliage,
                   window glass lit at night, water, striped lawns, lamps,
                   skinned characters; aerial perspective with sun in-scatter
     sky           analytic gradient + Mie glow + fbm cloud deck + sun, moon
                   and stars, all driven by the time of day (tod.js)
     ssao, bloom, god rays, composite, then FXAA

   Everything is drawn through drawMesh()/drawChunks(); while a shadow pass is
   open the same calls render depth only, so callers never have to know.
   ============================================================ */

const MAX_LIGHTS = 16;
const SHADOW_RES = 2048;          // per cascade; the atlas is 2 × this wide
const CASCADE = [{ half: 34, ahead: 20 }, { half: 210, ahead: 150 }];
const AO_SAMPLES = 16;

/* ---------- shared GLSL ---------- */
const GLSL_NOISE = `
float hash13(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise3(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i+vec3(0,0,0)), hash13(i+vec3(1,0,0)), f.x),
                 mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), f.x),
                 mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float noise2(vec2 x){
  vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}`;

/* the sky's colour in a direction, shared by the sky, reflections and fog */
const GLSL_SKY = `
uniform vec3 uSunDir, uSunGlow, uZenith, uHorizon, uHorizonWarm, uFogCol;
uniform float uNight;
vec3 skyBase(vec3 d){
  float y = max(d.y, 0.0);
  vec3 c = mix(uHorizon, uZenith, pow(y, 0.5));
  // the band toward the sun warms at the ends of the day
  vec2 sh = normalize(uSunDir.xz + vec2(1e-4)), dh = normalize(d.xz + vec2(1e-4));
  float az = max(dot(sh, dh), 0.0);
  c = mix(c, uHorizonWarm, az * az * exp(-y * 6.0) * 0.9);
  float sd = max(dot(d, uSunDir), 0.0);
  c += uSunGlow * (pow(sd, 6.0) * 0.08 + pow(sd, 48.0) * 0.22);
  c = mix(c, uFogCol, clamp(-d.y * 5.0, 0.0, 1.0));
  return c;
}`;

/* ============================================================
   scene
   ============================================================ */
const VS_SCENE = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec3 aCol;
layout(location=3) in float aGlow;
layout(location=4) in vec2 aMat;
layout(location=5) in vec2 aUV;
layout(location=6) in vec2 aTex;
uniform mat4 uVP, uModel, uView;
uniform mat3 uNormalMat;
uniform mat4 uBones[14];
uniform mat4 uBonesP[14];                    // each bone's parent, carried straight on through the joint
uniform float uTime, uWind;
out vec3 vWorld, vNrm, vCol, vView;
out float vGlow;
out vec2 vMat, vUV;
flat out vec2 vTex;
void main(){
  vec4 lp = vec4(aPos, 1.0);
  vec3 ln = aNrm;
  float glow = aGlow;
  if (aTex.y > 15.5) {                       // skinned: one bone, eased toward its parent near the joint
    int bi = int(aTex.y - 16.0 + 0.5);
    mat4 B = uBones[bi];
    if (aGlow > 0.001) B = B * (1.0 - aGlow) + uBonesP[bi] * aGlow;
    lp = B * lp; ln = mat3(B) * ln;
    glow = 0.0;                              // for skinned vertices the glow slot holds the blend weight
  }
  vec4 wp = uModel * lp;
  if (abs(aTex.y - 1.0) < 0.5) {             // foliage sways, more at the crown
    float ph = dot(wp.xz, vec2(0.11, 0.07)) + uTime * 1.3;
    float k = clamp((wp.y - 2.0) * 0.06, 0.0, 1.0) * uWind;
    wp.xz += vec2(sin(ph), cos(ph * 0.8)) * 0.10 * k;
    wp.xyz += vec3(sin(uTime * 5.3 + dot(wp.xyz, vec3(2.7, 1.9, 3.1)))) * 0.025 * k;
  }
  vWorld = wp.xyz;
  vNrm   = normalize(uNormalMat * ln);
  vCol = aCol; vGlow = glow; vMat = aMat; vUV = aUV; vTex = aTex;
  vView  = (uView * wp).xyz;
  gl_Position = uVP * wp;
}`;

const FS_SCENE = (alphaTest) => `#version 300 es
precision highp float;
precision highp sampler2DShadow;
precision highp sampler2DArray;
in vec3 vWorld, vNrm, vCol, vView;
in float vGlow;
in vec2 vMat, vUV;
flat in vec2 vTex;

uniform vec3  uCam, uSunCol, uSkyCol, uGroundCol, uTint;
uniform float uFogDensity, uTime, uHolo, uAlpha, uEmissive, uShadowOn, uLitFrac, uExposure;
uniform mat4  uView, uLightVP0, uLightVP1;
uniform vec4  uShadowParams;   // texel0, texel1, split, fade
uniform sampler2DShadow uShadow;
uniform sampler2DArray uAlb, uNrmT;
uniform int   uLightCount;
uniform vec3  uLightPos[${MAX_LIGHTS}];
uniform vec3  uLightCol[${MAX_LIGHTS}];
uniform float uLightRange[${MAX_LIGHTS}];

layout(location=0) out vec4 frag;
layout(location=1) out vec4 gbuf;

${GLSL_NOISE}
${GLSL_SKY}

float pcf(vec2 uv, float z, vec2 lo, vec2 hi, vec2 texel){
  float s = 0.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++)
    s += texture(uShadow, vec3(clamp(uv + vec2(float(i), float(j)) * texel, lo, hi), z));
  return s / 9.0;
}
float cascade(mat4 M, float off, vec3 wp, vec3 N, float ndl, float tx){
  vec3 p = wp + N * tx * (1.2 + 2.5 * (1.0 - ndl));
  vec4 lp = M * vec4(p, 1.0);
  vec3 c = lp.xyz / lp.w * 0.5 + 0.5;
  if (c.x <= 0.0 || c.x >= 1.0 || c.y <= 0.0 || c.y >= 1.0 || c.z >= 1.0) return -1.0;
  vec2 texel = vec2(0.5, 1.0) / ${SHADOW_RES.toFixed(1)};
  vec2 uv = vec2(c.x * 0.5 + off, c.y);
  return pcf(uv, c.z - 0.0004, vec2(off + texel.x, texel.y), vec2(off + 0.5 - texel.x, 1.0 - texel.y), texel);
}
float shadowAt(vec3 wp, vec3 N, float ndl, float dist){
  if (uShadowOn < 0.5) return 1.0;
  float split = uShadowParams.z;
  if (dist < split) {
    float s0 = cascade(uLightVP0, 0.0, wp, N, ndl, uShadowParams.x);
    if (s0 >= 0.0) {
      float t = smoothstep(split * 0.8, split, dist);
      if (t <= 0.0) return s0;
      float s1 = cascade(uLightVP1, 0.5, wp, N, ndl, uShadowParams.y);
      return mix(s0, s1 < 0.0 ? 1.0 : s1, t);
    }
  }
  float s1 = cascade(uLightVP1, 0.5, wp, N, ndl, uShadowParams.y);
  if (s1 < 0.0) return 1.0;
  return mix(s1, 1.0, smoothstep(uShadowParams.w * 0.8, uShadowParams.w, dist));
}

float D_GGX(float NdH, float a){ float a2 = a * a; float d = NdH * NdH * (a2 - 1.0) + 1.0; return a2 / (3.14159 * d * d + 1e-5); }
float G_Smith(float NdV, float NdL, float a){ float k = (a + 1.0) * (a + 1.0) / 8.0; return (NdV / (NdV * (1.0 - k) + k)) * (NdL / (NdL * (1.0 - k) + k)); }
vec3  F_Schlick(float c, vec3 F0){ return F0 + (1.0 - F0) * pow(1.0 - c, 5.0); }
vec3  F_SchlickR(float c, vec3 F0, float r){ return F0 + (max(vec3(1.0 - r), F0) - F0) * pow(1.0 - c, 5.0); }

vec3 shade(vec3 N, vec3 V, vec3 L, vec3 albedo, float rough, float metal, vec3 lightCol) {
  vec3 H = normalize(L + V);
  float NdL = max(dot(N, L), 0.0);
  if (NdL <= 0.0) return vec3(0.0);
  float NdV = max(dot(N, V), 1e-3), NdH = max(dot(N, H), 0.0), VdH = max(dot(V, H), 0.0);
  float a = max(rough * rough, 0.02);
  vec3 F0 = mix(vec3(0.04), albedo, metal);
  vec3 F = F_Schlick(VdH, F0);
  vec3 spec = (D_GGX(NdH, a) * G_Smith(NdV, NdL, a) * F) / max(4.0 * NdV * NdL, 1e-3);
  vec3 kd = (1.0 - F) * (1.0 - metal);
  return (kd * albedo / 3.14159 + spec) * lightCol * NdL;
}

mat3 cotangent(vec3 N, vec3 p, vec2 uv){
  vec3 dp1 = dFdx(p), dp2 = dFdy(p);
  vec2 du1 = dFdx(uv), du2 = dFdy(uv);
  vec3 dp2p = cross(dp2, N), dp1p = cross(N, dp1);
  vec3 T = dp2p * du1.x + dp1p * du2.x;
  vec3 B = dp2p * du1.y + dp1p * du2.y;
  float inv = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
  return mat3(T * inv, B * inv, N);
}

vec2 waveGrad(vec2 p){
  float e = 0.35;
  float c = noise2(p), x = noise2(p + vec2(e, 0.0)), y = noise2(p + vec2(0.0, e));
  return vec2(x - c, y - c) / e;
}

void main(){
  int layer = int(vTex.x + 0.5), kind = int(vTex.y + 0.5);
  vec3 N = normalize(vNrm);
  if (!gl_FrontFacing && kind != 1) N = -N;     // foliage keeps its bent crown normal on both sides
  vec3 Ng = N;
  vec3 V = normalize(uCam - vWorld);
  float dist = length(uCam - vWorld);
  vec3 albedo = vCol * uTint;
  float rough = vMat.x, metal = vMat.y;
  float ao = 1.0, glassMask = 0.0;
  vec3 texRGB = vec3(1.0);
  mat3 TBN = mat3(1.0);
  bool haveTBN = false;

  if (layer > 0) {
    vec4 a = texture(uAlb, vec3(vUV, float(layer)));
${alphaTest ? `
    // coverage-preserving alpha test: lower the bar with distance
    float thr = mix(0.5, 0.28, clamp(dist / 90.0, 0.0, 1.0));
    if (a.a < thr) discard;` : ''}
    vec4 n = texture(uNrmT, vec3(vUV, float(layer)));
    texRGB = a.rgb;
    TBN = cotangent(N, vWorld, vUV); haveTBN = true;
    vec3 tn = vec3(n.xy * 2.0 - 1.0, 1.0);
    tn.xy *= 1.0 - clamp(dist / 160.0, 0.0, 0.6);       // flatten micro-relief with distance
    N = normalize(TBN * tn);
    ao = n.z;
    if (kind == 2) {
      glassMask = a.a;
      albedo = mix(a.rgb * vCol * uTint, vec3(0.012, 0.013, 0.015), glassMask);
      rough = mix(clamp(rough + (n.w - 0.5) * 0.5, 0.05, 1.0), 0.04, glassMask);
    } else {
      albedo *= a.rgb;
      rough = clamp(mix(rough, n.w, 0.55), 0.03, 1.0);
    }
  }

  // ---- lawns: the mower's stripes, which flip with your viewing direction ----
  if (kind == 4 && haveTBN) {
    float s = step(0.5, fract(vUV.x * 3.0 / 2.8)) * 2.0 - 1.0;
    vec3 along = normalize(TBN[1]);
    float look = dot(normalize(vec3(-V.x, 0.0, -V.z)), along);
    albedo *= 1.0 + 0.13 * s * look + 0.03 * s;
  }

  // ---- water: two scrolling ripple fields, fresnel sky, sun glint ----
  if (kind == 3) {
    vec2 wp = vWorld.xz;
    vec2 g = waveGrad(wp * 0.45 + vec2(uTime * 0.07, uTime * 0.03)) * 0.55
           + waveGrad(wp * 1.7 - vec2(uTime * 0.11, -uTime * 0.06)) * 0.28;
    N = normalize(vec3(-g.x * 0.35, 1.0, -g.y * 0.35));
  }

  float NdV = max(dot(N, V), 1e-3);
  float ndl = max(dot(Ng, uSunDir), 0.0);
  float sh = shadowAt(vWorld, Ng, ndl, dist);
  vec3 col;
  float alpha = uAlpha;

  if (kind == 3) {
    float fres = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
    vec3 refl = skyBase(reflect(-V, N));
    vec3 H = normalize(uSunDir + V);
    float glint = pow(max(dot(N, H), 0.0), 600.0) * 60.0 * sh;
    vec3 deep = albedo * (uSkyCol * 0.6 + uSunCol * max(uSunDir.y, 0.0) * 0.05 * sh);
    col = mix(deep, refl, fres) + uSunCol * glint;
  } else {
    col = shade(N, V, uSunDir, albedo, rough, metal, uSunCol) * sh;
    if (kind == 1) {
      // leaves let light through: a little translucency from behind
      float back = pow(max(dot(-V, uSunDir), 0.0), 3.0);
      col += albedo * uSunCol * (0.08 + 0.35 * back) * sh * 0.32;
    }
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      if (i >= uLightCount) break;
      vec3 d = uLightPos[i] - vWorld;
      float dd = length(d);
      float att = max(0.0, 1.0 - dd / uLightRange[i]);
      att *= att;
      if (att <= 0.001) continue;
      col += shade(N, V, d / max(dd, 0.001), albedo, rough, metal, uLightCol[i] * att);
    }
    // ambient: hemisphere diffuse + sky reflection, both occluded
    float hemi = N.y * 0.5 + 0.5;
    vec3 amb = mix(uGroundCol, uSkyCol, hemi);
    vec3 F0 = mix(vec3(0.04), albedo, metal);
    vec3 Fa = F_SchlickR(NdV, F0, rough);
    vec3 R = reflect(-V, N);
    vec3 env = mix(amb, skyBase(R), (1.0 - rough) * (1.0 - rough));
    col += amb * albedo * (1.0 - metal) * (1.0 - Fa * 0.5) * ao;
    col += env * Fa * ao;

    // ---- window glass: sky in the day, lamplight at night ----
    if (kind == 2 && glassMask > 0.01) {
      float fres = 0.04 + 0.96 * pow(1.0 - max(dot(Ng, V), 0.0), 5.0);
      vec3 gcol = skyBase(reflect(-V, Ng)) * mix(0.10, 1.0, fres);
      vec3 H = normalize(uSunDir + V);
      gcol += uSunCol * pow(max(dot(Ng, H), 0.0), 900.0) * 30.0 * sh;
      // a dim room behind the glass, curtains drawn at the sides of a sash
      float curtain = layer == ${TX.SASH} ? smoothstep(0.26, 0.12, vUV.x) + smoothstep(0.74, 0.88, vUV.x) : 0.0;
      gcol += amb * (0.025 + curtain * 0.05);
      // at night a share of rooms are lit, each a little different
      float seed = fract(vGlow * 13.37 + floor(vWorld.y / 3.4) * 0.173);
      float on = step(seed, uLitFrac);
      float warm = 0.7 + 0.6 * fract(seed * 91.7);
      float upper = 0.75 + 0.25 * smoothstep(0.0, 1.0, fract(vUV.y));
      gcol += texRGB * on * warm * upper * 0.75 * (layer == ${TX.GOTHIC} ? 1.3 : 1.0);
      col = mix(col, gcol, glassMask);
    }
  }

  // ---- emissive: glows always; lamps only after dark ----
  if (kind == 5) col += albedo * vGlow * 4.0 * uNight;
  else if (kind != 2) col += albedo * vGlow * 3.2 * uEmissive;

  // ---- transparent panes (glasshouse, shelters) ----
  if (kind == 6) {
    float fres = 0.04 + 0.96 * pow(1.0 - NdV, 5.0);
    col = skyBase(reflect(-V, N)) * (0.25 + 0.75 * fres) + uSunCol * pow(max(dot(N, normalize(uSunDir + V)), 0.0), 500.0) * 20.0 * sh;
    alpha = mix(0.2, 0.8, fres);
    col += vec3(0.02, 0.03, 0.03);
  }

  // ---- holographic figures (effects only) ----
  if (uHolo > 0.5) {
    float fres = pow(1.0 - NdV, 3.0);
    col += albedo * fres * 0.8;
    alpha *= clamp(0.6 + fres, 0.0, 1.0);
  }

  // ---- aerial perspective: thicker low down, warm toward the sun ----
  float hAvg = max((vWorld.y + uCam.y) * 0.5, 0.0);
  float fog = 1.0 - exp(-dist * uFogDensity * exp(-hAvg * 0.01));
  vec3 vd = -V;
  vec3 fcol = skyBase(normalize(vec3(vd.x, 0.015, vd.z)));   // melt into the sky behind
  col = mix(col, fcol, clamp(fog, 0.0, 1.0));

  frag = vec4(col, alpha);
  // people are small and round: tag them (a shorter normal) so the AO pass goes easy on them
  gbuf = vec4(normalize(mat3(uView) * Ng) * (kind >= 16 ? 0.5 : 1.0), -vView.z);
}`;

/* ---------- depth-only, for the shadow map (skinning + wind + alpha test) ---------- */
const VS_DEPTH = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=3) in float aGlow;
layout(location=5) in vec2 aUV;
layout(location=6) in vec2 aTex;
uniform mat4 uLightVP, uModel;
uniform mat4 uBones[14];
uniform mat4 uBonesP[14];
uniform float uTime, uWind;
out vec2 vUV;
flat out vec2 vTex;
void main(){
  vec4 lp = vec4(aPos, 1.0);
  if (aTex.y > 15.5) {
    int bi = int(aTex.y - 16.0 + 0.5);
    mat4 B = uBones[bi];
    if (aGlow > 0.001) B = B * (1.0 - aGlow) + uBonesP[bi] * aGlow;
    lp = B * lp;
  }
  vec4 wp = uModel * lp;
  if (abs(aTex.y - 1.0) < 0.5) {
    float ph = dot(wp.xz, vec2(0.11, 0.07)) + uTime * 1.3;
    float k = clamp((wp.y - 2.0) * 0.06, 0.0, 1.0) * uWind;
    wp.xz += vec2(sin(ph), cos(ph * 0.8)) * 0.10 * k;
  }
  vUV = aUV; vTex = aTex;
  gl_Position = uLightVP * wp;
}`;
const FS_DEPTH = (alphaTest) => `#version 300 es
precision mediump float;
precision mediump sampler2DArray;
in vec2 vUV;
flat in vec2 vTex;
uniform sampler2DArray uAlb;
void main(){
${alphaTest ? `  int layer = int(vTex.x + 0.5);
  if (layer > 0 && texture(uAlb, vec3(vUV, float(layer))).a < 0.5) discard;` : ''}
}`;

/* ---------- sky ---------- */
const VS_FS = `#version 300 es
layout(location=0) in vec3 aPos;
out vec2 vUV;
void main(){ vUV = aPos.xy + 0.5; gl_Position = vec4(aPos.xy * 2.0, 0.0, 1.0); }`;

const FS_SKY = `#version 300 es
precision highp float;
in vec2 vUV;
uniform mat4  uInvVP;
uniform vec3  uCam, uMoonDir, uCloudLit, uCloudShade;
uniform float uTime, uFar, uCloud;
layout(location=0) out vec4 frag;
layout(location=1) out vec4 gbuf;
${GLSL_NOISE}
${GLSL_SKY}
float fbm2(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++){ s += a * noise2(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
void main(){
  vec4 clip = vec4(vUV * 2.0 - 1.0, 1.0, 1.0);
  vec4 wp = uInvVP * clip;
  vec3 dir = normalize(wp.xyz / wp.w - uCam);
  vec3 col = skyBase(dir);
  float up = smoothstep(-0.02, 0.2, dir.y);

  // stars and moon, fading in after dusk
  if (uNight > 0.01) {
    vec3 sp = dir * 190.0; vec3 cell = floor(sp); float r = hash13(cell);
    if (r > 0.972) {
      vec3 jitter = vec3(hash13(cell + 1.7), hash13(cell + 5.3), hash13(cell + 9.1)) - 0.5;
      float d = length(fract(sp) - 0.5 - jitter * 0.6);
      float tw = 0.65 + 0.35 * sin(uTime * 1.6 + r * 60.0);
      col += vec3(0.85, 0.9, 1.0) * smoothstep(0.3, 0.0, d) * tw * (0.4 + (r - 0.972) * 30.0) * up * uNight;
    }
    float md = dot(dir, uMoonDir);
    float disc = smoothstep(0.99955, 0.99975, md);
    float crater = 0.85 + 0.15 * noise2(dir.xy * 900.0);
    col += vec3(0.9, 0.92, 1.0) * disc * crater * 1.8 * uNight;
    col += vec3(0.25, 0.3, 0.45) * pow(max(md, 0.0), 300.0) * 0.4 * uNight;
  }

  // the sun disc
  float sd = dot(dir, uSunDir);
  col += uSunGlow * smoothstep(0.99955, 0.99985, sd) * 40.0 * (1.0 - uNight);

  // a deck of cumulus at 1.8 km, lit from the sun's side
  if (dir.y > 0.005 && uCloud > 0.01) {
    float t = (1800.0 - uCam.y) / dir.y;
    vec2 p = (uCam.xz + dir.xz * t) * 0.00032 + vec2(uTime * 0.0035, uTime * 0.0012);
    float n = fbm2(p);
    float cov = uCloud;
    float dens = smoothstep(1.0 - cov, 1.0 - cov + 0.28, n);
    float n2 = fbm2(p + uSunDir.xz * 0.035);
    float lit = clamp(0.55 + (n - n2) * 4.0, 0.0, 1.0);
    vec3 cc = mix(uCloudShade, uCloudLit, lit);
    cc += uSunGlow * pow(max(sd, 0.0), 10.0) * 0.5 * (1.0 - dens);
    float fade = smoothstep(0.005, 0.16, dir.y);
    float a = dens * fade;
    col = mix(col, cc, a * 0.92);
  }
  col = mix(uFogCol, col, smoothstep(-0.03, 0.10, dir.y));
  frag = vec4(col, 1.0);
  gbuf = vec4(0.0, 0.0, 1.0, uFar);
}`;

/* ---------- billboards ---------- */
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
layout(location=0) out vec4 frag;
void main(){
  vec4 t = texture(uTex, vUV);
  if (t.a < 0.01) discard;
  frag = vec4(t.rgb * uTintA.rgb * (1.0 + uGlow), t.a * uTintA.a);
}`;

/* ---------- particles: soft discs or velocity-aligned streaks ---------- */
const VS_PART = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aAxis;
layout(location=2) in vec2 aCorner;
layout(location=3) in vec4 aCol;
layout(location=4) in vec2 aSize;
uniform mat4 uVP;
uniform vec3 uRight, uUp, uCam;
out vec2 vUV; out vec4 vCol; out float vStreak;
void main(){
  vUV = aCorner * 2.0; vCol = aCol;
  vec3 wp;
  float al = length(aAxis);
  if (al > 0.001) {
    vec3 ax = aAxis / al;
    vec3 side = normalize(cross(ax, normalize(uCam - aPos)));
    wp = aPos + ax * aCorner.y * aSize.y + side * aCorner.x * aSize.x;
    vStreak = 1.0;
  } else {
    wp = aPos + uRight * aCorner.x * aSize.x + uUp * aCorner.y * aSize.y;
    vStreak = 0.0;
  }
  gl_Position = uVP * vec4(wp, 1.0);
}`;
const FS_PART = `#version 300 es
precision highp float;
in vec2 vUV; in vec4 vCol; in float vStreak;
layout(location=0) out vec4 frag;
void main(){
  float a;
  if (vStreak > 0.5) a = (1.0 - abs(vUV.x)) * (1.0 - abs(vUV.x)) * smoothstep(1.0, 0.6, abs(vUV.y));
  else { float d = length(vUV); a = smoothstep(1.0, 0.25, d); a *= a; }
  frag = vec4(vCol.rgb * a * vCol.a, a * vCol.a);
}`;

/* ---------- SSAO ---------- */
const FS_SSAO = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uG, uNoise;
uniform vec2 uRes, uTanHalf;
uniform mat4 uProj;
uniform vec3 uKernel[${AO_SAMPLES}];
uniform float uRadius, uFar;
out vec4 frag;
vec3 viewPos(vec2 uv, float d){ vec2 ndc = uv * 2.0 - 1.0; return vec3(ndc * uTanHalf * d, -d); }
void main(){
  vec4 g = texture(uG, vUV);
  float depth = g.w;
  if (depth <= 0.0 || depth > uFar * 0.95) { frag = vec4(1.0); return; }
  vec3 P = viewPos(vUV, depth);
  float person = length(g.xyz) < 0.75 ? 1.0 : 0.0;
  vec3 N = normalize(g.xyz);
  vec3 rnd = texture(uNoise, vUV * uRes / 4.0).xyz * 2.0 - 1.0;
  vec3 T = normalize(rnd - N * dot(rnd, N));
  vec3 B = cross(N, T);
  mat3 TBN = mat3(T, B, N);
  float rad = uRadius * (1.0 + depth * 0.012);
  float occ = 0.0;
  for (int i = 0; i < ${AO_SAMPLES}; i++) {
    vec3 s = P + TBN * uKernel[i] * rad;
    vec4 o = uProj * vec4(s, 1.0);
    vec2 suv = o.xy / o.w * 0.5 + 0.5;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
    float sd = texture(uG, suv).w;
    if (sd <= 0.0) continue;
    float range = smoothstep(0.0, 1.0, rad / abs(depth - sd));
    occ += (sd < -s.z - 0.04 ? 1.0 : 0.0) * range;
  }
  float ao = 1.0 - occ / float(${AO_SAMPLES});
  ao = mix(ao, 1.0, person * 0.75);
  frag = vec4(vec3(pow(ao, 1.6)), 1.0);
}`;

const FS_AOBLUR = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uTexel;
out vec4 frag;
void main(){
  float s = 0.0;
  for (int i = -2; i < 2; i++) for (int j = -2; j < 2; j++) s += texture(uTex, vUV + vec2(float(i), float(j)) * uTexel).r;
  frag = vec4(vec3(s / 16.0), 1.0);
}`;

/* ---------- bloom + rays + composite ---------- */
const FS_BRIGHT = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform float uThreshold, uExposure;
out vec4 frag;
void main(){
  vec3 c = texture(uTex, vUV).rgb * uExposure;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = max(0.0, l - uThreshold) / max(l, 0.0001);
  frag = vec4(min(c * k, vec3(40.0)), 1.0);
}`;

const FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uDir;
out vec4 frag;
void main(){
  float w[5] = float[5](0.227027, 0.194595, 0.121622, 0.054054, 0.016216);
  vec3 s = texture(uTex, vUV).rgb * w[0];
  for (int i = 1; i < 5; i++) {
    vec2 o = uDir * float(i);
    s += texture(uTex, vUV + o).rgb * w[i];
    s += texture(uTex, vUV - o).rgb * w[i];
  }
  frag = vec4(s, 1.0);
}`;

const FS_RAYS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uSun;
uniform float uOn;
out vec4 frag;
void main(){
  if (uOn < 0.5) { frag = vec4(0.0); return; }
  vec2 d = (uSun - vUV) / 32.0;
  vec2 uv = vUV; vec3 s = vec3(0.0); float w = 1.0;
  for (int i = 0; i < 32; i++) { uv += d; s += texture(uTex, uv).rgb * w; w *= 0.94; }
  frag = vec4(s / 32.0, 1.0);
}`;

const FS_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene, uBloom, uAO, uRays;
uniform vec2  uRes;
uniform float uTime, uBloomAmt, uPulse, uPulseHue, uFade, uAberration, uDim, uNoise, uAOAmt, uRaysAmt, uExposure, uGrade;
out vec4 frag;

vec3 aces(vec3 x){
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

void main(){
  vec2 uv = vUV;
  if (uNoise > 0.001) {
    float band = floor(uv.y * 42.0);
    float jitter = hash12(vec2(band, floor(uTime * 9.0)));
    float torn = step(1.0 - uNoise * 0.30, jitter);
    uv.x += (jitter - 0.5) * 0.020 * uNoise * torn;
  }
  vec2 fromC = uv - 0.5;
  float r2 = dot(fromC, fromC);

  float ab = uAberration * (0.0006 + r2 * 0.004);
  vec3 col;
  col.r = texture(uScene, uv + fromC * ab).r;
  col.g = texture(uScene, uv).g;
  col.b = texture(uScene, uv - fromC * ab).b;

  float ao = texture(uAO, uv).r;
  col *= mix(1.0, ao, uAOAmt);
  col *= uExposure;
  col += texture(uBloom, uv).rgb * uBloomAmt;
  col += texture(uRays, uv).rgb * uRaysAmt;

  if (uPulse > 0.001) {
    float ring = abs(length(fromC * vec2(uRes.x / uRes.y, 1.0)) - (1.0 - uPulse) * 0.85);
    float band = smoothstep(0.16, 0.0, ring) * uPulse;
    vec3 hue = mix(vec3(0.35, 0.85, 1.0), vec3(1.0, 0.82, 0.35), uPulseHue);
    col += hue * band * 0.5;
    col += hue * uPulse * uPulse * 0.10;
  }
  if (uNoise > 0.001) {
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(col, vec3(lum) * vec3(1.10, 0.68, 0.98), uNoise * 0.34);
    col *= 1.0 - uNoise * 0.16;
    col += vec3(0.018, 0.0, 0.014) * uNoise;
  }

  // filmic grade: a touch of warmth in the highlights, cool in the shadows
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col *= mix(vec3(0.96, 0.99, 1.05), vec3(1.04, 1.01, 0.96), smoothstep(0.05, 1.5, lum) * uGrade);
  col = aces(col);
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.18);
  col += (hash12(uv * uRes + fract(uTime) * 311.0) - 0.5) * (0.006 + uNoise * 0.03);
  float vig = smoothstep(1.25, 0.3, length(fromC * vec2(1.0, 1.2)));
  col *= mix(0.55, 1.0, vig);
  col *= uDim;
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  frag = vec4(col * uFade, 1.0);
}`;

/* FXAA on the final LDR image — the scene target has no MSAA */
const FS_FXAA = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uRcp;
out vec4 frag;
void main(){
  vec3 L = vec3(0.299, 0.587, 0.114);
  vec3 nw = texture(uTex, vUV + vec2(-1.0, -1.0) * uRcp).rgb;
  vec3 ne = texture(uTex, vUV + vec2( 1.0, -1.0) * uRcp).rgb;
  vec3 sw = texture(uTex, vUV + vec2(-1.0,  1.0) * uRcp).rgb;
  vec3 se = texture(uTex, vUV + vec2( 1.0,  1.0) * uRcp).rgb;
  vec3 m  = texture(uTex, vUV).rgb;
  float lNW = dot(nw, L), lNE = dot(ne, L), lSW = dot(sw, L), lSE = dot(se, L), lM = dot(m, L);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
  float rmin = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
  dir = clamp(dir * rmin, vec2(-8.0), vec2(8.0)) * uRcp;
  vec3 a = 0.5 * (texture(uTex, vUV + dir * (1.0 / 3.0 - 0.5)).rgb + texture(uTex, vUV + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture(uTex, vUV + dir * -0.5).rgb + texture(uTex, vUV + dir * 0.5).rgb);
  float lB = dot(b, L);
  frag = vec4((lB < lMin || lB > lMax) ? a : b, 1.0);
}`;

/* ============================================================ */

class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: true,
      powerPreference: 'high-performance', preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.canvas = canvas;

    this.floatOK = !!gl.getExtension('EXT_color_buffer_half_float') || !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');

    this.pScene  = makeProgram(gl, VS_SCENE, FS_SCENE(false), 'scene');
    this.pLeaf   = makeProgram(gl, VS_SCENE, FS_SCENE(true), 'scene-leaf');
    this.pDepth  = makeProgram(gl, VS_DEPTH, FS_DEPTH(false), 'depth');
    this.pDepthA = makeProgram(gl, VS_DEPTH, FS_DEPTH(true), 'depth-leaf');
    this.pSky    = makeProgram(gl, VS_FS, FS_SKY, 'sky');
    this.pBill   = makeProgram(gl, VS_BILLBOARD, FS_BILLBOARD, 'billboard');
    this.pPart   = makeProgram(gl, VS_PART, FS_PART, 'particles');
    this.pSSAO   = makeProgram(gl, VS_FS, FS_SSAO, 'ssao');
    this.pAOBlur = makeProgram(gl, VS_FS, FS_AOBLUR, 'aoblur');
    this.pBright = makeProgram(gl, VS_FS, FS_BRIGHT, 'bright');
    this.pBlur   = makeProgram(gl, VS_FS, FS_BLUR, 'blur');
    this.pRays   = makeProgram(gl, VS_FS, FS_RAYS, 'rays');
    this.pComp   = makeProgram(gl, VS_FS, FS_COMPOSITE, 'composite');
    this.pFXAA   = makeProgram(gl, VS_FS, FS_FXAA, 'fxaa');

    const b = new Builder();
    b.add(QUAD, xform(), [1, 1, 1], 0);
    this.quad = b.upload(gl);

    this.mats = buildMaterials(gl, this.quad, VS_FS);

    this.vp = M4.create(); this.proj = M4.create(); this.viewM = M4.create();
    this.invVP = M4.create(); this.nrmM = new Float32Array(9);
    this.lightView = M4.create(); this.lightProj = M4.create();
    this.lightVP = [M4.create(), M4.create()];
    this.planes = new Float32Array(24);
    this.bones0 = new Float32Array(28 * 16);
    for (let i = 0; i < 28; i++) this.bones0.set(M4.create(), i * 16);

    // one atlas, two cascades side by side
    this.shadow = makeFBO(gl, SHADOW_RES * 2, SHADOW_RES, { shadow: true });
    this.shadowPass = false;

    // SSAO kernel + 4x4 rotation noise
    const rnd = mulberry(1337);
    this.kernel = new Float32Array(AO_SAMPLES * 3);
    for (let i = 0; i < AO_SAMPLES; i++) {
      let x = rnd() * 2 - 1, y = rnd() * 2 - 1, z = rnd();
      const L = Math.hypot(x, y, z) || 1; x /= L; y /= L; z /= L;
      let s = i / AO_SAMPLES; s = 0.1 + 0.9 * s * s;
      this.kernel[i * 3] = x * s; this.kernel[i * 3 + 1] = y * s; this.kernel[i * 3 + 2] = z * s;
    }
    const nz = new Uint8Array(16 * 4);
    for (let i = 0; i < 16; i++) {
      nz[i * 4] = (rnd() * 255) | 0; nz[i * 4 + 1] = (rnd() * 255) | 0; nz[i * 4 + 2] = 128; nz[i * 4 + 3] = 255;
    }
    this.noiseTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, nz);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    // particle stream: 4 verts × 14 floats per particle
    this.partMax = 2600;
    this.partData = new Float32Array(this.partMax * 4 * 14);
    this.partVAO = gl.createVertexArray();
    gl.bindVertexArray(this.partVAO);
    this.partVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.partVBO);
    gl.bufferData(gl.ARRAY_BUFFER, this.partData.byteLength, gl.DYNAMIC_DRAW);
    const ps = 14 * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, ps, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, ps, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, ps, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, ps, 32);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 2, gl.FLOAT, false, ps, 48);
    const pidx = new Uint32Array(this.partMax * 6);
    for (let i = 0; i < this.partMax; i++) {
      const v = i * 4, o = i * 6;
      pidx[o] = v; pidx[o + 1] = v + 1; pidx[o + 2] = v + 2; pidx[o + 3] = v; pidx[o + 4] = v + 2; pidx[o + 5] = v + 3;
    }
    const pebo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, pebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, pidx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    this.lights = [];
    this.near = 0.25;
    this.stats = { draws: 0, culled: 0 };
    this.resize();
  }

  setQuality(scale) {
    const s = clamp(scale, 0.55, 1.0);
    if (Math.abs(s - (this.qScale || 1)) < 0.04) return;
    this.qScale = s;
    this.sceneFBO = null;
    this.resize();
  }

  resize() {
    const gl = this.gl, c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6) * (this.qScale || 1);
    const w = Math.max(2, Math.floor(c.clientWidth * dpr));
    const h = Math.max(2, Math.floor(c.clientHeight * dpr));
    if (c.width === w && c.height === h && this.sceneFBO) return;
    c.width = w; c.height = h;
    this.W = w; this.H = h;

    const del = (f) => {
      if (!f) return;
      gl.deleteFramebuffer(f.fbo);
      if (f.tex) gl.deleteTexture(f.tex);
      if (f.tex2) gl.deleteTexture(f.tex2);
      if (f.depthTex) gl.deleteTexture(f.depthTex);
      if (f.depth) gl.deleteRenderbuffer(f.depth);
    };
    del(this.sceneFBO); del(this.aoA); del(this.aoB); del(this.bright); del(this.blurA); del(this.blurB); del(this.rays); del(this.ldr);

    this.sceneFBO = makeFBO(gl, w, h, { depthTex: true, float: this.floatOK, mrt: true });
    const hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1);
    this.aoA = makeFBO(gl, hw, hh, {});
    this.aoB = makeFBO(gl, hw, hh, {});
    const bw = Math.max(2, w >> 2), bh = Math.max(2, h >> 2);
    this.bright = makeFBO(gl, bw, bh, { float: this.floatOK });
    this.blurA  = makeFBO(gl, bw, bh, { float: this.floatOK });
    this.blurB  = makeFBO(gl, bw, bh, { float: this.floatOK });
    this.rays   = makeFBO(gl, bw, bh, { float: this.floatOK });
    this.ldr    = makeFBO(gl, w, h, {});
  }

  /* ---------- lights ---------- */
  setLights(all, cx, cy, cz, night) {
    const list = [];
    for (const l of all) {
      const k = l.night ? night : 1;
      if (k < 0.02) continue;
      const d = Math.hypot(l.pos[0] - cx, l.pos[1] - cy, l.pos[2] - cz);
      if (d > l.range + 90) continue;
      list.push({ l, k, s: (l.range + 20) / (d + 1) });
    }
    list.sort((a, b) => b.s - a.s);
    this.active = list.slice(0, MAX_LIGHTS).map((x) => (x.k === 1 ? x.l : Object.assign({}, x.l, { intensity: (x.l.intensity == null ? 1 : x.l.intensity) * x.k })));
  }

  uploadLights(p) {
    const gl = this.gl, ls = this.active || [];
    const pos = this._lp || (this._lp = new Float32Array(MAX_LIGHTS * 3));
    const col = this._lc || (this._lc = new Float32Array(MAX_LIGHTS * 3));
    const rng = this._lr || (this._lr = new Float32Array(MAX_LIGHTS));
    for (let i = 0; i < ls.length; i++) {
      pos[i * 3] = ls[i].pos[0]; pos[i * 3 + 1] = ls[i].pos[1]; pos[i * 3 + 2] = ls[i].pos[2];
      const inten = (ls[i].intensity == null ? 1 : ls[i].intensity) * 4.0;
      col[i * 3] = ls[i].col[0] * inten; col[i * 3 + 1] = ls[i].col[1] * inten; col[i * 3 + 2] = ls[i].col[2] * inten;
      rng[i] = ls[i].range;
    }
    gl.uniform1i(p.u.uLightCount, ls.length);
    gl.uniform3fv(p.u.uLightPos, pos);
    gl.uniform3fv(p.u.uLightCol, col);
    gl.uniform1fv(p.u.uLightRange, rng);
  }

  overrideLights(list) {
    this.active = list;
    for (const p of [this.pScene, this.pLeaf]) { this.gl.useProgram(p); this.uploadLights(p); }
    this.gl.useProgram(this.pScene);
  }

  /* ---------- culling ---------- */
  setPlanes(m) {
    const P = this.planes;
    const rows = (i) => [m[i], m[4 + i], m[8 + i], m[12 + i]];
    const r0 = rows(0), r1 = rows(1), r2 = rows(2), r3 = rows(3);
    const set = (k, a, s) => {
      let x = r3[0] + s * a[0], y = r3[1] + s * a[1], z = r3[2] + s * a[2], w = r3[3] + s * a[3];
      const L = Math.hypot(x, y, z) || 1;
      P[k * 4] = x / L; P[k * 4 + 1] = y / L; P[k * 4 + 2] = z / L; P[k * 4 + 3] = w / L;
    };
    set(0, r0, 1); set(1, r0, -1); set(2, r1, 1); set(3, r1, -1); set(4, r2, 1); set(5, r2, -1);
  }

  visible(mn, mx) {
    const P = this.planes;
    for (let k = 0; k < 6; k++) {
      const a = P[k * 4], b = P[k * 4 + 1], c = P[k * 4 + 2], d = P[k * 4 + 3];
      const x = a > 0 ? mx[0] : mn[0], y = b > 0 ? mx[1] : mn[1], z = c > 0 ? mx[2] : mn[2];
      if (a * x + b * y + c * z + d < 0) return false;
    }
    return true;
  }

  /* ---------- shadow pass: call draw(cascade) for each cascade ---------- */
  renderShadows(cam, env, draw) {
    const gl = this.gl;
    const sd = env.sunDir;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadow.fbo);
    gl.viewport(0, 0, SHADOW_RES * 2, SHADOW_RES);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    if (env.shadows === false) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); return; }
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    this.shadowPass = true;
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    for (let k = 0; k < 2; k++) {
      const C = CASCADE[k];
      const cx = cam.x + fx * C.ahead, cy = cam.y, cz = cam.z + fz * C.ahead;
      const texel = (C.half * 2) / SHADOW_RES;
      const upv = Math.abs(sd[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
      const back = 600;
      M4.lookAt(this.lightView, cx + sd[0] * back, cy + sd[1] * back, cz + sd[2] * back, cx, cy, cz, upv[0], upv[1], upv[2]);
      const lv = this.lightView;
      const lx = lv[0] * cx + lv[4] * cy + lv[8] * cz + lv[12];
      const ly = lv[1] * cx + lv[5] * cy + lv[9] * cz + lv[13];
      lv[12] += Math.round(lx / texel) * texel - lx;
      lv[13] += Math.round(ly / texel) * texel - ly;
      M4.ortho(this.lightProj, -C.half, C.half, -C.half, C.half, 1, back * 2);
      M4.mul(this.lightVP[k], this.lightProj, lv);
      this.setPlanes(this.lightVP[k]);
      gl.viewport(k * SHADOW_RES, 0, SHADOW_RES, SHADOW_RES);
      this.curLightVP = this.lightVP[k];
      for (const p of [this.pDepth, this.pDepthA]) {
        gl.useProgram(p);
        gl.uniformMatrix4fv(p.u.uLightVP, false, this.lightVP[k]);
        gl.uniform1f(p.u.uTime, this.time || 0);
        gl.uniform1f(p.u.uWind, env.wind == null ? 1 : env.wind);
        this.setBones(p, this.bones0);
      }
      gl.activeTexture(gl.TEXTURE8);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.mats.alb);
      gl.useProgram(this.pDepthA); gl.uniform1i(this.pDepthA.u.uAlb, 8);
      gl.useProgram(this.pDepth);
      this.cascadeIndex = k;
      draw(k);
    }
    this.shadowPass = false;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /* ---------- scene pass ---------- */
  beginScene(cam, env, time) {
    const gl = this.gl;
    this.far = 1400;
    M4.perspective(this.proj, cam.fov, this.W / this.H, cam.near || this.near, this.far);
    M4.view(this.viewM, cam.x, cam.y, cam.z, cam.yaw, cam.pitch, cam.roll || 0);
    M4.mul(this.vp, this.proj, this.viewM);
    this.setPlanes(this.vp);
    this.cam = cam; this.env = env; this.time = time;
    this.tanHalfY = Math.tan(cam.fov / 2);
    this.tanHalfX = this.tanHalfY * (this.W / this.H);
    this.stats.draws = 0; this.stats.culled = 0;

    // sun's screen position for the god rays
    const sx = cam.x + env.sunDir[0] * 1000, sy = cam.y + env.sunDir[1] * 1000, sz = cam.z + env.sunDir[2] * 1000;
    const v = this.vp;
    const cw = v[3] * sx + v[7] * sy + v[11] * sz + v[15];
    if (cw > 0 && env.sunDir[1] > -0.02 && !(env.night > 0.5)) {
      const cx = (v[0] * sx + v[4] * sy + v[8] * sz + v[12]) / cw;
      const cy = (v[1] * sx + v[5] * sy + v[9] * sz + v[13]) / cw;
      this.sunUV = [cx * 0.5 + 0.5, cy * 0.5 + 0.5];
      this.sunOn = (Math.abs(cx) < 1.5 && Math.abs(cy) < 1.5) ? 1 : 0;
    } else this.sunOn = 0;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO.fbo);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.viewport(0, 0, this.W, this.H);
    gl.clearColor(env.fog[0], env.fog[1], env.fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    invertMat4(this.invVP, this.vp);
    const s = this.pSky;
    gl.useProgram(s);
    gl.uniformMatrix4fv(s.u.uInvVP, false, this.invVP);
    gl.uniform3f(s.u.uCam, cam.x, cam.y, cam.z);
    this.skyUniforms(s, env);
    gl.uniform3fv(s.u.uMoonDir, env.moonDir || [0, 1, 0]);
    gl.uniform3fv(s.u.uCloudLit, env.cloudLit || [1, 1, 1]);
    gl.uniform3fv(s.u.uCloudShade, env.cloudShade || [0.6, 0.65, 0.7]);
    gl.uniform1f(s.u.uCloud, env.cloud == null ? 0.45 : env.cloud);
    gl.uniform1f(s.u.uTime, time);
    gl.uniform1f(s.u.uFar, this.far);
    gl.bindVertexArray(this.quad.vao);
    gl.drawElements(gl.TRIANGLES, this.quad.count, gl.UNSIGNED_SHORT, 0);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, this.shadow.depthTex);
    gl.activeTexture(gl.TEXTURE8);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.mats.alb);
    gl.activeTexture(gl.TEXTURE9);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.mats.nrm);
    for (const p of [this.pLeaf, this.pScene]) {
      gl.useProgram(p);
      gl.uniformMatrix4fv(p.u.uVP, false, this.vp);
      gl.uniformMatrix4fv(p.u.uView, false, this.viewM);
      gl.uniformMatrix4fv(p.u.uLightVP0, false, this.lightVP[0]);
      gl.uniformMatrix4fv(p.u.uLightVP1, false, this.lightVP[1]);
      gl.uniform4f(p.u.uShadowParams, (CASCADE[0].half * 2) / SHADOW_RES, (CASCADE[1].half * 2) / SHADOW_RES,
        CASCADE[0].half * 0.95, CASCADE[1].half * 1.1);
      gl.uniform3f(p.u.uCam, cam.x, cam.y, cam.z);
      this.skyUniforms(p, env);
      gl.uniform3fv(p.u.uSunCol, env.sunCol);
      gl.uniform3fv(p.u.uSkyCol, env.ambSky);
      gl.uniform3fv(p.u.uGroundCol, env.ambGround);
      gl.uniform1f(p.u.uFogDensity, env.fogDensity);
      gl.uniform1f(p.u.uTime, time);
      gl.uniform1f(p.u.uWind, env.wind == null ? 1 : env.wind);
      gl.uniform1f(p.u.uLitFrac, env.litFrac || 0);
      gl.uniform1f(p.u.uHolo, 0);
      gl.uniform1f(p.u.uAlpha, 1);
      gl.uniform1f(p.u.uEmissive, 1);
      gl.uniform1f(p.u.uShadowOn, env.shadows === false ? 0 : 1);
      gl.uniform3f(p.u.uTint, 1, 1, 1);
      gl.uniform1i(p.u.uShadow, 7);
      gl.uniform1i(p.u.uAlb, 8);
      gl.uniform1i(p.u.uNrmT, 9);
      this.setBones(p, this.bones0);
      this.uploadLights(p);
    }
    this.prog = this.pScene;
  }

  skyUniforms(p, env) {
    const gl = this.gl;
    gl.uniform3fv(p.u.uSunDir, env.sunDir);
    gl.uniform3fv(p.u.uSunGlow, env.sunGlow || env.sunDisc || env.sunCol);
    gl.uniform3fv(p.u.uZenith, env.skyTop);
    gl.uniform3fv(p.u.uHorizon, env.skyHorizon);
    gl.uniform3fv(p.u.uHorizonWarm, env.skyWarm || env.skyHorizon);
    gl.uniform3fv(p.u.uFogCol, env.fog);
    gl.uniform1f(p.u.uNight, env.night || 0);
  }

  gbufWrite(on) {
    const gl = this.gl;
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, on ? gl.COLOR_ATTACHMENT1 : gl.NONE]);
  }

  /* switch between the opaque and the alpha-tested (foliage) program */
  useLeaf(on) {
    const want = on ? (this.shadowPass ? this.pDepthA : this.pLeaf) : (this.shadowPass ? this.pDepth : this.pScene);
    if (this.gl.getParameter(this.gl.CURRENT_PROGRAM) !== want) this.gl.useProgram(want);
    this.prog = want;
    this.leafMode = !!on;
  }

  /* a pose is 14 bone matrices, then (optionally) 14 parent-continuation matrices */
  setBones(p, B) {
    const gl = this.gl;
    if (p.u.uBones) gl.uniformMatrix4fv(p.u.uBones, false, B, 0, 224);
    if (p.u.uBonesP) gl.uniformMatrix4fv(p.u.uBonesP, false, B, B.length >= 448 ? 224 : 0, 224);
  }

  drawMesh(mesh, model, opts = {}) {
    const gl = this.gl;
    const m = model || IDENT;
    this.stats.draws++;
    if (this.shadowPass) {
      if (opts.noShadow || (opts.alpha != null && opts.alpha < 0.9)) return;
      const p = this.leafMode ? this.pDepthA : this.pDepth;
      gl.uniformMatrix4fv(p.u.uModel, false, m);
      if (opts.bones) this.setBones(p, opts.bones);
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.count, mesh.u32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
      return;
    }
    const p = this.leafMode ? this.pLeaf : this.pScene;
    gl.uniformMatrix4fv(p.u.uModel, false, m);
    M4.normalMat(this.nrmM, m);
    gl.uniformMatrix3fv(p.u.uNormalMat, false, this.nrmM);
    gl.uniform1f(p.u.uHolo, opts.holo ? 1 : 0);
    gl.uniform1f(p.u.uAlpha, opts.alpha == null ? 1 : opts.alpha);
    gl.uniform1f(p.u.uEmissive, opts.emissive == null ? 1 : opts.emissive);
    if (opts.bones) this.setBones(p, opts.bones);
    const t = opts.tint || WHITE3;
    gl.uniform3f(p.u.uTint, t[0], t[1], t[2]);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.u32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
  }

  /* static world chunks: frustum-culled against whichever pass is open,
     sorted front to back in the colour pass so early-z does its job */
  drawChunks(list, opts = {}) {
    if (!list || !list.length) return;
    const vis = this._vis || (this._vis = []);
    vis.length = 0;
    const c = this.cam;
    for (const ch of list) {
      if (!this.visible(ch.min, ch.max)) { this.stats.culled++; continue; }
      if (!this.shadowPass && c) {
        const x = (ch.min[0] + ch.max[0]) / 2 - c.x, z = (ch.min[2] + ch.max[2]) / 2 - c.z;
        ch._d = x * x + z * z;
      }
      vis.push(ch);
    }
    if (!this.shadowPass) vis.sort((a, b) => a._d - b._d);
    for (const ch of vis) this.drawMesh(ch, IDENT, opts);
  }

  useSceneProgram() { this.gl.useProgram(this.pScene); this.prog = this.pScene; this.leafMode = false; }

  drawBillboard(tex, center, w, h, tint, glow, faceCam) {
    if (this.shadowPass) return;
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

  /* particles: an array of {x,y,z, ax,ay,az, r,g,b,a, sx,sy} */
  drawParticles(list, basis) {
    if (this.shadowPass || !list.length) return;
    const gl = this.gl, D = this.partData;
    const n = Math.min(list.length, this.partMax);
    const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    let o = 0;
    for (let i = 0; i < n; i++) {
      const q = list[i];
      for (let k = 0; k < 4; k++) {
        D[o++] = q.x; D[o++] = q.y; D[o++] = q.z;
        D[o++] = q.ax || 0; D[o++] = q.ay || 0; D[o++] = q.az || 0;
        D[o++] = corners[k][0]; D[o++] = corners[k][1];
        D[o++] = q.r; D[o++] = q.g; D[o++] = q.b; D[o++] = q.a;
        D[o++] = q.sx; D[o++] = q.sy;
      }
    }
    const p = this.pPart;
    gl.useProgram(p);
    gl.uniformMatrix4fv(p.u.uVP, false, this.vp);
    gl.uniform3fv(p.u.uRight, basis.right);
    gl.uniform3fv(p.u.uUp, basis.up);
    gl.uniform3f(p.u.uCam, this.cam.x, this.cam.y, this.cam.z);
    gl.bindVertexArray(this.partVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.partVBO);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, D, 0, o);
    gl.drawElements(gl.TRIANGLES, n * 6, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }

  fsPass(prog, target, setup) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    if (target && target.tex2) gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
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
    const exposure = state.exposure == null ? 1.0 : state.exposure;

    // ---- SSAO ----
    const aoOn = this.floatOK && (state.ao == null || state.ao > 0);
    if (aoOn) {
      this.fsPass(this.pSSAO, this.aoA, (p) => {
        bind(this.sceneFBO.tex2, 0, p.u.uG);
        bind(this.noiseTex, 1, p.u.uNoise);
        gl.uniform2f(p.u.uRes, this.aoA.w, this.aoA.h);
        gl.uniform2f(p.u.uTanHalf, this.tanHalfX, this.tanHalfY);
        gl.uniformMatrix4fv(p.u.uProj, false, this.proj);
        gl.uniform3fv(p.u.uKernel, this.kernel);
        gl.uniform1f(p.u.uRadius, state.aoRadius || 0.9);
        gl.uniform1f(p.u.uFar, this.far);
      });
      this.fsPass(this.pAOBlur, this.aoB, (p) => {
        bind(this.aoA.tex, 0, p.u.uTex);
        gl.uniform2f(p.u.uTexel, 1 / this.aoA.w, 1 / this.aoA.h);
      });
    }

    // ---- bloom ----
    this.fsPass(this.pBright, this.bright, (p) => {
      bind(this.sceneFBO.tex, 0, p.u.uTex);
      gl.uniform1f(p.u.uThreshold, state.bloomThreshold || 1.0);
      gl.uniform1f(p.u.uExposure, exposure);
    });
    const bw = this.bright.w, bh = this.bright.h;
    this.fsPass(this.pRays, this.rays, (p) => {
      bind(this.bright.tex, 0, p.u.uTex);
      gl.uniform2f(p.u.uSun, this.sunUV ? this.sunUV[0] : 0.5, this.sunUV ? this.sunUV[1] : 0.5);
      gl.uniform1f(p.u.uOn, this.sunOn ? 1 : 0);
    });
    this.fsPass(this.pBlur, this.blurA, (p) => { bind(this.bright.tex, 0, p.u.uTex); gl.uniform2f(p.u.uDir, 0.70 / bw, 0); });
    this.fsPass(this.pBlur, this.blurB, (p) => { bind(this.blurA.tex, 0, p.u.uTex); gl.uniform2f(p.u.uDir, 0, 0.70 / bh); });
    this.fsPass(this.pBlur, this.blurA, (p) => { bind(this.blurB.tex, 0, p.u.uTex); gl.uniform2f(p.u.uDir, 1.6 / bw, 0); });
    this.fsPass(this.pBlur, this.blurB, (p) => { bind(this.blurA.tex, 0, p.u.uTex); gl.uniform2f(p.u.uDir, 0, 1.6 / bh); });

    // ---- composite into LDR, then FXAA to the screen ----
    this.fsPass(this.pComp, this.ldr, (p) => {
      bind(this.sceneFBO.tex, 0, p.u.uScene);
      bind(this.blurB.tex, 1, p.u.uBloom);
      bind(aoOn ? this.aoB.tex : this.noiseTex, 2, p.u.uAO);
      bind(this.rays.tex, 3, p.u.uRays);
      gl.uniform2f(p.u.uRes, this.W, this.H);
      gl.uniform1f(p.u.uTime, this.time);
      gl.uniform1f(p.u.uBloomAmt, state.bloom);
      gl.uniform1f(p.u.uPulse, state.pulse);
      gl.uniform1f(p.u.uPulseHue, state.pulseHue || 0);
      gl.uniform1f(p.u.uFade, state.fade);
      gl.uniform1f(p.u.uAberration, state.aberration);
      gl.uniform1f(p.u.uDim, state.dim == null ? 1 : state.dim);
      gl.uniform1f(p.u.uNoise, state.noise || 0);
      gl.uniform1f(p.u.uAOAmt, aoOn ? (state.ao == null ? 0.85 : state.ao) : 0);
      gl.uniform1f(p.u.uRaysAmt, state.rays == null ? 0.3 : state.rays);
      gl.uniform1f(p.u.uExposure, exposure);
      gl.uniform1f(p.u.uGrade, state.grade == null ? 1 : state.grade);
    });
    this.fsPass(this.pFXAA, null, (p) => {
      bind(this.ldr.tex, 0, p.u.uTex);
      gl.uniform2f(p.u.uRcp, 1 / this.W, 1 / this.H);
    });
  }
}

const IDENT = M4.create();
const WHITE3 = [1, 1, 1];

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
