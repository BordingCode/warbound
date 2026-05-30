# Warbound — Expert Build Plan & Design Document

> **Title:** *Warbound*.
> A **single-player fantasy auto-battler** in the style of Teamfight Tactics / **Dota Underlords** / Auto Chess — built as a **vanilla HTML/CSS/JS PWA**, no build step, runs offline, hosted on GitHub Pages.
>
> **Locked decisions:** full depth including **★★★ (9-copy) from the start**; **Dota-leaning balance** (Underlords alliance thresholds 3/6/9 on big classes, Underlords economy feel, "pick 1 of 3" item drops); **gritty heroic-dark-fantasy tone** — a varied Dota-style roster (knights, trolls, demons, dragons, beasts, undead) in cohesive hand-made SVG.
>
> This document is the synthesis of 8 deep-research passes (genre economy math, trait design, combat simulation, solo-run design, items, vanilla-web implementation, juice/audio/readability, and balance methodology). Every number below is a *tuned starting point*, not gospel — they are meant to be validated by the simulation harness (§10).

---

## 0. The one-paragraph pitch

You are a commander assembling a **warband of fantasy champions**. Each round you spend gold in a shop, place champions on a battle grid, and watch them fight an enemy warband automatically. Buying three copies of a champion fuses them into a stronger ★★ version (nine → ★★★). Every champion has **two trait tags** — an **Origin** (Undead, Elf, Dragon…) and a **Class** (Knight, Mage, Assassin…) — and fielding several of the same trait unlocks powerful team bonuses. You climb a **roguellike ladder of escalating enemy boards** across three acts; **5 lives, race to 10 wins**, ending in a hand-crafted boss. Combat is **deterministic** (same boards + seed → same fight), which makes it fair, replayable, and — crucially — automatically balanceable.

---

## 1. Design pillars (what we will not compromise)

1. **Decisions in planning, spectacle in combat.** All skill is expressed buying, positioning, and itemising between fights. Combat is a *readable performance* of those decisions.
2. **Every loss has a clear reason.** Deterministic combat + telegraphing + a post-fight "why you lost" summary + a watch-again replay. If a loss feels random, the strategy layer collapses.
3. **The sim is the source of truth; the DOM just performs it.** A pure, DOM-free, seeded simulation computes the entire fight up-front as a timeline of events; the renderer animates that timeline. This buys determinism, replays, speed controls, headless testing, and headless *balancing* — all for free.
4. **Pleasant, procedural audio as a second information channel** (Web Audio, no files). Never harsh.
5. **Phone-first PWA.** Touch drag-and-drop, safe areas, 100svh, offline.
6. **Depth through dual traits + positioning, not just bigger numbers.**

---

## 2. Technical architecture

Vanilla ES modules, no bundler. The decisive split (from the implementation research) is **pure sim ↔ timeline renderer**.

```
warbound/
  index.html              app shell: board layers, bench, shop, drag-layer, HUD
  manifest.json  sw.js     PWA (network-first, versioned cache, .nojekyll alongside)
  css/
    tokens.css            :root palette + spacing + trait colours
    board.css  units.css  hud.css  fx.css
  js/
    main.js               boot + screen router (aegis go(name) pattern)
    rng.js                seeded mulberry32 (gamedev-kb recipe)
    grid.js               square-grid coords, distance, neighbours, BFS pathfind
    data/
      units.js            ~30 champion DEFS (id, origin, class, cost, stats, ability, svgId, accent)
      traits.js           12 trait DEFS (breakpoints + effects)
      items.js            5 components + 15 combined items
      enemies.js          authored enemy-board archetypes, tagged by power budget
      relics.js           run-modifier blessings
    sim/
      combat.js           simulate(board, seed) -> { events[], result, finalState }   ← PURE
      rules.js            targeting / damage / mana / ability pure fns
      autobalance.js      headless round-robin + per-unit value (Node + browser)
    render/
      player.js           playTimeline(events, speed): rAF clock applies events
      view.js             tileToPx, spawn/move/flash/faint/dmg; canvas FX overlay
    input/drag.js         Pointer-Events drag (capture, ghost, hit-test, snap, cancel)
    state/
      run.js              persistent run object; save/load warbound_run_v1
      meta.js             warbound_meta_v1 (unlocks, ascension, cosmetics)
    audio/audio.js        Web Audio bus + procedural SFX + light music bed
    engine/pool.js        object pool for damage numbers + particles
  test/run.js             plain-JS assertion harness (node test/run.js)
  DESIGN.md  README.md
```

