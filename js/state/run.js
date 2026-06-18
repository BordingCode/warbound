// Run state + economy. The persistent "truth" between fights. Pure-ish logic (uses an
// injected seeded RNG for shop rolls); no DOM. Serialised to localStorage by IDs only.
import { RNG, seedFromString } from '../rng.js';
import { UNITS, UNITS_BY_ID, ORIGINS } from '../data/units.js';
import { COMPONENT_IDS, isComponent, combine, isEmblem, EMBLEM_IDS } from '../data/items.js';
import { AUGMENTS, AUGMENT_IDS, augmentEcon, OFFER_TIER_WEIGHTS } from '../data/augments.js';
import { activeTraits } from '../data/traits.js';

export const SAVE_KEY = 'warbound_run_v1';

// ---- economy constants (from DESIGN.md §4) ----
export const SHOP_ODDS = {
  1: [100, 0, 0, 0, 0], 2: [100, 0, 0, 0, 0], 3: [75, 25, 0, 0, 0],
  4: [55, 30, 15, 0, 0], 5: [45, 33, 20, 2, 0], 6: [30, 40, 25, 5, 0],
  7: [19, 30, 40, 10, 1], 8: [17, 24, 32, 24, 3], 9: [15, 18, 25, 30, 12],
};
export const XP_TO_NEXT = { 1: 2, 2: 2, 3: 6, 4: 10, 5: 20, 6: 36, 7: 56, 8: 80 };
export const MAX_LEVEL = 9;
// Every unit has at least 9 copies — exactly enough to THREE-STAR one (3 → ★★, 9 → ★★★). The old
// 4-cost=6 / 5-cost=4 made elite 3★s impossible. In solo/Trials/Endless the pool is yours alone
// (enemies are fixed, scripted boards — they never draw from it); in the Ladder this same bag is
// shared by all 8 warlords, so 9 still means at most one of you can 3★ a given elite (Auto-Chess scarcity).
export const POOL_COPIES = { 1: 22, 2: 18, 3: 14, 4: 9, 5: 9 };
export const SHOP_SIZE = 5;
export const BENCH_SIZE = 9;
export const REROLL_COST = 2;
export const XP_COST = 4;
export const WIN_TARGET = 10;
export const START_LIVES = 5;

