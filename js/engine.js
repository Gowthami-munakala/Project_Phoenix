// engine.js — shared game systems used by every level: input, tile maps,
// collision, path-finding, line of sight, ray-cast lighting, the player,
// distractions and the BaseLevel class that new levels extend.
import { Audio } from './audio.js';
import { Dialogue } from './dialogue.js';
import { Memory } from './storage.js';

export const TILE = 32;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const angleDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
export const rnd = (a, b) => a + Math.random() * (b - a);
export const choose = arr => arr[(Math.random() * arr.length) | 0];
export function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
// deterministic per-tile noise for map painting
export const hash = (x, y, s = 0) => { const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); };

// ---------------------------------------------------------------------------
// INPUT
// ---------------------------------------------------------------------------
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  KeyE: 'interact', Enter: 'interact', KeyF: 'light', KeyQ: 'throw', Escape: 'pause', KeyP: 'pause', ShiftLeft: 'run', ShiftRight: 'run',
  Space: 'action', KeyM: 'mute',
};
export class Input {
  constructor() {
    this.down = new Set(); this.hits = new Set();
    window.addEventListener('keydown', e => {
      const k = KEYMAP[e.code]; if (!k) return;
      if (['up', 'down', 'left', 'right', 'action'].includes(k) && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) e.preventDefault();
      if (!e.repeat) this.hits.add(k);
      this.down.add(k);
    });
    window.addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) this.down.delete(k); });
    window.addEventListener('blur', () => { this.down.clear(); });
  }
  is(k) { return this.down.has(k); }
  hit(k) { if (this.hits.has(k)) { this.hits.delete(k); return true; } return false; }
  flush() { this.hits.clear(); }
  clearAll() { this.hits.clear(); this.down.clear(); }
}

// ---------------------------------------------------------------------------
// TILE MAP
// ---------------------------------------------------------------------------
export class TileMap {
  // rows: array of strings. solid / opaque: strings of tile characters.
  constructor(rows, { solid = '#', opaque = null } = {}) {
    this.rows = rows.map(r => r.split(''));
    this.h = rows.length; this.w = Math.max(...rows.map(r => r.length));
    this.solidChars = new Set(solid.split(''));
    this.opaqueChars = new Set((opaque ?? solid).split(''));
    this.override = new Map(); // "x,y" -> { solid, opaque }
  }
  get(tx, ty) { return (this.rows[ty] && this.rows[ty][tx]) || '#'; }
  set(tx, ty, ch) { if (this.rows[ty]) this.rows[ty][tx] = ch; }
  setBlock(tx, ty, solid, opaque = solid) { const k = tx + ',' + ty; if (solid === null) this.override.delete(k); else this.override.set(k, { solid, opaque }); }
  solid(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return true;
    const o = this.override.get(tx + ',' + ty); if (o) return o.solid;
    return this.solidChars.has(this.get(tx, ty));
  }
  opaque(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return true;
    const o = this.override.get(tx + ',' + ty); if (o) return o.opaque;
    return this.opaqueChars.has(this.get(tx, ty));
  }
  solidAt(x, y) { return this.solid(Math.floor(x / TILE), Math.floor(y / TILE)); }
  opaqueAt(x, y) { return this.opaque(Math.floor(x / TILE), Math.floor(y / TILE)); }
  find(ch) { const out = []; this.rows.forEach((r, y) => r.forEach((c, x) => { if (c === ch) out.push({ x, y }); })); return out; }
  center(tx, ty) { return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 }; }
  los(x1, y1, x2, y2) {
    const d = Math.hypot(x2 - x1, y2 - y1), steps = Math.ceil(d / 8);
    for (let i = 1; i < steps; i++) { const t = i / steps; if (this.opaqueAt(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false; }
    return true;
  }
  ray(x, y, ang, range) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    for (let d = 4; d < range; d += 6) { if (this.opaqueAt(x + dx * d, y + dy * d)) return d; }
    return range;
  }
  // BFS path on the grid (8-directional without corner cutting). Returns world points.
  path(from, to, maxNodes = 4000) {
    const sx = Math.floor(from.x / TILE), sy = Math.floor(from.y / TILE);
    let tx = Math.floor(to.x / TILE), ty = Math.floor(to.y / TILE);
    if (this.solid(tx, ty)) { const n = this.nearestOpen(tx, ty); if (!n) return []; tx = n.x; ty = n.y; }
    if (sx === tx && sy === ty) return [{ x: to.x, y: to.y }];
    const W = this.w, key = (x, y) => y * W + x;
    const prev = new Map([[key(sx, sy), -1]]);
    const q = [[sx, sy]]; let head = 0, found = false;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (head < q.length && head < maxNodes) {
      const [cx, cy] = q[head++];
      if (cx === tx && cy === ty) { found = true; break; }
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy, k = key(nx, ny);
        if (prev.has(k) || this.solid(nx, ny)) continue;
        if (dx && dy && (this.solid(cx + dx, cy) || this.solid(cx, cy + dy))) continue;
        prev.set(k, key(cx, cy)); q.push([nx, ny]);
      }
    }
    if (!found) return [];
    const pts = []; let k = key(tx, ty);
    while (k !== -1 && k !== key(sx, sy)) { const x = k % W, y = (k / W) | 0; pts.unshift(this.center(x, y)); k = prev.get(k); }
    return pts;
  }
  nearestOpen(tx, ty) {
    for (let r = 1; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!this.solid(tx + dx, ty + dy)) return { x: tx + dx, y: ty + dy };
    return null;
  }
  randomOpenNear(x, y, radiusTiles) {
    for (let i = 0; i < 30; i++) {
      const tx = Math.floor(x / TILE + rnd(-radiusTiles, radiusTiles)), ty = Math.floor(y / TILE + rnd(-radiusTiles, radiusTiles));
      if (!this.solid(tx, ty)) return this.center(tx, ty);
    }
    return { x, y };
  }
}

