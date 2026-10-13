# AGENTS.md
Static 2D game in `public/` (publish directory, empty build command). This upgrades the uploaded source. Only the hotel chapter exists; other chapter artwork/roadmap remain, but playable source was not supplied. See `README.md`, `PLAN.md`, and `QA.md`.

- `js/engine.js` — `BaseLevel` (lifecycle, scripted `run`/`w`/`say`, objectives, inventory, lighting, render) and `Stalker` (enemy state machine: patrol/investigate/search/chase with hooks `onHear`, `sightMul`, `doSearch`, `custom`, `draw`). `Grid` carves maps; `tc()` = tile center.
- `js/levels/*.js` — one class per level extending `BaseLevel`; must set `id`, `map`, implement `drawTile`, call `this.complete()` / `this.gameOver()`. Register in `levels/index.js` (fields: id, index, num, title, art, glow, description, objective, atmosphere, Level).
- `js/storage.js` — `Memory` records behaviour; enemy brains must query it so decisions actually change.
- `js/main.js` — screens, intro, book, pause, results; `kingdom` id triggers the finale.
- `public/js/phoenix.js` — pure catalog, wallet migration, contextual clues, purchase and once-only reward rules shared by browser and server.
- `netlify/functions/game-save.mts` — same-origin save service, hashed anonymous HttpOnly session cookie and revision-checked atomic updates. Never log cookies, hashes, saves, or environment values.
- `db/`, `drizzle.config.ts`, `netlify/database/migrations/` — managed Postgres schema/client and generated migrations. Use Netlify's Drizzle adapter with beta-tagged Drizzle dependencies. Generate migrations; never modify applied migrations or run production DDL directly.
- `backup/Project_Phoenix-original.zip` — unmodified source archive, outside the public directory; never replace or publish it.
- Conventions: no frontend framework/new engine dependencies; procedural audio via `Audio.play(name)`; images via `setArt()` with raw fallback. Preserve the original map, storyline, assets, adaptive memory and save key. Audio/TTS failure must never block play.
- Persistence: Netlify Database is authoritative for the new economy. Existing localStorage remains a compatibility/recovery mirror and migration source. Preserve zero balances and unknown fields. Never accept snapshot coins/ownership/reward claims over server-owned values.
- Lifecycle: `BaseLevel.w()` uses simulation time; `Dialogue.delay()` respects pause. Run scripted sequences via `BaseLevel.run()` so autosaves avoid unfinished sequences. Restores rebuild interaction closures, then apply validated state; never serialize DOM nodes, contexts, live enemies or closures.
- UI: modal handles own keyboard/focus cleanup; close via handles rather than removing nodes. Hints use a small dismissible box. Coins appear only in market/results panels. Touch bindings attach once in the singleton Input instance.
- Economy: permanent, toggleable ownership; one rescue per fresh attempt; four distinct hints per fresh attempt. Continue/retry retain hint/recovery usage. Rewards are once per chapter and failure cannot erase currency.
- Saves are origin-bound/anonymous, not cross-device accounts or anti-cheat. Do not fabricate a playable Level 2 to conceal missing source.
- Local setup: `npm ci`, then `npm run dev` with Netlify CLI on port 8889. No frontend build command. Use `QA.md` and follow session restrictions before runtime validation.
