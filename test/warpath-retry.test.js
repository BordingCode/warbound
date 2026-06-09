// Warpath is un-losable: a defeat replays the SAME warband until you win. A loss never costs a life
// and never ends the run; it counts a `retry` (which drives catch-up help) and the foe — keyed to
// `wins`, not the round — stays byte-identical while your economy grows. Trials/Endless still ride on
// lives. No DOM. Run: node test/warpath-retry.test.js
import { freshRun, resolveRound, isUnderdog, START_LIVES } from '../js/state/run.js';
import { getEnemyBoard } from '../js/data/enemies.js';

let pass = 0, fail = 0; const fails = [];
const ok = (name, cond, detail) => { if (cond) { pass++; console.log(`  ✓ ${name}${detail ? '  — ' + detail : ''}`); } else { fail++; fails.push(name); console.log(`  ✗ ${name}${detail ? '  — ' + detail : ''}`); } };

console.log('\n=== WARPATH replays each warband until you win ===');

// 1. a Warpath loss does not end the run, does not spend a life, and counts a retry
{
  const run = freshRun('wp-1'); run.mode = 'solo';
  resolveRound(run, false);
  ok('loss keeps the run going', run.over === false);
  ok('loss spends no life', run.lives === START_LIVES, `lives=${run.lives}`);
  ok('loss does not advance the warband', run.wins === 0, `wins=${run.wins}`);
  ok('loss counts a retry', run.retries === 1, `retries=${run.retries}`);
  ok('a retry turns on underdog catch-up', isUnderdog(run) === true);
}

// 2. an arbitrarily long losing streak never ends a Warpath run
{
  const run = freshRun('wp-2'); run.mode = 'solo';
  for (let i = 0; i < 40; i++) resolveRound(run, false);
  ok('40 straight losses never end the run', run.over === false);
  ok('lives untouched after 40 losses', run.lives === START_LIVES, `lives=${run.lives}`);
  ok('retries accumulate', run.retries === 40, `retries=${run.retries}`);
}

// 3. winning clears the wall: advances a warband and resets the retry counter
{
  const run = freshRun('wp-3'); run.mode = 'solo';
  resolveRound(run, false); resolveRound(run, false);
  ok('two losses → 2 retries', run.retries === 2);
  resolveRound(run, true);
  ok('a win advances the warband', run.wins === 1, `wins=${run.wins}`);
  ok('a win resets retries', run.retries === 0, `retries=${run.retries}`);
  ok('cleared the wall → no longer underdog', isUnderdog(run) === false);
}

// 4. the replayed foe is identical — the board is keyed to wins (fixed) not the round (climbing)
{
  // wins stays 0 across retries, so the opponent for warband 1 is getEnemyBoard(1, …) every time
  const a = getEnemyBoard(1, null, { diff: 0, pool: [] });
  const b = getEnemyBoard(1, null, { diff: 0, pool: [] });
  ok('same warband index → byte-identical board', JSON.stringify(a) === JSON.stringify(b));
  const next = getEnemyBoard(2, null, { diff: 0, pool: [] });
  ok('the NEXT warband is a different board', JSON.stringify(a) !== JSON.stringify(next));
}

// 5. regression — Trials/Endless still spend lives on a loss and can still be lost
{
  const t = freshRun('wp-5t'); t.mode = 'trials'; t.lives = 2;
  resolveRound(t, false);
  ok('Trials loss still spends a life', t.lives === 1, `lives=${t.lives}`);
  resolveRound(t, false);
  ok('Trials run ends at 0 lives', t.over === true && t.won === false);

  const e = freshRun('wp-5e'); e.mode = 'endless'; e.lives = 1;
  resolveRound(e, false);
  ok('Endless run ends at 0 lives', e.over === true && e.won === false);
}

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES: ' + fails.join(', ')}  (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
