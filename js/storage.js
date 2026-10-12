// storage.js — persistent progress, Phoenix Coins,
// Phantom Warning and The Living Nightmare behaviour profile.

const KEY = 'nightmares-book-of-secrets-v1';

const DEFAULTS = () => ({
  coins: 1000,

  settings: {
    master: 0.8,
    music: 0.6,
    sfx: 0.8,
    voice: 0.9,
    muted: false,
    subtitles: true,
    tts: true
  },

  completed: {
    hotel: false,
    hospital: false,
    forest: false,
    kingdom: false
  },

  stats: {
    hides: 0,
    hideSpots: {},
    flashlightSeconds: 0,
    flashlightToggles: 0,
    noiseEvents: 0,
    noiseZones: {},
    detections: 0,
    detectionsByLevel: {},
    distractions: 0,
    distractionsByLevel: {},
    whispersFollowed: 0,
    dodgeLeft: 0,
    dodgeRight: 0,
    deaths: 0,
    playSeconds: 0,
    levelAttempts: {},
    bestTimes: {},
    choices: [],

    // Phantom Warning statistics
    phantomWarningsHeard: 0,
    phantomWarningsFollowed: 0,
    phantomWarningsIgnored: 0
  },

  introSeen: false
});

// --------------------------------------------------
// MERGE SAVED DATA WITH DEFAULTS
// --------------------------------------------------

function merge(base, extra) {
  for (const k in extra) {
    if (
      extra[k] &&
      typeof extra[k] === 'object' &&
      !Array.isArray(extra[k]) &&
      base[k] &&
      typeof base[k] === 'object'
    ) {
      merge(base[k], extra[k]);
    } else {
      base[k] = extra[k];
    }
  }

  return base;
}

let data = DEFAULTS();

try {
  const raw = localStorage.getItem(KEY);

  if (raw) {
    data = merge(DEFAULTS(), JSON.parse(raw));
  }
} catch (e) {
  // The game can continue if storage is unavailable.
}

// Validate coin balance.
if (!Number.isSafeInteger(data.coins) || data.coins < 0) {
  data.coins = 1000;
}

// Ensure Phantom Warning counters exist for older saves.
for (const key of [
  'phantomWarningsHeard',
  'phantomWarningsFollowed',
  'phantomWarningsIgnored'
]) {
  if (
    !Number.isSafeInteger(data.stats[key]) ||
    data.stats[key] < 0
  ) {
    data.stats[key] = 0;
  }
}

// --------------------------------------------------
// SAVE SYSTEM
// --------------------------------------------------

let saveTimer = null;

export function save() {
  clearTimeout(saveTimer);

  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      // Ignore storage errors.
    }
  }, 150);
}

// --------------------------------------------------
// STORE: COINS, SETTINGS AND PROGRESS
// --------------------------------------------------

export const Store = {
  get data() {
    return data;
  },

  get settings() {
    return data.settings;
  },

  get stats() {
    return data.stats;
  },

  get completed() {
    return data.completed;
  },

  // Current Phoenix Coins balance.
  get coins() {
    return data.coins;
  },

  // Award Phoenix Coins.
  addCoins(amount) {
    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      !Number.isSafeInteger(data.coins + amount)
    ) {
      return false;
    }

    data.coins += amount;
    save();

    return data.coins;
  },

  // Spend coins without allowing a negative balance.
  spendCoins(amount) {
    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      data.coins < amount
    ) {
      return false;
    }

    data.coins -= amount;
    save();

    return true;
  },

  // Check whether an item is affordable.
  canAfford(amount) {
    return (
      Number.isSafeInteger(amount) &&
      amount > 0 &&
      data.coins >= amount
    );
  },

  save,

  // Reset progress while preserving sound settings.
  reset() {
    const settings = data.settings;

    data = DEFAULTS();
    data.settings = settings;
    data.introSeen = true;

    save();
  }
};

// --------------------------------------------------
// PLAYER BEHAVIOUR RECORDING
// THE LIVING NIGHTMARE SYSTEM
// --------------------------------------------------

const S = () => data.stats;

const bump = (obj, k, n = 1) => {
  obj[k] = (obj[k] || 0) + n;
};

