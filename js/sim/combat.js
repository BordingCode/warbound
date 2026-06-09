// Pure deterministic auto-battle simulation. simulate(playerBoard, enemyBoard, seed)
// runs the WHOLE fight to completion and returns { events, result, finalState }.
// No DOM, no wall-clock, no Math.random — the renderer just plays back `events`.
// This purity is what gives us replays, speed controls, headless tests AND balancing.
import { RNG } from '../rng.js';
import { UNITS_BY_ID, statsForStar, STAR_MULT } from '../data/units.js';
import { activeTraits } from '../data/traits.js';
import { idx, inBounds, neighbours, stepToward, COLS, ROWS } from '../grid.js';
import { mitigate, manaFromDamage, nearestEnemy, enemiesNear, lowestHP, inRange } from './rules.js';
import { aggregateMods, traitGrantsFor } from '../data/items.js';

const DT = 1 / 30;
const DOT_TICK = 0.5;            // burning/DoT damage lands in discrete 0.5s pulses
const MAX_TICKS = 30 * 45;       // 45s hard cap
const SUDDEN_DEATH_T = 25;       // after 25s, ramping true damage breaks stalemates
export const MOVE_INTERVAL = 0.42;   // seconds to walk ONE cell (~2.4 cells/s — a deliberate TFT/
                                 // Underlords-style march, slower than the old frantic 0.28s pace).
                                 // The renderer reads this so the glide stays in sync. NOTE: changing
                                 // this shifts melee-vs-ranged balance (melee engage later) — re-run
                                 // node js/sim/autobalance.js after any change.

const COMBAT_KEYS = ['ad', 'as', 'hp', 'ap', 'armor', 'mr', 'shield', 'vamp', 'thorns', 'critChance', 'critDmg', 'revive'];

function makeUnit(entry, team, id, aug = null) {
  const def = UNITS_BY_ID[entry.defId];
  const s = statsForStar(def, entry.star || 1);
  const im = aggregateMods(entry.items || []);
  // fold augment combat mods into the item-mod object (additive): flat (whole-team) + any
  // conditional mods (by synergy/role/row) that match this unit.
  if (aug) {
    const flat = aug.flat || {};
    for (const k of COMBAT_KEYS) if (flat[k]) im[k] = (im[k] || 0) + flat[k];
    if (aug.cond && aug.cond.length) {
      const back = team === 'player' ? entry.row >= 6 : entry.row <= 1;
      for (const c of aug.cond) {
        const m = c.match || {};
        if (m.origin && m.origin !== def.origin) continue;
        if (m.klass && m.klass !== def.klass) continue;
        if (m.row && (m.row === 'back') !== back) continue;
        for (const [k, v] of Object.entries(c.mods)) im[k] = (im[k] || 0) + v;
      }
    }
  }
  const hp = Math.round(s.hp * (1 + im.hp));
  return {
    id, team, defId: def.defId, name: def.name, star: entry.star || 1,
    origin: def.origin, klass: def.klass,
    col: entry.col, row: entry.row,
    hp, maxHp: hp, ad: Math.round(s.ad * (1 + im.ad)), as: s.as * (1 + im.as),
    armor: s.armor + im.armor, mr: s.mr + im.mr, range: s.range,
    mana: s.startMana, maxMana: s.maxMana, manaPer: s.manaPer, manaLockUntil: -1,
    attackCd: 1 / (s.as * (1 + im.as)), ability: def.ability, apBonus: im.ap,
    alive: true, shield: im.shield, stunUntil: -1,
    // trait-derived (filled by applyTraits) + item-derived
    block: 0, dmgRed: 0, ccResist: 0, critChance: im.critChance, critDmg: 0.4 + im.critDmg, dodge: 0, healAmp: 0, regen: im.regen,
    revivePct: im.revive, revived: false, burnOnHit: 0, manaBurnOnHit: 0, shredOnHit: 0,
    hpDmg: 0, staggerPct: 0, staggerDur: 0,
    ferocity: 0, asStacks: 0, manaRegen: 0, rangerAS: 0, summonPower: 0, moveCd: 0,
    vamp: im.vamp, thorns: im.thorns,
    items: entry.items || [], isSummon: !!entry.isSummon,
    // ── ability-verb effect state (all default off; see sim/combat.js verb engine) ──
    slowPct: 0, slowUntil: -1,
    shredArmorAmt: 0, shredArmorUntil: -1, shredMrAmt: 0, shredMrUntil: -1,
    healCutPct: 0, healCutUntil: -1,
    dotDps: 0, dotUntil: -1, dotSrcId: -1, dotNextAt: -1,
    asBuffAmt: 0, asBuffUntil: -1, dodgeBuffAmt: 0, dodgeBuffUntil: -1,
    thornsBuffAmt: 0, thornsBuffUntil: -1, regenAmt: 0, regenUntil: -1,
    lifestealPct: 0, lifestealUntil: -1,
    tauntTargetId: -1, tauntUntil: -1, ccImmuneUntil: -1, ccSetAt: -2,
    markMult: 1, markUntil: -1,
    ragePerAuto: 0, rageCap: 0, onKillVerbs: null, onKillN: 0,
    recastBudget: 1, raiseBudget: 2, slowAura: 0, lifestealAura: 0,
    // ── PASSIVE state (always-on signatures; read at sim hooks via runPassive) ──
    passive: def.ability && def.ability.passive ? def.ability.passive : null,
    hitCount: 0,          // every-Nth-attack counter (skeleton_archer bolt, bone_guard shield)
    lowHpFired: false,    // one-shot edge-trigger when hp% first crosses a threshold (wraith phase)
    lastMovedTick: -999,  // tick index of last move — "while standing still" passives (wood_ranger)
    markLockId: -1, focusStacks: 0,   // wood_ranger focus-fire lock + ramp
    guardPct: 0,          // dragon_knight: soak this fraction of adjacent allies' incoming damage
    explodeDmg: 0,        // pit_summoner: a summon detonates for this much magic when it dies
  };
}