// ---- Run-start BLESSINGS (solo Warpath/Trials/Endless) — a LATERAL identity pick, the
// "I want a different game today" lever. Reuses the warlord-picker UI + the augment combat/econ
// channels; every blessing is a TRADE-OFF (a plus paired with a minus), never pure +stats, so it
// reshapes HOW you play without inflating power. Three of these are offered at run start.
//   flat:   team combat mods (same COMBAT_KEYS channel as augments) — merged into the sim bundle.
//   econ:   { interestCap, goldPerRound, boardPlus, freeRerolls, xpPerRound } — read by income/boardLimit.
//   start:  one-time fresh-run setup { gold, lives, level, components } — applied in freshRun.
//   hook:   gameplay flags read at the relevant moment { beastDiscount, firstBeastFree }.
export const BLESSINGS = {
  beastmaster: {
    name: "Beastmaster's Call", icon: 'paw', color: '#ffb15a',
    desc: 'Your first Beast bought is FREE, and Beasts cost 1 less. But you start with 2 less gold.',
    start: { gold: -2 }, hook: { beastDiscount: 1, firstBeastFree: true },
  },
  hoarder: {
    name: "Hoarder's Pact", icon: 'coffer', color: '#ffce5c',
    desc: 'Interest cap +3 (bank up to 80g). But you start with 4 less gold.',
    econ: { interestCap: 3 }, start: { gold: -4 },
  },
  glassVanguard: {
    name: 'Glass Vanguard', icon: 'burst', color: '#ff7a3c',
    desc: 'Your whole warband: +13% Attack Damage, but −9% Health. Win fast — or fold.',
    flat: { ad: 0.13, hp: -0.09 },
  },
  ironheart: {
    name: 'Ironheart', icon: 'shield', color: '#b9c4d0',
    desc: 'Your warband: +20 Armor & Magic Resist, but −12% Attack Damage. A grinding war of attrition.',
    flat: { armor: 20, mr: 20, ad: -0.12 },
  },
  warhost: {
    name: 'Warhost', icon: 'sword', color: '#8fd24a',
    desc: 'Field +1 champion (bigger board), but your whole warband has −10% Health. Go wide, stay fragile.',
    econ: { boardPlus: 1 }, flat: { hp: -0.10 },
  },
  scavenger: {
    name: "Scavenger's Luck", icon: 'gem', color: '#54e6c0',
    desc: 'Start with 2 free item components to forge an early item. But you start with 1 less life.',
    start: { components: 2, lives: -1 },
  },
  spendthrift: {
    name: 'Spendthrift', icon: 'star', color: '#ff7eb6',
    desc: 'One free shop reroll every round, and +1 starting level. But your interest cap is halved.',
    econ: { freeRerolls: 1, interestCapOverride: 2 }, start: { level: 1 },
  },
};
export const BLESSING_IDS = Object.keys(BLESSINGS);
const COMBAT_KEYS = ['ad', 'as', 'hp', 'ap', 'armor', 'mr', 'shield', 'vamp', 'thorns', 'critChance', 'critDmg', 'revive'];
// The blessing's combat flat bundle (merged into the sim alongside augments + gear). Empty if none.
export function blessingFlat(run) {
  const b = run && run.blessing && BLESSINGS[run.blessing];
  const out = {};
  if (b && b.flat) for (const k of COMBAT_KEYS) if (b.flat[k]) out[k] = b.flat[k];
  return out;
}
// The blessing's econ contribution (additive to augments). interestCapOverride caps it absolutely.
export function blessingEcon(run) {
  const b = run && run.blessing && BLESSINGS[run.blessing];
  return (b && b.econ) ? b.econ : {};
}
// Discount a unit's shop cost for the active blessing (Beastmaster: Beasts cost 1 less, never below 0).
export function blessingUnitCost(run, def) {
  let c = def.cost;
  const h = run && run.blessing && BLESSINGS[run.blessing] && BLESSINGS[run.blessing].hook;
  if (h && h.beastDiscount && def.origin === 'beast') c = Math.max(0, c - h.beastDiscount);
  return c;
}
// Apply a chosen blessing to a FRESH solo run: set the id, run its one-time start setup, and
// grant any starting components. Called from main.js right after freshRun (before planning).
export function applyBlessing(run, id) {
  if (!id || !BLESSINGS[id]) return;
  run.blessing = id;
  const s = BLESSINGS[id].start;
  if (s) {
    if (s.gold) run.gold = Math.max(0, run.gold + s.gold);
    if (s.lives) run.lives = Math.max(1, run.lives + s.lives);
    if (s.level) { run.level += s.level; if (run.level > MAX_LEVEL) run.level = MAX_LEVEL; }
    if (s.components) for (let i = 0; i < s.components; i++) run.items.push({ iid: newUid(), id: COMPONENT_IDS[Math.floor(_rng.next() * COMPONENT_IDS.length)] });
  }
  // Beastmaster's first-Beast-free is a live flag consumed by the first Beast purchase.
  const h = BLESSINGS[id].hook;
  if (h && h.firstBeastFree) run.firstBeastFree = true;
  saveRngState(run);
}

let uidCounter = 1;
const newUid = () => 'u' + (uidCounter++);

const unitsByCost = (() => {
  const m = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  for (const u of UNITS) m[u.cost].push(u.defId);
  return m;
})();