**Determinism contract (non-negotiable, enables everything):**
- One **seeded PRNG** (mulberry32). **No `Math.random()`, no `Date.now()`, no wall-clock** anywhere in sim or shop-roll logic.
- Units processed in a **stable array sorted by integer id** — never Map/object iteration order.
- **Explicit tie-breaks** everywhere "nearest / lowest / random" could tie (by unit id, then cell index).
- Per-combat seed derived deterministically: `combatSeed = hash(run.seed, run.round)`.

**State rules (from KB `state-and-persistence.md`):** serialise IDs not objects; version the save key; `try/catch` every read with fresh-run fallback; save on every meaningful change; settings + meta-progression in separate keys.

---

## 3. Board & combat model

### 3.1 Board
- **8×8 square grid** (recommended over hex for v1 — halves coordinate/adjacency/pathfinding complexity, reads fine; hex math is documented and can come later). Two halves: **player deploys in their front 4 rows**, enemy in theirs; the halves combine into the 8×8 arena for combat.
- **Tiles** laid out by CSS Grid (static, square via `aspect-ratio`, `repeat(8, minmax(0,1fr))` + `min-width:0` for the Safari overflow gotcha). **Units live in a separate absolutely-positioned overlay**, placed by `transform: translate()` so they can animate smoothly between tiles and during drag. A single pure `tileToPx(col,row)` function serves both layout and combat animation.
- **Bench** (reserve, ~9 slots) and **shop** (5 slots) are flex rows below the board. A dragged unit's ghost lives in a top-level overlay so it isn't clipped.

### 3.2 Combat resolution (the pure sim)
Fixed-timestep tick loop, **30 ticks/s**, runs the whole fight to completion before any animation:

- **Targeting:** each idle unit picks the **nearest living enemy** by grid distance (tie-break by id/cell). Retarget when the target dies.
- **Movement:** BFS flood-fill from target; step to the adjacent free cell with lowest distance. Occupied cells aren't walkable.
- **Range:** melee = 1, ranged = N cells. In range → stand and attack; else step toward.
- **Assassins:** one-time pre-combat blink adjacent to the furthest/back-line enemy, then normal targeting.
- **Attacks:** `timeBetween = 1 / attackSpeed`; each auto-attack deals `AD` physical damage and grants mana.
- **Mana → abilities:** units gain mana per auto-attack (**10** melee-carry, **7** caster, **5** tank) and **1% pre-mitigation + 3% post-mitigation** damage taken (cap ~42.5/instance); at full mana they **cast immediately**, then a **~1s mana lockout**, with overflow carried over.
- **Abilities = data + handler:** target rule (current / farthest / lowest-HP-in-radius), shape (single / line / cone / circle), damage type + amount (scales with Ability Power), side effects (stun, shield, heal).

### 3.3 Combat math (real TFT formulas, hard-coded)
- **Damage reduction:** `dmgTaken = raw × 100 / (100 + Resist)` for physical (armor) and magic (MR). Negative resist clamped to 0. (Linear effective-HP; never reaches 100%.)
- **True damage** ignores resists.
- **Crit:** physical hits crit for ×1.4 by default (chance from seeded RNG).
- **Heal:** add HP, clamp to max; support heal-reduction debuff as a multiplier.

### 3.4 Ending a fight
- **Win** = wipe enemy; **Loss** = your board wiped.
- **Hard combat cap ~45s** (`MAX_TICKS`) → draw / tiebreak by surviving units, so infinite-heal stalemates can't hang.
- **Player damage on loss:** `base(round) + Σ(survivor cost × star) + 2 × survivorCount`. Base-by-round ramps (≈ 0 / 2 / 5 / 8 / 10 / 12 / 17). Start HP **100**.

