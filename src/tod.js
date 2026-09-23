/* ============================================================
   tod.js — time of day. One clock drives the sun and moon, the sky
   and cloud colours, fog, exposure, street lamps and lit windows.
   Keyframes are in linear RGB; everything between them is blended.
   North is -z, east +x: the sun rises in the east, crosses the south
   (+z) and sets in the west.
   ============================================================ */

const TOD_KEYS = [
  { h: 0.0,  sun: '#34466e', si: 0.55, zen: '#02040b', hor: '#0e1426', warm: '#141628', ambS: '#0e1630', ambG: '#08090e', fog: '#0c1120', fd: 0.0012, exp: 2.5, cl: '#1c2234', cs: '#0a0d16', cloud: 0.40 },
  { h: 4.6,  sun: '#34466e', si: 0.55, zen: '#02040b', hor: '#0e1426', warm: '#141628', ambS: '#0e1630', ambG: '#08090e', fog: '#0c1120', fd: 0.0012, exp: 2.5, cl: '#1c2234', cs: '#0a0d16', cloud: 0.40 },
  { h: 5.5,  sun: '#ff9a6a', si: 1.0,  zen: '#1a2a52', hor: '#6a7494', warm: '#e8948a', ambS: '#3a4768', ambG: '#241e22', fog: '#6e7490', fd: 0.0016, exp: 1.9, cl: '#ffb49a', cs: '#5a5a78', cloud: 0.42 },
  { h: 6.6,  sun: '#ffc08a', si: 2.4,  zen: '#3a6cb8', hor: '#b4c6de', warm: '#f2c69a', ambS: '#6d86b0', ambG: '#4a4238', fog: '#b8c6d8', fd: 0.0014, exp: 1.2, cl: '#fff0e0', cs: '#8e95ad', cloud: 0.44 },
  { h: 9.0,  sun: '#fff0dc', si: 3.1,  zen: '#2d6fd2', hor: '#b6d0ee', warm: '#e6e6de', ambS: '#6c90c8', ambG: '#5a5446', fog: '#b8cfe8', fd: 0.0008, exp: 0.95, cl: '#ffffff', cs: '#a9b6cc', cloud: 0.46 },
  { h: 13.0, sun: '#fff6ea', si: 3.4,  zen: '#2466cf', hor: '#b2cced', warm: '#e2e4de', ambS: '#6c92cc', ambG: '#5c5648', fog: '#b4cce8', fd: 0.0007, exp: 0.88, cl: '#ffffff', cs: '#a4b2c8', cloud: 0.48 },
  { h: 16.4, sun: '#ffe6c2', si: 3.2,  zen: '#2560c4', hor: '#bcd0e8', warm: '#eedcc0', ambS: '#6a8abe', ambG: '#5e5444', fog: '#bccfe4', fd: 0.0008, exp: 0.92, cl: '#fff8ee', cs: '#a0a8bc', cloud: 0.46 },
  { h: 18.0, sun: '#ffc27e', si: 3.0,  zen: '#2352a8', hor: '#c0cde0', warm: '#f6c48a', ambS: '#6478a8', ambG: '#62503a', fog: '#c4cedc', fd: 0.0009, exp: 1.0, cl: '#ffe2bc', cs: '#8f8ea6', cloud: 0.44 },
  { h: 19.2, sun: '#ff8a48', si: 2.4,  zen: '#1a3a80', hor: '#98a8c4', warm: '#ff9858', ambS: '#50608e', ambG: '#503c30', fog: '#a2abc4', fd: 0.0011, exp: 1.2, cl: '#ffb07a', cs: '#6e6480', cloud: 0.42 },
  { h: 19.9, sun: '#ff5a32', si: 1.3,  zen: '#122658', hor: '#646a8a', warm: '#f06a40', ambS: '#384270', ambG: '#34282a', fog: '#6e7090', fd: 0.0013, exp: 1.55, cl: '#ff8c64', cs: '#4a4260', cloud: 0.40 },
  { h: 20.7, sun: '#3a4a78', si: 0.45, zen: '#0a1432', hor: '#2a3050', warm: '#5a3a50', ambS: '#1c2448', ambG: '#141218', fog: '#262c44', fd: 0.0013, exp: 2.0, cl: '#3a3650', cs: '#1c1c2c', cloud: 0.40 },
  { h: 21.8, sun: '#34466e', si: 0.55, zen: '#02040b', hor: '#0e1426', warm: '#141628', ambS: '#0e1630', ambG: '#08090e', fog: '#0c1120', fd: 0.0012, exp: 2.5, cl: '#1c2234', cs: '#0a0d16', cloud: 0.40 },
  { h: 24.0, sun: '#34466e', si: 0.55, zen: '#02040b', hor: '#0e1426', warm: '#141628', ambS: '#0e1630', ambG: '#08090e', fog: '#0c1120', fd: 0.0012, exp: 2.5, cl: '#1c2234', cs: '#0a0d16', cloud: 0.40 },
];
for (const k of TOD_KEYS) for (const f of ['sun', 'zen', 'hor', 'warm', 'ambS', 'ambG', 'fog', 'cl', 'cs']) k[f] = hex2rgb(k[f]).map((c) => Math.pow(c, 2.2));