export function freshRun(seedStr = 'warbound-' + Date.now()) {
  const seed = seedFromString(String(seedStr));
  _rng = new RNG(seed);
  // Auto-Chess-style rotation: ONE random race sits out this whole run — none of its units ever
  // appear in your shop (you'll still FACE that race in enemy warbands). Drawn from the seed first,
  // so a shared seed always banishes the same race. revealed to the player in a "gameshow" spin.
  const bannedRace = ORIGINS[Math.floor(_rng.next() * ORIGINS.length)];
  const pool = {};
  for (const u of UNITS) pool[u.defId] = (u.origin === bannedRace) ? 0 : POOL_COPIES[u.cost];
  const run = {
    bannedRace,
    v: 1, seedStr, seed,
    round: 1, gold: 10, lives: START_LIVES, wins: 0, losses: 0,   // enough to buy a starting team freely
    level: 2, xp: 0,
    bench: Array(BENCH_SIZE).fill(null),
    board: [],
    items: [],
    augments: [],
    banished: [],
    banishLeft: 1,
    augRerollLeft: 1,
    freeRerollsUsed: 0,
    shop: Array(SHOP_SIZE).fill(null),
    shopLocked: false,
    streak: { type: null, n: 0 },
    pool,
    rngState: null,
    over: false, won: false,
    realm: 0,   // which Warpath realm this run is attempting (set by startSolo)
  };
  // No starting champions — the player buys their team freely from the shop with the
  // starting gold above. Round 1 is the gentle "Lone Brigand" so a quick buy can win it.
  _rng = new RNG(seed);
  rollShop(run);
  saveRngState(run);
  return run;
}

let _rng = new RNG(1);
function saveRngState(run) { run.rngState = _rng.save(); }
function ensureRng(run) { _rng = new RNG(run.seed); if (run.rngState) _rng.load(run.rngState); }

// ---- shop ----
function pickCostTier(level) {
  const odds = SHOP_ODDS[level] || SHOP_ODDS[9];
  const roll = _rng.next() * 100;
  let acc = 0;
  for (let c = 1; c <= 5; c++) { acc += odds[c - 1]; if (roll < acc) return c; }
  return 1;
}
// P1.1 — "behind" check for the underdog supply. Solo/Trials/Endless run on lives; ≤2 = danger.
export function isUnderdog(run) { return run.mode !== 'ladder' && (run.lives || 0) <= 2; }
// origins+classes currently on your board — what the underdog supply favours (helps you complete
// the synergies you're already building, rather than handing you a random pivot).
function boardTraitSet(run) {
  const s = new Set();
  for (const u of run.board) { const d = UNITS_BY_ID[u.defId]; if (d) { s.add(d.origin); s.add(d.klass); } }
  return s;
}
function pickUnitOfCost(cost, run) {
  // weight by remaining pool copies so depleted units appear less.
  const ids = unitsByCost[cost].filter((id) => (run.pool[id] || 0) > 0);
  if (!ids.length) return null;
  // Underdog supply (transparent rubber-band): when you're behind, favour units that match a
  // trait already on your board — DESIGN §7.3 "rubber-band the rewards, not the combat".
  const fav = isUnderdog(run) ? boardTraitSet(run) : null;
  const w = {}; let total = 0;
  for (const id of ids) {
    let weight = run.pool[id];
    if (fav) { const d = UNITS_BY_ID[id]; if (d && (fav.has(d.origin) || fav.has(d.klass))) weight *= 1.6; }
    w[id] = weight; total += weight;
  }
  let roll = _rng.next() * total;
  for (const id of ids) { roll -= w[id]; if (roll < 0) return id; }
  return ids[ids.length - 1];
}
export function rollShop(run) {
  if (run.shopLocked) return;
  run.underdogSupply = isUnderdog(run);   // surfaced in the shop UI (transparent, never hidden)
  for (let i = 0; i < SHOP_SIZE; i++) {
    const cost = pickCostTier(run.level);
    run.shop[i] = pickUnitOfCost(cost, run);
  }
  saveRngState(run);
}
export function reroll(run) {
  const free = freeRerollsLeft(run) > 0;
  if (!free && run.gold < REROLL_COST) return false;
  if (free) run.freeRerollsUsed = (run.freeRerollsUsed || 0) + 1;
  else run.gold -= REROLL_COST;
  const wasLocked = run.shopLocked; run.shopLocked = false;
  rollShop(run); run.shopLocked = wasLocked;
  return true;
}

