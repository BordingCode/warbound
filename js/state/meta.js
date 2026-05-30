// Warpath meta-progression: a persistent CHAMPION you gear up across runs to make the (hard)
// solo climb steadily more winnable. Earn Spoils every run (even losses), spend them on War
// Caches (chests) that drop random EQUIPMENT, equip one piece per slot, each granting a
// start-of-run boost. Saved in localStorage. SOLO ONLY (the ranked ladder stays pure).
//
// COHERENCE: each slot IS one clear theme — the slot name, the icon, the item names and the
// effect all match, so a "Dragon Hoard" obviously gives gold and a "Tome of Mastery"
// obviously gives XP. Nothing reads as random.
import { TRAITS } from '../data/traits.js';

// each slot = one effect family. icon + colour + names all telegraph the effect.
export const SLOTS = [
  { id: 'weapon', name: 'Weapon', icon: 'sword',  color: '#ff6a4c', eff: 'ad',      vals: [0.06, 0.10, 0.16], names: ['Worn Blade', 'Keen Saber', 'Bloodfang Axe'] },
  { id: 'armor',  name: 'Armor',  icon: 'shield', color: '#7affa0', eff: 'lives',   vals: [1, 2, 3],          names: ['Padded Vest', 'Iron Cuirass', 'Aegis Plate'] },
  { id: 'tome',   name: 'Tome',   icon: 'book',   color: '#6fb1ff', eff: 'xp',      vals: [5, 10, 18],        names: ['Field Manual', 'War Codex', 'Tome of Mastery'] },
  { id: 'coffer', name: 'Coffer', icon: 'coffer', color: '#ffce5c', eff: 'gold',    vals: [4, 8, 14],         names: ['Coin Pouch', "Merchant's Coffer", 'Dragon Hoard'] },
  { id: 'relic',  name: 'Relic',  icon: 'gem',    color: '#c79bff', eff: 'synergy', vals: [1, 1, 1],          names: ['Sigil', 'Idol', 'Totem'] },
];
const SLOT_BY_ID = Object.fromEntries(SLOTS.map((s) => [s.id, s]));
export const RARITIES = [
  { id: 'common', name: 'Common', color: '#8b97a8', weight: 64 },
  { id: 'rare',   name: 'Rare',   color: '#6fb1ff', weight: 28 },
  { id: 'epic',   name: 'Epic',   color: '#c79bff', weight: 8 },
];
const RIDX = { common: 0, rare: 1, epic: 2 };
export const CHEST_COST = 12;
const SAVE_KEY = 'warbound_meta_v2';
const OLD_KEY = 'warbound_meta_v1';
const TRAIT_IDS = Object.keys(TRAITS);

let _uid = 1;
const newIid = () => 'g' + (_uid++);

export function effectText(item) {
  const e = item.eff;
  if (e.type === 'ad') return `+${Math.round(e.value * 100)}% team Attack Damage`;
  if (e.type === 'lives') return `+${e.value} starting ${e.value > 1 ? 'lives' : 'life'}`;
  if (e.type === 'xp') return `+${e.value} starting XP (a head start)`;
  if (e.type === 'gold') return `+${e.value} starting gold`;
  if (e.type === 'synergy') { const ts = Object.keys(e.traitBonus).map((t) => `+${e.traitBonus[t]} ${TRAITS[t] ? TRAITS[t].name : t}`).join(' & '); return `${ts} synergy`; }
  return '';
}
export function itemColor(item) { return item.color || (SLOT_BY_ID[item.slot] && SLOT_BY_ID[item.slot].color) || '#8b97a8'; }

// ---- persistence (migrates Spoils from the old v1 save, drops old incoherent gear) ----
export function load() {
  try {
    let m = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!m) {
      const old = JSON.parse(localStorage.getItem(OLD_KEY) || 'null');   // carry over Spoils only
      m = { spoils: old && old.spoils ? old.spoils : 0, inventory: [], equipped: {} };
    }
    m.spoils = m.spoils || 0; m.inventory = m.inventory || []; m.equipped = m.equipped || {};
    for (const it of m.inventory) { const n = parseInt(String(it.iid).replace(/\D/g, ''), 10); if (n >= _uid) _uid = n + 1; }
    return m;
  } catch { return { spoils: 0, inventory: [], equipped: {} }; }
}
export function save(m) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(m)); } catch {} }
export function addSpoils(n) { const m = load(); m.spoils = Math.max(0, m.spoils + Math.round(n)); save(m); return m.spoils; }

