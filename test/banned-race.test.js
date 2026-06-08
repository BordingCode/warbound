// Auto-Chess rotation: each run banishes ONE random race — none of its units ever appear in the
// shop, the ban is seed-stable, and it's removed from the pool (not just hidden). No DOM.
// Run: node test/banned-race.test.js
import { freshRun, reroll } from '../js/state/run.js';
import { UNITS, UNITS_BY_ID, ORIGINS } from '../js/data/units.js';

let pass = 0, fail = 0; const fails = [];
const ok = (name, cond, detail) => { if (cond) { pass++; console.log(`  ✓ ${name}${detail ? '  — ' + detail : ''}`); } else { fail++; fails.push(name); console.log(`  ✗ ${name}${detail ? '  — ' + detail : ''}`); } };

console.log('\n=== BANISHED RACE (one race sits out each run) ===');

// 1. every fresh run banishes exactly one real race
{
  const run = freshRun('ban-test-1');
  ok('freshRun sets a bannedRace from the roster', ORIGINS.includes(run.bannedRace), run.bannedRace);
}

// 2. the banished race has zero pool copies; every other race still has copies
{
  const run = freshRun('ban-test-2');
  const bannedIds = UNITS.filter((u) => u.origin === run.bannedRace).map((u) => u.defId);
  ok('all banished-race units are at 0 pool copies', bannedIds.every((id) => run.pool[id] === 0), `${run.bannedRace}: ${bannedIds.length} units`);
  const otherHasCopies = UNITS.filter((u) => u.origin !== run.bannedRace).every((u) => run.pool[u.defId] > 0);
  ok('every non-banished unit still has pool copies', otherHasCopies);
}

// 3. the banished race never appears in the shop across many rerolls
{
  const run = freshRun('ban-test-3');
  run.gold = 99999; run.shopLocked = false;
  let leaks = 0;
  for (let i = 0; i < 200; i++) { reroll(run); for (const id of run.shop) { if (id && UNITS_BY_ID[id] && UNITS_BY_ID[id].origin === run.bannedRace) leaks++; } }
  ok('no banished unit appears across 200 rerolls (1000 slots)', leaks === 0, `banned ${run.bannedRace}, leaks ${leaks}`);
}

// 4. the ban is seed-stable (a shared seed banishes the same race) and varies by seed
{
  const a = freshRun('ban-seed-x'), b = freshRun('ban-seed-x');
  ok('same seed → same banished race', a.bannedRace === b.bannedRace, a.bannedRace);
  const seen = new Set();
  for (let i = 0; i < 40; i++) seen.add(freshRun('ban-vary-' + i).bannedRace);
  ok('different seeds banish different races (not stuck on one)', seen.size >= 3, `${seen.size} distinct over 40 seeds`);
}

// 5. every race is reachable as the banned race (the draw isn't biased to a subset)
{
  const seen = new Set();
  for (let i = 0; i < 400; i++) seen.add(freshRun('ban-cover-' + i).bannedRace);
  ok('every race can be banished', seen.size === ORIGINS.length, `${seen.size}/${ORIGINS.length} races seen`);
}

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ ' + fail + ' FAILED: ' + fails.join(', ')}  (${pass} passed, ${fail} failed)\n`);
process.exit(fail ? 1 : 0);
