/* ============================================================
   textures.js — the procedural material library.

   Every surface texture in the game is generated on the GPU at load:
   one small fragment program per material renders albedo (sRGB, with
   alpha as a cut-out or glass mask) and a normal map (RG normal,
   B ambient occlusion, A roughness) into a 512² texture array, then
   the arrays are mipmapped. Nothing is downloaded. All patterns tile.
   ============================================================ */

const TEX_RES = 512;

const MATGEN_HEAD = `#version 300 es
precision highp float;
in vec2 vUV;
layout(location=0) out vec4 oAlb;
layout(location=1) out vec4 oNrm;
struct S { vec3 alb; float a; float h; float r; float ao; vec3 n; };
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 h22(vec2 p){ float a = h21(p); return vec2(a, h21(p + a + 17.13)); }
float vn(vec2 x, vec2 P){
  vec2 i = floor(x), f = fract(x); vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 i0 = mod(i, P), i1 = mod(i + 1.0, P);
  return mix(mix(h21(i0), h21(vec2(i1.x, i0.y)), u.x), mix(h21(vec2(i0.x, i1.y)), h21(i1), u.x), u.y);
}
float fbm(vec2 uv, vec2 P, int oct){
  float s = 0.0, a = 0.5, t = 0.0;
  for (int i = 0; i < 7; i++){ if (i >= oct) break; s += a * vn(uv * P, P); t += a; P *= 2.0; a *= 0.5; }
  return s / t;
}
vec3 vor(vec2 uv, vec2 P){
  vec2 x = uv * P; vec2 i = floor(x), f = fract(x);
  float F1 = 9.0, F2 = 9.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int xx = -1; xx <= 1; xx++){
    vec2 g = vec2(float(xx), float(y)); vec2 c = mod(i + g, P); vec2 o = h22(c);
    vec2 r = g + o - f; float d = dot(r, r);
    if (d < F1){ F2 = F1; F1 = d; id = h21(c + 3.7); } else if (d < F2) F2 = d;
  }
  return vec3(sqrt(F1), sqrt(F2), id);
}
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
/* a running bond: returns (metres to vertical joint, metres to bed joint, unit id, row) */
vec4 bond(vec2 uv, float rows, float per, float tileM, float randShift){
  float ry = uv.y * rows; float row = floor(ry); float fy = fract(ry);
  float shift = randShift > 0.5 ? h21(vec2(row, 7.0)) : mod(row, 2.0) * 0.5 / per;
  float rx = fract(uv.x + shift) * per; float col = floor(rx); float fx = fract(rx);
  return vec4(min(fx, 1.0 - fx) * tileM / per, min(fy, 1.0 - fy) * tileM / rows, h21(vec2(col, row) + 0.37), row);
}
S blank(){ S s; s.alb = vec3(1.0); s.a = 1.0; s.h = 0.0; s.r = 0.5; s.ao = 1.0; s.n = vec3(0.0); return s; }
`;

const MATGEN_MAIN = `
void main(){
  vec2 uv = vUV;
  S s = MAT(uv);
  vec3 n = s.n;
  if (n.z == 0.0) {
    float e = 1.0 / ${TEX_RES.toFixed(1)};
    float hx = MAT(fract(uv + vec2(e, 0.0))).h, hy = MAT(fract(uv + vec2(0.0, e))).h;
    n = normalize(vec3((s.h - hx) * BUMP, (s.h - hy) * BUMP, 1.0));
  }
  oAlb = vec4(clamp(s.alb, 0.0, 1.0), s.a);
  oNrm = vec4(n.xy * 0.5 + 0.5, s.ao, s.r);
}`;

/* one entry per TX layer, in order */
const MATGEN = [];
MATGEN[TX.NONE] = { bump: 0, fn: `S m(vec2 uv){ return blank(); }` };

MATGEN[TX.ASHLAR] = { bump: 7, fn: `S m(vec2 uv){
  float row = floor(uv.y * 6.0);
  float per = 2.0 + floor(h21(vec2(row, 1.3)) * 2.99);
  vec4 b = bond(uv, 6.0, per, 2.0, 1.0);
  float e = min(b.x, b.y);
  float joint = smoothstep(0.003, 0.007, e), bevel = smoothstep(0.003, 0.02, e);
  float n1 = fbm(uv, vec2(20.0), 4), n2 = fbm(uv, vec2(150.0), 3);
  vec3 st = lin(vec3(0.86, 0.79, 0.65));
  st *= 0.88 + 0.2 * b.z;
  st = mix(st, st * vec3(0.92, 0.95, 1.03), step(0.8, h21(vec2(b.z, 4.1))));
  st = mix(st, st * vec3(1.05, 0.98, 0.86), step(0.86, h21(vec2(b.z, 8.3))));
  st *= 0.9 + 0.14 * n1;
  st *= 0.95 + 0.09 * n2;
  float streak = fbm(uv, vec2(36.0, 2.0), 3);
  st *= 1.0 - 0.15 * smoothstep(0.55, 0.85, streak);
  vec3 mo = lin(vec3(0.82, 0.8, 0.74)) * (0.9 + 0.1 * n2);
  S s; s.alb = mix(mo, st, joint); s.a = 1.0; s.h = bevel * (0.88 + 0.12 * n2);
  s.r = mix(0.95, 0.83, joint); s.ao = mix(0.55, 1.0, bevel); s.n = vec3(0.0); return s; }` };

