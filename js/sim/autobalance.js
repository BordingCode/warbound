// Headless balance + pacing harness. Because combat is a pure deterministic function,
// we brute-force thousands of fights offline to measure pacing and spot outlier units.
// Run: node js/sim/autobalance.js
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

// --- 2. Per-unit power: win rate of a 3x-2star board of this unit vs a fixed baseline ---
function baselineBoard(row) {
  return [
    { defId: 'knight_captain', star: 2, col: 3, row: row[0] },
    { defId: 'skeleton_archer', star: 2, col: 2, row: row[1] },
    { defId: 'court_mage', star: 2, col: 4, row: row[1] },
  ];
}
function unitPower() {
  const baseline = baselineBoard([1, 0]);
  const rows = [];
  for (const u of UNITS) {
    const A = [
      { defId: u.defId, star: 2, col: 3, row: 6 },
      { defId: u.defId, star: 2, col: 2, row: 6 },
      { defId: u.defId, star: 2, col: 4, row: 7 },
    ];
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
