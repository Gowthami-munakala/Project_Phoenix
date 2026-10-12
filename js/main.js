// main.js — boots the game: screen flow (gate → intro → book → level),
// main loop, pause menu, results screens and the finale.
import { Audio } from './audio.js';
import { Dialogue, wait } from './dialogue.js';
import { Store, Memory } from './storage.js';
import { Input, TILE } from './engine.js';
import { UI, setArt, art } from './ui.js';
import { LEVELS } from './levels/index.js';

const $ = s => document.querySelector(s);
const screens = ['gate', 'intro', 'book'];
function show(id) { screens.forEach(s => $('#' + s).classList.toggle('active', s === id)); }

class Game {
  constructor() {
    this.canvas = $('#game');
    this.ctx = this.canvas.getContext('2d');
    this.input = new Input();
    this.ui = UI;
    this.level = null;
    this.levelDef = null;
    this.paused = false;
    this.last = performance.now();
    this.makeGrain();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    Dialogue.attach($('#subtitles'));
    requestAnimationFrame(t => this.loop(t));
  }

  makeGrain() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'), img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0); this.grain = c;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = this.canvas.width = Math.floor(innerWidth * dpr);
    this.H = this.canvas.height = Math.floor(innerHeight * dpr);
    this.zoom = Math.min(this.W / (24 * TILE), this.H / (15 * TILE));
  }

  loop(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000); this.last = t;
    const L = this.level;
    if (L) {
      const running = !this.paused && !UI.modalOpen;
      if (running) { L.update(dt); Memory.tick(dt); }
      L.render(this.ctx, this.W, this.H, this.zoom);
      if (!running) this.input.flush();
      if (this.input.hit('pause') && !UI.modalOpen && !L.ended) this.pause();
    } else {
      this.input.flush();
    }
    requestAnimationFrame(t2 => this.loop(t2));
  }

  // ---------------- levels ----------------
  async enter(def) {
    Audio.init();
    this.exitLevel(true);
    this.levelDef = def;
    show(null);
    UI.cine.show({ text: `${def.num}\n${def.title}`, cls: '' });
    Audio.play('pageTurn'); Audio.setMusic(null, 1);
    Audio.stopAllLoops(0.8);
    await wait(1900);
    UI.cine.hide();
    this.startLevel(def);
  }

  startLevel(def) {
    this.exitLevel(true);
    this.levelDef = def;
    UI.hud.reset();
    $('#hud').classList.add('active');
    UI.hud.title(def.title);
    this.input.clearAll();
    const L = new def.Level(this);
    this.level = L;
    UI.hud.showThrow(!!L.throwable, L.throwable ? `throw ${L.throwable.name.toLowerCase()}` : '');
    L.refreshInventory();
    L.start();
  }

  exitLevel(silent) {
    if (this.level) { this.level.destroy(); this.level = null; }
    document.body.classList.remove('glitch-screen');
    $('#hud').classList.remove('active');
    Dialogue.clear();
    if (!silent) { UI.cine.hide(); this.ctx.fillStyle = '#000'; this.ctx.fillRect(0, 0, this.W, this.H); }
  }

  restart() { if (this.levelDef) this.startLevel(this.levelDef); }

  toBook() {
    this.exitLevel();
    this.ctx.fillStyle = '#000'; this.ctx.fillRect(0, 0, this.W, this.H);
    Audio.stopAllLoops(0.8);
    Audio.setMusic('menu');
    Audio.startLoop('wind', 0.5);
    buildBook();
    show('book');
  }

  pause() {
    if (!this.level || UI.modalOpen) return;
    this.paused = true;
    if ('speechSynthesis' in window) speechSynthesis.pause();
    UI.modal({
      title: 'Paused', html: `<p style="text-align:center;color:var(--ink-dim)">${this.levelDef.title}</p>`, cls: '',
      actions: [
        { label: 'Resume', primary: true },
        { label: 'Restart Level', onClick: () => setTimeout(() => this.restart(), 0) },
        { label: 'Sound Settings', close: false, onClick: () => UI.settings() },
        { label: 'Controls', close: false, onClick: () => UI.controls() },
        { label: 'Return to Book', onClick: () => setTimeout(() => this.toBook(), 0) },
      ],
      onClose: () => { this.paused = false; this.input.clearAll(); if ('speechSynthesis' in window) speechSynthesis.resume(); },
    });
  }

  showGameOver(level, title = 'YOU WERE FOUND', flavor = '') {
    if (level !== this.level) return;
    UI.modal({
      cls: 'wide', html: `<div class="result dead"><p class="num" style="letter-spacing:.3em;color:#a55">${this.levelDef.title}</p><h1>${title}</h1><p class="flavor">${flavor}</p>
        <p class="summary">The book has recorded how you were caught. Next time, it will remember.</p></div>`,
      actions: [{ label: 'Retry', primary: true, onClick: () => setTimeout(() => this.restart(), 0) }, { label: 'Return to Book', onClick: () => setTimeout(() => this.toBook(), 0) }],
      keys: e => e.code === 'Escape' || e.code === 'KeyE',
    });
  }

  showComplete(level, summary = '') {
    if (level !== this.level) return;
    const def = this.levelDef;
    const mins = s => `${(s / 60) | 0}:${String(Math.round(s % 60)).padStart(2, '0')}`;
    Audio.setMusic('ending', 1);
    if (def.id === 'kingdom') return this.finale(level);
    UI.modal({
      cls: 'wide', html: `<div class="result"><p style="letter-spacing:.3em;color:var(--gold);font-family:var(--display)">${def.num}</p><h1>LEVEL ${def.index + 1} COMPLETE</h1><p class="flavor">${def.title}</p>
        <p class="summary">Time ${mins(level.time)} · ${summary}</p><p style="color:var(--ink-dim)">The page seals itself with a burning mark. ${Object.values(Store.completed).filter(Boolean).length} of 4 nightmares survived.</p></div>`,
      actions: [{ label: 'Replay Level', onClick: () => setTimeout(() => this.restart(), 0) }, { label: 'Return to Book', primary: true, onClick: () => setTimeout(() => this.toBook(), 0) }],
      keys: e => e.code === 'Escape' || e.code === 'KeyE',
    });
  }

  // Level 4 ending: the four pages glow, the blank page speaks.
  async finale(level) {
    this.exitLevel(true);
    show('book'); buildBook(true);
    Audio.setMusic('ending', 1); Audio.startLoop('wind', 0.4);
    Audio.play('pageTurn');
    await wait(3200);
    show(null);
    UI.cine.show({ text: '', img: art('book', 1000) });
    Audio.play('pageTurn'); await wait(1600);
    UI.cine.text('…', 'type');
    await wait(1200);
    UI.cine.text('THE GREATEST NIGHTMARE\nWAS NEVER INSIDE THE BOOK.');
    await Dialogue.say('book', 'The greatest nightmare was never inside the book.');
    await wait(1600);
    UI.cine.text('IT WAS THE ONE\nWHO OPENED IT.', 'glitch');
    Audio.play('glitch', { dur: 0.6 });
    await Dialogue.say('book', 'It was the one who opened it.');
    await wait(1200);
    UI.cine.art(im => im.classList.add('closing'));
    Audio.play('bookSlam');
    await wait(1800);
    UI.cine.hide();
    const all = Object.values(Store.completed).every(Boolean);
    const n = Object.values(Store.completed).filter(Boolean).length;
    UI.modal({
      cls: 'wide', html: `<div class="result"><h1>${all ? 'ALL FOUR NIGHTMARES COMPLETED' : 'THE FINAL NIGHTMARE COMPLETED'}</h1>
        <p class="flavor" style="font-size:24px">THE END... FOR NOW.</p>
        <p class="summary">${all ? 'Every page glows. The book remembers everything you did.' : `${n} of 4 pages glow. The other nightmares are still waiting for you inside the book.`}</p></div>`,
      actions: [
        { label: 'Play Again', onClick: () => setTimeout(() => this.enter(LEVELS[0]), 0) },
        { label: 'View Statistics', close: false, onClick: () => UI.stats() },
        { label: 'Return to Book', primary: true, onClick: () => setTimeout(() => this.toBook(), 0) },
      ],
      keys: e => e.code === 'Escape' || e.code === 'KeyE',
    });
  }
}

