// Champion roster (35 units) across a 7 Origins × 7 Classes matrix that is DELIBERATELY PARTIAL:
// each origin fields only a thematic subset of classes (no origin has them all), so the race you
// commit to defines how your board plays. Stats are 1-star base values, cost-scaled, then
// role-adjusted. Ability is data the combat sim's ability handlers read (sim/rules.js). These are
// STARTING numbers — the headless autobalancer (sim/autobalance.js) will tune the outliers.
//
// ORIGIN → CLASS palette (— = deliberately empty, off-theme for that race):
//   Human   knight mage ranger  --     healer summoner --        (disciplined, supportive)
//   Undead  knight mage ranger  assassin --   summoner paladin   (the grave: skeletons→death knight)
//   Elf     --     mage ranger  assassin healer --      --        (fey grace — no armour, no brutes)
//   Demon   knight mage ranger  assassin --   summoner paladin   (relentless aggression + oathbreaker)
//   Beast   knight --   ranger  assassin healer summoner --       (the Wilds — no casters, no holy)
//   Dragon  knight mage ranger  --     --     --       paladin   (elite 5-cost capstones)
//   Orc     knight mage ranger  assassin --   --       --        (the Warhorde — savage Bloodlust)

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
    ult: { verbs: [v.buffAS(0.30, 4, 'allies')] } },
  // PASSIVE — Conduit: gains AP for each allied caster (mage/healer/summoner) on the board.
  // Mage c2 — the BASELINE burst caster: a clean radius-1 nuke. (Entry-level: smallest mage spell.)
  court_mage: { name: 'Arcane Nuke', type: 'magic', target: 'cluster', radius: 1, ap: 220,
    blurb: 'Blasts {v} magic damage to a knot of nearby foes.',
    verbs: [v.cluster({ radius: 1 })], passive: { on: 'spawn', verbs: [v.casterScale(16)] },
    ult: { verbs: [v.manaBurn(30), { op: 'magic', target: 'cluster', radius: 2, ap: 160 }] } },
  // Suppressing Volley: fires at the FRONT cluster (nearest 4) and softens it with a slow.
  crossbowman: { name: 'Suppressing Volley', type: 'physical', target: 'mostEnemies', adRatio: 2.2,
    verbs: [{ op: 'phys', target: 'nearestN', count: 4, mult: 0.7, adRatio: 2.2 }, { op: 'slow', pct: 0.15, dur: 1.5, target: 'nearestN', count: 4 }],
    ult: { verbs: [v.slow(0.25, 2, 'mostEnemies'), v.volley({ adRatio: 2.2, offset: 4 })] } },
  // PASSIVE — Triage: when an ally falls, instantly burst-heals the two most wounded allies.
  field_medic: { name: 'Mend', type: 'heal', target: 'lowestAllyHP', ap: 200,
    verbs: [v.heal({ ap: 200 })], passive: { on: 'allyDeath', verbs: [{ op: 'heal', target: 'lowestNAllies', n: 2, ap: 160 }] },
    ult: { verbs: [v.cleanse('lowestAllyHP', 1.5), { op: 'heal', target: 'lowestNAllies', n: 3, ap: 200 }] } },

  // Undead
  // PURE PASSIVE — Bonewall: no cast; hardens every 3rd hit taken (shield) + reflects (thorns);
  // at 3★ also leeches life. The immovable object.
  bone_guard: { name: 'Bonewall', type: 'physical', noCast: true, verbs: [],
    passive: [{ on: 'attacked', every: 3, verbs: [v.shieldSelf(85)] },
      { on: 'spawn', verbs: [v.thorns(0.12, 999, 'self')], ult: [v.lifesteal(0.18, 999, 'self')] }] },
  // Mage c3 — the CONTROL caster: a chilling burst that cripples attack speed; at 3★ it FREEZES
  // the whole cluster solid (stun) and shreds their magic resist — a lockdown spike.
  lich: { name: 'Frost Nova', type: 'magic', target: 'cluster', radius: 1, ap: 300,
    blurb: 'Erupts for {v} frost damage and chills nearby foes (−35% attack speed for 2s).',
    verbs: [v.cluster({ radius: 1 }), v.slow(0.35, 2, 'cluster')],
    ult: { verbs: [v.stun(1, 'cluster'), v.shred('mr', 30, 4, 'cluster')] } },
  // PASSIVE — Splintering Bone: every 4th auto looses a free bonus bolt (swarm machine-gun).
  skeleton_archer: { name: 'Bone Volley', type: 'physical', target: 'mostEnemies', adRatio: 2.0,
    verbs: [v.volley({ adRatio: 2.0, onKill: [{ op: 'raise', max: 2 }] })],
    passive: { on: 'hit', every: 4, verbs: [v.magic({ ap: 140 })] },
    ult: { verbs: [{ op: 'enableOnKill' }, v.volley({ adRatio: 2.0, offset: 4 })] } },
  // PASSIVE — Spectral Drain: always leeches on autos; phases out (shield) once when low.
  wraith: { name: 'Soul Reap', type: 'physical', target: 'lowestEnemyHP', adRatio: 3.6,
    verbs: [v.exec({ adRatio: 3.6, drain: 0.40 })],
    passive: [{ on: 'spawn', verbs: [v.lifesteal(0.18, 999, 'self')] }, { on: 'lowHp', threshold: 0.35, verbs: [v.shieldSelf(500)] }],
    ult: { verbs: [{ op: 'enableOnKill' }], onKill: [v.resetAtk('self'), v.buffAS(0.4, 3, 'self')] } },
  // PASSIVE — Corpse Harvest: raises a Risen whenever an ally falls (budget 2/fight).
  // Risen: bony bruiser — tanky, slow, standard melee.
  necromancer: { name: 'Raise Dead', type: 'summon', summonHp: 950, summonAd: 115,
    verbs: [v.summon({ kind: 'risen', count: 2, hp: 1040, ad: 108, armor: 22 })],
    passive: { on: 'allyDeath', verbs: [v.raiseCorpse(700, 95)] },
    ult: { verbs: [v.summon({ kind: 'risen', count: 1, hp: 1040, ad: 108, armor: 22, statMult: 2 }), v.summon({ kind: 'risen', count: 1, hp: 1040, ad: 108, armor: 22 })] } },
  // Undead-PALADIN (death knight): an unholy smite that leeches — a fallen oath that will not die.
  death_knight: { name: 'Unholy Smite', type: 'physical', target: 'current', adRatio: 2.7, ap: 240,
    verbs: [v.phys({ adRatio: 2.7 }), v.magic({ ap: 240 }), v.lifesteal(0.22, 4, 'self')],
    passive: { on: 'spawn', verbs: [v.thorns(0.10, 999, 'self')] },
    ult: { verbs: [v.healCut(0.40, 3, 'current'), v.buffAS(0.3, 4, 'self'), v.lifesteal(0.30, 4, 'self')] } },

  // Elf
  // Mage c4 — the ASSASSIN caster: a precision bolt that ignores position and snipes the enemy's
  // strongest unit (their carry) for huge single-target burst; at 3★ it splinters and chains.
  moon_priestess: { name: 'Lunar Bolt', type: 'magic', target: 'highestValueEnemy', ap: 620,
    blurb: 'Snipes the enemy’s strongest unit for {v} magic damage, wherever it stands.',
    verbs: [v.magic({ target: 'highestValueEnemy' })], ult: { verbs: [v.chain({ count: 2, falloff: 0.6 })] } },
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

  // Demon
  // PASSIVE — Soul Tithe: each auto pays 2% own max HP to sear the target (can never self-kill).
  hellguard: { name: 'Fel Cleave', type: 'physical', target: 'cluster', radius: 1, adRatio: 1.9,
    verbs: [v.cleave({ adRatio: 1.9 })], passive: { on: 'hit', verbs: [v.sacrifice(0.015, 2.4)] },
    ult: { verbs: [v.manaBurn(25, 'cluster'), v.healCut(0.40, 3, 'cluster')] } },
  // Mage c4 — the CURSE caster: little upfront, but rots a cluster with damage-over-time AND cuts
  // their healing 40% (the anti-sustain answer to healer comps); at 3★ the curse deepens + mana-burns.
  warlock: { name: 'Curse of Doom', type: 'magic', target: 'cluster', radius: 1, ap: 230,
    blurb: 'Curses nearby foes: {v} now, then 75/s for 3s, and cuts their healing 40%.',
    verbs: [v.cluster({ radius: 1 }), v.dot(75, 3, 'cluster'), v.healCut(0.40, 4, 'cluster')],
    ult: { verbs: [v.dot(120, 3, 'cluster'), v.manaBurn(30, 'cluster')] } },
  // Caster-hunter: its volley targets the enemy's highest-mana units to deny their spells.
  fel_archer: { name: 'Searing Volley', type: 'physical', target: 'mostEnemies', adRatio: 2.3,
    verbs: [{ op: 'phys', target: 'mostMana', count: 4, mult: 0.7, adRatio: 2.3 }],
    ult: { verbs: [v.manaBurn(30, 'mostMana'), v.slow(0.25, 2, 'mostMana')] } },
  // PASSIVE — Cinder Chain: refunds mana on a kill to chain into the next victim.
  imp_assassin: { name: 'Backstab', type: 'physical', target: 'lowestEnemyHP', adRatio: 2.6,
    verbs: [v.exec({ adRatio: 2.6 })], passive: { on: 'kill', verbs: [v.gainManaSelf(40)] },
    ult: { verbs: [{ op: 'enableOnKill' }], onKill: [v.manaBurn(40, 'nearestN', 0), v.slow(0.30, 2, 'nearestN')], onKillN: 2 } },
  // Imp: volatile glass-cannon — frail, but DETONATES for AoE magic on death.
  pit_summoner: { name: 'Open the Pit', type: 'summon', summonHp: 950, summonAd: 115,
    verbs: [v.summon({ kind: 'imp', count: 2, hp: 720, ad: 96, armor: 8, explode: 160 })], ult: { verbs: [v.meteors({ n: 3, ap: 120, radius: 1 })] } },
  // Demon-PALADIN (oathbreaker): a corrupted smite that burns the target's mana as it sears.
  oathbreaker: { name: 'Fel Smite', type: 'physical', target: 'current', adRatio: 2.3,
    verbs: [v.phys({ adRatio: 2.3 }), v.magic({ ap: 190 }), v.manaBurn(18)],
    ult: { verbs: [v.healCut(0.35, 3, 'current'), v.dot(45, 3, 'current')] } },

  // Beast (the Wilds)
  // PASSIVE — Hunter's Mark: marks the enemy CARRY (highest cost×star); the WHOLE team's autos
  // hit the mark harder. The only beast ranger that buffs allies.
  beast_hunter: { name: 'Quill Volley', type: 'physical', target: 'mostEnemies', adRatio: 2.4,
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
  // Wolf: fast feral skirmisher — quick attacks that ramp (rage), but squishier than other summons.
  beastmaster: { name: 'Summon Pack', type: 'summon', summonHp: 950, summonAd: 115,
    verbs: [v.summon({ kind: 'wolf', count: 2, hp: 770, ad: 122, as: 0.92, armor: 10, rage: 0.04 })],
    ult: { verbs: [v.summon({ kind: 'wolf', count: 2, hp: 770, ad: 122, as: 0.92, armor: 10, rage: 0.05, lifestealAura: 0.15 })] } },

  // Dragon (elite, expensive)
  // PASSIVE — Dragonscale: soaks 15% of adjacent allies' incoming damage (the elite protector).
  dragon_knight: { name: 'Dragon Breath', type: 'magic', target: 'cluster', radius: 2, ap: 250,
    verbs: [v.cluster({ radius: 2 })], passive: { on: 'spawn', verbs: [v.guard(0.15)] },
    ult: { verbs: [v.knockback(1, 'cluster'), v.healCut(0.40, 3, 'cluster')] } },
  // Mage c5 — the APEX caster (elite 5-cost): the single strongest spell — a WIDE radius-2 blast
  // AND a meteor storm baked into the base; at 3★ even more meteors, mana-burn, and a shockwave.
  dragon_sage: { name: 'Cataclysm', type: 'magic', target: 'cluster', radius: 2, ap: 360,
    blurb: 'Rains ruin: {v} across a wide blast, plus 3 meteors (120 magic each).',
    verbs: [v.cluster({ radius: 2 }), v.meteors({ n: 3, ap: 120, radius: 1 })],
    ult: { verbs: [v.meteors({ n: 5, ap: 130, radius: 1 }), v.manaBurn(25, 'cluster'), v.knockback(1, 'cluster')] } },
  // Dragon-RANGER: a fire-breathing skywyrm — its "volley" is a storm of cinders, not arrows.
  wyrm_archer: { name: 'Storm of Cinders', type: 'physical', target: 'mostEnemies', adRatio: 2.8,
    verbs: [v.volley({ adRatio: 2.8 })],
    ult: { verbs: [v.volley({ adRatio: 2.8, offset: 4 }), v.slow(0.20, 2, 'allEnemies')] } },
  // Dragon-PALADIN (elite capstone): the Wyrmguard — wards the whole warband and smites a cluster.
  wyrmguard: { name: 'Aegis of the Wyrm', type: 'shield', target: 'allies', ap: 160,
    verbs: [{ op: 'shield', target: 'allies', ap: 160 }, v.cluster({ radius: 1 })],
    ult: { verbs: [v.regen(12, 4, 'allies'), v.knockback(1, 'cluster')] } },

  // ── Bridge champion: Human-SUMMONER — disciplined ranks + a mana engine. PASSIVE — Rally: every
  // muster also shields the soldiers beside the banner. 3★ ult: conscripts a heavy footman.
  // Soldier: armoured line-holder — sturdy, well-armoured, marches in with a shield up; low damage.
  banner_sergeant: { name: 'Muster the Ranks', type: 'summon', summonHp: 950, summonAd: 115,
    verbs: [v.summon({ kind: 'soldier', count: 2, hp: 1080, ad: 104, armor: 28, shieldStart: 240 })], passive: { on: 'cast', verbs: [v.shield({ target: 'adjacentAllies', ap: 150 })] },
    ult: { verbs: [v.summon({ kind: 'soldier', count: 1, hp: 1080, ad: 104, armor: 28, shieldStart: 240, statMult: 2 })] } },

  // ── Orc (NEW origin — the Warhorde: savage warriors who feed on slaughter (Bloodlust trait =
  // ramping attack speed + lifesteal for the whole warband). No healers, no holy, no summons. ──
  // Orc-ASSASSIN: a frenzied berserker that snowballs its OWN attack speed the longer it fights.
  berserker: { name: 'Headsplitter', type: 'physical', target: 'lowestEnemyHP', adRatio: 3.2,
    verbs: [v.exec({ adRatio: 3.2 })], passive: { on: 'spawn', verbs: [v.rageSelf(0.05, 0.7)] },
    ult: { verbs: [{ op: 'enableOnKill' }], onKill: [v.buffAS(0.35, 3, 'self'), v.lifesteal(0.25, 3, 'self')] } },
  // Orc-KNIGHT: a brutish grunt — a bashing wall that shrugs blows back.
  orc_grunt: { name: 'Brutal Bash', type: 'physical', target: 'current', adRatio: 2.0, stun: 0.9,
    verbs: [v.phys({ adRatio: 2.0 }), v.stun(0.9), v.shieldSelf(60)],
    ult: { verbs: [v.knockback(1), v.thorns(0.30, 6, 'self'), v.taunt(1, 1.5)] } },
  // Orc-MAGE (Mage c3) — the BOUNCE caster: a lightning bolt that leaps from foe to foe (strong vs
  // spread-out boards, unlike a fixed AoE); at 3★ it forks a second, farther storm and slows the team.
  orc_shaman: { name: 'Chain Lightning', type: 'magic', target: 'current', ap: 250,
    blurb: 'Looses lightning — {v} to the first foe, arcing to 2 more (×0.6 each jump).',
    verbs: [v.chain({ count: 2, falloff: 0.6 })],
    ult: { verbs: [v.chain({ count: 3, falloff: 0.7 }), v.slow(0.22, 2, 'allEnemies')] } },
  // Orc-RANGER: hurls a spread of cleaving axes across the front line.
  axethrower: { name: 'Cleaving Axes', type: 'physical', target: 'mostEnemies', adRatio: 2.6,
    verbs: [v.volley({ adRatio: 2.6 })],
    ult: { verbs: [v.volley({ adRatio: 2.6, offset: 4 }), v.slow(0.20, 2, 'mostEnemies')] } },
  // Orc-KNIGHT (capstone): the Warboss — a brutal cleave that buries and roots the enemy cluster.
  warboss: { name: "Warlord's Cleave", type: 'physical', target: 'cluster', radius: 1, adRatio: 2.5,
    verbs: [v.cleave({ adRatio: 2.5 }), v.knockback(1, 'cluster'), v.stun(0.8, 'cluster')],
    ult: { verbs: [v.taunt(2, 2.5), v.shieldSelf(420)] } },
};