### 3.5 The timeline (sim output the renderer plays back)
```js
[ {t:0,type:'spawn',id,col,row}, {t:500,type:'move',id,col,row},
  {t:760,type:'attack',src,tgt}, {t:760,type:'projectile',from,to,kind,flight},
  {t:940,type:'damage',tgt,amount,hp,dmgType}, {t:1300,type:'faint',id},
  {t:4200,type:'end',winner} ]
```
Renderer keeps a clock; each frame applies events with `t ≤ clock`. `speed` scales the clock (1×/2×/4×); **skip** jumps to the end and reads `finalState`.

---

## 4. Economy & progression (solo-tuned numbers)

| System | Value | Note |
|---|---|---|
| Starting gold | 2 | eases in |
| Passive income | 2 (R1–4) → 4 (act 2) → 5 (act 3+) | |
| **Interest** | +1 per 10 gold held, **cap +5** | the core save-vs-spend lever — keep verbatim |
| Win streak | 2–3 = +1, 4 = +2, 5+ = +3 | |
| Loss streak | 2–3 = +1, 4 = +2, 5+ = +3 | built-in anti-snowball valve |
| Win bonus | +1 gold per round won | |
| Reroll shop | 2 gold (raise to 3 if player out-econs the ladder) | |
| Buy XP | 4 gold → 4 XP | |
| Free XP | +2 / round (from act 2) | |
| Max level | 9 | shorter solo run |
| XP per level (→2…→9) | 2 / 2 / 6 / 10 / 20 / 36 / 56 / 80 | |
| **Board size** | = player level | level 6 → 6 units |
| Shop slots | 5 | |
| Shop tier odds by level | use the TFT table (below) | |
| Pool — copies each | 1c:22  2c:18  3c:14  4c:6  5c:4 | **shrunk for solo** (only you drain the pool, else 3-starring is trivial) |
| Distinct units / tier | ~12 / 6 / 6 / 4 / 2 (≈30 total) | |
| Star-up | 3 copies → ★★, 9 → ★★★ | ~×1.6 stats per star |

**Shop tier probability by player level (TFT table, used as-is):**

| Lvl | 1c | 2c | 3c | 4c | 5c |
|---|---|---|---|---|---|
| 1–2 | 100 | – | – | – | – |
| 3 | 75 | 25 | – | – | – |
| 4 | 55 | 30 | 15 | – | – |
| 5 | 45 | 33 | 20 | 2 | – |
| 6 | 30 | 40 | 25 | 5 | – |
| 7 | 19 | 30 | 40 | 10 | 1 |
| 8 | 17 | 24 | 32 | 24 | 3 |
| 9 | 15 | 18 | 25 | 30 | 12 |

**Power monotonicity invariant (assert via sim):** a 2★ cost-N must beat a 1★ cost-(N+1) but lose to a 2★ cost-(N+1). A 3★ 5-cost is the strongest thing in the game, by a lot.

---

## 5. Champions & traits

### 5.1 Trait matrix — 6 Origins × 6 Classes, ~30 units (~5 per trait)
Each unit pays into **one Origin + one Class**. Empty cells are intentional (scarcity + "bridge unit" value). Names are placeholders.

|  | **Knight** (block 2/4/6) | **Mage** (AP 2/4/6) | **Ranger** (atk-spd 2/4) | **Assassin** (dive+crit 2/4) | **Healer** (heal-amp 2/4) | **Summoner** (summons 2/4) |
|---|---|---|---|---|---|---|
| **Human** (mana regen 2/4/6) | Knight-Captain | Court Mage | — | Royal Blade | Field Medic | — |
| **Undead** (revive 2/4/6) | Bone Guard | Lich | Skeleton Archer | Wraith | — | Necromancer |
| **Elf** (dodge 2/4) | — | Moon Priestess | Wood Ranger | Shadow Dancer | Grove Healer | — |
| **Demon** (mana-burn 2/4/6) | Hellguard | Warlock | — | Imp Assassin | — | Pit Summoner |
| **Beast** (ferocity 2/4/6) | — | — | Beast Hunter | Pack Stalker | Druid Healer | Beastmaster |
| **Dragon** (elite 1/2) | Dragon Knight | Dragon Sage | — | — | — | — |

### 5.2 Trait effects (mix flat-stat "glue" with behaviour-changing traits)