MATGEN[TX.BRICK] = { bump: 9, fn: `S m(vec2 uv){
  vec4 b = bond(uv, 26.0, 9.0, 2.0, 0.0);
  float e = min(b.x, b.y);
  float j = smoothstep(0.0035, 0.006, e), bev = smoothstep(0.0035, 0.011, e);
  float n2 = fbm(uv, vec2(170.0), 3), n1 = fbm(uv, vec2(10.0), 3);
  vec3 br = lin(vec3(0.63, 0.33, 0.23));
  float k = b.z;
  br = mix(br, lin(vec3(0.44, 0.22, 0.18)), step(0.76, k));
  br = mix(br, lin(vec3(0.72, 0.44, 0.29)), step(0.88, h21(vec2(k, 2.2))));
  br *= 0.84 + 0.28 * h21(vec2(k, 5.5));
  br *= 0.88 + 0.18 * n2;
  br *= 0.86 + 0.16 * n1;
  vec3 mo = lin(vec3(0.74, 0.71, 0.64)) * (0.85 + 0.15 * n2);
  S s; s.alb = mix(mo, br, j); s.a = 1.0; s.h = bev * (0.85 + 0.15 * n2);
  s.r = mix(0.95, 0.86, j); s.ao = mix(0.5, 1.0, bev); s.n = vec3(0.0); return s; }` };

MATGEN[TX.SLATE] = { bump: 7, fn: `S m(vec2 uv){
  float rows = 9.0, per = 7.0;
  float ry = uv.y * rows, row = floor(ry), fy = fract(ry);
  float shift = mod(row, 2.0) * 0.5 / per + (h21(vec2(row, 2.0)) - 0.5) * 0.02;
  float rx = fract(uv.x + shift) * per, col = floor(rx), fx = fract(rx);
  float id = h21(vec2(col, row));
  float gap = smoothstep(0.0, 0.03, min(fx, 1.0 - fx));
  float n = fbm(uv, vec2(80.0), 3);
  float h = (1.0 - fy * 0.6) * gap * (0.92 + 0.08 * n);
  vec3 c = lin(vec3(0.33, 0.35, 0.39));
  c *= 0.72 + 0.46 * id;
  c = mix(c, c * vec3(1.06, 0.94, 1.12), step(0.7, h21(vec2(id, 9.0))));
  c = mix(c, c * vec3(0.95, 1.05, 0.95), step(0.85, h21(vec2(id, 3.0))));
  c *= 0.86 + 0.18 * fbm(uv, vec2(30.0), 3);
  S s; s.alb = c * mix(0.35, 1.0, gap); s.a = 1.0; s.h = h;
  s.r = 0.55 + 0.2 * id; s.ao = gap * mix(1.0, 0.45, smoothstep(0.82, 1.0, fy)); s.n = vec3(0.0); return s; }` };

MATGEN[TX.CLAY] = { bump: 6, fn: `S m(vec2 uv){
  float rows = 20.0, per = 12.0;
  float ry = uv.y * rows, row = floor(ry), fy = fract(ry);
  float shift = mod(row, 2.0) * 0.5 / per;
  float rx = fract(uv.x + shift) * per, col = floor(rx), fx = fract(rx);
  float id = h21(vec2(col, row));
  float gap = smoothstep(0.0, 0.05, min(fx, 1.0 - fx));
  float camber = sin(fx * 3.14159) * 0.3;
  vec3 c = lin(vec3(0.66, 0.36, 0.24));
  c *= 0.75 + 0.4 * id;
  c = mix(c, lin(vec3(0.42, 0.24, 0.18)), step(0.82, h21(vec2(id, 1.0))));
  float moss = smoothstep(0.62, 0.8, fbm(uv, vec2(12.0), 4));
  c = mix(c, lin(vec3(0.36, 0.40, 0.18)), moss * 0.6);
  S s; s.alb = c * mix(0.4, 1.0, gap); s.a = 1.0; s.h = ((1.0 - fy * 0.5) + camber) * gap;
  s.r = 0.8; s.ao = gap * mix(1.0, 0.5, smoothstep(0.8, 1.0, fy)); s.n = vec3(0.0); return s; }` };

