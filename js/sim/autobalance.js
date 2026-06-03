// Headless balance + pacing harness. Because combat is a pure deterministic function,
// we brute-force thousands of fights offline to measure pacing and spot outlier units.
// Run: node js/sim/autobalance.js
//
// NOTE on the per-unit read: combat is near-deterministic (RNG only from crit/dodge/proc
// timing), so a FIXED matchup resolves ~0% or ~100% across seeds — the per-unit numbers
// are effectively binary "beats/loses-to baseline", not a smooth gradient. That's enough
// to confirm cost-monotonicity and catch gross outliers, but a proper power gradient needs
// a round-robin over many representative comps with averaged win-rates. TODO (next balance
// pass): author ~12 archetype comps and build the NxN win-rate matrix described in DESIGN §10.
import { simulate } from './combat.js';
import { UNITS, UNITS_BY_ID } from '../data/units.js';
import { LADDER, getEnemyBoard } from '../data/enemies.js';
import { RNG } from '../rng.js';

const SECONDS = (ticks) => (ticks / 30).toFixed(1);

// --- 1. Pacing: how long do fights last? (median target ~8-14s at 1x) ---
function pacing() {
  const rng = new RNG(42);
  const durations = [];
  for (let i = 0; i < 400; i++) {
    const n = rng.int(2, 6);
    const A = [], B = [];
    for (let k = 0; k < n; k++) {
      A.push({ defId: rng.pick(UNITS).defId, star: rng.int(1, 2), col: rng.int(1, 6), row: rng.int(4, 7) });
      B.push({ defId: rng.pick(UNITS).defId, star: rng.int(1, 2), col: rng.int(1, 6), row: rng.int(0, 3) });
    }
    durations.push(simulate(A, B, rng.int(1, 1e6)).result.durationTicks);
  }
  durations.sort((a, b) => a - b);
  const median = durations[durations.length >> 1];
  const p90 = durations[Math.floor(durations.length * 0.9)];
  const capped = durations.filter((d) => d >= 30 * 45).length;
  return { medianS: SECONDS(median), p90S: SECONDS(p90), maxS: SECONDS(durations[durations.length - 1]), cappedPct: ((capped / durations.length) * 100).toFixed(1) };
}

// --- 2. Per-unit power: each unit as a CARRY behind a neutral frontline, vs a fixed
// mixed baseline. Fairer than single-type boards (backliners get a frontline to hide
// behind, melee get peers). Measures marginal carry value within a real formation. ---
function neutralFront(team) {
  const r = team === 'player' ? [5, 5] : [2, 2];
  return [
    { defId: 'bone_guard', star: 2, col: 2, row: r[0] },
    { defId: 'bone_guard', star: 2, col: 5, row: r[1] },
  ];
}
function baselineBoard() {
  return [...neutralFront('enemy'),
    { defId: 'skeleton_archer', star: 2, col: 1, row: 0 },
    { defId: 'court_mage', star: 2, col: 4, row: 0 },
    { defId: 'shadow_dancer', star: 2, col: 6, row: 1 }];
}
function unitPower() {
  const baseline = baselineBoard();
  const rows = [];
  for (const u of UNITS) {
    const carryRow = u.range > 1 ? 7 : 6;     // ranged hide in back, melee mid
    const A = [...neutralFront('player'),
      { defId: u.defId, star: 2, col: 3, row: carryRow },
      { defId: u.defId, star: 2, col: 4, row: carryRow },
      { defId: u.defId, star: 2, col: 2, row: carryRow }];
    let w = 0; const N = 80;
    for (let s = 1; s <= N; s++) if (simulate(A, baseline, s * 13 + 1).result.winner === 'player') w++;
    rows.push({ id: u.defId, cost: u.cost, klass: u.klass, wr: w / N });
  }
  rows.sort((a, b) => b.wr - a.wr);
  return rows;
}

// --- 3. Ladder difficulty: can a reasonable board clear each ladder rung? ---
function ladderCurve() {
  // a "decent player" board scaling roughly with the round
  const out = [];
  for (let r = 1; r <= LADDER.length; r++) {
    const enemy = getEnemyBoard(r, null).units;
    // build a player board of similar net worth: mirror enemy cost with generic units
    const star = Math.min(3, 1 + Math.floor(r / 4));
    const player = enemy.map((e, i) => ({ defId: ['knight_captain', 'skeleton_archer', 'court_mage', 'shadow_dancer', 'field_medic', 'bone_guard'][i % 6], star, col: e.col, row: 7 - (e.row) }));
    let w = 0; const N = 60;
    for (let s = 1; s <= N; s++) if (simulate(player, enemy, s * 7 + 3).result.winner === 'player') w++;
    out.push({ round: r, name: getEnemyBoard(r, null).name, playerWR: (w / N * 100).toFixed(0) + '%' });
  }
  return out;
}

