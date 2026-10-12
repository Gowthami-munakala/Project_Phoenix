// audio.js — fully procedural Web Audio: sound effects, ambience loops and
// original music. No audio files are required, so nothing can be "missing".
import { Store } from './storage.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[(Math.random() * arr.length) | 0];

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.loops = new Map();
    this.music = null;
    this.musicName = null;
    this.lastPlayed = new Map();
    this.listener = { x: 0, y: 0 };
  }

  get ready() { return !!this.ctx; }

  // Must be called from a user gesture (browser autoplay rules).
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { this.ctx = null; return; }
    const c = this.ctx;
    this.master = c.createGain();
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4;
    this.master.connect(this.comp).connect(c.destination);
    this.musicBus = c.createGain(); this.musicBus.connect(this.master);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.voiceBus = c.createGain(); this.voiceBus.connect(this.master);
    // shared echo send for a cavernous feel
    this.echo = c.createDelay(1.5); this.echo.delayTime.value = 0.33;
    const fb = c.createGain(); fb.gain.value = 0.32;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    this.echo.connect(lp).connect(fb).connect(this.echo);
    this.echoOut = c.createGain(); this.echoOut.gain.value = 0.5;
    lp.connect(this.echoOut).connect(this.sfxBus);
    // noise buffers
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.brown = c.createBuffer(1, len, c.sampleRate);
    const b = this.brown.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    this.applySettings();
  }

  applySettings() {
    if (!this.ctx) return;
    const s = Store.settings, t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(s.music * 0.7, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.sfx, t, 0.05);
    this.voiceBus.gain.setTargetAtTime(s.voice, t, 0.05);
  }

  // ---------- building blocks ----------
  _noise(brown = false) { const s = this.ctx.createBufferSource(); s.buffer = brown ? this.brown : this.noise; s.loop = true; s.loopStart = Math.random(); return s; }
  _osc(type, f) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; }
  _gain(v = 0) { const g = this.ctx.createGain(); g.gain.value = v; return g; }
  _filter(type, f, q = 1) { const fl = this.ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; return fl; }
  _env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  _out(vol = 1, pan = 0, echo = 0) {
    const g = this._gain(vol);
    let node = g;
    if (this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); node = p; }
    node.connect(this.sfxBus);
    if (echo > 0) { const e = this._gain(echo); node.connect(e).connect(this.echo); }
    return g;
  }
  _stopLater(nodes, t) { nodes.forEach(n => { try { n.stop(t); } catch (e) {} }); }

  setListener(x, y) { this.listener.x = x; this.listener.y = y; }

  // Positional one-shot: volume and pan from distance to the listener (player).
  playAt(name, x, y, opts = {}) {
    const dx = x - this.listener.x, dy = y - this.listener.y;
    const dist = Math.hypot(dx, dy), max = opts.range || 520;
    if (dist > max) return;
    const vol = (opts.vol ?? 1) * Math.pow(1 - dist / max, 1.4);
    this.play(name, { ...opts, vol, pan: dx / 320 });
  }

  play(name, opts = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const gen = SFX[name];
    if (!gen) return;
    const now = this.ctx.currentTime;
    const gap = opts.gap ?? 0.06;
    if (now - (this.lastPlayed.get(name) || -9) < gap) return; // avoid machine-gun repeats
    this.lastPlayed.set(name, now);
    try { gen(this, now + (opts.delay || 0), opts); } catch (e) { /* never break gameplay over audio */ }
  }

  // ---------- ambience loops ----------
  startLoop(name, vol = 1) {
    if (!this.ctx || this.loops.has(name) || !LOOPS[name]) return;
    const out = this._gain(0); out.connect(this.sfxBus);
    out.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.8);
    const nodes = LOOPS[name](this, out);
    this.loops.set(name, { out, nodes });
  }
  setLoopVolume(name, vol) { const l = this.loops.get(name); if (l && this.ctx) l.out.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.3); }
  stopLoop(name, fade = 0.8) {
    const l = this.loops.get(name); if (!l) return;
    this.loops.delete(name);
    const t = this.ctx.currentTime;
    l.out.gain.setTargetAtTime(0, t, fade / 3);
    setTimeout(() => { l.nodes.forEach(n => { try { n.stop(); } catch (e) {} if (n._timer) clearInterval(n._timer); }); l.out.disconnect(); }, fade * 1000 + 200);
  }
  stopAllLoops(fade) { [...this.loops.keys()].forEach(k => this.stopLoop(k, fade)); }

  // ---------- music ----------
  setMusic(name, fade = 1.5) {
    if (!this.ctx || name === this.musicName) return;
    this.musicName = name;
    const old = this.music;
    if (old) {
      old.out.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3);
      setTimeout(() => old.stop(), fade * 1000 + 300);
    }
    this.music = null;
    if (!name || !MUSIC[name]) return;
    const out = this._gain(0); out.connect(this.musicBus);
    out.gain.setTargetAtTime(1, this.ctx.currentTime, fade / 3);
    const track = MUSIC[name](this, out);
    track.out = out;
    this.music = track;
  }
}