export const UNITS = [
  // ---- Human (knight · mage · ranger · healer · summoner) ----
  mk('knight_captain', 'Knight-Captain', 'human', 'knight', 1, A.knight_captain),
  mk('court_mage',     'Court Mage',     'human', 'mage',   2, A.court_mage),
  mk('crossbowman',    'Crossbowman',    'human', 'ranger', 1, A.crossbowman),
  mk('field_medic',    'Field Medic',    'human', 'healer', 1, A.field_medic),
  mk('banner_sergeant','Banner Sergeant','human', 'summoner', 3, A.banner_sergeant),

  // ---- Undead (knight · mage · ranger · assassin · summoner) ----
  mk('bone_guard',     'Bone Guard',     'undead', 'knight', 1, A.bone_guard),
  mk('lich',           'Lich',           'undead', 'mage',   3, A.lich),
  mk('skeleton_archer','Skeleton Archer','undead', 'ranger', 1, A.skeleton_archer),
  mk('wraith',         'Wraith',         'undead', 'assassin', 4, A.wraith),
  mk('necromancer',    'Necromancer',    'undead', 'summoner', 5, A.necromancer),
  mk('death_knight',   'Death Knight',   'undead', 'knight', 4, A.death_knight, { hpx: 0.90, adx: 1.04 }),

  // ---- Elf (mage · ranger · assassin · healer) ----
  mk('moon_priestess', 'Moon Priestess', 'elf', 'mage',   4, A.moon_priestess),
  mk('wood_ranger',    'Wood Ranger',    'elf', 'ranger', 1, A.wood_ranger),
  mk('shadow_dancer',  'Shadow Dancer',  'elf', 'assassin', 3, A.shadow_dancer),
  mk('grove_healer',   'Grove Healer',   'elf', 'healer', 2, A.grove_healer),

  // ---- Demon (knight · mage · ranger · assassin · summoner) ----
  mk('hellguard',      'Hellguard',      'demon', 'knight', 2, A.hellguard),
  mk('warlock',        'Warlock',        'demon', 'mage',   4, A.warlock),
  mk('fel_archer',     'Fel Archer',     'demon', 'ranger', 2, A.fel_archer),
  mk('imp_assassin',   'Imp Assassin',   'demon', 'assassin', 1, A.imp_assassin),
  mk('pit_summoner',   'Pit Summoner',   'demon', 'summoner', 5, A.pit_summoner),
  mk('oathbreaker',    'Oathbreaker',    'demon', 'knight', 2, A.oathbreaker, { hpx: 0.90, adx: 1.04 }),

  // ---- Beast / the Wilds (knight · ranger · assassin · healer · summoner) ----
  mk('beast_hunter',   'Quillback',      'beast', 'ranger', 2, A.beast_hunter),
  mk('bramble_brute',  'Bramble Brute',  'beast', 'knight', 4, A.bramble_brute),
  mk('pack_stalker',   'Pack Stalker',   'beast', 'assassin', 3, A.pack_stalker),
  mk('druid_healer',   'Druid Healer',   'beast', 'healer', 3, A.druid_healer),
  mk('beastmaster',    'Beastmaster',    'beast', 'summoner', 4, A.beastmaster),

  // ---- Dragon (elite, expensive — knight · mage · ranger) ----
  // Dragons are the premium 5-cost elites — strong even at 1★ (rarely reach 3★ in play), so
  // their base is bumped hard to stay board-warping against cheaper units whose 3★ ults now
  // fire. Only the Dragon comp fields ≥2 dragons, so these bumps don't distort other archetypes.
  mk('dragon_knight',  'Dragon Knight',  'dragon', 'knight', 5, A.dragon_knight, { hpx: 1.36, adx: 1.28 }),
  mk('dragon_sage',    'Dragon Sage',    'dragon', 'mage',   5, A.dragon_sage, { hpx: 1.30, adx: 1.24 }),
  mk('wyrm_archer',    'Stormwyrm',      'dragon', 'ranger', 5, A.wyrm_archer, { hpx: 1.30, adx: 1.24 }),
  mk('wyrmguard',      'Wyrmguard',      'dragon', 'knight', 5, A.wyrmguard, { hpx: 1.17, adx: 1.22 }),

  // ---- Orc / the Warhorde (knight · mage · ranger · assassin) ----
  mk('berserker',   'Blood Berserker', 'orc', 'assassin', 1, A.berserker),
  mk('orc_grunt',   'Orc Grunt',       'orc', 'knight',   2, A.orc_grunt),
  mk('orc_shaman',  'Orc Shaman',      'orc', 'mage',     3, A.orc_shaman),
  mk('axethrower',  'Axethrower',      'orc', 'ranger',   4, A.axethrower),
  mk('warboss',     'Warboss',         'orc', 'knight',   5, A.warboss, { hpx: 1.30, adx: 1.20 }),
];

