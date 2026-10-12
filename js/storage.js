// storage.js — persistent progress, settings and the player-behaviour profile
// that powers "The Living Nightmare" adaptive enemy system.

const KEY = 'nightmares-book-of-secrets-v1';

const DEFAULTS = () => ({
  settings: { master: 0.8, music: 0.6, sfx: 0.8, voice: 0.9, muted: false, subtitles: true, tts: true },
  completed: { hotel: false, hospital: false, forest: false, kingdom: false },
  stats: {
    hides: 0,
    hideSpots: {},          // { 'hotel:wardrobe-a': 3, ... }
    flashlightSeconds: 0,
    flashlightToggles: 0,
    noiseEvents: 0,
    noiseZones: {},         // { 'hospital:west': 4 } — where the player tends to be loud
    detections: 0,
    detectionsByLevel: {},
    distractions: 0,
    distractionsByLevel: {},
    whispersFollowed: 0,
    dodgeLeft: 0,           // boss fight: lateral dodge habits
    dodgeRight: 0,
    deaths: 0,
    playSeconds: 0,
    levelAttempts: {},
    bestTimes: {},
    choices: [],            // [{ level, id, value, at }]
  },
  introSeen: false,
});

function merge(base, extra) {
  for (const k in extra) {
    if (extra[k] && typeof extra[k] === 'object' && !Array.isArray(extra[k]) && base[k] && typeof base[k] === 'object') merge(base[k], extra[k]);
    else base[k] = extra[k];
  }
  return base;
}

let data = DEFAULTS();
try {
  const raw = localStorage.getItem(KEY);
  if (raw) data = merge(DEFAULTS(), JSON.parse(raw));
} catch (e) { /* storage unavailable: play without saving */ }

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  }, 150);
}

export const Store = {
  get data() { return data; },
  get settings() { return data.settings; },
  get stats() { return data.stats; },
  get completed() { return data.completed; },
  save,
  reset() {
    const settings = data.settings;
    data = DEFAULTS();
    data.settings = settings;
    data.introSeen = true;
    save();
  },
};

// ---------------------------------------------------------------------------
// Behaviour recording. Every call updates the saved profile.
// ---------------------------------------------------------------------------
const S = () => data.stats;
const bump = (obj, k, n = 1) => { obj[k] = (obj[k] || 0) + n; };

export const Memory = {
  hide(level, spotId) { S().hides++; bump(S().hideSpots, `${level}:${spotId}`); save(); },
  flashlightTime(dt) { S().flashlightSeconds += dt; },
  flashlightToggle() { S().flashlightToggles++; save(); },
  noise(level, zone) { S().noiseEvents++; if (zone) bump(S().noiseZones, `${level}:${zone}`); },
  detected(level) { S().detections++; bump(S().detectionsByLevel, level); save(); },
  distraction(level) { S().distractions++; bump(S().distractionsByLevel, level); save(); },
  whisperFollowed() { S().whispersFollowed++; save(); },
  dodge(dir) { if (dir < 0) S().dodgeLeft++; else S().dodgeRight++; },
  death() { S().deaths++; save(); },
  choice(level, id, value) { S().choices.push({ level, id, value, at: Date.now() }); if (S().choices.length > 60) S().choices.shift(); save(); },
  lastChoice(level, id) { const c = [...S().choices].reverse().find(c => c.level === level && c.id === id); return c ? c.value : null; },
  attempt(level) { bump(S().levelAttempts, level); save(); },
  complete(level, seconds) {
    data.completed[level] = true;
    const best = S().bestTimes[level];
    if (!best || seconds < best) S().bestTimes[level] = Math.round(seconds);
    save();
  },
  tick(dt) { S().playSeconds += dt; },

  // ---- queries used by enemy brains ----
  hideCount(level, spotId) { return S().hideSpots[`${level}:${spotId}`] || 0; },
  favouriteHide(level) {
    let best = null, n = 0;
    for (const k in S().hideSpots) if (k.startsWith(level + ':') && S().hideSpots[k] > n) { n = S().hideSpots[k]; best = k.slice(level.length + 1); }
    return best ? { id: best, count: n } : null;
  },
  zoneHeat(level, zone) { return S().noiseZones[`${level}:${zone}`] || 0; },
  distractionCount(level) { return S().distractionsByLevel[level] || 0; },
  detectionCount(level) { return S().detectionsByLevel[level] || 0; },
  // 0..1 — how much the player relies on the flashlight (seconds lit vs. time played).
  flashlightReliance() { const t = Math.max(60, S().playSeconds); return Math.min(1, S().flashlightSeconds / t); },
  // -1..1 — negative = player tends to dodge left, positive = right.
  dodgeBias() { const l = S().dodgeLeft, r = S().dodgeRight, n = l + r; return n < 4 ? 0 : (r - l) / n; },
};

// Human-readable summary of everything the book has learned (stats screen).
export function learnedSummary() {
  const s = S();
  const out = [];
  const fav = Memory.favouriteHide('hotel');
  if (fav && fav.count >= 2) out.push(`The Occupant checks the <b>${fav.id.replace(/-/g, ' ')}</b> first — you have hidden there ${fav.count} times. It listens longer at places you trust.`);
  const rel = Memory.flashlightReliance();
  if (rel > 0.25) out.push(`You keep your light on ${Math.round(rel * 100)}% of the time. Hotel and forest creatures notice light from further away.`);
  const d = Memory.distractionCount('hotel') + Memory.distractionCount('forest');
  if (d >= 3) out.push(`You have thrown ${d} distractions. Creatures now ignore some of your tricks and return sooner.`);
  const zones = Object.entries(s.noiseZones).filter(([k]) => k.startsWith('hospital:')).sort((a, b) => b[1] - a[1]);
  if (zones.length && zones[0][1] >= 3) out.push(`The patient wanders the <b>${zones[0][0].split(':')[1]}</b> corridors most — that is where you are loudest.`);
  if (s.whispersFollowed > 0) out.push(`You followed the forest's voice ${s.whispersFollowed} time(s). It calls to you more often now.`);
  const bias = Memory.dodgeBias();
  if (Math.abs(bias) > 0.2) out.push(`The king aims ahead of you — you tend to dodge <b>${bias < 0 ? 'left' : 'right'}</b>.`);
  if (s.detections >= 5) out.push(`You have been seen ${s.detections} times. The nightmares remember your shape.`);
  if (!out.length) out.push('The book is still watching. Play, hide, run — it will remember.');
  return out;
}
