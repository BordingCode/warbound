// The Carousel (Auto Chess free-champion pick). draftCarousel offers 5 valid units each with an
// item, never the banished race, catch-up by lives; grantUnit drops one on the bench & fuses.
// Run: node test/carousel.test.js
import { freshRun, draftCarousel, grantUnit } from '../js/state/run.js';
import { UNITS_BY_ID, UNITS } from '../js/data/units.js';
import { isComponent } from '../js/data/items.js';

let pass = 0, fail = 0; const fails = [];
const ok = (name, cond, detail) => { if (cond) { pass++; console.log(`  ✓ ${name}${detail ? '  — ' + detail : ''}`); } else { fail++; fails.push(name); console.log(`  ✗ ${name}${detail ? '  — ' + detail : ''}`); } };

console.log('\n=== THE CAROUSEL (free champion + item) ===');

// 1. offers 5 distinct real units, each carrying a real component, never the banished race
{
  const run = freshRun('carousel-1');
  const picks = draftCarousel(run);
  ok('offers 5 picks', picks.length === 5, `${picks.length}`);
  ok('all are real units', picks.every((p) => UNITS_BY_ID[p.unitId]));
  ok('all carry a real component item', picks.every((p) => isComponent(p.itemId)));
  ok('all 5 units are distinct', new Set(picks.map((p) => p.unitId)).size === 5);
  ok('none is the banished race', picks.every((p) => UNITS_BY_ID[p.unitId].origin !== run.bannedRace), `banned ${run.bannedRace}`);
}

// 2. catch-up: fewer lives → a higher average unit cost on the wheel
{
  const avgCost = (lives, seed) => { const r = freshRun(seed); r.lives = lives; return draftCarousel(r).reduce((a, p) => a + UNITS_BY_ID[p.unitId].cost, 0) / 5; };
  let healthy = 0, desperate = 0; const N = 30;
  for (let i = 0; i < N; i++) { healthy += avgCost(5, 'cc-h-' + i); desperate += avgCost(1, 'cc-d-' + i); }
  healthy /= N; desperate /= N;
  ok('behind (1 life) offers richer units than healthy (5 lives)', desperate > healthy, `avg cost ${healthy.toFixed(2)} → ${desperate.toFixed(2)}`);
}

// 3. grantUnit puts a free champion on the bench (and auto-fuses 3 into a 2★)
{
  const run = freshRun('carousel-3');
  const before = run.bench.filter(Boolean).length;
  const id = UNITS.find((u) => u.cost === 1).defId;
  grantUnit(run, id);
  ok('grantUnit adds a unit to the bench', run.bench.filter(Boolean).length === before + 1);
  grantUnit(run, id); grantUnit(run, id);   // 3 total → should fuse to one 2★
  const copies = [...run.board, ...run.bench.filter(Boolean)].filter((u) => u.defId === id);
  ok('three granted copies auto-fuse to a 2★', copies.length === 1 && copies[0].star === 2, `${copies.length} unit(s), star ${copies[0] && copies[0].star}`);
}

// 4. seed-stable wheel
{
  const a = draftCarousel(freshRun('cc-seed-z')), b = draftCarousel(freshRun('cc-seed-z'));
  ok('same seed → same wheel', a.map((p) => p.unitId + ':' + p.itemId).join(',') === b.map((p) => p.unitId + ':' + p.itemId).join(','));
}

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ ' + fail + ' FAILED: ' + fails.join(', ')}  (${pass} passed, ${fail} failed)\n`);
process.exit(fail ? 1 : 0);
