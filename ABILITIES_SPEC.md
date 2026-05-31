# Warbound — Unique Ability Spec (per-champion signature spells + 3★ ultimates)

> Design spec for replacing the 10 shared ability templates with a UNIQUE signature ability per
> champion, each gaining a qualitative **3★ ultimate** upgrade (extra effect, not just bigger
> numbers). Drafted by the game-designer pass. Status: **BUILT (2026-05-31)** — verb engine in
> `sim/combat.js`, all 29 abilities in `data/units.js`, VFX in `render/player.js`, headless-tested
> in `test/synergy-ability.test.js` (38 assertions). Phases A–C done. Phase D (fine origin
> rebalance via the archetype-matrix tooling) remains — dragons already re-bumped; broader pass TBD.

## Core design
Keep `cast(u, now)` as the base engine; add a thin layer of composable **verbs** that abilities
list in arrays: `{ ...base, verbs:[...], ult:{ verbs:[...] } }`. At 3★ the engine runs
`verbs.concat(ult.verbs)`. Benefits: no two abilities share code but all share primitives; the
headless autobalancer keeps working (power stays in numbers); a new verb instantly reuses across
many champions; the 3★ spike is a qualitative *force-multiplier* (e.g. 3★ Lich also shreds MR,
opening the enemy team for your other mages).

**Hard rule:** every CC/debuff verb is capacity-bounded (diminishing returns, per-target cooldowns,
hard caps) so a stacked board can't perma-lock. Fights must still resolve ~11s.

## 1. Engine verbs (new, beyond today's damage/heal/shield/summon/stun)
1. `slow(target, pct, dur)` — ×(1−pct) attack speed until expiry; one active, strongest wins.
2. `shred(target, armor|mr, amount, dur)` — reduce stat (floor 0); refresh, no stack.
3. `manaBurn(target, amount[, lockDur])` — mana = max(0, mana−amount); optional manaLock ≤1.0s.
4. `knockup(target, dur)` — stun + airborne VFX tag (interrupts cast windup if added).
5. `knockback / pull (target, cells)` — reposition along grid via stepToward, respects occupied.
6. `chain(origin, count, falloff, type, dmg)` — bounce to nearest not-yet-hit, ×falloff each.
7. `lineHit / coneHit (caster, len, type, dmg)` — straight line / widening cone of cells.
8. `meteors(team, n, type, dmg, radius)` — n seeded-random strikes, small AoE each.
9. `buffAS(target|allies, amount, dur)` — flat asStacks to one/all allies; bounded by effAS cap.
10. `rage(self, perCast|onHit, cap)` — self AS/AD ramp, hard-capped (shares effAS ceiling).
11. `lifesteal(self, pct, dur)` / `drain(target, pct→self heal)` — heal from damage dealt.
12. `cleanse(allies)` — clear stun/slow/shred/manaLock; optional short CC-immunity.
13. `redirect(ally, pct, dur)` — reroute pct of ally's incoming damage to caster (knight).
14. `healCut(target, pct, dur)` — reduce target's received healing.
15. `taunt(enemies, radius, dur)` — force enemies to target caster (nearestEnemy honours it).
16. `execBonus(target, threshold, mult)` — damage ×mult if target HP% < threshold.

## 2. Ability table — all 29
Format: defId — Name — mana — BASE — **3★ ultimate**.

### Human
- knight_captain — Rallying Bash — 35 — 2.0×AD + stun 1.0s, self +30 shield — **3★:** buffAS adjacent allies +0.25/3s.
- court_mage — Arcane Nuke — 38 — cluster magic 220, r1 — **3★:** primary also manaBurn 30.
- crossbowman — Volley — 35 — 4 targets 2.2×AD×0.7 — **3★:** each hit slow 25%/2s.
- royal_blade — Regicide — 42 — execBonus 3.0×AD×1.3 on lowest HP (<25%) — **3★:** on kill, refund full mana + re-dive next target (max 1 re-cast/fight).
- field_medic — Mend — 35 — heal lowest ally 200 — **3★:** also cleanse + 1.5s CC-immunity.

### Undead
- bone_guard — Grave Bash — 35 — 1.8×AD + stun 1.0s — **3★:** gains lifesteal 30%/4s on autos.
- lich — Frost Nova — 42 — cluster magic 320 r1 + slow 30%/2s — **3★:** also shred MR 30/4s to all hit.
- skeleton_archer — Bone Volley — 35 — 4 targets 2.0×AD×0.7 — **3★:** kills raise a 1-cost Risen (max 2/fight).
- wraith — Soul Reap — 46 — execBonus 3.6×AD×1.3 + drain 40% — **3★:** on kill, reset attack CD + +0.4 AS/3s.
- necromancer — Raise Dead — 50 — summon 2 Risen (950/115 ×summonPower) — **3★:** + a greater wight (2× stats) + corpses add +1 Risen each (cap +2).

