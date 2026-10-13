# Project Phoenix · Nightmares Reimagined: The Book of Secrets

“Your enemy learns. Your book remembers.”

This upgrades the uploaded source, not a replacement game. The existing 2D Canvas renderer, vanilla JavaScript ES modules, hotel map, randomized register puzzle, adaptive Occupant, story, procedural Web Audio, TTS/subtitles, and all five images remain. Netlify Functions and Netlify Database add durable saves and atomic economy operations without a frontend framework or new game engine.

## Included chapters

The archive implemented only **Level 1: The Midnight Hotel — Room 009**. Hospital, forest, and kingdom artwork and roadmap entries were included, but playable chapter source files were absent. These assets and the roadmap were preserved; no substitute Level 2 or invented storyline was added. Coins/upgrades stay in the profile for future chapters. Level 2 progression cannot be exercised until its original implementation is supplied.

## Playing

Play starts a fresh attempt; Continue restores the most recent unfinished checkpoint. Completed chapters, settings, adaptive enemy memory, coins, and upgrades remain. Checkpoints preserve the original random register/code, inventory, objectives, items, doors, timer, flashlight, and story stage. An escape checkpoint grants at least three minutes and restores the enemy away from the player.

WASD/arrows move · Shift run · E/Enter interact/hide · F flashlight · Q throw · Space hold breath · H hint · Esc/P pause · M mute. Touch devices receive equivalent on-screen controls. Initial interaction unlocks browser audio. At most four distinct contextual clues are available per fresh attempt, displayed in a small dismissible box; retries and Continue retain hint usage. No clue is spent when no new relevant hint is available.

Pause suspends simulation, level waits, enemy AI, movement, appropriate audio, and dialogue timing. Shop/settings/controls nest above the pause menu. Closing a nested panel keeps the game paused. The chapter has a longer escape window, clearer locations/puzzle instructions, less tiring running, and more forgiving awareness/breathing. Canvas density is capped at 1.5 to reduce rendering cost.

## Phoenix Coins and power-ups

The Phantom Market shows the wallet only when opened. New wallets start with **1,000 Phoenix Coins**; existing valid balances, including zero, remain. The first successful hotel completion awards **500 coins**. Replays and failure award zero, and failure never removes an existing balance. Failed reward saves can be retried in results or the market.

| Power-up | Price | Active effect |
| --- | ---: | --- |
| Stamina Boost | 150 | 45% less drain, 50% faster regeneration |
| Extended Flashlight | 200 | 35% more range; half battery drain where batteries are used |
| Silent Steps | 250 | 65% smaller running-noise radius; quieter steps |
| Emergency Recovery | 300 | One rescue per fresh attempt; lobby return with 90 extra seconds |
| Fear Resistance | 350 | 40% slower enemy awareness; 50% longer breath holding |
| Objective Scanner | 400 | Subtle world-space compass and nearby objective marker |

Purchases require confirmation, sufficient funds, and server approval. Ownership is permanent, duplicates are rejected, and owned upgrades can be activated/deactivated without a second charge. Throwable distraction coins remain separate inventory items; throwing never spends Phoenix Coins. The hotel has no finite flashlight battery, so its range effect works while conservation is ready for battery-based chapters.

## Local setup

Use Node.js 22+ and the Netlify CLI. From the project root:

```bash
npm ci
netlify link
npm run dev
```

Open `http://localhost:8889`. Link the intended site so Netlify Functions and Database are available; do not link an unrelated production database. Serving only `public/` runs the canvas game and raw-image fallbacks but cannot perform cloud purchases/rewards. Service failures are shown rather than silently charging coins.

## Netlify deployment

Connect the repository to the intended Netlify site and deploy normally. Retain the original **empty build command** and **publish directory `public`**. The frontend remains static without compilation. Netlify installs locked dependencies and bundles `netlify/functions`.

The Drizzle schema is in `db/schema.ts`; its generated migration is in `netlify/database/migrations/20261013094551_create_phoenix_game_saves/`. Netlify provisions the database and applies pending migrations during deployment. Do not run migrations directly against production or commit credentials. Static-folder-only deployment omits the required functions/migrations.

For future schema changes, edit `db/schema.ts`, then run `npm run db:generate -- --name <descriptive_name>`. Keep the beta-tagged Drizzle packages required by the Netlify adapter; the lockfile pins installed versions. Verify a deployment preview with `QA.md` before publishing to players. No production deployment was triggered here.

## Preservation and limitations

The unmodified uploaded source ZIP is `backup/Project_Phoenix-original.zip`, outside the publish directory. Its SHA-256 is `84a88e87a19964c848db7f0a1707752f436996930c8647852d4548f019684bbb`. All original image hashes matched the backup.

The existing browser key `nightmares-book-of-secrets-v1` remains a compatibility/recovery mirror. Before migration, its raw value is backed up once under `nightmares-book-of-secrets-v1-before-phoenix`, when storage permits. Unknown fields, settings, completed flags, adaptive statistics, and recognized legacy wallet fields are retained. Previously completed chapters are marked already rewarded during legacy migration.

Unreadable legacy data is not overwritten. In that case, the market shows a warning and uses the separate `nightmares-book-of-secrets-v1-phoenix-recovery` mirror, leaving the original raw value available for repair.

Netlify Database is authoritative for the new economy. An HttpOnly same-site cookie identifies an anonymous browser profile; only its hash is stored in the database. Revision-checked updates protect simultaneous purchases/rewards. Newer offline browser snapshots are reconciled without overwriting the authoritative wallet. Cloud failures are explicit; purchases are not optimistically charged.

**Origin matters:** saves/cookies do not automatically transfer between the original game domain, a new Netlify domain, previews, localhost, or another device. For automatic migration, publish on the original site/origin without clearing browser storage/cookies. The ZIP contains source, not players' browser saves. Cross-device accounts and a cross-origin transfer UI are not included. Removing the session cookie can detach a browser from its cloud row; retain browser data and the immutable backup.

Reset story progress is an explicit confirmed action and retains coins, upgrades, settings, and claimed rewards. Starting/failing an attempt does not reset these values. Browser-reported victory is not a competitive anti-cheat system.

## Verification status

Dependency installation and migration generation succeeded. Static review covered migration, purchase/reward guards, checkpoint reconstruction, pause nesting, input cleanup, and deployment settings. All five original images were byte-for-byte unchanged.

**Runtime tests, a local server, and production builds were not run**, because the session prohibited local validation/start/build/test commands. The subsequent platform validation outcome was unavailable. Desktop/mobile playability, live database behavior, and laptop performance require `QA.md`; these are not claimed as passed.
