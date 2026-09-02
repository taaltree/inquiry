/* ============================================================
   render.js — the v2 pipeline

     shadow pass   directional depth map, 2048², fitted to the camera
     scene pass    MRT: HDR colour + g-buffer (view normal, linear depth)
                   PBR (GGX / Schlick / Smith), sun with PCF shadows,
                   point lights, hemisphere ambient, procedural surface detail
     ssao          16-sample hemisphere, half res, 4×4 rotated, blurred
     bloom         threshold → two separable blurs at quarter res
     god rays      radial blur from the sun's screen position
     composite     AO, rays, ACES, split-tone grade, vignette, CA, grain,
                   plus the game's own effects (pulse, pollution, fade)

   Everything is drawn through drawMesh(); when a shadow pass is open the
   same call renders depth only, so callers never have to know.
   ============================================================ */

const MAX_LIGHTS = 16;
const SHADOW_RES = 2048;
const SHADOW_HALF = 62;        // metres either side of the focus point
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
uniform mat4 uVP, uModel, uView;
uniform mat3 uNormalMat;
out vec3 vWorld, vNrm, vCol, vView;
out float vGlow;
out vec2 vMat;
void main(){
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorld = wp.xyz;
  vNrm   = normalize(uNormalMat * aNrm);
  vCol   = aCol; vGlow = aGlow; vMat = aMat;
  vView  = (uView * wp).xyz;
  gl_Position = uVP * wp;
}`;

const FS_SCENE = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vWorld, vNrm, vCol, vView;
in float vGlow;
in vec2 vMat;

uniform vec3  uCam, uSunDir, uSunCol, uSkyCol, uGroundCol, uFogCol, uTint;
uniform float uFogDensity, uTime, uHolo, uAlpha, uEmissive, uShadowOn, uDetail, uGrid, uShadowTexel;
uniform mat4  uView, uLightVP;
uniform sampler2DShadow uShadow;
uniform int   uLightCount;
uniform vec3  uLightPos[${MAX_LIGHTS}];
uniform vec3  uLightCol[${MAX_LIGHTS}];
uniform float uLightRange[${MAX_LIGHTS}];

layout(location=0) out vec4 frag;
layout(location=1) out vec4 gbuf;

${GLSL_NOISE}

float shadowAt(vec3 wp, vec3 N, float ndl) {
  if (uShadowOn < 0.5) return 1.0;
  vec3 p = wp + N * (0.05 + 0.14 * (1.0 - ndl));            // normal offset beats acne
  vec4 lp = uLightVP * vec4(p, 1.0);
  vec3 c = lp.xyz / lp.w * 0.5 + 0.5;
  if (c.z > 1.0) return 1.0;
  float edge = smoothstep(0.0, 0.10, min(min(c.x, 1.0 - c.x), min(c.y, 1.0 - c.y)));
  if (edge <= 0.0) return 1.0;
  float s = 0.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
    s += texture(uShadow, vec3(c.xy + vec2(float(i), float(j)) * uShadowTexel, c.z - 0.0009));
  }
  return mix(1.0, s / 9.0, edge);
}

float D_GGX(float NdH, float a){ float a2 = a * a; float d = NdH * NdH * (a2 - 1.0) + 1.0; return a2 / (3.14159 * d * d + 1e-5); }
float G_Smith(float NdV, float NdL, float a){ float k = (a + 1.0) * (a + 1.0) / 8.0; return (NdV / (NdV * (1.0 - k) + k)) * (NdL / (NdL * (1.0 - k) + k)); }
vec3  F_Schlick(float c, vec3 F0){ return F0 + (1.0 - F0) * pow(1.0 - c, 5.0); }

vec3 shade(vec3 N, vec3 V, vec3 L, vec3 albedo, float rough, float metal, vec3 lightCol) {
  vec3 H = normalize(L + V);
  float NdL = max(dot(N, L), 0.0);
  if (NdL <= 0.0) return vec3(0.0);
  float NdV = max(dot(N, V), 1e-3), NdH = max(dot(N, H), 0.0), VdH = max(dot(V, H), 0.0);
  float a = max(rough * rough, 0.03);
  vec3 F0 = mix(vec3(0.04), albedo, metal);
  vec3 F = F_Schlick(VdH, F0);
  vec3 spec = (D_GGX(NdH, a) * G_Smith(NdV, NdL, a) * F) / max(4.0 * NdV * NdL, 1e-3);
  vec3 kd = (1.0 - F) * (1.0 - metal);
  return (kd * albedo + spec) * lightCol * NdL;
}

void main(){
  vec3 N = normalize(vNrm);
  vec3 V = normalize(uCam - vWorld);
  float dist = length(uCam - vWorld);
  vec3 albedo = vCol * uTint;
  float rough = vMat.x, metal = vMat.y;

  // ---- procedural surface detail: two octaves of value noise in world space ----
  if (uDetail > 0.0) {
    float n1 = noise3(vWorld * 1.9), n2 = noise3(vWorld * 8.5);
    float det = (n1 - 0.5) * 0.11 + (n2 - 0.5) * 0.07;
    albedo *= 1.0 + det * uDetail;
    rough = clamp(rough + (n2 - 0.5) * 0.20 * uDetail, 0.04, 1.0);
  }

  // ---- floor grid (station only) ----
  if (uGrid > 0.5) {
    float floorMask = step(0.94, N.y) * (1.0 - smoothstep(0.05, 0.5, abs(vWorld.y)));
    if (floorMask > 0.0) {
      vec2 g = abs(fract(vWorld.xz * 0.5) - 0.5) / fwidth(vWorld.xz * 0.5);
      float line = 1.0 - min(min(g.x, g.y), 1.0);
      vec2 g2 = abs(fract(vWorld.xz * 0.05) - 0.5) / fwidth(vWorld.xz * 0.05);
      float major = 1.0 - min(min(g2.x, g2.y), 1.0);
      albedo = mix(albedo, albedo * 2.4 + 0.05, line * 0.45 * floorMask);
      albedo = mix(albedo, albedo * 2.8 + 0.12, major * 0.65 * floorMask);
      rough = mix(rough, 0.25, (line + major) * 0.5 * floorMask);
    }
  }

  float ndl = max(dot(N, uSunDir), 0.0);
  float sh = shadowAt(vWorld, N, ndl);

  vec3 col = shade(N, V, uSunDir, albedo, rough, metal, uSunCol) * sh;

  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec3 d = uLightPos[i] - vWorld;
    float dd = length(d);
    float att = max(0.0, 1.0 - dd / uLightRange[i]);
    att *= att;
    if (att <= 0.001) continue;
    col += shade(N, V, d / max(dd, 0.001), albedo, rough, metal, uLightCol[i] * att);
  }

  // ---- ambient: hemisphere diffuse + a cheap environment specular ----
  float hemi = N.y * 0.5 + 0.5;
  vec3 amb = mix(uGroundCol, uSkyCol, hemi * hemi);
  float NdV = max(dot(N, V), 1e-3);
  vec3 F0 = mix(vec3(0.04), albedo, metal);
  vec3 Fa = F_Schlick(NdV, F0);
  vec3 R = reflect(-V, N);
  vec3 env = mix(uGroundCol, uSkyCol, R.y * 0.5 + 0.5);
  col += amb * albedo * (1.0 - metal) * (1.0 - Fa * 0.5);
  col += env * Fa * (1.0 - rough) * (1.0 - rough) * (0.55 + 0.45 * metal) * 1.6;

  // ---- emissive ----
  float fres = pow(1.0 - NdV, 3.0);
  col += albedo * vGlow * 3.4 * uEmissive;
  col += vGlow * 0.30 * uEmissive * albedo * (0.78 + 0.22 * sin(uTime * 2.0 + vWorld.y * 3.0));

  float alpha = uAlpha;

  // ---- holographic figures ----
  if (uHolo > 0.5) {
    float scan = sin(vWorld.y * 42.0 - uTime * 2.2) * 0.5 + 0.5;
    float band = smoothstep(0.35, 1.0, scan);
    col += albedo * band * 0.16;
    col *= 0.88 + 0.22 * fres * 2.0;
    col += albedo * fres * 0.85;
    float flick = 0.97 + 0.03 * hash12(vec2(floor(uTime * 18.0), floor(vWorld.y * 8.0)));
    col *= flick;
    alpha *= clamp(0.62 + fres * 0.85 + band * 0.12, 0.0, 1.0);
  }

  // ---- fog ----
  float fog = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
  float height = exp(-max(vWorld.y, 0.0) * 0.035);
  fog = clamp(fog * mix(0.55, 1.0, height), 0.0, 1.0);
  col = mix(col, uFogCol, fog);

  frag = vec4(col, alpha);
  gbuf = vec4(normalize(mat3(uView) * N), -vView.z);
}`;

