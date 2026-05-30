// Warpath meta-progression: a persistent CHAMPION you gear up across runs to make the (hard)
// solo climb steadily more winnable. Earn Spoils 🪙 every run (even losses), spend them on War
// Caches (chests) that drop random EQUIPMENT, equip one piece per slot on your champion, and
// each piece grants a START-OF-RUN boost. Saved in localStorage. Solo mode only (the ranked
// ladder stays pure). No effect on combat balance beyond the documented start boosts.
import { TRAITS } from '../data/traits.js';

export const SLOTS = [
  { id: 'weapon',  name: 'Weapon',  icon: '⚔' },
  { id: 'helm',    name: 'Helm',    icon: '⛑' },
  { id: 'armor',   name: 'Armor',   icon: '🛡' },
  { id: 'trinket', name: 'Trinket', icon: '💍' },
  { id: 'banner',  name: 'Banner',  icon: '🚩' },
];
export const RARITIES = [
  { id: 'common', name: 'Common', color: '#b9c4d0', weight: 64 },
  { id: 'rare',   name: 'Rare',   color: '#6fb1ff', weight: 28 },
  { id: 'epic',   name: 'Epic',   color: '#c79bff', weight: 8 },
];
const RIDX = { common: 0, rare: 1, epic: 2 };
export const CHEST_COST = 12;     // Spoils per War Cache
const SAVE_KEY = 'warbound_meta_v1';

// per-slot effect: type + the value at [common, rare, epic]. trinket grants a synergy crown.
const SLOT_EFFECT = {
  weapon:  { type: 'gold',       vals: [3, 6, 10] },
  helm:    { type: 'xp',         vals: [4, 9, 16] },
  armor:   { type: 'lives',      vals: [1, 2, 3] },
  trinket: { type: 'synergy',    vals: [1, 1, 1] },   // +1 to a named trait (epic = +1 to two — see gen)
  banner:  { type: 'components', vals: [1, 1, 2] },
};
// flavour names per slot × rarity
const NAMES = {
  weapon:  ['Notched Blade', 'Fine Saber', "Warlord's Edge"],
  helm:    ['Worn Helm', 'Crested Helm', 'Crown of Command'],
  armor:   ['Patched Mail', 'Knight\'s Plate', 'Aegis of Ages'],
  trinket: ['Carved Charm', 'Sigil Ring', 'Heart of the Pact'],
  banner:  ['Tattered Banner', 'Rallying Standard', 'Banner of Legends'],
};
const TRAIT_IDS = Object.keys(TRAITS);

let _uid = 1;
const newIid = () => 'g' + (_uid++);

export function effectText(item) {
  const e = item.eff;
  if (e.type === 'gold') return `+${e.value} starting gold`;
  if (e.type === 'xp') return `+${e.value} starting XP`;
  if (e.type === 'lives') return `+${e.value} starting ${e.value > 1 ? 'lives' : 'life'} ❤`;
  if (e.type === 'components') return `Start with ${e.value} item component${e.value > 1 ? 's' : ''}`;
  if (e.type === 'synergy') { const ts = Object.keys(e.traitBonus).map((t) => `+${e.traitBonus[t]} ${TRAITS[t] ? TRAITS[t].name : t}`).join(', '); return `${ts} synergy`; }
  return '';
}

// ---- persistence ----
export function load() {
  try {
    const m = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!m) return { spoils: 0, inventory: [], equipped: {} };
    m.spoils = m.spoils || 0; m.inventory = m.inventory || []; m.equipped = m.equipped || {};
    for (const it of m.inventory) { const n = parseInt(String(it.iid).replace(/\D/g, ''), 10); if (n >= _uid) _uid = n + 1; }
    return m;
  } catch { return { spoils: 0, inventory: [], equipped: {} }; }
}
export function save(m) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(m)); } catch {} }
export function addSpoils(n) { const m = load(); m.spoils = Math.max(0, m.spoils + Math.round(n)); save(m); return m.spoils; }

// Spoils earned from a finished solo run — even a loss pays, so the loop bootstraps the hard climb.
export function spoilsForRun(wins, roundsSurvived, won) {
  return Math.round(3 * wins + Math.max(0, roundsSurvived) + (won ? 25 : 0));
}

// ---- chests / items ----
function rollRarity(rng) {
  const total = RARITIES.reduce((a, r) => a + r.weight, 0);
  let x = (rng ? rng() : Math.random()) * total;
  for (const r of RARITIES) { x -= r.weight; if (x < 0) return r.id; }
  return 'common';
}
export function makeItem(slotId, rarityId, rng) {
  const r = RIDX[rarityId];
  const eff = SLOT_EFFECT[slotId];
  const item = { iid: newIid(), slot: slotId, rarity: rarityId, name: NAMES[slotId][r], icon: SLOTS.find((s) => s.id === slotId).icon, eff: { type: eff.type, value: eff.vals[r] } };
  if (eff.type === 'synergy') {
    const pick = () => TRAIT_IDS[Math.floor((rng ? rng() : Math.random()) * TRAIT_IDS.length)];
    const tb = {}; tb[pick()] = 1; if (rarityId === 'epic') { let t2 = pick(); tb[t2] = (tb[t2] || 0) + 1; }
    item.eff.traitBonus = tb;
    // rename to the trait it boosts for clarity
    const tnames = Object.keys(tb).map((t) => TRAITS[t] ? TRAITS[t].name : t).join('/');
    item.name = `${tnames} ${NAMES[slotId][r]}`;
  }
  return item;
}
// Buy & open a chest: returns { ok, item, spoils } or { ok:false }.
export function openChest(rng) {
  const m = load();
  if (m.spoils < CHEST_COST) return { ok: false, spoils: m.spoils };
  m.spoils -= CHEST_COST;
  const slot = SLOTS[Math.floor((rng ? rng() : Math.random()) * SLOTS.length)].id;
  const item = makeItem(slot, rollRarity(rng), rng);
  m.inventory.push(item);
  save(m);
  return { ok: true, item, spoils: m.spoils };
}
export function equip(iid) {
  const m = load();
  const it = m.inventory.find((x) => x.iid === iid); if (!it) return false;
  m.equipped[it.slot] = iid;            // one per slot — replaces (no duplicate slots)
  save(m); return true;
}
export function unequip(slotId) { const m = load(); delete m.equipped[slotId]; save(m); }
export function equippedItem(m, slotId) { const iid = m.equipped[slotId]; return iid ? m.inventory.find((x) => x.iid === iid) : null; }

// Aggregate the start-of-run boosts from all equipped gear.
export function gearBonuses(m) {
  m = m || load();
  const b = { gold: 0, xp: 0, lives: 0, components: 0, traitBonus: {} };
  for (const s of SLOTS) {
    const it = equippedItem(m, s.id); if (!it) continue;
    const e = it.eff;
    if (e.type === 'gold') b.gold += e.value;
    else if (e.type === 'xp') b.xp += e.value;
    else if (e.type === 'lives') b.lives += e.value;
    else if (e.type === 'components') b.components += e.value;
    else if (e.type === 'synergy' && e.traitBonus) for (const t in e.traitBonus) b.traitBonus[t] = (b.traitBonus[t] || 0) + e.traitBonus[t];
  }
  return b;
}
export function resetMeta() { try { localStorage.removeItem(SAVE_KEY); } catch {} }
