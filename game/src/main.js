// main.js — Skylane Archipelago: game loop, states, menu, and screenshot staging.

import { createPlane, resetPlane, stepPlane } from './plane.js';
import { terrainHeight, AIRFIELDS } from './terrain.js';
import { renderFrame, createCamera } from './render.js';
import { drawHud } from './hud.js';
import { createMission, updateMission, MISSION_DEFS } from './missions.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const menuEl = document.getElementById('menu');
const missionsEl = document.getElementById('missions');
const bannerEl = document.getElementById('banner');
const bannerText = document.getElementById('bannerText');
const bannerSub = document.getElementById('bannerSub');
const bannerBtn = document.getElementById('bannerBtn');
const toastEl = document.getElementById('toast');

const input = createInput(canvas);
const audio = createAudio();

let state = 'menu';           // menu | flying | paused | complete | crashed | failed
let plane = createPlane();
let mission = createMission('ring-run');
let cam = createCamera();
let mode = 'chase';           // chase | cockpit
let time = 0;
let last = 0;
let frames = 0;
let centerText = '';
let centerTextUntil = 0;
let shotAuto = null; // 'land' while a ?shot=complete staging flies itself home.
let toastTimer = null;
let stallWarnedAt = 0;
let fuelWarnedAt = 0;

function best(id) {
  try { return Number(localStorage.getItem(`skylane-best-${id}`) || 0); } catch (e) { return 0; }
}
function saveBest(id, score) {
  try {
    if (score > best(id)) localStorage.setItem(`skylane-best-${id}`, String(score));
  } catch (e) { /* storage is a bonus, never a blocker */ }
}

function buildMenu() {
  missionsEl.innerHTML = '';
  MISSION_DEFS.forEach((def, i) => {
    const b = document.createElement('button');
    b.className = 'mission';
    b.innerHTML = `<span class="key">${i + 1}</span><span><b>${def.name}</b><span>${def.brief}</span></span>`
      + (best(def.id) ? `<span class="best">BEST<br>${best(def.id)}</span>` : '');
    b.addEventListener('click', () => startMission(def.id));
    missionsEl.appendChild(b);
  });
}