MATGEN[TX.GRASS] = { bump: 2.5, fn: `S m(vec2 uv){
  float big = fbm(uv, vec2(3.0), 4), mid = fbm(uv, vec2(13.0), 3);
  float b1 = vn(uv * vec2(260.0, 88.0), vec2(260.0, 88.0));
  float b2 = vn((uv + 0.37) * vec2(90.0, 300.0), vec2(90.0, 300.0));
  float bl = max(b1, b2);
  vec3 c = lin(vec3(0.38, 0.52, 0.21));
  c = mix(c, lin(vec3(0.50, 0.55, 0.26)), smoothstep(0.55, 0.8, big) * 0.55);
  c *= 0.84 + 0.28 * mid;
  c *= 0.76 + 0.36 * bl;
  vec3 v = vor(uv, vec2(56.0));
  c = mix(c, c * vec3(0.8, 1.06, 0.84), step(0.93, v.z) * smoothstep(0.35, 0.15, v.x));
  float daisy = step(0.9975, h21(floor(uv * 512.0))) * step(0.45, big);
  c = mix(c, lin(vec3(0.95, 0.95, 0.88)), daisy * 0.85);
  S s; s.alb = c; s.a = 1.0; s.h = bl * 0.8 + mid * 0.2; s.r = 0.94; s.ao = 0.78 + 0.22 * bl; s.n = vec3(0.0); return s; }` };

MATGEN[TX.GRAVEL] = { bump: 6, fn: `S m(vec2 uv){
  vec3 v = vor(uv, vec2(64.0)), v2 = vor(uv + 0.5, vec2(128.0));
  float peb = smoothstep(0.58, 0.16, v.x), peb2 = smoothstep(0.5, 0.1, v2.x);
  vec3 sand = lin(vec3(0.79, 0.69, 0.51)) * (0.9 + 0.18 * fbm(uv, vec2(48.0), 3));
  vec3 pc = mix(lin(vec3(0.84, 0.76, 0.60)), lin(vec3(0.62, 0.57, 0.50)), h21(vec2(v.z, 1.0)));
  pc = mix(pc, lin(vec3(0.74, 0.54, 0.35)), step(0.8, h21(vec2(v.z, 2.0))));
  pc *= 0.84 + 0.3 * v.z;
  vec3 c = mix(sand, pc, peb * 0.85);
  c = mix(c, c * 1.07, peb2 * 0.5);
  S s; s.alb = c; s.a = 1.0; s.h = peb * (0.6 + 0.4 * v.z) + peb2 * 0.3; s.r = 0.95; s.ao = 0.72 + 0.28 * peb; s.n = vec3(0.0); return s; }` };

MATGEN[TX.FLAG] = { bump: 6, fn: `S m(vec2 uv){
  float row = floor(uv.y * 5.0);
  float per = 3.0 + floor(h21(vec2(row, 5.1)) * 2.99);
  vec4 b = bond(uv, 5.0, per, 3.0, 1.0);
  float e = min(b.x, b.y);
  float j = smoothstep(0.004, 0.009, e);
  vec3 c = lin(vec3(0.67, 0.64, 0.58));
  c *= 0.84 + 0.26 * b.z;
  c = mix(c, c * vec3(1.08, 1.0, 0.85), step(0.72, h21(vec2(b.z, 3.3))));
  c *= 0.9 + 0.14 * fbm(uv, vec2(30.0), 4);
  c *= 0.95 + 0.08 * fbm(uv, vec2(190.0), 2);
  c *= 1.0 - 0.13 * smoothstep(0.62, 0.8, fbm(uv, vec2(6.0), 3));
  S s; s.alb = mix(lin(vec3(0.3, 0.29, 0.27)), c, j); s.a = 1.0;
  s.h = j * (0.9 + 0.1 * fbm(uv, vec2(110.0), 2)); s.r = mix(0.95, 0.8, j); s.ao = mix(0.5, 1.0, j); s.n = vec3(0.0); return s; }` };

MATGEN[TX.ASPHALT] = { bump: 3, fn: `S m(vec2 uv){
  vec3 v = vor(uv, vec2(220.0));
  float agg = smoothstep(0.45, 0.2, v.x) * step(0.55, v.z);
  vec3 c = lin(vec3(0.34, 0.34, 0.35));
  c *= 0.85 + 0.25 * fbm(uv, vec2(8.0), 4);
  c = mix(c, lin(vec3(0.42, 0.41, 0.40)), agg * 0.55);
  c *= 0.9 + 0.12 * fbm(uv, vec2(110.0), 2);
  c *= mix(1.0, 0.82, step(0.7, fbm(uv, vec2(4.0), 3)));
  S s; s.alb = c; s.a = 1.0; s.h = agg * 0.5 + fbm(uv, vec2(300.0), 2) * 0.5; s.r = 0.9; s.ao = 0.92; s.n = vec3(0.0); return s; }` };

