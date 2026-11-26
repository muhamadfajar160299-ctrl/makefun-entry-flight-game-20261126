// plane.js — the Kestrel-9: a built-from-polygons sport plane, and its flight model.
// Local axes: +Z nose, +X right wing, +Y up. Yaw 0 faces north (-Z world).

import { terrainHeight, runwayDistance, AIRFIELDS } from './terrain.js';

export const KNOTS = 1.94384;
export const FEET = 3.28084;
export const STALL_SPEED = 24;      // m/s, below this the wing quits
export const MAX_SPEED = 86;        // m/s at full throttle, level

// ---- The aircraft, built from polygons (no borrowed mesh) ----
export function buildModel() {
  const verts = [];
  const faces = [];
  const v = (x, y, z) => { verts.push([x, y, z]); return verts.length - 1; };
  const quad = (a, b, c, d, color) => { faces.push({ idx: [a, b, c], color }); faces.push({ idx: [a, c, d], color }); };

  // Fuselage: a tapered tube of 8-sided rings, nose to tail.
  const rings = [
    { z: 6.1, r: 0.06, y: 0.05 }, { z: 5.5, r: 0.55, y: 0.02 }, { z: 4.2, r: 0.88, y: 0.0 },
    { z: 2.0, r: 1.0, y: 0.0 }, { z: -0.6, r: 0.95, y: 0.05 }, { z: -3.2, r: 0.72, y: 0.12 },
    { z: -5.2, r: 0.42, y: 0.22 }, { z: -6.0, r: 0.10, y: 0.3 },
  ];
  const SIDES = 8;
  const ringIdx = rings.map((rg) => {
    const row = [];
    for (let i = 0; i < SIDES; i++) {
      const a = (i / SIDES) * Math.PI * 2;
      row.push(v(Math.cos(a) * rg.r * 0.92, rg.y + Math.sin(a) * rg.r, rg.z));
    }
    return row;
  });
  const BELLY = [226, 82, 58];      // coral orange
  const BACK = [255, 201, 60];      // sun yellow
  const CREAM = [250, 244, 230];
  for (let s = 0; s < rings.length - 1; s++) {
    for (let i = 0; i < SIDES; i++) {
      const j = (i + 1) % SIDES;
      const top = i <= 1 || i >= 6; // upper ring points wear yellow
      quad(ringIdx[s][i], ringIdx[s + 1][i], ringIdx[s + 1][j], ringIdx[s][j], top ? BACK : BELLY);
    }
  }
  // Nose cap and tail cap.
  const nose = v(0, 0.05, 6.35);
  for (let i = 0; i < SIDES; i++) faces.push({ idx: [nose, ringIdx[0][(i + 1) % SIDES], ringIdx[0][i]], color: [40, 40, 44] });
  const tail = v(0, 0.3, -6.15);
  for (let i = 0; i < SIDES; i++) faces.push({ idx: [tail, ringIdx[ringIdx.length - 1][i], ringIdx[ringIdx.length - 1][(i + 1) % SIDES]], color: BELLY });

  // Canopy: a tinted glasshouse over the cockpit.
  const c = (x, y, z) => v(x, y, z);
  const c0 = c(-0.62, 0.62, 4.1), c1 = c(0.62, 0.62, 4.1), c2 = c(0.55, 1.05, 3.1), c3 = c(-0.55, 1.05, 3.1);
  const c4 = c(-0.6, 0.72, 1.9), c5 = c(0.6, 0.72, 1.9), c6 = c(0.5, 1.02, 2.2), c7 = c(-0.5, 1.02, 2.2);
  const GLASS = [64, 164, 208];
  quad(c0, c1, c2, c3, GLASS); quad(c4, c5, c6, c7, GLASS);
  quad(c0, c3, c7, c4, GLASS); quad(c1, c5, c6, c2, GLASS);
  quad(c3, c2, c6, c7, [38, 110, 150]);

  // Main wing: tapered, slight dihedral, cream with teal tips.
  const wing = (side) => {
    const s = side;
    const rl = v(0, 0.05, 1.9), rt = v(0, 0.05, -0.5);           // root leading / trailing
    const rl2 = v(0, 0.22, 1.9), rt2 = v(0, 0.22, -0.5);
    const tl = v(5.6 * s, 0.55, 1.35), tt = v(5.6 * s, 0.55, 0.15);
    const tl2 = v(5.6 * s, 0.72, 1.35), tt2 = v(5.6 * s, 0.72, 0.15);
    quad(rl, tl, tl2, rl2, CREAM); quad(rt2, tt2, tt, rt, CREAM);
    quad(rl2, tl2, tt2, rt2, CREAM); quad(rt, tt, tl, rl, [214, 205, 188]);
    // Teal tip cap.
    quad(tl, tt, tt2, tl2, [18, 148, 140]);
  };
  wing(1); wing(-1);

  // Tailplane and fin.
  const t = (x, y, z) => v(x, y, z);
  const h0 = t(-0.3, 0.32, -4.6), h1 = t(0.3, 0.32, -4.6), h2 = t(2.1, 0.42, -5.5), h3 = t(-2.1, 0.42, -5.5);
  const h4 = t(-0.3, 0.46, -4.6), h5 = t(0.3, 0.46, -4.6), h6 = t(2.1, 0.56, -5.5), h7 = t(-2.1, 0.56, -5.5);
  quad(h0, h1, h5, h4, CREAM); quad(h4, h5, h6, h7, CREAM);
  quad(h1, h2, h6, h5, CREAM); quad(h3, h7, h4, h0, CREAM);
  const f0 = t(-0.09, 0.3, -4.4), f1 = t(0.09, 0.3, -4.4), f2 = t(0.09, 2.3, -5.9), f3 = t(-0.09, 2.3, -5.9);
  const f4 = t(-0.09, 0.3, -6.1), f5 = t(0.09, 0.3, -6.1);
  quad(f0, f1, f2, f3, BELLY); quad(f1, f5, f2, f2, BELLY); quad(f4, f0, f3, f3, BELLY);

  // Propeller: two thin blades on the nose (spun by the renderer).
  const p = (x, y, z) => v(x, y, z);
  const p0 = p(-0.09, -1.5, 6.42), p1 = p(0.09, -1.5, 6.42), p2 = p(0.09, 1.5, 6.42), p3 = p(-0.09, 1.5, 6.42);
  quad(p0, p1, p2, p3, [30, 30, 34]);
  const s0 = p(-1.5, -0.09, 6.42), s1 = p(1.5, -0.09, 6.42), s2 = p(1.5, 0.09, 6.42), s3 = p(-1.5, 0.09, 6.42);
  quad(s0, s1, s2, s3, [30, 30, 34]);
  const spin = v(0, 0.05, 6.5);
  faces.push({ idx: [spin, p1, p0], color: [220, 60, 50] });

  // Landing gear: three small wheels, shown only when the gear is down.
  const gear = [];
  const wheel = (x, y, z) => {
    const a = v(x - 0.22, y, z), b = v(x + 0.22, y, z), cc = v(x, y - 0.3, z), d = v(x, y + 0.3, z);
    gear.push({ idx: [a, b, cc], color: [24, 24, 28] });
    gear.push({ idx: [a, cc, d], color: [24, 24, 28] });
    gear.push({ idx: [b, d, cc], color: [24, 24, 28] });
    const strut = v(x, y + 0.4, z);
    gear.push({ idx: [a, b, strut], color: [90, 90, 96] });
  };
  wheel(-0.85, -0.9, 2.6); wheel(0.85, -0.9, 2.6); wheel(0, -0.9, -3.4);

  return { verts, faces, gearFaces: gear };
}