// ---- augments ----
export function addAugment(run, id) {
  if (run.augments.includes(id)) return;
  run.augments.push(id);
  const a = AUGMENTS[id];
  if (a && a.once && a.once.lifeMax) run.lives += a.once.lifeMax;
}
export function banishAugment(run, id) {
  if ((run.banishLeft || 0) <= 0 || run.augments.includes(id)) return false;
  run.banished = run.banished || [];
  if (!run.banished.includes(id)) run.banished.push(id);
  run.banishLeft = (run.banishLeft || 0) - 1;
  return true;
}
// Offer 3 augments: tiers weighted by which offer this is, biased toward the player's
// active synergies (with at least one off-build "pivot"), never all-economy.
export function draftAugments(run) {
  const offerIdx = Math.min(run.augments.length, OFFER_TIER_WEIGHTS.length - 1);
  const weights = OFFER_TIER_WEIGHTS[offerIdx];
  const owned = new Set(run.augments);
  const banned = new Set(run.banished || []);
  const avail = AUGMENT_IDS.filter((id) => !owned.has(id) && !banned.has(id));
  // player's active synergies (for smart weighting)
  const myTraits = new Set(Object.keys(activeTraits(run.board.map((u) => UNITS_BY_ID[u.defId]))));
  const byTier = { common: [], rare: [], prismatic: [] };
  for (const id of avail) byTier[AUGMENTS[id].tier].push(id);

  const rollTier = () => {
    const r = _rng.next() * 100; let acc = 0;
    for (const t of ['common', 'rare', 'prismatic']) { acc += weights[t] || 0; if (r < acc) return t; }
    return 'common';
  };
  const pickFromTier = (tier, picked) => {
    let pool = byTier[tier].filter((id) => !picked.has(id));
    if (!pool.length) pool = ['common', 'rare', 'prismatic'].flatMap((t) => byTier[t]).filter((id) => !picked.has(id));
    if (!pool.length) return null;
    // weighted: synergy augments matching my traits are 3x more likely to appear
    const weighted = [];
    for (const id of pool) { const a = AUGMENTS[id]; const w = (a.wantTrait && myTraits.has(a.wantTrait)) ? 3 : 1; for (let i = 0; i < w; i++) weighted.push(id); }
    return weighted[Math.floor(_rng.next() * weighted.length)];
  };

  const picked = new Set();
  const out = [];
  for (let i = 0; i < 3; i++) { const id = pickFromTier(rollTier(), picked); if (id) { picked.add(id); out.push(id); } }
  // never offer all-economy: swap the last for a non-econ option if possible
  if (out.length === 3 && out.every((id) => AUGMENTS[id].cat === 'econ')) {
    const alt = avail.find((id) => !picked.has(id) && AUGMENTS[id].cat !== 'econ');
    if (alt) out[2] = alt;
  }
  saveRngState(run);
  return out;
}
export function freeRerollsLeft(run) { const econ = augmentEcon(run.augments); return Math.max(0, (econ.freeRerolls || 0) + (blessingEcon(run).freeRerolls || 0) - (run.freeRerollsUsed || 0)); }

// ---- buy / sell / fuse ----
function allUnits(run) { return [...run.board, ...run.bench.filter(Boolean)]; }
function benchFreeIndex(run) { return run.bench.findIndex((s) => s === null); }

export function buy(run, shopIndex) {
  const defId = run.shop[shopIndex];
  if (!defId) return false;
  const def = UNITS_BY_ID[defId];
  // Blessing pricing: Beastmaster discounts Beasts, and makes your FIRST Beast bought free.
  let price = blessingUnitCost(run, def);
  const firstBeastFree = run.firstBeastFree && def.origin === 'beast';
  if (firstBeastFree) price = 0;
  if (run.gold < price) return false;
  if (benchFreeIndex(run) === -1 && !wouldFuse(run, defId, 1)) return false;
  run.gold -= price;
  if (firstBeastFree) run.firstBeastFree = false;   // one-time: consume the free-Beast charge
  run.pool[defId] = Math.max(0, (run.pool[defId] || 0) - 1);
  run.shop[shopIndex] = null;
  const idx = benchFreeIndex(run);
  const unit = { uid: newUid(), defId, star: 1, items: [] };
  if (idx !== -1) run.bench[idx] = unit;
  else run.bench.push(unit);          // transient overflow; fuse will reclaim a slot
  fuseAll(run);
  normalizeBench(run);
  return true;
}