function showToast(s, ms = 2600) {
  toastEl.textContent = s;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

function showBanner(title, sub, btn) {
  bannerText.textContent = title;
  bannerSub.innerHTML = sub;
  bannerBtn.textContent = btn;
  bannerEl.classList.remove('hidden');
}

function hideBanner() { bannerEl.classList.add('hidden'); }

function startMission(id) {
  audio.unlock();
  audio.click();
  mission = createMission(id);
  plane = createPlane();
  resetPlane(plane, mission.start);
  cam = createCamera();
  mode = 'chase';
  state = 'flying';
  centerText = '';
  shotAuto = null;
  menuEl.classList.add('hidden');
  hideBanner();
  showToast(`${mission.name} — ${mission.brief}`, 4200);
}

function backToMenu() {
  state = 'menu';
  mission = createMission('ring-run');
  plane = createPlane();
  resetPlane(plane, mission.start);
  cam = createCamera();
  buildMenu();
  menuEl.classList.remove('hidden');
  hideBanner();
}

function endMission(kind, detail) {
  if (kind === 'complete') {
    state = 'complete';
    saveBest(mission.id, mission.score);
    showBanner('MISSION COMPLETE',
      `${mission.name} — <b>${mission.score} points</b> in ${Math.round(mission.time)}s.<br>Best on this machine: ${best(mission.id)}.<br><span style="font-size:13px">Enter — fly again · Esc — menu</span>`,
      'Fly again');
  } else if (kind === 'crashed') {
    state = 'crashed';
    showBanner('CRASHED',
      `${detail}<br>Score kept: <b>${mission.score} points</b>.<br><span style="font-size:13px">Enter — fly again · Esc — menu</span>`,
      'Fly again');
  } else {
    state = 'failed';
    showBanner('MISSION FAILED',
      `${detail}<br>Score kept: <b>${mission.score} points</b>.<br><span style="font-size:13px">Enter — fly again · Esc — menu</span>`,
      'Fly again');
  }
}

bannerBtn.addEventListener('click', () => {
  if (state === 'complete' || state === 'crashed' || state === 'failed') startMission(mission.id);
});

function handleEvents(planeEvents, missionOut) {
  for (const e of planeEvents) {
    if (e === 'takeoff') { showToast('Airborne — gear up with G when you are ready'); audio.beep(); }
    else if (e === 'landed') { audio.thud(); showToast('Touchdown — nice and easy'); }
    else if (e === 'hard-landing') { audio.thud(); showToast('Hard landing — the Kestrel felt that'); }
    else if (e === 'belly') { showToast('Belly landing! Gear was up — +30 damage'); }
    else if (e === 'stopped') { showToast('Full stop. Throttle up to go again, or land to refuel.'); }
    else if (e === 'crash') { audio.crash(); endMission('crashed', 'The Kestrel met the ground the hard way.'); return; }
    else if (e === 'edge') { showToast('Edge of the rally area — turn back'); }
    else if (e === 'stall') {
      if (time - stallWarnedAt > 2.5) { audio.warn(); stallWarnedAt = time; }
    }
    else if (e === 'fuel-empty') {
      if (time - fuelWarnedAt > 3) { audio.warn(); fuelWarnedAt = time; }
    }
  }
  for (const e of missionOut.events) {
    if (e === 'ring') {
      audio.chime();
      centerText = `RING ${mission.ringsPassed} / ${mission.rings.length}  +100`;
      centerTextUntil = time + 1.4;
    } else if (e === 'rings-done') {
      showToast('All rings! Bring her home to Halcyon Field for the landing bonus');
    } else if (e === 'landed-coral') {
      showToast('Down safe on Coral Strip — now fly her home');
    } else if (e === 'landed-home') {
      showToast('Home safe — beautiful flying');
    } else if (e === 'dropped') {
      audio.drop();
      showToast(`Crate away — ${mission.cratesLeft} left`);
    } else if (e === 'splash') {
      audio.splash();
      showToast('Splashdown in the bay');
    } else if (e === 'crate-down') {
      audio.thud();
      showToast('Crate down');
    } else if (e === 'drops-done') {
      showToast('All crates delivered — land at Halcyon Field to finish');
    } else if (e === 'complete') {
      endMission('complete');
      return;
    } else if (e === 'failed-fuel') {
      endMission('failed', 'Out of fuel, far from any strip.');
      return;
    } else if (e === 'objective') {
      audio.beep();
    } else if (e === 'time-bonus') {
      showToast('Time bonus — under par!');
    }
  }
}

function tick(t) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
  last = t;
  time += dt;
  frames++;

  if (state === 'menu') {
    for (let i = 0; i < MISSION_DEFS.length; i++) {
      if (input.wasPressed(`Digit${i + 1}`) || input.wasPressed(`Numpad${i + 1}`)) startMission(MISSION_DEFS[i].id);
    }
    // Slow orbit around the parked Kestrel for a living menu backdrop.
    plane.yaw += dt * 0.12;
    plane.headingDeg = ((plane.yaw * 180) / Math.PI % 360 + 360) % 360;
  } else if (state === 'flying') {
    if (input.wasPressed('KeyC')) { mode = mode === 'chase' ? 'cockpit' : 'chase'; showToast(mode === 'cockpit' ? 'Cockpit view' : 'Chase view'); }
    if (input.wasPressed('KeyG')) {
      plane.gearDown = !plane.gearDown;
      showToast(plane.gearDown ? 'Gear down' : 'Gear up');
      audio.click();
    }
    if (input.wasPressed('KeyP')) { state = 'paused'; showToast('Paused — P to resume'); }
    if (input.wasPressed('KeyM')) {
      const on = audio.toggleMusic();
      showToast(on ? 'Music on' : 'Music off');
    }
    if (input.wasPressed('KeyN')) audio.setMuted(!audio.muted);
    const action = input.wasPressed('Space');
    const ctl = input.read(dt);
    if (ctl.wheel) plane.throttle = Math.max(0, Math.min(1, plane.throttle + ctl.wheel));
    if (shotAuto === 'land') {
      // Staged-shot autopilot (only ever set by ?shot=complete): ride the
      // glide slope into Halcyon so the real landing finishes the run.
      const f = AIRFIELDS[0];
      const h = f.headingDeg * Math.PI / 180;
      const dx = Math.sin(h), dz = -Math.cos(h);
      const along = (plane.pos.x - f.x) * dx + (plane.pos.z - f.z) * dz;
      const across = (plane.pos.x - f.x) * dz - (plane.pos.z - f.z) * dx;
      const threshold = -f.length / 2;
      const wantYaw = h + Math.atan2(across, 400);
      let err = wantYaw - plane.yaw;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;
      const slopeY = f.elevation + Math.max(4, (along - threshold) * -0.06 + 4);
      // NOTE: stepPlane halves ctl.pitch into targetPitch — pass the same
      // value the logic tests use, do NOT divide by 0.5 (that doubles the
      // pull-up and the plane hovers ~2 m above the runway forever).
      ctl.pitch = Math.max(-1, Math.min(1, (slopeY - plane.pos.y) * 0.04));
      ctl.roll = Math.max(-1, Math.min(1, (Math.max(-0.6, Math.min(0.6, err * 1.5))) / 0.96));
      ctl.rudder = 0;
      ctl.throttle = 0;
      plane.throttle = along > threshold - 30 ? 0.3 : 0.45;
    }
    const planeEvents = stepPlane(plane, dt, {
      pitch: Math.max(-1, Math.min(1, ctl.pitch)),
      roll: Math.max(-1, Math.min(1, ctl.roll)),
      rudder: ctl.rudder,
      throttle: ctl.throttle,
      throttleSet: null,
    });
    const missionOut = updateMission(mission, plane, planeEvents, dt, action);
    audio.update(plane.throttle, plane.speed, plane.airborne);
    handleEvents(planeEvents, missionOut);
  } else if (state === 'paused') {
    if (input.wasPressed('KeyP') || input.wasPressed('Escape')) { state = 'flying'; showToast('Resumed'); }
  } else {
    // complete / crashed / failed: Enter restarts, Esc returns to the menu.
    if (input.wasPressed('Enter')) startMission(mission.id);
    if (input.wasPressed('Escape')) backToMenu();
  }

  if (time < centerTextUntil) { /* keep */ } else centerText = '';
  const groundH = terrainHeight(plane.pos.x, plane.pos.z);
  const nextRing = mission.rings.findIndex((r) => !r.done);
  // Where the mission wants you next, for the HUD target pointer.
  let target = null;
  if (mission.id === 'ring-run') {
    if (nextRing >= 0) {
      const r = mission.rings[nextRing];
      target = { x: r.x, y: r.y, z: r.z, label: `RING ${nextRing + 1}` };
    } else {
      target = { x: AIRFIELDS[0].x, y: AIRFIELDS[0].elevation, z: AIRFIELDS[0].z, label: 'HALCYON FIELD' };
    }
  } else if (mission.id === 'island-hop') {
    const f = !mission.objectives[1].done ? AIRFIELDS[1] : AIRFIELDS[0];
    target = { x: f.x, y: f.elevation, z: f.z, label: f.name.toUpperCase() };
  } else if (mission.id === 'supply-drop') {
    if (!mission.objectives[0].done && mission.dropZone) {
      target = { x: mission.dropZone.x, y: 0, z: mission.dropZone.z, label: 'DROP ZONE' };
    } else {
      target = { x: AIRFIELDS[0].x, y: AIRFIELDS[0].elevation, z: AIRFIELDS[0].z, label: 'HALCYON FIELD' };
    }
  }
  renderFrame(ctx, {
    plane, mode, time, dt, cam,
    rings: mission.rings, nextRing: nextRing < 0 ? mission.rings.length : nextRing,
    crates: mission.crates, dropZone: mission.dropZone,
  });
  const mm = Math.floor(mission.time / 60);
  const ss = String(Math.floor(mission.time % 60)).padStart(2, '0');
  drawHud(ctx, {
    plane, mission, mode, state, time, groundH,
    score: mission.score,
    timerText: `${mm}:${ss}`,
    centerText: state === 'paused' ? 'PAUSED' : centerText,
    target,
  });
}

