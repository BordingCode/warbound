# Warbound — project guide for Claude

A vanilla HTML/CSS/JS **PWA**: a **solo fantasy auto-battler** (Teamfight Tactics /
Dota Underlords style) — buy units in a shop, position a board, watch deterministic
auto-combat, climb a roguelite ladder. No build step. Repo: `BordingCode/warbound`
(branch **main**), GitHub Pages (`bordingcode.github.io/warbound`).

## Before working
Read the shared game-dev knowledge base: **`~/cc/gamedev-kb/INDEX.md`** (lowercase `cc`).
Especially `patterns/dom-screen-games.md`, `patterns/canvas-engine-games.md`,
`patterns/mobile-ios-safari.md`, and `checklists/ship-checklist.md`.

## Architecture
- `js/main.js` — boot + UI; exposes `window.__wb` debug global.
- `js/data/` — content tables: `units.js`, `traits.js`, `items.js`, `augments.js`,
  `creatures.js`, `enemies.js`, `honors.js`.
- `js/state/` — `run.js`, `meta.js`, `rank.js`, `bots.js`.
- `js/sim/` — deterministic combat + `autobalance.js`.

## ⚠️ DESIGN.md is out of date
`DESIGN.md` (and `ABILITIES_SPEC.md`) describe an earlier plan and **do NOT match the shipped
game** (shipped: ~35 units, 4 modes, an ascension ladder, and a meta-economy). **Trust the
code and `js/data/` tables, not the design docs.**

## Deploy convention — every change MUST
- **Bump the SW `CACHE` string** in `sw.js` (e.g. `warbound-v151`→`v152`) **and** bump the
  `?v=` query on changed `<link>`/`<script>` tags in `index.html`. Both are required (it uses
  `?v=` busting) or stale code is served — even browser tests pass on stale files.
- Be **committed and pushed** to `main`.

## Tests
- `npm test` → `node test/run.js` (headless `.test.js` suite: ascension, ladder, synergy,
  carousel, boss-seed, meta, …).
- `npm run balance` → `node js/sim/autobalance.js`.
- Test hook `window.__wb` for browser-driven verification. Combat is deterministic
  (same boards + seed → same fight).

## Notes
- Phone-first; drag-to-place units; audio on first gesture.
- localStorage includes `warbound_artset`.
