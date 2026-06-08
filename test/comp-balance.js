// Comp-balance probe (DESIGN §10): round-robin of archetype comps over RANDOM legal boards.
// Balance is STAR-DEPENDENT — a fixed star-by-cost lies. We learned this the hard way: with elites
// pinned at 1★ the all-cheap "Knight" board looked unbeatable (94%), but when elites star up like a
// real late game, the ELITE comps lead and Knight is mid-pack. So we measure at TWO star models and
// only flag a comp as TRULY dominant if it leads in BOTH (a real problem, not a star-stage strategy).
//   • REROLL  — early/cheap board: 3★ cheap units, elites still 1★ (a reroll comp's peak)
//   • STARRED — late board: 4-5 cost carries reach 2★ (a fast-econ comp's peak)
// Prints each comp's win% under both + the worst case. Healthy band ~40–60%. Run: node test/comp-balance.js
import { simulate } from '../js/sim/combat.js';
import { UNITS_BY_ID, STAR_MULT } from '../js/data/units.js';
import { RNG } from '../js/rng.js';

const MODELS = {
  REROLL:  { 1: 3, 2: 3, 3: 2, 4: 1, 5: 1 },
  STARRED: { 1: 3, 2: 3, 3: 2, 4: 2, 5: 2 },
};
const FRONT = new Set(['knight', 'assassin']);

const COMPS = {
  Knight:   ['knight_captain', 'bone_guard', 'hellguard', 'crossbowman', 'court_mage', 'field_medic'],
  Mage:     ['court_mage', 'lich', 'warlock', 'orc_shaman', 'bone_guard', 'field_medic'],
  Assassin: ['wraith', 'shadow_dancer', 'pack_stalker', 'imp_assassin', 'bone_guard', 'field_medic'],
  Undead:   ['bone_guard', 'lich', 'skeleton_archer', 'wraith', 'necromancer', 'field_medic'],
  Demon:    ['hellguard', 'warlock', 'fel_archer', 'imp_assassin', 'pit_summoner', 'bone_guard'],
  Beast:    ['bramble_brute', 'beast_hunter', 'pack_stalker', 'druid_healer', 'beastmaster', 'knight_captain'],
  Elf:      ['knight_captain', 'moon_priestess', 'wood_ranger', 'shadow_dancer', 'grove_healer', 'bone_guard'],
  Ranger:   ['crossbowman', 'wood_ranger', 'fel_archer', 'axethrower', 'knight_captain', 'field_medic'],
  Summoner: ['necromancer', 'pit_summoner', 'beastmaster', 'banner_sergeant', 'bone_guard', 'field_medic'],
  Dragon:   ['dragon_knight', 'dragon_sage', 'wyrm_archer', 'knight_captain', 'bone_guard', 'grove_healer'],
};
const names = Object.keys(COMPS);
const SEEDS = 24;

function placeComp(ids, enemy, rng, stars) {
  const out = []; const cols = [1, 2, 3, 4, 5, 6];
  for (let i = cols.length - 1; i > 0; i--) { const j = rng.int(0, i); [cols[i], cols[j]] = [cols[j], cols[i]]; }
  let fc = 0, bc = 0;
  for (const id of ids) {
    const u = UNITS_BY_ID[id]; const star = stars[u.cost] || 1;
    const front = FRONT.has(u.klass);
    const row = enemy ? (front ? (rng.int(0, 1) ? 1 : 2) : (rng.int(0, 1) ? 0 : 1))
                      : (front ? (rng.int(0, 1) ? 6 : 5) : (rng.int(0, 1) ? 7 : 6));
    out.push({ defId: id, star, col: cols[(front ? fc++ : bc++) % 6], row });
  }
  return out;
}
const netWorth = (ids, stars) => ids.reduce((s, id) => s + UNITS_BY_ID[id].cost * (STAR_MULT[stars[UNITS_BY_ID[id].cost] || 1]), 0);

// round-robin under one star model → { name: winRate }
function roundRobin(stars) {
  const totW = {}, totG = {};
  for (const n of names) { totW[n] = 0; totG[n] = 0; }
  for (const A of names) for (const B of names) {
    if (A === B) continue;
    const rng = new RNG(99);
    for (let s = 0; s < SEEDS; s++) {
      const w = simulate(placeComp(COMPS[A], false, rng, stars), placeComp(COMPS[B], true, rng, stars), s * 37 + 11).result.winner;
      totG[A]++; if (w === 'player') totW[A]++;
    }
  }
  const wr = {}; for (const n of names) wr[n] = totW[n] / totG[n];
  return wr;
}

const results = {}; for (const m in MODELS) results[m] = roundRobin(MODELS[m]);

const pad = (s, n) => String(s).padStart(n);
const pct = (x) => pad((x * 100).toFixed(0), 3) + '%';
for (const m in MODELS) {
  console.log(`\n=== ${m} board — AVG WIN% (healthy ~40–60%) ===`);
  const avg = names.map((n) => ({ n, wr: results[m][n] })).sort((a, b) => b.wr - a.wr);
  for (const c of avg) console.log(`  ${pct(c.wr)}  ${c.n.padEnd(9)}${c.wr > 0.6 ? '  ⚠ dominant' : c.wr < 0.4 ? '  ⚠ weak' : ''}`);
  console.log(`  spread: ${((avg[0].wr - avg[avg.length - 1].wr) * 100).toFixed(0)} pts`);
}

// Cross-model verdict: a comp is a REAL balance problem only if it's dominant/weak under BOTH models.
console.log('\n=== CROSS-MODEL VERDICT (REROLL / STARRED → worst case) ===');
const rows = names.map((n) => ({ n, r: results.REROLL[n], s: results.STARRED[n] }))
  .sort((a, b) => Math.max(b.r, b.s) - Math.max(a.r, a.s));
for (const c of rows) {
  const both = c.r > 0.6 && c.s > 0.6 ? '  ⚠⚠ DOMINANT in BOTH' : (c.r < 0.4 && c.s < 0.4 ? '  ⚠⚠ WEAK in BOTH' : (Math.abs(c.r - c.s) > 0.25 ? '  · star-stage swing' : ''));
  console.log(`  ${c.n.padEnd(9)} ${pct(c.r)} / ${pct(c.s)}${both}`);
}
const anyBoth = rows.some((c) => (c.r > 0.6 && c.s > 0.6) || (c.r < 0.4 && c.s < 0.4));
console.log(`\n  ${anyBoth ? '⚠ a comp is out-of-band in BOTH models — a real balance issue' : '✓ no comp is dominant/weak across BOTH star models (star-stage strategies are healthy)'}`);