// ---- Screenshot staging: ?shot=cover|cockpit|landing|complete ----
// These place the Kestrel with the game's own state, then let the real
// simulation run, so every screenshot is a true render of the game.
function stageShot(kind) {
  if (kind === 'cover' || kind === 'cockpit') {
    startMission('ring-run');
    mission.rings[0].done = true;
    mission.rings[1].done = true;
    mission.ringsPassed = 2;
    mission.score = 200;
    mission.time = 64;
    mission.objectives[0].label = 'Fly all 8 golden rings (2/8)';
    const r3 = mission.rings[2];
    const r2 = mission.rings[1];
    const d = { x: r3.x - r2.x, y: r3.y - r2.y, z: r3.z - r2.z };
    const dl = Math.hypot(d.x, d.y, d.z);
    const back = 130 / dl;
    plane.pos = { x: r3.x - d.x * back, y: r3.y - d.y * back - 6, z: r3.z - d.z * back };
    plane.yaw = Math.atan2(d.x, -d.z);
    plane.pitch = 0.06;
    plane.roll = 0.28;
    plane.speed = 58;
    plane.throttle = 0.78;
    plane.fuel = 82;
    plane.airborne = true;
    plane.headingDeg = ((plane.yaw * 180) / Math.PI % 360 + 360) % 360;
    if (kind === 'cockpit') mode = 'cockpit';
    mission.prevPos = { x: plane.pos.x - d.x * 0.01, y: plane.pos.y, z: plane.pos.z - d.z * 0.01 };
  } else if (kind === 'landing') {
    startMission('island-hop');
    mission.objectives[0].done = true;
    mission.score = 150;
    mission.time = 148;
    const f = AIRFIELDS[1];
    const h = f.headingDeg * Math.PI / 180;
    const dx = Math.sin(h), dz = -Math.cos(h);
    plane.pos = { x: f.x - dx * 620, y: f.elevation + 58, z: f.z - dz * 620 };
    plane.yaw = h;
    plane.pitch = -0.05;
    plane.roll = 0;
    plane.speed = 44;
    plane.throttle = 0.34;
    plane.fuel = 61;
    plane.gearDown = true;
    plane.airborne = true;
    plane.headingDeg = f.headingDeg;
    mission.prevPos = { ...plane.pos };
  } else if (kind === 'complete') {
    startMission('ring-run');
    mission.rings.forEach((r) => { r.done = true; });
    mission.ringsPassed = mission.rings.length;
    mission.objectives[0].done = true;
    mission.objectives[0].label = 'Fly all 8 golden rings (8/8)';
    mission.score = 800;
    mission.time = 186;
    // Set her down gently on Halcyon and let the real landing finish the run.
    const f = AIRFIELDS[0];
    const h = f.headingDeg * Math.PI / 180;
    const dx = Math.sin(h), dz = -Math.cos(h);
    plane.pos = { x: f.x - dx * 300, y: f.elevation + 12, z: f.z - dz * 300 };
    plane.yaw = h;
    plane.pitch = -0.03;
    plane.roll = 0;
    plane.speed = 40;
    plane.throttle = 0.45;
    plane.fuel = 44;
    plane.gearDown = true;
    plane.airborne = true;
    plane.headingDeg = f.headingDeg;
    mission.prevPos = { ...plane.pos };
    // The autopilot lands her; the real landing event finishes the run.
    shotAuto = 'land';
  }
  window.__shotReady = false;
  setTimeout(() => { window.__shotReady = true; }, 1200);
}

// Test and automation hooks (read-only state for the driver's checks).
window.__game = {
  get state() { return state; },
  get mode() { return mode; },
  get score() { return mission.score; },
  get ringsPassed() { return mission.ringsPassed; },
  get fuel() { return plane.fuel; },
  get speed() { return plane.speed; },
  get altitude() { return plane.pos.y; },
  get airborne() { return plane.airborne; },
  get mission() { return mission.id; },
  get objectives() { return mission.objectives.map((o) => ({ label: o.label, done: o.done })); },
  get frames() { return frames; },
  start: (id) => startMission(id),
  setThrottle: (v) => { plane.throttle = v; },
};

buildMenu();
const params = new URLSearchParams(location.search);
const shot = params.get('shot');
if (shot) stageShot(shot);
requestAnimationFrame((t) => { last = t; requestAnimationFrame(tick); });