/* ---------- depth-only, for the shadow map ---------- */
const VS_DEPTH = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP, uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`;
const FS_DEPTH = `#version 300 es
precision mediump float;
void main(){}`;

/* ---------- sky ---------- */
const VS_FS = `#version 300 es
layout(location=0) in vec3 aPos;
out vec2 vUV;
void main(){ vUV = aPos.xy + 0.5; gl_Position = vec4(aPos.xy * 2.0, 0.0, 1.0); }`;

const FS_SKY = `#version 300 es
precision highp float;
in vec2 vUV;
uniform mat4  uInvVP;
uniform vec3  uCam, uSkyTop, uSkyHorizon, uFogCol, uSunDir, uSunCol;
uniform float uTime, uFar, uStars;
layout(location=0) out vec4 frag;
layout(location=1) out vec4 gbuf;
${GLSL_NOISE}
float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * noise3(p); p *= 2.1; a *= 0.5; } return s; }
void main(){
  vec4 clip = vec4(vUV * 2.0 - 1.0, 1.0, 1.0);
  vec4 wp = uInvVP * clip;
  vec3 dir = normalize(wp.xyz / wp.w - uCam);
  float h = clamp(dir.y * 1.4 + 0.06, -1.0, 1.0);
  vec3 col = mix(uSkyHorizon, uSkyTop, smoothstep(-0.05, 0.75, h));
  float up = smoothstep(-0.05, 0.6, dir.y);
  float n = fbm(dir * 3.2 + vec3(0.0, 0.0, uTime * 0.004));
  vec3 neb = mix(vec3(0.10, 0.05, 0.28), vec3(0.03, 0.16, 0.26), fbm(dir * 1.7 + 4.0));
  col += neb * pow(n, 2.6) * 0.85 * up * uStars;
  // a sun disc with a soft corona so the god rays have a source
  float sd = max(dot(dir, uSunDir), 0.0);
  col += uSunCol * (pow(sd, 900.0) * 6.0 + pow(sd, 24.0) * 0.35 + pow(sd, 4.0) * 0.06);
  vec3 sp = dir * 190.0;
  vec3 cell = floor(sp);
  float r = hash13(cell);
  if (uStars > 0.5 && r > 0.976) {
    vec3 jitter = vec3(hash13(cell + 1.7), hash13(cell + 5.3), hash13(cell + 9.1)) - 0.5;
    float d = length(fract(sp) - 0.5 - jitter * 0.6);
    float bright = smoothstep(0.30, 0.0, d);
    float tw = 0.65 + 0.35 * sin(uTime * 1.6 + r * 60.0);
    vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.88, 0.72), hash13(cell + 21.0));
    col += tint * bright * tw * (0.5 + (r - 0.976) * 34.0) * up;
  }
  col = mix(uFogCol, col, smoothstep(-0.16, 0.22, dir.y));
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
  vec3 N = normalize(g.xyz);
  vec3 rnd = texture(uNoise, vUV * uRes / 4.0).xyz * 2.0 - 1.0;
  vec3 T = normalize(rnd - N * dot(rnd, N));
  vec3 B = cross(N, T);
  mat3 TBN = mat3(T, B, N);
  float occ = 0.0;
  for (int i = 0; i < ${AO_SAMPLES}; i++) {
    vec3 s = P + TBN * uKernel[i] * uRadius;
    vec4 o = uProj * vec4(s, 1.0);
    vec2 suv = o.xy / o.w * 0.5 + 0.5;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
    float sd = texture(uG, suv).w;
    if (sd <= 0.0) continue;
    float range = smoothstep(0.0, 1.0, uRadius / abs(depth - sd));
    occ += (sd < -s.z - 0.05 ? 1.0 : 0.0) * range;
  }
  float ao = 1.0 - occ / float(${AO_SAMPLES});
  frag = vec4(vec3(pow(ao, 1.5)), 1.0);
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
  vec2 d = (uSun - vUV) / 28.0;
  vec2 uv = vUV; vec3 s = vec3(0.0); float w = 1.0;
  for (int i = 0; i < 28; i++) { uv += d; s += texture(uTex, uv).rgb * w; w *= 0.93; }
  frag = vec4(s / 28.0, 1.0);
}`;

const FS_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene, uBloom, uAO, uRays;
uniform vec2  uRes;
uniform float uTime, uBloomAmt, uPulse, uPulseHue, uFade, uAberration, uDim, uNoise, uAOAmt, uRaysAmt, uExposure;
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

  float ab = uAberration * (0.0012 + r2 * 0.008);
  vec3 col;
  col.r = texture(uScene, uv + fromC * ab).r;
  col.g = texture(uScene, uv).g;
  col.b = texture(uScene, uv - fromC * ab).b;

  float ao = texture(uAO, uv).r;
  col *= mix(1.0, ao, uAOAmt);

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

  // split-tone grade: cool shadows, warm highlights, gentle S-curve
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col *= mix(vec3(0.92, 0.97, 1.10), vec3(1.07, 1.02, 0.95), smoothstep(0.04, 1.2, lum));
  col = aces(col * uExposure);
  col = col * col * (3.0 - 2.0 * col) * 0.35 + col * 0.65;

  float scan = 0.992 + 0.008 * sin(uv.y * uRes.y * 1.6);
  col *= scan;
  col += (hash12(uv * uRes + fract(uTime) * 311.0) - 0.5) * (0.014 + uNoise * 0.032);
  float vig = smoothstep(1.10, 0.22, length(fromC * vec2(1.05, 1.25)));
  col *= mix(0.30, 1.0, vig);
  col *= uDim;
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  frag = vec4(col * uFade, 1.0);
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

    this.pScene  = makeProgram(gl, VS_SCENE, FS_SCENE, 'scene');
    this.pDepth  = makeProgram(gl, VS_DEPTH, FS_DEPTH, 'depth');
    this.pSky    = makeProgram(gl, VS_FS, FS_SKY, 'sky');
    this.pBill   = makeProgram(gl, VS_BILLBOARD, FS_BILLBOARD, 'billboard');
    this.pPart   = makeProgram(gl, VS_PART, FS_PART, 'particles');
    this.pSSAO   = makeProgram(gl, VS_FS, FS_SSAO, 'ssao');
    this.pAOBlur = makeProgram(gl, VS_FS, FS_AOBLUR, 'aoblur');
    this.pBright = makeProgram(gl, VS_FS, FS_BRIGHT, 'bright');
    this.pBlur   = makeProgram(gl, VS_FS, FS_BLUR, 'blur');
    this.pRays   = makeProgram(gl, VS_FS, FS_RAYS, 'rays');
    this.pComp   = makeProgram(gl, VS_FS, FS_COMPOSITE, 'composite');

    const b = new Builder();
    b.add(QUAD, xform(), [1, 1, 1], 0);
    this.quad = b.upload(gl);

    this.vp = M4.create(); this.proj = M4.create(); this.viewM = M4.create();
    this.invVP = M4.create(); this.nrmM = new Float32Array(9);
    this.lightView = M4.create(); this.lightProj = M4.create(); this.lightVP = M4.create();

    this.shadow = makeFBO(gl, SHADOW_RES, SHADOW_RES, { shadow: true });
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
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75) * (this.qScale || 1);
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
    del(this.sceneFBO); del(this.aoA); del(this.aoB); del(this.bright); del(this.blurA); del(this.blurB); del(this.rays);

    this.sceneFBO = makeFBO(gl, w, h, { depthTex: true, float: this.floatOK, mrt: true });
    const hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1);
    this.aoA = makeFBO(gl, hw, hh, {});
    this.aoB = makeFBO(gl, hw, hh, {});
    const bw = Math.max(2, w >> 2), bh = Math.max(2, h >> 2);
    this.bright = makeFBO(gl, bw, bh, { float: this.floatOK });
    this.blurA  = makeFBO(gl, bw, bh, { float: this.floatOK });
    this.blurB  = makeFBO(gl, bw, bh, { float: this.floatOK });
    this.rays   = makeFBO(gl, bw, bh, { float: this.floatOK });
  }

  /* ---------- lights ---------- */
  setLights(all, cx, cy, cz) {
    this.active = all.map((l) => {
      const d = Math.hypot(l.pos[0] - cx, l.pos[1] - cy, l.pos[2] - cz);
      return { l, s: (l.range + 20) / (d + 1) };
    }).sort((a, b) => b.s - a.s).slice(0, MAX_LIGHTS).map((x) => x.l);
  }

  uploadLights(p) {
    const gl = this.gl, ls = this.active || [];
    const pos = new Float32Array(MAX_LIGHTS * 3), col = new Float32Array(MAX_LIGHTS * 3), rng = new Float32Array(MAX_LIGHTS);
    for (let i = 0; i < ls.length; i++) {
      pos[i * 3] = ls[i].pos[0]; pos[i * 3 + 1] = ls[i].pos[1]; pos[i * 3 + 2] = ls[i].pos[2];
      const inten = (ls[i].intensity == null ? 1 : ls[i].intensity) * 1.3;
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
    this.gl.useProgram(this.pScene);
    this.uploadLights(this.pScene);
  }

  /* ---------- shadow pass ---------- */
  beginShadow(cam, env) {
    const gl = this.gl;
    const sd = env.sunDir;
    // focus a little ahead of the camera, snapped to the shadow texel grid
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    let cx = cam.x + fx * SHADOW_HALF * 0.45, cy = cam.y, cz = cam.z + fz * SHADOW_HALF * 0.45;
    const texel = (SHADOW_HALF * 2) / SHADOW_RES;
    // light basis for snapping
    const upv = Math.abs(sd[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    const ex = cx + sd[0] * 220, ey = cy + sd[1] * 220, ez = cz + sd[2] * 220;
    M4.lookAt(this.lightView, ex, ey, ez, cx, cy, cz, upv[0], upv[1], upv[2]);
    // snap: transform centre into light space, round, transform back via translation tweak
    const lv = this.lightView;
    const lx = lv[0] * cx + lv[4] * cy + lv[8] * cz + lv[12];
    const ly = lv[1] * cx + lv[5] * cy + lv[9] * cz + lv[13];
    const sx = Math.round(lx / texel) * texel - lx, sy = Math.round(ly / texel) * texel - ly;
    lv[12] += sx; lv[13] += sy;
    M4.ortho(this.lightProj, -SHADOW_HALF, SHADOW_HALF, -SHADOW_HALF, SHADOW_HALF, 1, 460);
    M4.mul(this.lightVP, this.lightProj, this.lightView);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadow.fbo);
    gl.viewport(0, 0, SHADOW_RES, SHADOW_RES);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.useProgram(this.pDepth);
    gl.uniformMatrix4fv(this.pDepth.u.uLightVP, false, this.lightVP);
    this.shadowPass = true;
  }

  endShadow() {
    this.shadowPass = false;
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }

  /* ---------- scene pass ---------- */
  beginScene(cam, env, time) {
    const gl = this.gl;
    this.far = 900;
    M4.perspective(this.proj, cam.fov, this.W / this.H, 0.08, this.far);
    M4.view(this.viewM, cam.x, cam.y, cam.z, cam.yaw, cam.pitch, cam.roll || 0);
    M4.mul(this.vp, this.proj, this.viewM);
    this.cam = cam; this.env = env; this.time = time;
    this.tanHalfY = Math.tan(cam.fov / 2);
    this.tanHalfX = this.tanHalfY * (this.W / this.H);

    // sun's screen position for the god rays
    const sx = cam.x + env.sunDir[0] * 1000, sy = cam.y + env.sunDir[1] * 1000, sz = cam.z + env.sunDir[2] * 1000;
    const v = this.vp;
    const cw = v[3] * sx + v[7] * sy + v[11] * sz + v[15];
    if (cw > 0) {
      const cx = (v[0] * sx + v[4] * sy + v[8] * sz + v[12]) / cw;
      const cy = (v[1] * sx + v[5] * sy + v[9] * sz + v[13]) / cw;
      this.sunUV = [cx * 0.5 + 0.5, cy * 0.5 + 0.5];
      this.sunOn = (Math.abs(cx) < 1.6 && Math.abs(cy) < 1.6) ? 1 : 0;
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
    gl.uniform3fv(s.u.uSkyTop, env.skyTop);
    gl.uniform3fv(s.u.uSkyHorizon, env.skyHorizon);
    gl.uniform3fv(s.u.uFogCol, env.fog);
    gl.uniform3fv(s.u.uSunDir, env.sunDir);
    gl.uniform3fv(s.u.uSunCol, env.sunDisc || env.sunCol);
    gl.uniform1f(s.u.uTime, time);
    gl.uniform1f(s.u.uFar, this.far);
    gl.uniform1f(s.u.uStars, env.stars == null ? 1 : env.stars);
    gl.bindVertexArray(this.quad.vao);
    gl.drawElements(gl.TRIANGLES, this.quad.count, gl.UNSIGNED_SHORT, 0);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    const p = this.pScene;
    gl.useProgram(p);
    gl.uniformMatrix4fv(p.u.uVP, false, this.vp);
    gl.uniformMatrix4fv(p.u.uView, false, this.viewM);
    gl.uniformMatrix4fv(p.u.uLightVP, false, this.lightVP);
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
    gl.uniform1f(p.u.uShadowOn, env.shadows === false ? 0 : 1);
    gl.uniform1f(p.u.uShadowTexel, 1 / SHADOW_RES);
    gl.uniform1f(p.u.uDetail, env.detail == null ? 1 : env.detail);
    gl.uniform1f(p.u.uGrid, env.grid ? 1 : 0);
    gl.uniform3f(p.u.uTint, 1, 1, 1);
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, this.shadow.depthTex);
    gl.uniform1i(p.u.uShadow, 7);
    this.uploadLights(p);
  }

  gbufWrite(on) {
    const gl = this.gl;
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, on ? gl.COLOR_ATTACHMENT1 : gl.NONE]);
  }

  drawMesh(mesh, model, opts = {}) {
    const gl = this.gl;
    const m = model || IDENT;
    if (this.shadowPass) {
      if (opts.noShadow || (opts.alpha != null && opts.alpha < 0.9)) return;
      const p = this.pDepth;
      gl.uniformMatrix4fv(p.u.uModel, false, m);
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.count, mesh.u32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
      return;
    }
    const p = this.pScene;
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
        gl.uniform1f(p.u.uRadius, state.aoRadius || 1.35);
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
    });
    const bw = this.bright.w, bh = this.bright.h;
    // god rays read the bright buffer before it is blurred
    this.fsPass(this.pRays, this.rays, (p) => {
      bind(this.bright.tex, 0, p.u.uTex);
      gl.uniform2f(p.u.uSun, this.sunUV ? this.sunUV[0] : 0.5, this.sunUV ? this.sunUV[1] : 0.5);
      gl.uniform1f(p.u.uOn, this.sunOn ? 1 : 0);
    });
    this.fsPass(this.pBlur, this.blurA, (p) => { bind(this.bright.tex, 0, p.u.uTex); gl.uniform2f(p.u.uDir, 0.70 / bw, 0); });
    this.fsPass(this.pBlur, this.blurB, (p) => { bind(this.blurA.tex, 0, p.u.uTex); gl.uniform2f(p.u.uDir, 0, 0.70 / bh); });
    this.fsPass(this.pBlur, this.blurA, (p) => { bind(this.blurB.tex, 0, p.u.uTex); gl.uniform2f(p.u.uDir, 1.35 / bw, 0); });
    this.fsPass(this.pBlur, this.blurB, (p) => { bind(this.blurA.tex, 0, p.u.uTex); gl.uniform2f(p.u.uDir, 0, 1.35 / bh); });

    // ---- composite ----
    this.fsPass(this.pComp, null, (p) => {
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
      gl.uniform1f(p.u.uRaysAmt, state.rays == null ? 0.55 : state.rays);
      gl.uniform1f(p.u.uExposure, state.exposure == null ? 1.15 : state.exposure);
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