// circle vs tile-grid movement with wall sliding
export function moveCircle(map, e, dx, dy, extraSolid) {
  const blocked = (x, y) => {
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, px = x + Math.cos(a) * e.r, py = y + Math.sin(a) * e.r;
      if (map.solidAt(px, py)) return true;
    }
    return extraSolid ? extraSolid(x, y, e.r) : false;
  };
  let moved = false;
  if (dx && !blocked(e.x + dx, e.y)) { e.x += dx; moved = true; }
  if (dy && !blocked(e.x, e.y + dy)) { e.y += dy; moved = true; }
  return moved;
}

// visibility polygon for lights (ray-cast against opaque tiles)
export function lightPoly(map, x, y, a0, a1, range, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); const d = map.ray(x, y, a, range); pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d]); }
  return pts;
}

// ---------------------------------------------------------------------------
// BASE LEVEL — subclasses describe their world; this runs the shared systems.
// ---------------------------------------------------------------------------
const ABORT = Symbol('abort');

export class BaseLevel {
  constructor(game) {
    this.game = game; this.ui = game.ui; this.input = game.input;
    this.time = 0; this.alive = true; this.frozen = false; this.ended = false;
    this.interactables = []; this.enemies = []; this.lights = []; this.particles = []; this.projectiles = [];
    this.inventory = []; this.objectives = [];
    this.waiters = [];
    this.cam = { x: 0, y: 0 };
    this.darkness = 0.94;
    this.flashlight = { allowed: true, on: false, range: 270, angle: 0.55, battery: null };
    this.throwable = null; // { name, count }
    this.timeLeft = null;
    this.threat = 0;
    this.musicName = null;
    this.surface = 'wood';
    this.ambientSounds = []; this.ambientTimer = 6; this.lastAmbient = null;
    this.player = { x: 0, y: 0, r: 10, angle: 0, speed: 108, stamina: 1, hidden: null, moving: false, stepT: 0, hp: null, invuln: 0, vx: 0, vy: 0 };
    this.lightCanvas = document.createElement('canvas');
    this.lightCtx = this.lightCanvas.getContext('2d');
  }

  // ---- lifecycle ----
  start() { Memory.attempt(this.id); this.prerender(); this.onStart?.(); }
  destroy() { this.alive = false; this.waiters.forEach(w => w.resolve()); this.waiters = []; Dialogue.clear(); Audio.stopAllLoops(0.6); }

  // async scripted sequences that cancel cleanly when the level ends
  run(fn) { fn().catch(e => { if (e !== ABORT) console.error(e); }); }
  w(sec) { if (!this.alive) return Promise.reject(ABORT); return new Promise((resolve, reject) => this.waiters.push({ at: this.time + sec, resolve: () => this.alive ? resolve() : reject(ABORT) })); }
  async say(who, text, opts) { if (!this.alive) throw ABORT; await Dialogue.say(who, text, opts); if (!this.alive) throw ABORT; }
  sayNow(who, text, opts) { if (this.alive) Dialogue.say(who, text, opts); }
  async cine(fn) { this.frozen = true; try { await fn(); } finally { if (this.alive) this.frozen = false; } }
  waitFor(cond) { return new Promise((resolve, reject) => { const tick = () => { if (!this.alive) return reject(ABORT); if (cond()) resolve(); else requestAnimationFrame(tick); }; tick(); }); }

