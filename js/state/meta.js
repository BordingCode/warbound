// Warpath meta-progression: a persistent CHAMPION you gear up across runs to make the (hard)
// solo climb steadily more winnable. Earn Spoils every run (even losses), spend them on War
// Caches (chests) that drop random EQUIPMENT, equip one piece per slot, each granting a
// start-of-run boost. Saved in localStorage. SOLO ONLY (the ranked ladder stays pure).
//
// COHERENCE: each slot IS one clear theme — the slot name, the icon, the item names and the
// effect all match, so a "Dragon Hoard" obviously gives gold and a "Tome of Mastery"
// obviously gives XP. Nothing reads as random.
import { TRAITS } from '../data/traits.js';
import { HONOR_BY_ID } from '../data/honors.js';

// each slot = one effect family. icon + colour + names all telegraph the effect.
// vals/names indexed by rarity: [common, rare, epic, legendary, mythic, ascended, celestial, godforged].
export const SLOTS = [
  { id: 'weapon', name: 'Weapon', icon: 'sword',  color: '#ff6a4c', eff: 'ad',      vals: [0.04, 0.07, 0.10, 0.13, 0.16, 0.19, 0.22, 0.25], names: ['Worn Blade', 'Keen Saber', 'Bloodfang Axe', 'Dragonbane Greatsword', 'Worldender', 'Ragnarok', 'Celestial Edge', 'Godslayer'] },
  { id: 'armor',  name: 'Armor',  icon: 'shield', color: '#7affa0', eff: 'lives',   vals: [1, 1, 2, 2, 3, 3, 4, 4],                         names: ['Padded Vest', 'Iron Cuirass', 'Aegis Plate', 'Dragonscale Bulwark', 'Aegis of the Titans', 'Bastion Eternal', 'Celestial Aegis', 'Godplate'] },
  { id: 'tome',   name: 'Tome',   icon: 'book',   color: '#6fb1ff', eff: 'xp',      vals: [5, 10, 18, 28, 40, 56, 74, 96],                  names: ['Field Manual', 'War Codex', 'Tome of Mastery', 'Grimoire of Ages', 'Codex Infinitum', 'Codex Eternal', 'Celestial Codex', 'Tome of Gods'] },
  { id: 'coffer', name: 'Coffer', icon: 'coffer', color: '#ffce5c', eff: 'gold',    vals: [4, 8, 14, 22, 32, 46, 62, 82],                   names: ['Coin Pouch', "Merchant's Coffer", 'Dragon Hoard', 'Vault of Kings', 'Reliquary of Midas', 'Hoard Eternal', 'Celestial Hoard', 'Godhoard'] },
  { id: 'relic',  name: 'Relic',  icon: 'gem',    color: '#c79bff', eff: 'synergy', vals: [1, 1, 1, 2, 2, 3, 3, 4],                         names: ['Sigil', 'Idol', 'Totem', 'Relic', 'Artifact', 'Eternal Sigil', 'Celestial Sigil', 'Godsigil'] },
];
const SLOT_BY_ID = Object.fromEntries(SLOTS.map((s) => [s.id, s]));
// Legendary…Godforged are FORGE-ONLY (weight 0 = never drop from a War Cache) — you earn them by
// fusing up the chain: Epic → Legendary → Mythic → Ascended → Celestial → Godforged (the ceiling).
export const RARITIES = [
  { id: 'common',    name: 'Common',    color: '#8b97a8', weight: 64 },
  { id: 'rare',      name: 'Rare',      color: '#6fb1ff', weight: 28 },
  { id: 'epic',      name: 'Epic',      color: '#c79bff', weight: 8 },
  { id: 'legendary', name: 'Legendary', color: '#ffb031', weight: 0 },
  { id: 'mythic',    name: 'Mythic',    color: '#ff5e8a', weight: 0 },
  { id: 'ascended',  name: 'Ascended',  color: '#7df9ff', weight: 0 },
  { id: 'celestial', name: 'Celestial', color: '#e7efff', weight: 0 },
  { id: 'godforged', name: 'Godforged', color: '#ffe08a', weight: 0 },
];
const RIDX = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4, ascended: 5, celestial: 6, godforged: 7 };
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
    m.spoils = m.spoils || 0; m.inventory = m.inventory || []; m.equipped = m.equipped || {}; m.realmsCleared = m.realmsCleared || 0;
    for (const it of m.inventory) { const n = parseInt(String(it.iid).replace(/\D/g, ''), 10); if (n >= _uid) _uid = n + 1; }
    return m;
  } catch { return { spoils: 0, inventory: [], equipped: {}, realmsCleared: 0 }; }
}
export function save(m) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(m)); } catch {} }

