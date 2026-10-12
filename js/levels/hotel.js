// LEVEL 1 — THE MIDNIGHT HOTEL: ROOM 009
// Psychological survival horror. The Occupant learns where you hide.
import { BaseLevel, Stalker, Grid, TileMap, TILE, tc, dist, rnd, choose, shuffle, hash, clamp } from '../engine.js';
import { Audio } from '../audio.js';
import { Memory } from '../storage.js';
import { art } from '../ui.js';

const SOLID = '#WBTRPOSL9X';
const OPAQUE = '#WSL9X';

function buildMap() {
  const g = new Grid(44, 28);
  g.rect(1, 7, 42, 8, '.');                                     // main corridor
  [[1, 8, 4], [10, 17, 13], [19, 26, 22], [28, 35, 31], [37, 42, 39]].forEach(([a, b, d]) => { g.rect(a, 1, b, 5, ','); g.put(d, 6, '.'); });
  g.rect(1, 9, 1, 16, '.'); g.rect(42, 9, 42, 16, '.');         // service passages
  g.rect(3, 10, 8, 15, ','); g.put(5, 9, '.');                   // 005
  g.rect(10, 10, 15, 15, ','); g.put(12, 9, '.');                // 006
  g.rect(17, 9, 24, 16, '_');                                    // grand hall
  g.rect(26, 10, 33, 15, ','); g.put(29, 9, 'L');                // 008 (sealed)
  g.rect(35, 10, 41, 15, ','); g.put(38, 9, '9');                // 009
  g.rect(1, 17, 8, 25, ',');                                     // office
  g.rect(10, 17, 33, 25, '_');                                   // lobby
  g.rect(35, 17, 42, 25, ',');                                   // lounge
  g.put(9, 21, '.'); g.put(34, 21, '.');
  g.put(21, 26, 'X'); g.put(22, 26, 'X');
  // furniture
  const bed = (x, y) => g.puts([[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]], 'B');
  bed(2, 2); bed(11, 2); bed(20, 2); bed(29, 2); bed(4, 11); bed(11, 11); bed(27, 11); bed(39, 12);
  g.puts([[7, 1], [16, 1], [34, 1], [8, 15], [35, 15], [1, 25], [42, 25]], 'W');
  g.puts([[6, 4], [15, 4], [24, 4], [33, 4], [41, 11], [36, 11], [14, 14], [3, 19], [4, 19], [32, 13]], 'T');
  g.puts([[38, 1], [39, 1], [40, 1], [41, 1], [8, 17], [8, 18], [40, 17], [41, 17]], 'S');
  for (let x = 14; x <= 19; x++) g.put(x, 19, 'R');
  g.puts([[10, 17], [33, 17], [10, 25], [33, 25], [17, 15], [24, 15]], 'P');
  g.puts([[26, 22], [27, 22], [37, 21], [38, 21], [37, 23], [38, 23]], 'O');
  return g.rows();
}

const HIDES = [
  { id: 'wardrobe-001', tile: [7, 2], label: 'Hide in the wardrobe' },
  { id: 'wardrobe-002', tile: [16, 2], label: 'Hide in the wardrobe' },
  { id: 'wardrobe-004', tile: [34, 2], label: 'Hide in the wardrobe' },
  { id: 'wardrobe-005', tile: [7, 15], label: 'Hide in the wardrobe' },
  { id: 'under-the-bed-009', tile: [39, 14], label: 'Hide under the bed' },
  { id: 'behind-reception', tile: [16, 18], label: 'Crouch behind the reception desk' },
  { id: 'office-cabinet', tile: [2, 25], label: 'Squeeze into the cabinet' },
  { id: 'lounge-curtains', tile: [41, 25], label: 'Hide behind the curtains' },
];

