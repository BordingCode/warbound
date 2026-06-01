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

  // 5 — EMBER WYRM (FINAL): breathes fire across your back line; ENRAGES below half HP.
  boss('ember_wyrm', 'Ember Wyrm', 'wyrm', '#ff6a3c',
    { hp: 22000, ad: 230, as: 0.7, armor: 44, mr: 44, range: 3, maxMana: 80, startMana: 25, manaPer: 8 },
    { name: 'Inferno Breath', type: 'magic', target: 'mostEnemies', ap: 300,
      verbs: [{ op: 'magic', target: 'mostEnemies', count: 4, ap: 300 }, { op: 'dot', dps: 75, dur: 3, target: 'mostEnemies', count: 4 }],
      passive: { on: 'lowHp', threshold: 0.5, verbs: [{ op: 'buffAS', amount: 0.65, dur: 99, target: 'self' }, { op: 'meteors', n: 4, ap: 180, radius: 1 }] } }),
];

export const CREATURES = Object.fromEntries(CREATURES_LIST.map((c) => [c.defId, c]));