**Origins**
- **Human** — team mana regen (+4/+7/+10 per sec): enabler for casters; the glue origin.
- **Undead** — on death, revive once at 30%/50%/70% HP: attrition.
- **Elf** — dodge + small start-of-combat shield (20%/35%): slippery.
- **Demon** — attacks chance to burn enemy mana / DoT: shuts down casters (soft-counter to Mage).
- **Beast** — stacking attack-speed/AD over the fight: snowballs in long fights.
- **Dragon** — activates at just 1/2 (expensive/rare): huge MR + a breath ability. Low-count, high-impact.

**Classes**
- **Knight** — flat per-hit damage block (15/30/60): great vs many small hits, weak vs burst (defensive).
- **Mage** — team Ability Power (+40/+120/+200) or double-cast: deep vertical burst.
- **Ranger** — periodic attack-speed spike / double-shot: ramping ranged DPS.
- **Assassin** — leap to enemy backline + crit scaling: positioning-warping carry-killer (offensive).
- **Healer** — amplify friendly healing (+20%/+40%) + regen: sustain enabler.
- **Summoner** — buff HP/duration of all summoned tokens: force-multiplier.

**Why this yields ≥4–5 viable comps + hybrids:** vertical Mage burst (Mage 4/6 + Human mana), Knight wall (Knight 4 + Undead revive + Dragon MR), Assassin dive (Assassin 4 + Beast ferocity), Summoner swarm (Necromancer + Pit Summoner + Beastmaster). Bridge units (Dragon Knight, Warlock, Druid Healer) let players pivot on what they draw.

**Anti-dominance levers:** defensive types counter specific offensive types (block vs burst); Assassin dive punishes greedy carry placement but is beaten by repositioning (free, skill-based counter); Demon mana-burn taxes casters; going vertical is telegraphed and contested. Verified by the sim's win-rate matrix (flag any comp >55–60%).

---

## 6. Items (TFT grid, Underlords-style draft acquisition)

- **5 components** (each a flat stat): **Sword** (+AD%), **Bow** (+AS%), **Rod** (+AP), **Armor** (+Armor & MR, collapsed for v1), **Belt** (+HP).
- **15 combined items** = the full 5×5 symmetric grid (combine two components on a unit). Effects limited to 6 easy-to-code archetypes: flat stats, on-hit chain, start-of-combat shield, lifesteal/vamp, team aura/mana, revive flag.
  - e.g. Sword+Sword = *Infinity Edge* (crit dmg), Sword+Rod = *Spellblade* (20% vamp), Sword+Armor = *Guardian* (revive at 30%), Bow+Bow = *Rageblade* (stacking AS), Rod+Armor = *Solari Locket* (start shield), Armor+Belt = *Warmog* (+HP+regen), Belt+Belt = *Redemption* (death heal).
- **Acquisition (kills RNG frustration):** every 2–3 rounds, a component drop is offered as **pick 1 of 3** (Underlords model); still drop on a loss (catch-up). Occasional pre-combined item draft.
- **Rules (copy TFT):** 3 items max per unit; auto-combine on second component; items return to bench on sell.
- **Defer to v2:** Spatula/Emblem trait-granting, split Armor/MR, radiant/global items, positional adjacency.

---

## 7. Solo roguelike structure

### 7.1 Run frame (the proven SAP/Bazaar shape)
- **5 lives, race to 10 wins.** Lose a life per defeat; the run ends at 10 wins or 5 losses.
- **+1 life back at round 3** if you've lost any (quiet anti-stomp floor).
- **3 acts** (~12–18 rounds total, ~12–20 min/run): **Act 1 experiment → Act 2 commit → Act 3 power-fantasy → boss.**

### 7.2 Enemy ladder — authored archetypes + bounded variation (no server)
- Hand-author **~15–25 named enemy boards**, each a *clean demonstration of one synergy* ("The Iron Wall — 4 Knights", "Mage burst", "Assassin dive"). Each tagged with a **net-worth power budget** (Σ unit cost × star + item tiers).
- At runtime: pick an archetype for the round, apply **bounded** variation (swap a same-cost sibling, nudge positions, sometimes add an item). Authored quality + "different every time" feel, all client-side.
- **Name the enemy board + show its active traits pre-fight** (the answer key) — teaches the player by fighting good comps.
- **Escalate each axis separately** (star level, item count, trait depth, board size), not one global multiplier.

