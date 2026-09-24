/* ==========================================================================
 * 40-sound.js — music and ambience, synthesized in the browser (no samples,
 * no copyrighted recordings). 古筝-like plucks (Karplus–Strong), a breathy 箫,
 * a low drone and hall reverb, in D 宫 pentatonic (D E F# A B). Muted by
 * default; ducks under recitation. Scheduling runs from the render loop.
 * ========================================================================== */
const Sound = (() => {
  let ctx = null, master = null, musicBus = null, duckNode = null, ambBus = null, reverb = null, dry = null;
  let enabled = false, ready = false;
  const vol = { master: 0.8, music: 0.55, amb: 0.35 };
  const plucks = new Map(); // midi -> AudioBuffer
  const SCALE = [50, 52, 54, 57, 59, 62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86];
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = vol.music;
    duckNode = ctx.createGain();
    duckNode.gain.value = 1;
    musicBus.connect(duckNode);
    dry = ctx.createGain();
    dry.gain.value = 0.8;
    duckNode.connect(dry);
    dry.connect(master);
    reverb = ctx.createConvolver();
    reverb.buffer = impulse(3.2, 2.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.42;
    duckNode.connect(reverb);
    reverb.connect(wet);
    wet.connect(master);
    ambBus = ctx.createGain();
    ambBus.gain.value = vol.amb;
    ambBus.connect(master);
    return ctx;
  }
  function impulse(sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 120 ? i / 120 : 1);
    }
    return b;
  }

  // Karplus–Strong pluck with a bright attack and a slow, silvery decay
  function makePluck(midi) {
    const sr = ctx.sampleRate;
    const f = mtof(midi);
    const N = Math.max(2, Math.round(sr / f));
    const len = Math.floor(sr * 3.6);
    const buf = ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    const ring = new Float32Array(N);
    let seed = midi * 7919;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    // excitation: noise shaped toward a plucked point (brighter for high strings)
    let prev = 0;
    for (let i = 0; i < N; i++) { const n = rnd(); prev = prev * 0.45 + n * 0.55; ring[i] = prev; }
    const decay = 0.9968 - Math.max(0, midi - 70) * 0.00025;
    let idx = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const cur = ring[idx];
      const nxt = ring[(idx + 1) % N];
      const v = (cur + nxt) * 0.5 * decay;
      ring[idx] = v * 0.985 + last * 0.015;
      last = v;
      out[i] = cur;
      idx = (idx + 1) % N;
    }
    // soft attack click + normalise
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
    const g = 0.6 / (peak || 1);
    for (let i = 0; i < len; i++) out[i] *= g * (i < 40 ? i / 40 : 1);
    return buf;
  }

  async function prepare() {
    if (ready || !ensureCtx()) return;
    for (const m of SCALE.concat([45, 47, 38])) {
      plucks.set(m, makePluck(m));
      await U.idle();
    }
    startAmbience();
    ready = true;
  }

  function pluck(midi, when, gain = 0.5, bend = 0) {
    const b = plucks.get(midi);
    if (!b) return;
    const s = ctx.createBufferSource();
    s.buffer = b;
    const g = ctx.createGain();
    g.gain.value = gain;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) pan.pan.value = (midi - 66) / 40;
    s.connect(g);
    if (pan) { g.connect(pan); pan.connect(musicBus); } else g.connect(musicBus);
    // 吟猱: a slow pitch waver on longer notes
    if (bend) {
      s.detune.setValueAtTime(0, when);
      s.detune.linearRampToValueAtTime(bend * 60, when + 0.35);
      s.detune.linearRampToValueAtTime(bend * 10, when + 0.9);
      s.detune.linearRampToValueAtTime(bend * 40, when + 1.5);
    }
    s.start(when);
    s.stop(when + 3.6);
  }

  function xiao(midi, when, dur, gain = 0.12) {
    const f = mtof(midi);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = f * 2.001;
    const g2 = ctx.createGain();
    g2.gain.value = 0.12;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 4.8;
    const lg = ctx.createGain();
    lg.gain.value = 0;
    lg.gain.setValueAtTime(0, when);
    lg.gain.linearRampToValueAtTime(f * 0.006, when + Math.min(0.9, dur * 0.6));
    lfo.connect(lg);
    lg.connect(o.frequency);
    lg.connect(o2.frequency);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(gain, when + 0.28);
    env.gain.setValueAtTime(gain, when + Math.max(0.3, dur - 0.5));
    env.gain.linearRampToValueAtTime(0, when + dur + 0.4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    o.connect(env);
    o2.connect(g2);
    g2.connect(env);
    // breath
    const nb = noiseBuffer();
    const n = ctx.createBufferSource();
    n.buffer = nb;
    n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 2;
    bp.Q.value = 3;
    const ng = ctx.createGain();
    ng.gain.value = gain * 0.25;
    n.connect(bp);
    bp.connect(ng);
    ng.connect(env);
    env.connect(lp);
    lp.connect(musicBus);
    for (const node of [o, o2, lfo, n]) { node.start(when); node.stop(when + dur + 0.5); }
  }

  let _noise = null;
  function noiseBuffer() {
    if (_noise) return _noise;
    const len = ctx.sampleRate * 2;
    _noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = _noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 6; }
    return _noise;
  }

  // Drone + ambience beds
  let droneGain = null, riverGain = null, windGain = null;
  function startAmbience() {
    droneGain = ctx.createGain();
    droneGain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    for (const [m, g] of [[38, 0.5], [45, 0.32], [50, 0.18]]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = mtof(m);
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og);
      og.connect(lp);
      o.start();
    }
    lp.connect(droneGain);
    droneGain.connect(musicBus);
    // river rush and wind from filtered noise
    const mk = (freq, q, type) => {
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer();
      n.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      n.connect(f);
      f.connect(g);
      g.connect(ambBus);
      n.start();
      return { g, f };
    };
    riverGain = mk(520, 0.6, 'bandpass');
    windGain = mk(380, 0.3, 'lowpass');
  }

  // ------------------------------------------------------------- score
  // [midi, beats]; 0 = rest. D 宫 pentatonic, slow, with breathing space.
  const MEL = [
    [69, 2], [71, 1], [69, 1], [66, 2], [64, 2], [62, 1], [64, 1], [66, 1], [69, 1], [64, 4],
    [66, 2], [69, 1], [71, 1], [74, 2], [71, 1], [69, 1], [66, 1], [64, 1], [62, 2], [62, 3], [0, 1],
    [71, 2], [74, 1], [76, 1], [74, 3], [71, 1], [69, 2], [71, 1], [69, 1], [66, 4],
    [64, 2], [66, 1], [69, 1], [71, 2], [69, 1], [66, 1], [64, 1], [62, 1], [64, 2], [62, 4],
  ];
  const BEAT = 1.05; // seconds per beat (≈57 bpm)
  const seq = { next: 0, i: 0, beat: 0, bar: 0 };
  let intensity = 0, targetIntensity = 0;
  const gliss = { pending: false };

  function setIntensity(level) { targetIntensity = level; }
  function glissando() { gliss.pending = true; }

  function schedule() {
    const now = ctx.currentTime;
    if (seq.next < now) seq.next = now + 0.1;
    while (seq.next < now + 0.7) {
      const [m, beats] = MEL[seq.i % MEL.length];
      const t = seq.next;
      const I = intensity;
      const sparse = I < 0.5 && (seq.i % 3 === 2);
      if (m && !sparse) {
        pluck(m, t, 0.36 + 0.1 * I, beats >= 2 && (seq.i % 2) ? 1 : 0);
        if (I >= 1.5 && beats >= 2) xiao(m - 12, t + 0.05, beats * BEAT * 0.95, 0.07 + 0.03 * (I - 1.5));
      }
      // accompaniment: low string on bar starts, broken chord when fuller
      const barStart = seq.beat % 4 === 0;
      if (barStart) {
        const root = (Math.floor(seq.beat / 4) % 4 === 2) ? 45 : 38;
        pluck(root === 38 ? 50 : 57, t, 0.18 + 0.06 * I, 0);
        if (I >= 0.8) {
          pluck(root === 38 ? 57 : 62, t + BEAT * 0.5, 0.12 * I, 0);
          pluck(root === 38 ? 62 : 64, t + BEAT * 1.0, 0.1 * I, 0);
        }
        if (I >= 2.5) {
          pluck(66, t + BEAT * 1.5, 0.08 * I, 0);
          pluck(69, t + BEAT * 2.5, 0.07 * I, 0);
        }
      }
      if (gliss.pending) {
        gliss.pending = false;
        // 刮奏: a quick sweep up the scale
        const run = SCALE.slice(2);
        run.forEach((mm, k) => pluck(mm, t + k * 0.055, 0.14 + 0.008 * k, 0));
      }
      seq.next += beats * BEAT;
      seq.beat += beats;
      seq.i++;
    }
  }

  // ------------------------------------------------------------- per frame
  // state: { camY, riverDist, speaking, paused }
  function tick(dt, state) {
    if (!ctx || !ready) return;
    intensity += (targetIntensity - intensity) * Math.min(1, dt * 0.4);
    if (enabled && ctx.state === 'running') schedule();
    const tNow = ctx.currentTime;
    const duck = state.speaking ? 0.42 : state.paused ? 0.6 : 1;
    duckNode.gain.setTargetAtTime(duck, tNow, 0.25);
    droneGain.gain.setTargetAtTime(enabled ? 0.05 + 0.035 * intensity : 0, tNow, 1.2);
    const river = U.clamp(1 - (state.riverDist || 1000) / 700, 0, 1) * (1 - U.smoothstep(40, 220, state.camY || 0));
    riverGain.g.gain.setTargetAtTime(enabled ? 0.05 + 0.5 * river : 0, tNow, 0.8);
    const wind = U.smoothstep(35, 140, state.camY || 0);
    windGain.g.gain.setTargetAtTime(enabled ? 0.04 + 0.22 * wind : 0, tNow, 1.0);
    windGain.f.frequency.setTargetAtTime(300 + 260 * Math.sin(tNow * 0.13) ** 2, tNow, 1.5);
  }

  async function setEnabled(on) {
    enabled = on;
    if (!ensureCtx()) return false;
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) { /* ignored */ } }
    if (on && !ready) await prepare();
    master.gain.setTargetAtTime(on ? vol.master : 0, ctx.currentTime, 0.4);
    return true;
  }
  function setVolume(which, v) {
    vol[which] = v;
    if (!ctx) return;
    if (which === 'music') musicBus.gain.setTargetAtTime(v, ctx.currentTime, 0.2);
    if (which === 'amb') ambBus.gain.setTargetAtTime(v, ctx.currentTime, 0.2);
    if (which === 'master' && enabled) master.gain.setTargetAtTime(v, ctx.currentTime, 0.2);
  }
  function suspend(yes) {
    if (!ctx) return;
    if (yes && ctx.state === 'running') ctx.suspend();
    else if (!yes && ctx.state === 'suspended' && enabled) ctx.resume();
  }

  // monitoring tap (used by level checks)
  function analyser() { const a = ctx.createAnalyser(); a.fftSize = 2048; master.connect(a); return a; }

  return { analyser, ensureCtx, setEnabled, setVolume, setIntensity, glissando, tick, suspend, get ctx() { return ctx; }, get enabled() { return enabled; }, vol };
})();
