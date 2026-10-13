# Project Phoenix verification

## Actual editing-session results

| Check | Result |
| --- | --- |
| Source extraction/backup | Completed; original ZIP retained outside `public/` |
| Image integrity | All five SHA-256 hashes matched the archive |
| Dependencies | Installation succeeded, 31 packages installed, lockfile created |
| Database migration | Drizzle successfully generated the save-table migration |
| Source review | Covered wallet migration, purchase/reward guards, checkpoint reconstruction, pause/audio lifecycle, modal cleanup, mobile bindings and deployment configuration |
| Runtime startup/playthrough, saves, purchases, hints and rewards | Not executed |
| Desktop/mobile and laptop performance | Not executed |
| Production build/deploy | Not executed; subsequent platform validation was pending |
| Level 2 progression | Unavailable: no implementation in original archive |

Local validation, development-server, build and test commands were prohibited. Static inspection and asset-integrity checks are not runtime tests. No runtime pass or deployment success was claimed.

## Deployment-preview verification checklist

Use a disposable browser profile or preview origin and its database branch, never a real player's only save. Keep the source ZIP and browser backup. Run through a Netlify-enabled local environment (`npm ci`, `npm run dev`) or deployed preview; a static server cannot exercise cloud economy operations.

| Scenario | Expected behavior to verify |
| --- | --- |
| Startup | Original gate, intro, book, hotel, map and story load; no guest selection or replacement engine |
| New wallet | Market shows 1,000 Phoenix Coins; gameplay has no permanent wallet panel |
| Legacy migration | A copied old profile on the same origin retains settings, completion, statistics, unknown fields and a valid zero balance; raw backup is preserved when storage permits |
| Purchase/cancel | Cancel costs nothing; confirm Stamina Boost deducts 150 once and activates ownership |
| Duplicate/concurrent purchase | Repeated/overlapping confirmation produces exactly one deduction and ownership record |
| Insufficient funds | Unaffordable purchase is disabled in UI and rejected by server; balance never goes negative |
| Persistence/activation | Refresh retains balance, ownership and activation; toggling costs nothing |
| Effects | Compare running stamina/regen, beam reach, noise detection, awareness and breath duration with each upgrade on/off; scanner follows the current objective |
| Recovery | First capture rescues to lobby with +90 seconds; second fails; retry/Continue cannot rearm it, fresh Play can |
| Hints | Distinct contextual clues appear in a small dismissible box; no more than four are spent; no new clue means no charge; retry/Continue retain usage |
| Pause | Esc/button stop timer, movement, AI, scripted waits, dialogue and appropriate audio; Resume continues same progress |
| Nested menus | Shop/settings/controls close one at a time with Esc; game remains paused under the pause menu; no lingering listeners |
| Checkpoints | Key, opened 009 door, photo/phone sequence, escape, notes and register survive refresh/Continue without rerolling code or softlocking interaction |
| Invalid checkpoint | Missing/invalid fields fall back safely without changing currency or completed chapters |
| Puzzle/victory | Actual register-derived code opens exit and original ending plays; first completion earns 500 saved coins; dust objective completes |
| Reward replay/retry | Repeat completion/reward request adds zero; pending reward can be collected once after service recovery |
| Failure | Panel shows +0; owned currency, upgrades and checkpoint remain |
| Network interruption | No optimistic debit; errors are clear; offline compatibility snapshot remains; reward retry is idempotent |
| Story reset | Explicit confirmation resets story/memory but preserves wallet, ownership, settings and claimed rewards |
| Mobile | Portrait/landscape controls move, run, interact, light, throw and hold breath; pointer cancellation releases inputs; panels fit |
| Accessibility | Top-modal Tab/Shift+Tab focus containment, Esc behavior, restored focus and reduced-motion preference work |
| Deployment | Migration applies; static `public/` and `/api/game-save` work; no credential configuration is committed |
| Level 2 | Requires the missing original chapter source; do not add a fabricated replacement |

Browser-reported completion is not competitive anti-cheat. Anonymous sessions are origin-bound; domain/device changes and cleared cookies require a deliberate recovery/transfer strategy before production rollout.