const game = new Game();
window.__game = game; // handy for debugging in the console

// ---------------------------------------------------------------------------
// BOOK (level select) — exactly four pages, all open from the start.
// ---------------------------------------------------------------------------
function buildBook(allGlow = false) {
  const wrap = $('#pages'); wrap.innerHTML = '';
  LEVELS.forEach(def => {
    const done = Store.completed[def.id];
    const el = document.createElement('article');
    el.className = 'page' + (allGlow ? ' glow' : '');
    el.style.setProperty('--glow', def.glow);
    el.innerHTML = `<div class="num">PAGE ${def.num} · LEVEL ${def.index + 1}</div><h3>${def.title}</h3>
      <div class="art"><img alt="${def.title} illustration" /></div>
      <p>${def.description}</p>
      <div class="meta"><b>OBJECTIVE</b> ${def.objective}</div>
      <div class="meta"><b>ATMOSPHERE</b> ${def.atmosphere}</div>
      <div class="row"><span class="seal ${done ? '' : 'none'}">${done ? '✦ Survived' : 'Unwritten'}</span><button class="btn primary">Enter Nightmare</button></div>`;
    setArt(el.querySelector('img'), def.art, 640);
    const go = () => { Audio.init(); Audio.play('pageTurn'); game.enter(def); };
    el.querySelector('.btn').onclick = e => { e.stopPropagation(); go(); };
    el.onclick = go;
    wrap.appendChild(el);
  });
  const n = Object.values(Store.completed).filter(Boolean).length;
  $('#book-foot').textContent = n === 4 ? 'All four pages glow. The book remembers you.' : `Four pages. Four nightmares. Every page is open to you — ${n} of 4 survived.`;
}