// Utility to build continuous (drone) tracks and sequenced tracks.
function track(A, out, { drone, bpm, step }) {
  const nodes = drone ? drone(A, out) : [];
  let timer = null;
  if (step) {
    const spb = 60 / bpm / 4; // 16th notes
    let next = A.ctx.currentTime + 0.1, i = 0;
    timer = setInterval(() => {
      while (next < A.ctx.currentTime + 0.2) { step(A, out, next, i++, spb); next += spb; }
    }, 40);
  }
  return { stop() { if (timer) clearInterval(timer); A._stopLater(nodes, A.ctx.currentTime + 0.05); try { out.disconnect(); } catch (e) {} } };
}

function droneOsc(A, out, freqs, { type = 'sawtooth', cutoff = 500, vol = 0.05, lfo = 0.07 } = {}) {
  const c = A.ctx, nodes = [];
  const f = A._filter('lowpass', cutoff, 2); const g = A._gain(vol);
  f.connect(g).connect(out);
  const l = A._osc('sine', lfo); const lg = A._gain(cutoff * 0.5); l.connect(lg).connect(f.frequency); l.start(); nodes.push(l);
  freqs.forEach((fr, i) => {
    [-6, 6].forEach(det => { const o = A._osc(type, fr); o.detune.value = det + i; o.connect(f); o.start(); nodes.push(o); });
  });
  return nodes;
}

function note(A, out, t, f, dur, { type = 'triangle', vol = 0.1, cutoff = 3000, attack = 0.01, echo = 0 } = {}) {
  const o = A._osc(type, f), g = A._gain(0), fl = A._filter('lowpass', cutoff);
  o.connect(fl).connect(g).connect(out);
  if (echo) { const e = A._gain(echo); g.connect(e).connect(A.echo); }
  A._env(g, t, attack, vol, dur);
  o.start(t); o.stop(t + attack + dur + 0.05);
}
function drum(A, out, t, kind, vol = 0.5) {
  if (kind === 'kick') {
    const o = A._osc('sine', 120), g = A._gain(0); o.connect(g).connect(out);
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
    A._env(g, t, 0.005, vol, 0.3); o.start(t); o.stop(t + 0.4);
  } else {
    const n = A._noise(), f = A._filter(kind === 'snare' ? 'bandpass' : 'highpass', kind === 'snare' ? 1800 : 7000, 0.8), g = A._gain(0);
    n.connect(f).connect(g).connect(out); A._env(g, t, 0.003, vol * (kind === 'snare' ? 0.6 : 0.2), kind === 'snare' ? 0.18 : 0.05);
    n.start(t); n.stop(t + 0.3);
  }
}
const midi = m => 440 * Math.pow(2, (m - 69) / 12);