// Spoils from a finished solo run — even a loss pays, so the loop bootstraps the hard climb.
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
  const s = SLOT_BY_ID[slotId]; const r = RIDX[rarityId];
  const item = { iid: newIid(), slot: slotId, rarity: rarityId, icon: s.icon, color: s.color, name: s.names[r], eff: { type: s.eff, value: s.vals[r] } };
  if (s.eff === 'synergy') {
    const pick = () => TRAIT_IDS[Math.floor((rng ? rng() : Math.random()) * TRAIT_IDS.length)];
    const tb = {}; tb[pick()] = 1; if (rarityId === 'epic') { const t2 = pick(); tb[t2] = (tb[t2] || 0) + 1; }
    item.eff.traitBonus = tb;
    const tnames = Object.keys(tb).map((t) => TRAITS[t] ? TRAITS[t].name : t).join('/');
    item.name = `${tnames} ${s.names[r]}`;
    item.color = TRAITS[Object.keys(tb)[0]] ? TRAITS[Object.keys(tb)[0]].color : s.color;   // relic glows its trait's colour
  }
  return item;
}
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
export function equip(iid) { const m = load(); const it = m.inventory.find((x) => x.iid === iid); if (!it) return false; m.equipped[it.slot] = iid; save(m); return true; }
export function unequip(slotId) { const m = load(); delete m.equipped[slotId]; save(m); }
export function equippedItem(m, slotId) { const iid = m.equipped[slotId]; return iid ? m.inventory.find((x) => x.iid === iid) : null; }

// Aggregate the start-of-run boosts from all equipped gear.
export function gearBonuses(m) {
  m = m || load();
  const b = { gold: 0, xp: 0, lives: 0, flat: {}, traitBonus: {} };
  for (const s of SLOTS) {
    const it = equippedItem(m, s.id); if (!it) continue;
    const e = it.eff;
    if (e.type === 'gold') b.gold += e.value;
    else if (e.type === 'xp') b.xp += e.value;
    else if (e.type === 'lives') b.lives += e.value;
    else if (e.type === 'ad') b.flat.ad = (b.flat.ad || 0) + e.value;
    else if (e.type === 'synergy' && e.traitBonus) for (const t in e.traitBonus) b.traitBonus[t] = (b.traitBonus[t] || 0) + e.traitBonus[t];
  }
  return b;
}
// ---- combine: fuse 2 of the SAME slot + SAME rarity into ONE of the next rarity up ----
// "Its own kind": same equipment family (slot) and same tier. common+common -> rare, rare+rare
// -> epic. Epic is the ceiling. Returns the groups that currently have a valid fusion available.
const RARITY_ORDER = ['common', 'rare', 'epic'];
export function nextRarity(rarityId) { const i = RARITY_ORDER.indexOf(rarityId); return i >= 0 && i < RARITY_ORDER.length - 1 ? RARITY_ORDER[i + 1] : null; }

export function combinables(m) {
  m = m || load();
  const groups = {};
  for (const it of m.inventory) {
    if (!nextRarity(it.rarity)) continue;                 // epic can't be upgraded
    const k = it.slot + '|' + it.rarity;
    (groups[k] = groups[k] || { slot: it.slot, rarity: it.rarity, items: [] }).items.push(it);
  }
  return Object.values(groups).filter((g) => g.items.length >= 2);
}

// Fuse two items of (slotId, rarityId) -> one of the next rarity. Consumes two from the
// inventory (unequipping any that were equipped) and returns the freshly forged item.
export function combineItems(slotId, rarityId, rng) {
  const up = nextRarity(rarityId);
  if (!up) return { ok: false };
  const m = load();
  const matches = m.inventory.filter((x) => x.slot === slotId && x.rarity === rarityId);
  if (matches.length < 2) return { ok: false };
  // prefer consuming UNEQUIPPED copies first, so we don't needlessly strip the hero
  matches.sort((a, b) => (m.equipped[a.slot] === a.iid ? 1 : 0) - (m.equipped[b.slot] === b.iid ? 1 : 0));
  const consume = matches.slice(0, 2);
  const ids = new Set(consume.map((x) => x.iid));
  if (ids.has(m.equipped[slotId])) delete m.equipped[slotId];   // unequip if a consumed piece was worn
  m.inventory = m.inventory.filter((x) => !ids.has(x.iid));
  const item = makeItem(slotId, up, rng);
  m.inventory.push(item);
  save(m);
  return { ok: true, item };
}

export function resetMeta() { try { localStorage.removeItem(SAVE_KEY); } catch {} }
