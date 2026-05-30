// Pure deterministic auto-battle simulation. simulate(playerBoard, enemyBoard, seed)
// runs the WHOLE fight to completion and returns { events, result, finalState }.
// No DOM, no wall-clock, no Math.random — the renderer just plays back `events`.
// This purity is what gives us replays, speed controls, headless tests AND balancing.
import { RNG } from '../rng.js';
import { UNITS_BY_ID, statsForStar } from '../data/units.js';
import { activeTraits } from '../data/traits.js';
import { idx, inBounds, neighbours, stepToward, COLS, ROWS } from '../grid.js';
import { mitigate, manaFromDamage, nearestEnemy, enemiesNear, lowestHP, inRange } from './rules.js';
import { aggregateMods } from '../data/items.js';

const DT = 1 / 30;
const MAX_TICKS = 30 * 45;       // 45s hard cap
const SUDDEN_DEATH_T = 25;       // after 25s, ramping true damage breaks stalemates

function makeUnit(entry, team, id, mods = {}) {
  const def = UNITS_BY_ID[entry.defId];
  const s = statsForStar(def, entry.star || 1);
  const im = aggregateMods(entry.items || []);
  // fold relic/team combat mods into the item-mod object (additive)
  for (const k of ['ad', 'as', 'hp', 'ap', 'armor', 'mr', 'shield', 'vamp', 'thorns', 'critChance', 'critDmg', 'revive']) im[k] = (im[k] || 0) + (mods[k] || 0);
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
    block: 0, critChance: im.critChance, critDmg: 0.4 + im.critDmg, dodge: 0, healAmp: 0, regen: im.regen,
    revivePct: im.revive, revived: false, burnOnHit: 0, manaBurnOnHit: 0,
    ferocity: 0, asStacks: 0, manaRegen: 0, rangerAS: 0, summonPower: 0,
    vamp: im.vamp, thorns: im.thorns,
    items: entry.items || [], isSummon: !!entry.isSummon,
  };
}

// Apply a team's active traits to its units (whole-team auras + tagged-only effects).
function applyTraits(units, board) {
  const defs = board.map((e) => UNITS_BY_ID[e.defId]);
  const active = activeTraits(defs);
  const get = (t) => (active[t] && active[t].bonus) || null;
  for (const u of units) {
    // whole-team
    const human = get('human'); if (human) u.manaRegen = Math.max(u.manaRegen, human.manaRegen);
    const knight = get('knight'); if (knight) u.block = Math.max(u.block, knight.block);
    const healer = get('healer'); if (healer) { u.healAmp = Math.max(u.healAmp, healer.healAmp); u.regen = Math.max(u.regen, healer.regen); }
    const elf = get('elf'); if (elf) { u.dodge = Math.max(u.dodge, elf.dodge); u.shield += elf.shield; }
    const dragon = get('dragon'); if (dragon) u.mr += dragon.mr;
    const beast = get('beast'); if (beast && active.beast.tier >= 6) u.ferocity = Math.max(u.ferocity, beast.ferocity);
    // tagged-only
    if (u.klass === 'mage') { const m = get('mage'); if (m) u.apBonus += m.ap; }
    if (u.klass === 'assassin') { const a = get('assassin'); if (a) { u.critChance += a.critChance; u.critDmg += a.critDmg; } }
    if (u.klass === 'ranger') { const r = get('ranger'); if (r) u.rangerAS = r.rangerAS; }
    if (u.klass === 'beast' || u.origin === 'beast') { const b = get('beast'); if (b) u.ferocity = Math.max(u.ferocity, b.ferocity); }
    if (u.origin === 'undead') { const ud = get('undead'); if (ud) u.revivePct = Math.max(u.revivePct, ud.revivePct); }
    if (u.origin === 'demon') { const d = get('demon'); if (d) { u.burnOnHit = d.burn; u.manaBurnOnHit = d.manaBurn; } }
    if (u.klass === 'summoner') { const s = get('summoner'); if (s) u.summonPower = s.summonPower; }
  }
}

