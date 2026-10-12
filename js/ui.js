// ui.js — DOM overlays: HUD, modals (documents, keypads, choices, settings,
// statistics, controls) and the cinematic text overlay.
import { Audio } from './audio.js';
import { Store, learnedSummary } from './storage.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export const UI = {
  openModals: 0,
  get modalOpen() { return this.openModals > 0; },

  // ---------------- generic modal ----------------
  modal({ title = '', html = '', cls = '', actions = [{ label: 'Close', primary: true }], onClose, keys }) {
    const root = $('#modal-root');
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal ${cls}" role="dialog" aria-modal="true">${title ? `<h2>${title}</h2>` : ''}<div class="modal-body">${html}</div><div class="actions"></div></div>`;
    const act = back.querySelector('.actions');
    let closed = false;
    const close = (val) => {
      if (closed) return; closed = true;
      back.remove(); this.openModals--;
      document.removeEventListener('keydown', onKey, true);
      onClose && onClose(val);
    };
    actions.forEach(a => {
      const b = document.createElement('button');
      b.className = 'btn' + (a.primary ? ' primary' : '') + (a.cls ? ' ' + a.cls : '');
      b.textContent = a.label;
      b.onclick = () => { Audio.play('click'); const r = a.onClick ? a.onClick() : undefined; if (a.close !== false) close(a.value ?? r); };
      act.appendChild(b);
    });
    const onKey = e => {
      if (keys && keys(e, close) === true) { e.stopPropagation(); e.preventDefault(); return; }
      if (e.code === 'Escape' || (e.code === 'KeyE' && !keys)) { e.stopPropagation(); e.preventDefault(); close(null); }
    };
    // defer so the key press that opened the modal does not close it
    setTimeout(() => document.addEventListener('keydown', onKey, true), 50);
    root.appendChild(back);
    this.openModals++;
    const first = act.querySelector('.btn.primary') || act.querySelector('.btn');
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 60);
    return { close, el: back };
  },

  doc(title, text, style = '') {
    Audio.play('pageTurn');
    return new Promise(res => this.modal({ title, html: `<div class="doc ${style}">${text}</div>`, cls: 'wide', actions: [{ label: 'Close [E]', primary: true }], onClose: res }));
  },

  choice(title, text, options) {
    return new Promise(res => {
      const html = `<p>${text}</p><div class="choice-list">${options.map((o, i) => `<button class="btn" data-i="${i}">${o.label}</button>`).join('')}</div>`;
      const m = this.modal({ title, html, actions: [], onClose: v => res(v), keys: (e) => e.code === 'Escape' || e.code === 'KeyE' });
      m.el.querySelectorAll('.choice-list .btn').forEach(b => b.onclick = () => { Audio.play('click'); m.close(options[+b.dataset.i].value); });
      setTimeout(() => m.el.querySelector('.choice-list .btn')?.focus(), 60);
    });
  },

  // numeric keypad. check(code) => true when correct.
  keypad({ title, hint = '', length = 4, check }) {
    return new Promise(res => {
      let code = '';
      const html = `<p style="text-align:center;margin-top:0">${hint}</p><div class="keypad-display">____</div><div class="keypad-grid">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '⏎'].map(k => `<button data-k="${k}">${k}</button>`).join('')}</div>`;
      const m = this.modal({ title, html, actions: [{ label: 'Step away', value: false }], onClose: v => res(!!v), keys: (e, close) => {
        if (/^Digit\d$|^Numpad\d$/.test(e.code)) { press(e.code.slice(-1)); return true; }
        if (e.code === 'Backspace') { press('C'); return true; }
        if (e.code === 'Enter' || e.code === 'NumpadEnter') { press('⏎'); return true; }
        return false;
      } });
      const disp = m.el.querySelector('.keypad-display');
      const render = () => { disp.textContent = (code + '____'.slice(0, Math.max(0, length - code.length))).padEnd(length, '_'); };
      render();
      const press = k => {
        Audio.play('beep', { f: 700 + Math.random() * 200, gap: 0 });
        if (k === 'C') { code = ''; render(); return; }
        if (k === '⏎') {
          if (code.length < length) return;
          if (check(code)) { disp.classList.add('ok'); disp.textContent = 'OPEN'; Audio.play('success'); setTimeout(() => m.close(true), 700); }
          else { Audio.play('fail'); disp.textContent = 'DENIED'; setTimeout(() => { code = ''; render(); }, 700); }
          return;
        }
        if (code.length < length) { code += k; render(); }
      };
      m.el.querySelectorAll('.keypad-grid button').forEach(b => b.onclick = () => press(b.dataset.k));
    });
  },

  // symbol dials (forest shrine, kingdom gate). symbols: [{id, glyph, name}]
  dials({ title, hint, slots, symbols, check, royal = false }) {
    return new Promise(res => {
      const idx = new Array(slots).fill(0);
      const html = `<p style="text-align:center;margin-top:0">${hint}</p><div class="dials">${idx.map((_, i) => `<div class="dial" data-i="${i}"><button class="btn tiny" data-d="-1">▲</button><div class="sym ${royal ? 'royal' : ''}"></div><div class="nm" style="font-size:14px;min-height:18px"></div><button class="btn tiny" data-d="1">▼</button></div>`).join('')}</div>`;
      const m = this.modal({ title, html, cls: 'wide', actions: [{ label: 'Step away', value: false }, { label: 'Invoke', primary: true, close: false, onClick: () => submit() }], onClose: v => res(!!v), keys: () => false });
      const draw = () => m.el.querySelectorAll('.dial').forEach((d, i) => { const s = symbols[idx[i]]; d.querySelector('.sym').textContent = s.glyph; d.querySelector('.nm').textContent = s.name; });
      m.el.querySelectorAll('.dial').forEach(d => d.querySelectorAll('button').forEach(b => b.onclick = () => { const i = +d.dataset.i; idx[i] = (idx[i] + (+b.dataset.d) + symbols.length) % symbols.length; Audio.play('click'); draw(); }));
      const submit = () => { const ids = idx.map(i => symbols[i].id); if (check(ids)) { Audio.play('success'); m.close(true); } else { Audio.play('fail'); m.el.querySelector('.modal').animate([{ transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'none' }], 300); } };
      draw();
    });
  },

  // ---------------- settings ----------------
  settings(onChange) {
    const s = Store.settings;
    const row = (k, label) => `<div class="setting-row"><label for="set-${k}">${label}</label><input id="set-${k}" type="range" min="0" max="1" step="0.05" value="${s[k]}" data-k="${k}"><span data-v="${k}">${Math.round(s[k] * 100)}</span></div>`;
    const check = (k, label) => `<label class="check-row"><input type="checkbox" data-c="${k}" ${s[k] ? 'checked' : ''}> ${label}</label>`;
    const html = row('master', 'Master') + row('music', 'Music') + row('sfx', 'Sound effects') + row('voice', 'Voices') +
      check('muted', 'Mute all sound') + check('subtitles', 'Show subtitles') + check('tts', 'Spoken voices (browser text-to-speech)') +
      `<p style="font-size:14px;color:var(--ink-dim)">All sound is generated live in your browser. Voices use your system's speech engine when available; subtitles always carry the dialogue.</p>`;
    const m = this.modal({ title: 'Sound Settings', html, actions: [{ label: 'Test sound', close: false, onClick: () => { Audio.init(); Audio.play('bell', { gap: 0 }); } }, { label: 'Done', primary: true }], onClose: () => onChange && onChange() });
    m.el.querySelectorAll('input[type=range]').forEach(inp => inp.oninput = () => { s[inp.dataset.k] = +inp.value; m.el.querySelector(`[data-v=${inp.dataset.k}]`).textContent = Math.round(inp.value * 100); Audio.applySettings(); Store.save(); });
    m.el.querySelectorAll('input[type=checkbox]').forEach(inp => inp.onchange = () => { s[inp.dataset.c] = inp.checked; Audio.applySettings(); Store.save(); UI.syncMute(); if (inp.dataset.c === 'tts' && !inp.checked && 'speechSynthesis' in window) speechSynthesis.cancel(); });
  },
  syncMute() { const b = $('#mute-btn'); if (b) b.textContent = Store.settings.muted ? '🔇' : '🔊'; },

  // ---------------- statistics ----------------
  stats(onClose) {
    const st = Store.stats, c = Store.completed;
    const n = Object.values(c).filter(Boolean).length;
    const mins = s => s ? `${(s / 60) | 0}m ${Math.round(s % 60)}s` : '—';
    const stat = (v, l) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`;
    const hidesTop = Object.entries(st.hideSpots).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k.split(':')[1].replace(/-/g, ' ')} (${v})`).join(', ') || '—';
    const html = `<div class="stats-grid">
      ${stat(`${n} / 4`, 'Nightmares completed')}
      ${stat(mins(st.playSeconds), 'Time inside the book')}
      ${stat(st.hides, 'Times hidden')}
      ${stat(Math.round(st.flashlightSeconds) + 's', 'Flashlight on')}
      ${stat(st.noiseEvents, 'Noises made')}
      ${stat(st.detections, 'Times detected')}
      ${stat(st.distractions, 'Distractions thrown')}
      ${stat(st.deaths, 'Deaths')}
    </div>
    <p style="margin-bottom:4px"><b>Favourite hiding places:</b> ${esc(hidesTop)}</p>
    <p style="margin:4px 0"><b>Best times:</b> Hotel ${mins(st.bestTimes.hotel)} · Hospital ${mins(st.bestTimes.hospital)} · Forest ${mins(st.bestTimes.forest)} · Kingdom ${mins(st.bestTimes.kingdom)}</p>
    <p style="margin:4px 0"><b>Recent choices:</b> ${st.choices.slice(-5).map(ch => esc(ch.value)).join(' · ') || '—'}</p>
    <h2 style="margin-top:16px;font-size:18px">What the book has learned about you</h2>
    <ul class="learn-list">${learnedSummary().map(l => `<li>${l}</li>`).join('')}</ul>`;
    this.modal({ title: 'Statistics', html, cls: 'wide', actions: [
      { label: 'Forget everything', cls: 'danger', close: false, onClick: () => { if (confirm('Erase all progress and everything the book has learned?')) { Store.reset(); document.querySelectorAll('.modal-back').forEach(m => m.remove()); this.openModals = 0; onClose && onClose(); } } },
      { label: 'Close', primary: true }], onClose });
  },

  controls() {
    const rows = [['W A S D / Arrows', 'Move'], ['Shift', 'Run (fast, but loud — enemies hear it)'], ['E / Enter', 'Interact, read, hide, leave hiding'], ['F', 'Flashlight on / off (reveals hidden clues)'],
      ['Q', 'Throw a distraction where you are facing'], ['Space', 'Hold your breath while hidden (Hotel)'], ['Esc / P', 'Pause'], ['M', 'Mute']];
    this.modal({ title: 'Controls', html: `<table class="controls-table">${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</table>
      <p style="font-size:15px;color:var(--ink-dim)">Every level can be finished without sound. Watch the <b style="color:#ffb040">?</b> and <b style="color:#ff3b2a">!</b> above enemies: a filling bar means you are being noticed.</p>` });
  },

  // ---------------- HUD ----------------
  hud: {
    objectives(list) {
      $('#hud-objectives').innerHTML = list.map(o => `<li class="${o.done ? 'done' : ''} ${o.fresh ? 'new' : ''}">${o.text}</li>`).join('');
      list.forEach(o => o.fresh = false);
    },
    inventory(items) { $('#hud-inventory').innerHTML = items.length ? items.map(i => `<span>${esc(i)}</span>`).join('') : '<span class="empty">empty</span>'; },
    _p: null,
    prompt(html) { if (html === this._p) return; this._p = html; const el = $('#hud-prompt'); el.innerHTML = html; el.classList.toggle('show', !!html); },
    _t: null,
    timer(text, urgent) { const k = text + urgent; if (k === this._t) return; this._t = k; const el = $('#hud-timer'); el.textContent = text; el.classList.toggle('urgent', !!urgent); },
    _s: null,
    status(html) { if (html === this._s) return; this._s = html; $('#hud-status').innerHTML = html; },
    alert(text, secs = 2.5) { const el = $('#hud-alert'); el.textContent = text; clearTimeout(this._at); this._at = setTimeout(() => el.textContent = '', secs * 1000); },
    learned(text) { const el = document.createElement('div'); el.innerHTML = `☙ ${text}`; $('#learned').appendChild(el); setTimeout(() => el.remove(), 6200); },
    title(t) { $('#hud-level').textContent = t; },
    showThrow(show, label) { $('#key-q').style.display = show ? '' : 'none'; if (label) $('#key-q').innerHTML = `<b>Q</b> ${label}`; },
    reset() { this._p = this._t = this._s = null; $('#learned').innerHTML = ''; $('#hud-alert').textContent = ''; },
  },

  // ---------------- cinematic overlay ----------------
  cine: {
    show({ text = '', cls = '', img = null, transparent = false, skippable = false, onSkip } = {}) {
      const el = $('#cine'), t = $('#cine-text');
      el.classList.add('active'); el.classList.toggle('transparent', transparent);
      el.querySelectorAll('img.cine-art').forEach(i => i.remove());
      if (img) { const im = document.createElement('img'); im.className = 'cine-art'; im.src = img; im.onerror = () => { im.onerror = null; im.src = im.dataset.raw; }; im.dataset.raw = img.includes('url=') ? decodeURIComponent(img.split('url=')[1].split('&')[0]) : img; el.insertBefore(im, t); requestAnimationFrame(() => requestAnimationFrame(() => im.classList.add('show'))); }
      t.className = 'cine-text ' + cls; t.textContent = text;
      requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));
      const sk = $('#cine-skip'); sk.style.display = skippable ? '' : 'none'; sk.onclick = () => onSkip && onSkip();
    },
    text(text, cls = '') { const t = $('#cine-text'); t.classList.remove('show'); setTimeout(() => { t.className = 'cine-text ' + cls; t.textContent = text; requestAnimationFrame(() => t.classList.add('show')); }, 350); },
    art(fn) { const im = $('#cine img.cine-art'); if (im) fn(im); },
    hide() { const el = $('#cine'); el.classList.remove('active', 'transparent'); $('#cine-text').className = 'cine-text'; el.querySelectorAll('img.cine-art').forEach(i => i.remove()); },
  },
};

// Netlify Image CDN URL for an artwork, with raw fallback when unavailable (e.g. local static server).
export function art(name, w = 900) { return `/.netlify/images?url=/img/${name}.png&w=${w}&fm=webp&q=78`; }
export function setArt(img, name, w) { img.onerror = () => { img.onerror = null; img.src = `img/${name}.png`; }; img.src = art(name, w); }
export { esc };