// ---------------------------------------------------------------------------
// CINEMATIC INTRO (≈12 seconds, skippable)
// ---------------------------------------------------------------------------
let introTimers = [], heartTimer = null, introDone = false;
function clearIntro() { introTimers.forEach(clearTimeout); introTimers = []; clearInterval(heartTimer); heartTimer = null; }
const at = (ms, fn) => introTimers.push(setTimeout(fn, ms));

function playIntro() {
  clearIntro(); introDone = false;
  const intro = $('#intro'), text = $('#intro-text'), book = $('#intro-book'), title = $('#title-block');
  intro.classList.remove('menu'); book.classList.remove('show', 'opening'); title.classList.remove('show'); text.classList.remove('show');
  show('intro');
  Audio.setMusic('intro', 3);
  Audio.startLoop('wind', 0.55);
  heartTimer = setInterval(() => Audio.play('heartbeat', { vol: 0.8, gap: 0.5 }), 1150);
  Audio.play('heartbeat');
  at(900, () => Audio.play('whisper', { pan: -0.7, dur: 2 }));
  at(1600, () => { text.textContent = 'Every nightmare begins with a story...'; text.classList.add('show'); Dialogue.say('narrator', 'Every nightmare begins with a story...'); });
  at(4800, () => { text.classList.remove('show'); Audio.play('bookSlam'); flash(); });
  at(5400, () => Audio.play('pageTurn'));
  at(6300, () => Audio.play('pageTurn', { vol: 0.7 }));
  at(6900, () => { text.innerHTML = 'But some stories... are waiting for <b style="color:#ff7a2f">YOU</b>.'; text.classList.add('show'); Dialogue.say('narrator', 'But some stories... are waiting for YOU.'); });
  at(7600, () => Audio.play('whisper', { pan: 0.7, dur: 1.6 }));
  at(10600, () => { text.classList.remove('show'); book.classList.add('show'); Audio.play('magic'); clearInterval(heartTimer); });
  at(12200, () => revealTitle());
}
function revealTitle() {
  clearIntro(); introDone = true;
  Store.data.introSeen = true; Store.save();
  $('#intro').classList.add('menu');
  $('#intro-text').classList.remove('show');
  $('#intro-book').classList.add('show');
  $('#title-block').classList.add('show');
  Audio.setMusic('menu', 3);
}
function flash() { const f = document.createElement('div'); f.style.cssText = 'position:absolute;inset:0;background:#ffcf9a;opacity:.35;z-index:9;pointer-events:none;transition:opacity .6s'; $('#intro').appendChild(f); requestAnimationFrame(() => f.style.opacity = 0); setTimeout(() => f.remove(), 700); }

async function openBook() {
  clearIntro();
  const book = $('#intro-book');
  if (!introDone) revealTitle();
  $('#title-block').classList.remove('show');
  Audio.play('bookSlam', { gap: 0 });
  book.classList.add('opening');
  setTimeout(() => Audio.play('pageTurn'), 400);
  setTimeout(() => Audio.play('pageTurn', { vol: 0.7 }), 900);
  await wait(1500);
  book.classList.remove('opening');
  game.toBook();
}
function skipIntro() { clearIntro(); Dialogue.clear(); revealTitle(); game.toBook(); }

// ---------------------------------------------------------------------------
// WIRING
// ---------------------------------------------------------------------------
setArt($('#intro-book img'), 'book', 1200);

function begin() {
  if (!$('#gate').classList.contains('active')) return;
  Audio.init();
  UI.syncMute();
  playIntro();
}
$('#gate-btn').addEventListener('click', begin);
window.addEventListener('keydown', e => { if ($('#gate').classList.contains('active') && !e.repeat) begin(); });

document.addEventListener('click', e => {
  const b = e.target.closest('[data-action]'); if (!b) return;
  Audio.init();
  const a = b.dataset.action;
  if (a !== 'mute') Audio.play('click');
  switch (a) {
    case 'open-book': openBook(); break;
    case 'skip-intro': skipIntro(); break;
    case 'settings': UI.settings(); break;
    case 'stats': UI.stats(() => buildBook()); break;
    case 'controls': UI.controls(); break;
    case 'replay-intro': playIntro(); break;
    case 'to-title': show('intro'); revealTitle(); break;
    case 'pause': game.pause(); break;
    case 'mute': toggleMute(); break;
  }
});
function toggleMute() { Store.settings.muted = !Store.settings.muted; Store.save(); Audio.applySettings(); UI.syncMute(); if (Store.settings.muted && 'speechSynthesis' in window) speechSynthesis.cancel(); }
window.addEventListener('keydown', e => { if (e.code === 'KeyM' && !e.repeat && !$('#gate').classList.contains('active') && !/INPUT/.test(document.activeElement?.tagName || '')) toggleMute(); });
// browsers may suspend audio when the tab is hidden
document.addEventListener('visibilitychange', () => { if (document.hidden && game.level && !UI.modalOpen && !game.level.ended) game.pause(); });
