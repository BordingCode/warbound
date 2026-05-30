// Run state + economy. The persistent "truth" between fights. Pure-ish logic (uses an
// injected seeded RNG for shop rolls); no DOM. Serialised to localStorage by IDs only.
import { RNG, seedFromString } from '../rng.js';
import { UNITS, UNITS_BY_ID } from '../data/units.js';
import { COMPONENT_IDS, isComponent, combine } from '../data/items.js';
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
export const POOL_COPIES = { 1: 22, 2: 18, 3: 14, 4: 6, 5: 4 };
export const SHOP_SIZE = 5;
export const BENCH_SIZE = 9;
export const REROLL_COST = 2;
export const XP_COST = 4;
export const WIN_TARGET = 10;
export const START_LIVES = 5;

let uidCounter = 1;
const newUid = () => 'u' + (uidCounter++);

const unitsByCost = (() => {
  const m = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  for (const u of UNITS) m[u.cost].push(u.defId);
  return m;
})();

export function freshRun(seedStr = 'warbound-' + Date.now()) {
  const seed = seedFromString(String(seedStr));
  const pool = {};
  for (const u of UNITS) pool[u.defId] = POOL_COPIES[u.cost];
  const run = {
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
function pickUnitOfCost(cost, run) {
  // weight by remaining pool copies so depleted units appear less.
  const ids = unitsByCost[cost].filter((id) => (run.pool[id] || 0) > 0);
  if (!ids.length) return null;
  let total = 0; for (const id of ids) total += run.pool[id];
  let roll = _rng.next() * total;
  for (const id of ids) { roll -= run.pool[id]; if (roll < 0) return id; }
  return ids[ids.length - 1];
}
export function rollShop(run) {
  if (run.shopLocked) return;
  for (let i = 0; i < SHOP_SIZE; i++) {
    const cost = pickCostTier(run.level);
    run.shop[i] = pickUnitOfCost(cost, run);
  }
  saveRngState(run);
}
export function reroll(run) {
  const econ = augmentEcon(run.augments);
  const free = (econ.freeRerolls || 0) - (run.freeRerollsUsed || 0) > 0;
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
export function freeRerollsLeft(run) { const econ = augmentEcon(run.augments); return Math.max(0, (econ.freeRerolls || 0) - (run.freeRerollsUsed || 0)); }

// ---- buy / sell / fuse ----
function allUnits(run) { return [...run.board, ...run.bench.filter(Boolean)]; }
function benchFreeIndex(run) { return run.bench.findIndex((s) => s === null); }

export function buy(run, shopIndex) {
  const defId = run.shop[shopIndex];
  if (!defId) return false;
  const def = UNITS_BY_ID[defId];
  if (run.gold < def.cost) return false;
  if (benchFreeIndex(run) === -1 && !wouldFuse(run, defId, 1)) return false;
  run.gold -= def.cost;
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

export function sellUid(run, uid) {
  const find = (arr) => arr.findIndex((u) => u && u.uid === uid);
  let u = null;
  const bi = find(run.bench);
  if (bi !== -1) { u = run.bench[bi]; run.bench[bi] = null; }
  else { const di = find(run.board); if (di !== -1) { u = run.board[di]; run.board.splice(di, 1); } }
  if (!u) return false;
  const def = UNITS_BY_ID[u.defId];
  const copies = u.star === 1 ? 1 : u.star === 2 ? 3 : 9;
  const value = u.star === 1 ? def.cost : def.cost * copies - (copies - 1); // small upgrade premium
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
export function boardLimit(run) { return run.level + (augmentEcon(run.augments).boardPlus || 0); }

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
    if (run.board.length >= boardLimit(run) && !occ) return false; // over board limit
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
export function equipItem(run, iid, uid) {
  const it = run.items.find((x) => x.iid === iid); if (!it) return false;
  const u = run.board.find((b) => b.uid === uid) || run.bench.find((b) => b && b.uid === uid); if (!u) return false;
  u.items = u.items || [];
  if (u.items.length >= 3) return false;
  if (isComponent(it.id)) {
    const ci = u.items.findIndex(isComponent);
    if (ci !== -1) { const c = combine(u.items[ci], it.id); if (c) u.items[ci] = c; else u.items.push(it.id); }
    else u.items.push(it.id);
  } else u.items.push(it.id);
  run.items = run.items.filter((x) => x.iid !== iid);
  return true;
}

// ---- round resolution ----
export function income(run) {
  const econ = augmentEcon(run.augments);
  const interest = Math.min(5 + (econ.interestCap || 0), Math.floor(run.gold / 10));
  const base = (run.round <= 4 ? 2 : run.round <= 11 ? 4 : 5) + (econ.goldPerRound || 0);
  const streakBonus = run.streak.n >= 5 ? 3 : run.streak.n >= 4 ? 2 : run.streak.n >= 2 ? 1 : 0;
  return { base, interest, streakBonus, total: base + interest + streakBonus };
}

export function resolveRound(run, won) {
  if (won) {
    run.wins++;
    run.streak = { type: 'win', n: run.streak.type === 'win' ? run.streak.n + 1 : 1 };
  } else {
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
  // life back at round 3 if hurt (anti-stomp floor)
  if (run.round === 3 && run.lives < START_LIVES) run.lives++;
  run.round++;
  // Warpath realm: beat all WIN_TARGET warbands to CONQUER the realm (won), or run out of lives.
  if (run.wins >= WIN_TARGET) { run.over = true; run.won = true; }
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
    // backfill fields added after a save was written (forward-compatible migration)
    run.augments = run.augments || run.relics || [];   // relics were renamed to augments
    run.augments = run.augments.filter((id) => AUGMENTS[id]);  // drop any ids no longer valid
    run.banished = run.banished || [];
    if (run.banishLeft == null) run.banishLeft = 1;
    if (run.augRerollLeft == null) run.augRerollLeft = 1;
    run.items = run.items || [];
    run.freeRerollsUsed = run.freeRerollsUsed || 0;
    ensureRng(run);
    return run;
  } catch { return null; }
}
export function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch {} }
