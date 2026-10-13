# Build Plan — Nightmares Reimagined: The Book of Secrets

1. ✅ Shared engine: input, tile maps, collision, pathfinding, ray-cast lighting, Stalker AI (`public/js/engine.js`)
2. ✅ Procedural audio + music (`audio.js`), dialogue with subtitles/TTS (`dialogue.js`), localStorage memory (`storage.js`)
3. ✅ UI: HUD, modals, keypad, symbol dials, settings, statistics, pause, results (`ui.js`, `main.js`)
4. ✅ Cinematic intro, title menu, book level selector
5. ✅ Level 1 — The Midnight Hotel (`levels/hotel.js`), registered in `levels/index.js`
6. ⬜ Level 2 — The Forgotten Hospital (`levels/hospital.js`): records, power restore, patient-number puzzle, two routes, movement/noise-reactive patient
7. ⬜ Level 3 — The Whispering Forest (`levels/forest.js`): three symbols, shifting paths, false whispers, light-attracted creature, shrine dials
8. ⬜ Level 4 — The Haunted Kingdom (`levels/kingdom.js`): village, artifacts, symbol doors, guardians, hazards, 4-phase king boss (finale already in `main.js`)
9. ⬜ Register levels 2–4 in `levels/index.js` (art images already in `public/img/`)
10. ⬜ Full play-test of all four levels

## Source-preserving Phoenix upgrade

The supplied source was backed up before editing. Contextual hints, a Phoenix Coin market, real toggleable power-ups, once-only hotel victory rewards, checkpoint restoration, pause-aware audio/dialogue, and touch controls were added to the existing Canvas game. Netlify Database and a Function endpoint were added for persistent revision-checked saves. Original images, map, storyline, puzzle, and adaptive enemy were retained.

Playable chapters 2–4 were not supplied. Their roadmap above remains intact; no replacement storyline was invented. Runtime/deployment-preview checks in `QA.md` remain outstanding because local validation commands were prohibited.