// ---------------------------------------------------------------------------
// MUSIC (all original, generated on the fly)
// ---------------------------------------------------------------------------
const MUSIC = {
  intro: (A, out) => track(A, out, {
    drone: (A, o) => droneOsc(A, o, [55, 82.4, 110 * 1.06], { vol: 0.045, cutoff: 380 }),
  }),
  menu: (A, out) => track(A, out, {
    drone: (A, o) => droneOsc(A, o, [55, 65.4, 98], { vol: 0.04, cutoff: 420, lfo: 0.05 }),
    bpm: 50, step: (A, o, t, i) => { if (i % 16 === 0 && Math.random() < 0.7) note(A, o, t, midi(pick([69, 72, 76, 77, 81])), 2.2, { vol: 0.05, echo: 0.4 }); },
  }),
  hotel: (A, out) => track(A, out, {
    drone: (A, o) => droneOsc(A, o, [73.4, 77.8], { vol: 0.035, cutoff: 300 }),
    // broken music box: sparse notes from a detuned minor scale
    bpm: 64, step: (A, o, t, i) => { if (i % 4 === 0 && Math.random() < 0.28) note(A, o, t, midi(pick([74, 77, 81, 82, 86])) * rand(0.985, 1.0), 1.4, { type: 'sine', vol: 0.045, echo: 0.5 }); },
  }),
  hospital: (A, out) => track(A, out, {
    drone: (A, o) => [...droneOsc(A, o, [440 * 1.003, 466.2, 659], { type: 'sine', vol: 0.012, cutoff: 2000, lfo: 0.2 }), ...droneOsc(A, o, [49], { vol: 0.04, cutoff: 200 })],
    bpm: 40, step: (A, o, t, i) => { if (i % 32 === 0 && Math.random() < 0.5) note(A, o, t, midi(pick([57, 58, 63])), 3, { type: 'sawtooth', vol: 0.02, cutoff: 700, attack: 1 }); },
  }),
  forest: (A, out) => track(A, out, {
    drone: (A, o) => droneOsc(A, o, [41.2, 61.7, 92.5], { type: 'triangle', vol: 0.05, cutoff: 600, lfo: 0.03 }),
    bpm: 36, step: (A, o, t, i) => { if (i % 16 === 0 && Math.random() < 0.45) note(A, o, t, midi(pick([64, 66, 67, 71, 74])), 4, { type: 'sine', vol: 0.035, attack: 1.2, echo: 0.6 }); },
  }),
  kingdom: (A, out) => track(A, out, {
    drone: (A, o) => droneOsc(A, o, [36.7, 55, 73.4], { type: 'square', vol: 0.02, cutoff: 500, lfo: 0.04 }),
    bpm: 48, step: (A, o, t, i, spb) => {
      if (i % 32 === 0) { const ch = [[62, 65, 69], [58, 62, 65], [60, 64, 67], [57, 61, 64]][(i / 32 | 0) % 4]; ch.forEach(m => note(A, o, t, midi(m), spb * 30, { type: 'sawtooth', vol: 0.018, cutoff: 900, attack: 0.8 })); }
    },
  }),
  chase: (A, out) => track(A, out, {
    drone: (A, o) => droneOsc(A, o, [36.7, 38.9], { vol: 0.05, cutoff: 260, lfo: 4 }),
    bpm: 150, step: (A, o, t, i) => {
      if (i % 4 === 0) drum(A, o, t, 'kick', 0.5);
      if (i % 8 === 6) drum(A, o, t, 'snare', 0.35);
      note(A, o, t, midi(i % 16 === 14 ? 39 : 38), 0.08, { type: 'sawtooth', vol: 0.05, cutoff: 600 });
      if (i % 32 === 0) note(A, o, t, midi(pick([74, 75])), 0.5, { type: 'square', vol: 0.025, cutoff: 2000 });
    },
  }),
  boss: (A, out) => track(A, out, {
    drone: (A, o) => droneOsc(A, o, [36.7], { vol: 0.04, cutoff: 300 }),
    bpm: 128, step: (A, o, t, i, spb) => {
      const bar = (i / 16 | 0) % 4, s = i % 16;
      const roots = [38, 34, 36, 33];
      if (s % 4 === 0) drum(A, o, t, 'kick', 0.55);
      if (s === 4 || s === 12) drum(A, o, t, 'snare', 0.45);
      if (s % 2 === 1) drum(A, o, t, 'hat', 0.4);
      const ost = [0, 0, 12, 0, 3, 0, 7, 5];
      if (s % 2 === 0) note(A, o, t, midi(roots[bar] + ost[(s / 2) % 8]), spb * 1.6, { type: 'sawtooth', vol: 0.06, cutoff: 900 });
      if (s === 0) [12, 15, 19].forEach(iv => note(A, o, t, midi(roots[bar] + 24 + iv), spb * 15, { type: 'sawtooth', vol: 0.014, cutoff: 1600, attack: 0.3 }));
      if (s === 8 && bar === 3) note(A, o, t, midi(roots[bar] + 36 + 6), spb * 6, { type: 'square', vol: 0.02, cutoff: 2500 });
    },
  }),
  ending: (A, out) => track(A, out, {
    drone: (A, o) => droneOsc(A, o, [55, 82.4], { type: 'triangle', vol: 0.03, cutoff: 700 }),
    bpm: 30, step: (A, o, t, i, spb) => { if (i % 8 === 0) { const ch = [[57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67], [52, 55, 59, 64]][(i / 8 | 0) % 4]; ch.forEach(m => note(A, o, t, midi(m + 12), spb * 8, { type: 'sine', vol: 0.03, attack: 1, echo: 0.3 })); } },
  }),
};

