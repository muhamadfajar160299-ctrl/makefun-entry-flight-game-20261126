// hud.js — the head-up display and the lit cockpit instruments.

import { KNOTS, FEET, STALL_SPEED } from './plane.js';
import { VIEW_W, VIEW_H } from './render.js';

const FONT = '"Segoe UI", system-ui, sans-serif';

function text(ctx, s, x, y, size, color, align = 'left', weight = 600) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

function shadowed(ctx, fn) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;
  fn();
  ctx.restore();
}

function bar(ctx, x, y, w, h, frac, color, bg = 'rgba(8,20,34,0.72)') {
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect(x, y, Math.max(h, w * Math.max(0, Math.min(1, frac))), h, h / 2); ctx.fill();
}

function compassLabel(deg) {
  const d = ((Math.round(deg / 15) * 15) % 360 + 360) % 360;
  if (d === 0) return 'N';
  if (d === 90) return 'E';
  if (d === 180) return 'S';
  if (d === 270) return 'W';
  if (d === 45) return 'NE';
  if (d === 135) return 'SE';
  if (d === 225) return 'SW';
  if (d === 315) return 'NW';
  return String(d).padStart(3, '0');
}

// ---- Round gauges (cockpit panel) ----
function gaugeFace(ctx, x, y, r, label) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, '#2c3e52');
  g.addColorStop(0.7, '#16242f');
  g.addColorStop(1, '#0a141d');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#8fb8d8';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // Glass glint.
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(x, y, r - 5, Math.PI * 1.15, Math.PI * 1.55); ctx.stroke();
  text(ctx, label, x, y + r + 17, 12, '#bfe3ff', 'center', 700);
}

function gaugeTicks(ctx, x, y, r, min, max, step, majorEvery, fmt) {
  for (let v = min; v <= max; v += step) {
    const a = -Math.PI * 0.75 + ((v - min) / (max - min)) * Math.PI * 1.5;
    const major = (v % majorEvery) === 0;
    const r1 = r - (major ? 10 : 6), r2 = r - 2;
    ctx.strokeStyle = major ? '#eaf4ff' : '#7fa5c4';
    ctx.lineWidth = major ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
    ctx.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2);
    ctx.stroke();
    if (major && fmt) {
      text(ctx, fmt(v), x + Math.cos(a) * (r - 22), y + Math.sin(a) * (r - 22) + 4, 11, '#cfe8ff', 'center', 600);
    }
  }
}

function needle(ctx, x, y, r, frac, color, width = 3.5) {
  const a = -Math.PI * 0.75 + frac * Math.PI * 1.5;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(a) * (r - 12), y + Math.sin(a) * (r - 12));
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#dfeefc';
  ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
}

function attitudeGauge(ctx, x, y, r, plane) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, '#2c3e52'); g.addColorStop(1, '#0a141d');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r - 3, 0, Math.PI * 2); ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(-plane.roll);
  const pitchPx = Math.max(-r, Math.min(r, plane.pitch * r * 1.4));
  ctx.fillStyle = '#3f8fd2';
  ctx.fillRect(-r, -r - pitchPx, r * 2, r + pitchPx);
  ctx.fillStyle = '#8a5a32';
  ctx.fillRect(-r, -pitchPx, r * 2, r + pitchPx);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-r, -pitchPx); ctx.lineTo(r, -pitchPx); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#8fb8d8'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  // Fixed wings marker.
  ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(x - r + 8, y); ctx.lineTo(x - r * 0.35, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + r * 0.35, y); ctx.lineTo(x + r - 8, y); ctx.stroke();
  ctx.fillStyle = '#ffd166';
  ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
  text(ctx, 'ATT', x, y + r + 17, 12, '#bfe3ff', 'center', 700);
}

