// Neutral Camp (Auto-Chess creep) rounds: Warpath-only PvE breather vs wild monsters that drops
// loot and does NOT count toward the realm's 10 warbands. Run: node test/creep-round.test.js
import { freshRun, resolveRound, isCreepRound, isCreepRoundNum, CREEP_ROUNDS } from '../js/state/run.js';
import { getCreepCamp, getEnemyBoard, REALMS } from '../js/data/enemies.js';
import { UNITS_BY_ID } from '../js/data/units.js';
import { simulate } from '../js/sim/combat.js';

let pass = 0, fail = 0; const fails = [];
const ok = (name, cond, detail) => { if (cond) { pass++; console.log(`  ✓ ${name}${detail ? '  — ' + detail : ''}`); } else { fail++; fails.push(name); console.log(`  ✗ ${name}${detail ? '  — ' + detail : ''}`); } };

console.log('\n=== NEUTRAL CAMP (creep) ROUNDS ===');

// 1. creep rounds are flagged Warpath-only, by round number
{
  const run = freshRun('creep-1'); run.mode = 'solo'; run.round = CREEP_ROUNDS[0];
  ok('creep round is flagged in Warpath (solo)', isCreepRound(run));
  run.mode = 'ladder';
  ok('NOT a creep round in Ladder', !isCreepRound(run));
  ok('isCreepRoundNum matches the schedule', CREEP_ROUNDS.every(isCreepRoundNum) && !isCreepRoundNum(2));
}

// 2. winning a creep round pays gold but does NOT advance warband progress (wins)
{
  const run = freshRun('creep-2'); run.mode = 'solo'; run.round = CREEP_ROUNDS[0];
  const winsBefore = run.wins, goldBefore = run.gold;
  resolveRound(run, true);
  ok('creep win does NOT increment wins', run.wins === winsBefore, `wins ${winsBefore} → ${run.wins}`);
  ok('creep win still pays gold', run.gold > goldBefore, `gold ${goldBefore} → ${run.gold}`);
  ok('round still advances after a creep', run.round === CREEP_ROUNDS[0] + 1);
}

// 3. a NON-creep round win DOES advance warband progress (control)
{
  const run = freshRun('creep-3'); run.mode = 'solo'; run.round = 2;   // round 2 is a normal warband
  const winsBefore = run.wins;
  resolveRound(run, true);
  ok('a normal round win DOES increment wins', run.wins === winsBefore + 1, `wins ${winsBefore} → ${run.wins}`);
}

// 4. the camp is a beatable BREATHER — a mid board beats the camp far more reliably than the
//    same-round warband, across every realm.
{
  const P = [
    { defId: 'knight_captain', star: 2, col: 2, row: 6 }, { defId: 'orc_grunt', star: 2, col: 3, row: 6 },
    { defId: 'bone_guard', star: 2, col: 4, row: 6 }, { defId: 'crossbowman', star: 2, col: 2, row: 7 },
    { defId: 'lich', star: 2, col: 4, row: 7 }, { defId: 'field_medic', star: 2, col: 5, row: 7 },
  ];
  const wr = (E) => { let w = 0, N = 30; for (let s = 1; s <= N; s++) { if (simulate(P, E.map((u) => ({ ...u })), s * 7 + 1, {}).result.winner === 'player') w++; } return w / N; };
  let campTotal = 0, warTotal = 0; const realms = REALMS.slice(0, 6);
  for (const realm of realms) {
    campTotal += wr(getCreepCamp(7, { diff: realm.diff }).units);
    warTotal += wr(getEnemyBoard(7, null, { diff: realm.diff, pool: realm.pool }).units);
  }
  const campAvg = campTotal / realms.length, warAvg = warTotal / realms.length;
  ok('camp is reliably winnable (avg winrate ≥ 80%)', campAvg >= 0.8, `${(campAvg * 100).toFixed(0)}%`);
  ok('camp is easier than the same-round warband (the breather)', campAvg > warAvg, `camp ${(campAvg * 100).toFixed(0)}% vs warband ${(warAvg * 100).toFixed(0)}%`);
}

// 5. creep monsters grant the enemy NO synergy (origin/klass = 'boss', not a real trait)
{
  const camp = getCreepCamp(7, { diff: 4 });
  ok('all camp units are real defs', camp.units.every((u) => UNITS_BY_ID[u.defId]));
  ok('camp units grant no synergy', camp.units.every((u) => UNITS_BY_ID[u.defId].origin === 'boss' && UNITS_BY_ID[u.defId].klass === 'boss'));
  ok('camp is flagged creep with a loot hint', camp.creep === true && /loot/i.test(camp.traitHint));
}

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ ' + fail + ' FAILED: ' + fails.join(', ')}  (${pass} passed, ${fail} failed)\n`);
process.exit(fail ? 1 : 0);