### 7.3 Difficulty that scales to the player (anti-snowball + anti-stomp, fairly)
- Set next board budget = `base_curve(round) ± adjustment(player_strength)`. Over-performing → draw from the higher end + an item; behind → lower end.
- **Rubber-band the rewards, not the combat:** when behind (lost 2+ lives / low net worth), bias the shop and draft toward stronger/cheaper offers. **Never** secretly weaken the enemy mid-fight (breaks legibility).

### 7.4 Roguelike layer (build in ROI order)
1. **Between-round draft, 1-of-N** (relic / shop modifier / unit-or-item) — cheap, creates build identity.
2. **Relics / blessings** (~20–30 run-long passives: extra gold, free reroll, +1 board slot, trait bonus).
3. **Run seeds** (share/daily/beat-my-run; aids balancing & repro).
4. **Act bosses** with a gimmick; 2–3 alternate boss boards per act so the climax isn't memorised.
5. **Ascension tiers** (post-win meta) — vary the axis each tier (enemy stats / junk in shop / economy), not a flat bump.
6. **Cross-run *content* unlocks last** (new units/relics into the pool — variety, not power, to avoid trivialising early runs).

### 7.5 Onboarding (no tutorial wall)
- **Scripted weak first-run opponents** (single-synergy) so the player wins while learning buy→place→fight→upgrade.
- **Contextual coach toasts**, one concept at a time, fired by situation ("You have two of the same — buy a third for ★★!", "These two share the Knight trait"), gated behind a saved flag.
- **Progressive feature unlock:** run 1 = buy/place/upgrade/fight; introduce items, then dual synergies, then relics/drafts.
- **The deterministic replay is the best teacher** — watch why you lost.

---

## 8. Juice, audio & readability (combat = a readable performance)

**Readability first (every effect is also information):**
- One important thing at a time, foregrounded; big events louder than auto-attacks.
- **HP bar** (thin, two-layer with a lagging "ghost trail"), **mana bar** (flashes white at full — telegraphs the incoming cast), always visible.
- **Floating damage numbers**, colour-coded by damage type, scale by magnitude, crits gold + pop; heals gentler/green; stagger simultaneous numbers 40–80ms; pool + cap (~12 on screen).
- **Cast banner** (portrait + ability name) when a unit ults; **trait-chip flash** in the synergy panel when a threshold effect fires — connects panel → battlefield.
- Fixed **damage-type palette** used everywhere (numbers, projectiles, particles, post-fight meter): Physical white/orange, Fire/magic blue/red, Frost cyan, Poison green, True magenta.
- **Post-fight summary:** damage by unit + a one-line "why" ("Their Knights out-tanked your frontline") + **Watch replay**.

**Juice (render-only offsets — never move the sim entity), in ROI order:**
1. **Hit-flash** white ~60ms. 2. **Hit-pause/sleep** ~20ms normal, ~80–120ms crit/cast, ~120–200ms kill. 3. **Squash/scale-pop** on hit (back-out ease). 4. **Spawn pop** (0→1.15→1.0). 5. **Trauma screen-shake** (`shake = trauma²`, Perlin-noise offsets, translational + small rotational, used *sparingly* — only ults/crits/kills). 6. Projectiles/particles on a **canvas FX overlay** (DOM for ≤10, canvas for dense). 7. Death anim (flash→squash+fade→puff) + brief decal. 8. Victory confetti + gold-fly + rising sting; defeat desaturate + slow sting.
- Tier juice by importance so the busy board stays readable. Honour `prefers-reduced-motion`.

**Audio (Web Audio, procedural, pleasant, never harsh):**
- Bus: each SFX → `sfxGain`; music → `musicGain`; both → `masterCompressor` → `masterGain` → destination. Resume context on first tap.
- **Hit = transient (noise burst, bandpass) + body (osc tone) + tail (filtered ring)**; lowpass to stay pleasant. **±6% pitch / ±10% volume jitter** on repeats to kill machine-gun fatigue.
- Per-event cues: sword, magic (rising sweep), arrow, heal (consonant), death (descending poof), shop buy/sell (up/down arpeggio), victory/defeat stings, UI blips.
- **Duck the music** ~0.25 for ~0.4s when a big cue fires (`setTargetAtTime`, no clicks).
- Light procedural **pentatonic** ambient bed (busier in combat, calmer between rounds); look-ahead scheduler for timing. Master volume + mute persisted.