MATGEN[TX.CONCRETE] = { bump: 3, fn: `S m(vec2 uv){
  float board = floor(uv.y * 12.0);
  float bl = smoothstep(0.0, 0.03, abs(fract(uv.y * 12.0) - 0.5) - 0.44);
  vec3 c = lin(vec3(0.66, 0.65, 0.61));
  c *= 0.93 + 0.1 * h21(vec2(board, 2.0));
  c *= 0.9 + 0.15 * fbm(uv, vec2(24.0), 4);
  c *= 1.0 - 0.12 * smoothstep(0.55, 0.85, fbm(uv, vec2(30.0, 2.0), 3));
  vec2 th = fract(uv * vec2(5.0, 5.0)) - 0.5;
  float tie = smoothstep(0.03, 0.018, length(th));
  c *= 1.0 - 0.45 * tie;
  S s; s.alb = c * (1.0 - bl * 0.08); s.a = 1.0; s.h = 1.0 - bl * 0.3 - tie * 0.5 + fbm(uv, vec2(160.0), 2) * 0.15;
  s.r = 0.86; s.ao = 1.0 - tie * 0.4; s.n = vec3(0.0); return s; }` };

MATGEN[TX.WOOD] = { bump: 4, fn: `S m(vec2 uv){
  float per = 8.0;
  float px = uv.x * per, plank = floor(px), fx = fract(px);
  float gap = smoothstep(0.0, 0.05, min(fx, 1.0 - fx));
  float g = vn(vec2(uv.x * 220.0 + h21(vec2(plank, 1.0)) * 40.0, uv.y * 6.0), vec2(220.0, 6.0));
  float ring = sin(g * 28.0 + uv.x * 60.0) * 0.5 + 0.5;
  vec3 c = lin(vec3(0.62, 0.47, 0.33));
  c *= 0.78 + 0.3 * h21(vec2(plank, 3.0));
  c *= 0.85 + 0.2 * ring;
  S s; s.alb = c * mix(0.3, 1.0, gap); s.a = 1.0; s.h = gap * (0.9 + 0.1 * ring); s.r = 0.7; s.ao = mix(0.4, 1.0, gap); s.n = vec3(0.0); return s; }` };

/* one window, 6-over-6 sash; alpha = glass, rgb in the glass = lamplight colour */
MATGEN[TX.SASH] = { bump: 10, fn: `S m(vec2 uv){
  float fr = 0.07;
  float inX = step(fr, uv.x) * step(uv.x, 1.0 - fr), inY = step(fr, uv.y) * step(uv.y, 1.0 - fr);
  float rail = step(abs(uv.y - 0.5), 0.024);
  float ux = (uv.x - fr) / (1.0 - 2.0 * fr);
  float bx = step(abs(ux - 1.0 / 3.0), 0.013) + step(abs(ux - 2.0 / 3.0), 0.013);
  float lo = (fr + 0.5) * 0.5, hi = (0.5 + 1.0 - fr) * 0.5;
  float by = step(abs(uv.y - lo), 0.012) + step(abs(uv.y - hi), 0.012);
  float glass = inX * inY * (1.0 - rail) * clamp(1.0 - bx - by, 0.0, 1.0);
  float frameH = 1.0 - inX * inY;
  S s; s.alb = mix(lin(vec3(0.9, 0.89, 0.86)), vec3(1.0, 0.74, 0.46), glass); s.a = glass;
  s.h = frameH * 1.0 + rail * 0.8 + clamp(bx + by, 0.0, 1.0) * 0.55;
  s.r = mix(0.55, 0.05, glass); s.ao = mix(1.0, 0.8, glass * smoothstep(0.2, 0.0, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)))); s.n = vec3(0.0); return s; }` };

MATGEN[TX.LEAVES] = { bump: 0, fn: `S m(vec2 uv){
  vec2 p = uv - 0.5;
  S s; s.alb = lin(vec3(0.34, 0.47, 0.18)); s.a = 0.0; s.h = 0.0; s.r = 0.7; s.ao = 1.0; s.n = vec3(0.0, 0.0, 1.0);
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float ang = fi * 0.9 + h21(vec2(fi, 9.0));
    vec2 a = vec2(0.0), b2 = vec2(cos(ang), sin(ang)) * (0.25 + 0.15 * h21(vec2(fi, 8.0)));
    vec2 pa = p - a, ba = b2 - a; float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    if (length(pa - ba * t) < 0.006 * (1.0 - t * 0.6)) { s.alb = lin(vec3(0.3, 0.22, 0.15)); s.a = 1.0; s.ao = 0.6; }
  }
  for (int i = 0; i < 96; i++) {
    float fi = float(i);
    vec2 r = h22(vec2(fi, 1.7));
    float ang = r.x * 6.2832, rad = sqrt(r.y) * 0.4;
    vec2 c = vec2(cos(ang), sin(ang)) * rad;
    float rot = ang + (h21(vec2(fi, 3.1)) - 0.5) * 1.8;
    float len = 0.055 + 0.045 * h21(vec2(fi, 4.2));
    vec2 d = p - c;
    float cr = cos(rot), sr = sin(rot);
    vec2 q = vec2(cr * d.x + sr * d.y, -sr * d.x + cr * d.y);
    float t = q.x / len;
    float w = len * 0.46 * sqrt(max(0.0, 1.0 - t * t)) * (1.0 - 0.3 * max(t, 0.0));
    if (abs(t) < 1.0 && abs(q.y) < w) {
      float shade = h21(vec2(fi, 5.3));
      vec3 col = mix(lin(vec3(0.22, 0.38, 0.11)), lin(vec3(0.50, 0.64, 0.25)), shade);
      col = mix(col, lin(vec3(0.66, 0.64, 0.26)), step(0.9, h21(vec2(fi, 6.6))) * 0.6);
      float across = q.y / max(w, 1e-3);
      col *= 1.0 - 0.22 * smoothstep(0.12, 0.0, abs(across)) * step(-0.85, t);
      col *= 0.86 + 0.2 * (1.0 - abs(across));
      s.alb = col; s.a = 1.0; s.ao = 0.75 + 0.25 * rad / 0.4;
      vec2 tilt = (h22(vec2(fi, 7.7)) - 0.5) * 1.4 + vec2(-sr, cr) * across * 0.45;
      s.n = normalize(vec3(tilt, 1.0));
      s.r = 0.55 + 0.2 * shade;
    }
  }
  return s; }` };