// ---- Flight model ----
export function createPlane() {
  return {
    pos: { x: -220, y: 18, z: 320 },
    yaw: (80 * Math.PI) / 180, pitch: 0, roll: 0,
    speed: 0, throttle: 0, fuel: 100, damage: 0,
    gearDown: true, airborne: false, vy: 0,
    propAngle: 0, crashed: false, landed: false, stopped: false,
    headingDeg: 80,
  };
}

export function forwardOf(p) {
  const cp = Math.cos(p.pitch);
  return { x: Math.sin(p.yaw) * cp, y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * cp };
}

export function resetPlane(p, spot) {
  p.pos = { x: spot.x, y: spot.y, z: spot.z };
  p.yaw = spot.yaw; p.pitch = 0; p.roll = 0;
  p.speed = spot.speed || 0; p.throttle = spot.throttle || 0;
  p.fuel = 100; p.damage = 0; p.gearDown = true;
  p.airborne = false; p.vy = 0; p.crashed = false; p.landed = false; p.stopped = false;
  p.headingDeg = ((spot.yaw * 180) / Math.PI % 360 + 360) % 360;
}

// ctl: { pitch: -1..1 (pull up positive), roll: -1..1 (right positive),
//        rudder: -1..1, throttle: -1..1 delta, throttleSet: null|0..1 }
// Returns events: [] | ['takeoff'|'landed'|'crash'|'fuel-empty'|'stall'...]
export function stepPlane(p, dt, ctl) {
  const events = [];
  if (p.crashed) return events;
  if (ctl.throttleSet !== null && ctl.throttleSet !== undefined) {
    p.throttle = Math.max(0, Math.min(1, ctl.throttleSet));
  } else if (ctl.throttle) {
    p.throttle = Math.max(0, Math.min(1, p.throttle + ctl.throttle * dt * 0.55));
  }
  if (p.fuel <= 0) {
    p.throttle = Math.max(0, p.throttle - dt * 0.8);
    if (p.throttle === 0) events.push('fuel-empty');
  }

  const speedFactor = Math.max(0.3, Math.min(1, p.speed / 45));
  // Roll and pitch chase their targets; authority grows with speed.
  const targetRoll = ctl.roll * 0.96;
  const rollRate = 2.4 * (0.5 + 0.5 * speedFactor);
  p.roll += Math.max(-rollRate * dt, Math.min(rollRate * dt, targetRoll - p.roll));
  const targetPitch = ctl.pitch * 0.5;
  const pitchRate = 1.5 * (0.45 + 0.55 * speedFactor);
  p.pitch += Math.max(-pitchRate * dt, Math.min(pitchRate * dt, targetPitch - p.pitch));

  // Banked turn: the wing pulls the nose around (positive roll banks right).
  const yawRate = Math.sin(p.roll) * 0.46 * (0.35 + 0.65 * Math.min(1, p.speed / 55))
    + ctl.rudder * 0.22 * speedFactor;
  p.yaw += yawRate * dt;
  p.yaw = ((p.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

  // Speed: thrust fights drag and gravity on the climb.
  const drag = 0.55 + (p.gearDown ? 0.06 : 0);
  const accel = p.throttle * 46 - drag * p.speed - 9.8 * Math.sin(p.pitch) * 0.85;
  p.speed = Math.max(0, p.speed + accel * dt);
  if (p.speed > MAX_SPEED) p.speed = MAX_SPEED;

  // Stall: below flying speed the nose drops and the plane sinks.
  let sink = 0;
  if (p.speed < STALL_SPEED && p.airborne) {
    sink = (STALL_SPEED - p.speed) * 0.55;
    p.pitch += (-0.18 - p.pitch) * Math.min(1, dt * 0.9);
    if (p.speed < STALL_SPEED - 6) events.push('stall');
  }

  const fwd = forwardOf(p);
  p.vy = p.speed * fwd.y - sink;
  p.pos.x += fwd.x * p.speed * dt;
  p.pos.y += p.vy * dt;
  p.pos.z += fwd.z * p.speed * dt;
  p.propAngle += (2 + p.throttle * 40 + p.speed * 0.4) * dt;

  // Soft world edge: the sea goes on, but the rally stays in the isles.
  const edge = 3400;
  if (Math.abs(p.pos.x) > edge || Math.abs(p.pos.z) > edge) {
    p.pos.x = Math.max(-edge, Math.min(edge, p.pos.x));
    p.pos.z = Math.max(-edge, Math.min(edge, p.pos.z));
    events.push('edge');
  }

  // Ground contact.
  const ground = terrainHeight(p.pos.x, p.pos.z);
  const onWater = ground < 0;
  let field = null, onRunway = false;
  if (!onWater) {
    for (const f of AIRFIELDS) {
      const r = runwayDistance(f, p.pos.x, p.pos.z);
      if (Math.abs(r.along) < f.length / 2 + 8 && r.across < f.width / 2 + 6) { field = f; onRunway = true; break; }
    }
  }
  const clearance = p.pos.y - Math.max(ground, 0) - 1.6;
  if (clearance <= 0.05) {
    p.pos.y = Math.max(ground, 0) + 1.6;
    const wasAirborne = p.airborne;
    const gentle = Math.abs(p.vy) < 3.5 && Math.abs(p.roll) < 0.32 && p.pitch < 0.18;
    const rollDecel = (6 + p.throttle * -2) * dt;
    if (onRunway && gentle && p.speed < 58) {
      // A normal touchdown, or rolling along the strip.
      if (wasAirborne && !p.landed) {
        events.push('landed'); p.landed = true;
        if (!p.gearDown) { p.damage = Math.min(100, p.damage + 30); events.push('belly'); }
      }
      p.airborne = false;
      p.speed = Math.max(0, p.speed - rollDecel);
      if (p.speed < 1.5 && p.throttle < 0.08 && !p.stopped) { p.stopped = true; events.push('stopped'); }
    } else if (onRunway && wasAirborne && Math.abs(p.vy) < 6 && p.speed < 70) {
      // Hard touchdown: it counts, but it hurts.
      p.damage = Math.min(100, p.damage + 22);
      events.push('hard-landing');
      if (!p.landed) { events.push('landed'); p.landed = true; }
      p.airborne = false;
      p.speed = Math.max(0, p.speed - 10 * dt);
      if (p.damage >= 100) { p.crashed = true; events.push('crash'); }
    } else if (onRunway && !wasAirborne) {
      // Taxiing on the strip: roll, no damage, no drama.
      p.airborne = false;
      p.speed = Math.max(0, p.speed - rollDecel);
      if (p.speed < 1.5 && p.throttle < 0.08 && !p.stopped) { p.stopped = true; events.push('stopped'); }
    } else {
      p.crashed = true; events.push('crash');
    }
  } else if (!p.airborne) {
    // On the ground but not touching: either lifting off, or rolling off a
    // slope. A plane that is not climbing settles back onto the ground.
    if (p.speed > STALL_SPEED + 2 && p.pos.y > ground + 6) {
      p.airborne = true; p.landed = false; p.stopped = false; events.push('takeoff');
    } else if (p.vy <= 0.5) {
      p.pos.y = Math.max(ground, 0) + 1.6;
    }
  }

  // Fuel burn: throttle is thirsty, idling sips.
  p.fuel = Math.max(0, p.fuel - (0.1 + p.throttle * 0.34) * dt);
  if (p.damage >= 100 && !p.crashed) { p.crashed = true; events.push('crash'); }
  p.headingDeg = ((p.yaw * 180) / Math.PI % 360 + 360) % 360;
  return events;
}