// ---- realm conquest (permanent Warpath progress) ----
// realmsCleared = how many realms beaten = index of the next realm to conquer (the "frontier").
export function realmsCleared() { return load().realmsCleared || 0; }
// mark realm index `idx` conquered; returns true only if this ADVANCED the frontier (a new conquest).
export function conquerRealm(idx) { const m = load(); if (idx + 1 > (m.realmsCleared || 0)) { m.realmsCleared = idx + 1; save(m); return true; } return false; }
export function addSpoils(n) { const m = load(); m.spoils = Math.max(0, m.spoils + Math.round(n)); save(m); return m.spoils; }

// ---- personal bests (Endless depth, Trials bosses) — at-a-glance progress on the mode menu. ----
export function recordBest(key, value) { const m = load(); const k = 'best_' + key; if (value > (m[k] || 0)) { m[k] = value; save(m); return true; } return false; }
export function best(key) { return load()['best_' + key] || 0; }

// ---- War Honors (one-time achievements; see js/data/honors.js) ----
export function honorsEarned() { return load().honors || {}; }
export function hasHonor(id) { return !!(load().honors || {})[id]; }
// Claim an honour the first time it's achieved: mark it earned AND pay its Spoils bounty ONCE.
// Returns { honor, bounty, spoils } when newly earned; null if already held or unknown id.
export function claimHonor(id) {
  const def = HONOR_BY_ID[id]; if (!def) return null;
  const m = load(); m.honors = m.honors || {};
  if (m.honors[id]) return null;
  m.honors[id] = true;
  m.spoils = Math.max(0, m.spoils + def.bounty);
  save(m);
  return { honor: def, bounty: def.bounty, spoils: m.spoils };
}
// Mark an honour earned WITHOUT paying the bounty — used once to retro-credit milestones a
// returning player already reached before honours existed (endowed-progress: the board never
// opens at zero, but no surprise Spoils windfall). Returns true if it newly marked it.
export function markHonor(id) { const m = load(); m.honors = m.honors || {}; if (m.honors[id] || !HONOR_BY_ID[id]) return false; m.honors[id] = true; save(m); return true; }
export function honorInitDone() { return !!load().honorInit; }
export function setHonorInit() { const m = load(); m.honorInit = true; save(m); }

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
    // higher rarity = more synergies AND a bigger per-trait bonus (relic vals: 1/1/1/2/2)
    const traitCount = r >= 4 ? 3 : r >= 2 ? 2 : 1;
    const per = s.vals[r];
    const tb = {}; for (let i = 0; i < traitCount; i++) { const t = pick(); tb[t] = (tb[t] || 0) + per; }
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
// Open MANY caches at once (capped by Spoils) — the fast path. One load/save, returns the haul.
export function openChests(n, rng) {
  const m = load();
  const can = Math.min(Math.max(0, n | 0), Math.floor(m.spoils / CHEST_COST));
  if (can <= 0) return { ok: false, items: [], count: 0, spoils: m.spoils };
  const items = [];
  for (let i = 0; i < can; i++) {
    m.spoils -= CHEST_COST;
    const slot = SLOTS[Math.floor((rng ? rng() : Math.random()) * SLOTS.length)].id;
    const item = makeItem(slot, rollRarity(rng), rng);
    m.inventory.push(item); items.push(item);
  }
  save(m);
  return { ok: true, items, count: can, spoils: m.spoils };
}
export function affordableChests(m) { m = m || load(); return Math.floor(m.spoils / CHEST_COST); }
// Auto-equip the best (highest-rarity) owned item in each slot if it beats what's equipped.
// Returns the slot ids that changed (for a "N upgrades equipped" message).
export function equipBestPerSlot() {
  const m = load(); const upgraded = [];
  for (const s of SLOTS) {
    const items = m.inventory.filter((it) => it.slot === s.id);
    if (!items.length) continue;
    const best = items.reduce((a, b) => (RIDX[b.rarity] > RIDX[a.rarity] ? b : a));
    const cur = equippedItem(m, s.id);
    if (!cur || RIDX[best.rarity] > RIDX[cur.rarity]) { if (!cur || best.iid !== cur.iid) upgraded.push(s.id); m.equipped[s.id] = best.iid; }
  }
  save(m);
  return upgraded;
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
// "Its own kind": same equipment family (slot) and same tier. Chain all the way:
// common -> rare -> epic -> legendary -> mythic -> ascended -> celestial -> godforged (ceiling).
const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary', 'mythic', 'ascended', 'celestial', 'godforged'];
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
