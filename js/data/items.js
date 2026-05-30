// Items: 5 components -> 15 combined items (full 5x5 symmetric grid). Underlords-style
// "pick 1 of 3" acquisition. Effects are data the combat sim reads (sim/combat.js).
// mods: ad/as/hp are multipliers (+0.18 = +18%); ap/armor/mr/shield/manaStart are flat;
// vamp/thorns/crit*/regen are special hooks; revive sets revivePct.

export const COMPONENTS = {
  sword: { name: 'Sword', icon: 'sword', mods: { ad: 0.18 } },
  bow:   { name: 'Bow', icon: 'bow', mods: { as: 0.20 } },
  rod:   { name: 'Rod', icon: 'wand', mods: { ap: 40 } },
  cloak: { name: 'Cloak', icon: 'shield', mods: { armor: 25, mr: 25 } },
  belt:  { name: 'Belt', icon: 'heart', mods: { hp: 0.20 } },
};
export const COMPONENT_IDS = Object.keys(COMPONENTS);

export const ITEMS = {
  // doubles
  infinity_edge: { name: 'Infinity Edge', icon: 'sword', mods: { ad: 0.10, critChance: 0.35, critDmg: 1.0 } },
  rageblade:     { name: 'Rageblade', icon: 'flame', mods: { as: 0.45 } },
  archmage:      { name: 'Archmage Crown', icon: 'crown', mods: { ap: 95 } },
  thornplate:    { name: 'Thornplate', icon: 'shield', mods: { armor: 50, mr: 50, thorns: 0.22 } },
  warmog:        { name: "Warmog's", icon: 'heart', mods: { hp: 0.50, regen: 14 } },
  // pairs
  blade_dancer:  { name: 'Blade Dancer', icon: 'sword', mods: { as: 0.25, ad: 0.10 } },
  spellblade:    { name: 'Spellblade', icon: 'wand', mods: { ad: 0.10, ap: 25, vamp: 0.22 } },
  guardian:      { name: 'Guardian Angel', icon: 'shield', mods: { ad: 0.10, armor: 20, revive: 0.35 } },
  warlord:       { name: "Warlord's Banner", icon: 'crown', mods: { ad: 0.15, hp: 0.15 } },
  static_shiv:   { name: 'Static Shiv', icon: 'burst', mods: { as: 0.20, ap: 30 } },
  bramble:       { name: 'Bramble Vest', icon: 'shield', mods: { armor: 25, as: 0.10, thorns: 0.18 } },
  titan:         { name: 'Titan Hydra', icon: 'heart', mods: { as: 0.20, hp: 0.20 } },
  solari:        { name: 'Solari Locket', icon: 'star', mods: { ap: 20, mr: 20, shield: 260 } },
  morello:       { name: 'Morellonomicon', icon: 'book', mods: { ap: 45, hp: 0.15 } },
  redemption:    { name: 'Redemption', icon: 'potion', mods: { hp: 0.30, shield: 160, regen: 8 } },
};

// Combine matrix (order-independent). Key = sorted "a+b".
const COMBINE = {
  'sword+sword': 'infinity_edge', 'bow+bow': 'rageblade', 'rod+rod': 'archmage',
  'cloak+cloak': 'thornplate', 'belt+belt': 'warmog',
  'bow+sword': 'blade_dancer', 'rod+sword': 'spellblade', 'cloak+sword': 'guardian', 'belt+sword': 'warlord',
  'bow+rod': 'static_shiv', 'bow+cloak': 'bramble', 'belt+bow': 'titan',
  'cloak+rod': 'solari', 'belt+rod': 'morello', 'belt+cloak': 'redemption',
};
export function combine(a, b) { return COMBINE[[a, b].sort().join('+')] || null; }
export function isComponent(id) { return !!COMPONENTS[id]; }
export function itemDef(id) { return COMPONENTS[id] || ITEMS[id] || null; }
export function itemLabel(id) { const d = itemDef(id); return d ? d.name : id; }

// Aggregate all item mods on a unit into one object the sim applies.
export function aggregateMods(itemIds = []) {
  const m = { ad: 0, as: 0, hp: 0, ap: 0, armor: 0, mr: 0, shield: 0, vamp: 0, thorns: 0, regen: 0, critChance: 0, critDmg: 0, revive: 0 };
  for (const id of itemIds) {
    const def = itemDef(id); if (!def) continue;
    for (const [k, v] of Object.entries(def.mods)) m[k] = (m[k] || 0) + v;
  }
  return m;
}
