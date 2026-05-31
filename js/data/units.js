// Champion roster (~29 units) across the 6 Origins x 6 Classes matrix.
// Stats are 1-star base values, cost-scaled, then role-adjusted. Ability is data the
// combat sim's ability handlers read (sim/rules.js). These are STARTING numbers — the
// headless autobalancer (sim/autobalance.js) will tune the outliers.

// Base 1-star stats per cost tier.
const COST_BASE = {
  // Steep ~1.3×/cost curve so a 1★ elite ≈ a 3★ cheap unit (3★ = ×2.89). Without this, six
  // 3★ cost-1 bodies dwarf a comp that must run 1★ cost-5s, so expensive-unit comps are dead.
  1: { hp: 480, ad: 62, as: 0.70, armor: 16, mr: 16, mana: 35 },
  2: { hp: 620, ad: 80, as: 0.72, armor: 20, mr: 20, mana: 38 },
  3: { hp: 810, ad: 105, as: 0.75, armor: 25, mr: 25, mana: 42 },
  4: { hp: 1050, ad: 137, as: 0.78, armor: 31, mr: 31, mana: 46 },
  5: { hp: 1370, ad: 178, as: 0.80, armor: 38, mr: 38, mana: 50 },
};

// Role shapes: how a class bends the base stats + which mana-gen profile it uses.
// manaPer = mana gained per auto-attack (TFT: carry 10, caster 7, tank 5).
const ROLE = {
  knight:   { hpx: 1.44, adx: 1.12, range: 1, manaPer: 7, startMana: 0.20 },   // small tank bump for the slower march; realistic 3★ play shows knights don't need the big buff
  mage:     { hpx: 0.78, adx: 0.70, range: 3, manaPer: 8, startMana: 0.35 },   // squishier — Mage burst over-performs; easier to punish
  ranger:   { hpx: 0.86, adx: 0.65, range: 3, manaPer: 10, startMana: 0.10 },   // toned down hard — all-3★ Ranger comp (every volley ult firing) was the runaway outlier; now dies if the front breaks
  assassin: { hpx: 0.90, adx: 1.08, range: 1, manaPer: 10, startMana: 0.20, dive: true },   // trimmed — c3 assassins got strong with the steeper curve
  healer:   { hpx: 0.95, adx: 0.65, range: 2, manaPer: 8, startMana: 0.40 },
  summoner: { hpx: 1.12, adx: 0.70, range: 2, manaPer: 8, startMana: 0.30 },
};

// `tune` = optional per-unit balance overrides: { hpx, adx } multipliers.
function mk(defId, name, origin, klass, cost, ability, tune = {}) {
  const b = COST_BASE[cost], r = ROLE[klass];
  return {
    defId, name, origin, klass, cost,
    range: r.range,
    hp: Math.round(b.hp * r.hpx * (tune.hpx || 1)),
    ad: Math.round(b.ad * r.adx * (tune.adx || 1)),
    as: b.as,
    armor: b.armor + (klass === 'knight' ? 20 : 0),
    mr: b.mr + (klass === 'knight' ? 10 : 0),
    maxMana: b.mana,
    startMana: Math.round(b.mana * r.startMana),
    manaPer: r.manaPer,
    dive: !!r.dive,
    ability,
  };
}

