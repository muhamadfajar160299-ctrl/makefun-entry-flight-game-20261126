// render.js — a small software 3D renderer on canvas 2D: sky, sea, terrain,
// runway, rings, buildings, trees, clouds and the Kestrel-9 itself.

import { terrainHeight, groundColor, TREES, CLOUDS, BUILDINGS, AIRFIELDS, SUN_DIR } from './terrain.js';
import { forwardOf, buildModel } from './plane.js';

export const VIEW_W = 1280;
export const VIEW_H = 720;
const FOV = (68 * Math.PI) / 180;
const FOCAL = (VIEW_H / 2) / Math.tan(FOV / 2);
const NEAR = 0.8;
const HORIZON_RGB = [216, 232, 244];

const MODEL = buildModel();

let cloudSprite = null;
function getCloudSprite() {
  if (cloudSprite) return cloudSprite;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const blob = (x, y, r, a) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${a})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  blob(70, 80, 55, 0.9); blob(120, 66, 62, 0.95); blob(175, 82, 52, 0.9);
  blob(100, 92, 48, 0.8); blob(150, 96, 44, 0.8); blob(205, 95, 34, 0.7);
  cloudSprite = c;
  return c;
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function mix(a, b, t) { return a + (b - a) * t; }
function rgb(c) { return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; }

function shadeFog(color, bright, dist) {
  const f = clamp((dist - 500) / 2400, 0, 0.85);
  return [
    mix(color[0] * bright, HORIZON_RGB[0], f),
    mix(color[1] * bright, HORIZON_RGB[1], f),
    mix(color[2] * bright, HORIZON_RGB[2], f),
  ];
}

// Camera state lives across frames so the chase view glides, never snaps.
export function createCamera() {
  return { pos: { x: 0, y: 30, z: 0 }, fwd: { x: 0, y: 0, z: -1 }, ready: false };
}

function cameraBasis(plane, mode, dt, cam) {
  const fwd = forwardOf(plane);
  const up0 = { x: 0, y: 1, z: 0 };
  // Plane's own up, rolled with the wing.
  const right0 = { x: Math.cos(plane.yaw), y: 0, z: Math.sin(plane.yaw) };
  const upP = { x: -Math.sin(plane.roll) * right0.x, y: Math.cos(plane.roll), z: -Math.sin(plane.roll) * right0.z };
  let target, look, up;
  if (mode === 'cockpit') {
    target = {
      x: plane.pos.x + fwd.x * 2.0 + upP.x * 1.15,
      y: plane.pos.y + fwd.y * 2.0 + upP.y * 1.15,
      z: plane.pos.z + fwd.z * 2.0 + upP.z * 1.15,
    };
    look = { x: plane.pos.x + fwd.x * 60, y: plane.pos.y + fwd.y * 60 + 0.5, z: plane.pos.z + fwd.z * 60 };
    up = upP;
  } else {
    target = {
      x: plane.pos.x - fwd.x * 13.5 + 4.6 * up0.x,
      y: plane.pos.y - fwd.y * 13.5 + 4.6 * up0.y,
      z: plane.pos.z - fwd.z * 13.5 + 4.6 * up0.z,
    };
    look = { x: plane.pos.x + fwd.x * 26, y: plane.pos.y + fwd.y * 26 + 1, z: plane.pos.z + fwd.z * 26 };
    up = up0;
  }
  if (!cam.ready) { cam.pos = { ...target }; cam.ready = true; }
  const k = mode === 'cockpit' ? 1 - Math.exp(-dt * 30) : 1 - Math.exp(-dt * 7);
  cam.pos.x += (target.x - cam.pos.x) * k;
  cam.pos.y += (target.y - cam.pos.y) * k;
  cam.pos.z += (target.z - cam.pos.z) * k;
  let cf = { x: look.x - cam.pos.x, y: look.y - cam.pos.y, z: look.z - cam.pos.z };
  const fl = Math.hypot(cf.x, cf.y, cf.z) || 1;
  cf = { x: cf.x / fl, y: cf.y / fl, z: cf.z / fl };
  // Chase view banks a quarter of the wing's roll, so the horizon tilts gently.
  let cr = { x: -cf.z, y: 0, z: cf.x };
  const rl = Math.hypot(cr.x, cr.y, cr.z) || 1;
  cr = { x: cr.x / rl, y: cr.y / rl, z: cr.z / rl };
  let cu = {
    x: cr.y * cf.z - cr.z * cf.y,
    y: cr.z * cf.x - cr.x * cf.z,
    z: cr.x * cf.y - cr.y * cf.x,
  };
  const bank = mode === 'cockpit' ? plane.roll : plane.roll * 0.25;
  const cb = Math.cos(bank), sb = Math.sin(bank);
  const cr2 = { x: cr.x * cb + cu.x * sb, y: cr.y * cb + cu.y * sb, z: cr.z * cb + cu.z * sb };
  const cu2 = { x: -cr.x * sb + cu.x * cb, y: -cr.y * sb + cu.y * cb, z: -cr.z * sb + cu.z * cb };
  cam.fwd = cf;
  return { pos: cam.pos, fwd: cf, right: cr2, up: cu2 };
}

