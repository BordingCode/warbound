// Comp-balance probe (DESIGN §10): round-robin of archetype comps over RANDOM legal boards,
// with cost-appropriate stars (cheap units 3★, expensive 1★ — how real boards actually look),
// so it measures TRAIT/synergy balance rather than raw net worth. Prints the head-to-head
// matrix + each comp's average win%. Healthy band ~40–60%. Run: node test/comp-balance.js
import { simulate } from '../js/sim/combat.js';
import { UNITS_BY_ID, STAR_MULT } from '../js/data/units.js';
import { RNG } from '../js/rng.js';

// realistic star by cost: you 3-star cheap units, 1-star the expensive elites
const STAR_BY_COST = { 1: 3, 2: 3, 3: 2, 4: 1, 5: 1 };
const FRONT = new Set(['knight', 'assassin']);

const COMPS = {
  Knight:   ['knight_captain', 'bone_guard', 'thornguard', 'crossbowman', 'court_mage', 'field_medic'],
  Mage:     ['court_mage', 'lich', 'warlock', 'bone_guard', 'thornguard', 'field_medic'],
  Assassin: ['royal_blade', 'shadow_dancer', 'pack_stalker', 'bone_guard', 'thornguard', 'field_medic'],
  Undead:   ['bone_guard', 'lich', 'skeleton_archer', 'wraith', 'necromancer', 'thornguard'],
  Demon:    ['hellguard', 'warlock', 'fel_archer', 'imp_assassin', 'bone_guard', 'field_medic'],
  Beast:    ['bramble_brute', 'beast_hunter', 'pack_stalker', 'knight_captain', 'druid_healer', 'beastmaster'],
  Elf:      ['thornguard', 'moon_priestess', 'wood_ranger', 'shadow_dancer', 'grove_healer', 'bone_guard'],
  Ranger:   ['crossbowman', 'wood_ranger', 'fel_archer', 'knight_captain', 'thornguard', 'field_medic'],
  Summoner: ['necromancer', 'pit_summoner', 'beastmaster', 'bone_guard', 'thornguard', 'field_medic'],
  Dragon:   ['dragon_knight', 'dragon_sage', 'wyrm_archer', 'knight_captain', 'bone_guard', 'grove_healer'],
};

// place a comp on its half with random column jitter (a "random legal board" per DESIGN §10)
function placeComp(ids, enemy, rng) {
  const out = []; const cols = [1, 2, 3, 4, 5, 6];
  // shuffle columns for variety
  for (let i = cols.length - 1; i > 0; i--) { const j = rng.int(0, i); [cols[i], cols[j]] = [cols[j], cols[i]]; }
  let fc = 0, bc = 0;
  for (const id of ids) {
    const u = UNITS_BY_ID[id]; const star = STAR_BY_COST[u.cost] || 1;
    const front = FRONT.has(u.klass);
    const row = enemy ? (front ? (rng.int(0, 1) ? 1 : 2) : (rng.int(0, 1) ? 0 : 1))
                      : (front ? (rng.int(0, 1) ? 6 : 5) : (rng.int(0, 1) ? 7 : 6));
    out.push({ defId: id, star, col: cols[(front ? fc++ : bc++) % 6], row });
  }
  return out;
}
function netWorth(ids) { return ids.reduce((s, id) => s + UNITS_BY_ID[id].cost * (STAR_MULT[STAR_BY_COST[UNITS_BY_ID[id].cost] || 1]), 0); }

const names = Object.keys(COMPS);
const SEEDS = 24;
const matrix = {}; const totW = {}, totG = {};
for (const n of names) { totW[n] = 0; totG[n] = 0; matrix[n] = {}; }
for (const A of names) for (const B of names) {
  if (A === B) { matrix[A][B] = '—'; continue; }
  const rng = new RNG(99);
  let w = 0;
  for (let s = 0; s < SEEDS; s++) {
    const r = simulate(placeComp(COMPS[A], false, rng), placeComp(COMPS[B], true, rng), s * 37 + 11).result.winner;
    if (r === 'player') w++;
    totG[A]++; if (r === 'player') totW[A]++;
  }
  matrix[A][B] = Math.round((w / SEEDS) * 100);
}

// print head-to-head matrix
const pad = (s, n) => String(s).padStart(n);
console.log('\n=== HEAD-TO-HEAD (row beats col, win%) — cost-appropriate stars, random boards ===');
console.log('          ' + names.map((n) => pad(n.slice(0, 4), 5)).join(''));
for (const A of names) console.log(pad(A, 9) + ' ' + names.map((B) => pad(matrix[A][B], 5)).join(''));

console.log('\n=== AVERAGE WIN% (healthy ~40–60%) ===');
const avg = names.map((n) => ({ n, wr: totW[n] / totG[n], nw: netWorth(COMPS[n]) })).sort((a, b) => b.wr - a.wr);
for (const c of avg) {
  const flag = c.wr > 0.60 ? '  ⚠ dominant' : c.wr < 0.40 ? '  ⚠ weak' : '';
  console.log(`  ${pad((c.wr * 100).toFixed(0), 3)}%  ${c.n.padEnd(9)} (net worth ${c.nw.toFixed(1)})${flag}`);
}
const spread = avg[0].wr - avg[avg.length - 1].wr;
console.log(`\n  spread top→bottom: ${(spread * 100).toFixed(0)} pts  (smaller = more balanced)`);
