// The Trials (boss-rush) — every boss creature loads + fights, and the gauntlet escalates
// (a strong team beats the first boss; the final Ember Wyrm is clearly harder). Run: node test/trials.test.js
import { simulate } from '../js/sim/combat.js';
import { getTrialBoard, TRIAL_COUNT } from '../js/data/enemies.js';
import { UNITS_BY_ID } from '../js/data/units.js';

let pass = 0, fail = 0; const fails = [];
const ok = (name, cond, detail) => { if (cond) { pass++; console.log(`  ✓ ${name}${detail ? '  — ' + detail : ''}`); } else { fail++; fails.push(name); console.log(`  ✗ ${name}${detail ? '  — ' + detail : ''}`); } };
const U = (defId, col, row, star = 1) => ({ defId, col, row, star });

// a REALISTIC round-5 board (one 3★ carry, the rest 2★ — what a good player actually has after 5
// rounds; NOT a maxed god-board of triple-3★ five-costs, which no 5-round run can reach).
const TEAM = [U('wyrm_archer', 3, 7, 3), U('knight_captain', 2, 6, 3), U('bone_guard', 2, 5, 3),
  U('court_mage', 4, 7, 2), U('lich', 1, 7, 2), U('field_medic', 6, 7, 2), U('grove_healer', 0, 7, 2)];

console.log('\n=== THE TRIALS: bosses load, fight, and escalate ===');
ok('5 trials defined', TRIAL_COUNT === 5, `${TRIAL_COUNT} bosses`);

const wr = [];
for (let i = 0; i < TRIAL_COUNT; i++) {
  const board = getTrialBoard(i);
  const id = board.units[0].defId;
  const def = UNITS_BY_ID[id];
  ok(`Trial ${i + 1} is a boss creature (${board.name})`, board.boss === true && def && def.creature === true && !!board.gimmickName, `${board.gimmickName}`);
  // it fights without crashing, and we can measure a winrate vs the strong team
  let w = 0; const N = 30;
  for (let s = 1; s <= N; s++) {
    const r = simulate(TEAM.map((u) => ({ ...u })), board.units.map((u) => ({ ...u })), s * 13 + 5, { aug: { enemy: board.gimmick || null } });
    if (r.result.winner === 'player') w++;
  }
  wr.push(w / N);
  ok(`Trial ${i + 1} fight resolves`, true, `strong-team winrate ${(w / N * 100).toFixed(0)}%`);
}

ok('Trials I–IV are clearable by a realistic round-5 team', wr.slice(0, 4).every((x) => x >= 0.5), wr.slice(0, 4).map((x) => (x * 100).toFixed(0) + '%').join(' '));
ok('Final boss (Ember Wyrm) is the hardest', wr[TRIAL_COUNT - 1] <= Math.min(...wr.slice(0, 4)) + 1e-9, `wyrm ${(wr[TRIAL_COUNT - 1] * 100).toFixed(0)}% ≤ earlier trials`);
// The Wyrm must be BEATABLE by a strong, geared build (not impossible) — model gear via a flat aug bundle.
{
  const STRONG = [U('dragon_knight', 3, 7, 2), U('wyrm_archer', 5, 7, 3), U('lich', 1, 7, 3),
    U('knight_captain', 2, 6, 3), U('bone_guard', 3, 5, 3), U('field_medic', 6, 7, 2), U('grove_healer', 0, 7, 2), U('court_mage', 4, 7, 2)];
  const gear = { flat: { ad: 0.18, ap: 40, hp: 0.15, armor: 15, mr: 15 } };   // items + augments + Armory gear
  const board = getTrialBoard(TRIAL_COUNT - 1);
  let w = 0; const N = 24;
  for (let s = 1; s <= N; s++) if (simulate(STRONG.map((u) => ({ ...u })), board.units.map((u) => ({ ...u })), s * 17 + 3, { aug: { player: gear, enemy: board.gimmick || null } }).result.winner === 'player') w++;
  ok('Ember Wyrm is beatable by a strong geared build', w / N >= 0.45, `geared winrate ${(w / N * 100).toFixed(0)}%`);
}
// a creature must NOT leak into the player economy
import('../js/data/units.js').then((m) => {
  ok('creatures excluded from the player roster (UNITS)', !m.UNITS.some((u) => u.creature), `${m.UNITS.length} player champs`);
  console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ ' + fail + ' FAILED: ' + fails.join(', ')}  (${pass} passed, ${fail} failed)\n`);
  process.exit(fail ? 1 : 0);
});