// --- 4. Round-robin: archetype comps vs each other -> win-rate gradient (the real
// balance signal; averaging over many opponents turns binary matchups into a gradient) ---
// place a comp on its half: player on rows 5-7, enemy MIRRORED on rows 0-2 so the two teams
// actually FACE each other across the board (frontline forward, carries back). The old version
// put both teams on rows 5-7 (piled together) which made positioning/movement meaningless.
// Net-worth-equalised stars: cheap units field at higher star, elites at 1★, so a comp's score
// reflects its SYNERGY, not just how pricey its units are (flat 2★ favoured cost-5 comps).
const STAR_BY_COST = { 1: 3, 2: 3, 3: 2, 4: 1, 5: 1 };
function placeComp(defIds, enemy = false) {
  const front = ['knight', 'assassin'], out = []; let fc = 0, bc = 0;
  for (const id of defIds) {
    const u = UNITS_BY_ID[id]; const star = STAR_BY_COST[u.cost] || 1;
    if (front.includes(u.klass)) { out.push({ defId: id, star, col: 1 + (fc % 6), row: enemy ? (fc < 3 ? 1 : 2) : (fc < 3 ? 6 : 5) }); fc++; }
    else { out.push({ defId: id, star, col: 1 + (bc % 6), row: enemy ? (bc % 2 ? 0 : 1) : (bc % 2 ? 7 : 6) }); bc++; }
  }
  return out;
}
// Realistic archetype builds: each = its synergy carries + a real frontline + a healer/support
// (a mono-class glass cannon with no frontline is a strawman, not a comp).
const COMPS = {
  'Knight': ['knight_captain', 'bone_guard', 'thornguard', 'crossbowman', 'court_mage', 'field_medic'],
  'Mage': ['court_mage', 'lich', 'warlock', 'bone_guard', 'thornguard', 'field_medic'],
  'Assassin': ['royal_blade', 'shadow_dancer', 'pack_stalker', 'bone_guard', 'thornguard', 'field_medic'],
  'Undead': ['bone_guard', 'lich', 'skeleton_archer', 'wraith', 'necromancer', 'thornguard'],
  'Demon': ['hellguard', 'warlock', 'fel_archer', 'imp_assassin', 'bone_guard', 'field_medic'],
  'Beast': ['bramble_brute', 'beast_hunter', 'pack_stalker', 'knight_captain', 'druid_healer', 'beastmaster'],
  'Elf': ['thornguard', 'moon_priestess', 'wood_ranger', 'shadow_dancer', 'grove_healer', 'bone_guard'],
  'Ranger': ['crossbowman', 'wood_ranger', 'fel_archer', 'knight_captain', 'thornguard', 'field_medic'],
  'Summoner': ['necromancer', 'pit_summoner', 'beastmaster', 'bone_guard', 'thornguard', 'field_medic'],
  'Dragon': ['dragon_knight', 'dragon_sage', 'knight_captain', 'bone_guard', 'moon_priestess', 'grove_healer'],
  'Bard': ['moonsinger', 'dirgesinger', 'skeleton_archer', 'crossbowman', 'bone_guard', 'thornguard'],
  'Paladin': ['squire', 'oathbreaker', 'dawnblade', 'skeleton_archer', 'court_mage', 'field_medic'],
  'Dwarf': ['ironbeard', 'sharpshooter', 'runeseer', 'mountain_king', 'skeleton_archer', 'field_medic'],
  'Giant': ['hill_brute', 'boulderthrower', 'stormjarl', 'earthshaker', 'court_mage', 'field_medic'],
};
function roundRobin() {
  const names = Object.keys(COMPS);
  const wins = names.map(() => 0), games = names.map(() => 0);
  for (let i = 0; i < names.length; i++) for (let j = 0; j < names.length; j++) {
    if (i === j) continue;
    for (let s = 1; s <= 15; s++) {
      const w = simulate(placeComp(COMPS[names[i]], false), placeComp(COMPS[names[j]], true), s * 31 + 5).result.winner;
      games[i]++; if (w === 'player') wins[i]++;
    }
  }
  return names.map((n, i) => ({ name: n, wr: wins[i] / games[i] })).sort((a, b) => b.wr - a.wr);
}

console.log('=== PACING (target median 8-14s, capped% near 0) ===');
console.log(pacing());
console.log('\n=== UNIT POWER (win% vs fixed baseline; flag >70% or <30%) ===');
const up = unitPower();
for (const r of up) {
  const flag = r.wr > 0.7 ? '  ⚠ STRONG' : r.wr < 0.3 ? '  ⚠ weak' : '';
  console.log(`  ${(r.wr * 100).toFixed(0).padStart(3)}%  ${r.id.padEnd(16)} (c${r.cost} ${r.klass})${flag}`);
}
console.log('\n=== LADDER (player WR with a same-power board; want a downward trend) ===');
for (const r of ladderCurve()) console.log(`  R${String(r.round).padStart(2)}  ${r.playerWR.padStart(4)}  ${r.name}`);

console.log('\n=== COMP ROUND-ROBIN (win% vs the field; healthy ~35-65%, flag outliers) ===');
for (const c of roundRobin()) {
  const flag = c.wr > 0.66 ? '  ⚠ dominant' : c.wr < 0.34 ? '  ⚠ weak' : '';
  console.log(`  ${(c.wr * 100).toFixed(0).padStart(3)}%  ${c.name}${flag}`);
}
