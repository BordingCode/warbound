// Boss CREATURES for "The Trials" mode — unique monsters, NOT player champions. They live in a
// separate registry (merged into UNITS_BY_ID for combat lookup only) so they never appear in the
// shop, pool, draft, or Codex. Each is a single big unit with high stats + a signature mechanic
// built from the SAME verb/passive engine the champions use (sim/combat.js). origin/klass are
// 'boss' (not real TRAITS keys → grant no synergies). `shape`+`accent` drive the art (svg.js).

function boss(defId, name, shape, accent, stats, ability) {
  return {
    defId, name, shape, accent, creature: true,
    origin: 'boss', klass: 'boss', cost: stats.cost || 6,
    range: stats.range || 1, hp: stats.hp, ad: stats.ad, as: stats.as || 0.6,
    armor: stats.armor || 30, mr: stats.mr || 30,
    maxMana: stats.maxMana || 90, startMana: stats.startMana || 25, manaPer: stats.manaPer || 7,
    dive: false, ability,
  };
}

export const CREATURES_LIST = [
  // 1 — GLOOM SLIME: tanky ooze; spits corrosive AoE; SPLITS into two lesser slimes when wounded.
  boss('gloom_slime', 'Gloom Slime', 'slime', '#7dff9e',
    { hp: 13000, ad: 150, as: 0.6, armor: 30, mr: 30, range: 1, maxMana: 70, startMana: 25, manaPer: 9 },
    { name: 'Corrosive Spit', type: 'magic', target: 'cluster', ap: 320,
      verbs: [{ op: 'magic', target: 'cluster', radius: 1, ap: 320 }, { op: 'dot', dps: 120, dur: 3, target: 'cluster' }],
      passive: { on: 'lowHp', threshold: 0.5, verbs: [{ op: 'summon', count: 2, hp: 2600, ad: 110 }] } }),

  // 2 — STONE GOLEM: walls of armor (Stoneform); seismic slam stuns; reflects with thorns.
  boss('stone_golem', 'Stone Golem', 'golem', '#c8a878',
    { hp: 19000, ad: 230, as: 0.5, armor: 90, mr: 50, range: 1, maxMana: 80, manaPer: 8 },
    { name: 'Seismic Slam', type: 'physical', target: 'cluster', adRatio: 2.6,
      verbs: [{ op: 'phys', target: 'cluster', radius: 1, adRatio: 2.6 }, { op: 'stun', dur: 1.2, target: 'cluster' }],
      passive: { on: 'spawn', verbs: [{ op: 'thorns', amount: 0.45, dur: 999, target: 'self' }] } }),

  // 3 — WRAITH LORD: drains life; phases (dodge) when low; harvests souls into spectres.
  boss('wraith_lord', 'Wraith Lord', 'wraith', '#b9c4ff',
    { hp: 18000, ad: 190, as: 0.78, armor: 35, mr: 60, range: 2, maxMana: 70, startMana: 30, manaPer: 9 },
    { name: 'Soul Drain', type: 'magic', target: 'mostEnemies', ap: 420,
      verbs: [{ op: 'magic', target: 'mostEnemies', count: 3, ap: 420 }, { op: 'lifesteal', pct: 0.6, dur: 4, target: 'self' }],
      passive: [{ on: 'hit', every: 3, verbs: [{ op: 'summon', count: 1, hp: 2200, ad: 130, dodge: 0.25 }] },
                { on: 'lowHp', threshold: 0.4, verbs: [{ op: 'dodge', amount: 0.45, dur: 5, target: 'self' }] }] }),

  // 4 — BONE HYDRA: many heads bite the whole front line; REGROWS (summons) when half-dead.
  boss('bone_hydra', 'Bone Hydra', 'hydra', '#e8e2cf',
    { hp: 18000, ad: 205, as: 0.7, armor: 42, mr: 38, range: 2, maxMana: 60, startMana: 25, manaPer: 10 },
    { name: 'Triple Bite', type: 'physical', target: 'mostEnemies', adRatio: 2.2,
      verbs: [{ op: 'phys', target: 'nearestN', count: 4, mult: 1.0, adRatio: 2.2 }, { op: 'shred', stat: 'armor', amount: 25, dur: 4, target: 'nearestN', count: 4 }],
      passive: { on: 'lowHp', threshold: 0.55, verbs: [{ op: 'summon', count: 2, hp: 3400, ad: 150 }] } }),

  // 5 — EMBER WYRM: breathes fire across your back line; ENRAGES below half HP.
  boss('ember_wyrm', 'Ember Wyrm', 'wyrm', '#ff6a3c',
    { hp: 22000, ad: 230, as: 0.7, armor: 44, mr: 44, range: 3, maxMana: 80, startMana: 25, manaPer: 8 },
    { name: 'Inferno Breath', type: 'magic', target: 'mostEnemies', ap: 300,
      verbs: [{ op: 'magic', target: 'mostEnemies', count: 4, ap: 300 }, { op: 'dot', dps: 75, dur: 3, target: 'mostEnemies', count: 4 }],
      passive: { on: 'lowHp', threshold: 0.5, verbs: [{ op: 'buffAS', amount: 0.65, dur: 99, target: 'self' }, { op: 'meteors', n: 4, ap: 180, radius: 1 }] } }),

  // 6 — VENOM BROODMOTHER: sprays corroding venom over a cluster; HATCHES a brood of spiderlings
  //      when wounded. Sustained poison punishes a clumped board.
  boss('venom_broodmother', 'Venom Broodmother', 'spider', '#b6ff5a',
    { hp: 24000, ad: 200, as: 0.75, armor: 40, mr: 40, range: 2, maxMana: 75, startMana: 25, manaPer: 9 },
    { name: 'Venom Spray', type: 'magic', target: 'mostEnemies', ap: 300,
      verbs: [{ op: 'magic', target: 'mostEnemies', count: 4, ap: 300 }, { op: 'dot', dps: 110, dur: 3, target: 'mostEnemies', count: 4 }, { op: 'slow', pct: 0.25, dur: 2, target: 'mostEnemies', count: 4 }],
      passive: { on: 'lowHp', threshold: 0.55, verbs: [{ op: 'summon', count: 3, hp: 2400, ad: 120 }] } }),

  // 7 — ELDER TREANT: an immovable ancient — entangling roots STUN your front line, it reflects
  //      heavy thorns and slowly knits its bark back together (regen). Out-damage the heal.
  boss('elder_treant', 'Elder Treant', 'treant', '#7bbf63',
    { hp: 34000, ad: 240, as: 0.5, armor: 70, mr: 50, range: 1, maxMana: 80, startMana: 20, manaPer: 8 },
    { name: 'Entangling Roots', type: 'physical', target: 'cluster', adRatio: 2.4,
      verbs: [{ op: 'phys', target: 'cluster', radius: 1, adRatio: 2.4 }, { op: 'stun', dur: 1.4, target: 'cluster' }],
      passive: [{ on: 'spawn', verbs: [{ op: 'thorns', amount: 0.5, dur: 999, target: 'self' }] },
                { on: 'spawn', verbs: [{ op: 'regen', perSec: 240, dur: 999, target: 'self' }] }] }),

  // 8 — FROST MONARCH: a glacial nova FREEZES (deep slow) and shreds resist across the board; it
  //      armours up behind a vast shield and quickens as the ice spreads. Burst it before it walls.
  boss('frost_monarch', 'Frost Monarch', 'frost', '#8fdcff',
    { hp: 28000, ad: 210, as: 0.7, armor: 50, mr: 60, range: 3, maxMana: 80, startMana: 25, manaPer: 8 },
    { name: 'Glacial Nova', type: 'magic', target: 'cluster', ap: 360,
      verbs: [{ op: 'magic', target: 'cluster', radius: 2, ap: 360 }, { op: 'slow', pct: 0.4, dur: 2.5, target: 'cluster' }, { op: 'shred', stat: 'mr', amount: 30, dur: 4, target: 'cluster' }],
      passive: { on: 'lowHp', threshold: 0.5, verbs: [{ op: 'shield', target: 'self', amount: 6000 }, { op: 'buffAS', amount: 0.45, dur: 99, target: 'self' }] } }),

  // 9 — THE VOID MAW (FINAL): unmaking incarnate — drains and burns the team's mana, sears them
  //      with void-rot, then below half phases out (dodge) and rains meteors while clawing reality
  //      open for void-spawn. The hardest wall in the gauntlet.
  boss('void_maw', 'The Void Maw', 'void', '#c77bff',
    { hp: 36000, ad: 250, as: 0.8, armor: 55, mr: 55, range: 2, maxMana: 70, startMana: 30, manaPer: 9 },
    { name: 'Unmaking', type: 'magic', target: 'mostEnemies', ap: 360,
      verbs: [{ op: 'magic', target: 'mostEnemies', count: 5, ap: 360 }, { op: 'manaBurn', amount: 35, target: 'mostEnemies', count: 5 }, { op: 'dot', dps: 90, dur: 3, target: 'mostEnemies', count: 5 }],
      passive: { on: 'lowHp', threshold: 0.5, verbs: [{ op: 'dodge', amount: 0.4, dur: 6, target: 'self' }, { op: 'meteors', n: 5, ap: 200, radius: 1 }, { op: 'summon', count: 2, hp: 3200, ad: 160 }] } }),

  // 10 — ABYSSAL KRAKEN: a deep-sea horror — a maelstrom crushes a wide cluster and DROWNS them
  //       (heal-cut + knockback), and it hatches grasping tentacle-spawn when wounded. New element
  //       (water) past the Void Maw — the gauntlet's first "post-final" abyssal terror.
  boss('abyssal_kraken', 'Abyssal Kraken', 'kraken', '#2ea0c0',
    { hp: 40000, ad: 250, as: 0.7, armor: 55, mr: 50, range: 2, maxMana: 80, startMana: 25, manaPer: 8 },
    { name: 'Maelstrom', type: 'magic', target: 'cluster', ap: 400,
      verbs: [{ op: 'magic', target: 'cluster', radius: 2, ap: 400 }, { op: 'healCut', pct: 0.6, dur: 3, target: 'cluster' }, { op: 'knockback', cells: 1, target: 'cluster' }],
      passive: { on: 'lowHp', threshold: 0.5, verbs: [{ op: 'summon', count: 2, hp: 3000, ad: 150 }] } }),

  // 11 — THUNDER ROC: a living storm with wings — chains lightning across your whole team and STUNS
  //       them, attacks blisteringly fast, and whips up a meteor-storm of hail below half. Air/shock.
  boss('thunder_roc', 'Thunder Roc', 'roc', '#ffe14a',
    { hp: 42000, ad: 235, as: 0.9, armor: 48, mr: 55, range: 3, maxMana: 70, startMana: 30, manaPer: 9 },
    { name: 'Chain Lightning', type: 'magic', target: 'mostEnemies', ap: 360,
      verbs: [{ op: 'magic', target: 'mostEnemies', count: 5, ap: 360 }, { op: 'stun', dur: 0.9, target: 'mostEnemies', count: 5 }],
      passive: { on: 'lowHp', threshold: 0.5, verbs: [{ op: 'buffAS', amount: 0.7, dur: 99, target: 'self' }, { op: 'meteors', n: 5, ap: 190, radius: 1 }] } }),

  // 12 — THE WORLDBREAKER (TRUE FINAL): a colossus of stone and starlight — a cataclysmic slam stuns
  //       and SHATTERS armour across a wide cluster, then below half it walls behind a vast shield,
  //       enrages, rains the sky down and tears open spawn. The absolute end of the gauntlet.
  boss('worldbreaker', 'The Worldbreaker', 'titan', '#c8b0ff',
    { hp: 50000, ad: 270, as: 0.58, armor: 78, mr: 60, range: 1, maxMana: 90, startMana: 22, manaPer: 9 },
    { name: 'Cataclysm', type: 'physical', target: 'cluster', adRatio: 2.7,
      verbs: [{ op: 'phys', target: 'cluster', radius: 1, adRatio: 2.7 }, { op: 'stun', dur: 1.2, target: 'cluster' }, { op: 'shred', stat: 'armor', amount: 40, dur: 4, target: 'cluster' }],
      passive: { on: 'lowHp', threshold: 0.5, verbs: [{ op: 'shield', target: 'self', amount: 7500 }, { op: 'buffAS', amount: 0.5, dur: 99, target: 'self' }, { op: 'meteors', n: 5, ap: 200, radius: 1 }, { op: 'summon', count: 2, hp: 3600, ad: 170 }] } }),
];

export const CREATURES = Object.fromEntries(CREATURES_LIST.map((c) => [c.defId, c]));