function makeProjector(cam) {
  return (p) => {
    const dx = p.x - cam.pos.x, dy = p.y - cam.pos.y, dz = p.z - cam.pos.z;
    const zc = dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z;
    const xc = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
    const yc = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
    return { xc, yc, zc };
  };
}

function toScreen(pr) {
  if (pr.zc < NEAR) return null;
  return { x: VIEW_W / 2 + (pr.xc / pr.zc) * FOCAL, y: VIEW_H / 2 - (pr.yc / pr.zc) * FOCAL, d: pr.zc };
}

// Push a world-space triangle into the draw list, projected and shaded.
function pushTri(list, proj, a, b, c, color, bright) {
  const pa = proj(a), pb = proj(b), pc = proj(c);
  if (pa.zc < NEAR && pb.zc < NEAR && pc.zc < NEAR) return;
  const clampPt = (p) => (p.zc < NEAR ? { xc: p.xc, yc: p.yc, zc: NEAR } : p);
  const A = toScreen(clampPt(pa)), B = toScreen(clampPt(pb)), C = toScreen(clampPt(pc));
  if (!A || !B || !C) return;
  // Cull triangles fully off-screen.
  const minX = Math.min(A.x, B.x, C.x), maxX = Math.max(A.x, B.x, C.x);
  const minY = Math.min(A.y, B.y, C.y), maxY = Math.max(A.y, B.y, C.y);
  if (maxX < -40 || minX > VIEW_W + 40 || maxY < -40 || minY > VIEW_H + 40) return;
  const dist = (pa.zc + pb.zc + pc.zc) / 3;
  // Face normal for sun shading.
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
  const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl; ny /= nl; nz /= nl;
  const sun = Math.max(0, nx * SUN_DIR.x + ny * SUN_DIR.y + nz * SUN_DIR.z);
  const b2 = bright * (0.62 + 0.38 * sun);
  list.push({ A, B, C, d: dist, color: shadeFog(color, b2, dist) });
}