MATGEN[TX.BARK] = { bump: 8, fn: `S m(vec2 uv){
  float r = fbm(uv + vec2(fbm(uv, vec2(3.0, 1.0), 2) * 0.2, 0.0), vec2(9.0, 2.0), 4);
  float ridge = 1.0 - abs(r - 0.5) * 2.0;
  float plates = vor(uv, vec2(6.0, 3.0)).x;
  vec3 c = lin(vec3(0.42, 0.38, 0.33));
  c *= 0.62 + 0.5 * ridge;
  float lich = smoothstep(0.6, 0.75, fbm(uv, vec2(8.0), 4));
  c = mix(c, lin(vec3(0.55, 0.60, 0.45)), lich * 0.5);
  S s; s.alb = c; s.a = 1.0; s.h = ridge * 0.8 + plates * 0.2; s.r = 0.95; s.ao = 0.55 + 0.45 * ridge; s.n = vec3(0.0); return s; }` };

MATGEN[TX.HEDGE] = { bump: 6, fn: `S m(vec2 uv){
  vec3 v = vor(uv, vec2(34.0)), v2 = vor(uv + 0.31, vec2(58.0));
  float leaf = smoothstep(0.6, 0.1, v.x), leaf2 = smoothstep(0.55, 0.1, v2.x);
  vec3 c = mix(lin(vec3(0.16, 0.28, 0.10)), lin(vec3(0.30, 0.44, 0.16)), v.z);
  c = mix(c, mix(lin(vec3(0.2, 0.34, 0.12)), lin(vec3(0.36, 0.5, 0.2)), v2.z), leaf2 * 0.6);
  float depth = max(leaf, leaf2 * 0.8);
  c *= 0.35 + 0.75 * depth;
  S s; s.alb = c; s.a = 1.0; s.h = depth; s.r = 0.85; s.ao = 0.4 + 0.6 * depth; s.n = vec3(0.0); return s; }` };

MATGEN[TX.COPPER] = { bump: 5, fn: `S m(vec2 uv){
  float sx = fract(uv.x * 4.0);
  float rib = smoothstep(0.035, 0.0, abs(sx - 0.5));
  float streak = fbm(uv, vec2(24.0, 3.0), 4);
  vec3 c = lin(vec3(0.43, 0.65, 0.57));
  c = mix(c, lin(vec3(0.30, 0.50, 0.44)), smoothstep(0.4, 0.8, streak));
  c = mix(c, lin(vec3(0.42, 0.34, 0.24)), smoothstep(0.7, 0.9, fbm(uv, vec2(6.0), 3)) * 0.5);
  c *= 0.9 + 0.12 * fbm(uv, vec2(120.0), 2);
  S s; s.alb = c; s.a = 1.0; s.h = rib; s.r = 0.62; s.ao = 1.0 - rib * 0.1; s.n = vec3(0.0); return s; }` };

MATGEN[TX.SETTS] = { bump: 9, fn: `S m(vec2 uv){
  vec4 b = bond(uv, 10.0, 5.0, 1.0, 1.0);
  float e = min(b.x, b.y);
  float dome = smoothstep(0.005, 0.035, e);
  vec3 c = mix(lin(vec3(0.52, 0.50, 0.50)), lin(vec3(0.58, 0.50, 0.48)), h21(vec2(b.z, 2.0)));
  c *= 0.78 + 0.34 * b.z;
  float speck = step(0.8, h21(floor(uv * 512.0)));
  c *= 1.0 - 0.18 * speck;
  S s; s.alb = mix(lin(vec3(0.22, 0.21, 0.2)), c, smoothstep(0.004, 0.009, e)); s.a = 1.0;
  s.h = dome; s.r = 0.78; s.ao = mix(0.4, 1.0, dome); s.n = vec3(0.0); return s; }` };

