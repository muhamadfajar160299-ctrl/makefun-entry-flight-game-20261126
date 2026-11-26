// input.js — keyboard plus mouse steering (pointer lock + wheel throttle).

export function createInput(canvas) {
  const I = {
    keys: new Set(),
    pressed: new Set(),       // edge-triggered keys, consumed once
    mouseRoll: 0,             // decaying mouse steering offsets
    mousePitch: 0,
    wheelDelta: 0,            // relative throttle nudge from the wheel, consumed once
    locked: false,
  };

  const CODE = {
    pitchUp: ['KeyW', 'ArrowUp'],
    pitchDown: ['KeyS', 'ArrowDown'],
    rollLeft: ['KeyA', 'ArrowLeft'],
    rollRight: ['KeyD', 'ArrowRight'],
    rudderLeft: ['KeyQ'],
    rudderRight: ['KeyE'],
    throttleUp: ['KeyR'],
    throttleDown: ['KeyF'],
  };

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    I.keys.add(e.code);
    I.pressed.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => I.keys.delete(e.code));
  window.addEventListener('blur', () => I.keys.clear());

  canvas.addEventListener('click', () => {
    if (!I.locked && canvas.requestPointerLock) canvas.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    I.locked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (e) => {
    if (!I.locked) return;
    I.mouseRoll = Math.max(-1, Math.min(1, I.mouseRoll + e.movementX * 0.004));
    I.mousePitch = Math.max(-1, Math.min(1, I.mousePitch - e.movementY * 0.004));
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    I.wheelDelta -= Math.sign(e.deltaY) * 0.07;
  }, { passive: false });

  // Read the current control state for one frame.
  I.read = (dt) => {
    const has = (list) => list.some((c) => I.keys.has(c));
    const decay = Math.exp(-dt * 1.4);
    I.mouseRoll *= decay;
    I.mousePitch *= decay;
    if (Math.abs(I.mouseRoll) < 0.01) I.mouseRoll = 0;
    if (Math.abs(I.mousePitch) < 0.01) I.mousePitch = 0;
    let throttle = 0;
    if (has(CODE.throttleUp)) throttle += 1;
    if (has(CODE.throttleDown)) throttle -= 1;
    const wheel = I.wheelDelta;
    I.wheelDelta = 0;
    return {
      pitch: (has(CODE.pitchUp) ? 1 : 0) - (has(CODE.pitchDown) ? 1 : 0) + I.mousePitch,
      roll: (has(CODE.rollRight) ? 1 : 0) - (has(CODE.rollLeft) ? 1 : 0) + I.mouseRoll,
      rudder: (has(CODE.rudderRight) ? 1 : 0) - (has(CODE.rudderLeft) ? 1 : 0),
      throttle,
      wheel,
    };
  };

  I.wasPressed = (code) => {
    if (I.pressed.has(code)) { I.pressed.delete(code); return true; }
    return false;
  };

  return I;
}
