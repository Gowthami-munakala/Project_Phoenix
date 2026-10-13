# AGENTS.md
Static game in `public/` (publish dir, no build). See **PLAN.md** for remaining milestones.
- `js/engine.js` — `BaseLevel` (lifecycle, scripted `run`/`w`/`say`, objectives, inventory, lighting, render) and `Stalker` (enemy state machine: patrol/investigate/search/chase with hooks `onHear`, `sightMul`, `doSearch`, `custom`, `draw`). `Grid` carves maps; `tc()` = tile center.
- `js/levels/*.js` — one class per level extending `BaseLevel`; must set `id`, `map`, implement `drawTile`, call `this.complete()` / `this.gameOver()`. Register in `levels/index.js` (fields: id, index, num, title, art, glow, description, objective, atmosphere, Level).
- `js/storage.js` — `Memory` records behaviour; enemy brains must query it so decisions actually change.
- `js/main.js` — screens, intro, book, pause, results; `kingdom` id triggers the finale.
- Conventions: vanilla JS, no deps, all audio procedural via `Audio.play(name)`; images via `setArt()` (Image CDN with raw fallback). Never let audio/TTS failures block gameplay.