const SUNRISE = 5.9, SUNSET = 20.0, SUN_MAX_EL = 0.86;   // ~49° at noon

function sunDirection(hour) {
  const t = (hour - SUNRISE) / (SUNSET - SUNRISE);
  const az = Math.PI * t;                          // east → south → west
  const el = Math.sin(clamp(t, -0.2, 1.2) * Math.PI) * SUN_MAX_EL - (t < 0 || t > 1 ? 0.25 : 0);
  const ce = Math.cos(el);
  return [Math.cos(az) * ce, Math.sin(el), Math.sin(az) * ce * 0.85 + 0.12];
}

function todEnv(hour, base = {}) {
  hour = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < TOD_KEYS.length - 2 && TOD_KEYS[i + 1].h <= hour) i++;
  const A = TOD_KEYS[i], B = TOD_KEYS[i + 1];
  const t = smoothstep(clamp((hour - A.h) / Math.max(1e-4, B.h - A.h), 0, 1));
  const mix3 = (f) => [lerp(A[f][0], B[f][0], t), lerp(A[f][1], B[f][1], t), lerp(A[f][2], B[f][2], t)];
  const n = (f) => lerp(A[f], B[f], t);

  let sd = sunDirection(hour);
  const L = Math.hypot(...sd); sd = sd.map((v) => v / L);
  const sunEl = sd[1];
  const night = clamp((0.06 - sunEl) / 0.2, 0, 1);
  const moon = (() => { const v = [-0.35, 0.72, 0.6]; const l = Math.hypot(...v); return v.map((x) => x / l); })();
  // the key light is the sun by day and the moon by night
  const key = night > 0.5 ? moon : sd;
  const keyCol = mix3('sun').map((c) => c * n('si'));
  const glow = mix3('sun').map((c) => c * (1 - night) * 1.4);

  return Object.assign({
    hour, night,
    sunDir: key, sunCol: keyCol, sunGlow: glow, moonDir: moon,
    skyTop: mix3('zen'), skyHorizon: mix3('hor'), skyWarm: mix3('warm'),
    ambSky: mix3('ambS').map((c) => c * 1.15), ambGround: mix3('ambG'),
    fog: mix3('fog'), fogDensity: n('fd'),
    cloudLit: mix3('cl'), cloudShade: mix3('cs'), cloud: n('cloud'),
    litFrac: clamp((night - 0.15) * 0.9, 0, 0.62),
    shadows: true, wind: 1,
    post: { ao: 0.8, rays: 0.22 * (1 - night), exposure: n('exp'), bloomThreshold: 1.1, aoRadius: 0.8, grade: 1 },
  }, base);
}