export class HotelLevel extends BaseLevel {
  constructor(game) {
    super(game);
    this.id = 'hotel';
    this.map = new TileMap(buildMap(), { solid: SOLID, opaque: OPAQUE });
    this.bg = '#050304';
    this.darkness = 0.93; this.darkColor = '4,2,6';
    this.musicName = 'hotel';
    this.ambientSounds = ['creak', 'thunder', 'footstepsFar', 'whisper', 'thud'];
    this.throwable = { name: 'Coins', count: 2 };
    this.playerColor = '#4b5866';
    this.player.x = tc(21, 24).x; this.player.y = tc(21, 24).y; this.player.angle = -Math.PI / 2;
    this.breath = 1; this.holding = false;
    this.stage = 'arrive';
    this.notes = 0;
    this.thunderT = 8;
    this.rain = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), s: rnd(0.6, 1.2) }));
    this.buildCode();
    this.setupWorld();
  }

  // Random guest register: the crossed guests' room digits form the exit code.
  buildCode() {
    const rooms = shuffle([1, 2, 3, 4, 5, 6, 7, 8]).slice(0, 6);
    const names = shuffle(['M. Hale', 'Agnes Voss', 'T. Whitlock', 'Dr. Ferris', 'June Calloway', 'Edgar Pell', 'R. Mournby', 'Lillian Crane']);
    const crossIdx = shuffle([0, 1, 2, 3, 4, 5]).slice(0, 4).sort((a, b) => a - b);
    this.register = rooms.map((r, i) => ({ room: '00' + r, name: names[i], time: `11:${String(14 + i * 7).padStart(2, '0')} PM`, cross: crossIdx.includes(i) }));
    this.code = this.register.filter(e => e.cross).map(e => e.room.slice(-1)).join('');
  }

  surfaceAt(x, y) { const ch = this.map.get(Math.floor(x / TILE), Math.floor(y / TILE)); return ch === '_' ? 'tile' : 'wood'; }
  zoneAt(x, y) { const ty = y / TILE; return ty < 6 ? 'north-rooms' : ty < 9 ? 'corridor' : ty < 17 ? 'south-rooms' : x / TILE < 9 ? 'office' : x / TILE > 34 ? 'lounge' : 'lobby'; }

  setupWorld() {
    const P = (tx, ty) => tc(tx, ty);
    // lights
    [[6, 7], [20, 8], [34, 7]].forEach(([x, y]) => this.addLight({ ...P(x, y), r: 130, flicker: 0.04, intensity: 0.7, color: 'rgba(255,170,90,0.06)' }));
    this.chandelier = this.addLight({ ...P(21, 21), r: 230, flicker: 0.02, intensity: 0.8, color: 'rgba(255,190,110,0.08)' });
    this.addLight({ ...P(16, 20), r: 110, intensity: 0.75, color: 'rgba(255,200,120,0.08)' }); // desk lamp
    this.lamp009 = this.addLight({ ...P(41, 11), r: 120, intensity: 0.75, on: true, color: 'rgba(255,170,90,0.08)' });
    this.addLight({ ...P(38, 20), r: 90, flicker: 0.1, intensity: 0.5, color: 'rgba(120,140,255,0.05)' });

    // receptionist
    this.receptionist = { ...P(16, 18), visible: true, fade: 1 };
    this.addInteract({ id: 'recept', ...P(16, 20), r: 46, label: 'Speak to the receptionist', once: true, cond: () => this.receptionist.visible, sparkle: false, action: () => this.talkReceptionist() });

    // register (readable at any time)
    this.addInteract({ id: 'register', ...P(18, 20), r: 40, label: 'Read the guest register', cond: () => !this.receptionist.visible, action: () => this.readRegister() });

    // Room 009 door
    this.addInteract({ id: 'door9', ...P(38, 8), r: 40, label: () => this.has('Brass Key — Room 009') ? 'Unlock Room 009' : 'Room 009 (locked)', action: it => {
      if (!this.has('Brass Key — Room 009')) { Audio.play('click'); this.alert('Locked. A brass plate reads 009.'); return; }
      if (this.stage !== 'key') return;
      it.enabled = false; this.openDoor(38, 9); this.stage = 'room';
      this.done('find9'); this.addObjective('search9', 'Search Room 009');
    } });
    this.addInteract({ id: 'door8', ...P(29, 8), r: 36, label: 'Room 008', action: () => { Audio.play('knock', { vol: 0.3 }); this.alert('“DO NOT DISTURB.” Something scratches back.'); this.sayNow('whisper', 'Not yet...'); } });

    // Photograph
    this.addInteract({ id: 'photo', ...P(40, 11), r: 38, label: 'Pick up the photograph', once: true, cond: () => this.stage === 'room', action: () => this.findPhoto() });
    // Telephone
    this.phone = this.addInteract({ id: 'phone', ...P(36, 12), r: 38, label: 'Answer the telephone', once: true, enabled: false, action: () => this.answerPhone() });

    // notes
    const note = (id, tx, ty, title, text, hidden = false) => this.addInteract({ id, ...P(tx, ty), r: 34, hidden, label: hidden ? 'Read the glowing words' : 'Read the note', once: true, action: async () => { this.give(title); this.notes++; await this.ui.doc(title, text); this.done('notes-' + Math.min(3, this.notes)); if (this.notes === 3) this.done('notes'); } });
    note('note1', 6, 3, 'Manager’s Note', 'NIGHT MANAGER — STANDING ORDERS\n\n1. The lights fail at midnight. Do not repair them.\n2. If the knocking starts, do NOT answer.\n3. It wears whatever face stands behind the door.\n4. It is slow when it walks. It is not slow when it runs.\n\n— the exit keypad takes four digits. The register never lies.');
    note('note2', 14, 13, 'Writing in the Dust', 'Letters drawn by a finger, revealed only by your light:\n\nTHE EXIT REMEMBERS THOSE WHO NEVER LEFT.\nREAD THE REGISTER. ONLY THE CROSSES COUNT.\nTOP TO BOTTOM — THE LAST DIGIT OF EACH ROOM.', true);
    note('note3', 3, 21, 'Torn Diary Page', '“Night four. I hid in the same wardrobe again.\nIt stood outside longer this time. Listening.\nIt learns, I swear it learns. It checks the places you trust most.\nHold your breath. Never hide in the same place twice.”');
    note('note4', 32, 12, 'Postcard', 'A postcard of this very hotel. On the back, in your own handwriting:\n\n“Don’t open the door. Whatever happens. — me”', true);

    // coin pickups
    const coins = (tx, ty, n) => this.addInteract({ id: 'coins' + tx, ...P(tx, ty), r: 32, label: `Take ${n} coins`, once: true, action: () => { this.throwable.count += n; this.refreshInventory(); Audio.play('pickup'); this.alert(`+${n} coins — press Q to throw`); } });
    coins(40, 3, 3); coins(5, 23, 2); coins(30, 13, 2);

    // hiding spots
    HIDES.forEach(h => {
      const pos = P(...h.tile);
      const it = this.addInteract({ id: h.id, ...pos, r: 34, label: () => this.player.hidden ? 'Leave hiding place' : h.label, cond: () => this.stage !== 'arrive', action: () => this.toggleHide(h, it) });
      h.it = it; h.x = pos.x; h.y = pos.y;
    });

    // exit keypad
    this.addInteract({ id: 'exit', ...P(21.5, 25), r: 50, label: () => this.creature?.active ? 'Use the exit keypad' : 'The front doors (chained)', action: () => this.useKeypad() });
  }

  onStart() {
    this.ui.hud.title('Level 1 · The Midnight Hotel — Room 009');
    this.setObjectives([{ id: 'recept', text: 'Speak to the receptionist' }]);
    Audio.startLoop('rain', 0.9); Audio.startLoop('wind', 0.25);
    this.run(async () => {
      await this.cine(async () => {
        this.ui.cine.show({ text: '12:07 AM', cls: 'type', img: art('hotel', 1000) });
        Audio.play('thunder');
        await this.say('narrator', 'Twelve-oh-seven A.M. Your car dies in the storm, miles from anywhere.');
        this.ui.cine.text('An old hotel waits on the deserted road.');
        await this.say('narrator', 'An old hotel appears on the deserted road. Every window is dark... except one.');
        Audio.play('door');
        this.ui.cine.hide();
      });
      this.alert('Move with WASD · Interact with E');
    });
  }

  async talkReceptionist() {
    this.run(async () => {
      await this.cine(async () => {
        await this.say('receptionist', "We've been expecting you.", { name: 'Receptionist' });
        Audio.play('pickup');
        this.give('Brass Key — Room 009');
        await this.say('receptionist', 'Room zero-zero-nine. It has been kept... exactly as you left it.', { name: 'Receptionist' });
      });
      this.done('recept'); this.stage = 'key';
      this.addObjective('find9', 'Find Room 009 (east end of the upstairs corridor)');
      Audio.play('bell', { f: 520, vol: 0.5 });
      this.receptionist.fading = true;
      await this.w(1.5);
      this.alert('The receptionist is gone. The desk bell is still ringing.');
    });
  }

  findPhoto() {
    this.run(async () => {
      this.give('Photograph');
      await this.ui.doc('A Photograph', 'A photograph of YOU, standing in this very room, staring at the door.\n\nOn the back, in faded ink:\n\n“ROOM 009 — dated TOMORROW.”');
      this.done('search9');
      this.lamp009.flicker = 0.3;
      await this.w(0.8);
      this.addObjective('phone', 'Answer the ringing telephone');
      this.phone.enabled = true;
      this.ringing = true;
    });
  }

  answerPhone() {
    this.ringing = false;
    this.run(async () => {
      await this.cine(async () => {
        Audio.play('static');
        await this.say('phone', 'Whatever happens... do not open the door.', { name: 'Unknown voice' });
        await this.say('phone', "I'm standing outside... and I'm not you.", { name: 'Unknown voice' });
        Audio.play('click');
        await this.w(1.2);
        Audio.playAt('knock', tc(38, 8).x, tc(38, 8).y, { vol: 1.6, range: 800 });
        this.shake = 3;
        await this.w(2.2);
      });
      this.done('phone');
      const v = await this.ui.choice('Three knocks.', 'Something is standing on the other side of the door to Room 009. It knocks again, patiently.', [
        { label: 'Open the door.', value: 'opened the door' },
        { label: 'Stay silent and back away from the door.', value: 'stayed silent' },
      ]);
      Memory.choice('hotel', 'door', v || 'stayed silent');
      this.openedDoor = v === 'opened the door';
      await this.releaseCreature();
    });
  }

  async releaseCreature() {
    const door = tc(38, 9);
    this.lamp009.on = false;
    this.lights.forEach(l => { l.flicker = Math.min(0.25, l.flicker + 0.08); });
    if (this.openedDoor) {
      this.openDoor(38, 9, true);
      Audio.play('door');
      await this.w(0.6);
      this.sayNow('creature', 'There you are.', { name: '???' });
      this.learned('You opened the door. It has seen your face — it notices you from further away.');
      this.spawnCreature(tc(30, 7), 'investigate', door);
    } else {
      this.sayNow('narrator', 'The knocking stops. Footsteps drift away down the corridor...');
      await this.w(4);
      this.openDoor(38, 9, true);
      Audio.play('creak');
      this.spawnCreature(tc(3, 7), 'patrol');
    }
    this.stage = 'escape';
    this.timeLeft = 330;
    this.timerText = s => `${12 + 0}:${String(Math.min(59, 54 + Math.floor((330 - s) / 60))).padStart(2, '0')} AM  ·  ${(s / 60) | 0}:${String(s % 60).padStart(2, '0')} left`;
    this.addObjective('register', 'Read the guest register in the lobby');
    this.addObjective('hidden', 'Use your flashlight [F] to find the hidden message');
    this.addObjective('notes', 'Collect the mysterious notes (optional)');
    this.addObjective('exit', 'Unlock the front exit before 1:00 AM');
    this.alert('Something is loose in the hotel. Hide [E], hold breath [Space], throw coins [Q].', 5);
    const fav = Memory.favouriteHide('hotel');
    if (fav && fav.count >= 2) this.learned(`The book remembers: you trust the ${fav.id.replace(/-/g, ' ')}. So does it.`);
  }

  spawnCreature(pos, state, target) {
    const L = this;
    const patrol = [[3, 7], [20, 8], [40, 7], [20, 12], [13, 23], [30, 23], [4, 21], [38, 22], [1, 12], [42, 12], [13, 3], [31, 3]].map(([x, y]) => tc(x, y));
    const c = new Stalker(this, {
      ...pos, speeds: { patrol: 58, investigate: 88, search: 74, chase: 126 }, sight: 220, fov: 0.9, stepSurface: 'heavy',
      patrol, patrolIndex: 1, inspected: 0,
    });
    c.nextPatrol = () => { let i; do { i = (Math.random() * patrol.length) | 0; } while (i === c.patrolIndex); return i; };
    // Flashlight use and the door choice make it notice you from further away.
    c.sightMul = p => {
      let m = 1;
      if (L.flashlight.on) m += 0.35 + 0.45 * Memory.flashlightReliance();
      if (L.openedDoor) m += 0.2;
      if (p.running) m += 0.15;
      return m;
    };
    // Distractions work — but it learns to ignore them if you rely on them.
    c.onHear = (x, y, kind) => {
      if (kind !== 'distraction') return true;
      const n = Memory.distractionCount('hotel');
      const ignore = Math.min(0.5, Math.max(0, n - 3) * 0.06);
      if (Math.random() < ignore) { if (!L._ignoreMsg) { L._ignoreMsg = true; L.learned('It has heard your coins before. It ignored that one.'); } return false; }
      c.lookTime = Math.max(1.4, 3.6 - n * 0.12);
      return true;
    };
    c.onChase = () => { Audio.play('screech'); L.alert('IT SEES YOU — RUN AND BREAK ITS LINE OF SIGHT'); L.sayNow('creature', choose(['I hear your heart.', 'Room zero-zero-nine is waiting.', 'Stay. Forever.']), { name: 'The Occupant' }); };
    // After losing you: inspect hiding spots, favouring the ones you use most.
    c.onState = (s) => { if (s === 'search') { c.inspected = 0; c.target = null; c.inspecting = null; } };
    c.doSearch = dt => L.creatureSearch(c, dt);
    c.afterInvestigate = () => { if (Math.random() < 0.5) c.setState('search'); else c.setState('patrol'); };
    c.custom = dt => L.creatureInspect(c, dt);
    c.draw = (ctx, t) => L.drawCreature(ctx, c, t);
    c.favT = 14;
    this.creature = c;
    this.enemies.push(c);
    if (state === 'investigate') c.setState('investigate', target);
  }

  // weights hiding spots by distance and by how often the player has used them
  pickSpot(c, near) {
    const p = this.player;
    const cands = HIDES.filter(h => h !== c.lastInspected && dist(h, near) < 12 * TILE);
    if (!cands.length) return null;
    const weights = cands.map(h => {
      let w = 1 + 2.5 * Memory.hideCount('hotel', h.id);
      if (p.hidden && p.hidden.id === h.id && c.sawHide) w += 100;
      return w / (1 + dist(h, near) / 200);
    });
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < cands.length; i++) { r -= weights[i]; if (r <= 0) return cands[i]; }
    return cands[0];
  }

  creatureSearch(c, dt) {
    if (!c.spot) {
      if (c.inspected >= 2 || c.stateT > 18) { c.setState('patrol'); return; }
      c.spot = this.pickSpot(c, c.lastSeen || c);
      if (!c.spot) { c.setState('patrol'); return; }
      if (this.player.hidden && this.player.hidden.id === c.spot.id) this.alert('Footsteps... coming toward your hiding place.', 3);
    }
    if (c.follow(c.spot, c.speeds.search, dt) || dist(c, c.spot) < 26) {
      c.inspecting = c.spot; c.inspectT = 0;
      const uses = Memory.hideCount('hotel', c.spot.id);
      c.inspectDur = c.sawHide && this.player.hidden?.id === c.spot.id ? 6.5 : clamp(1.6 + uses * 0.75, 1.6, 6);
      c.state = 'inspect'; c.stateT = 0;
      Audio.playAt('growl', c.x, c.y, { vol: 0.8 });
      if (this.player.hidden?.id === c.spot.id) { this.alert('IT IS LISTENING — HOLD YOUR BREATH [SPACE]', c.inspectDur); if (uses >= 3) this.learned('It remembers this hiding place. It will listen for longer.'); }
    }
  }

  creatureInspect(c, dt) {
    if (c.state !== 'inspect') return;
    c.inspectT += dt;
    c.angle += Math.sin(this.time * 3) * dt;
    const p = this.player;
    const here = p.hidden && p.hidden.id === c.inspecting.id;
    if (here && c.inspectT > 0.9 && !this.holding) { this.caughtInHiding(); return; }
    if (c.inspectT > c.inspectDur) {
      if (here && c.sawHide) { this.caughtInHiding(); return; }
      c.lastInspected = c.inspecting; c.inspecting = null; c.spot = null; c.inspected++; c.sawHide = false;
      c.state = 'search'; c.stateT = Math.max(c.stateT, 0);
      if (here) { this.alert('It moves on...'); Audio.play('breath'); }
    }
  }

  caughtInHiding() {
    Audio.play('wardrobe'); Audio.play('gasp');
    this.gameOver('THE DOOR OPENS', 'It found you in the ' + this.player.hidden.id.replace(/-/g, ' ') + '. It remembered.');
  }

  toggleHide(h, it) {
    const p = this.player;
    if (p.hidden) {
      p.hidden = null; Audio.play('wardrobe'); this.holding = false;
      return;
    }
    const c = this.creature;
    p.hidden = { id: h.id, it, x: p.x, y: p.y };
    p.x = h.x; p.y = h.y;
    Audio.play('wardrobe');
    Memory.hide('hotel', h.id);
    this.flashlight.on = false;
    const uses = Memory.hideCount('hotel', h.id);
    if (uses === 3) this.learned('You keep coming back to the ' + h.id.replace(/-/g, ' ') + '. The book notices.');
    if (c && c.active && c.state === 'chase' && dist(c, p) < 260 && this.map.los(c.x, c.y, p.x, p.y)) {
      c.sawHide = true; c.lastSeen = { x: p.x, y: p.y };
      c.setState('search'); c.spot = h;
      this.alert('IT SAW YOU HIDE. Get out and run!', 3);
    }
    this.alert(`Hidden. Hold [Space] to hold your breath. [E] to leave.`, 3);
  }

  onHiddenUpdate(dt) {
    const hold = this.input.is('action') && this.breath > 0;
    if (hold && !this.holding) Audio.play('breath');
    if (!hold && this.holding && this.breath <= 0.02) { Audio.play('gasp'); this.noise(this.player.x, this.player.y, 110, 'gasp'); }
    this.holding = hold;
    if (hold) this.breath = Math.max(0, this.breath - dt / 4.6);
    else this.breath = Math.min(1, this.breath + dt / 3);
  }

  updateHud() {
    super.updateHud();
    if (this.player.hidden) this.ui.hud.status(`<span style="color:#9fd">HIDDEN · ${this.holding ? 'HOLDING BREATH' : 'breathing'}</span><span>Breath<span class="bar"><i style="width:${this.breath * 100}%;background:#8fc8ff"></i></span></span>`);
  }

  openDoor(tx, ty) { this.map.set(tx, ty, 'd'); this.redrawTile(tx, ty); }

  async readRegister() {
    const rows = this.register.map(e => `${e.cross ? '✝' : '  '}  Room ${e.room}   ${e.name.padEnd(14, ' ')}  checked in ${e.time}`).join('\n');
    await this.ui.doc('Guest Register — The Midnight Hotel', `GUESTS OF THE NIGHT\n\n${rows}\n   Room 009   ${'(your handwriting)'.padEnd(14, ' ')}  checked in 12:07 AM — tomorrow\n\nA crooked cross (✝) has been scratched beside the guests who never checked out.`);
    this.give('Register notes');
    this.done('register');
  }

  onReveal(it) { if (it.id === 'note2') { this.alert('Your light reveals words written in the dust'); } }

  async useKeypad() {
    if (!this.creature?.active) { this.alert('Heavy chains. A keypad blinks: 4 digits. Not yet.'); return; }
    const ok = await this.ui.keypad({ title: 'Exit Keypad', hint: 'Four digits. The chains rattle when you touch them.', length: 4, check: c => c === this.code });
    if (!ok) { this.noise(this.player.x, this.player.y, 200, 'keypad'); return; }
    this.done('exit');
    this.ending();
  }

  ending() {
    this.frozen = true;
    this.creature.active = false;
    Audio.setMusic(null, 1); Audio.stopLoop('heart');
    this.run(async () => {
      Audio.play('door');
      await this.w(0.8);
      this.ui.cine.show({ text: '' });
      Audio.startLoop('rain', 1.4);
      await this.w(1.2);
      this.ui.cine.text('You escaped the hotel...');
      await this.say('narrator', 'You escaped the hotel...');
      await this.w(1.6);
      Audio.play('glitch', { dur: 1.2 });
      this.ui.cine.text('Then why... are you still here?', 'glitch');
      document.body.classList.add('glitch-screen');
      await this.say('creature', 'Then why... are you still here?', { name: 'The Occupant' });
      document.body.classList.remove('glitch-screen');
      await this.w(0.6);
      this.ui.cine.text('The brass key in your hand reads:\n\nROOM 009 — OCCUPIED.', 'type');
      Audio.play('sting');
      await this.w(4);
      this.ui.cine.text('The ancient book closes.');
      Audio.play('bookSlam');
      await this.w(2);
      this.ui.cine.hide();
      this.complete(`${this.notes} notes found · door ${this.openedDoor ? 'opened' : 'left closed'}`);
    });
  }

  onTimeout() { this.gameOver('1:00 AM', 'Every clock in the hotel stops. You have checked in permanently.'); }

  onUpdate(dt) {
    if (this.receptionist.fading) { this.receptionist.fade -= dt * 0.6; if (this.receptionist.fade <= 0) { this.receptionist.visible = false; this.receptionist.fading = false; } }
    if (this.ringing && !this.frozen) { this._ringT = (this._ringT || 0) - dt; if (this._ringT <= 0) { this._ringT = 3; Audio.playAt('phone', tc(36, 11).x, tc(36, 11).y, { range: 700, gap: 0 }); } }
    // thunder flashes
    this.thunderT -= dt;
    if (this.thunderT <= 0) { this.thunderT = rnd(14, 28); this.flashT = 0.25; Audio.play('thunder', { delay: rnd(0.2, 1.2) }); }
    if (this.flashT > 0) { this.flashT -= dt; this.darkness = Math.random() < 0.5 ? 0.55 : 0.8; } else this.darkness = 0.93;
    // Adaptive patrol: periodically check the player's favourite hiding spot.
    const c = this.creature;
    if (c && c.active && c.state === 'patrol' && !this.frozen) {
      c.favT -= dt;
      if (c.favT <= 0) {
        c.favT = rnd(16, 26);
        const fav = Memory.favouriteHide('hotel');
        if (fav && fav.count >= 2) {
          const h = HIDES.find(x => x.id === fav.id);
          if (h) { c.lastSeen = { x: h.x, y: h.y }; c.setState('search'); c.spot = h; if (this.player.hidden?.id === h.id) this.alert('It is heading for your favourite hiding place...', 3); }
        }
      }
    }
  }

  // ------------------------------- drawing -------------------------------
  drawTile(g, ch, x, y) {
    const X = x * TILE, Y = y * TILE, h = hash(x, y);
    const floor = c => {
      if (c === '.' || c === 'd' || c === 'L' || c === '9') { g.fillStyle = '#3a1013'; g.fillRect(X, Y, TILE, TILE); g.fillStyle = 'rgba(200,140,60,0.08)'; g.beginPath(); g.moveTo(X + 16, Y + 4); g.lineTo(X + 28, Y + 16); g.lineTo(X + 16, Y + 28); g.lineTo(X + 4, Y + 16); g.fill(); }
      else if (c === '_' || c === 'R' || c === 'X') { g.fillStyle = (x + y) % 2 ? '#2b2826' : '#1b1918'; g.fillRect(X, Y, TILE, TILE); g.fillStyle = `rgba(255,255,255,${h * 0.03})`; g.fillRect(X, Y, TILE, TILE); }
      else { g.fillStyle = '#33241a'; g.fillRect(X, Y, TILE, TILE); g.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 4; i++) g.fillRect(X, Y + i * 8 + 7, TILE, 1); g.fillStyle = `rgba(255,220,180,${h * 0.04})`; g.fillRect(X, Y, TILE, TILE); }
    };
    if (ch === '#') {
      g.fillStyle = '#1c1216'; g.fillRect(X, Y, TILE, TILE);
      g.fillStyle = '#2a1a20'; for (let i = 0; i < 4; i++) g.fillRect(X + i * 8 + 3, Y, 2, TILE);
      if (this.map.get(x, y + 1) !== '#') { g.fillStyle = '#3d2a24'; g.fillRect(X, Y + TILE - 6, TILE, 6); g.fillStyle = '#6a4a30'; g.fillRect(X, Y + TILE - 7, TILE, 1); }
      return;
    }
    const under = { W: ',', B: ',', T: ',', S: ',', P: '_', O: ',', R: '_', X: '_', L: '.', '9': '.', d: '.' }[ch] || ch;
    floor(under === ',' && this.map.get(x, y) === 'P' ? '_' : under);
    switch (ch) {
      case 'W': g.fillStyle = '#2a1a10'; g.fillRect(X + 2, Y + 2, TILE - 4, TILE - 4); g.fillStyle = '#4a2e18'; g.fillRect(X + 4, Y + 4, TILE - 8, TILE - 8); g.fillStyle = '#1a0e08'; g.fillRect(X + 15, Y + 4, 2, TILE - 8); g.fillStyle = '#c9a050'; g.fillRect(X + 12, Y + 15, 2, 3); g.fillRect(X + 18, Y + 15, 2, 3); break;
      case 'B': { const top = this.map.get(x, y - 1) !== 'B'; g.fillStyle = '#4a2a18'; g.fillRect(X + 1, Y + (top ? 1 : 0), TILE - 2, TILE - (top ? 1 : 2)); g.fillStyle = '#6b2a2e'; g.fillRect(X + 3, Y + (top ? 10 : 0), TILE - 6, TILE - (top ? 12 : 4)); if (top) { g.fillStyle = '#cfc4b0'; g.fillRect(X + 5, Y + 3, TILE - 10, 7); } break; }
      case 'T': g.fillStyle = '#3e2614'; g.fillRect(X + 4, Y + 4, TILE - 8, TILE - 8); g.fillStyle = '#5a3a20'; g.fillRect(X + 6, Y + 6, TILE - 12, TILE - 12); break;
      case 'S': g.fillStyle = '#2c1c10'; g.fillRect(X + 1, Y + 1, TILE - 2, TILE - 2); g.fillStyle = '#7a6a50'; for (let i = 0; i < 3; i++) g.fillRect(X + 4, Y + 5 + i * 9, TILE - 8, 5); break;
      case 'P': g.fillStyle = '#3a2a20'; g.beginPath(); g.arc(X + 16, Y + 16, 9, 0, 7); g.fill(); g.fillStyle = '#1f3a1e'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(X + 16 + Math.cos(i) * 7, Y + 16 + Math.sin(i * 1.3) * 7, 6, 0, 7); g.fill(); } break;
      case 'O': g.fillStyle = '#4a1418'; g.fillRect(X + 1, Y + 5, TILE - 2, TILE - 10); g.fillStyle = '#6a2026'; g.fillRect(X + 3, Y + 9, TILE - 6, TILE - 16); break;
      case 'R': g.fillStyle = '#2a160c'; g.fillRect(X, Y + 6, TILE, TILE - 10); g.fillStyle = '#6a4220'; g.fillRect(X, Y + 6, TILE, 4); break;
      case 'L': case '9': g.fillStyle = '#4a2a14'; g.fillRect(X + 2, Y + 10, TILE - 4, 12); g.fillStyle = '#d6a85a'; g.fillRect(X + 22, Y + 14, 3, 3); if (ch === '9') { g.fillStyle = '#d6a85a'; g.font = 'bold 8px serif'; g.fillText('009', X + 8, Y + 19); } break;
      case 'd': g.fillStyle = '#2a1a0c'; g.fillRect(X + 2, Y + 10, 4, 12); break;
      case 'X': g.fillStyle = '#3a2412'; g.fillRect(X + 1, Y + 2, TILE - 2, TILE - 4); g.strokeStyle = '#8a8a8a'; g.lineWidth = 2; g.beginPath(); g.moveTo(X, Y + 8); g.lineTo(X + TILE, Y + 24); g.moveTo(X, Y + 24); g.lineTo(X + TILE, Y + 8); g.stroke(); break;
    }
  }

  drawWorld(ctx) {
    const r = this.receptionist;
    if (r.visible) {
      ctx.globalAlpha = Math.max(0, r.fade);
      ctx.fillStyle = '#1a1a22'; ctx.beginPath(); ctx.ellipse(r.x, r.y, 10, 12, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#d8d0c8'; ctx.beginPath(); ctx.arc(r.x, r.y + 2, 6, 0, 7); ctx.fill();
      ctx.fillStyle = '#000'; ctx.fillRect(r.x - 3, r.y + 2, 2, 2); ctx.fillRect(r.x + 1, r.y + 2, 2, 2);
      ctx.globalAlpha = 1;
    }
    // telephone & photo
    const ph = tc(36, 11); ctx.fillStyle = '#111'; ctx.fillRect(ph.x - 6, ph.y - 4, 12, 8); if (this.ringing && Math.sin(this.time * 30) > 0) { ctx.strokeStyle = '#ffcf6a'; ctx.beginPath(); ctx.arc(ph.x, ph.y, 12 + (this.time * 20 % 8), 0, 7); ctx.stroke(); }
    // hiding indicator for current spot
    if (this.player.hidden) { ctx.strokeStyle = this.holding ? 'rgba(120,200,255,.7)' : 'rgba(255,255,255,.35)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(this.player.x, this.player.y, 12, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
  }

  drawCreature(ctx, c, t) {
    ctx.save(); ctx.translate(c.x, c.y);
    ctx.shadowColor = '#000'; ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.ellipse(0, 6, 16, 9, 0, 0, 7); ctx.fill();
    ctx.rotate(c.angle);
    const sway = Math.sin(t * 6) * 3;
    ctx.fillStyle = '#060406';
    ctx.beginPath(); ctx.ellipse(0, 0, 12, 15, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#060406'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(2, -10); ctx.lineTo(22, -16 + sway); ctx.moveTo(2, 10); ctx.lineTo(22, 16 - sway); ctx.stroke();
    ctx.shadowBlur = 10; ctx.shadowColor = c.state === 'chase' ? '#f00' : '#fff';
    ctx.fillStyle = c.state === 'chase' ? '#ff3a2a' : '#f4f0e8';
    ctx.beginPath(); ctx.arc(8, -4, 2, 0, 7); ctx.arc(8, 4, 2, 0, 7); ctx.fill();
    ctx.restore();
    c.drawAwareness(ctx);
    if (c.state === 'inspect') { ctx.fillStyle = '#ffb040'; ctx.font = '12px serif'; ctx.textAlign = 'center'; ctx.fillText('listening…', c.x, c.y - 26); }
  }

  drawOverlay(ctx, W, H) {
    // rain streaks across the windows of the screen
    ctx.strokeStyle = 'rgba(160,180,220,0.08)'; ctx.lineWidth = 1;
    ctx.beginPath();
    this.rain.forEach(d => { d.y += 0.02 * d.s; d.x += 0.004 * d.s; if (d.y > 1) { d.y = 0; d.x = Math.random(); } const x = d.x * W, y = d.y * H; ctx.moveTo(x, y); ctx.lineTo(x + 4, y + 20 * d.s); });
    ctx.stroke();
    if (this.flashT > 0) { ctx.fillStyle = 'rgba(200,210,255,0.08)'; ctx.fillRect(0, 0, W, H); }
  }
}
