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
  rageblade:     { name: 'Rageblade', icon: 'flame', mods: { as: 0.38 } },
  archmage:      { name: 'Archmage Crown', icon: 'crown', mods: { ap: 130 } },
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
  solari:        { name: 'Solari Locket', icon: 'star', mods: { ap: 35, mr: 25, shield: 340 } },
  morello:       { name: 'Morellonomicon', icon: 'book', mods: { ap: 65, hp: 0.18 } },
  redemption:    { name: 'Redemption', icon: 'potion', mods: { hp: 0.30, shield: 160, regen: 8 } },
};

// ── EMBLEMS (Warpath-only) ──────────────────────────────────────────────────
// Each emblem GRANTS its holder +1 of a trait's count (so a non-Knight counts as a
// Knight for synergy breakpoints) plus a small thematic stat. `traitGrant` is read by
// the sim (sim/combat.js → activeTraits per-unit grants). Acquisition is gated to
// Warpath in run.js/main.js; the Ladder never offers or equips these (keeps PvP pure).
export const EMBLEMS = {
  // origins
  emblem_human:   { name: 'Human Emblem',   icon: 'crown', emblem: true, mods: { hp: 0.08 },        traitGrant: { human: 1 } },
  emblem_undead:  { name: 'Undead Emblem',  icon: 'crown', emblem: true, mods: { vamp: 0.10 },      traitGrant: { undead: 1 } },
  emblem_elf:     { name: 'Elf Emblem',     icon: 'crown', emblem: true, mods: { as: 0.10 },         traitGrant: { elf: 1 } },
  emblem_demon:   { name: 'Demon Emblem',   icon: 'crown', emblem: true, mods: { ap: 18 },           traitGrant: { demon: 1 } },
  emblem_beast:   { name: 'Beast Emblem',   icon: 'crown', emblem: true, mods: { ad: 0.10 },         traitGrant: { beast: 1 } },
  emblem_dragon:  { name: 'Dragon Emblem',  icon: 'crown', emblem: true, mods: { mr: 18, ad: 0.06 }, traitGrant: { dragon: 1 } },
  emblem_orc:     { name: 'Orc Emblem',     icon: 'crown', emblem: true, mods: { as: 0.08, vamp: 0.06 }, traitGrant: { orc: 1 } },
  // classes
  emblem_knight:  { name: 'Knight Emblem',  icon: 'crown', emblem: true, mods: { armor: 18 },        traitGrant: { knight: 1 } },
  emblem_mage:    { name: 'Mage Emblem',    icon: 'crown', emblem: true, mods: { ap: 22 },           traitGrant: { mage: 1 } },
  emblem_ranger:  { name: 'Ranger Emblem',  icon: 'crown', emblem: true, mods: { as: 0.12 },         traitGrant: { ranger: 1 } },
  emblem_assassin:{ name: 'Assassin Emblem',icon: 'crown', emblem: true, mods: { critChance: 0.12 }, traitGrant: { assassin: 1 } },
  emblem_healer:  { name: 'Healer Emblem',  icon: 'crown', emblem: true, mods: { regen: 7 },         traitGrant: { healer: 1 } },
  emblem_summoner:{ name: 'Summoner Emblem',icon: 'crown', emblem: true, mods: { hp: 0.10 },         traitGrant: { summoner: 1 } },
};
export const EMBLEM_IDS = Object.keys(EMBLEMS);
export function isEmblem(id) { return !!EMBLEMS[id]; }
// Emblems can't be combined and never collide with item recipes.
export function emblemForTrait(t) { return 'emblem_' + t; }

// Combine matrix (order-independent). Key = sorted "a+b".
const COMBINE = {
  'sword+sword': 'infinity_edge', 'bow+bow': 'rageblade', 'rod+rod': 'archmage',
  'cloak+cloak': 'thornplate', 'belt+belt': 'warmog',
  'bow+sword': 'blade_dancer', 'rod+sword': 'spellblade', 'cloak+sword': 'guardian', 'belt+sword': 'warlord',
  'bow+rod': 'static_shiv', 'bow+cloak': 'bramble', 'belt+bow': 'titan',
  'cloak+rod': 'solari', 'belt+rod': 'morello', 'belt+cloak': 'redemption',
};
export function combine(a, b) {
  if (isEmblem(a) || isEmblem(b)) return null;   // emblems never combine
  return COMBINE[[a, b].sort().join('+')] || null;
}
export function isComponent(id) { return !!COMPONENTS[id]; }
export function itemDef(id) { return COMPONENTS[id] || ITEMS[id] || EMBLEMS[id] || null; }
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

// Flatten emblem trait-grants on a unit into a list of trait ids (each = +1 to that
// trait's synergy count for the holder). Read by activeTraits via the per-unit grants map.
export function traitGrantsFor(itemIds = []) {
  const out = [];
  for (const id of itemIds) {
    const def = itemDef(id);
    if (!def || !def.traitGrant) continue;
    for (const [t, n] of Object.entries(def.traitGrant)) for (let i = 0; i < n; i++) out.push(t);
  }
  return out;
}
