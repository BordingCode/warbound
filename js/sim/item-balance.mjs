// Item balance detector. Measures each combined item's MARGINAL win-rate when equipped on a
// comp's CARRIES (its back-line damage units), vs the no-item baseline, across the same 10
// archetype round-robin the augment tool uses. Items live on single units (not team-wide), so
// we put one copy on each of the comp's up-to-3 carries — the realistic "itemise your carry" case.
// Reports avg Δ (general power) + best per-comp Δ, flags over/under-tuned items vs the item median.
// Prints a report; edits NOTHING. Run: node js/sim/item-balance.mjs   [SEEDS=16]
import { simulate } from './combat.js';
import { UNITS_BY_ID } from '../data/units.js';
import { RNG } from '../rng.js';
import { ITEMS } from '../data/items.js';

const STAR_BY_COST = { 1: 3, 2: 3, 3: 2, 4: 1, 5: 1 };
const FRONT = new Set(['knight', 'assassin']);
const COMPS = {
  Knight:   ['knight_captain', 'bone_guard', 'hellguard', 'crossbowman', 'court_mage', 'field_medic'],
  Mage:     ['court_mage', 'lich', 'warlock', 'runeseer', 'bone_guard', 'field_medic'],
  Assassin: ['wraith', 'shadow_dancer', 'pack_stalker', 'imp_assassin', 'bone_guard', 'field_medic'],
  Undead:   ['bone_guard', 'lich', 'skeleton_archer', 'wraith', 'necromancer', 'death_knight'],
  Demon:    ['hellguard', 'warlock', 'fel_archer', 'imp_assassin', 'bone_guard', 'field_medic'],
  Beast:    ['bramble_brute', 'beast_hunter', 'pack_stalker', 'knight_captain', 'druid_healer', 'beastmaster'],
  Elf:      ['moonsinger', 'moon_priestess', 'wood_ranger', 'shadow_dancer', 'grove_healer', 'bone_guard'],
  Ranger:   ['crossbowman', 'wood_ranger', 'fel_archer', 'knight_captain', 'sharpshooter', 'field_medic'],
  Summoner: ['necromancer', 'pit_summoner', 'beastmaster', 'banner_sergeant', 'bone_guard', 'field_medic'],
  Dragon:   ['dragon_knight', 'dragon_sage', 'wyrm_archer', 'knight_captain', 'bone_guard', 'grove_healer'],
};
const names = Object.keys(COMPS);
const SEEDS = parseInt(process.env.SEEDS || '16', 10);

// place a comp; optionally equip `itemId` on up to 3 of its CARRIES (back-line, non-front class).
function placeComp(ids, enemy, rng, itemId) {
  const out = []; const cols = [1, 2, 3, 4, 5, 6];
  for (let i = cols.length - 1; i > 0; i--) { const j = rng.int(0, i); [cols[i], cols[j]] = [cols[j], cols[i]]; }
  let fc = 0, bc = 0, equipped = 0;
  for (const id of ids) {
    const u = UNITS_BY_ID[id]; const star = STAR_BY_COST[u.cost] || 1; const front = FRONT.has(u.klass);
    const row = enemy ? (front ? (rng.int(0, 1) ? 1 : 2) : (rng.int(0, 1) ? 0 : 1))
                      : (front ? (rng.int(0, 1) ? 6 : 5) : (rng.int(0, 1) ? 7 : 6));
    const entry = { defId: id, star, col: cols[(front ? fc++ : bc++) % 6], row };
    if (itemId && !front && equipped < 3) { entry.items = [itemId]; equipped++; }
    out.push(entry);
  }
  return out;
}

// win-rate of comp A vs all other comps, A's carries optionally holding `itemId`.
function compWR(A, itemId) {
  let w = 0, g = 0;
  for (const B of names) {
    if (A === B) continue;
    const rng = new RNG(99);
    for (let s = 0; s < SEEDS; s++) {
      if (simulate(placeComp(COMPS[A], false, rng, itemId), placeComp(COMPS[B], true, rng, null), s * 37 + 11).result.winner === 'player') w++;
      g++;
    }
  }
  return w / g;
}

const baseWR = {}; for (const A of names) baseWR[A] = compWR(A, null);
const baseAvg = names.reduce((s, A) => s + baseWR[A], 0) / names.length;

const rows = [];
for (const id of Object.keys(ITEMS)) {
  let sum = 0, best = -Infinity, bestComp = '';
  for (const A of names) { const d = compWR(A, id) - baseWR[A]; sum += d; if (d > best) { best = d; bestComp = A; } }
  rows.push({ id, name: ITEMS[id].name, avg: sum / names.length, best, bestComp });
}

const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const med = median(rows.map((r) => r.avg));
const pct = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1);
rows.sort((x, y) => y.avg - x.avg);
console.log(`\n=== ITEM MARGINAL WIN-RATE (baseline comp avg ${(baseAvg * 100).toFixed(1)}%, 3 carries each, SEEDS=${SEEDS}) ===`);
console.log(`Item-median avgΔ = ${pct(med)}. Flags = ≥8pts off the item median.`);
console.log('  avgΔ   bestΔ (comp)        item');
const OUT = 0.08;
for (const r of rows) {
  const flag = r.avg - med >= OUT ? `  ⚠ strong (+${((r.avg - med) * 100).toFixed(0)} vs median)`
    : med - r.avg >= OUT ? `  ✗ weak (${((r.avg - med) * 100).toFixed(0)} vs median)` : '';
  console.log(`  ${pct(r.avg).padStart(5)}  ${pct(r.best).padStart(5)} ${('(' + r.bestComp + ')').padEnd(11)} ${r.name}${flag}`);
}
console.log('');