// ---------------------------------------------------------------------------
// AMBIENCE LOOPS
// ---------------------------------------------------------------------------
const LOOPS = {
  wind: (A, out) => {
    const n = A._noise(true), f = A._filter('bandpass', 500, 0.8), g = A._gain(0.5);
    const l = A._osc('sine', 0.09), lg = A._gain(300); l.connect(lg).connect(f.frequency);
    n.connect(f).connect(g).connect(out); n.start(); l.start(); return [n, l];
  },
  rain: (A, out) => {
    const n = A._noise(), hp = A._filter('highpass', 900), lp = A._filter('lowpass', 7000), g = A._gain(0.16);
    n.connect(hp).connect(lp).connect(g).connect(out); n.start(); return [n];
  },
  buzz: (A, out) => {
    const o = A._osc('sawtooth', 120), f = A._filter('bandpass', 240, 3), g = A._gain(0.03);
    const o2 = A._osc('square', 240.5), g2 = A._gain(0.006);
    o.connect(f).connect(g).connect(out); o2.connect(g2).connect(out); o.start(); o2.start();
    o._timer = setInterval(() => { if (Math.random() < 0.15) { const t = A.ctx.currentTime; g.gain.setValueAtTime(0.0, t); g.gain.setValueAtTime(0.03, t + rand(0.03, 0.15)); } }, 400);
    return [o, o2];
  },
  leaves: (A, out) => {
    const n = A._noise(), f = A._filter('bandpass', 3200, 0.6), g = A._gain(0.05);
    const l = A._osc('sine', 0.23), lg = A._gain(0.04); l.connect(lg).connect(g.gain);
    n.connect(f).connect(g).connect(out); n.start(); l.start(); return [n, l];
  },
  howl: (A, out) => {
    const n = A._noise(true), f = A._filter('bandpass', 900, 6), g = A._gain(0.4);
    const l = A._osc('sine', 0.05), lg = A._gain(500); l.connect(lg).connect(f.frequency);
    n.connect(f).connect(g).connect(out); n.start(); l.start(); return [n, l];
  },
  heart: (A, out) => {
    // chase heartbeat loop (rate set via playbackRate-free interval)
    const dummy = A._osc('sine', 1); dummy.connect(A._gain(0)); dummy.start();
    dummy._timer = setInterval(() => A.play('heartbeat', { vol: 0.6, gap: 0.3 }), 620);
    return [dummy];
  },
  hum: (A, out) => {
    const nodes = [55, 82.5, 110].map(f => { const o = A._osc('sine', f); const g = A._gain(0.04); o.connect(g).connect(out); o.start(); return o; });
    return nodes;
  },
  rumble: (A, out) => {
    const n = A._noise(true), f = A._filter('lowpass', 110, 1), g = A._gain(1.2);
    const o = A._osc('sine', 33), og = A._gain(0.15);
    n.connect(f).connect(g).connect(out); o.connect(og).connect(out); n.start(); o.start(); return [n, o];
  },
};

// ---------------------------------------------------------------------------
// SOUND EFFECTS
// ---------------------------------------------------------------------------
function noiseHit(A, t, { type = 'lowpass', f = 800, q = 1, vol = 0.5, a = 0.004, d = 0.15, pan = 0, echo = 0, brown = false, sweepTo = null }) {
  const n = A._noise(brown), fl = A._filter(type, f, q), g = A._gain(0), out = A._out(1, pan, echo);
  n.connect(fl).connect(g).connect(out);
  if (sweepTo) fl.frequency.exponentialRampToValueAtTime(sweepTo, t + a + d);
  A._env(g, t, a, vol, d); n.start(t); n.stop(t + a + d + 0.1);
}
function tone(A, t, { type = 'sine', f = 440, to = null, vol = 0.3, a = 0.005, d = 0.3, pan = 0, echo = 0, cutoff = 8000 }) {
  const o = A._osc(type, f), fl = A._filter('lowpass', cutoff), g = A._gain(0), out = A._out(1, pan, echo);
  o.connect(fl).connect(g).connect(out);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + a + d);
  A._env(g, t, a, vol, d); o.start(t); o.stop(t + a + d + 0.1);
}

