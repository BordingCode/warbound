// Full-run smoke test: a trivial bot plays a complete run through the real run-state +
// combat pipeline (buy/level/place/fight/resolve/draft), asserting invariants every round.
// Catches integration bugs the unit tests don't. Run: node test/smoke-run.js
import * as Run from '../js/state/run.js';
import { getEnemyBoard } from '../js/data/enemies.js';
import { simulate } from '../js/sim/combat.js';
import { hashSeed } from '../js/rng.js';
import { augmentBundle } from '../js/data/augments.js';

let fail = 0;
const bad = (m) => { console.log('  ✗ ' + m); fail++; };

function botPlan(run) {
  // spend: buy affordable shop units, occasionally level
  for (let i = 0; i < 5; i++) if (run.gold >= 3 && run.shop[i]) Run.buy(run, i);
  if (run.gold >= 12) Run.buyXP(run);
  // place bench units onto free player tiles up to the board limit
  for (const u of run.bench.filter(Boolean)) {
    if (run.board.length >= Run.boardLimit(run)) break;
    const used = new Set(run.board.map((b) => b.col + ',' + b.row));
    let placed = false;
    for (let row = 7; row >= 4 && !placed; row--) for (let col = 0; col < 8 && !placed; col++) {
      if (!used.has(col + ',' + row)) { placed = Run.placeOnBoard(run, u.uid, col, row); }
    }
  }
}

function runOnce(seedStr) {
  const run = Run.freshRun(seedStr);
  let iter = 0;
  while (!run.over && iter < 80) {
    iter++;
    botPlan(run);
    // invariants during planning
    if (run.gold < 0) bad(`gold negative at round ${run.round}`);
    if (run.board.length > Run.boardLimit(run)) bad(`board ${run.board.length} > limit ${Run.boardLimit(run)} at round ${run.round}`);
    // fight
    const enemy = getEnemyBoard(run.round, null).units.map(({ defId, star, col, row }) => ({ defId, star, col, row }));
    const pb = run.board.map(({ defId, star, col, row, items }) => ({ defId, star, col, row, items }));
    const finished = run.round;
    const r = simulate(pb, enemy, hashSeed(run.seed, run.round), { aug: { player: augmentBundle(run.augments) } });
    if (r.result.durationTicks >= 30 * 45) bad(`combat hit cap at round ${finished}`);
    if (!['player', 'enemy', 'draw'].includes(r.result.winner)) bad(`bad winner at round ${finished}`);
    Run.resolveRound(run, r.result.winner === 'player');
    // simulate the player accepting drafts
    if (!run.over && [3, 6, 9].includes(finished)) { const ids = Run.draftAugments(run); if (ids[0]) Run.addAugment(run, ids[0]); }
    if (!run.over && [1, 2, 5, 7, 10].includes(finished)) { const ids = Run.draftComponents(run); if (ids[0]) Run.addItem(run, ids[0]); }
    if (run.gold < 0) bad(`gold negative after resolve round ${finished}`);
    if (run.lives < 0) bad(`lives negative round ${finished}`);
    // save/load round-trip doesn't corrupt
    Run.save(run);
  }
  if (!run.over) bad(`run did not end within 80 iterations (seed ${seedStr})`);
  return { wins: run.wins, lives: run.lives, round: run.round, won: run.won, iter };
}

console.log('=== FULL-RUN SMOKE (bot plays complete runs) ===');
const results = [];
for (const seed of ['alpha', 'bravo', 'charlie', 'delta', 'echo']) {
  const res = runOnce(seed);
  results.push(res);
  console.log(`  ${seed.padEnd(8)} -> ${res.won ? 'WON ' : 'lost'} | ${res.wins} wins, ${res.lives} lives, ${res.round} rounds, ${res.iter} iters`);
}

console.log(`\n${fail === 0 ? '✓ all full-run invariants held' : '✗ ' + fail + ' failures'}`);
process.exit(fail ? 1 : 0);