  // ---- objectives & inventory ----
  setObjectives(list) { this.objectives = list.map(o => ({ ...o, done: false })); this.ui.hud.objectives(this.objectives); }
  addObjective(id, text) { if (this.objectives.find(o => o.id === id)) return; this.objectives.push({ id, text, done: false, fresh: true }); this.ui.hud.objectives(this.objectives); Audio.play('pageTurn', { vol: 0.5 }); }
  done(id) { const o = this.objectives.find(o => o.id === id); if (o && !o.done) { o.done = true; this.ui.hud.objectives(this.objectives); Audio.play('success'); } }
  isDone(id) { return !!this.objectives.find(o => o.id === id && o.done); }
  give(item) { if (!this.inventory.includes(item)) { this.inventory.push(item); this.refreshInventory(); Audio.play('pickup'); } }
  take(item) { this.inventory = this.inventory.filter(i => i !== item); this.refreshInventory(); }
  has(item) { return this.inventory.includes(item); }
  refreshInventory() { const items = [...this.inventory]; if (this.throwable) items.push(`${this.throwable.name} ×${this.throwable.count}`); this.ui.hud.inventory(items); }

  alert(text, secs = 2.5) { this.ui.hud.alert(text, secs); }
  learned(text) { this.ui.hud.learned(text); }

  addInteract(o) { const it = { r: 36, enabled: true, revealed: !o.hidden, ...o }; this.interactables.push(it); return it; }
  addLight(l) { const it = { r: 140, flicker: 0, on: true, color: null, ...l }; this.lights.push(it); return it; }

  // Noise propagates to every enemy that can hear it.
  noise(x, y, radius, kind = 'noise', zone) {
    Memory.noise(this.id, zone || this.zoneAt?.(x, y));
    this.enemies.forEach(e => e.hear && e.hear(x, y, radius, kind));
  }

  // ---- game flow ----
  gameOver(title, flavor) {
    if (this.ended) return; this.ended = true; this.frozen = true;
    Memory.death(); Audio.play('screech'); Audio.play('sting'); Audio.setMusic(null, 0.5); Audio.stopLoop('heart');
    setTimeout(() => this.game.showGameOver(this, title, flavor), 900);
  }
  complete(summary) {
    if (this.ended) return; this.ended = true; this.frozen = true;
    Memory.complete(this.id, this.time);
    this.game.showComplete(this, summary);
  }