// Plain-language description of each champion's 3★ ULTIMATE upgrade — the qualitative
// force-multiplier the engine adds when star===3 (verbs.concat(ult.verbs); 3★-gated passives;
// wood_ranger's focus shred). Kept in sync with the `ult` data above and ABILITIES_SPEC.md.
export const ULT3 = {
  knight_captain: 'Rallies the WHOLE warband — +30% Attack Speed for 4s.',
  court_mage: 'Burns 30 mana AND detonates a second, wider arcane blast (160).',
  crossbowman: 'All targets hit are slowed 25%, and it looses a second volley into the back line.',
  field_medic: 'Cleanses + 1.5s CC immunity, and surges a 200 heal across the 3 most-wounded allies.',
  bone_guard: 'Also leeches 18% of its attack damage as health.',
  lich: 'FREEZES the whole cluster solid for 1s and shreds 30 Magic Resist for 4s.',
  skeleton_archer: 'Kills raise a Risen, and it looses a SECOND volley at the back line.',
  wraith: 'On a kill, resets its attack and gains +40% Attack Speed for 3s.',
  necromancer: 'Also raises a greater wight with double stats.',
  death_knight: 'Cuts healing 40%, and the Death Knight gains +30% Attack Speed AND 30% lifesteal for 4s — nearly unkillable.',
  moon_priestess: 'The bolt splinters off the carry, chaining to 2 more foes (×0.6 each).',
  wood_ranger: 'Its locked-on focus also shreds the target’s Armor by 25.',
  shadow_dancer: 'After striking, gains +40% dodge and +40% Attack Speed for 3s.',
  grove_healer: 'Heal splashes 50% to adjacent allies and adds 12 HP/s regen for 3s.',
  hellguard: 'Also burns 25 mana and cuts healing 40% on all hit for 3s.',
  warlock: 'Deepens the curse to 120/s for 3s and burns 30 mana from all cursed foes.',
  fel_archer: 'Each volley burns 30 mana and slows the enemy casters 25% — total cast lockdown.',
  imp_assassin: 'On a kill, burns 40 mana and slows the 2 nearest foes 30%.',
  pit_summoner: 'Also calls 3 meteors (120 magic each) on random foes.',
  oathbreaker: 'The smite cuts the target’s healing 35% and adds a 45/s burn for 3s.',
  beast_hunter: 'Also marks the lowest-HP foe so the team hits it 40% harder.',
  bramble_brute: 'Gains ramping Attack Speed and +25% thorns.',
  pack_stalker: 'Hits everything next to its target (×0.6); kills grant +30% AS.',
  druid_healer: 'Shields the 3 most-wounded allies; shielded allies gain +20% AS.',
  beastmaster: 'Summons stronger wolves with a 15% lifesteal aura.',
  dragon_knight: 'The breath shoves foes back 1 cell and cuts their healing 40% for 3s.',
  dragon_sage: 'Calls 5 MORE meteors (130 each), burns 25 mana, and hurls the cluster back.',
  wyrm_archer: 'Looses a second cinder-storm and slows the entire enemy team 20%.',
  wyrmguard: 'The aegis also pours 12 HP/s regen for 4s and the smite knocks the cluster back.',
  banner_sergeant: 'Also conscripts a heavy footman with double stats.',
  berserker: 'On a kill, gains +35% Attack Speed and 25% lifesteal for 3s.',
  orc_grunt: 'Knocks the foe back, wreathes itself in heavy thorns, and taunts adjacent foes.',
  orc_shaman: 'The lightning forks to 2 more foes (×0.6 each).',
  axethrower: 'Looses a second axe-spread and slows all targets hit 20%.',
  warboss: 'Taunts all foes within 2 cells for 2.5s and gains a 420 shield.',
};

import { CREATURES, CREEPS } from './creatures.js';
// UNITS_BY_ID includes boss creatures for COMBAT/render lookup only. The player economy (pool,
// shop, draft, Codex) iterates the UNITS array, which excludes creatures — so bosses never appear
// as buyable/draftable units.
export const UNITS_BY_ID = Object.assign(Object.fromEntries(UNITS.map((u) => [u.defId, u])), CREATURES, CREEPS);

// The recruitable races, in roster order. One of these sits out each run (Auto-Chess-style
// rotation) — see freshRun(). Derived from the roster so it never drifts from the actual units.
export const ORIGINS = [...new Set(UNITS.map((u) => u.origin))];

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
