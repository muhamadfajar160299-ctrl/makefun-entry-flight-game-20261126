// missions.js — three sorties with different goals, plus free flight.
// A mission is a small state machine: objectives, rings, crates, score.

import { terrainHeight, AIRFIELDS, runwayDistance } from './terrain.js';

function norm(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function ringBasis(axis) {
  const up = { x: 0, y: 1, z: 0 };
  let u = {
    x: axis.y * up.z - axis.z * up.y,
    y: axis.z * up.x - axis.x * up.z,
    z: axis.x * up.y - axis.y * up.x,
  };
  const l = Math.hypot(u.x, u.y, u.z) || 1;
  u = { x: u.x / l, y: u.y / l, z: u.z / l };
  const v = {
    x: axis.y * u.z - axis.z * u.y,
    y: axis.z * u.x - axis.x * u.z,
    z: axis.x * u.y - axis.y * u.x,
  };
  return { u, v };
}

function makeRings(points, radius) {
  const rings = [];
  let prev = null;
  for (const p of points) {
    const y = terrainHeight(p.x, p.z) + p.alt;
    // Axis points along the flight path, from the previous ring to this one.
    const a = prev
      ? norm({ x: p.x - prev.x, y: y - prev.y, z: p.z - prev.z })
      : { x: 0.9, y: 0, z: -0.2 };
    const { u, v } = ringBasis(a);
    rings.push({ x: p.x, y, z: p.z, radius, axis: a, u, v, done: false });
    prev = { x: p.x, y, z: p.z };
  }
  return rings;
}

function halcyonStart() {
  const f = AIRFIELDS[0];
  const h = f.headingDeg * Math.PI / 180;
  const dx = Math.sin(h), dz = -Math.cos(h);
  return {
    x: f.x - dx * (f.length / 2 - 40), y: f.elevation + 1.6, z: f.z - dz * (f.length / 2 - 40),
    yaw: h, speed: 0, throttle: 0,
  };
}

export const MISSION_DEFS = [
  {
    id: 'ring-run', name: 'Golden Gate Run',
    brief: 'Thread all 8 golden rings over the isles, then bring her home to Halcyon Field. Fast and clean wins the bonus.',
    par: 200,
  },
  {
    id: 'island-hop', name: 'Twin Strip Hop',
    brief: 'Take off from Halcyon Field, put down on Coral Strip across the water, then land back home. Two greasers, no excuses.',
    par: 320,
  },
  {
    id: 'supply-drop', name: 'Harbor Drop',
    brief: 'Three crates for the harbor crew at North Bay. Drop them inside the buoy ring — closer is better — then land at Halcyon.',
    par: 300,
  },
  {
    id: 'free-flight', name: 'Free Flight',
    brief: 'No clock, no cargo, no rings. Just you, the Kestrel and the whole archipelago. Land anywhere to refuel.',
    par: 0,
  },
];

export function createMission(id) {
  const def = MISSION_DEFS.find((m) => m.id === id) || MISSION_DEFS[0];
  const m = {
    id: def.id, name: def.name, brief: def.brief, par: def.par,
    start: halcyonStart(),
    objectives: [], rings: [], dropZone: null,
    crates: [], cratesLeft: 0, score: 0, time: 0,
    ringsPassed: 0, prevPos: null, finished: false, failed: false,
  };
  if (id === 'ring-run') {
    m.rings = makeRings([
      { x: 60, z: 260, alt: 70 }, { x: 520, z: 80, alt: 95 }, { x: 380, z: -420, alt: 110 },
      { x: 180, z: -920, alt: 80 }, { x: -820, z: -520, alt: 55 }, { x: -620, z: 920, alt: 70 },
      { x: 1250, z: 900, alt: 85 }, { x: 2480, z: 940, alt: 80 },
    ], 26);
    m.objectives = [
      { label: 'Fly all 8 golden rings (0/8)', done: false },
      { label: 'Land at Halcyon Field', done: false },
    ];
  } else if (id === 'island-hop') {
    m.objectives = [
      { label: 'Take off from Halcyon Field', done: false },
      { label: 'Land at Coral Strip', done: false },
      { label: 'Land back at Halcyon Field', done: false },
    ];
  } else if (id === 'supply-drop') {
    m.dropZone = { x: 900, z: -680, radius: 60 };
    m.cratesLeft = 3;
    m.objectives = [
      { label: 'Drop 3 crates in the buoy ring (0/3)', done: false },
      { label: 'Land at Halcyon Field', done: false },
    ];
  } else {
    m.objectives = [{ label: 'Take off and enjoy the isles', done: false }];
  }
  return m;
}

function fieldAt(x, z) {
  for (const f of AIRFIELDS) {
    const r = runwayDistance(f, x, z);
    if (Math.abs(r.along) < f.length / 2 + 8 && r.across < f.width / 2 + 6) return f;
  }
  return null;
}

// Advance the mission one frame. Returns { events: [...], scoreDelta }.
export function updateMission(m, plane, planeEvents, dt, actionPressed) {
  const out = { events: [], scoreDelta: 0 };
  if (m.finished || m.failed) return out;
  m.time += dt;

  // --- Ring crossings ---
  if (m.rings.length) {
    const next = m.rings.find((r) => !r.done);
    if (next && m.prevPos) {
      const dPrev = (m.prevPos.x - next.x) * next.axis.x + (m.prevPos.y - next.y) * next.axis.y + (m.prevPos.z - next.z) * next.axis.z;
      const dNow = (plane.pos.x - next.x) * next.axis.x + (plane.pos.y - next.y) * next.axis.y + (plane.pos.z - next.z) * next.axis.z;
      if (dPrev < 0 && dNow >= 0 && plane.speed > 10) {
        const px = plane.pos.x - next.axis.x * dNow, py = plane.pos.y - next.axis.y * dNow, pz = plane.pos.z - next.axis.z * dNow;
        const off = Math.hypot(px - next.x, py - next.y, pz - next.z);
        if (off < next.radius) {
          next.done = true;
          m.ringsPassed++;
          m.score += 100;
          out.scoreDelta += 100;
          out.events.push('ring');
          m.objectives[0].label = `Fly all 8 golden rings (${m.ringsPassed}/8)`;
          if (m.ringsPassed === m.rings.length) {
            m.objectives[0].done = true;
            out.events.push('rings-done');
          }
        }
      }
    }
  }

  // --- Takeoff objective ---
  if (planeEvents.includes('takeoff')) {
    if (m.id === 'island-hop' && !m.objectives[0].done) { m.objectives[0].done = true; out.events.push('objective'); }
    if (m.id === 'free-flight' && !m.objectives[0].done) {
      m.objectives[0].done = true; m.score += 50; out.scoreDelta += 50; out.events.push('objective');
    }
  }

  // --- Landings ---
  if (planeEvents.includes('landed')) {
    const f = fieldAt(plane.pos.x, plane.pos.z);
    const quality = Math.max(0, Math.round(100 - Math.abs(plane.vy) * 22));
    const gain = 150 + quality;
    if (m.id === 'ring-run' && m.ringsPassed === m.rings.length && f && f.id === 'halcyon') {
      m.objectives[1].done = true;
      m.score += gain; out.scoreDelta += gain;
      out.events.push('landed-home');
      finishMission(m, out);
    } else if (m.id === 'island-hop') {
      if (f && f.id === 'coral' && m.objectives[0].done && !m.objectives[1].done) {
        m.objectives[1].done = true; m.score += gain; out.scoreDelta += gain; out.events.push('landed-coral');
      } else if (f && f.id === 'halcyon' && m.objectives[1].done && !m.objectives[2].done) {
        m.objectives[2].done = true; m.score += gain; out.scoreDelta += gain; out.events.push('landed-home');
        finishMission(m, out);
      }
    } else if (m.id === 'supply-drop') {
      if (f && f.id === 'halcyon' && m.objectives[0].done) {
        m.objectives[1].done = true; m.score += gain; out.scoreDelta += gain; out.events.push('landed-home');
        finishMission(m, out);
      }
    }
    // Any landing refuels the Kestrel.
    plane.fuel = 100;
    if (planeEvents.includes('landed')) out.events.push('refuel');
  }

  // --- Supply drops ---
  if (m.dropZone && actionPressed && m.cratesLeft > 0 && plane.airborne) {
    m.cratesLeft--;
    m.crates.push({
      x: plane.pos.x, y: plane.pos.y - 2, z: plane.pos.z,
      vx: 2, vz: 1, vy: plane.vy - 2, age: 0, landed: false, scored: false,
    });
    out.events.push('dropped');
  }
  for (const c of m.crates) {
    if (c.landed) continue;
    c.age += dt;
    // The chute opens after a short fall; then she comes down at 6 m/s.
    const fall = c.age > 0.8 ? -6 : c.vy;
    c.y += fall * dt;
    c.x += c.vx * dt; c.z += c.vz * dt;
    const ground = Math.max(terrainHeight(c.x, c.z), 0);
    if (c.y <= ground + 0.5) {
      c.y = ground + 0.5;
      c.landed = true;
      const dist = Math.hypot(c.x - m.dropZone.x, c.z - m.dropZone.z);
      const pts = Math.max(0, Math.round(150 - dist * 1.8));
      m.score += pts; out.scoreDelta += pts;
      out.events.push(ground < 0.5 ? 'splash' : 'crate-down');
      const done = m.crates.filter((k) => k.landed).length;
      m.objectives[0].label = `Drop 3 crates in the buoy ring (${done}/3)`;
      if (done === 3) { m.objectives[0].done = true; out.events.push('drops-done'); }
    }
  }

  // --- Failure: out of fuel, stopped, nowhere near a strip ---
  if (plane.fuel <= 0 && plane.stopped && !fieldAt(plane.pos.x, plane.pos.z)) {
    m.failed = true;
    out.events.push('failed-fuel');
  }

  m.prevPos = { x: plane.pos.x, y: plane.pos.y, z: plane.pos.z };
  return out;
}

function finishMission(m, out) {
  m.finished = true;
  if (m.par > 0 && m.time < m.par) {
    const bonus = Math.round((m.par - m.time) * 2);
    m.score += bonus;
    out.scoreDelta += bonus;
    out.events.push('time-bonus');
  }
  out.events.push('complete');
}

export function missionScoreText(m) {
  if (m.finished) return `Mission complete — ${m.score} points in ${Math.round(m.time)}s`;
  if (m.failed) return 'Mission failed';
  return `${m.score} points`;
}
