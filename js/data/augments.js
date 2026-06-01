// Augments: run-shaping powers drafted 3x per run (pick 1 of 3), escalating in tier.
// Solo game => lean into spiky, build-around, trade-off effects (Slay-the-Spire/Balatro
// model) rather than the bland must-nerf sameness PvP forces on TFT.
//
// Effect channels an augment can use:
//   econ:    { goldPerRound, interestCap, freeRerolls, boardPlus, xpPerRound }  (run.js)
//   once:    { lifeMax }                                                        (on pickup)
//   combat:  flat team combat mods (ad as hp ap armor mr shield vamp thorns critChance critDmg revive)
//   cond:    [{ match:{origin?,klass?,row?}, mods:{...} }]  conditional combat (a synergy/role/row)
//   traitBonus: { traitId: +n }  adds to your synergy COUNT (can activate a breakpoint)
//   wantTrait: traitId  -> smart offering weights this augment up if you run that trait
// tier: common | rare | prismatic   cat: combat | econ | synergy | build

export const AUGMENTS = {
  // ---------- COMMON (glue: smooth the run) ----------
  warchest:   { name: 'War Chest', icon: 'coffer', tier: 'common', cat: 'econ', desc: '+2 gold every round.', econ: { goldPerRound: 2 } },
  usurer:     { name: "Usurer's Ledger", icon: 'book', tier: 'common', cat: 'econ', desc: 'Interest cap +3 (save up to 80g).', econ: { interestCap: 3 } },
  spyglass:   { name: 'Spyglass', icon: 'telescope', tier: 'common', cat: 'econ', desc: 'One free shop reroll each planning phase.', econ: { freeRerolls: 1 } },
  scholar:    { name: "Scholar's Tome", icon: 'book', tier: 'common', cat: 'econ', desc: '+3 XP every round.', econ: { xpPerRound: 3 } },
  whetstone:  { name: 'Whetstone', icon: 'anvil', tier: 'common', cat: 'combat', desc: 'Your team: +14% Attack Damage.', combat: { ad: 0.14 } },
  bulwark:    { name: 'Bulwark', icon: 'wall', tier: 'common', cat: 'combat', desc: 'Your team: +16% max Health.', combat: { hp: 0.16 } },
  grimoire:   { name: 'Shared Grimoire', icon: 'wand', tier: 'common', cat: 'combat', desc: 'Your team: +35 Ability Power.', combat: { ap: 35 } },
  swiftboots: { name: 'Swift Boots', icon: 'boots', tier: 'common', cat: 'combat', desc: 'Your team: +12% Attack Speed.', combat: { as: 0.12 } },
  ironhide:   { name: 'Ironhide Totem', icon: 'shield', tier: 'common', cat: 'combat', desc: 'Your team: +22 Armor & Magic Resist.', combat: { armor: 22, mr: 22 } },
  aegis:      { name: 'Aegis Charm', icon: 'shield', tier: 'common', cat: 'combat', desc: 'Your team starts each fight with a 180 shield.', combat: { shield: 180 } },
  vampiric:   { name: 'Vampiric Sigil', icon: 'fang', tier: 'common', cat: 'combat', desc: 'Your team heals 12% of attack damage dealt.', combat: { vamp: 0.12 } },
  veteran:    { name: "Veteran's Rite", icon: 'heart', tier: 'common', cat: 'econ', desc: '+1 max life (heal 1 now).', once: { lifeMax: 1 } },

  // ---------- RARE (build-around: reward a direction) ----------
  mage_crown:     { name: 'Mage Crown', icon: 'crown', tier: 'rare', cat: 'synergy', desc: '+1 Mage synergy, and your Mages gain +30 Ability Power.', traitBonus: { mage: 1 }, cond: [{ match: { klass: 'mage' }, mods: { ap: 30 } }], wantTrait: 'mage' },
  knight_crown:   { name: 'Knight Crown', icon: 'crown', tier: 'rare', cat: 'synergy', desc: '+1 Knight synergy, and your Knights gain +20 Armor & MR.', traitBonus: { knight: 1 }, cond: [{ match: { klass: 'knight' }, mods: { armor: 20, mr: 20 } }], wantTrait: 'knight' },
  undead_crown:   { name: 'Undead Crown', icon: 'crown', tier: 'rare', cat: 'synergy', desc: '+1 Undead synergy, and your Undead gain +14% Health.', traitBonus: { undead: 1 }, cond: [{ match: { origin: 'undead' }, mods: { hp: 0.14 } }], wantTrait: 'undead' },
  assassin_crown: { name: 'Assassin Crown', icon: 'crown', tier: 'rare', cat: 'synergy', desc: '+1 Assassin synergy, and your Assassins gain +12% crit chance.', traitBonus: { assassin: 1 }, cond: [{ match: { klass: 'assassin' }, mods: { critChance: 0.12, critDmg: 0.3 } }], wantTrait: 'assassin' },
  ranger_crown:   { name: 'Ranger Crown', icon: 'crown', tier: 'rare', cat: 'synergy', desc: '+1 Ranger synergy, and your Rangers gain +20% Attack Speed.', traitBonus: { ranger: 1 }, cond: [{ match: { klass: 'ranger' }, mods: { as: 0.20 } }], wantTrait: 'ranger' },
  demon_crown:    { name: 'Demon Crown', icon: 'crown', tier: 'rare', cat: 'synergy', desc: '+1 Demon synergy, and your Demons gain +14% Attack Damage.', traitBonus: { demon: 1 }, cond: [{ match: { origin: 'demon' }, mods: { ad: 0.14 } }], wantTrait: 'demon' },
  arcane_focus:   { name: 'Arcane Focus', icon: 'wand', tier: 'rare', cat: 'synergy', desc: 'Your Mages gain +70 Ability Power.', cond: [{ match: { klass: 'mage' }, mods: { ap: 70 } }], wantTrait: 'mage' },
  hunters_mark:   { name: "Hunter's Mark", icon: 'target', tier: 'rare', cat: 'synergy', desc: 'Your Rangers gain +40% Attack Speed.', cond: [{ match: { klass: 'ranger' }, mods: { as: 0.40 } }], wantTrait: 'ranger' },
  knights_vow:    { name: "Knight's Vow", icon: 'shield', tier: 'rare', cat: 'synergy', desc: 'Your Knights gain +40 Armor & Magic Resist.', cond: [{ match: { klass: 'knight' }, mods: { armor: 40, mr: 40 } }], wantTrait: 'knight' },
  assassins_edge: { name: "Assassin's Edge", icon: 'sword', tier: 'rare', cat: 'synergy', desc: 'Your Assassins gain +25% crit chance and +60% crit damage.', cond: [{ match: { klass: 'assassin' }, mods: { critChance: 0.25, critDmg: 0.6 } }], wantTrait: 'assassin' },
  pack_fury:      { name: 'Pack Fury', icon: 'paw', tier: 'rare', cat: 'synergy', desc: 'Your Beasts gain +22% Attack Damage.', cond: [{ match: { origin: 'beast' }, mods: { ad: 0.22 } }], wantTrait: 'beast' },
  backline_barrage:{ name: 'Backline Barrage', icon: 'bow', tier: 'rare', cat: 'combat', desc: 'Back-row champions: +18% Attack Speed and +8% AD.', cond: [{ match: { row: 'back' }, mods: { as: 0.18, ad: 0.08 } }] },
  frontline_wall: { name: 'Frontline Wall', icon: 'wall', tier: 'rare', cat: 'combat', desc: 'Front-row champions: +28% Health and +30 Armor.', cond: [{ match: { row: 'front' }, mods: { hp: 0.28, armor: 30 } }] },
  bloodforge:     { name: 'Bloodforge', icon: 'fang', tier: 'rare', cat: 'combat', desc: 'Your team heals 22% of attack damage dealt.', combat: { vamp: 0.22 } },
  battle_standard:{ name: 'Battle Standard', icon: 'banner', tier: 'rare', cat: 'combat', desc: 'Your team: +16% Attack Damage and +7% Attack Speed.', combat: { ad: 0.16, as: 0.07 } },
  dragon_hoard:   { name: "Dragon's Hoard", icon: 'gem', tier: 'rare', cat: 'econ', desc: '+4 gold/round and interest cap +2.', econ: { goldPerRound: 4, interestCap: 2 } },

  // ---------- PRISMATIC (trade-off / ceiling: define the run) ----------
  glasscannon:    { name: 'Glass Cannon', icon: 'burst', tier: 'prismatic', cat: 'build', desc: 'Your team: +35% Attack Damage, but −15% max Health.', combat: { ad: 0.35, hp: -0.15 } },
  arcane_overflow:{ name: 'Arcane Overflow', icon: 'wand', tier: 'prismatic', cat: 'build', desc: 'Your team: +130 Ability Power, but −10% max Health.', combat: { ap: 130, hp: -0.10 } },
  berserkers_pact:{ name: "Berserker's Pact", icon: 'axe', tier: 'prismatic', cat: 'build', desc: '+45% AD and +20% Attack Speed, but −25% max Health.', combat: { ad: 0.45, as: 0.20, hp: -0.25 } },
  titans_resolve: { name: "Titan's Resolve", icon: 'shield', tier: 'prismatic', cat: 'build', desc: '+35% max Health and +22 Armor/MR, but −15% Attack Speed.', combat: { hp: 0.35, armor: 22, mr: 22, as: -0.15 } },
  warlords_gambit:{ name: "Warlord's Gambit", icon: 'banner', tier: 'prismatic', cat: 'build', desc: '+1 board slot (field an extra champion), but your team has −6% Health.', econ: { boardPlus: 1 }, combat: { hp: -0.06 } },
  vampire_lords:  { name: 'Vampire Lords', icon: 'fang', tier: 'prismatic', cat: 'build', desc: 'Your team heals 32% of damage dealt, but −6% Attack Damage.', combat: { vamp: 0.32, ad: -0.06 } },
  undying_legion: { name: 'Undying Legion', icon: 'skull', tier: 'prismatic', cat: 'synergy', desc: '+2 to your Undead synergy.', traitBonus: { undead: 2 }, wantTrait: 'undead' },
  thornmail:      { name: 'Thornmail Aura', icon: 'thorns', tier: 'prismatic', cat: 'build', desc: 'Your team reflects 18% of attack damage taken and +20 Armor, but −10% Attack Damage.', combat: { thorns: 0.18, armor: 20, ad: -0.10 } },
};

