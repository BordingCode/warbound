# Warbound

A single-player **fantasy auto-battler** (Teamfight Tactics / Dota Underlords / Auto Chess style), built as a **vanilla HTML/CSS/JS PWA** — no build step, runs offline.

🎮 **Play:** https://bordingcode.github.io/warbound/

Assemble a warband of champions, arrange them on a grid, and watch them fight automatically. Buy three copies of a champion to fuse them into a stronger ★★ (then ★★★). Each champion has two trait tags — an **Origin** (Undead, Elf, Dragon…) and a **Class** (Knight, Mage, Assassin…) — and fielding several of one trait unlocks team synergies. Climb a ladder of escalating enemy boards: **win 10 rounds before losing 5 lives.**

## How it plays
- **Buy** champions from the shop (gold). **Drag** them from the bench onto the board; tanks front, carries back. Drag to 🗑 to sell.
- **Synergies** (the bar near the top) activate at unit-count breakpoints.
- **Items**: combine two components on a champion to forge a powerful item. **Relics**: run-long blessings drafted at act boundaries.
- **Scout** the next enemy (shown dimmed on the top half) and counter-position.

## Architecture
The spine is a **pure, deterministic combat simulation** separated from rendering:

- `js/sim/combat.js` — `simulate(playerBoard, enemyBoard, seed, opts)` runs the whole fight (30 ticks/s) with **no DOM, no `Math.random`, no wall-clock**, returning an **event timeline** + result. Same inputs → identical fight, every time.
- `js/render/player.js` — plays the timeline back onto the DOM (speed 1×/2×/4×, skip). The sim decides the fight; the renderer just performs it.
- This split buys replays, speed controls, headless tests, and **headless balancing**.

Other modules: `state/run.js` (economy/run state + save), `data/{units,traits,items,relics,enemies}.js`, `input/drag.js` (Pointer Events), `audio/audio.js` (procedural Web Audio), `render/fx.js` (screen-shake + confetti), `svg.js` (parametric champion art).

## Develop / test
No build step — open `index.html` via any static server (`python3 -m http.server`).

```
node test/run.js          # combat-sim invariants (determinism, termination, monotonicity)
node test/smoke-run.js    # a bot plays full runs through the real pipeline
node js/sim/autobalance.js # headless pacing + unit/ladder balance read
```

Console debug hook: `window.__wb` (`__wb.run`, `__wb.giveGold(n)`, `__wb.place(uid,c,r)`, `__wb.fight()`).

See `DESIGN.md` for the full design + build plan and current status.