function headingGauge(ctx, x, y, r, headingDeg) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, '#2c3e52'); g.addColorStop(1, '#0a141d');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r - 3, 0, Math.PI * 2); ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(-headingDeg * Math.PI / 180);
  for (let d = 0; d < 360; d += 15) {
    const a = d * Math.PI / 180;
    const major = d % 90 === 0;
    const r1 = r - (major ? 12 : 7), r2 = r - 3;
    ctx.strokeStyle = major ? '#eaf4ff' : '#7fa5c4';
    ctx.lineWidth = major ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.sin(a) * r1, -Math.cos(a) * r1);
    ctx.lineTo(Math.sin(a) * r2, -Math.cos(a) * r2);
    ctx.stroke();
    if (major) {
      const lbl = d === 0 ? 'N' : d === 90 ? 'E' : d === 180 ? 'S' : 'W';
      text(ctx, lbl, Math.sin(a) * (r - 26), -Math.cos(a) * (r - 26) + 4, 13, '#eaf4ff', 'center', 700);
    }
  }
  ctx.restore();
  ctx.strokeStyle = '#8fb8d8'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  // Lubber line.
  ctx.fillStyle = '#ffd166';
  ctx.beginPath(); ctx.moveTo(x - 7, y - r + 2); ctx.lineTo(x + 7, y - r + 2); ctx.lineTo(x, y - r + 14); ctx.closePath(); ctx.fill();
  text(ctx, 'HDG', x, y + r + 17, 12, '#bfe3ff', 'center', 700);
  text(ctx, String(Math.round(headingDeg)).padStart(3, '0') + '°', x, y + 5, 15, '#ffffff', 'center', 800);
}

function warningLight(ctx, x, y, label, on, color) {
  ctx.fillStyle = on ? color : 'rgba(60,80,100,0.5)';
  ctx.save();
  if (on) { ctx.shadowColor = color; ctx.shadowBlur = 12; }
  ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  text(ctx, label, x, y + 24, 11, on ? '#ffffff' : '#7fa5c4', 'center', 700);
}

