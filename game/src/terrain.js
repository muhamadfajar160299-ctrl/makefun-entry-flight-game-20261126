// terrain.js — the Halcyon Isles: procedural heightfield, airfields, trees, clouds.
// Every number here is generated from a fixed seed, so the islands never change.

export const SEA_LEVEL = 0;
export const SUN_DIR = norm3({ x: -0.42, y: 0.72, z: -0.55 }); // direction toward the sun

function norm3(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function fract(v) { return v - Math.floor(v); }

// Deterministic 2D hash: same input, same output, every run.
export function hash2(ix, iz) {
  return fract(Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123);
}

function smooth(t) { return t * t * (3 - 2 * t); }

// Smooth value noise in [-1, 1].
export function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const a = hash2(ix, iz), b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  const u = smooth(fx), v = smooth(fz);
  const m = (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
  return m;
}

export function fbm(x, z) {
  return noise2(x, z) * 0.55 + noise2(x * 2.13 + 7.7, z * 2.13 - 3.1) * 0.3
    + noise2(x * 4.31 - 11.0, z * 4.31 + 5.0) * 0.15;
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

// Two airfields. headingDeg is the runway direction (0 = north, 90 = east).
export const AIRFIELDS = [
  { id: 'halcyon', name: 'Halcyon Field', x: -220, z: 320, headingDeg: 80, length: 480, width: 42, elevation: 16 },
  { id: 'coral', name: 'Coral Strip', x: 2480, z: 940, headingDeg: 15, length: 400, width: 36, elevation: 11 },
];

// Distance from a point to a runway centreline segment.
export function runwayDistance(field, x, z) {
  const h = field.headingDeg * Math.PI / 180;
  const dx = Math.sin(h), dz = -Math.cos(h); // runway axis (east of north)
  const px = x - field.x, pz = z - field.z;
  const along = px * dx + pz * dz;
  const across = Math.abs(px * dz - pz * dx);
  const a = Math.max(-field.length / 2, Math.min(field.length / 2, along));
  const cx = field.x + dx * a, cz = field.z + dz * a;
  return { along, across, dist: Math.hypot(x - cx, z - cz) };
}

export function terrainHeight(x, z) {
  // Main island: rolling hills, one rocky peak, beaches at the shore.
  const d1 = Math.hypot(x, z) / 1500;
  const mask1 = 1 - smooth(clamp01((d1 - 0.45) / 0.55));
  let h1 = (10 + fbm(x * 0.0016, z * 0.0016) * 52) * mask1;
  const peak = Math.exp(-(Math.pow(x - 380, 2) + Math.pow(z + 420, 2)) / (2 * 260 * 260));
  h1 += peak * 135 * mask1;
  // Far islet with the second strip.
  const d2 = Math.hypot(x - 2480, z - 940) / 720;
  const mask2 = 1 - smooth(clamp01((d2 - 0.4) / 0.6));
  const h2 = (7 + fbm(x * 0.0021 + 40, z * 0.0021 - 17) * 26) * mask2;
  let h = Math.max(h1, h2) - 5;
  // Flatten the ground around each runway so the strips sit on level earth.
  for (const f of AIRFIELDS) {
    const r = runwayDistance(f, x, z);
    if (r.dist < 320) {
      const t = 1 - smooth(clamp01((r.dist - 130) / 190));
      h = lerp(h, f.elevation, t);
    }
  }
  return h;
}

export function isWater(x, z) { return terrainHeight(x, z) < SEA_LEVEL; }

// Ground colour at a point, before sun shading. Returns [r, g, b].
export function groundColor(x, z, h, steep) {
  const n = fbm(x * 0.013 + 3.3, z * 0.013 - 8.8);
  const forest = fbm(x * 0.004 + 91, z * 0.004 + 47);
  let c;
  if (h < 1.2) c = [232, 212, 158];                    // sand
  else if (h < 6) c = [168, 196, 118];                 // shore grass
  else if (h < 58) c = forest > 0.22
    ? [58, 118, 66]                                    // pine forest
    : [102, 166, 96];                                  // meadow
  else if (h < 105) c = [148, 138, 104];               // dry highland
  else if (h < 150) c = [128, 120, 112];               // rock
  else c = [236, 239, 246];                            // snow
  if (steep > 0.55 && h > 20) c = [122, 114, 106];     // cliffs show rock
  const v = 1 + n * 0.07;
  return [Math.round(c[0] * v), Math.round(c[1] * v), Math.round(c[2] * v)];
}

// Scattered pines, placed once at load. Kept clear of both runways.
export const TREES = (() => {
  const out = [];
  let s = 1234567;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = 0; i < 1500; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 120 + Math.pow(rnd(), 0.6) * 1350;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = terrainHeight(x, z);
    if (h < 6 || h > 72) continue;
    let clear = true;
    for (const f of AIRFIELDS) if (runwayDistance(f, x, z).dist < 110) { clear = false; break; }
    if (!clear) continue;
    out.push({ x, z, s: 7 + rnd() * 8, tint: rnd() });
  }
  // A small grove on the islet too.
  for (let i = 0; i < 220; i++) {
    const a = rnd() * Math.PI * 2, r = 90 + rnd() * 480;
    const x = 2480 + Math.cos(a) * r, z = 940 + Math.sin(a) * r;
    const h = terrainHeight(x, z);
    if (h < 5 || h > 40) continue;
    let clear = true;
    for (const f of AIRFIELDS) if (runwayDistance(f, x, z).dist < 100) { clear = false; break; }
    if (!clear) continue;
    out.push({ x, z, s: 6 + rnd() * 7, tint: rnd() });
  }
  return out;
})();

// Puffy clouds drifting high over the isles.
export const CLOUDS = (() => {
  const out = [];
  let s = 987654;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, r = rnd() * 2600;
    out.push({
      x: Math.cos(a) * r, z: Math.sin(a) * r,
      y: 300 + rnd() * 220, s: 70 + rnd() * 130,
      puffs: 3 + Math.floor(rnd() * 3), seed: rnd() * 10,
    });
  }
  return out;
})();

// A few hangars and a tower beside Halcyon Field, as simple boxes.
export const BUILDINGS = [
  { x: -330, z: 180, w: 46, d: 34, h: 18, color: [196, 74, 66], roof: [140, 52, 48] },
  { x: -330, z: 240, w: 40, d: 30, h: 15, color: [84, 120, 168], roof: [60, 88, 128] },
  { x: -300, z: 470, w: 26, d: 26, h: 52, color: [214, 208, 192], roof: [90, 120, 150] },
];