export function simulate(playerBoard, enemyBoard, seed = 1, opts = {}) {
  const rng = new RNG(seed >>> 0);
  const events = [];
  const ev = (t, type, data) => events.push({ t: Math.round(t * 1000), type, ...data });
  const tm = opts.teamMods || {};

  // build units, stable ids: player 0..n, enemy continuing
  let nextId = 0;
  const units = [];
  for (const e of playerBoard) units.push(makeUnit(e, 'player', nextId++, tm.player));
  for (const e of enemyBoard) units.push(makeUnit(e, 'enemy', nextId++, tm.enemy));
  applyTraits(units.filter((u) => u.team === 'player'), playerBoard);
  applyTraits(units.filter((u) => u.team === 'enemy'), enemyBoard);
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
  function effAS(u) { return Math.min(2.5, u.as + u.asStacks); }

  function gainMana(u, amt, now) {
    if (now < u.manaLockUntil || !u.alive) return;
    u.mana += amt;
    if (u.mana >= u.maxMana) { u.mana -= u.maxMana; u.manaLockUntil = now + 1.0; cast(u, now); }
  }

  function applyDamage(target, raw, type, source, now) {
    if (!target.alive) return 0;
    if (type === 'physical' && source && rng.chance(target.dodge)) { ev(now, 'dodge', { id: target.id }); return 0; }
    let post = mitigate(raw, type, target);
    if (type !== 'true') post = Math.max(0, post - target.block);
    // shield soak
    if (target.shield > 0) { const s = Math.min(target.shield, post); target.shield -= s; post -= s; }
    post = Math.round(post);
    target.hp -= post;
    gainMana(target, manaFromDamage(raw, post), now);
    ev(now, 'damage', { id: target.id, src: source ? source.id : -1, amount: post, hp: Math.max(0, target.hp), dmgType: type });
    // thorns: reflect a fraction of physical damage back as true damage (no loop)
    if (type === 'physical' && source && target.thorns > 0 && source.alive) {
      const refl = Math.round(raw * target.thorns);
      source.hp -= refl;
      ev(now, 'damage', { id: source.id, src: target.id, amount: refl, hp: Math.max(0, source.hp), dmgType: 'true' });
      if (source.hp <= 0) die(source, now);
    }
    if (target.hp <= 0) die(target, now);
    return post;
  }

  function heal(target, amt, now) {
    if (!target.alive) return;
    amt = Math.round(amt * (1 + (target.healAmp || 0)));
    target.hp = Math.min(target.maxHp, target.hp + amt);
    ev(now, 'heal', { id: target.id, amount: amt, hp: target.hp });
  }

  function die(u, now) {
    if (u.revivePct > 0 && !u.revived) {
      u.revived = true; u.hp = Math.round(u.maxHp * u.revivePct); u.mana = 0;
      ev(now, 'revive', { id: u.id, hp: u.hp });
      return;
    }
    u.alive = false; occupied.delete(idx(u.col, u.row));
    ev(now, 'faint', { id: u.id });
  }

  const pendingSummons = [];
  function cast(u, now) {
    const ab = u.ability; if (!ab) return;
    const target = nearestEnemy(u, units);
    // shape drives the renderer's ability VFX
    let shape = 'bolt';
    if (ab.type === 'heal') shape = 'heal';
    else if (ab.type === 'shield') shape = 'shield';
    else if (ab.type === 'summon') shape = 'summon';
    else if (ab.type === 'magic') shape = ab.target === 'cluster' ? 'aoe' : 'bolt';
    else if (ab.type === 'physical') shape = ab.target === 'cluster' ? 'cleave' : 'strike';
    ev(now, 'cast', { id: u.id, name: ab.name, atype: ab.type, shape, tgt: target ? target.id : -1, dragon: u.origin === 'dragon' });
    const ap = (ab.ap || 0) + u.apBonus;
    switch (ab.type) {
      case 'magic':
        if (ab.target === 'cluster' && target) {
          for (const t of enemiesNear(target, u.team, units, ab.radius || 1).sort(byId)) applyDamage(t, ap, 'magic', u, now);
        } else if (target) applyDamage(target, ap, 'magic', u, now);
        break;
      case 'physical': {
        const dmg = u.ad * (ab.adRatio || 1.5);
        if (ab.target === 'cluster' && target) {
          for (const t of enemiesNear(target, u.team, units, ab.radius || 1).sort(byId)) applyDamage(t, dmg, 'physical', u, now);
        } else if (ab.target === 'lowestEnemyHP') { const t = lowestHP(units, u.team, true); if (t) applyDamage(t, dmg * 1.3, 'physical', u, now); }
        else if (ab.target === 'mostEnemies') {
          const ts = units.filter((t) => t.alive && t.team !== u.team).sort(byId).slice(0, 4);
          for (const t of ts) applyDamage(t, dmg * 0.7, 'physical', u, now);
        } else if (target) { applyDamage(target, dmg, 'physical', u, now); if (ab.stun) target.stunUntil = now + ab.stun; }
        break;
      }
      case 'heal': { const t = lowestHP(units, u.team, false); if (t) heal(t, ap, now); break; }
      case 'shield': { const t = lowestHP(units, u.team, false); if (t) { t.shield += Math.round(ap); ev(now, 'shield', { id: t.id, amount: Math.round(ap) }); } break; }
      case 'summon': pendingSummons.push({ u, now }); break;
    }
  }

  function doSummons() {
    for (const { u, now } of pendingSummons.splice(0)) {
      const free = neighbours(u.col, u.row).find((n) => !occupied.has(idx(n.col, n.row)));
      if (!free) continue;
      const mult = 1 + (u.summonPower || 0);
      const s = {
        id: nextId++, team: u.team, defId: 'summon', name: 'Risen', star: 1, origin: '_', klass: '_',
        col: free.col, row: free.row, hp: Math.round(u.ability.summonHp * mult), maxHp: Math.round(u.ability.summonHp * mult),
        ad: Math.round(u.ability.summonAd * mult), as: 0.7, armor: 15, mr: 15, range: 1,
        mana: 0, maxMana: 9999, manaPer: 0, manaLockUntil: Infinity, attackCd: 1 / 0.7, ability: null, apBonus: 0,
        alive: true, shield: 0, stunUntil: -1, block: 0, critChance: 0, critDmg: 0.4, dodge: 0, healAmp: 0, regen: 0,
        revivePct: 0, revived: true, burnOnHit: 0, manaBurnOnHit: 0, ferocity: 0, asStacks: 0, manaRegen: 0, rangerAS: 0, summonPower: 0, isSummon: true,
      };
      units.push(s); occupied.add(idx(s.col, s.row));
      ev(now, 'spawn', { id: s.id, team: s.team, defId: 'summon', star: 1, col: s.col, row: s.row, hp: s.hp, maxHp: s.maxHp, summon: true });
    }
  }

  function doAttack(u, target, now) {
    let dmg = u.ad;
    const crit = u.critChance > 0 && rng.chance(u.critChance);
    if (crit) dmg *= (1 + u.critDmg);
    ev(now, 'attack', { id: u.id, tgt: target.id, ranged: u.range > 1, crit });
    if (u.range > 1) ev(now, 'projectile', { from: u.id, to: target.id, kind: u.klass === 'mage' ? 'magic' : 'arrow' });
    const dealt = applyDamage(target, dmg, 'physical', u, now);
    if (u.vamp > 0 && u.alive) heal(u, dealt * u.vamp, now);
    if (u.burnOnHit) applyDamage(target, u.burnOnHit, 'magic', u, now);
    if (u.manaBurnOnHit && target.alive) target.mana = Math.max(0, target.mana - u.manaBurnOnHit);
    gainMana(u, u.manaPer, now);
    if (u.ferocity) u.asStacks = Math.min(1.5, u.asStacks + u.ferocity);
    if (u.rangerAS && rng.chance(u.rangerAS)) u.asStacks = Math.min(1.5, u.asStacks + 0.15);
  }

  // ---- main tick loop ----
  let tick = 0;
  for (; tick < MAX_TICKS && alive('player') && alive('enemy'); tick++) {
    const now = tick * DT;
    for (const u of units.filter((x) => x.alive).sort(byId)) {
      if (!u.alive || now < u.stunUntil) continue;
      if (u.regen) u.hp = Math.min(u.maxHp, u.hp + u.regen * DT);
      if (u.manaRegen) gainMana(u, u.manaRegen * DT, now);
      if (!u.alive) continue;
      const target = nearestEnemy(u, units);
      if (!target) continue;
      if (inRange(u, target)) {
        u.attackCd -= DT;
        if (u.attackCd <= 0) { doAttack(u, target, now); u.attackCd = 1 / effAS(u); }
      } else {
        u.attackCd = Math.min(u.attackCd, 1 / effAS(u)) - DT * 0; // keep ready-ish when arriving
        const step = stepToward(u, target, occupied);
        if (step) { occupied.delete(idx(u.col, u.row)); u.col = step.col; u.row = step.row; occupied.add(idx(u.col, u.row)); ev(now, 'move', { id: u.id, col: u.col, row: u.row }); }
      }
    }
    doSummons();
    // sudden death: ramping % of max-HP true damage to everyone so fights always end
    // regardless of HP pool size (flat damage can't chew through 3★ tank stacks).
    if (now > SUDDEN_DEATH_T) {
      const frac = (0.05 + 0.03 * (now - SUDDEN_DEATH_T)) * DT;  // grows each second
      for (const u of units.filter((x) => x.alive).sort(byId)) applyDamage(u, u.maxHp * frac, 'true', null, now);
    }
  }

  const pAlive = units.filter((u) => u.alive && u.team === 'player' && !u.isSummon);
  const eAlive = units.filter((u) => u.alive && u.team === 'enemy' && !u.isSummon);
  let winner = 'draw';
  if (pAlive.length && !eAlive.length) winner = 'player';
  else if (eAlive.length && !pAlive.length) winner = 'enemy';
  else if (pAlive.length !== eAlive.length) winner = pAlive.length > eAlive.length ? 'player' : 'enemy';
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
const BASE_DMG = [0, 0, 2, 5, 8, 10, 12, 17];
export function playerDamage(enemySurvivors, round) {
  const base = BASE_DMG[Math.min(round, 7)] ?? 17;
  const unit = enemySurvivors.reduce((s, u) => s + u.cost * u.star + 2, 0);
  return base + unit;
}