---

## 9. UI / UX layout

- **Center stage:** board + bench (largest area).
- **Economy cluster** (gold + level + XP bar) near the shop; animate gains/spends.
- **Shop** bottom strip, 5 slots + reroll + buy-XP; **glow owned/upgradeable** units so duplicates are obvious in the rushed buy window.
- **Trait/synergy panel** left rail: each active trait shows **icon + count/next threshold** (pips or bar), tier-coloured (bronze/silver/gold), inactive dimmed; highlight a trait while dragging a unit that would advance it.
- **Player HP** + **lives** + **wins** prominent corner; **planning timer** top-center with a soft final-5s cue.
- **Speed controls** (1×/2×/4×) + **skip**, sticky across rounds. Between-round screen is the calm breather showing last-fight breakdown.
- **Unit markers:** star pips + tier border/glow + size step; up to 3 item icons on the base.

---

## 10. Balance via simulation (the unfair advantage)

Because combat is a **pure deterministic function**, we brute-force balance offline — the same method the genre's research literature uses.

- `resolveCombat(boardA, boardB, seed) → {winner, survivors, durationTicks, damageLog}` — no DOM, no real time, seeded.
- **`winRate(A,B,N=2000)`** across seeds removes tie noise; assert the **monotonicity invariants** (§4).
- **Round-robin matrix** over archetype comps + random legal boards; flag comps **>55–60%** (over-tuned) or **<40–45%** (dead).
- **Per-unit value** = win-rate of boards with the unit vs matched boards without (marginal contribution); **per-trait value** = toggle a breakpoint. Outliers → small nerf/buff → re-sim (hill-climb; **light touch, no thrashing**).
- **Solo ladder tuning:** sim an optimally-played stage board vs each enemy board; target ~70–85% win for a skilled player, ~40–55% for a new player, ~25–40% full-run completion (explicit targets, tuned toward).
- **Seeded auto-pilot bot** (simple buy/level heuristic) runs hundreds of full runs headlessly → the **win-rate-by-stage curve IS the difficulty curve**, measured not guessed.

**Test harness (`node test/run.js`, no framework):** assert gold ≥ 0; **pool conservation** (copies in pools + on boards + in offers is constant); combat always terminates (`durationTicks < MAX_TICKS`); **determinism/replay byte-identical**; star-up correctness; same seed → identical result in Node and browser (proves headless sim == live game).

---

## 11. Milestone build plan (each milestone ends with a browser screenshot / headless test = verified)

- **M0 — Scaffold & art kit.** Repo + PWA shell + tokens; the SVG champion "rig" (shared viewBox humanoid template) + 4–5 sample units; static board + bench + shop laid out. *Verify: renders on desktop + phone width, screenshot.*
- **M1 — Drag & place.** Pointer-Events drag (bench→board, reposition, sell), tile snapping, touch + mouse, pointercancel handling. *Verify: place/move/sell units by touch in browser.*
- **M2 — Pure combat sim + tests.** `grid.js`, `rng.js`, `sim/combat.js` + `rules.js`: targeting, movement, attacks, mana, one ability, damage formulas, end/draw, timeline output. `test/run.js` with determinism + termination + monotonicity asserts. *Verify: `node test/run.js` green; log a sample timeline.*
- **M3 — Timeline renderer + Tier-1 juice.** `render/player.js` + `view.js`: spawn/move/lunge/hit-flash/damage-numbers/faint from the event list; speed + skip. *Verify: watch a fight play out, screenshot mid-combat.*
- **M4 — Economy & round loop.** Shop roll (seeded, tier odds), buy/sell, reroll, freeze, XP/level/board-size, interest + streak gold, star-up fusion, gold/HP/lives/wins HUD. *Verify: full planning→combat→result loop for several rounds.*
- **M5 — Traits, items, enemy ladder.** 12 traits with effects + synergy panel; 5 components/15 items + draft drops; authored enemy archetypes + bounded variation + pre-fight trait banner + post-fight "why". *Verify: play a real run; synergies visibly fire.*
- **M6 — Full unit roster + abilities + canvas FX.** All ~30 units with stats + abilities; projectiles/particles on the canvas overlay; trauma shake; death/victory payoff. *Verify: visual pass, screenshots of several comps.*
- **M7 — Audio + roguelike layer + onboarding.** Web Audio bus + all event cues + ambient bed + ducking; between-round 1-of-N draft + relics + run seed + act bosses; coach toasts + scripted first run; save/restore + speed-preference persistence. *Verify: full run start→win/lose with sound on phone.*
- **M8 — Balance pass, polish, ship.** Run `sim/autobalance.js`, nerf/buff outliers in small steps; tune the ladder curve via auto-pilot bot; ship-checklist; add to the **Bording Games hub**; deploy + verify live; `.nojekyll`. *Verify: live URL works on phone, screenshot; balance report.*