### Elf
- thornguard — Bramble Bash — 38 — 2.1×AD + stun 1.0s, thorns +15%/3s — **3★:** stun → knockup 1.25s + taunt adjacent 2s.
- moon_priestess — Lunar Bolt — 46 — single-target magic 560 — **3★:** chains to 2 more (×0.6), <30% HP gets execBonus ×1.5.
- wood_ranger — Piercing Shot — 35 — lineHit row 2.1×AD — **3★:** also shred armor 25/4s to all pierced.
- shadow_dancer — Shadow Step — 42 — blink + execBonus 3.2×AD×1.3 — **3★:** after strike, dodge +40%/3s + self buffAS +0.4.
- grove_healer — Verdant Mend — 38 — heal lowest 260 — **3★:** splash 50% to adjacent allies + regen 12/s/3s.
- spirit_caller — Call Spirits — 42 — summon 2 Risen — **3★:** spirits get dodge 30% + a slow-aura (adjacent enemies −15%).

### Demon
- hellguard — Fel Cleave — 38 — cluster physical 1.9×AD r1 — **3★:** also manaBurn 25 + healCut 40%/3s to all hit.
- warlock — Doom Bolt — 46 — cluster magic 400 r1 — **3★:** 3s burning DoT (60/s, non-stacking) + manaBurn 30 primary.
- fel_archer — Searing Volley — 38 — 4 targets 2.3×AD×0.7 — **3★:** each hit manaBurn 12 (team cast-denial).
- imp_assassin — Backstab — 35 — execBonus 2.6×AD×1.3 — **3★:** on kill, manaBurn 40 + slow 30% to 2 nearest.
- pit_summoner — Open the Pit — 50 — summon 2 Risen — **3★:** + meteors (3×120 magic r1) on random enemies.

### Beast
- beast_hunter — Hunter's Volley — 38 — 4 targets 2.4×AD×0.7 — **3★:** marks lowest-HP hit; autos vs mark execBonus ×1.4.
- bramble_brute — Thorn Cleave — 46 — cluster physical 2.4×AD r1 + knockback 1 — **3★:** rage +0.06 AS/auto (cap +0.9) + thorns +25%.
- pack_stalker — Pounce — 42 — blink + execBonus 3.3×AD×1.3 — **3★:** hits all adjacent to target (×0.6) + buffAS +0.3 on kill.
- druid_healer — Wild Aegis — 42 — shield lowest 300 — **3★:** shields 3 lowest at 70% + shielded allies +0.2 AS.
- beastmaster — Summon Pack — 46 — summon 2 Risen — **3★:** pack enraged (rage) + lifesteal aura 15% to nearby beasts.

### Dragon
- dragon_knight — Dragon Breath — 50 — cone/cluster magic 225 r2 — **3★:** coneHit whole row + shred MR 30 + slow 25%/3s.
- dragon_sage — Cataclysm — 50 — big cluster magic 310 r2 — **3★:** + meteors (4×100 r1) + manaBurn 25 densest spot.
- wyrm_archer — Storm of Arrows — 50 — 4 targets 2.8×AD×0.7 — **3★:** second volley at next 4 + team-wide enemy slow 20%.

## 3. Balance
- Power by cost: 1c = single clean mechanic; 3c = the carry payoff tier (you 3★ these); 5c = board-warping, bound hardest.
- Carries: execute assassins, burst mages, volley snowballers. Utility: CC knights, healers, mana-burn demons, slow rangers — they ENABLE carries (shred→burst, stun→execute).
- Bounds: per-target `ccImmuneUntil = now + 1.5× CC dur` (no perma-lock); rage shares the existing effAS cap; DoT non-stacking (refresh, strongest tick); lifesteal duration-limited; healCut is the sustain counter; mana-burn never negative, lock ≤1.0s; summons hard-capped per fight; execBonus only below threshold (no instakill).
- Tune only `ap`/`adRatio`/durations via `node js/sim/autobalance.js`; leave verb structure fixed.

## 4. VFX (10 new reusable shapes beyond ringBurst/shards/pillar/cone/sweep/chop/arrows/slam/rune/heal/shield)
`motes` (buffs), `manaCrack` (manaBurn), `slowField` (slow), `beam` (line), `cleansePulse`,
`shredCrack` (shred), `ember` (DoT), `meteor`, `tauntPulse`, `arc` (chain). Reduced-motion:
meteors/arc/knockback fall back to a static flash.

## 5. Build order
- **A — engine:** add the `verbs[]/ult.verbs[]` shape + dispatcher (run base; append ult when star===3); add state fields + low-risk numeric verbs (slow/shred/manaBurn/buffAS/rage/lifesteal/healCut/execBonus); then the riskier positional/multi-target verbs (knockback/pull/taunt, chain/line/cone/meteors) — unit-test these headless in isolation first (deterministic, id-sorted).
- **B — author + test:** fill the 29 rows as DATA; headless-test each at 1★ and 3★ vs a dummy (fight <25s, CC ≤ immunity window). Build the caps for the 4 riskiest first: royal_blade (re-cast cap), necromancer (board cap), thornguard (knockup+taunt positioning), wyrm_archer 3★ (double-volley overlap).
- **C — VFX:** add the 10 shapes (driven by cast/damage event tags); cosmetic, ship gameplay first.
- **D — rebalance:** autobalance + verify ~11s median, no non-5c 3★ ult exceeds ~35% of an enemy board's HP per cast.