// ── Ability data ──────────────────────────────────────────────────────────
// Each champion now has a UNIQUE signature ability (per ABILITIES_SPEC.md): a base
// effect plus a qualitative 3★ ULTIMATE upgrade. The combat sim runs a thin layer of
// composable VERBS (sim/combat.js). At 3★ the engine runs `verbs.concat(ult.verbs)`.
//
// We keep LEGACY HEADLINE fields (type/target/ap/adRatio/radius/stun/summonHp/summonAd)
// describing the PRIMARY effect so the autobalancer (sim/tuner.mjs), unit tooltips
// (main.js) and bot valuation (bots.js) keep working unchanged. The primary damage
// verbs read `ab.ap`/`ab.adRatio` from the headline, so tuning those still flows through.
//
// Verb shorthands. target selectors (resolved in combat.js):
//   current · cluster(radius) · mostEnemies(count,mult,offset) · lowestEnemyHP · self ·
//   lowestAllyHP · allies · adjacentAllies · lowestNAllies(n) · line · allEnemies · nearestN(n)
const v = {
  magic:    (o = {}) => ({ op: 'magic', target: 'current', ...o }),
  cluster:  (o = {}) => ({ op: 'magic', target: 'cluster', radius: 1, ...o }),
  phys:     (o = {}) => ({ op: 'phys', target: 'current', ...o }),
  cleave:   (o = {}) => ({ op: 'phys', target: 'cluster', radius: 1, ...o }),
  volley:   (o = {}) => ({ op: 'phys', target: 'mostEnemies', count: 4, mult: 0.7, ...o }),
  exec:     (o = {}) => ({ op: 'exec', threshold: 0.25, mult: 1.3, ...o }),
  line:     (o = {}) => ({ op: 'line', ...o }),
  chain:    (o = {}) => ({ op: 'chain', count: 2, falloff: 0.6, ...o }),
  meteors:  (o = {}) => ({ op: 'meteors', n: 3, radius: 1, ...o }),
  heal:     (o = {}) => ({ op: 'heal', target: 'lowestAllyHP', ...o }),
  shield:   (o = {}) => ({ op: 'shield', target: 'lowestAllyHP', ...o }),
  shieldSelf: (amount) => ({ op: 'shield', target: 'self', amount }),
  summon:   (o = {}) => ({ op: 'summon', count: 2, hp: 950, ad: 115, ...o }),
  stun:     (dur, target = 'current') => ({ op: 'stun', dur, target }),
  knockup:  (dur, target = 'current') => ({ op: 'knockup', dur, target }),
  knockback:(cells, target = 'current') => ({ op: 'knockback', cells, target }),
  slow:     (pct, dur, target = 'current') => ({ op: 'slow', pct, dur, target }),
  shred:    (stat, amount, dur, target = 'current') => ({ op: 'shred', stat, amount, dur, target }),
  manaBurn: (amount, target = 'current', lockDur = 0) => ({ op: 'manaBurn', amount, lockDur, target }),
  taunt:    (radius, dur) => ({ op: 'taunt', radius, dur }),
  healCut:  (pct, dur, target = 'current') => ({ op: 'healCut', pct, dur, target }),
  dot:      (dps, dur, target = 'current') => ({ op: 'dot', dps, dur, target }),
  buffAS:   (amount, dur, target = 'self') => ({ op: 'buffAS', amount, dur, target }),
  rage:     (perAuto, cap) => ({ op: 'rage', perAuto, cap }),
  lifesteal:(pct, dur, target = 'self') => ({ op: 'lifesteal', pct, dur, target }),
  dodge:    (amount, dur, target = 'self') => ({ op: 'dodge', amount, dur, target }),
  cleanse:  (target = 'self', immune = 0) => ({ op: 'cleanse', target, immune }),
  regen:    (perSec, dur, target = 'self') => ({ op: 'regen', perSec, dur, target }),
  thorns:   (amount, dur, target = 'self') => ({ op: 'thorns', amount, dur, target }),
  mark:     (mult, dur, target = 'lowestEnemyHP') => ({ op: 'mark', mult, dur, target }),
  resetAtk: (target = 'self') => ({ op: 'resetAtk', target }),
  // passive-driven verbs (fired from ability.passive hooks, not mana casts)
  guard:    (pct) => ({ op: 'guard', pct }),
  casterScale: (perCaster) => ({ op: 'casterScale', perCaster }),
  rageSelf: (perAuto, cap) => ({ op: 'rageSelf', perAuto, cap }),
  sacrifice:(pctMaxHp, mult) => ({ op: 'sacrifice', pctMaxHp, mult }),
  focus:    (perStack, cap, shred) => ({ op: 'focus', perStack, cap, shred }),
  bonusVs:  (hpAbove, mult) => ({ op: 'bonusVs', hpAbove, mult }),
  gainManaSelf: (amount) => ({ op: 'gainManaSelf', amount }),
  raiseCorpse: (hp, ad) => ({ op: 'raiseCorpse', hp, ad }),
};
// onKill: list of verbs that fire only if a primary-damage verb's hit KILLED its target.
const A = {
  // Human
  // PASSIVE — Commander: every cast also briefly hastes the allies beside him.
  knight_captain: { name: 'Rallying Bash', type: 'physical', target: 'current', adRatio: 2.0, stun: 1.0,
    verbs: [v.phys({ adRatio: 2.0 }), v.stun(1.0), v.shieldSelf(30)],
    passive: { on: 'cast', verbs: [v.buffAS(0.09, 2, 'adjacentAllies')] },
    ult: { verbs: [v.buffAS(0.25, 3, 'adjacentAllies')] } },
  // PASSIVE — Conduit: gains AP for each allied caster (mage/healer/summoner) on the board.
  court_mage: { name: 'Arcane Nuke', type: 'magic', target: 'cluster', radius: 1, ap: 220,
    verbs: [v.cluster({ radius: 1 })], passive: { on: 'spawn', verbs: [v.casterScale(16)] },
    ult: { verbs: [v.manaBurn(30)] } },
  // Suppressing Volley: fires at the FRONT cluster (nearest 4) and softens it with a slow.
  crossbowman: { name: 'Suppressing Volley', type: 'physical', target: 'mostEnemies', adRatio: 2.2,
    verbs: [{ op: 'phys', target: 'nearestN', count: 4, mult: 0.7, adRatio: 2.2 }, { op: 'slow', pct: 0.15, dur: 1.5, target: 'nearestN', count: 4 }],
    ult: { verbs: [v.slow(0.25, 2, 'mostEnemies')] } },
  // PASSIVE — Opening Strike: bonus damage on a strike into a still-healthy target (assassinate).
  royal_blade: { name: 'Regicide', type: 'physical', target: 'lowestEnemyHP', adRatio: 3.0,
    verbs: [v.exec({ adRatio: 3.0 })], passive: { on: 'hit', verbs: [v.bonusVs(0.8, 0.8)] },
    ult: { verbs: [{ op: 'recastOnKill', max: 1 }] } },
  // PASSIVE — Triage: when an ally falls, instantly burst-heals the two most wounded allies.
  field_medic: { name: 'Mend', type: 'heal', target: 'lowestAllyHP', ap: 200,
    verbs: [v.heal({ ap: 200 })], passive: { on: 'allyDeath', verbs: [{ op: 'heal', target: 'lowestNAllies', n: 2, ap: 160 }] },
    ult: { verbs: [v.cleanse('lowestAllyHP', 1.5)] } },

  // Undead
  // PURE PASSIVE — Bonewall: no cast; hardens every 3rd hit taken (shield) + reflects (thorns);
  // at 3★ also leeches life. The immovable object.
  bone_guard: { name: 'Bonewall', type: 'physical', noCast: true, verbs: [],
    passive: [{ on: 'attacked', every: 3, verbs: [v.shieldSelf(85)] },
      { on: 'spawn', verbs: [v.thorns(0.12, 999, 'self')], ult: [v.lifesteal(0.18, 999, 'self')] }] },
  lich: { name: 'Frost Nova', type: 'magic', target: 'cluster', radius: 1, ap: 320,
    verbs: [v.cluster({ radius: 1 }), v.slow(0.30, 2, 'cluster')],
    ult: { verbs: [v.shred('mr', 30, 4, 'cluster')] } },
  // PASSIVE — Splintering Bone: every 4th auto looses a free bonus bolt (swarm machine-gun).
  skeleton_archer: { name: 'Bone Volley', type: 'physical', target: 'mostEnemies', adRatio: 2.0,
    verbs: [v.volley({ adRatio: 2.0, onKill: [{ op: 'raise', max: 2 }] })],
    passive: { on: 'hit', every: 4, verbs: [v.magic({ ap: 140 })] },
    ult: { verbs: [{ op: 'enableOnKill' }] } },
  // PASSIVE — Spectral Drain: always leeches on autos; phases out (shield) once when low.
  wraith: { name: 'Soul Reap', type: 'physical', target: 'lowestEnemyHP', adRatio: 3.6,
    verbs: [v.exec({ adRatio: 3.6, drain: 0.40 })],
    passive: [{ on: 'spawn', verbs: [v.lifesteal(0.18, 999, 'self')] }, { on: 'lowHp', threshold: 0.35, verbs: [v.shieldSelf(500)] }],
    ult: { verbs: [{ op: 'enableOnKill' }], onKill: [v.resetAtk('self'), v.buffAS(0.4, 3, 'self')] } },
  // PASSIVE — Corpse Harvest: raises a Risen whenever an ally falls (budget 2/fight).
  necromancer: { name: 'Raise Dead', type: 'summon', summonHp: 950, summonAd: 115,
    verbs: [v.summon({ count: 2, hp: 950, ad: 115 })],
    passive: { on: 'allyDeath', verbs: [v.raiseCorpse(700, 95)] },
    ult: { verbs: [v.summon({ count: 1, hp: 950, ad: 115, statMult: 2 }), v.summon({ count: 1, hp: 950, ad: 115 })] } },

  // Elf
  thornguard: { name: 'Bramble Bash', type: 'physical', target: 'current', adRatio: 2.1, stun: 1.0,
    verbs: [v.phys({ adRatio: 2.1 }), v.stun(1.0), v.thorns(0.15, 3, 'self')],
    ult: { verbs: [v.knockup(1.25), v.taunt(1, 2)] } },
  moon_priestess: { name: 'Lunar Bolt', type: 'magic', target: 'current', ap: 560,
    verbs: [v.magic({ ap: 560 })], ult: { verbs: [v.chain({ count: 2, falloff: 0.6 })] } },
  // PURE PASSIVE — Marksman's Focus: no cast; locks one target and ramps escalating bonus damage
  // the longer it fires on it (resets on a new target); at 3★ the focus also shreds its armor.
  wood_ranger: { name: "Marksman's Focus", type: 'physical', noCast: true, verbs: [],
    passive: { on: 'hit', verbs: [v.focus(0.12, 6, 25)] } },
  // PASSIVE — Bladedance: a dodged attack powers up its next strikes (evasion → offence).
  shadow_dancer: { name: 'Shadow Step', type: 'physical', target: 'lowestEnemyHP', adRatio: 3.2,
    verbs: [v.exec({ adRatio: 3.2 })], passive: { on: 'dodge', verbs: [v.buffAS(0.15, 2, 'self')] },
    ult: { verbs: [v.dodge(0.40, 3, 'self'), v.buffAS(0.4, 3, 'self')] } },
  grove_healer: { name: 'Verdant Mend', type: 'heal', target: 'lowestAllyHP', ap: 260,
    verbs: [v.heal({ ap: 260 })],
    ult: { verbs: [v.heal({ ap: 130, target: 'adjacentAllies' }), v.regen(12, 3, 'lowestAllyHP')] } },
  // Ethereal summons: spirit_caller's base spirits already dodge (vs other summoners' solid bodies).
  spirit_caller: { name: 'Call Spirits', type: 'summon', summonHp: 950, summonAd: 115,
    verbs: [v.summon({ count: 2, hp: 950, ad: 115, dodge: 0.20 })],
    ult: { verbs: [v.summon({ count: 2, hp: 950, ad: 115, dodge: 0.30, slowAura: 0.15 })] } },

  // Demon
  // PASSIVE — Soul Tithe: each auto pays 2% own max HP to sear the target (can never self-kill).
  hellguard: { name: 'Fel Cleave', type: 'physical', target: 'cluster', radius: 1, adRatio: 1.9,
    verbs: [v.cleave({ adRatio: 1.9 })], passive: { on: 'hit', verbs: [v.sacrifice(0.015, 2.4)] },
    ult: { verbs: [v.manaBurn(25, 'cluster'), v.healCut(0.40, 3, 'cluster')] } },
  warlock: { name: 'Doom Bolt', type: 'magic', target: 'cluster', radius: 1, ap: 400,
    verbs: [v.cluster({ radius: 1 })], ult: { verbs: [v.dot(60, 3, 'cluster'), v.manaBurn(30)] } },
  // Caster-hunter: its volley targets the enemy's highest-mana units to deny their spells.
  fel_archer: { name: 'Searing Volley', type: 'physical', target: 'mostEnemies', adRatio: 2.3,
    verbs: [{ op: 'phys', target: 'mostMana', count: 4, mult: 0.7, adRatio: 2.3 }],
    ult: { verbs: [v.manaBurn(12, 'mostMana')] } },
  // PASSIVE — Cinder Chain: refunds mana on a kill to chain into the next victim.
  imp_assassin: { name: 'Backstab', type: 'physical', target: 'lowestEnemyHP', adRatio: 2.6,
    verbs: [v.exec({ adRatio: 2.6 })], passive: { on: 'kill', verbs: [v.gainManaSelf(40)] },
    ult: { verbs: [{ op: 'enableOnKill' }], onKill: [v.manaBurn(40, 'nearestN', 0), v.slow(0.30, 2, 'nearestN')], onKillN: 2 } },
  // Volatile spawn: pit_summoner's imps DETONATE for AoE magic when they die.
  pit_summoner: { name: 'Open the Pit', type: 'summon', summonHp: 950, summonAd: 115,
    verbs: [v.summon({ count: 2, hp: 950, ad: 115, explode: 140 })], ult: { verbs: [v.meteors({ n: 3, ap: 120, radius: 1 })] } },

  // Beast
  // PASSIVE — Hunter's Mark: marks the enemy CARRY (highest cost×star); the WHOLE team's autos
  // hit the mark harder. The only ranger that buffs allies.
  beast_hunter: { name: "Hunter's Volley", type: 'physical', target: 'mostEnemies', adRatio: 2.4,
    verbs: [v.volley({ adRatio: 2.4 })], passive: { on: 'spawn', verbs: [{ op: 'mark', mult: 1.15, dur: 999, target: 'highestValueEnemy' }] },
    ult: { verbs: [v.mark(1.4, 5, 'lowestEnemyHP')] } },
  bramble_brute: { name: 'Thorn Cleave', type: 'physical', target: 'cluster', radius: 1, adRatio: 2.4,
    verbs: [v.cleave({ adRatio: 2.4 }), v.knockback(1, 'cluster')],
    ult: { verbs: [v.rage(0.06, 0.9), v.thorns(0.25, 99, 'self')] } },
  // PASSIVE — Bloodscent: builds attack speed the longer it fights (beast frenzy).
  pack_stalker: { name: 'Pounce', type: 'physical', target: 'lowestEnemyHP', adRatio: 3.3,
    verbs: [v.exec({ adRatio: 3.3 })], passive: { on: 'spawn', verbs: [v.rageSelf(0.04, 0.6)] },
    ult: { verbs: [{ op: 'phys', target: 'clusterAtPrimary', radius: 1, adRatio: 3.3, mult: 0.6 }, { op: 'enableOnKill' }], onKill: [v.buffAS(0.3, 3, 'self')] } },
  druid_healer: { name: 'Wild Aegis', type: 'shield', target: 'lowestAllyHP', ap: 300,
    verbs: [v.shield({ ap: 300 })],
    ult: { verbs: [{ op: 'shield', target: 'lowestNAllies', n: 3, ap: 210 }, v.buffAS(0.2, 3, 'shielded')] } },
  // Enraged base pack: beastmaster's wolves already ramp attack speed (vs other summoners' bodies).
  beastmaster: { name: 'Summon Pack', type: 'summon', summonHp: 950, summonAd: 115,
    verbs: [v.summon({ count: 2, hp: 950, ad: 115, rage: 0.04 })],
    ult: { verbs: [v.summon({ count: 2, hp: 950, ad: 115, rage: 0.05, lifestealAura: 0.15 })] } },

  // Dragon (elite, expensive)
  // 3★ was a duplicate of Lich's Frost Nova (cluster magic + slow + MR-shred). Re-flavoured to a
  // frontline-dragon identity: the roar SHOVES the enemy line back and sears wounds shut (healCut).
  // PASSIVE — Dragonscale: soaks 15% of adjacent allies' incoming damage (the elite protector).
  dragon_knight: { name: 'Dragon Breath', type: 'magic', target: 'cluster', radius: 2, ap: 250,
    verbs: [v.cluster({ radius: 2 })], passive: { on: 'spawn', verbs: [v.guard(0.15)] },
    ult: { verbs: [v.knockback(1, 'cluster'), v.healCut(0.40, 3, 'cluster')] } },
  dragon_sage: { name: 'Cataclysm', type: 'magic', target: 'cluster', radius: 2, ap: 340,
    verbs: [v.cluster({ radius: 2 })], ult: { verbs: [v.meteors({ n: 4, ap: 100, radius: 1 }), v.manaBurn(25)] } },
  wyrm_archer: { name: 'Storm of Arrows', type: 'physical', target: 'mostEnemies', adRatio: 2.8,
    verbs: [v.volley({ adRatio: 2.8 })],
    ult: { verbs: [v.volley({ adRatio: 2.8, offset: 4 }), v.slow(0.20, 2, 'allEnemies')] } },
};