// Apply a team's active traits to its units (whole-team auras + tagged-only effects).
// traitBonus (from Augment crowns) bumps synergy counts so a breakpoint can light up.
function applyTraits(units, board, traitBonus = {}) {
  // attach per-unit Emblem trait-grants (warpath-only items) so the holder adds +1 to that
  // trait's count; gid keeps two same-emblem holders counted as two distinct members.
  const defs = board.map((e, i) => {
    const d = UNITS_BY_ID[e.defId];
    const grants = traitGrantsFor(e.items);
    return grants.length ? { ...d, grants, gid: e.uid != null ? e.uid : 'b' + i } : d;
  });
  const active = activeTraits(defs, traitBonus);
  const get = (t) => (active[t] && active[t].bonus) || null;
  for (const u of units) {
    // a unit "has" a trait if it's its natural origin/klass OR an Emblem granted it (full TFT
    // emblems: the wearer truly becomes that class/origin and gets the class-specific buff too).
    const granted = u.items && u.items.length ? traitGrantsFor(u.items) : [];
    const has = (t) => u.klass === t || u.origin === t || granted.includes(t);
    // whole-team
    const human = get('human'); if (human) u.manaRegen = Math.max(u.manaRegen, human.manaRegen);
    const knight = get('knight'); if (knight && knight.dmgRed && has('knight')) u.dmgRed = Math.max(u.dmgRed, knight.dmgRed);   // Knights: the WALL shrugs off a % of every hit (knights only, not the squishies behind them). Was a team-wide flat per-hit block — team-wide mitigation on an all-tank comp is un-tunably oppressive (see DESIGN).
    const healer = get('healer'); if (healer) { u.healAmp = Math.max(u.healAmp, healer.healAmp); u.regen = Math.max(u.regen, healer.regen); }
    const elf = get('elf'); if (elf) { u.dodge = Math.max(u.dodge, elf.dodge); u.shield += elf.shield; if (elf.as) u.asStacks += elf.as; }   // elven precision: flat attack speed at the top breakpoint (offensive kicker)
    const dragon = get('dragon'); if (dragon) { u.mr += dragon.mr; if (dragon.adPct) u.ad = Math.round(u.ad * (1 + dragon.adPct)); if (dragon.ap) u.apBonus += dragon.ap; }   // dragons hit as hard as they're tough
    const beast = get('beast'); if (beast && active.beast.tier >= 6) u.ferocity = Math.max(u.ferocity, beast.ferocity);
    // class/origin-tagged — now honoured for Emblem-granted traits too
    if (has('mage')) { const m = get('mage'); if (m) u.apBonus += m.ap; }
    if (has('assassin')) { const a = get('assassin'); if (a) { u.critChance += a.critChance; u.critDmg += a.critDmg; if (a.shred) u.shredOnHit = Math.max(u.shredOnHit, a.shred); } }
    if (has('ranger')) { const r = get('ranger'); if (r) u.rangerAS = r.rangerAS; }
    if (has('beast')) { const b = get('beast'); if (b) { u.ferocity = Math.max(u.ferocity, b.ferocity); if (b.armor) u.armor += b.armor; } }   // beasts ramp AS AND wear thicker hide (survive to ramp)
    // Orc Bloodlust: ramping attack speed (ferocity) AND lifesteal (vamp) for the whole warband —
    // reuses the same engine hooks as Beast ferocity + Undead vamp, so it composes cleanly.
    if (has('orc')) { const o = get('orc'); if (o) { if (o.ferocity) u.ferocity = Math.max(u.ferocity, o.ferocity); if (o.vamp) u.vamp += o.vamp; } }
    if (has('undead')) { const ud = get('undead'); if (ud) { u.revivePct = Math.max(u.revivePct, ud.revivePct); if (ud.vamp) u.vamp += ud.vamp; } }   // undead leech: sustain kicker so the rainbow board has an offensive edge
    if (has('demon')) { const d = get('demon'); if (d) { u.burnOnHit = d.burn; u.manaBurnOnHit = d.manaBurn; } }
    if (has('summoner')) { const s = get('summoner'); if (s) u.summonPower = s.summonPower; }
    // Bard: team OFFENCE aura — flat attack speed (via asStacks, folded through the single effAS
    // cap) + ability power to EVERY ally. The offensive twin of the Healer's defensive aura.
    if (has('bard')) { const bd = get('bard'); if (bd) { if (bd.as) u.asStacks += bd.as; if (bd.ap) u.apBonus += bd.ap; } }
    // Dwarf: stubborn mountain-folk — heavy armour/MR + TENACITY (ccResist shrinks incoming
    // stun/slow/taunt/mana-lock duration). The rock-paper-scissors answer to CC-heavy boards.
    const dwarf = get('dwarf'); if (dwarf) { u.armor += dwarf.armor || 0; u.mr += dwarf.mr || 0; if (dwarf.ccResist) u.ccResist = Math.max(u.ccResist, dwarf.ccResist); }
    // Giant: huge HP (team) → which also fuels each unit's hpDmg smash; plus a stagger-slow on hit.
    // The CC SOURCE that Dwarf's tenacity answers — completing the rock-paper-scissors.
    const giant = get('giant'); if (giant) { if (giant.hpPct) { u.maxHp = Math.round(u.maxHp * (1 + giant.hpPct)); u.hp = u.maxHp; } if (giant.hpDmg) u.hpDmg = Math.max(u.hpDmg, giant.hpDmg); if (giant.staggerPct) { u.staggerPct = Math.max(u.staggerPct, giant.staggerPct); u.staggerDur = Math.max(u.staggerDur, giant.staggerDur); } }
  }
}