export const Memory = {
  hide(level, spotId) {
    S().hides++;
    bump(S().hideSpots, `${level}:${spotId}`);
    save();
  },

  flashlightTime(dt) {
    S().flashlightSeconds += dt;
  },

  flashlightToggle() {
    S().flashlightToggles++;
    save();
  },

  noise(level, zone) {
    S().noiseEvents++;

    if (zone) {
      bump(S().noiseZones, `${level}:${zone}`);
    }
  },

  detected(level) {
    S().detections++;
    bump(S().detectionsByLevel, level);
    save();
  },

  distraction(level) {
    S().distractions++;
    bump(S().distractionsByLevel, level);
    save();
  },

  whisperFollowed() {
    S().whispersFollowed++;
    save();
  },

  dodge(dir) {
    if (dir < 0) {
      S().dodgeLeft++;
    } else {
      S().dodgeRight++;
    }
  },

  death() {
    S().deaths++;
    save();
  },

  choice(level, id, value) {
    S().choices.push({
      level,
      id,
      value,
      at: Date.now()
    });

    if (S().choices.length > 60) {
      S().choices.shift();
    }

    save();
  },

  lastChoice(level, id) {
    const c = [...S().choices]
      .reverse()
      .find(c => c.level === level && c.id === id);

    return c ? c.value : null;
  },

  attempt(level) {
    bump(S().levelAttempts, level);
    save();
  },

  complete(level, seconds) {
    data.completed[level] = true;

    const best = S().bestTimes[level];

    if (!best || seconds < best) {
      S().bestTimes[level] = Math.round(seconds);
    }

    save();
  },

  tick(dt) {
    S().playSeconds += dt;
  },

  // ----------------------------------------------
  // PHANTOM WARNING SYSTEM
  // ----------------------------------------------

  // Record that the player heard a warning.
  phantomWarningHeard() {
    S().phantomWarningsHeard++;
    save();
  },

  // Record that the player followed a warning.
  phantomWarningFollowed() {
    S().phantomWarningsFollowed++;
    save();
  },

  // Record that the player ignored a warning.
  phantomWarningIgnored() {
    S().phantomWarningsIgnored++;
    save();
  },

  // Return the player's saved warning statistics.
  phantomWarningProfile() {
    const s = S();

    const heard = s.phantomWarningsHeard;
    const followed = s.phantomWarningsFollowed;
    const ignored = s.phantomWarningsIgnored;

    return {
      heard,
      followed,
      ignored,

      followRate: heard > 0
        ? Math.min(1, followed / heard)
        : 0,

      ignoreRate: heard > 0
        ? Math.min(1, ignored / heard)
        : 0,

      behaviour:
        followed > ignored
          ? 'trusts-whispers'
          : ignored > followed
            ? 'distrusts-whispers'
            : 'unpredictable'
    };
  },

  // Choose a future warning style based on player behaviour.
  phantomWarningStyle() {
    const profile = this.phantomWarningProfile();

    if (profile.behaviour === 'trusts-whispers') {
      return 'deceptive';
    }

    if (profile.behaviour === 'distrusts-whispers') {
      return 'urgent';
    }

    return 'unpredictable';
  },

  // ----------------------------------------------
  // ADAPTIVE ENEMY QUERIES
  // ----------------------------------------------

  hideCount(level, spotId) {
    return S().hideSpots[`${level}:${spotId}`] || 0;
  },

  favouriteHide(level) {
    let best = null;
    let n = 0;

    for (const k in S().hideSpots) {
      if (
        k.startsWith(level + ':') &&
        S().hideSpots[k] > n
      ) {
        n = S().hideSpots[k];
        best = k.slice(level.length + 1);
      }
    }

    return best ? { id: best, count: n } : null;
  },

  zoneHeat(level, zone) {
    return S().noiseZones[`${level}:${zone}`] || 0;
  },

  distractionCount(level) {
    return S().distractionsByLevel[level] || 0;
  },

  detectionCount(level) {
    return S().detectionsByLevel[level] || 0;
  },

  flashlightReliance() {
    const t = Math.max(60, S().playSeconds);

    return Math.min(1, S().flashlightSeconds / t);
  },

  dodgeBias() {
    const l = S().dodgeLeft;
    const r = S().dodgeRight;
    const n = l + r;

    return n < 4 ? 0 : (r - l) / n;
  }
};

// --------------------------------------------------
// HUMAN-READABLE ADAPTIVE MEMORY SUMMARY
// --------------------------------------------------

export function learnedSummary() {
  const s = S();
  const out = [];

  const fav = Memory.favouriteHide('hotel');

  if (fav && fav.count >= 2) {
    out.push(
      `The Occupant checks the <b>${fav.id.replace(/-/g, ' ')}</b> first — you have hidden there ${fav.count} times. It listens longer at places you trust.`
    );
  }

  const rel = Memory.flashlightReliance();

  if (rel > 0.25) {
    out.push(
      `You keep your light on ${Math.round(rel * 100)}% of the time. Hotel and forest creatures notice light from further away.`
    );
  }

  const d =
    Memory.distractionCount('hotel') +
    Memory.distractionCount('forest');

  if (d >= 3) {
    out.push(
      `You have thrown ${d} distractions. Creatures now ignore some of your tricks and return sooner.`
    );
  }

  const zones = Object.entries(s.noiseZones)
    .filter(([k]) => k.startsWith('hospital:'))
    .sort((a, b) => b[1] - a[1]);

  if (zones.length && zones[0][1] >= 3) {
    out.push(
      `The patient wanders the <b>${zones[0][0].split(':')[1]}</b> corridors most — that is where you are loudest.`
    );
  }

  if (s.whispersFollowed > 0) {
    out.push(
      `You followed the forest's voice ${s.whispersFollowed} time(s). It calls to you more often now.`
    );
  }

  const bias = Memory.dodgeBias();

  if (Math.abs(bias) > 0.2) {
    out.push(
      `The king aims ahead of you — you tend to dodge <b>${bias < 0 ? 'left' : 'right'}</b>.`
    );
  }

  if (s.detections >= 5) {
    out.push(
      `You have been seen ${s.detections} times. The nightmares remember your shape.`
    );
  }

  if (s.phantomWarningsHeard > 0) {
    out.push(
      `You have heard ${s.phantomWarningsHeard} Phantom Warning(s). The voice remembers your reactions.`
    );
  }

  if (s.phantomWarningsFollowed > 0) {
    out.push(
      `You followed ${s.phantomWarningsFollowed} Phantom Warning(s). The nightmare is learning to influence your decisions.`
    );
  }

  if (!out.length) {
    out.push(
      'The book is still watching. Play, hide, run — it will remember.'
    );
  }

  return out;
}