MATGEN[TX.RENDER] = { bump: 2, fn: `S m(vec2 uv){
  vec3 c = lin(vec3(0.90, 0.87, 0.80));
  c *= 0.92 + 0.1 * fbm(uv, vec2(10.0), 4);
  c *= 0.97 + 0.05 * fbm(uv, vec2(120.0), 3);
  c *= 1.0 - 0.1 * smoothstep(0.6, 0.85, fbm(uv, vec2(26.0, 2.0), 3));
  S s; s.alb = c; s.a = 1.0; s.h = fbm(uv, vec2(200.0), 3); s.r = 0.9; s.ao = 1.0; s.n = vec3(0.0); return s; }` };

/* curtain wall module: two 1.8 m panes per 3.6 m storey, spandrel at the slab */
MATGEN[TX.CURTAIN] = { bump: 8, fn: `S m(vec2 uv){
  float mx = fract(uv.x * 2.0);
  float mull = step(min(mx, 1.0 - mx), 0.012);
  float trans = step(uv.y, 0.012) + step(abs(uv.y - 0.22), 0.008);
  float span = step(uv.y, 0.22);
  float glass = (1.0 - span) * (1.0 - clamp(mull + trans, 0.0, 1.0));
  vec3 frame = lin(vec3(0.24, 0.25, 0.26));
  vec3 spand = lin(vec3(0.16, 0.17, 0.18)) * (0.9 + 0.1 * fbm(uv, vec2(40.0), 2));
  S s; s.alb = mix(mix(spand, frame, clamp(mull + trans, 0.0, 1.0)), vec3(0.92, 0.95, 1.0), glass); s.a = glass;
  s.h = clamp(mull + trans, 0.0, 1.0) * 1.0 + span * 0.3; s.r = mix(0.35, 0.04, glass); s.ao = 1.0; s.n = vec3(0.0); return s; }` };

/* a tall perpendicular gothic window (aspect 1:3): tracery, stained glass */
MATGEN[TX.GOTHIC] = { bump: 8, fn: `S m(vec2 uv){
  vec2 P = vec2(uv.x - 0.5, uv.y * 3.0);
  float hw = 0.44, spring = 2.1, t = 0.022;
  float dl = length(P - vec2(hw, spring)), dr = length(P - vec2(-hw, spring));
  bool head = P.y > spring;
  bool inside = abs(P.x) < hw && P.y > 0.06 && (!head || (dl < 2.0 * hw && dr < 2.0 * hw));
  float edge = head ? min(2.0 * hw - dl, 2.0 * hw - dr) : min(hw - abs(P.x), P.y - 0.06);
  float stone = 1.0;
  float glass = 0.0;
  if (inside) {
    glass = 1.0;
    float frame = step(edge, t * 1.4);
    float mull = 0.0;
    for (int k = 1; k < 5; k++) { float xk = -hw + float(k) * (2.0 * hw / 5.0); mull += step(abs(P.x - xk), t * 0.5) * step(P.y, spring + 0.1); }
    float trans = step(abs(P.y - 0.95), t * 0.5) + step(abs(P.y - 1.65), t * 0.5);
    float c1 = abs(length(P - vec2(0.0, spring + 0.42)) - 0.16);
    float c2 = abs(length(P - vec2(-0.2, spring + 0.14)) - 0.1);
    float c3 = abs(length(P - vec2(0.2, spring + 0.14)) - 0.1);
    float tracery = head ? step(min(c1, min(c2, c3)), t * 0.5) : 0.0;
    float midm = step(abs(P.x), t * 0.5) * step(P.y, spring + 0.26);
    float lead = step(abs(fract((P.x + P.y) * 9.0) - 0.5), 0.035) + step(abs(fract((P.x - P.y) * 9.0) - 0.5), 0.035);
    float bars = clamp(frame + mull + trans + tracery + midm, 0.0, 1.0);
    glass = 1.0 - bars;
    stone = bars;
    vec2 cell = floor(vec2(P.x + P.y, P.x - P.y) * 9.0);
    float hc = h21(cell);
    vec3 jewel = hc < 0.3 ? vec3(0.18, 0.32, 0.95) : hc < 0.5 ? vec3(0.95, 0.18, 0.16) : hc < 0.66 ? vec3(1.0, 0.78, 0.25) : hc < 0.78 ? vec3(0.2, 0.7, 0.35) : vec3(0.95, 0.92, 0.85);
    jewel *= 1.0 - clamp(lead, 0.0, 1.0) * 0.85;
    S s; s.alb = mix(lin(vec3(0.84, 0.78, 0.66)), jewel, glass); s.a = glass;
    s.h = bars * 0.8 + stone * 0.2; s.r = mix(0.85, 0.06, glass); s.ao = mix(1.0, 0.85, glass); s.n = vec3(0.0); return s;
  }
  vec3 st = lin(vec3(0.84, 0.78, 0.64)) * (0.9 + 0.12 * fbm(uv, vec2(12.0, 36.0), 3));
  S s; s.alb = st; s.a = 0.0; s.h = 1.0; s.r = 0.85; s.ao = 1.0; s.n = vec3(0.0); return s; }` };