export function simulate(playerBoard, enemyBoard, seed = 1, opts = {}) {
  const rng = new RNG(seed >>> 0);
  const events = [];
  const ev = (t, type, data) => events.push({ t: Math.round(t * 1000), type, ...data });
  // augment bundle per team; accept either the rich {flat,cond,traitBonus} form or a bare
  // flat-mods object (back-compat with older callers/tests passing opts.teamMods).
  const norm = (a) => (a ? (a.flat || a.cond || a.traitBonus ? a : { flat: a }) : null);
  const augP = norm((opts.aug && opts.aug.player) || (opts.teamMods && opts.teamMods.player));
  const augE = norm((opts.aug && opts.aug.enemy) || (opts.teamMods && opts.teamMods.enemy));

  // build units, stable ids: player 0..n, enemy continuing
  let nextId = 0;
  const units = [];
  for (const e of playerBoard) units.push(makeUnit(e, 'player', nextId++, augP));
  for (const e of enemyBoard) units.push(makeUnit(e, 'enemy', nextId++, augE));
  applyTraits(units.filter((u) => u.team === 'player'), playerBoard, augP && augP.traitBonus);
  applyTraits(units.filter((u) => u.team === 'enemy'), enemyBoard, augE && augE.traitBonus);
  for (const u of units) ev(0, 'spawn', { id: u.id, team: u.team, defId: u.defId, star: u.star, col: u.col, row: u.row, hp: u.hp, maxHp: u.maxHp, shield: u.shield });

  const occupied = new Set(units.map((u) => idx(u.col, u.row)));
  const byId = (a, b) => a.id - b.id;

  // assassin dive: blink adjacent to furthest enemy
  for (const u of units.filter((x) => x.klass === 'assassin').sort(byId)) {
    let far = null, fd = -1;
    for (const t of units) if (t.alive && t.team !== u.team) { const d = Math.abs(t.row - u.row) + Math.abs(t.col - u.col); if (d > fd) { far = t; fd = d; } }
    if (!far) continue;
    for (const n of neighbours(far.col, far.row)) {
      const ni = idx(n.col, n.row);
      if (!occupied.has(ni)) { occupied.delete(idx(u.col, u.row)); u.col = n.col; u.row = n.row; occupied.add(ni); ev(0.05, 'blink', { id: u.id, col: u.col, row: u.row }); break; }
    }
  }

  function alive(team) { return units.some((u) => u.alive && u.team === team); }
  // Effective stats fold in the timed ability-verb buffs/debuffs. All deterministic.
  function effAS(u, now = 0) {
    let a = u.as + u.asStacks + (now < u.asBuffUntil ? u.asBuffAmt : 0);
    if (now < u.slowUntil) a *= (1 - u.slowPct);
    return Math.max(0.1, Math.min(2.5, a));
  }
  function effResist(u, type, now) {
    if (type === 'magic') return Math.max(0, u.mr - (now < u.shredMrUntil ? u.shredMrAmt : 0));
    return Math.max(0, u.armor - (now < u.shredArmorUntil ? u.shredArmorAmt : 0));
  }
  function effDodge(u, now) { return u.dodge + (now < u.dodgeBuffUntil ? u.dodgeBuffAmt : 0); }
  function effThorns(u, now) { return u.thorns + (now < u.thornsBuffUntil ? u.thornsBuffAmt : 0); }
  // Dwarf tenacity: scale an incoming CC's DURATION by the target's ccResist (stun/knockup/
  // taunt/slow/mana-lock). The rock-paper-scissors answer to CC-heavy boards. Positional
  // knockback (cells) is unaffected — dwarves still get shoved, they just shrug off the lock.
  function ccDur(t, dur) { return dur * (1 - (t.ccResist || 0)); }
  // CC gate: a unit is immune while ccImmuneUntil is in the future; applying CC re-arms it
  // for 1.5× the CC's duration (spec hard-rule: no perma-lock). Returns true if CC landed.
  function applyCC(t, dur, now) {
    // Block chaining across casts, but allow multiple CC verbs WITHIN one cast (same `now`,
    // e.g. thornguard's stun→knockup combo) so an ability's own pieces don't cancel each other.
    if (now < t.ccImmuneUntil && t.ccSetAt !== now) return false;
    t.ccImmuneUntil = Math.max(t.ccImmuneUntil, now + dur * 1.5);
    t.ccSetAt = now;
    return true;
  }
  // Who a unit attacks/chases: a live taunt forces the caster's chosen target; else nearest.
  function targetOf(u, now) {
    if (now < u.tauntUntil && u.tauntTargetId >= 0) {
      const tt = units.find((x) => x.id === u.tauntTargetId);
      if (tt && tt.alive && tt.team !== u.team) return tt;
    }
    return nearestEnemy(u, units);
  }
  const byIdU = (a, b) => a.id - b.id;

  function gainMana(u, amt, now) {
    if (now < u.manaLockUntil || !u.alive) return;
    if (u.ability && u.ability.noCast) { u.mana = 0; return; }   // pure-passive units never cast
    u.mana += amt;
    if (u.mana >= u.maxMana) { u.mana -= u.maxMana; u.manaLockUntil = now + 1.0; cast(u, now); }
  }

  function applyDamage(target, raw, type, source, now, sd) {
    if (!target.alive) return 0;
    if (type === 'physical' && source && rng.chance(effDodge(target, now))) { ev(now, 'dodge', { id: target.id }); runPassive(target, 'dodge', now, source); return 0; }
    // mitigate by EFFECTIVE resist (armor/mr shred folded in); true/heal ignore resist.
    let post = (type === 'true' || type === 'heal') ? raw : raw * (100 / (100 + effResist(target, type, now)));
    if (type !== 'true') post = Math.max(0, post - target.block);
    // Generic % incoming-damage reduction hook (dormant — no source sets dmgRed currently).
    // Distinct from Knight's FLAT per-hit block above (% vs flat). Non-true, non-heal only.
    if (type !== 'true' && type !== 'heal' && target.dmgRed) post = post * (1 - target.dmgRed);
    // shield soak
    if (target.shield > 0) { const s = Math.min(target.shield, post); target.shield -= s; post -= s; }
    post = Math.round(post);
    // dragon_knight guard: redirect a fraction of this hit to an adjacent guardian (as true dmg,
    // so it can't itself be redirected/dodged → no loop). Guardian chosen deterministically (lowest id).
    if (post > 0 && type !== 'true') {
      let guardian = null;
      for (const g of units) if (g.alive && g.team === target.team && g !== target && g.guardPct > 0 && dist2(g, target) <= 1) { if (!guardian || g.id < guardian.id) guardian = g; }
      if (guardian) { const r = Math.round(post * guardian.guardPct); if (r > 0) { post -= r; guardian.hp -= r; ev(now, 'damage', { id: guardian.id, src: source ? source.id : -1, amount: r, hp: Math.max(0, guardian.hp), dmgType: 'true' }); if (guardian.hp <= 0) die(guardian, now); } }
    }
    target.hp -= post;
    gainMana(target, manaFromDamage(raw, post), now);
    const dmgEv = { id: target.id, src: source ? source.id : -1, amount: post, hp: Math.max(0, target.hp), dmgType: type };
    if (sd) dmgEv.sd = 1;   // sudden-death drain: the renderer draws this cheaply (no number/spark spam)
    ev(now, 'damage', dmgEv);
    // thorns: reflect a fraction of physical damage back as true damage (no loop)
    const refThorns = effThorns(target, now);
    if (type === 'physical' && source && refThorns > 0 && source.alive) {
      const refl = Math.round(raw * refThorns);
      source.hp -= refl;
      ev(now, 'damage', { id: source.id, src: target.id, amount: refl, hp: Math.max(0, source.hp), dmgType: 'true' });
      if (source.hp <= 0) die(source, now);
    }
    if (target.hp <= 0) { die(target, now); return post; }
    if (post > 0 && source) runPassive(target, 'attacked', now, source);   // bone_guard hardens as it's struck
    return post;
  }

  function heal(target, amt, now) {
    if (!target.alive) return;
    let cut = now < target.healCutUntil ? target.healCutPct : 0;
    // Grievous wounds in sudden death: healing withers as overtime ramps, so a sustain stack
    // (tanky frontline + healers, lifesteal, regen) can't out-heal the drain and stalemate to a
    // draw. Guarantees every fight terminates regardless of sustain.
    if (now > SUDDEN_DEATH_T) cut = Math.max(cut, Math.min(0.95, 0.3 + 0.12 * (now - SUDDEN_DEATH_T)));
    amt = Math.round(amt * (1 + (target.healAmp || 0)) * (1 - cut));
    if (amt <= 0) return;
    target.hp = Math.min(target.maxHp, target.hp + amt);
    ev(now, 'heal', { id: target.id, amount: amt, hp: target.hp });
  }

  function die(u, now) {
    if (u.revivePct > 0 && !u.revived) {
      u.revived = true; u.hp = Math.round(u.maxHp * u.revivePct); u.mana = 0;
      ev(now, 'revive', { id: u.id, hp: u.hp });
      return;
    }
    // pit_summoner volatile spawn: QUEUE the detonation (deferred + iterative, so a chain of
    // exploding summons can't recurse die→applyDamage→die into a stack overflow).
    if (u.explodeDmg > 0) explosionQueue.push({ col: u.col, row: u.row, dmg: u.explodeDmg, team: u.team, now });
    u.alive = false; occupied.delete(idx(u.col, u.row));
    ev(now, 'faint', { id: u.id });
    // allyDeath reactions (field_medic triage, necromancer corpse-raise). Gated to REAL unit
    // deaths — a dying summon must NOT trigger raises, or necromancer loops forever.
    if (!u.isSummon) for (const a of units.filter((x) => x.alive && x.team === u.team && x.id !== u.id).sort(byIdU)) runPassive(a, 'allyDeath', now, u);
    drainExplosions();
  }
  // Drain queued detonations in a flat loop (reentrancy-guarded): nested deaths just enqueue more.
  const explosionQueue = [];
  let draining = false;
  function drainExplosions() {
    if (draining) return;
    draining = true;
    while (explosionQueue.length) {
      const e = explosionQueue.shift();
      ev(e.now, 'meteor', { col: e.col, row: e.row });
      for (const t of units.filter((x) => x.alive && x.team !== e.team && Math.abs(x.col - e.col) + Math.abs(x.row - e.row) <= 1).sort(byIdU)) applyDamage(t, e.dmg, 'magic', null, e.now);
    }
    draining = false;
  }

  const pendingSummons = [];

  // ── Verb engine ───────────────────────────────────────────────────────────
  // Each ability lists composable `verbs`; at 3★ the engine appends `ult.verbs`.
  // A verb resolves a target SET via its `target` selector, then applies its `op`.
  // Power lives in the headline ap/adRatio (so the autobalancer keeps tuning numbers);
  // secondary verb magnitudes (slow %, shred, dot dps) are bounded literals.

  // Resolve a verb's target set. `primary` is the caster's current foe (taunt-aware).
  function resolveTargets(u, vb, primary, now) {
    const sel = vb.target || 'current';
    const enemies = () => units.filter((t) => t.alive && t.team !== u.team).sort(byIdU);
    const allies = () => units.filter((t) => t.alive && t.team === u.team).sort(byIdU);
    switch (sel) {
      case 'current': return primary ? [primary] : [];
      case 'cluster': return primary ? enemiesNear(primary, u.team, units, vb.radius || 1).sort(byIdU) : [];
      case 'clusterAtPrimary': { const c = lowestHP(units, u.team, true) || primary; return c ? enemiesNear(c, u.team, units, vb.radius || 1).sort(byIdU) : []; }
      case 'lowestEnemyHP': { const t = lowestHP(units, u.team, true); return t ? [t] : []; }
      case 'mostEnemies': return enemies().slice(vb.offset || 0, (vb.offset || 0) + (vb.count || 4));
      case 'nearestN': { const list = enemies(); list.sort((a, b) => (dist2(u, a) - dist2(u, b)) || (a.id - b.id)); return list.slice(0, vb.count || onKillN(u, vb)); }
      case 'mostMana': { const list = enemies(); list.sort((a, b) => (b.mana - a.mana) || (a.id - b.id)); return list.slice(0, vb.count || 4); }   // fel_archer: hunt enemy casters
      case 'highestValueEnemy': { const list = enemies(); if (!list.length) return []; let best = list[0]; for (const t of list) { const val = (UNITS_BY_ID[t.defId]?.cost || 1) * t.star; const bv = (UNITS_BY_ID[best.defId]?.cost || 1) * best.star; if (val > bv || (val === bv && t.id < best.id)) best = t; } return [best]; }   // beast_hunter: the enemy carry
      case 'allEnemies': return enemies();
      case 'line': return primary ? enemies().filter((t) => t.col === primary.col) : [];   // pierce forward through the target's column (front→back)
      case 'self': return [u];
      case 'lowestAllyHP': { const t = lowestHP(units, u.team, false); return t ? [t] : []; }
      case 'allies': return allies();
      case 'shielded': return allies().filter((t) => t.shield > 0);
      case 'adjacentAllies': return allies().filter((t) => t !== u && Math.abs(t.col - u.col) + Math.abs(t.row - u.row) <= (vb.radius || 1));
      case 'lowestNAllies': return allies().sort((a, b) => (a.hp - b.hp) || (a.id - b.id)).slice(0, vb.n || 3);
      default: return primary ? [primary] : [];
    }
  }
  function dist2(a, b) { return Math.abs(a.col - b.col) + Math.abs(a.row - b.row); }
  function onKillN(u, vb) { return vb.n || u.onKillN || 2; }

  // Apply one verb. `killed` accumulates units this cast killed (for onKill triggers).
  function applyVerb(u, vb, now, primary, ap, killed) {
    const targets = resolveTargets(u, vb, primary, now);
    const dmgPhys = (t, mult) => { const before = t.alive; applyDamage(t, u.ad * (vb.adRatio || u.ability.adRatio || 1.5) * (mult ?? vb.mult ?? 1), 'physical', u, now); if (before && !t.alive) killed.push(t); };
    switch (vb.op) {
      case 'magic': for (const t of targets) { const before = t.alive; applyDamage(t, (vb.ap || u.ability.ap || 0) * (STAR_MULT[u.star] || 1) + u.apBonus, 'magic', u, now); if (before && !t.alive) killed.push(t); } break;
      case 'phys': for (const t of targets) dmgPhys(t); break;
      case 'exec': for (const t of targets) { const lethalMult = (t.hp / t.maxHp < (vb.threshold || 0.25)) ? (vb.mult || 1.3) : 1; const before = t.alive; const dealt = applyDamage(t, u.ad * (vb.adRatio || u.ability.adRatio || 1.5) * lethalMult, 'physical', u, now); if (vb.drain) heal(u, dealt * vb.drain, now); if (before && !t.alive) killed.push(t); } break;
      case 'line': for (const t of targets) dmgPhys(t, vb.adRatio ? undefined : 1); break;
      case 'chain': chain(u, primary, vb, now, killed); break;
      case 'meteors': meteors(u, vb, now, killed); break;
      case 'heal': for (const t of targets) heal(t, (vb.ap || u.ability.ap || 0) * (STAR_MULT[u.star] || 1) + u.apBonus, now); break;
      case 'shield': for (const t of targets) { const amt = Math.round(vb.amount != null ? vb.amount : (vb.ap || u.ability.ap || 0) * (STAR_MULT[u.star] || 1) + u.apBonus); t.shield += amt; ev(now, 'shield', { id: t.id, amount: amt }); } break;
      case 'summon': for (let k = 0; k < (vb.count || 1); k++) pendingSummons.push({ u, now, kind: vb.kind || 'risen', hp: vb.hp || 950, ad: vb.ad || 115, as: vb.as || 0, armor: vb.armor != null ? vb.armor : 15, shieldStart: vb.shieldStart || 0, statMult: vb.statMult || 1, dodge: vb.dodge || 0, slowAura: vb.slowAura || 0, rage: vb.rage || 0, lifestealAura: vb.lifestealAura || 0, explode: vb.explode || 0 }); break;
      case 'stun': for (const t of targets) { const d = ccDur(t, vb.dur); if (d > 0.05 && applyCC(t, d, now)) { t.stunUntil = now + d; ev(now, 'cc', { id: t.id, kind: 'stun', dur: d }); } } break;
      case 'knockup': for (const t of targets) { const d = ccDur(t, vb.dur); if (d > 0.05 && applyCC(t, d, now)) { t.stunUntil = Math.max(t.stunUntil, now + d); ev(now, 'cc', { id: t.id, kind: 'knockup', dur: d }); } } break;
      case 'knockback': for (const t of targets) doKnockback(u, t, vb.cells || 1, now); break;
      case 'taunt': for (const t of resolveTargets(u, { target: 'cluster', radius: vb.radius || 1 }, primary, now)) { const d = ccDur(t, vb.dur); if (d > 0.05 && applyCC(t, d, now)) { t.tauntTargetId = u.id; t.tauntUntil = now + d; ev(now, 'cc', { id: t.id, kind: 'taunt', dur: d }); } } break;
      case 'slow': for (const t of targets) { const d = ccDur(t, vb.dur); if (t.slowPct <= vb.pct || now >= t.slowUntil) { t.slowPct = Math.max(t.slowPct, vb.pct); t.slowUntil = now + d; ev(now, 'debuff', { id: t.id, kind: 'slow' }); } } break;
      case 'shred': for (const t of targets) { if (vb.stat === 'mr') { t.shredMrAmt = Math.max(now < t.shredMrUntil ? t.shredMrAmt : 0, vb.amount); t.shredMrUntil = now + vb.dur; } else { t.shredArmorAmt = Math.max(now < t.shredArmorUntil ? t.shredArmorAmt : 0, vb.amount); t.shredArmorUntil = now + vb.dur; } ev(now, 'debuff', { id: t.id, kind: 'shred' }); } break;
      case 'manaBurn': for (const t of targets) { t.mana = Math.max(0, t.mana - vb.amount); if (vb.lockDur) t.manaLockUntil = Math.max(t.manaLockUntil, now + Math.min(1.0, ccDur(t, vb.lockDur))); ev(now, 'debuff', { id: t.id, kind: 'manaBurn' }); } break;
      case 'healCut': for (const t of targets) { t.healCutPct = Math.max(now < t.healCutUntil ? t.healCutPct : 0, vb.pct); t.healCutUntil = now + vb.dur; ev(now, 'debuff', { id: t.id, kind: 'healCut' }); } break;
      case 'dot': for (const t of targets) { if (vb.dps >= t.dotDps || now >= t.dotUntil) { t.dotDps = Math.max(t.dotDps, vb.dps); t.dotUntil = now + vb.dur; t.dotSrcId = u.id; t.dotNextAt = now + DOT_TICK; } ev(now, 'debuff', { id: t.id, kind: 'dot' }); } break;
      case 'mark': for (const t of targets) { t.markMult = vb.mult; t.markUntil = now + vb.dur; ev(now, 'debuff', { id: t.id, kind: 'mark' }); } break;
      case 'buffAS': for (const t of targets) { t.asBuffAmt = Math.max(now < t.asBuffUntil ? t.asBuffAmt : 0, vb.amount); t.asBuffUntil = now + vb.dur; ev(now, 'buff', { id: t.id, kind: 'haste' }); } break;
      case 'dodge': for (const t of targets) { t.dodgeBuffAmt = Math.max(now < t.dodgeBuffUntil ? t.dodgeBuffAmt : 0, vb.amount); t.dodgeBuffUntil = now + vb.dur; ev(now, 'buff', { id: t.id, kind: 'dodge' }); } break;
      case 'thorns': for (const t of targets) { t.thornsBuffAmt = Math.max(now < t.thornsBuffUntil ? t.thornsBuffAmt : 0, vb.amount); t.thornsBuffUntil = now + vb.dur; ev(now, 'buff', { id: t.id, kind: 'thorns' }); } break;
      case 'regen': for (const t of targets) { t.regenAmt = Math.max(now < t.regenUntil ? t.regenAmt : 0, vb.perSec); t.regenUntil = now + vb.dur; ev(now, 'buff', { id: t.id, kind: 'regen' }); } break;
      case 'lifesteal': for (const t of targets) { t.lifestealPct = Math.max(now < t.lifestealUntil ? t.lifestealPct : 0, vb.pct); t.lifestealUntil = now + vb.dur; ev(now, 'buff', { id: t.id, kind: 'lifesteal' }); } break;
      case 'rage': u.ragePerAuto = Math.max(u.ragePerAuto, vb.perAuto); u.rageCap = Math.max(u.rageCap, vb.cap); ev(now, 'buff', { id: u.id, kind: 'rage' }); break;
      case 'cleanse': for (const t of targets) { t.stunUntil = -1; t.slowUntil = -1; t.shredArmorUntil = -1; t.shredMrUntil = -1; t.healCutUntil = -1; t.tauntUntil = -1; t.manaLockUntil = Math.min(t.manaLockUntil, now); if (vb.immune) t.ccImmuneUntil = now + vb.immune; ev(now, 'buff', { id: t.id, kind: 'cleanse' }); } break;
      case 'resetAtk': for (const t of targets) t.attackCd = 0; break;
      // ── passive-driven ops ──
      case 'guard': u.guardPct = Math.max(u.guardPct, vb.pct); break;   // dragon_knight: soak adjacent allies' damage (read in applyDamage)
      case 'casterScale': { const n = units.filter((t) => t.team === u.team && ['mage', 'healer', 'summoner'].includes(t.klass)).length; u.apBonus += (vb.perCaster || 0) * n; break; }   // court_mage: scale with allied casters
      case 'rageSelf': u.ragePerAuto = Math.max(u.ragePerAuto, vb.perAuto); u.rageCap = Math.max(u.rageCap, vb.cap || 0.9); break;   // pack_stalker frenzy (silent, no buff event spam)
      case 'sacrifice': {   // hellguard: pay HP to burn the target (floored so it can NEVER self-kill)
        const cost = Math.floor(u.maxHp * (vb.pctMaxHp || 0.02));
        if (u.hp > cost + u.maxHp * 0.2 && primary) { u.hp -= cost; ev(now, 'debuff', { id: u.id, kind: 'sacrifice' }); const before = primary.alive; applyDamage(primary, cost * (vb.mult || 2), 'magic', u, now); if (before && !primary.alive) killed.push(primary); }
        break;
      }
      case 'focus': {   // wood_ranger: lock one target, escalating bonus the longer you fire on it
        if (primary) {
          if (u.markLockId !== primary.id) { u.markLockId = primary.id; u.focusStacks = 0; }
          else u.focusStacks = Math.min(vb.cap || 8, u.focusStacks + 1);
          if (u.focusStacks > 0) { const before = primary.alive; applyDamage(primary, u.ad * (vb.perStack || 0.18) * u.focusStacks, 'physical', u, now); if (before && !primary.alive) killed.push(primary); }
          if (u.star >= 3) { primary.shredArmorAmt = Math.max(now < primary.shredArmorUntil ? primary.shredArmorAmt : 0, vb.shred || 25); primary.shredArmorUntil = now + 3; ev(now, 'debuff', { id: primary.id, kind: 'shred' }); }
        }
        break;
      }
      case 'bonusVs': {   // royal_blade: opener — extra damage into a healthy target
        if (primary && primary.alive && (vb.hpAbove == null || primary.hp / primary.maxHp >= vb.hpAbove)) { const before = primary.alive; applyDamage(primary, u.ad * (vb.mult || 0.8), 'physical', u, now); if (before && !primary.alive) killed.push(primary); }
        break;
      }
      case 'gainManaSelf': u.mana = Math.min(u.maxMana, u.mana + (vb.amount || 30)); break;   // imp_assassin: refund mana on kill to chain (no auto-recast → no reentrancy)
      case 'raiseCorpse': if (u.raiseBudget > 0) { u.raiseBudget--; pendingSummons.push({ u, now, hp: vb.hp || 700, ad: vb.ad || 95, statMult: 1, dodge: 0, slowAura: 0, rage: 0, lifestealAura: 0 }); } break;   // necromancer: raise a Risen from a fallen ally (budget-capped)
      case 'recastOnKill': break;   // marker — handled by the cast() onKill pass (budget-gated)
      case 'raise': break;          // marker — handled by the cast() onKill pass (budget-gated)
      case 'enableOnKill': break;   // marker — onKill verbs come from ult.onKill
    }
  }

  function cast(u, now, _reentry = 0) {
    const ab = u.ability; if (!ab) return;
    const primary = targetOf(u, now);
    // shape drives the renderer's ability VFX (unchanged mapping from the headline type)
    let shape = 'bolt';
    if (ab.type === 'heal') shape = 'heal';
    else if (ab.type === 'shield') shape = 'shield';
    else if (ab.type === 'summon') shape = 'summon';
    else if (ab.type === 'magic') shape = ab.target === 'cluster' ? 'aoe' : 'bolt';
    else if (ab.type === 'physical') shape = ab.target === 'cluster' ? 'cleave' : 'strike';
    if (_reentry === 0) ev(now, 'cast', { id: u.id, name: ab.name, atype: ab.type, shape, tgt: primary ? primary.id : -1, dragon: u.origin === 'dragon' });
    const starM = STAR_MULT[u.star] || 1;
    const ap = (ab.ap || 0) * starM + u.apBonus;   // legacy fallback only
    const is3 = u.star >= 3;
    const verbs = (ab.verbs || []).concat(is3 && ab.ult ? ab.ult.verbs : []);
    if (!verbs.length) { castLegacy(u, ab, primary, ap, now); return; }
    const killed = [];
    for (const vb of verbs) applyVerb(u, vb, now, primary, ap, killed);
    // onKill triggers (only when this cast actually killed something). At 3★ the ult's
    // onKill list fires; base verbs can also carry their own onKill (gated to 3★ via markers).
    const onKill = is3 && ab.ult && ab.ult.onKill ? ab.ult.onKill : [];
    const wantsRaise = is3 && (ab.verbs || []).some((vb) => (vb.onKill || []).some((k) => k.op === 'raise'));
    const wantsRecast = is3 && ab.ult && (ab.ult.verbs || []).some((k) => k.op === 'recastOnKill');
    if (killed.length) {
      for (const victim of killed) {
        if (wantsRaise && u.raiseBudget > 0) { u.raiseBudget--; pendingSummons.push({ u, now, hp: 480, ad: 62, statMult: 1, dodge: 0, slowAura: 0, rage: 0, lifestealAura: 0 }); }
        for (const k of onKill) applyVerb(u, k, now, victim, ap, []);   // fresh [] → onKill kills don't recurse
      }
      for (const victim of killed) runPassive(u, 'kill', now, victim);   // imp_assassin mana-refund chains off ability kills too
      // royal_blade Regicide: on a kill, refund mana + re-dive the next target (hard-capped).
      if (wantsRecast && u.recastBudget > 0 && _reentry < 2) { u.recastBudget--; u.mana = 0; if (targetOf(u, now)) cast(u, now, _reentry + 1); }
    }
    runPassive(u, 'cast', now, primary);   // knight_captain rally-on-cast
  }

  // ── PASSIVE hook dispatcher ────────────────────────────────────────────────
  // ability.passive = entry | entry[], each { on:'spawn'|'hit'|'attacked'|'dodge'|'kill'|
  // 'allyDeath'|'lowHp', verbs:[...], ult?:[...] (3★-only), every?:N (counter-gated),
  // threshold?:f (lowHp) }. Passives FIRE EXISTING VERBS at moments the sim already iterates —
  // one code path, deterministic (counters are per-unit state, no wall-clock, no unseeded RNG).
  function passiveList(u) { const p = u.passive; return p ? (Array.isArray(p) ? p : [p]) : []; }
  function runPassive(u, on, now, primary) {
    if (!u.alive) return;
    for (const p of passiveList(u)) {
      if (p.on !== on) continue;
      if (p.every) { u.hitCount++; if (u.hitCount % p.every !== 0) continue; }   // every-Nth gate
      const vs = (p.verbs || []).concat((u.star >= 3 && p.ult) ? p.ult : []);
      for (const vb of vs) applyVerb(u, vb, now, primary, 0, []);
    }
  }

  // legacy fallback (kept for safety; all 29 ship verbs so this is normally unused)
  function castLegacy(u, ab, target, ap, now) {
    switch (ab.type) {
      case 'magic':
        if (ab.target === 'cluster' && target) { for (const t of enemiesNear(target, u.team, units, ab.radius || 1).sort(byId)) applyDamage(t, ap, 'magic', u, now); }
        else if (target) applyDamage(target, ap, 'magic', u, now);
        break;
      case 'physical': {
        const dmg = u.ad * (ab.adRatio || 1.5);
        if (ab.target === 'cluster' && target) { for (const t of enemiesNear(target, u.team, units, ab.radius || 1).sort(byId)) applyDamage(t, dmg, 'physical', u, now); }
        else if (ab.target === 'lowestEnemyHP') { const t = lowestHP(units, u.team, true); if (t) applyDamage(t, dmg * 1.3, 'physical', u, now); }
        else if (ab.target === 'mostEnemies') { for (const t of units.filter((t) => t.alive && t.team !== u.team).sort(byId).slice(0, 4)) applyDamage(t, dmg * 0.7, 'physical', u, now); }
        else if (target) { applyDamage(target, dmg, 'physical', u, now); if (ab.stun) target.stunUntil = now + ccDur(target, ab.stun); }
        break;
      }
      case 'heal': { const t = lowestHP(units, u.team, false); if (t) heal(t, ap, now); break; }
      case 'shield': { const t = lowestHP(units, u.team, false); if (t) { t.shield += Math.round(ap); ev(now, 'shield', { id: t.id, amount: Math.round(ap) }); } break; }
      case 'summon': pendingSummons.push({ u, now, kind: 'risen', hp: 950, ad: 115, as: 0, armor: 15, shieldStart: 0, statMult: 1, dodge: 0, slowAura: 0, rage: 0, lifestealAura: 0 }); break;
    }
  }

  // chain: bounce from a primary to the nearest not-yet-hit enemies, ×falloff each hop.
  function chain(u, primary, vb, now, killed) {
    if (!primary) return;
    const hitSet = new Set([primary.id]);
    let cur = primary, mag = (vb.ap || u.ability.ap || 0) * (STAR_MULT[u.star] || 1) + u.apBonus, prev = primary;
    const before0 = primary.alive; applyDamage(primary, mag, 'magic', u, now); if (before0 && !primary.alive) killed.push(primary);
    for (let h = 0; h < (vb.count || 2); h++) {
      mag *= (vb.falloff || 0.6);
      let best = null, bd = Infinity;
      for (const t of units) { if (!t.alive || t.team === u.team || hitSet.has(t.id)) continue; const d = dist2(prev, t); if (d < bd || (d === bd && (!best || t.id < best.id))) { best = t; bd = d; } }
      if (!best) break;
      hitSet.add(best.id); ev(now, 'arc', { from: prev.id, to: best.id });
      const before = best.alive; applyDamage(best, mag, 'magic', u, now); if (before && !best.alive) killed.push(best);
      prev = best;
    }
  }

  // meteors: n seeded strikes on random living enemies, small AoE each.
  function meteors(u, vb, now, killed) {
    const pool = units.filter((t) => t.alive && t.team !== u.team).sort(byIdU);
    if (!pool.length) return;
    const mag = (vb.ap || 0) * (STAR_MULT[u.star] || 1) + u.apBonus * 0.3;
    for (let i = 0; i < (vb.n || 3); i++) {
      const live = pool.filter((t) => t.alive);
      if (!live.length) break;
      const center = live[rng.int(0, live.length - 1)];
      ev(now, 'meteor', { col: center.col, row: center.row });
      for (const t of enemiesNear(center, u.team, units, vb.radius || 1).sort(byIdU)) { const before = t.alive; applyDamage(t, mag, 'magic', u, now); if (before && !t.alive) killed.push(t); }
    }
  }

  // knockback: shove target away from caster by up to `cells`, respecting occupied cells.
  function doKnockback(u, t, cells, now) {
    if (!t.alive) return;
    const dc = Math.sign(t.col - u.col), dr = Math.sign(t.row - u.row);
    let moved = false;
    for (let s = 0; s < cells; s++) {
      const nc = t.col + dc, nr = t.row + dr;
      if (!inBounds(nc, nr)) break;
      const ni = idx(nc, nr);
      if (occupied.has(ni)) break;
      occupied.delete(idx(t.col, t.row)); t.col = nc; t.row = nr; occupied.add(ni); moved = true;
    }
    if (moved) ev(now, 'move', { id: t.id, col: t.col, row: t.row });
  }

  function doSummons() {
    for (const p of pendingSummons.splice(0)) {
      const { u, now } = p;
      const free = neighbours(u.col, u.row).find((n) => !occupied.has(idx(n.col, n.row)));
      if (!free) continue;
      const sm = (p.statMult || 1) * (1 + (u.summonPower || 0)) * (STAR_MULT[u.star] || 1);   // summon strength scales with star + ult statMult
      const baseHp = Math.round((p.hp || 950) * sm), baseAd = Math.round((p.ad || 115) * sm);
      const kind = p.kind || 'risen';
      const sAs = p.as || 0.7;   // each summon kind has its own attack speed (wolf is fast, others 0.7)
      const sName = { risen: 'Risen', spirit: 'Spirit', imp: 'Imp', wolf: 'Wolf', soldier: 'Soldier' }[kind] || 'Risen';
      const s = {
        id: nextId++, team: u.team, defId: 'summon', summonKind: kind, name: sName, star: 1, origin: '_', klass: '_',
        col: free.col, row: free.row, hp: baseHp, maxHp: baseHp,
        ad: baseAd, as: sAs, armor: p.armor != null ? p.armor : 15, mr: 15, range: 1,
        mana: 0, maxMana: 9999, manaPer: 0, manaLockUntil: Infinity, attackCd: 1 / sAs, ability: null, apBonus: 0,
        alive: true, shield: Math.round((p.shieldStart || 0) * sm), stunUntil: -1, block: 0, dmgRed: 0, ccResist: 0, critChance: 0, critDmg: 0.4, dodge: p.dodge || 0, healAmp: 0, regen: 0,
        revivePct: 0, revived: true, burnOnHit: 0, manaBurnOnHit: 0, hpDmg: 0, staggerPct: 0, staggerDur: 0, ferocity: 0, asStacks: 0, manaRegen: 0, rangerAS: 0, summonPower: 0, moveCd: 0, isSummon: true,
        vamp: 0, thorns: 0, items: [],
        slowPct: 0, slowUntil: -1, shredArmorAmt: 0, shredArmorUntil: -1, shredMrAmt: 0, shredMrUntil: -1,
        healCutPct: 0, healCutUntil: -1, dotDps: 0, dotUntil: -1, dotSrcId: -1, dotNextAt: -1,
        asBuffAmt: 0, asBuffUntil: -1, dodgeBuffAmt: 0, dodgeBuffUntil: -1, thornsBuffAmt: 0, thornsBuffUntil: -1,
        regenAmt: 0, regenUntil: -1, lifestealPct: 0, lifestealUntil: -1,
        tauntTargetId: -1, tauntUntil: -1, ccImmuneUntil: -1, ccSetAt: -2, markMult: 1, markUntil: -1,
        ragePerAuto: p.rage || 0, rageCap: p.rage ? 0.9 : 0, onKillVerbs: null, onKillN: 0, recastBudget: 0, raiseBudget: 0,
        slowAura: p.slowAura || 0, lifestealAura: p.lifestealAura || 0,
        passive: null, hitCount: 0, lowHpFired: false, lastMovedTick: -999, markLockId: -1, focusStacks: 0, guardPct: 0, explodeDmg: p.explode || 0,
      };
      if (s.lifestealAura) s.vamp = s.lifestealAura;   // enraged pack drains on its own autos
      units.push(s); occupied.add(idx(s.col, s.row));
      ev(now, 'spawn', { id: s.id, team: s.team, defId: 'summon', summonKind: kind, name: sName, star: 1, col: s.col, row: s.row, hp: s.hp, maxHp: s.maxHp, summon: true, owner: u.id });
    }
  }

  function doAttack(u, target, now) {
    let dmg = u.ad;
    const crit = u.critChance > 0 && rng.chance(u.critChance);
    if (crit) dmg *= (1 + u.critDmg);
    // beast_hunter mark: autos into a marked target hit harder (execBonus-style).
    if (now < target.markUntil && target.markMult > 1) dmg *= target.markMult;
    ev(now, 'attack', { id: u.id, tgt: target.id, ranged: u.range > 1, crit });
    if (u.range > 1) ev(now, 'projectile', { from: u.id, to: target.id, kind: u.klass === 'mage' ? 'magic' : 'arrow' });
    const wasAlive = target.alive;
    const dealt = applyDamage(target, dmg, 'physical', u, now);
    const killedThis = wasAlive && !target.alive;
    const ls = u.vamp + (now < u.lifestealUntil ? u.lifestealPct : 0);   // permanent vamp + timed lifesteal verb
    if (ls > 0 && u.alive) heal(u, dealt * ls, now);
    if (u.burnOnHit) applyDamage(target, u.burnOnHit, 'magic', u, now);
    // Assassin: each strike SHREDS the target's armour (the anti-tank tool — fast crits melt a
    // bruiser's mitigation, giving the squishiest comp a real role vs armoured boards). Refreshes.
    if (u.shredOnHit && target.alive) { target.shredArmorAmt = Math.max(now < target.shredArmorUntil ? target.shredArmorAmt : 0, u.shredOnHit); target.shredArmorUntil = now + 3; }
    if (u.manaBurnOnHit && target.alive) target.mana = Math.max(0, target.mana - u.manaBurnOnHit);
    // Giant: each strike smashes for bonus magic = % of the GIANT's own max HP ("the bigger they
    // are") AND staggers the target (a brief attack-speed slow — the CC SOURCE that Dwarf resists).
    if (u.hpDmg && target.alive) applyDamage(target, u.maxHp * u.hpDmg, 'magic', u, now);
    if (u.staggerPct && target.alive) { const d = ccDur(target, u.staggerDur); if (d > 0.05 && (target.slowPct <= u.staggerPct || now >= target.slowUntil)) { target.slowPct = Math.max(target.slowPct, u.staggerPct); target.slowUntil = now + d; } }
    gainMana(u, u.manaPer, now);
    if (u.ferocity) u.asStacks = Math.min(1.5, u.asStacks + u.ferocity);
    if (u.ragePerAuto) u.asStacks = Math.min(u.rageCap || 0.9, u.asStacks + u.ragePerAuto);   // bramble_brute / enraged pack
    if (u.rangerAS && rng.chance(u.rangerAS)) u.asStacks = Math.min(1.5, u.asStacks + 0.15);
    // on-attack & on-kill passives (skeleton bolt, hellguard sacrifice, wood_ranger focus, imp refund)
    runPassive(u, 'hit', now, target);
    if (killedThis) runPassive(u, 'kill', now, target);
  }

  // fire spawn passives once, before combat (guard auras, caster-scaling, carry-marks, self steroids)
  for (const u of units.slice().sort(byId)) runPassive(u, 'spawn', 0, null);

  // ---- main tick loop ----
  let tick = 0;
  for (; tick < MAX_TICKS && alive('player') && alive('enemy'); tick++) {
    const now = tick * DT;
    for (const u of units.filter((x) => x.alive).sort(byId)) {
      if (!u.alive) continue;
      // passive per-tick effects apply even while stunned (DoT/regen tick through CC)
      if (u.regen) u.hp = Math.min(u.maxHp, u.hp + u.regen * DT);
      if (now < u.regenUntil && u.regenAmt) u.hp = Math.min(u.maxHp, u.hp + u.regenAmt * DT);
      // DoT ticks in discrete 0.5s pulses (readable burn numbers, not a 30/s number-spam)
      if (now < u.dotUntil && u.dotDps && now >= u.dotNextAt) { u.dotNextAt = now + DOT_TICK; const src = u.dotSrcId >= 0 ? units.find((x) => x.id === u.dotSrcId) : null; applyDamage(u, u.dotDps * DOT_TICK, 'magic', src && src.alive ? src : null, now); }
      if (!u.alive) continue;
      // lowHp passive: one-shot edge trigger when HP% first crosses the threshold (wraith phase-out)
      if (!u.lowHpFired && u.passive) { const lp = passiveList(u).find((p) => p.on === 'lowHp'); if (lp && u.hp / u.maxHp < (lp.threshold || 0.35)) { u.lowHpFired = true; runPassive(u, 'lowHp', now, null); } }
      // slow-aura summons (spirit_caller ult): chill adjacent enemies, refreshed silently
      if (u.slowAura) for (const e of units) if (e.alive && e.team !== u.team && dist2(u, e) <= 1) { if (e.slowPct <= u.slowAura || now >= e.slowUntil) { e.slowPct = Math.max(e.slowPct, u.slowAura); e.slowUntil = now + 0.25; } }
      if (now < u.stunUntil) continue;   // stunned: ticks above still ran, but can't act
      if (u.manaRegen) gainMana(u, u.manaRegen * DT, now);
      if (!u.alive) continue;
      const target = targetOf(u, now);
      if (!target) continue;
      if (inRange(u, target)) {
        u.moveCd = 0;                                   // ready to chase the instant the target leaves range
        u.attackCd -= DT;
        if (u.attackCd <= 0) { doAttack(u, target, now); u.attackCd = 1 / effAS(u, now); }
      } else {
        u.attackCd = Math.min(u.attackCd, 1 / effAS(u, now));
        u.moveCd -= DT;
        if (u.moveCd <= 0) {                            // walk ONE cell per MOVE_INTERVAL, not per tick
          const step = stepToward(u, target, occupied);
          if (step) { occupied.delete(idx(u.col, u.row)); u.col = step.col; u.row = step.row; occupied.add(idx(u.col, u.row)); ev(now, 'move', { id: u.id, col: u.col, row: u.row }); }
          u.moveCd = MOVE_INTERVAL;
        }
      }
    }
    doSummons();
    // sudden death: ramping % of max-HP true damage to everyone so fights always end
    // regardless of HP pool size (flat damage can't chew through 3★ tank stacks).
    if (now > SUDDEN_DEATH_T) {
      const frac = (0.05 + 0.03 * (now - SUDDEN_DEATH_T)) * DT;  // grows each second
      for (const u of units.filter((x) => x.alive).sort(byId)) applyDamage(u, u.maxHp * frac, 'true', null, now, true);
    }
  }

  // A board is only truly defeated when NOTHING it owns is left standing — summoned creatures count
  // as the owner's board. Real (non-summon) champions decide the winner first; when those tie (e.g.
  // one side has only summons left, the other is wiped), surviving SUMMONS break the tie — a board
  // still standing beats a board that's been cleared. Only an utterly empty board on both sides draws.
  const pAlive = units.filter((u) => u.alive && u.team === 'player');   // includes summons (they're your units)
  const eAlive = units.filter((u) => u.alive && u.team === 'enemy');
  const pReal = pAlive.filter((u) => !u.isSummon).length;
  const eReal = eAlive.filter((u) => !u.isSummon).length;
  let winner = 'draw';
  if (pReal !== eReal) winner = pReal > eReal ? 'player' : 'enemy';            // real champions decide first
  else if (pAlive.length !== eAlive.length) winner = pAlive.length > eAlive.length ? 'player' : 'enemy';   // tie → surviving summons win it
  ev(tick * DT, 'end', { winner });

  return {
    events,
    result: { winner, durationTicks: tick, survivors: { player: pAlive.length, enemy: eAlive.length } },
    finalState: {
      survivors: { player: pAlive.map((u) => ({ defId: u.defId, star: u.star, cost: UNITS_BY_ID[u.defId]?.cost || 1 })), enemy: eAlive.map((u) => ({ defId: u.defId, star: u.star, cost: UNITS_BY_ID[u.defId]?.cost || 1 })) },
    },
  };
}

// Player damage on a loss: base(round) + sum(survivor cost*star) + 2*count.
// NOTE: the damage SHAPE is intentionally unchanged — games are lengthened purely via a larger
// START_HP pool (bots.js), which scales longevity while preserving the relative death-order (so
// the difficulty balance / placement gradient is untouched; you just get more rounds).
const BASE_DMG = [0, 0, 2, 5, 8, 10, 12, 17];
export function playerDamage(enemySurvivors, round) {
  const base = BASE_DMG[Math.min(round, 7)] ?? 17;
  const unit = enemySurvivors.reduce((s, u) => s + u.cost * u.star + 2, 0);
  return base + unit;
}
