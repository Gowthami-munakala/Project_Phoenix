// dialogue.js — queued voice lines with subtitles. Uses browser text-to-speech
// as the voice actor when available; if speech is unavailable, disabled or
// fails, subtitles are timed on their own so gameplay never stalls.
import { Audio } from './audio.js';
import { Store } from './storage.js';

// Voice profiles: TTS pitch/rate plus an optional sound texture underneath.
const PROFILES = {
  narrator:     { pitch: 0.75, rate: 0.86, texture: null, cls: '', voiceIndex: 0 },
  receptionist: { pitch: 1.25, rate: 0.82, texture: null, cls: '', voiceIndex: 1 },
  phone:        { pitch: 0.55, rate: 0.8, texture: 'static', cls: 'creature', voiceIndex: 2 },
  creature:     { pitch: 0.1, rate: 0.68, texture: 'growl', cls: 'creature', voiceIndex: 2 },
  whisper:      { pitch: 1.4, rate: 0.78, texture: 'whisper', cls: 'whisper', volume: 0.55, voiceIndex: 1 },
  speaker:      { pitch: 0.9, rate: 0.92, texture: 'static', cls: '', voiceIndex: 3 },
  patient:      { pitch: 0.3, rate: 0.7, texture: 'whisper', cls: 'creature', voiceIndex: 2 },
  you:          { pitch: 1.0, rate: 1.0, texture: null, cls: '', voiceIndex: 0 },
  king:         { pitch: 0.2, rate: 0.72, texture: 'rumbleHit', cls: 'creature', voiceIndex: 3 },
  book:         { pitch: 0.6, rate: 0.75, texture: 'pageTurn', cls: 'whisper', voiceIndex: 0 },
};

const wait = ms => new Promise(r => setTimeout(r, ms));

class DialogueSystem {
  constructor() {
    this.queue = [];
    this.busy = false;
    this.token = 0;
    this.el = null;
    this.voices = [];
    this.spoken = new Set();
    if ('speechSynthesis' in window) {
      const load = () => { this.voices = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)); };
      load();
      speechSynthesis.onvoiceschanged = load;
    }
  }

  attach(el) { this.el = el; }

  // say('narrator', 'text') or say([{who, text, name?}, ...]). Resolves when spoken.
  say(who, text, opts = {}) {
    const lines = Array.isArray(who) ? who : [{ who, text, ...opts }];
    return new Promise(resolve => {
      lines.forEach((l, i) => {
        // prevent the same line from stacking up in the queue
        if (this.queue.some(q => q.text === l.text)) { if (i === lines.length - 1) resolve(); return; }
        this.queue.push({ ...l, resolve: i === lines.length - 1 ? resolve : null });
      });
      this._pump();
    });
  }

  // Say a line only once per session key (e.g. per level attempt).
  once(key, who, text, opts) { if (this.spoken.has(key)) return Promise.resolve(); this.spoken.add(key); return this.say(who, text, opts); }

  get speaking() { return this.busy; }

  clear() {
    this.token++;
    this.queue.forEach(q => q.resolve && q.resolve());
    this.queue = [];
    this.busy = false;
    this.spoken.clear();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (this.el) this.el.innerHTML = '';
  }

  async _pump() {
    if (this.busy) return;
    this.busy = true;
    const token = this.token;
    while (this.queue.length && token === this.token) {
      const line = this.queue.shift();
      await this._play(line, token);
      if (line.resolve) line.resolve();
      if (token !== this.token) return;
      await wait(line.pause ?? 350);
    }
    if (token === this.token) { this.busy = false; if (this.el) this.el.innerHTML = ''; }
  }

  async _play(line, token) {
    const p = PROFILES[line.who] || PROFILES.narrator;
    const name = line.name ?? (line.who === 'narrator' ? 'Narrator' : line.who === 'you' ? 'You' : line.who[0].toUpperCase() + line.who.slice(1));
    if (this.el) {
      this.el.classList.toggle('hidden', !Store.settings.subtitles);
      this.el.innerHTML = `<div class="line ${p.cls}"><span class="who">${name}</span>${line.text}</div>`;
    }
    if (p.texture) Audio.play(p.texture, { vol: 0.5, gap: 0, dur: 1.6 });
    const minMs = Math.max(1600, line.text.length * 62) / (p.rate || 1);
    const s = Store.settings;
    const canSpeak = s.tts && !s.muted && 'speechSynthesis' in window && s.master * s.voice > 0.01;
    if (!canSpeak) { await wait(minMs); return; }
    await new Promise(resolve => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      try {
        const u = new SpeechSynthesisUtterance(line.text.replace(/<[^>]+>/g, '').replace(/\.\.\./g, '…'));
        u.pitch = p.pitch; u.rate = p.rate;
        u.volume = Math.min(1, s.master * s.voice * (p.volume ?? 1));
        if (this.voices.length) u.voice = this.voices[p.voiceIndex % this.voices.length];
        u.onend = () => setTimeout(finish, 150);
        u.onerror = finish;
        speechSynthesis.speak(u);
      } catch (e) { finish(); }
      // safety: never hang if the speech engine never reports back
      setTimeout(finish, minMs * 2.4 + 2500);
    });
    if (token !== this.token && 'speechSynthesis' in window) speechSynthesis.cancel();
  }
}

export const Dialogue = new DialogueSystem();
export { wait };