const SFX = {
  heartbeat: (A, t, o) => { const v = o.vol ?? 1; tone(A, t, { f: 70, to: 38, vol: 0.9 * v, d: 0.16 }); tone(A, t + 0.26, { f: 62, to: 36, vol: 0.6 * v, d: 0.18 }); },
  bookSlam: (A, t, o) => {
    noiseHit(A, t, { f: 1200, vol: 1, d: 0.35, echo: 0.8, brown: false, sweepTo: 200 });
    tone(A, t, { f: 90, to: 28, vol: 1, d: 0.6 });
  },
  pageTurn: (A, t, o) => { for (let i = 0; i < 3; i++) noiseHit(A, t + i * 0.12, { type: 'bandpass', f: 2500, q: 0.7, vol: 0.18 * (o.vol ?? 1), a: 0.03, d: 0.18, sweepTo: 6000, pan: rand(-0.3, 0.3) }); },
  whisper: (A, t, o) => {
    const dur = o.dur || rand(1.2, 2); const pan = o.pan ?? rand(-0.9, 0.9); const v = (o.vol ?? 1) * 0.5;
    const n = A._noise(), out = A._out(1, pan, 0.6), g = A._gain(0);
    const formants = pick([[700, 1200], [400, 2000], [300, 900], [600, 1700]]);
    formants.forEach(fr => { const f = A._filter('bandpass', fr, 9); n.connect(f).connect(g); });
    const am = A._osc('sine', rand(5, 9)), amg = A._gain(0.5); am.connect(amg).connect(g.gain);
    g.connect(out); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.3); g.gain.linearRampToValueAtTime(0, t + dur);
    n.start(t); am.start(t); n.stop(t + dur + 0.1); am.stop(t + dur + 0.1);
  },
  step: (A, t, o) => {
    const surf = o.surface || 'wood', v = (o.vol ?? 1) * 0.22, pan = o.pan || 0;
    if (surf === 'leaves') { noiseHit(A, t, { type: 'bandpass', f: rand(2500, 4500), q: 0.8, vol: v, d: 0.09, pan }); noiseHit(A, t + 0.04, { type: 'highpass', f: 5000, vol: v * 0.6, d: 0.05, pan }); }
    else if (surf === 'tile') noiseHit(A, t, { type: 'bandpass', f: rand(1800, 2400), q: 2, vol: v * 0.8, d: 0.05, pan, echo: 0.3 });
    else if (surf === 'stone') { noiseHit(A, t, { type: 'bandpass', f: rand(600, 900), q: 1.5, vol: v, d: 0.08, pan, echo: 0.5 }); }
    else if (surf === 'armor') { noiseHit(A, t, { type: 'lowpass', f: 500, vol: v * 1.6, d: 0.1, pan, echo: 0.4 }); tone(A, t, { type: 'square', f: rand(900, 1300), vol: v * 0.12, d: 0.12, pan, cutoff: 3000 }); }
    else if (surf === 'heavy') { noiseHit(A, t, { type: 'lowpass', f: 260, vol: v * 2.2, d: 0.14, pan, echo: 0.3 }); }
    else noiseHit(A, t, { type: 'lowpass', f: rand(500, 800), vol: v, d: 0.07, pan });
  },
  knock: (A, t, o) => { for (let i = 0; i < 3; i++) { const tt = t + i * 0.55; noiseHit(A, tt, { f: 380, vol: 0.9, d: 0.12, echo: 0.6, pan: o.pan || 0 }); tone(A, tt, { f: 110, to: 70, vol: 0.6, d: 0.12, pan: o.pan || 0 }); } },
  phone: (A, t, o) => {
    const dur = 1.6, out = A._out((o.vol ?? 1) * 0.12, o.pan || 0, 0.4), g = A._gain(0);
    const a = A._osc('sine', 440), b = A._osc('sine', 480), am = A._osc('square', 20), amg = A._gain(0.5);
    a.connect(g); b.connect(g); am.connect(amg).connect(g.gain); g.connect(out);
    g.gain.setValueAtTime(0.5, t); g.gain.setValueAtTime(0, t + dur);
    [a, b, am].forEach(n => { n.start(t); n.stop(t + dur); });
  },
  thunder: (A, t, o) => { noiseHit(A, t, { f: 400, vol: 0.9 * (o.vol ?? 1), a: 0.05, d: 2.8, brown: true, sweepTo: 80, echo: 0.4 }); noiseHit(A, t + 0.05, { type: 'highpass', f: 2000, vol: 0.25, d: 0.3 }); },
  creak: (A, t, o) => {
    const o1 = A._osc('sawtooth', rand(70, 110)), f = A._filter('bandpass', 900, 10), g = A._gain(0), out = A._out(o.vol ?? 1, o.pan || 0, 0.3);
    o1.frequency.linearRampToValueAtTime(rand(120, 190), t + 0.9); o1.connect(f).connect(g).connect(out);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.4, t + 0.2); g.gain.linearRampToValueAtTime(0, t + 1.1);
    o1.start(t); o1.stop(t + 1.2);
  },
  door: (A, t, o) => { SFX.creak(A, t, { ...o, vol: (o.vol ?? 1) * 0.7 }); noiseHit(A, t + 0.9, { f: 300, vol: 0.5 * (o.vol ?? 1), d: 0.2, pan: o.pan || 0 }); },
  growl: (A, t, o) => {
    const v = (o.vol ?? 1), pan = o.pan || 0, out = A._out(v * 0.5, pan, 0.4);
    const s = A._osc('sawtooth', rand(42, 58)), f = A._filter('lowpass', 380, 4), g = A._gain(0);
    const lfo = A._osc('sine', 7), lg = A._gain(0.3); lfo.connect(lg).connect(g.gain);
    s.connect(f).connect(g).connect(out); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.7, t + 0.3); g.gain.linearRampToValueAtTime(0, t + 1.5);
    s.start(t); lfo.start(t); s.stop(t + 1.6); lfo.stop(t + 1.6);
    noiseHit(A, t, { f: 300, vol: v * 0.3, a: 0.2, d: 1.2, pan, brown: true });
  },
  screech: (A, t, o) => {
    tone(A, t, { type: 'sawtooth', f: 300, to: 1400, vol: 0.25 * (o.vol ?? 1), a: 0.05, d: 0.7, cutoff: 3000, echo: 0.5 });
    noiseHit(A, t, { type: 'bandpass', f: 2000, q: 2, vol: 0.3, a: 0.05, d: 0.7, sweepTo: 5000 });
  },
  pickup: (A, t) => { [880, 1175, 1568].forEach((f, i) => tone(A, t + i * 0.07, { type: 'triangle', f, vol: 0.18, d: 0.35, echo: 0.3 })); },
  note: (A, t) => { SFX.pageTurn(A, t, { vol: 0.8 }); },
  success: (A, t) => { [523, 659, 784, 1047].forEach((f, i) => tone(A, t + i * 0.09, { type: 'sine', f, vol: 0.2, d: 1.2, echo: 0.5 })); },
  fail: (A, t) => { tone(A, t, { type: 'square', f: 110, vol: 0.15, d: 0.35, cutoff: 900 }); tone(A, t + 0.15, { type: 'square', f: 98, vol: 0.15, d: 0.4, cutoff: 900 }); },
  click: (A, t) => noiseHit(A, t, { type: 'highpass', f: 3000, vol: 0.2, d: 0.03 }),
  beep: (A, t, o) => tone(A, t, { f: o.f || 960, vol: 0.08 * (o.vol ?? 1), d: 0.12, pan: o.pan || 0 }),
  monitor: (A, t, o) => { tone(A, t, { f: 1046, vol: 0.07 * (o.vol ?? 1), d: 0.1, pan: o.pan || 0, echo: 0.3 }); },
  flatline: (A, t, o) => tone(A, t, { f: 1046, vol: 0.06 * (o.vol ?? 1), a: 0.05, d: 2.5, pan: o.pan || 0 }),
  chime: (A, t) => { [659, 523, 392].forEach((f, i) => tone(A, t + i * 0.45, { f, vol: 0.12, d: 0.9, echo: 0.6 })); },
  static: (A, t, o) => noiseHit(A, t, { type: 'bandpass', f: 1800, q: 0.5, vol: 0.12 * (o.vol ?? 1), a: 0.02, d: o.dur || 0.6 }),
  trolley: (A, t, o) => {
    const dur = 2.4, n = A._noise(), f = A._filter('bandpass', 1400, 2), g = A._gain(0), out = A._out((o.vol ?? 1) * 0.5, o.pan || 0, 0.4);
    const am = A._osc('square', 16), amg = A._gain(0.5); am.connect(amg).connect(g.gain);
    n.connect(f).connect(g).connect(out); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.4); g.gain.linearRampToValueAtTime(0, t + dur);
    n.start(t); am.start(t); n.stop(t + dur); am.stop(t + dur);
    tone(A, t, { type: 'sawtooth', f: 1900, to: 2100, vol: 0.02, a: 0.3, d: 1.8, cutoff: 4000 });
  },
  spark: (A, t, o) => { for (let i = 0; i < 4; i++) noiseHit(A, t + i * rand(0.02, 0.07), { type: 'highpass', f: 4000, vol: 0.15 * (o.vol ?? 1), d: 0.02, pan: o.pan || 0 }); },
  footstepsFar: (A, t, o) => { for (let i = 0; i < 5; i++) SFX.step(A, t + i * 0.42, { surface: o.surface || 'tile', vol: 0.5 * (o.vol ?? 1), pan: o.pan || 0 }); },
  owl: (A, t, o) => { [0, 0.45].forEach(dt => tone(A, t + dt, { f: 390, to: 340, vol: 0.12 * (o.vol ?? 1), a: 0.05, d: 0.35, pan: o.pan || rand(-1, 1), echo: 0.6 })); },
  crow: (A, t, o) => { tone(A, t, { type: 'sawtooth', f: 520, to: 380, vol: 0.06, d: 0.25, cutoff: 1800, pan: o.pan || rand(-1, 1), echo: 0.5 }); },
  branch: (A, t, o) => { noiseHit(A, t, { type: 'highpass', f: 1500, vol: 0.5 * (o.vol ?? 1), a: 0.001, d: 0.06, pan: o.pan || 0 }); noiseHit(A, t + 0.03, { type: 'bandpass', f: 900, vol: 0.3 * (o.vol ?? 1), d: 0.12, pan: o.pan || 0, echo: 0.4 }); },
  rustle: (A, t, o) => noiseHit(A, t, { type: 'bandpass', f: 3500, q: 0.7, vol: 0.18 * (o.vol ?? 1), a: 0.2, d: 0.7, pan: o.pan || rand(-1, 1) }),
  rumbleHit: (A, t, o) => { noiseHit(A, t, { f: 120, vol: 0.9 * (o.vol ?? 1), a: 0.3, d: 1.8, brown: true, pan: o.pan || 0 }); tone(A, t, { f: 38, vol: 0.4 * (o.vol ?? 1), a: 0.3, d: 1.6 }); },
  shrine: (A, t) => { [220, 277.2, 329.6, 440, 554].forEach((f, i) => tone(A, t + i * 0.15, { type: 'sine', f, vol: 0.1, a: 0.8, d: 3.5, echo: 0.7 })); },
  bell: (A, t, o) => { [1, 2.41, 2.93, 4.1, 5.43].forEach((m, i) => tone(A, t, { f: (o.f || 196) * m, vol: (0.16 / (i + 1)) * (o.vol ?? 1), a: 0.005, d: 4, echo: 0.6, pan: o.pan || 0 })); },
  magic: (A, t, o) => { for (let i = 0; i < 6; i++) tone(A, t + i * 0.05, { f: rand(800, 2400), to: rand(1500, 3500), vol: 0.05 * (o.vol ?? 1), d: 0.6, echo: 0.6, pan: o.pan || 0 }); tone(A, t, { f: 220, to: 660, vol: 0.12 * (o.vol ?? 1), d: 0.8 }); },
  stoneDoor: (A, t, o) => { noiseHit(A, t, { f: 220, vol: 0.8 * (o.vol ?? 1), a: 0.3, d: 2.6, brown: true, echo: 0.3 }); tone(A, t, { f: 42, vol: 0.4, a: 0.3, d: 2.4 }); noiseHit(A, t + 2.7, { f: 500, vol: 0.6, d: 0.3 }); },
  clang: (A, t, o) => { [820, 1240, 1735, 2510].forEach((f, i) => tone(A, t, { type: 'triangle', f, vol: 0.12 / (i + 1) * (o.vol ?? 1), d: 0.7, echo: 0.4, pan: o.pan || 0 })); noiseHit(A, t, { type: 'highpass', f: 2500, vol: 0.4, d: 0.05 }); },
  warning: (A, t, o) => { tone(A, t, { type: 'sawtooth', f: 180, to: 720, vol: 0.14 * (o.vol ?? 1), a: 0.05, d: o.dur || 1, cutoff: 2400 }); tone(A, t, { type: 'square', f: 90, to: 360, vol: 0.06, a: 0.05, d: o.dur || 1, cutoff: 900 }); },
  charge: (A, t, o) => tone(A, t, { type: 'sine', f: 300, to: 1400, vol: 0.12, a: 0.1, d: o.dur || 0.8, echo: 0.3 }),
  projectile: (A, t, o) => { tone(A, t, { type: 'sine', f: 700, to: 180, vol: 0.18 * (o.vol ?? 1), d: 0.45, pan: o.pan || 0 }); noiseHit(A, t, { type: 'bandpass', f: 1200, vol: 0.2, d: 0.4, sweepTo: 300, pan: o.pan || 0 }); },
  sweep: (A, t, o) => { noiseHit(A, t, { type: 'bandpass', f: 300, q: 1, vol: 0.5, a: 0.3, d: 1.6, sweepTo: 2400, echo: 0.4 }); tone(A, t, { type: 'sawtooth', f: 60, to: 120, vol: 0.12, a: 0.3, d: 1.6, cutoff: 600 }); },
  shield: (A, t) => { [300, 450, 600].forEach(f => tone(A, t, { type: 'triangle', f, to: f * 1.5, vol: 0.08, a: 0.2, d: 1.2, echo: 0.5 })); },
  shatter: (A, t) => { noiseHit(A, t, { type: 'highpass', f: 3000, vol: 0.5, d: 0.6, echo: 0.6 }); [1600, 2300, 3100].forEach(f => tone(A, t, { type: 'triangle', f, vol: 0.06, d: 1, echo: 0.6 })); },
  hurt: (A, t) => { noiseHit(A, t, { f: 600, vol: 0.7, d: 0.25 }); tone(A, t, { type: 'square', f: 140, to: 60, vol: 0.2, d: 0.3, cutoff: 800 }); },
  bossHit: (A, t) => { SFX.clang(A, t, { vol: 1.4 }); tone(A, t, { type: 'sawtooth', f: 200, to: 50, vol: 0.3, d: 1, cutoff: 1200, echo: 0.6 }); },
  glitch: (A, t, o) => {
    const dur = o.dur || 0.8, s = A._osc('square', 200), g = A._gain(0.12), out = A._out(o.vol ?? 1);
    s.connect(g).connect(out);
    for (let x = 0; x < dur; x += 0.03) s.frequency.setValueAtTime(rand(60, 3000), t + x);
    g.gain.setValueAtTime(0, t + dur); s.start(t); s.stop(t + dur + 0.05);
    noiseHit(A, t, { type: 'bandpass', f: 1000, q: 0.3, vol: 0.2, a: 0.01, d: dur });
  },
  throw: (A, t) => noiseHit(A, t, { type: 'bandpass', f: 2500, q: 1, vol: 0.18, a: 0.02, d: 0.3, sweepTo: 600 }),
  clatter: (A, t, o) => { for (let i = 0; i < 4; i++) tone(A, t + i * rand(0.05, 0.12), { type: 'triangle', f: rand(1800, 3200), vol: 0.1 * (o.vol ?? 1) / (i + 1), d: 0.12, pan: o.pan || 0, echo: 0.4 }); },
  thud: (A, t, o) => { noiseHit(A, t, { f: 300, vol: 0.5 * (o.vol ?? 1), d: 0.2, pan: o.pan || 0, echo: 0.3 }); },
  wardrobe: (A, t) => { SFX.creak(A, t, { vol: 0.5 }); noiseHit(A, t + 0.4, { f: 400, vol: 0.4, d: 0.12 }); },
  breath: (A, t) => noiseHit(A, t, { type: 'bandpass', f: 900, q: 0.8, vol: 0.12, a: 0.3, d: 0.6 }),
  gasp: (A, t) => noiseHit(A, t, { type: 'bandpass', f: 1300, q: 1, vol: 0.3, a: 0.03, d: 0.4 }),
  sting: (A, t) => { tone(A, t, { type: 'sawtooth', f: 466, vol: 0.12, d: 1.2, cutoff: 3000, echo: 0.6 }); tone(A, t, { type: 'sawtooth', f: 493, vol: 0.12, d: 1.2, cutoff: 3000 }); tone(A, t, { f: 55, vol: 0.5, d: 1.5 }); },
  generator: (A, t) => { tone(A, t, { type: 'sawtooth', f: 30, to: 60, vol: 0.3, a: 0.4, d: 2, cutoff: 400 }); noiseHit(A, t, { f: 300, vol: 0.3, a: 0.5, d: 2 }); },
  switch: (A, t) => { noiseHit(A, t, { type: 'highpass', f: 2000, vol: 0.4, d: 0.04 }); tone(A, t, { f: 200, vol: 0.2, d: 0.05 }); },
};

export const Audio = new AudioEngine();
export { rand, pick };
