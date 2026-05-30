// Plain-JS test harness (no framework). Run: node test/run.js
// Asserts the combat sim's core invariants: determinism, termination, power monotonicity.
import { simulate } from '../js/sim/combat.js';
import { UNITS, UNITS_BY_ID } from '../js/data/units.js';
import { RNG } from '../js/rng.js';

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond) { cond ? pass++ : (fail++, fails.push(name)); process.stdout.write(cond ? '.' : 'F'); }
function eq(name, a, b) { ok(`${name} (got ${a}, want ${b})`, a === b); }

// helper: win rate of board A vs board B across N seeds
function winRate(A, B, N = 200) {
  let w = 0;
  for (let s = 1; s <= N; s++) if (simulate(A, B, s).result.winner === 'player') w++;
  return w / N;
}
const pUnit = (defId, star, col, row) => ({ defId, star, col, row });
const eUnit = (defId, star, col, row) => ({ defId, star, col, row });

// ---- 1. Determinism: same boards + seed => byte-identical events ----
{
  // Two assassins -> Assassin trait active -> crit rolls consume RNG, so seed matters.
  const A = [pUnit('imp_assassin', 2, 2, 6), pUnit('royal_blade', 2, 4, 6), pUnit('court_mage', 1, 3, 7)];
  const B = [eUnit('hellguard', 2, 3, 1), eUnit('skeleton_archer', 1, 3, 0), eUnit('bone_guard', 1, 5, 1)];
  const r1 = simulate(A, B, 12345);
  const r2 = simulate(A, B, 12345);
  eq('determinism: same event count', r1.events.length, r2.events.length);
  ok('determinism: identical event stream', JSON.stringify(r1.events) === JSON.stringify(r2.events));
  ok('determinism: different seed differs', JSON.stringify(simulate(A, B, 1).events) !== JSON.stringify(simulate(A, B, 777).events));
}

// ---- 2. Termination: every fight ends before MAX_TICKS (no infinite loops) ----
{
  const rng = new RNG(99);
  let worst = 0, allEnded = true;
  for (let i = 0; i < 60; i++) {
    const A = [], B = [];
    const n = rng.int(1, 6);
    for (let k = 0; k < n; k++) {
      A.push(pUnit(rng.pick(UNITS).defId, rng.int(1, 3), rng.int(0, 7), rng.int(4, 7)));
      B.push(eUnit(rng.pick(UNITS).defId, rng.int(1, 3), rng.int(0, 7), rng.int(0, 3)));
    }
    const r = simulate(A, B, rng.int(1, 1e6));
    worst = Math.max(worst, r.result.durationTicks);
    if (r.result.durationTicks >= 30 * 45) allEnded = false;
    if (!['player', 'enemy', 'draw'].includes(r.result.winner)) allEnded = false;
  }
  ok(`termination: all 60 random fights ended (worst ${worst} ticks)`, allEnded);
}

// ---- 3. Stalemate safety: two all-tank boards still resolve via sudden death ----
{
  const A = [pUnit('knight_captain', 3, 2, 6), pUnit('bone_guard', 3, 4, 6)];
  const B = [eUnit('knight_captain', 3, 2, 1), eUnit('bone_guard', 3, 4, 1)];
  const r = simulate(A, B, 7);
  ok(`stalemate resolves (${r.result.durationTicks} ticks, winner ${r.result.winner})`, r.result.durationTicks < 30 * 45);
}

// ---- 4. Power monotonicity: a 2-star beats the same 1-star ----
{
  for (const id of ['knight_captain', 'court_mage', 'skeleton_archer', 'imp_assassin']) {
    const A = [pUnit(id, 2, 3, 6)];
    const B = [eUnit(id, 1, 3, 1)];
    const wr = winRate(A, B, 60);
    ok(`monotonicity: 2★ ${id} beats 1★ (winrate ${wr.toFixed(2)})`, wr > 0.9);
  }
}

// ---- 5. Star scaling sanity: 3-star beats 2-star of same unit ----
{
  const A = [pUnit('court_mage', 3, 3, 6)];
  const B = [eUnit('court_mage', 2, 3, 1)];
  const wr = winRate(A, B, 60);
  ok(`monotonicity: 3★ court_mage beats 2★ (winrate ${wr.toFixed(2)})`, wr > 0.85);
}

// ---- 6. Roster integrity: every unit has valid stats + ability ----
{
  let good = true;
  for (const u of UNITS) {
    if (!(u.hp > 0 && u.ad > 0 && u.as > 0 && u.range >= 1 && u.maxMana > 0 && u.ability && u.ability.name)) { good = false; fails.push('bad unit ' + u.defId); }
  }
  ok(`roster: all ${UNITS.length} units valid`, good);
}

// ---- summary ----
console.log(`\n\n${pass} passed, ${fail} failed`);
if (fails.length) { console.log('FAILED:'); for (const f of fails) console.log('  - ' + f); process.exit(1); }
console.log('All combat-sim invariants hold ✓');