// ---- The HUD ----
export function drawHud(ctx, S) {
  const { plane, mission, mode } = S;
  const knots = plane.speed * KNOTS;
  const altFt = Math.max(0, plane.pos.y * FEET);
  const aglFt = Math.max(0, (plane.pos.y - S.groundH) * FEET);

  // Crosshair + flight-path marker.
  if (S.state === 'flying') {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    const cx = VIEW_W / 2, cy = VIEW_H / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 16, cy); ctx.lineTo(cx - 6, cy);
    ctx.moveTo(cx + 6, cy); ctx.lineTo(cx + 16, cy);
    ctx.moveTo(cx, cy - 16); ctx.lineTo(cx, cy - 6);
    ctx.moveTo(cx, cy + 6); ctx.lineTo(cx, cy + 16);
    ctx.stroke();
  }

  // Heading tape, top centre.
  const tapeW = 440, tapeX = VIEW_W / 2 - tapeW / 2, tapeY = 16;
  ctx.fillStyle = 'rgba(8,20,34,0.62)';
  ctx.beginPath(); ctx.roundRect(tapeX, tapeY, tapeW, 44, 10); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.roundRect(tapeX, tapeY, tapeW, 44, 10); ctx.clip();
  const pxPerDeg = tapeW / 120;
  const hdg = plane.headingDeg;
  for (let d = -60; d <= 60; d += 5) {
    const h = ((Math.round(hdg + d) % 360) + 360) % 360;
    const x = VIEW_W / 2 + d * pxPerDeg;
    const major = h % 15 === 0;
    ctx.strokeStyle = major ? '#eaf4ff' : 'rgba(200,225,245,0.55)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(x, tapeY + (major ? 12 : 22)); ctx.lineTo(x, tapeY + 32); ctx.stroke();
    if (h % 30 === 0) text(ctx, compassLabel(h), x, tapeY + 12, 11, '#cfe8ff', 'center', 700);
  }
  ctx.restore();
  ctx.fillStyle = '#ffd166';
  ctx.beginPath(); ctx.moveTo(VIEW_W / 2 - 8, tapeY + 32); ctx.lineTo(VIEW_W / 2 + 8, tapeY + 32); ctx.lineTo(VIEW_W / 2, tapeY + 43); ctx.closePath(); ctx.fill();
  shadowed(ctx, () => text(ctx, String(Math.round(hdg)).padStart(3, '0') + '°', VIEW_W / 2, tapeY + 62, 17, '#ffffff', 'center', 800));

  // Target pointer: where the mission wants you, how far, which way.
  if (S.target) {
    const dx = S.target.x - plane.pos.x, dz = S.target.z - plane.pos.z;
    const distKm = Math.hypot(dx, dz) / 1000;
    const targetHdg = (Math.atan2(dx, -dz) * 180) / Math.PI;
    let rel = ((targetHdg - hdg + 540) % 360) - 180;
    const arrow = rel < -25 ? '◀' : rel > 25 ? '▶' : '▲';
    shadowed(ctx, () => text(
      ctx, `${arrow}  ${S.target.label}  —  ${distKm.toFixed(1)} KM`,
      VIEW_W / 2, tapeY + 88, 16, '#ffe9a8', 'center', 800,
    ));
  }

  // Speed, top left. Altitude, top right.
  shadowed(ctx, () => {
    text(ctx, 'SPD', 22, 34, 13, '#9fc6e8');
    text(ctx, String(Math.round(knots)), 22, 72, 40, '#ffffff', 'left', 800);
    text(ctx, 'KT', 96, 72, 15, '#9fc6e8');
    text(ctx, 'ALT', VIEW_W - 22, 34, 13, '#9fc6e8', 'right');
    text(ctx, String(Math.round(altFt)), VIEW_W - 22, 72, 40, '#ffffff', 'right', 800);
    text(ctx, 'FT', VIEW_W - 22, 92, 13, '#9fc6e8', 'right');
    text(ctx, `AGL ${Math.round(aglFt)} FT`, VIEW_W - 22, 112, 13, '#cfe8ff', 'right');
    const vs = plane.vy * FEET * 60;
    text(ctx, `V/S ${vs >= 0 ? '+' : ''}${Math.round(vs)} FPM`, VIEW_W - 22, 130, 13, '#cfe8ff', 'right');
  });
  bar(ctx, 22, 84, 130, 10, plane.throttle, '#ffd166');
  text(ctx, 'THR', 158, 94, 11, '#9fc6e8');

  // Mission card, left under the speed.
  const m = mission;
  ctx.fillStyle = 'rgba(8,20,34,0.62)';
  ctx.beginPath(); ctx.roundRect(22, 108, 300, 26 + m.objectives.length * 24, 10); ctx.fill();
  text(ctx, m.name, 36, 128, 14, '#ffe9a8', 'left', 800);
  m.objectives.forEach((o, i) => {
    const y = 152 + i * 24;
    ctx.fillStyle = o.done ? '#7ee2a0' : '#eaf4ff';
    ctx.beginPath(); ctx.arc(36, y - 4, 6, 0, Math.PI * 2); ctx.fill();
    if (o.done) {
      ctx.strokeStyle = '#0a2a18'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(33, y - 4); ctx.lineTo(35.5, y - 1); ctx.lineTo(39.5, y - 8); ctx.stroke();
    }
    text(ctx, o.label, 48, y, 13, o.done ? '#9fdcb6' : '#dff1ff');
  });

  // Fuel, damage, score, timer — bottom left.
  const by = VIEW_H - (mode === 'cockpit' ? 218 : 66);
  shadowed(ctx, () => {
    text(ctx, 'FUEL', 22, by, 12, '#9fc6e8');
    text(ctx, 'DMG', 22, by + 26, 12, '#9fc6e8');
    text(ctx, `SCORE ${S.score}`, 22, by + 52, 15, '#ffe9a8', 'left', 800);
    text(ctx, S.timerText, 190, by + 52, 15, '#dff1ff', 'left', 700);
  });
  bar(ctx, 66, by - 9, 150, 10, plane.fuel / 100, plane.fuel < 20 ? '#ff5a4e' : '#7ee2a0');
  bar(ctx, 66, by + 17, 150, 10, plane.damage / 100, '#ff8a5c');
  text(ctx, plane.gearDown ? 'GEAR DOWN' : 'GEAR UP', 230, by + 26, 11, plane.gearDown ? '#7ee2a0' : '#ffb347');

  // Stall + fuel warnings, flashing.
  if (S.state === 'flying') {
    const blink = Math.sin(S.time * 10) > 0;
    if (plane.speed < STALL_SPEED && plane.airborne && blink) {
      shadowed(ctx, () => text(ctx, 'STALL', VIEW_W / 2, 150, 34, '#ff5a4e', 'center', 900));
    } else if (plane.fuel < 20 && blink) {
      shadowed(ctx, () => text(ctx, 'FUEL LOW', VIEW_W / 2, 150, 30, '#ffb347', 'center', 900));
    }
  }

  // Attitude mini-indicator, bottom right (chase view only).
  if (mode !== 'cockpit' && S.state === 'flying') {
    attitudeGauge(ctx, VIEW_W - 92, VIEW_H - 92, 62, plane);
  }

  // ---- Cockpit instrument panel ----
  if (mode === 'cockpit') {
    const py = VIEW_H - 196;
    ctx.fillStyle = '#0d1a26';
    ctx.fillRect(0, py, VIEW_W, 196);
    const edge = ctx.createLinearGradient(0, py, 0, py + 10);
    edge.addColorStop(0, '#3a5a76');
    edge.addColorStop(1, 'rgba(58,90,118,0)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, py, VIEW_W, 10);
    const gy = py + 92;
    // Airspeed.
    gaugeFace(ctx, 170, gy, 62, 'AIRSPEED KT');
    gaugeTicks(ctx, 170, gy, 62, 0, 200, 10, 50, (v) => String(v));
    needle(ctx, 170, gy, 62, Math.min(1, knots / 200), '#7ee2a0');
    text(ctx, String(Math.round(knots)), 170, gy + 26, 16, '#ffffff', 'center', 800);
    // Altimeter.
    gaugeFace(ctx, 380, gy, 62, 'ALTITUDE FT');
    gaugeTicks(ctx, 380, gy, 62, 0, 1000, 100, 200, (v) => String(v / 100));
    needle(ctx, 380, gy, 62, (altFt % 1000) / 1000, '#7ec3ee');
    text(ctx, String(Math.round(altFt)), 380, gy + 26, 16, '#ffffff', 'center', 800);
    // Attitude.
    attitudeGauge(ctx, 590, gy, 62, plane);
    // Heading.
    headingGauge(ctx, 800, gy, 62, plane.headingDeg);
    // Warning lights + throttle quadrant.
    warningLight(ctx, 990, gy - 28, 'FUEL', plane.fuel < 20, '#ffb347');
    warningLight(ctx, 1050, gy - 28, 'STALL', plane.speed < STALL_SPEED && plane.airborne, '#ff5a4e');
    warningLight(ctx, 1110, gy - 28, 'GEAR', !plane.gearDown, '#7ec3ee');
    text(ctx, 'THROTTLE', 990, gy + 34, 11, '#9fc6e8', 'center', 700);
    bar(ctx, 960, gy + 44, 120, 12, plane.throttle, '#ffd166');
    text(ctx, `${Math.round(plane.throttle * 100)}%`, 1120, gy + 56, 13, '#ffffff', 'left', 700);
    text(ctx, 'KESTREL-9', 1180, gy - 20, 13, '#7fa5c4', 'center', 800);
  }

  // Centre message (mission updates), drawn by main.js through S.centerText.
  if (S.centerText) {
    shadowed(ctx, () => text(ctx, S.centerText, VIEW_W / 2, VIEW_H * 0.32, 30, '#ffe9a8', 'center', 800));
  }
}