  // ---- per-frame ----
  update(dt) {
    this.time += dt;
    for (let i = this.waiters.length - 1; i >= 0; i--) if (this.time >= this.waiters[i].at) { const w = this.waiters.splice(i, 1)[0]; w.resolve(); }
    if (!this.alive) return;
    if (!this.frozen) {
      this.updatePlayer(dt);
      this.updateProjectiles(dt);
      this.enemies.forEach(e => e.update(dt));
      this.updateThreat(dt);
      if (this.timeLeft !== null && !this.ended) {
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) { this.timeLeft = 0; this.onTimeout?.(); }
      }
      this.updateAmbient(dt);
    }
    this.particles = this.particles.filter(p => (p.life -= dt) > 0);
    this.particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; });
    this.onUpdate?.(dt);
    this.updateHud();
    Audio.setListener(this.player.x, this.player.y);
  }

  updatePlayer(dt) {
    const p = this.player, I = this.input;
    if (p.invuln > 0) p.invuln -= dt;
    if (I.hit('interact')) this.tryInteract();
    if (p.hidden) { p.moving = false; this.onHiddenUpdate?.(dt); return; }
    let dx = (I.is('right') ? 1 : 0) - (I.is('left') ? 1 : 0);
    let dy = (I.is('down') ? 1 : 0) - (I.is('up') ? 1 : 0);
    const len = Math.hypot(dx, dy);
    p.moving = len > 0;
    const running = p.moving && I.is('run') && p.stamina > 0.05;
    p.running = running;
    if (running) p.stamina = Math.max(0, p.stamina - dt * 0.28); else p.stamina = Math.min(1, p.stamina + dt * (p.moving ? 0.12 : 0.22));
    if (p.moving) {
      dx /= len; dy /= len;
      const sp = p.speed * (running ? 1.6 : 1) * (this.speedMul || 1) * dt;
      p.vx = dx; p.vy = dy;
      moveCircle(this.map, p, dx * sp, dy * sp, this.extraSolid?.bind(this));
      const target = Math.atan2(dy, dx);
      p.angle += angleDiff(p.angle, target) * Math.min(1, dt * 14);
      p.stepT -= dt;
      if (p.stepT <= 0) {
        p.stepT = running ? 0.27 : 0.45;
        Audio.play('step', { surface: this.surfaceAt?.(p.x, p.y) || this.surface, vol: running ? 1 : 0.6, gap: 0.1 });
        if (running) this.noise(p.x, p.y, 230, 'run');
      }
    } else { p.vx = 0; p.vy = 0; }
    // flashlight
    const fl = this.flashlight;
    if (fl.allowed && I.hit('light')) {
      if (fl.battery !== null && fl.battery <= 0) { this.alert('The flashlight is dead'); Audio.play('click'); }
      else { fl.on = !fl.on; Audio.play('click'); Memory.flashlightToggle(); }
    }
    if (fl.on) {
      Memory.flashlightTime(dt);
      if (fl.battery !== null) { fl.battery -= dt * (fl.drain || 0.012); if (fl.battery <= 0) { fl.battery = 0; fl.on = false; this.alert('The flashlight flickers out'); } }
      this.interactables.forEach(it => { if (!it.revealed && this.inFlashlight(it.x, it.y)) { it.revealed = true; Audio.play('magic', { vol: 0.4 }); this.onReveal?.(it); } });
    }
    if (I.hit('throw')) this.throwDistraction();
  }

  inFlashlight(x, y) {
    const p = this.player, fl = this.flashlight;
    if (!fl.on) return false;
    const d = Math.hypot(x - p.x, y - p.y);
    if (d > fl.range * 0.9) return false;
    if (Math.abs(angleDiff(p.angle, Math.atan2(y - p.y, x - p.x))) > fl.angle) return false;
    return this.map.los(p.x, p.y, x, y);
  }

  nearestInteract() {
    const p = this.player; let best = null, bd = 1e9;
    for (const it of this.interactables) {
      if (!it.enabled || !it.revealed) continue;
      if (it.cond && !it.cond()) continue;
      if (p.hidden && it !== p.hidden.it) continue;
      const d = Math.hypot(it.x - p.x, it.y - p.y);
      if (d < it.r && d < bd) { bd = d; best = it; }
    }
    return best;
  }
  tryInteract() {
    const it = this.nearestInteract(); if (!it) return;
    if (it.once) it.enabled = false;
    it.action(it);
  }

  throwDistraction() {
    const t = this.throwable, p = this.player;
    if (!t || p.hidden) return;
    if (t.count <= 0) { this.alert(`No ${t.name.toLowerCase()} left`); return; }
    t.count--; this.refreshInventory();
    Memory.distraction(this.id);
    Audio.play('throw');
    const range = 200, d = this.map.ray(p.x, p.y, p.angle, range) - 8;
    this.projectiles.push({ x: p.x, y: p.y, sx: p.x, sy: p.y, tx: p.x + Math.cos(p.angle) * d, ty: p.y + Math.sin(p.angle) * d, t: 0, dur: 0.45 });
  }
  updateProjectiles(dt) {
    this.projectiles = this.projectiles.filter(pr => {
      pr.t += dt / pr.dur;
      const k = Math.min(1, pr.t);
      pr.x = lerp(pr.sx, pr.tx, k); pr.y = lerp(pr.sy, pr.ty, k); pr.z = Math.sin(k * Math.PI) * 18;
      if (pr.t >= 1) {
        Audio.playAt(this.throwSound || 'clatter', pr.x, pr.y, { vol: 1.2, range: 700 });
        this.noise(pr.x, pr.y, 420, 'distraction');
        for (let i = 0; i < 6; i++) this.particles.push({ x: pr.x, y: pr.y, vx: rnd(-40, 40), vy: rnd(-40, 40), life: 0.5, color: '#bbb' });
        this.particles.push({ x: pr.x, y: pr.y, vx: 0, vy: 0, life: 1.2, ring: true, color: 'rgba(255,200,120,' });
        return false;
      }
      return true;
    });
  }

  updateThreat(dt) {
    let t = 0;
    for (const e of this.enemies) {
      if (!e.active) continue;
      const d = dist(e, this.player);
      if (e.state === 'chase') t = Math.max(t, 1);
      else t = Math.max(t, clamp(1 - d / 300, 0, 0.8) * (e.menace ?? 1));
    }
    this.threat = lerp(this.threat, t, Math.min(1, dt * 3));
    const chasing = this.enemies.some(e => e.state === 'chase' && e.active);
    if (!this.ended) {
      Audio.setMusic(chasing ? (this.chaseMusic || 'chase') : this.musicName, chasing ? 0.4 : 2.5);
      if (this.threat > 0.45 && !this._heart) { this._heart = true; Audio.startLoop('heart', 1); }
      else if (this.threat < 0.3 && this._heart) { this._heart = false; Audio.stopLoop('heart'); }
    }
  }

  updateAmbient(dt) {
    if (!this.ambientSounds.length) return;
    this.ambientTimer -= dt;
    if (this.ambientTimer > 0) return;
    this.ambientTimer = rnd(5, 12);
    let s; do { s = choose(this.ambientSounds); } while (this.ambientSounds.length > 1 && s === this.lastAmbient);
    this.lastAmbient = s;
    const a = rnd(0, Math.PI * 2), r = rnd(150, 420);
    Audio.playAt(s, this.player.x + Math.cos(a) * r, this.player.y + Math.sin(a) * r, { vol: 0.8, range: 600 });
  }

  updateHud() {
    const hud = this.ui.hud, it = this.frozen ? null : this.nearestInteract();
    hud.prompt(it ? `<b>[E]</b> ${typeof it.label === 'function' ? it.label() : it.label}` : '');
    if (this.timeLeft !== null) { const s = Math.ceil(this.timeLeft); hud.timer(this.timerText ? this.timerText(s) : `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`, s < 45); }
    else hud.timer('', false);
    const p = this.player, parts = [];
    if (p.hp !== null) parts.push(`<span style="color:#ff5a4a;font-size:18px">${'♥'.repeat(Math.max(0, p.hp))}<span style="opacity:.25">${'♥'.repeat(Math.max(0, (p.maxHp || 3) - p.hp))}</span></span>`);
    parts.push(`<span>Stamina<span class="bar"><i style="width:${p.stamina * 100}%"></i></span></span>`);
    if (this.flashlight.allowed) {
      const b = this.flashlight.battery;
      parts.push(`<span>${this.flashlight.on ? '◉' : '○'} Light${b !== null ? `<span class="bar"><i style="width:${b * 100}%;background:#9fe08a"></i></span>` : ''}</span>`);
    }
    if (p.hidden) parts.push('<span style="color:#9fd">HIDDEN</span>');
    hud.status(parts.join(''));
  }

  // ---- camera / rendering ----
  prerender() {
    const c = document.createElement('canvas');
    c.width = this.map.w * TILE; c.height = this.map.h * TILE;
    const g = c.getContext('2d');
    for (let y = 0; y < this.map.h; y++) for (let x = 0; x < this.map.w; x++) this.drawTile(g, this.map.get(x, y), x, y);
    this.mapCanvas = c;
  }
  redrawTile(tx, ty) { if (!this.mapCanvas) return; const g = this.mapCanvas.getContext('2d'); g.clearRect(tx * TILE, ty * TILE, TILE, TILE); this.drawTile(g, this.map.get(tx, ty), tx, ty); }

  render(ctx, W, H, zoom) {
    const p = this.player;
    const vw = W / zoom, vh = H / zoom;
    let cx = p.x - vw / 2, cy = p.y - vh / 2;
    const mw = this.map.w * TILE, mh = this.map.h * TILE;
    cx = mw > vw ? clamp(cx, 0, mw - vw) : (mw - vw) / 2;
    cy = mh > vh ? clamp(cy, 0, mh - vh) : (mh - vh) / 2;
    if (this.shake) { cx += rnd(-this.shake, this.shake); cy += rnd(-this.shake, this.shake); this.shake = Math.max(0, this.shake - 0.6); }
    this.cam.x = cx; this.cam.y = cy;
    ctx.fillStyle = this.bg || '#000'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.scale(zoom, zoom); ctx.translate(-cx, -cy);
    if (this.mapCanvas) ctx.drawImage(this.mapCanvas, 0, 0);
    this.drawWorld(ctx);
    // interactables highlight
    for (const it of this.interactables) {
      if (!it.enabled || !it.revealed || (it.cond && !it.cond())) continue;
      if (it.draw) it.draw(ctx, it, this.time);
      else if (it.sparkle !== false) { const a = 0.35 + Math.sin(this.time * 3 + it.x) * 0.25; ctx.fillStyle = `rgba(255,220,150,${a})`; ctx.beginPath(); ctx.arc(it.x, it.y, 3, 0, 7); ctx.fill(); }
    }
    this.projectiles.forEach(pr => { ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.arc(pr.x, pr.y - pr.z, 3, 0, 7); ctx.fill(); });
    this.enemies.forEach(e => e.active && e.draw(ctx, this.time));
    if (!p.hidden) this.drawPlayer(ctx, p);
    this.particles.forEach(pt => {
      if (pt.ring) { const k = 1 - pt.life / 1.2; ctx.strokeStyle = pt.color + (1 - k) * 0.6 + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(pt.x, pt.y, 10 + k * 70, 0, 7); ctx.stroke(); }
      else { ctx.fillStyle = pt.color; ctx.globalAlpha = Math.min(1, pt.life * 2); ctx.fillRect(pt.x - 1.5, pt.y - 1.5, 3, 3); ctx.globalAlpha = 1; }
    });
    this.drawAbove?.(ctx);
    ctx.restore();
    this.renderLighting(ctx, W, H, zoom);
    this.drawOverlay?.(ctx, W, H, zoom);
    this.drawScreenFx(ctx, W, H);
  }

  drawPlayer(ctx, p) {
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(0, 4, 11, 7, 0, 0, 7); ctx.fill();
    ctx.rotate(p.angle);
    ctx.fillStyle = this.playerColor || '#5a6b7a'; ctx.beginPath(); ctx.ellipse(0, 0, 9, 11, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#e0c4a8'; ctx.beginPath(); ctx.arc(2, 0, 6, 0, 7); ctx.fill();
    ctx.fillStyle = '#2a1e18'; ctx.beginPath(); ctx.arc(0, 0, 6, Math.PI * 0.6, Math.PI * 1.4); ctx.fill();
    if (this.flashlight.on) { ctx.fillStyle = '#ccc'; ctx.fillRect(7, 4, 7, 3); }
    ctx.restore();
  }

  renderLighting(ctx, W, H, zoom) {
    const lc = this.lightCanvas, g = this.lightCtx;
    if (lc.width !== W || lc.height !== H) { lc.width = W; lc.height = H; }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, W, H);
    g.fillStyle = `rgba(${this.darkColor || '2,2,6'},${this.darkness})`; g.fillRect(0, 0, W, H);
    g.setTransform(zoom, 0, 0, zoom, -this.cam.x * zoom, -this.cam.y * zoom);
    g.globalCompositeOperation = 'destination-out';
    const p = this.player, map = this.map;
    const polyFill = (pts, x, y, r, inner) => {
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(0,0,0,${inner})`); grd.addColorStop(0.6, `rgba(0,0,0,${inner * 0.6})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.beginPath(); g.moveTo(x, y); pts.forEach(pt => g.lineTo(pt[0], pt[1])); g.closePath(); g.fill();
    };
    // personal glow (ray-cast so walls block it)
    const pr = this.playerGlow ?? 75;
    if (pr > 0) polyFill(lightPoly(map, p.x, p.y, 0, Math.PI * 2, pr, 40), p.x, p.y, pr, 0.85);
    if (this.flashlight.on) {
      const fl = this.flashlight, flick = this.flashlight.battery !== null && fl.battery < 0.15 ? (Math.random() < 0.15 ? 0.3 : 1) : 1;
      polyFill(lightPoly(map, p.x, p.y, p.angle - fl.angle, p.angle + fl.angle, fl.range, 34), p.x, p.y, fl.range, 0.97 * flick);
    }
    for (const l of this.lights) {
      if (!l.on) continue;
      let k = l.intensity ?? 0.9;
      if (l.flicker && Math.random() < l.flicker) k *= rnd(0, 0.5);
      const grd = g.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      grd.addColorStop(0, `rgba(0,0,0,${k})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(l.x, l.y, l.r, 0, Math.PI * 2); g.fill();
    }
    this.extraLights?.(g);
    g.globalCompositeOperation = 'source-over';
    // coloured light tint
    for (const l of this.lights) {
      if (!l.on || !l.color) continue;
      const grd = g.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      grd.addColorStop(0, l.color); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(l.x, l.y, l.r, 0, Math.PI * 2); g.fill();
    }
    ctx.drawImage(lc, 0, 0);
  }

  drawScreenFx(ctx, W, H) {
    // vignette + threat pulse
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    if (this.threat > 0.05) {
      const a = this.threat * (0.25 + Math.sin(this.time * 8) * 0.1);
      const r = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
      r.addColorStop(0, 'rgba(120,0,0,0)'); r.addColorStop(1, `rgba(150,0,0,${a})`);
      ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
    }
    if (this.hurtFlash > 0) { ctx.fillStyle = `rgba(200,0,0,${this.hurtFlash * 0.5})`; ctx.fillRect(0, 0, W, H); this.hurtFlash -= 0.03; }
    // film grain
    const grain = this.game.grain;
    if (grain) { ctx.globalAlpha = 0.06; ctx.drawImage(grain, rnd(-60, 0), rnd(-60, 0), W + 60, H + 60); ctx.globalAlpha = 1; }
  }
}

// ---------------------------------------------------------------------------
// STALKER — generic enemy brain. Levels configure it and override hooks so
// each nightmare's threat behaves differently.
// ---------------------------------------------------------------------------
export class Stalker {
  constructor(level, o) {
    Object.assign(this, {
      x: 0, y: 0, r: 11, angle: 0, active: true,
      speeds: { patrol: 55, investigate: 80, search: 70, chase: 140 },
      sight: 230, fov: 0.85, closeSense: 46, hearing: 1, awarenessRate: 1.6,
      patrol: [], patrolIndex: 0, state: 'patrol', awareness: 0, path: [], repathT: 0,
      lastSeen: null, lostT: 0, stateT: 0, target: null, menace: 1, stepT: 0, stepSurface: 'wood', catchDist: 22,
    }, o);
    this.level = level; this.map = level.map;
  }
  setState(s, target) {
    if (this.state === s && !target) return;
    const prev = this.state;
    this.state = s; this.stateT = 0; this.path = []; this.repathT = 0;
    if (target) this.target = { x: target.x, y: target.y };
    this.onState?.(s, prev);
  }
  canSee(p) {
    if (p.hidden) return false;
    const d = dist(this, p);
    if (d < this.closeSense) return this.map.los(this.x, this.y, p.x, p.y);
    let range = this.sight * (this.sightMul?.(p) ?? 1);
    if (d > range) return false;
    if (Math.abs(angleDiff(this.angle, Math.atan2(p.y - this.y, p.x - this.x))) > this.fov) return false;
    return this.map.los(this.x, this.y, p.x, p.y);
  }
  hear(x, y, radius, kind) {
    if (!this.active || this.state === 'chase') return;
    const d = Math.hypot(x - this.x, y - this.y);
    if (d > radius * this.hearing) return;
    if (this.onHear && this.onHear(x, y, kind) === false) return;
    this.setState('investigate', { x, y });
    this.heardKind = kind;
  }
  follow(target, speed, dt) {
    this.repathT -= dt;
    const key = (target.x | 0) + ',' + (target.y | 0);
    if (this.repathT <= 0 || (key !== this._pathKey && this.state !== 'chase')) { this.path = this.map.path(this, target); this._pathKey = key; this.repathT = this.state === 'chase' ? 0.3 : 1.2; }
    const nxt = this.path[0];
    if (!nxt) return true;
    const dx = nxt.x - this.x, dy = nxt.y - this.y, d = Math.hypot(dx, dy);
    if (d < 4) { this.path.shift(); return !this.path.length; }
    const sp = Math.min(d, speed * dt);
    moveCircle(this.map, this, dx / d * sp, dy / d * sp);
    this.angle += angleDiff(this.angle, Math.atan2(dy, dx)) * Math.min(1, dt * 8);
    this.stepT -= dt;
    if (this.stepT <= 0) { this.stepT = speed > 100 ? 0.3 : 0.55; Audio.playAt('step', this.x, this.y, { surface: this.stepSurface, vol: 1.3, range: 380, gap: 0.12 }); }
    return false;
  }
  update(dt) {
    if (!this.active) return;
    const L = this.level, p = L.player;
    this.stateT += dt;
    const sees = this.perceive ? this.perceive(p, dt) : this.canSee(p);
    if (this.state !== 'chase') {
      if (sees) {
        const d = dist(this, p);
        this.awareness += dt * this.awarenessRate * (d < 90 ? 3 : 1.2);
        this.lookAt(p);
        if (this.awareness >= 1) this.startChase();
      } else this.awareness = Math.max(0, this.awareness - dt * 0.35);
    }
    switch (this.state) {
      case 'patrol': this.doPatrol(dt); break;
      case 'investigate': {
        if (!this.target) { this.setState('patrol'); break; }
        const arrived = this.follow(this.target, this.speeds.investigate, dt);
        if (arrived) { this.angle += dt * 2.2; this.lookAcc = (this.lookAcc || 0) + dt; if (this.lookAcc > (this.lookTime ?? 3)) { this.lookAcc = 0; this.afterInvestigate ? this.afterInvestigate() : this.setState('patrol'); } }
        else this.lookAcc = 0;
        break;
      }
      case 'search': this.doSearch ? this.doSearch(dt) : this.defaultSearch(dt); break;
      case 'chase': {
        if (sees || dist(this, p) < 60) { this.lastSeen = { x: p.x, y: p.y }; this.lostT = 0; }
        else this.lostT += dt;
        const tgt = this.lostT > 0 ? this.lastSeen : p;
        this.follow(tgt, this.speeds.chase * (this.chaseMul?.() ?? 1), dt);
        if (!p.hidden && dist(this, p) < this.catchDist + p.r) { this.onCatch ? this.onCatch() : L.gameOver('CAUGHT'); return; }
        if (this.lostT > (this.loseTime ?? 2.6) || p.hidden && dist(this, p) > 70 && this.lostT > 0.6) {
          this.awareness = 0.4;
          this.setState('search', this.lastSeen);
        }
        break;
      }
      default: this.custom?.(dt);
    }
  }
  startChase() {
    if (this.state === 'chase') return;
    this.awareness = 1; this.lostT = 0; this.lastSeen = { x: this.level.player.x, y: this.level.player.y };
    Memory.detected(this.level.id);
    this.setState('chase');
    this.onChase?.();
  }
  lookAt(p) { this.angle += angleDiff(this.angle, Math.atan2(p.y - this.y, p.x - this.x)) * 0.1; }
  doPatrol(dt) {
    if (!this.patrol.length) return;
    const pt = this.patrol[this.patrolIndex % this.patrol.length];
    if (this.follow(pt, this.speeds.patrol, dt) || dist(this, pt) < 8) this.patrolIndex = this.nextPatrol ? this.nextPatrol() : (this.patrolIndex + 1) % this.patrol.length;
  }
  defaultSearch(dt) {
    if (!this.target || this.follow(this.target, this.speeds.search, dt)) this.target = this.map.randomOpenNear(this.lastSeen?.x ?? this.x, this.lastSeen?.y ?? this.y, 4);
    if (this.stateT > (this.searchTime ?? 8)) this.setState('patrol');
  }
  // awareness indicator over the head
  drawAwareness(ctx) {
    if (this.state === 'chase') { ctx.fillStyle = '#ff3b2a'; ctx.font = 'bold 18px serif'; ctx.textAlign = 'center'; ctx.fillText('!', this.x, this.y - 26); }
    else if (this.awareness > 0.05 || this.state === 'investigate' || this.state === 'search') {
      ctx.fillStyle = `rgba(255,200,80,${0.4 + this.awareness * 0.6})`; ctx.font = 'bold 16px serif'; ctx.textAlign = 'center'; ctx.fillText('?', this.x, this.y - 26);
      if (this.awareness > 0.05) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(this.x - 12, this.y - 22, 24, 3); ctx.fillStyle = '#ffb040'; ctx.fillRect(this.x - 12, this.y - 22, 24 * this.awareness, 3); }
    }
  }
  drawCone(ctx, color = 'rgba(255,60,40,0.07)') {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(this.x, this.y);
    const pts = lightPoly(this.map, this.x, this.y, this.angle - this.fov, this.angle + this.fov, this.sight * 0.7, 14);
    pts.forEach(p => ctx.lineTo(p[0], p[1])); ctx.closePath(); ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// GRID BUILDER — carve maps with rectangles instead of hand-typed ASCII.
// ---------------------------------------------------------------------------
export class Grid {
  constructor(w, h, fill = '#') { this.w = w; this.h = h; this.g = Array.from({ length: h }, () => new Array(w).fill(fill)); }
  rect(x0, y0, x1, y1, ch) { for (let y = Math.max(0, y0); y <= Math.min(this.h - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(this.w - 1, x1); x++) this.g[y][x] = ch; return this; }
  put(x, y, ch) { if (y >= 0 && y < this.h && x >= 0 && x < this.w) this.g[y][x] = ch; return this; }
  puts(list, ch) { list.forEach(([x, y]) => this.put(x, y, ch)); return this; }
  get(x, y) { return this.g[y]?.[x]; }
  rows() { return this.g.map(r => r.join('')); }
}
export const tc = (tx, ty) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