export function renderFrame(ctx, S) {
  const { plane, mode, time } = S;
  const cam = cameraBasis(plane, mode, S.dt, S.cam);
  const proj = makeProjector(cam);

  // --- Sky ---
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  sky.addColorStop(0, '#2b74c9');
  sky.addColorStop(0.45, '#7ec3ee');
  sky.addColorStop(0.72, '#cfe8f7');
  sky.addColorStop(1, '#e8f3fa');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // --- Sun ---
  const sunP = toScreen(proj({ x: cam.pos.x + SUN_DIR.x * 4000, y: cam.pos.y + SUN_DIR.y * 4000, z: cam.pos.z + SUN_DIR.z * 4000 }));
  if (sunP && sunP.x > -150 && sunP.x < VIEW_W + 150 && sunP.y > -150 && sunP.y < VIEW_H + 150) {
    const glow = ctx.createRadialGradient(sunP.x, sunP.y, 0, sunP.x, sunP.y, 130);
    glow.addColorStop(0, 'rgba(255,244,200,0.9)');
    glow.addColorStop(0.35, 'rgba(255,226,150,0.35)');
    glow.addColorStop(1, 'rgba(255,226,150,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunP.x - 130, sunP.y - 130, 260, 260);
    ctx.fillStyle = '#fff7d6';
    ctx.beginPath(); ctx.arc(sunP.x, sunP.y, 26, 0, Math.PI * 2); ctx.fill();
  }

  // --- Sea: everything below the horizon line ---
  const seaFar = proj({ x: cam.pos.x + cam.fwd.x * 4000, y: 0, z: cam.pos.z + cam.fwd.z * 4000 });
  let horizonY = VIEW_H * 0.62;
  if (seaFar.zc > NEAR) horizonY = VIEW_H / 2 - (seaFar.yc / seaFar.zc) * FOCAL;
  horizonY = clamp(horizonY, -40, VIEW_H);
  if (horizonY < VIEW_H) {
    const sea = ctx.createLinearGradient(0, horizonY, 0, VIEW_H);
    sea.addColorStop(0, '#8ec6e8');
    sea.addColorStop(0.25, '#4f97c4');
    sea.addColorStop(1, '#1d5f8f');
    ctx.fillStyle = sea;
    ctx.fillRect(0, Math.max(0, horizonY), VIEW_W, VIEW_H - Math.max(0, horizonY));
  }

  const tris = [];

  // --- Terrain mesh around the camera ---
  const CELL = 70, HALF = 22;
  const cx = Math.round(cam.pos.x / CELL) * CELL;
  const cz = Math.round(cam.pos.z / CELL) * CELL;
  const heights = [];
  for (let j = -HALF; j <= HALF; j++) {
    const row = [];
    for (let i = -HALF; i <= HALF; i++) row.push(terrainHeight(cx + i * CELL, cz + j * CELL));
    heights.push(row);
  }
  for (let j = 0; j < HALF * 2; j++) {
    for (let i = 0; i < HALF * 2; i++) {
      const x0 = cx + (i - HALF) * CELL, z0 = cz + (j - HALF) * CELL;
      const x1 = x0 + CELL, z1 = z0 + CELL;
      const h00 = heights[j][i], h10 = heights[j][i + 1], h01 = heights[j + 1][i], h11 = heights[j + 1][i + 1];
      const hc = (h00 + h10 + h01 + h11) / 4;
      const steep = Math.max(Math.abs(h10 - h00), Math.abs(h01 - h00), Math.abs(h11 - h10), Math.abs(h11 - h01)) / CELL;
      const col = groundColor(x0 + CELL / 2, z0 + CELL / 2, hc, steep);
      pushTri(tris, proj, { x: x0, y: h00, z: z0 }, { x: x1, y: h10, z: z0 }, { x: x0, y: h01, z: z1 }, col, 1);
      pushTri(tris, proj, { x: x1, y: h10, z: z0 }, { x: x1, y: h11, z: z1 }, { x: x0, y: h01, z: z1 }, col, 1);
    }
  }

  // --- Runways: asphalt, centreline dashes, threshold bars ---
  for (const f of AIRFIELDS) {
    const h = f.headingDeg * Math.PI / 180;
    const dx = Math.sin(h), dz = -Math.cos(h);
    const rx = dz, rz = -dx; // across axis
    const hw = f.width / 2, hl = f.length / 2;
    const y = f.elevation + 0.4;
    const corner = (a, b) => ({ x: f.x + dx * a + rx * b, y, z: f.z + dz * a + rz * b });
    const ASPH = [58, 63, 70];
    pushTri(tris, proj, corner(-hl, -hw), corner(hl, -hw), corner(-hl, hw), ASPH, 0.95);
    pushTri(tris, proj, corner(hl, -hw), corner(hl, hw), corner(-hl, hw), ASPH, 0.95);
    // Centreline dashes.
    for (let a = -hl + 20; a < hl - 10; a += 40) {
      const y2 = y + 0.35;
      const p = (aa, bb) => ({ x: f.x + dx * aa + rx * bb, y: y2, z: f.z + dz * aa + rz * bb });
      pushTri(tris, proj, p(a, -1.4), p(a + 18, -1.4), p(a, 1.4), [238, 238, 230], 1);
      pushTri(tris, proj, p(a + 18, -1.4), p(a + 18, 1.4), p(a, 1.4), [238, 238, 230], 1);
    }
    // Threshold bars at both ends.
    for (const end of [-1, 1]) {
      const a0 = end * (hl - 8);
      for (let k = -2; k <= 2; k++) {
        const y2 = y + 0.35;
        const p = (aa, bb) => ({ x: f.x + dx * aa + rx * bb, y: y2, z: f.z + dz * aa + rz * bb });
        pushTri(tris, proj, p(a0 - 3, k * 6 - 2), p(a0 + 3, k * 6 - 2), p(a0 - 3, k * 6 + 2), [245, 245, 238], 1);
        pushTri(tris, proj, p(a0 + 3, k * 6 - 2), p(a0 + 3, k * 6 + 2), p(a0 - 3, k * 6 + 2), [245, 245, 238], 1);
      }
    }
  }

  // --- Buildings: hangars and the tower ---
  for (const b of BUILDINGS) {
    const gy = terrainHeight(b.x, b.z);
    const hw = b.w / 2, hd = b.d / 2, top = gy + b.h;
    const c = (x, y, z) => ({ x, y, z });
    const v = [
      c(b.x - hw, gy, b.z - hd), c(b.x + hw, gy, b.z - hd), c(b.x + hw, gy, b.z + hd), c(b.x - hw, gy, b.z + hd),
      c(b.x - hw, top, b.z - hd), c(b.x + hw, top, b.z - hd), c(b.x + hw, top, b.z + hd), c(b.x - hw, top, b.z + hd),
    ];
    const q = (a, b2, c2, d, col) => {
      pushTri(tris, proj, v[a], v[b2], v[c2], col, 1);
      pushTri(tris, proj, v[a], v[c2], v[d], col, 1);
    };
    q(0, 1, 5, 4, b.color); q(1, 2, 6, 5, b.color); q(2, 3, 7, 6, b.color); q(3, 0, 4, 7, b.color);
    q(4, 5, 6, 7, b.roof);
  }

  // --- Trees: camera-facing pine cones, sorted with the world ---
  for (const t of TREES) {
    const dx = t.x - cam.pos.x, dz = t.z - cam.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 1100 * 1100) continue;
    const base = { x: t.x, y: terrainHeight(t.x, t.z), z: t.z };
    const pr = proj(base);
    if (pr.zc < NEAR) continue;
    const w = t.s * 0.55, hgt = t.s * 2.1;
    const lx = base.x - cam.right.x * w, lz = base.z - cam.right.z * w;
    const rx2 = base.x + cam.right.x * w, rz2 = base.z + cam.right.z * w;
    const apex = { x: t.x, y: base.y + hgt, z: t.z };
    const tint = t.tint > 0.5 ? [34, 96, 52] : [46, 116, 60];
    pushTri(tris, proj, { x: lx, y: base.y, z: lz }, { x: rx2, y: base.y, z: rz2 }, apex, tint, 1);
    pushTri(tris, proj, { x: rx2, y: base.y, z: rz2 }, { x: t.x + cam.right.x * w * 0.4, y: base.y, z: t.z + cam.right.z * w * 0.4 }, apex, [28, 80, 44], 1);
  }

  // --- The Kestrel-9 (propeller faces are drawn as a spinning disc instead) ---
  if (mode !== 'cockpit') {
    const fwd = forwardOf(plane);
    // Orthonormal wing basis: level right, level up, then roll about the nose.
    const hLen = Math.hypot(fwd.x, fwd.z) || 1;
    const r0 = { x: -fwd.z / hLen, y: 0, z: fwd.x / hLen };
    const u0 = {
      x: r0.y * fwd.z - r0.z * fwd.y,
      y: r0.z * fwd.x - r0.x * fwd.z,
      z: r0.x * fwd.y - r0.y * fwd.x,
    };
    const cp = Math.cos(plane.roll), sp = Math.sin(plane.roll);
    const right = { x: r0.x * cp - u0.x * sp, y: r0.y * cp - u0.y * sp, z: r0.z * cp - u0.z * sp };
    const up = { x: u0.x * cp - r0.x * sp, y: u0.y * cp - r0.y * sp, z: u0.z * cp - r0.z * sp };
    const toWorld = (v) => ({
      x: plane.pos.x + right.x * v[0] + up.x * v[1] + fwd.x * v[2],
      y: plane.pos.y + right.y * v[0] + up.y * v[1] + fwd.y * v[2],
      z: plane.pos.z + right.z * v[0] + up.z * v[1] + fwd.z * v[2],
    });
    const worldVerts = MODEL.verts.map(toWorld);
    for (const face of MODEL.faces) {
      const vs = face.idx.map((i) => worldVerts[i]);
      // Propeller quads (z >= 6.4 local) become a translucent disc below.
      if (vs.every((p) => p && MODEL.verts[face.idx[0]][2] >= 6.4)) continue;
      if (vs.length === 3) pushTri(tris, proj, vs[0], vs[1], vs[2], face.color, 1);
    }
    if (plane.gearDown) {
      for (const face of MODEL.gearFaces) {
        const vs = face.idx.map((i) => worldVerts[i]);
        pushTri(tris, proj, vs[0], vs[1], vs[2], face.color, 1);
      }
    }
    // Propeller disc: a soft dark blur that reads as a spinning prop.
    const noseP = toWorld([0, 0.05, 6.42]);
    const np = toScreen(proj(noseP));
    if (np) {
      const r = (1.6 * FOCAL) / Math.max(4, np.d);
      const alpha = 0.16 + Math.min(0.2, plane.throttle * 0.2);
      const g = ctx.createRadialGradient(np.x, np.y, 0, np.x, np.y, Math.max(2, r));
      g.addColorStop(0, `rgba(40,40,44,${alpha})`);
      g.addColorStop(0.8, `rgba(40,40,44,${alpha * 0.7})`);
      g.addColorStop(1, 'rgba(40,40,44,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(np.x, np.y, Math.max(2, r), 0, Math.PI * 2); ctx.fill();
    }
  }

  // --- Paint the world, far to near ---
  tris.sort((a, b) => b.d - a.d);
  for (const t of tris) {
    ctx.fillStyle = rgb(t.color);
    ctx.beginPath();
    ctx.moveTo(t.A.x, t.A.y); ctx.lineTo(t.B.x, t.B.y); ctx.lineTo(t.C.x, t.C.y);
    ctx.closePath(); ctx.fill();
  }

  // --- Rings: glowing hoops in the sky ---
  for (let i = 0; i < S.rings.length; i++) {
    const ring = S.rings[i];
    if (ring.done) continue;
    const isNext = i === S.nextRing;
    const pts = [];
    let ok = true;
    for (let k = 0; k <= 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      const p = {
        x: ring.x + ring.u.x * Math.cos(a) * ring.radius + ring.v.x * Math.sin(a) * ring.radius,
        y: ring.y + ring.u.y * Math.cos(a) * ring.radius + ring.v.y * Math.sin(a) * ring.radius,
        z: ring.z + ring.u.z * Math.cos(a) * ring.radius + ring.v.z * Math.sin(a) * ring.radius,
      };
      const s = toScreen(proj(p));
      if (!s) { ok = false; break; }
      pts.push(s);
    }
    if (!ok || pts.length < 4) continue;
    const dist = Math.hypot(ring.x - cam.pos.x, ring.y - cam.pos.y, ring.z - cam.pos.z);
    const base = isNext ? [255, 196, 66] : [140, 210, 255];
    const pulse = isNext ? 0.75 + 0.25 * Math.sin(time * 5) : 0.55;
    ctx.globalAlpha = pulse * clamp(1.4 - dist / 2600, 0.25, 1);
    ctx.strokeStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
    ctx.lineWidth = isNext ? 9 : 5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.closePath(); ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = isNext ? 3 : 1.6;
    ctx.stroke();
    ctx.globalAlpha = 1;
    // A faint disc so the hoop reads even against bright cloud.
    ctx.fillStyle = isNext ? 'rgba(255,196,66,0.07)' : 'rgba(140,210,255,0.05)';
    ctx.fill();
    if (isNext) {
      const c = toScreen(proj({ x: ring.x, y: ring.y + ring.radius + 14, z: ring.z }));
      if (c) {
        ctx.fillStyle = '#ffe9a8';
        ctx.font = '700 17px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`RING ${i + 1}`, c.x, c.y);
      }
    }
  }

  // --- Drop zone: a ring of buoys on the water ---
  if (S.dropZone) {
    const dz = S.dropZone;
    const pts = [];
    for (let k = 0; k <= 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const s = toScreen(proj({ x: dz.x + Math.cos(a) * dz.radius, y: 0.8, z: dz.z + Math.sin(a) * dz.radius }));
      if (s) pts.push(s);
    }
    if (pts.length > 3) {
      ctx.strokeStyle = 'rgba(255,140,60,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const p of pts) ctx.lineTo(p.x, p.y);
      ctx.closePath(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,140,60,0.10)';
      ctx.fill();
      const c = toScreen(proj({ x: dz.x, y: 2, z: dz.z }));
      if (c) {
        ctx.fillStyle = '#ffb347';
        ctx.font = '700 16px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('DROP ZONE', c.x, c.y);
      }
    }
  }

  // --- Supply crates: parachute while falling, a box once down ---
  for (const crate of S.crates || []) {
    const s = toScreen(proj({ x: crate.x, y: crate.y, z: crate.z }));
    if (!s) continue;
    const w = clamp((9 * FOCAL) / Math.max(6, s.d), 3, 60);
    if (!crate.landed) {
      ctx.fillStyle = 'rgba(250,250,245,0.92)';
      ctx.beginPath();
      ctx.moveTo(s.x - w, s.y - w * 0.9); ctx.lineTo(s.x + w, s.y - w * 0.9); ctx.lineTo(s.x, s.y - w * 0.1);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(60,50,40,0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(s.x - w, s.y - w * 0.9); ctx.lineTo(s.x - w * 0.4, s.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s.x + w, s.y - w * 0.9); ctx.lineTo(s.x + w * 0.4, s.y); ctx.stroke();
    }
    ctx.fillStyle = '#9a6b3f';
    ctx.fillRect(s.x - w * 0.45, s.y - w * 0.1, w * 0.9, w * 0.9);
    ctx.strokeStyle = '#5d3f22';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(s.x - w * 0.45, s.y - w * 0.1, w * 0.9, w * 0.9);
  }

  // --- Clouds ---
  const sprite = getCloudSprite();
  for (const cl of CLOUDS) {
    const p = toScreen(proj({ x: cl.x, y: cl.y, z: cl.z }));
    if (!p) continue;
    const d = Math.hypot(cl.x - cam.pos.x, cl.y - cam.pos.y, cl.z - cam.pos.z);
    const w = (cl.s * FOCAL) / d;
    if (w < 8 || w > 900) continue;
    ctx.globalAlpha = clamp(1.15 - d / 5200, 0.35, 0.9);
    for (let k = 0; k < cl.puffs; k++) {
      const off = (k - cl.puffs / 2) * w * 0.42;
      ctx.drawImage(sprite, p.x - w / 2 + off, p.y - w * 0.24, w, w * 0.5);
    }
    ctx.globalAlpha = 1;
  }

  // --- Runway edge lights (amber dots) ---
  ctx.fillStyle = '#ffb347';
  for (const f of AIRFIELDS) {
    const h = f.headingDeg * Math.PI / 180;
    const dx = Math.sin(h), dz = -Math.cos(h);
    const rx = dz, rz = -dx;
    for (let a = -f.length / 2; a <= f.length / 2; a += 45) {
      for (const side of [-1, 1]) {
        const p = toScreen(proj({
          x: f.x + dx * a + rx * side * (f.width / 2 + 3),
          y: f.elevation + 1.2,
          z: f.z + dz * a + rz * side * (f.width / 2 + 3),
        }));
        if (!p) continue;
        const r = clamp(220 / p.d, 1.2, 4);
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // --- Wind streaks at speed ---
  if (plane.speed > 58 && mode !== 'cockpit') {
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const seed = i * 137.5 + time * 900;
      const x = ((seed * 0.37) % 1.3 - 0.15) * VIEW_W;
      const y = ((seed * 0.71) % 1.1 - 0.05) * VIEW_H;
      const len = 26 + (plane.speed - 58) * 0.9;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len * 0.9, y + len * 0.12); ctx.stroke();
    }
  }

  // --- Vignette ---
  const vg = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.55, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.95);
  vg.addColorStop(0, 'rgba(10,20,35,0)');
  vg.addColorStop(1, 'rgba(10,20,35,0.20)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}
