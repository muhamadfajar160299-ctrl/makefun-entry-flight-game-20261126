// audio.js — every sound is synthesized live with WebAudio. No audio files.

export function createAudio() {
  const A = {
    ctx: null, muted: false, musicOn: false,
    engine: null, engineGain: null, engineFilter: null,
    wind: null, windGain: null, windFilter: null,
    musicNodes: [], musicTimer: null, musicStep: 0,
  };

  function ensure() {
    if (A.ctx) return true;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      A.ctx = new Ctx();
      const master = A.ctx.createGain();
      master.gain.value = 0.9;
      master.connect(A.ctx.destination);
      A.master = master;
      // Engine: a sawtooth plus a sub sine, through a lowpass.
      A.engineFilter = A.ctx.createBiquadFilter();
      A.engineFilter.type = 'lowpass';
      A.engineFilter.frequency.value = 420;
      A.engineGain = A.ctx.createGain();
      A.engineGain.gain.value = 0;
      const osc = A.ctx.createOscillator();
      osc.type = 'sawtooth'; osc.frequency.value = 70;
      const sub = A.ctx.createOscillator();
      sub.type = 'sine'; sub.frequency.value = 35;
      const subGain = A.ctx.createGain(); subGain.gain.value = 0.6;
      osc.connect(A.engineFilter); sub.connect(subGain); subGain.connect(A.engineFilter);
      A.engineFilter.connect(A.engineGain); A.engineGain.connect(master);
      osc.start(); sub.start();
      A.engine = osc; A.engineSub = sub;
      // Wind: looped noise through a bandpass.
      const len = A.ctx.sampleRate * 2;
      const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const noise = A.ctx.createBufferSource();
      noise.buffer = buf; noise.loop = true;
      A.windFilter = A.ctx.createBiquadFilter();
      A.windFilter.type = 'bandpass'; A.windFilter.frequency.value = 500; A.windFilter.Q.value = 0.6;
      A.windGain = A.ctx.createGain(); A.windGain.gain.value = 0;
      noise.connect(A.windFilter); A.windFilter.connect(A.windGain); A.windGain.connect(master);
      noise.start();
      A.wind = noise;
      return true;
    } catch (e) { return false; }
  }

  A.unlock = () => {
    if (ensure() && A.ctx.state === 'suspended') A.ctx.resume().catch(() => {});
  };

  A.update = (throttle, speed, airborne) => {
    if (!A.ctx || A.muted) return;
    const t = A.ctx.currentTime;
    const rpm = 52 + throttle * 95 + speed * 0.55;
    A.engine.frequency.setTargetAtTime(rpm, t, 0.08);
    A.engineSub.frequency.setTargetAtTime(rpm / 2, t, 0.08);
    A.engineFilter.frequency.setTargetAtTime(300 + throttle * 900 + speed * 6, t, 0.1);
    A.engineGain.gain.setTargetAtTime(airborne ? 0.05 + throttle * 0.075 : 0.02 + throttle * 0.05, t, 0.1);
    const wind = Math.max(0, (speed - 18) / 70);
    A.windGain.gain.setTargetAtTime(airborne ? wind * 0.11 : 0, t, 0.15);
    A.windFilter.frequency.setTargetAtTime(380 + speed * 9, t, 0.15);
  };

  function tone(freq, dur, type, vol, when = 0, slideTo = null) {
    if (!A.ctx || A.muted) return;
    const t0 = A.ctx.currentTime + when;
    const o = A.ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol || 0.2, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(A.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noiseBurst(dur, vol, freq) {
    if (!A.ctx || A.muted) return;
    const t0 = A.ctx.currentTime;
    const len = Math.floor(A.ctx.sampleRate * dur);
    const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = A.ctx.createBufferSource();
    src.buffer = buf;
    const f = A.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq || 900;
    const g = A.ctx.createGain(); g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(A.master);
    src.start(t0);
  }

  A.chime = () => { tone(880, 0.35, 'sine', 0.22); tone(1318.5, 0.5, 'sine', 0.18, 0.09); };
  A.beep = () => tone(1244, 0.12, 'square', 0.08);
  A.warn = () => { tone(660, 0.16, 'square', 0.1); tone(660, 0.16, 'square', 0.1, 0.22); };
  A.click = () => tone(1500, 0.05, 'sine', 0.12);
  A.thud = () => { noiseBurst(0.25, 0.4, 300); tone(70, 0.3, 'sine', 0.35, 0, 38); };
  A.crash = () => { noiseBurst(0.7, 0.5, 500); tone(55, 0.8, 'sawtooth', 0.25, 0, 30); };
  A.splash = () => { noiseBurst(0.5, 0.35, 1200); tone(220, 0.4, 'sine', 0.15, 0, 90); };
  A.drop = () => { tone(520, 0.12, 'sine', 0.15, 0, 780); };

  // A slow pad that cycles Am – F – C – G, quiet enough to fly under.
  const CHORDS = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [164.8, 196, 246.9]];
  A.toggleMusic = () => {
    A.musicOn = !A.musicOn;
    if (!ensure()) return A.musicOn;
    if (A.musicOn) {
      const play = () => {
        if (!A.musicOn) return;
        const chord = CHORDS[A.musicStep % CHORDS.length];
        A.musicStep++;
        for (const f of chord) {
          const o = A.ctx.createOscillator();
          o.type = 'triangle'; o.frequency.value = f;
          const g = A.ctx.createGain();
          g.gain.setValueAtTime(0, A.ctx.currentTime);
          g.gain.linearRampToValueAtTime(0.035, A.ctx.currentTime + 0.8);
          g.gain.setValueAtTime(0.035, A.ctx.currentTime + 2.6);
          g.gain.linearRampToValueAtTime(0, A.ctx.currentTime + 3.6);
          o.connect(g); g.connect(A.master);
          o.start(); o.stop(A.ctx.currentTime + 3.7);
        }
      };
      play();
      A.musicTimer = setInterval(play, 3200);
    } else if (A.musicTimer) {
      clearInterval(A.musicTimer); A.musicTimer = null;
    }
    return A.musicOn;
  };

  A.setMuted = (m) => {
    A.muted = m;
    if (A.ctx && A.master) A.master.gain.value = m ? 0 : 0.9;
  };

  return A;
}