MATGEN[TX.FLOWERS] = { bump: 5, fn: `S m(vec2 uv){
  vec3 soil = lin(vec3(0.28, 0.21, 0.15)) * (0.8 + 0.3 * fbm(uv, vec2(40.0), 3));
  vec3 v = vor(uv, vec2(16.0)), f = vor(uv + 0.2, vec2(46.0));
  float plant = smoothstep(0.62, 0.25, v.x);
  vec3 leaf = mix(lin(vec3(0.18, 0.32, 0.12)), lin(vec3(0.32, 0.48, 0.18)), v.z) * (0.6 + 0.5 * plant);
  float bloom = smoothstep(0.3, 0.12, f.x) * step(0.35, f.z) * plant;
  float hc = h21(vec2(f.z, 4.0));
  vec3 fl = hc < 0.3 ? lin(vec3(0.85, 0.2, 0.25)) : hc < 0.5 ? lin(vec3(0.95, 0.8, 0.2)) : hc < 0.7 ? lin(vec3(0.6, 0.35, 0.8)) : hc < 0.85 ? lin(vec3(0.95, 0.95, 0.95)) : lin(vec3(0.95, 0.5, 0.65));
  vec3 c = mix(soil, leaf, plant);
  c = mix(c, fl, bloom);
  S s; s.alb = c; s.a = 1.0; s.h = plant * 0.7 + bloom * 0.3; s.r = 0.85; s.ao = 0.5 + 0.5 * plant; s.n = vec3(0.0); return s; }` };

MATGEN[TX.SOIL] = { bump: 4, fn: `S m(vec2 uv){
  vec3 c = lin(vec3(0.34, 0.27, 0.20)) * (0.75 + 0.35 * fbm(uv, vec2(12.0), 4));
  vec3 v = vor(uv, vec2(40.0));
  float stone = smoothstep(0.3, 0.1, v.x) * step(0.8, v.z);
  c = mix(c, lin(vec3(0.55, 0.5, 0.44)), stone);
  vec3 l = vor(uv + 0.4, vec2(28.0));
  float litter = smoothstep(0.25, 0.12, l.x) * step(0.7, l.z);
  c = mix(c, mix(lin(vec3(0.62, 0.36, 0.14)), lin(vec3(0.5, 0.42, 0.18)), h21(vec2(l.z, 1.0))), litter);
  S s; s.alb = c; s.a = 1.0; s.h = fbm(uv, vec2(60.0), 3) * 0.6 + stone * 0.4 + litter * 0.2; s.r = 0.95; s.ao = 0.85; s.n = vec3(0.0); return s; }` };

MATGEN[TX.FABRIC] = { bump: 2, fn: `S m(vec2 uv){
  float tw = sin((uv.x * 2.0 + uv.y) * 6.2832 * 48.0) * 0.5 + 0.5;
  float fibre = fbm(uv, vec2(96.0), 2);
  S s; s.alb = vec3(0.62) * (0.9 + 0.1 * tw) * (0.94 + 0.08 * fibre); s.a = 1.0; s.h = tw * 0.6 + fibre * 0.4;
  s.r = 0.92; s.ao = 1.0; s.n = vec3(0.0); return s; }` };

MATGEN[TX.SEAM] = { bump: 6, fn: `S m(vec2 uv){
  float sx = fract(uv.x * 4.0);
  float rib = smoothstep(0.04, 0.0, abs(sx - 0.5));
  vec3 c = lin(vec3(0.52, 0.54, 0.56)) * (0.88 + 0.14 * fbm(uv, vec2(18.0, 3.0), 3));
  S s; s.alb = c; s.a = 1.0; s.h = rib; s.r = 0.5; s.ao = 1.0; s.n = vec3(0.0); return s; }` };

MATGEN[TX.WILLOW] = { bump: 0, fn: `S m(vec2 uv){
  S s; s.alb = lin(vec3(0.52, 0.62, 0.26)); s.a = 0.0; s.h = 0.0; s.r = 0.6; s.ao = 1.0; s.n = vec3(0.0, 0.0, 1.0);
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    float x0 = (fi + 0.5) / 14.0 + (h21(vec2(fi, 1.0)) - 0.5) * 0.05;
    float len = 0.6 + 0.4 * h21(vec2(fi, 2.0));
    float sway = sin(uv.y * 3.0 + fi) * 0.012;
    float dx = uv.x - x0 - sway;
    if (uv.y < 1.0 - len) continue;
    float seg = uv.y * 70.0 + fi * 3.1;
    float side = mod(floor(seg), 2.0) * 2.0 - 1.0;
    float fs = fract(seg);
    float lx = dx - side * fs * 0.018;
    float w = 0.006 * sin(fs * 3.14159);
    if (abs(lx) < w + 0.0015) {
      float sh = h21(vec2(fi, floor(seg)));
      s.alb = mix(lin(vec3(0.42, 0.55, 0.2)), lin(vec3(0.68, 0.74, 0.34)), sh);
      s.a = 1.0; s.n = normalize(vec3(side * 0.4 + (sh - 0.5) * 0.6, 0.2, 1.0)); s.ao = 0.8 + 0.2 * sh;
    }
  }
  return s; }` };