**Cut-lines if scope bites:** drop hex (use square — already chosen); ★★★ can come after ★★; items can ship after traits; ascension/cross-run unlocks are post-launch; start with ~20 units and grow to 30.

---

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Combat feels like an unreadable black box | Readability spec (§8) is first-class, not polish; post-fight "why" + replay from day one of M3 |
| Non-determinism creeps in (flaky replays/tests) | Determinism contract (§2) + determinism asserts in M2 test harness |
| Solo pool makes 3-starring trivial | Shrunk pool sizes (§4); validate with sim |
| Balance is unknowable by hand for 30 units | Headless sim + auto-pilot bot (§10) — the deliberate advantage |
| Touch drag fights page scroll on iOS | Pointer Events + `touch-action:none` on play surfaces only + pointercancel snap-back (§KB mobile) |
| 30 cohesive SVG units is a lot of art | Shared rig + palette; reskin 2–3 body archetypes; silhouette-first |
| GitHub Pages stuck on old version | `.nojekyll`, no external symlinks, verify live after deploy (logged gotcha) |

---

## 12b. v1 BUILD STATUS (live at bordingcode.github.io/warbound)

Built and verified (browser + headless tests):
- **Core:** pure deterministic combat sim (event timeline) + renderer; 8×8 grid, BFS movement, mana/abilities, crit/dodge/shield/block/revive/thorns/vamp, %-maxHP sudden-death. `node test/run.js` = 11 invariants green.
- **Run loop:** economy (TFT odds, pool-weighted shop, buy/sell, 3→2★→3★ fusion, XP/level=board size, interest, streaks), Pointer-Events drag, 5 lives/10 wins, authored 10-board ladder + endless escalation, save/load (+migration).
- **Depth:** 12 traits (dual origin+class), 5 components→15 items (draft + drag-equip + combine), 12 relics (act-boundary drafts), enemy scout w/ trait readout.
- **Feel:** procedural Web Audio (pentatonic, mute), trauma shake, confetti, hit-flash, floating numbers, mana-cast telegraph, how-to-play intro.
- **Tooling:** `js/sim/autobalance.js` (pacing/unit/ladder) + `test/smoke-run.js` (full-run bot).

**Balance findings (2026-05-30):** median fight ~12s; random bot wins 1–3 early rounds then loses (skill matters); a focused 6-unit 2★ comp stomps R5–9 (100%) but loses the R10 Dragonsworn boss (5%); a full 8-unit board w/ 3★ carry + items + 3 relics beats the boss (100%). → winnable with good play, boss is a fair check. Mid-ladder (R5–9) could escalate steeper in a future pass.

**Not yet built:** Spatula/emblems, act-specific bosses beyond R10, ascension tiers, cross-run unlocks, per-comp round-robin balance gradient (autobalance per-unit read is binary — combat is near-deterministic). Mobile drag untested on a real device.

## 13. Decisions — RESOLVED

1. **Name:** *Warbound*.
2. **Scope:** full depth, **★★★ built from the start** (no cut-line on star levels).
3. **Tone & balance:** Dota-leaning. Match Dota Underlords' balance philosophy (alliance thresholds 3/6/9 on the big classes, its economy feel, "pick 1 of 3" item drops) and a gritty heroic-dark-fantasy tone with a varied Dota-style roster.

*Build proceeds straight through, committing + pushing after each milestone, verifying live in a browser with screenshots, per the working agreement.*