export const UNITS = [
  // ---- Human ----
  mk('knight_captain', 'Knight-Captain', 'human', 'knight', 1, A.knight_captain),
  mk('court_mage',     'Court Mage',     'human', 'mage',   2, A.court_mage),
  mk('crossbowman',    'Crossbowman',    'human', 'ranger', 1, A.crossbowman),
  mk('royal_blade',    'Royal Blade',    'human', 'assassin', 3, A.royal_blade),
  mk('field_medic',    'Field Medic',    'human', 'healer', 1, A.field_medic),

  // ---- Undead ----
  mk('bone_guard',     'Bone Guard',     'undead', 'knight', 1, A.bone_guard),
  mk('lich',           'Lich',           'undead', 'mage',   3, A.lich),
  mk('skeleton_archer','Skeleton Archer','undead', 'ranger', 1, A.skeleton_archer),
  mk('wraith',         'Wraith',         'undead', 'assassin', 4, A.wraith),
  mk('necromancer',    'Necromancer',    'undead', 'summoner', 5, A.necromancer),

  // ---- Elf ----
  mk('thornguard',     'Thornguard',     'elf', 'knight', 2, A.thornguard),
  mk('moon_priestess', 'Moon Priestess', 'elf', 'mage',   4, A.moon_priestess),
  mk('wood_ranger',    'Wood Ranger',    'elf', 'ranger', 1, A.wood_ranger),
  mk('shadow_dancer',  'Shadow Dancer',  'elf', 'assassin', 3, A.shadow_dancer),
  mk('grove_healer',   'Grove Healer',   'elf', 'healer', 2, A.grove_healer),
  mk('spirit_caller',  'Spirit Caller',  'elf', 'summoner', 3, A.spirit_caller),

  // ---- Demon ----
  mk('hellguard',      'Hellguard',      'demon', 'knight', 2, A.hellguard),
  mk('warlock',        'Warlock',        'demon', 'mage',   4, A.warlock),
  mk('fel_archer',     'Fel Archer',     'demon', 'ranger', 2, A.fel_archer),
  mk('imp_assassin',   'Imp Assassin',   'demon', 'assassin', 1, A.imp_assassin),
  mk('pit_summoner',   'Pit Summoner',   'demon', 'summoner', 5, A.pit_summoner),

  // ---- Beast ----
  mk('beast_hunter',   'Beast Hunter',   'beast', 'ranger', 2, A.beast_hunter),
  mk('bramble_brute',  'Bramble Brute',  'beast', 'knight', 4, A.bramble_brute),
  mk('pack_stalker',   'Pack Stalker',   'beast', 'assassin', 3, A.pack_stalker),
  mk('druid_healer',   'Druid Healer',   'beast', 'healer', 3, A.druid_healer),
  mk('beastmaster',    'Beastmaster',    'beast', 'summoner', 4, A.beastmaster),

  // ---- Dragon (elite, expensive) ----
  // Dragons are the premium 5-cost elites — strong even at 1★ (rarely reach 3★ in play), so
  // their base is bumped hard to stay board-warping against cheaper units whose 3★ ults now
  // fire. Only the Dragon comp fields ≥2 dragons, so these bumps don't distort other archetypes.
  mk('dragon_knight',  'Dragon Knight',  'dragon', 'knight', 5, A.dragon_knight, { hpx: 1.36, adx: 1.28 }),
  mk('dragon_sage',    'Dragon Sage',    'dragon', 'mage',   5, A.dragon_sage, { hpx: 1.30, adx: 1.24 }),
  mk('wyrm_archer',    'Wyrm Archer',    'dragon', 'ranger', 5, A.wyrm_archer, { hpx: 1.30, adx: 1.24 }),
];

export const UNITS_BY_ID = Object.fromEntries(UNITS.map((u) => [u.defId, u]));

// Star scaling: ~1.7x stats per star (HP + AD). Ability scaling follows AD/AP ratios.
export const STAR_MULT = { 1: 1, 2: 1.7, 3: 1.7 * 1.7 };

export function statsForStar(def, star) {
  const m = STAR_MULT[star] || 1;
  return {
    ...def,
    star,
    hp: Math.round(def.hp * m),
    ad: Math.round(def.ad * m),
    // armor/mr/as/range/mana unchanged by star (TFT convention: HP+AD scale, utility doesn't)
  };
}

// Roster counts by cost (sanity / pool sizing).
export const COST_COUNTS = UNITS.reduce((a, u) => ((a[u.cost] = (a[u.cost] || 0) + 1), a), {});