MATGEN[TX.PAVER] = { bump: 7, fn: `S m(vec2 uv){
  vec4 b = bond(uv, 12.0, 6.0, 1.2, 0.0);
  float e = min(b.x, b.y);
  float j = smoothstep(0.003, 0.007, e);
  vec3 c = mix(lin(vec3(0.60, 0.57, 0.52)), lin(vec3(0.70, 0.64, 0.55)), h21(vec2(b.z, 3.0)));
  c *= 0.86 + 0.22 * b.z;
  c *= 0.92 + 0.12 * fbm(uv, vec2(60.0), 3);
  S s; s.alb = mix(lin(vec3(0.5, 0.47, 0.42)), c, j); s.a = 1.0; s.h = smoothstep(0.003, 0.012, e);
  s.r = 0.85; s.ao = mix(0.5, 1.0, j); s.n = vec3(0.0); return s; }` };

/* a shopfront bay: fascia board, display window, stall riser */
MATGEN[TX.SHOP] = { bump: 8, fn: `S m(vec2 uv){
  float fascia = step(0.8, uv.y), riser = step(uv.y, 0.13);
  float frame = step(uv.x, 0.05) + step(0.95, uv.x) + step(abs(uv.y - 0.8), 0.02) + step(abs(uv.y - 0.13), 0.015);
  float mull = step(abs(uv.x - 0.5), 0.012) * step(uv.y, 0.8) + step(abs(uv.y - 0.64), 0.01) * step(uv.y, 0.8);
  float glass = (1.0 - fascia) * (1.0 - riser) * (1.0 - clamp(frame + mull, 0.0, 1.0));
  float mould = step(abs(uv.y - 0.95), 0.012);
  vec3 paint = vec3(0.86) * (1.0 - mould * 0.3);
  S s; s.alb = mix(paint, vec3(1.0, 0.86, 0.62), glass); s.a = glass;
  s.h = (fascia + riser) * 0.8 + clamp(frame + mull, 0.0, 1.0) + mould * 0.2; s.r = mix(0.5, 0.05, glass); s.ao = 1.0; s.n = vec3(0.0); return s; }` };

MATGEN[TX.NEEDLES] = { bump: 0, fn: `S m(vec2 uv){
  vec2 p = uv - 0.5;
  S s; s.alb = lin(vec3(0.12, 0.22, 0.10)); s.a = 0.0; s.h = 0.0; s.r = 0.75; s.ao = 1.0; s.n = vec3(0.0, 0.0, 1.0);
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float ang = fi * 0.7 + h21(vec2(fi, 2.0)) * 0.6;
    vec2 dir = vec2(cos(ang), sin(ang));
    float along = dot(p, dir), across = dot(p, vec2(-dir.y, dir.x));
    if (along < 0.0 || along > 0.46) continue;
    float n = fract(along * 60.0);
    float spread = 0.035 * (1.0 - along / 0.5);
    if (abs(across) < 0.004 || (abs(abs(across) - n * spread) < 0.0035 && abs(across) < spread)) {
      float sh = h21(vec2(fi, floor(along * 60.0)));
      s.alb = mix(lin(vec3(0.10, 0.20, 0.09)), lin(vec3(0.2, 0.34, 0.14)), sh); s.a = 1.0;
      s.n = normalize(vec3(sign(across) * 0.5, sh - 0.5, 1.0)); s.ao = 0.7 + 0.3 * sh;
    }
  }
  return s; }` };

/* Renders every layer and returns { alb, nrm } texture arrays. */
function buildMaterials(gl, quad, vsFullscreen) {
  const levels = Math.log2(TEX_RES) + 1;
  const alb = makeArrayTex(gl, TEX_RES, TX_COUNT, gl.SRGB8_ALPHA8, levels);
  const nrm = makeArrayTex(gl, TEX_RES, TX_COUNT, gl.RGBA8, levels);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
  gl.viewport(0, 0, TEX_RES, TEX_RES);
  const t0 = performance.now();
  for (let L = 0; L < TX_COUNT; L++) {
    const M = MATGEN[L] || MATGEN[0];
    const src = MATGEN_HEAD + M.fn + `\n#define MAT m\n#define BUMP ${Number(M.bump).toFixed(2)}\n` + MATGEN_MAIN;
    let prog;
    try { prog = makeProgram(gl, vsFullscreen, src, 'material ' + L); }
    catch (e) { console.error('material', L, 'failed'); continue; }
    gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, alb, 0, L);
    gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, nrm, 0, L);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.useProgram(prog);
    gl.bindVertexArray(quad.vao);
    gl.drawElements(gl.TRIANGLES, quad.count, gl.UNSIGNED_SHORT, 0);
    gl.deleteProgram(prog);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fbo);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, alb); gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, nrm); gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
  gl.finish();
  console.info(`[materials] ${TX_COUNT} layers in ${(performance.now() - t0).toFixed(0)} ms`);
  return { alb, nrm };
}