// does buying another copy immediately trigger a fuse (so bench-full is OK)?
function wouldFuse(run, defId, star) {
  const n = allUnits(run).filter((u) => u.defId === defId && u.star === star).length;
  return n >= 2;
}
// Compact filled slots to the front and pad to BENCH_SIZE (called after transient overflow).
function normalizeBench(run) {
  const filled = run.bench.filter(Boolean);
  run.bench = filled.concat(Array(Math.max(0, BENCH_SIZE - filled.length)).fill(null)).slice(0, BENCH_SIZE);
}

// Combine any 3 copies of same defId+star into one of star+1 (recursive to 3★).
export function fuseAll(run) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let star = 1; star <= 2; star++) {
      const groups = {};
      const collect = (u, where, i) => {
        if (u && u.star === star) { (groups[u.defId] = groups[u.defId] || []).push({ u, where, i }); }
      };
      run.bench.forEach((u, i) => collect(u, 'bench', i));
      run.board.forEach((u, i) => collect(u, 'board', i));
      for (const [defId, list] of Object.entries(groups)) {
        if (list.length >= 3) {
          const three = list.slice(0, 3);
          // keep the first (prefer board position), remove the others
          const keep = three.find((x) => x.where === 'board') || three[0];
          for (const x of three) {
            if (x === keep) continue;
            if (x.where === 'bench') run.bench[x.i] = null;
            else run.board[x.i] = null;
          }
          keep.u.star = star + 1;
          run.board = run.board.filter(Boolean);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }
  run.board = run.board.filter(Boolean);
}

// Gold returned for selling a unit at its current star. A ★★ unit is worth 3 copies and a ★★★
// 9 copies, minus a small flat sell tax per tier (1 / 2) — so a higher star ALWAYS sells for more
// than a lower one (the old `copies-1` tax over-charged cheap units: a cost-1 ★★ sold for just 1).
export function sellValueOf(defId, star) {
  const def = UNITS_BY_ID[defId];
  if (!def) return 0;
  const copies = star === 1 ? 1 : star === 2 ? 3 : 9;
  const tax = star === 1 ? 0 : star === 2 ? 1 : 2;
  return def.cost * copies - tax;
}
// Find an owned unit (board or bench) by uid, for sell-value lookups.
export function findUnit(run, uid) {
  return run.board.find((u) => u && u.uid === uid) || run.bench.find((u) => u && u.uid === uid) || null;
}

export function sellUid(run, uid) {
  const find = (arr) => arr.findIndex((u) => u && u.uid === uid);
  let u = null;
  const bi = find(run.bench);
  if (bi !== -1) { u = run.bench[bi]; run.bench[bi] = null; }
  else { const di = find(run.board); if (di !== -1) { u = run.board[di]; run.board.splice(di, 1); } }
  if (!u) return false;
  const def = UNITS_BY_ID[u.defId];
  const copies = u.star === 1 ? 1 : u.star === 2 ? 3 : 9;
  const value = sellValueOf(u.defId, u.star); // small upgrade premium baked in
  run.gold += value;
  run.pool[u.defId] = (run.pool[u.defId] || 0) + copies;
  if (u.items && u.items.length) for (const id of u.items) run.items.push({ iid: newUid(), id });  // items returned
  return true;
}

// ---- xp / level ----
export function buyXP(run) {
  if (run.gold < XP_COST || run.level >= MAX_LEVEL) return false;
  run.gold -= XP_COST; run.xp += XP_COST;
  while (run.level < MAX_LEVEL && run.xp >= XP_TO_NEXT[run.level]) { run.xp -= XP_TO_NEXT[run.level]; run.level++; }
  return true;
}
export function xpNeeded(run) { return XP_TO_NEXT[run.level] || 0; }
export function boardLimit(run) { return run.level + (augmentEcon(run.augments).boardPlus || 0) + (blessingEcon(run).boardPlus || 0); }

// ---- placement (drag results) ----
export function placeOnBoard(run, uid, col, row) {
  // find the unit (bench or board)
  let u = null, fromBench = -1, fromBoard = -1;
  fromBench = run.bench.findIndex((s) => s && s.uid === uid);
  if (fromBench !== -1) u = run.bench[fromBench];
  else { fromBoard = run.board.findIndex((s) => s.uid === uid); if (fromBoard !== -1) u = run.board[fromBoard]; }
  if (!u) return false;
  if (row < 4) return false; // player half only (rows 4..7)
  // occupant of target tile?
  const occ = run.board.find((s) => s.col === col && s.row === row && s.uid !== uid);
  if (fromBench !== -1) {
    // You MAY place more units than your limit (e.g. 9 on a 7-cap board) — the over-cap units are
    // flagged and you simply can't START the battle until you're back within the cap (see startCombat).
    if (occ) { // swap bench<->board
      run.bench[fromBench] = occ;
      const oi = run.board.indexOf(occ); run.board[oi] = { ...u, col, row };
    } else {
      run.bench[fromBench] = null;
      run.board.push({ ...u, col, row });
    }
  } else { // moving within board
    if (occ) { const t = { col: occ.col, row: occ.row }; occ.col = u.col; occ.row = u.row; u.col = t.col; u.row = t.row; }
    else { u.col = col; u.row = row; }
  }
  return true;
}
export function benchUnit(run, uid) { // move a board unit back to bench
  const di = run.board.findIndex((s) => s.uid === uid);
  if (di === -1) return false;
  const free = benchFreeIndex(run); if (free === -1) return false;
  const u = run.board.splice(di, 1)[0];
  run.bench[free] = { uid: u.uid, defId: u.defId, star: u.star, items: u.items || [] };
  return true;
}

// ---- items ----
export function addItem(run, id) { run.items.push({ iid: newUid(), id }); }
export function draftComponents(run) { const ids = _rng.shuffle(COMPONENT_IDS).slice(0, 3); saveRngState(run); return ids; }
// One random component (seeded) — the guaranteed loot a Neutral Camp drops when cleared.
export function randomComponent(run) { const id = COMPONENT_IDS[Math.floor(_rng.next() * COMPONENT_IDS.length)]; saveRngState(run); return id; }
// Warpath-only: offer 3 distinct emblems (grant a trait to one unit). Ladder never calls this.
export function draftEmblems(run) { const ids = _rng.shuffle(EMBLEM_IDS.slice()).slice(0, 3); saveRngState(run); return ids; }

// The Carousel (Auto Chess): 5 free champions on a wheel, each carrying an item component. Catch-up
// — the fewer lives you have, the higher-cost the units on offer. Respects the banished race (only
// units still in the pool). Seeded, so a shared seed shows the same wheel. Warpath-family only.
export function draftCarousel(run) {
  const lives = run.lives != null ? run.lives : START_LIVES;
  const targetCost = lives >= 4 ? 2 : lives >= 3 ? 3 : 4;             // behind → a richer wheel
  const weightFor = (cost) => 1 / (1 + Math.abs(cost - targetCost) * 1.4);  // peaks at targetCost, never 0
  const all = [];
  for (let c = 1; c <= 5; c++) for (const id of unitsByCost[c]) if ((run.pool[id] || 0) > 0) all.push({ id, cost: c });
  const picks = [], taken = new Set();
  let guard = 0;
  while (picks.length < 5 && guard++ < 500) {
    const avail = all.filter((u) => !taken.has(u.id));
    if (!avail.length) break;
    const total = avail.reduce((a, u) => a + weightFor(u.cost), 0);
    let r = _rng.next() * total, chosen = avail[avail.length - 1];
    for (const u of avail) { r -= weightFor(u.cost); if (r < 0) { chosen = u; break; } }
    taken.add(chosen.id);
    picks.push({ unitId: chosen.id, itemId: COMPONENT_IDS[Math.floor(_rng.next() * COMPONENT_IDS.length)] });
  }
  saveRngState(run);
  return picks;
}

// Grant a free 1★ champion straight to the bench (carousel pick): no gold, no shop slot. Decrements
// the shared pool and auto-fuses like a normal buy. Returns the new unit's uid (or null if no def).
export function grantUnit(run, defId) {
  const def = UNITS_BY_ID[defId]; if (!def) return null;
  run.pool[defId] = Math.max(0, (run.pool[defId] || 0) - 1);
  const idx = benchFreeIndex(run);
  const unit = { uid: newUid(), defId, star: 1, items: [] };
  if (idx !== -1) run.bench[idx] = unit; else run.bench.push(unit);   // transient overflow; fuse reclaims
  fuseAll(run); normalizeBench(run);
  return unit.uid;
}
export function equipItem(run, iid, uid) {
  const it = run.items.find((x) => x.iid === iid); if (!it) return false;
  if (isEmblem(it.id) && run.mode === 'ladder') return false;   // emblems are Warpath-only (keep PvP pure)
  const u = run.board.find((b) => b.uid === uid) || run.bench.find((b) => b && b.uid === uid); if (!u) return false;
  u.items = u.items || [];
  // A dropped component first tries to COMBINE with a component already on the unit — that just
  // upgrades a slot in place (count unchanged), so it must stay allowed even on a FULL unit
  // (3 items). Only block when there's nothing to combine with and no free slot.
  let combineIdx = -1, combined = null;
  if (isComponent(it.id)) {
    for (let i = 0; i < u.items.length; i++) {
      if (isComponent(u.items[i])) { const c = combine(u.items[i], it.id); if (c) { combineIdx = i; combined = c; break; } }
    }
  }
  if (combineIdx === -1 && u.items.length >= 3) return false;
  if (combineIdx !== -1) u.items[combineIdx] = combined;
  else u.items.push(it.id);
  run.items = run.items.filter((x) => x.iid !== iid);
  return true;
}

// ---- round resolution ----
export function income(run) {
  const econ = augmentEcon(run.augments);
  const be = blessingEcon(run);
  // interest cap: base 5 + augment + blessing bonuses, unless a blessing OVERRIDES it absolutely (Spendthrift).
  const cap = be.interestCapOverride != null ? be.interestCapOverride : (5 + (econ.interestCap || 0) + (be.interestCap || 0));
  const interest = Math.min(cap, Math.floor(run.gold / 10));
  const base = (run.round <= 4 ? 2 : run.round <= 11 ? 4 : 5) + (econ.goldPerRound || 0) + (be.goldPerRound || 0);
  const streakBonus = run.streak.n >= 5 ? 3 : run.streak.n >= 4 ? 2 : run.streak.n >= 2 ? 1 : 0;
  return { base, interest, streakBonus, total: base + interest + streakBonus };
}

// Warpath "Neutral Camp" rounds (Auto-Chess creep rounds): a breather PvE round vs wild monsters
// that drops loot and does NOT count toward the realm's 10 warbands. Keyed to the ROUND number
// (decoupled from wins). Warpath only — Trials/Endless/Ladder are unaffected.
export const CREEP_ROUNDS = [1, 7];
export function isCreepRoundNum(round) { return CREEP_ROUNDS.includes(round); }
// Ascension A1 ("No Quarter"): the Neutral-Camp breather rounds become real warbands instead.
export function isCreepRound(run) { return run.mode === 'solo' && (run.ascension || 0) < 1 && CREEP_ROUNDS.includes(run.round); }

export function resolveRound(run, won) {
  const creep = isCreepRound(run);   // a camp win pays gold but doesn't advance warband progress
  if (won) {
    if (!creep) run.wins++;
    run.streak = { type: 'win', n: run.streak.type === 'win' ? run.streak.n + 1 : 1 };
  } else {
    // A defeat costs a life. The foe is keyed to wins, so the next round replays the SAME warband
    // (your economy grows so you can break the wall) — but only while you have lives left.
    run.lives--; run.losses++;
    run.streak = { type: 'loss', n: run.streak.type === 'loss' ? run.streak.n + 1 : 1 };
  }
  // payout (win bonus +1)
  const inc = income(run);
  run.gold += inc.total + (won ? 1 : 0);
  // passive xp every round (TFT-style), plus any relic xp
  const bonusXp = 2 + (augmentEcon(run.augments).xpPerRound || 0);
  if (bonusXp && run.level < MAX_LEVEL) { run.xp += bonusXp; while (run.level < MAX_LEVEL && run.xp >= XP_TO_NEXT[run.level]) { run.xp -= XP_TO_NEXT[run.level]; run.level++; } }
  run.freeRerollsUsed = 0;
  // life back at round 3 if hurt (anti-stomp floor) — Ascension A4 ("No Mercy") removes this net.
  if (run.round === 3 && run.lives < (run.startLives || START_LIVES) && (run.ascension || 0) < 4) run.lives++;
  run.round++;
  // beat all (winTarget) foes to win (Warpath=10 warbands, Trials=5 bosses), or run out of lives.
  // Endless never "wins" by count — it only ends when your lives run out (depth = how far you got).
  if (run.mode !== 'endless' && run.wins >= (run.winTarget || WIN_TARGET)) { run.over = true; run.won = true; }
  if (run.lives <= 0) { run.over = true; run.won = false; }
  ensureRng(run);
  rollShop(run);                   // respects shopLocked (frozen shop persists)
  run.shopLocked = false;          // freeze lasts one round (TFT-style auto-unfreeze)
  return run;
}

// ---- persistence ----
export function save(run) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(run)); } catch {} }
export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw);
    if (run.v !== 1) return null;
    if (run.over) { clearSave(); return null; }   // a FINISHED run never restores (boot → menu, not the last fight)
    // backfill fields added after a save was written (forward-compatible migration)
    run.augments = run.augments || run.relics || [];   // relics were renamed to augments
    run.augments = run.augments.filter((id) => AUGMENTS[id]);  // drop any ids no longer valid
    run.banished = run.banished || [];
    if (run.ascension == null) run.ascension = 0;     // opt-in difficulty rung (Warpath only)
    if (run.blessing && !BLESSINGS[run.blessing]) run.blessing = null;   // drop a blessing id no longer valid
    if (run.banishLeft == null) run.banishLeft = 1;
    if (run.augRerollLeft == null) run.augRerollLeft = 1;
    run.items = run.items || [];
    run.freeRerollsUsed = run.freeRerollsUsed || 0;
    // drop any units a roster change removed (e.g. retired champions) so an old save can't crash
    // the renderer with an unknown defId.
    run.board = (run.board || []).filter((u) => u && UNITS_BY_ID[u.defId]);
    run.bench = (run.bench || []).map((u) => (u && UNITS_BY_ID[u.defId]) ? u : null);
    ensureRng(run);
    // uids ('u<n>') come from a module counter that resets to 1 on every page load. A reloaded
    // run already holds uids u1..uN, so without this a freshly bought unit would reuse an existing
    // uid — causing the wrong unit to animate, or a unit to vanish (find-by-uid hit the wrong one).
    // Bump the counter past every uid/iid already in the save.
    const uidNum = (s) => { const m = /^u(\d+)$/.exec(s || ''); return m ? +m[1] : 0; };
    let hi = 0;
    for (const u of run.board || []) hi = Math.max(hi, uidNum(u && u.uid));
    for (const u of run.bench || []) hi = Math.max(hi, uidNum(u && u.uid));
    for (const it of run.items || []) hi = Math.max(hi, uidNum(it && it.iid));
    if (hi >= uidCounter) uidCounter = hi + 1;
    return run;
  } catch { return null; }
}
export function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch {} }