export const AUGMENT_IDS = Object.keys(AUGMENTS);
export const TIER_RANK = { common: 0, rare: 1, prismatic: 2 };
export const TIER_LABEL = { common: 'Common', rare: 'Rare', prismatic: 'Prismatic' };

// Per-offer tier probability (offer 0/1/2 = rounds 3/6/9): early skews common, late prismatic.
export const OFFER_TIER_WEIGHTS = [
  { common: 70, rare: 28, prismatic: 2 },
  { common: 35, rare: 50, prismatic: 15 },
  { common: 8, rare: 57, prismatic: 35 },
];

const COMBAT_KEYS = ['ad', 'as', 'hp', 'ap', 'armor', 'mr', 'shield', 'vamp', 'thorns', 'critChance', 'critDmg', 'revive'];

// Combine all owned augments into the bundle the combat sim reads.
export function augmentBundle(ids = []) {
  const flat = {}, cond = [], traitBonus = {};
  for (const id of ids) {
    const a = AUGMENTS[id]; if (!a) continue;
    if (a.combat) for (const k of COMBAT_KEYS) if (a.combat[k]) flat[k] = (flat[k] || 0) + a.combat[k];
    if (a.cond) for (const c of a.cond) cond.push(c);
    if (a.traitBonus) for (const [t, n] of Object.entries(a.traitBonus)) traitBonus[t] = (traitBonus[t] || 0) + n;
  }
  return { flat, cond, traitBonus };
}

export function augmentEcon(ids = []) {
  const e = { goldPerRound: 0, interestCap: 0, freeRerolls: 0, boardPlus: 0, xpPerRound: 0 };
  for (const id of ids) { const a = AUGMENTS[id]; if (a && a.econ) for (const [k, v] of Object.entries(a.econ)) e[k] = (e[k] || 0) + v; }
  return e;
}
