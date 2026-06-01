// Phase B: Warpath boss gimmicks (aug.enemy channel) make a boss measurably harder, and
// daily/shared seeds reproduce a run. Pure-sim, no DOM. Run: node test/boss-seed.test.js
import { simulate } from '../js/sim/combat.js';
import { bossForRealm } from '../js/data/enemies.js';
import { freshRun } from '../js/state/run.js';

let pass = 0, fail = 0; const fails = [];
const ok = (name, cond, detail) => { if (cond) { pass++; console.log(`  ✓ ${name}${detail ? '  — ' + detail : ''}`); } else { fail++; fails.push(name); console.log(`  ✗ ${name}${detail ? '  — ' + detail : ''}`); } };
const U = (defId, col, row, star = 1) => ({ defId, col, row, star });

console.log('\n=== BOSS GIMMICKS (aug.enemy makes the boss harder) ===');
// A strong premium board (all 3★) so it can win the boss WITHOUT the gimmick — then the gimmick
// must lower the winrate and/or force more damage to grind the boss down.
const P = [U('dragon_knight', 3, 7, 3), U('dragon_sage', 4, 7, 3), U('wyrm_archer', 5, 7, 3),
  U('knight_captain', 2, 6, 3), U('lich', 1, 7, 3), U('field_medic', 6, 7, 3), U('grove_healer', 0, 7, 3)];
const SEEDS = 40;
function measure(E, gimmick) {
  let wins = 0, enemyDmg = 0;
  for (let s = 1; s <= SEEDS; s++) {
    const r = simulate(P, E, s * 7 + 1, { aug: { enemy: gimmick || null } });
    if (r.result.winner === 'player') wins++;
    const eids = new Set(r.events.filter((e) => e.type === 'spawn' && e.team === 'enemy').map((e) => e.id));
    enemyDmg += r.events.filter((e) => e.type === 'damage' && eids.has(e.id)).reduce((a, e) => a + e.amount, 0);
  }
  return { wr: wins / SEEDS, enemyDmg };
}
for (const realm of [2, 4]) {   // Bonelord (undying) + Worldwyrm (dragonscale)
  const boss = bossForRealm(realm);
  const E = boss.units.map((u) => ({ ...u }));
  const base = measure(E, null), withG = measure(E, boss.gimmick);
  ok(`${boss.name}: gimmick never raises player winrate`, withG.wr <= base.wr + 1e-9, `winrate ${(base.wr * 100).toFixed(0)}% → ${(withG.wr * 100).toFixed(0)}%`);
  ok(`${boss.name}: gimmick measurably changes the fight`, withG.wr !== base.wr || withG.enemyDmg !== base.enemyDmg, `winrate Δ ${((base.wr - withG.wr) * 100).toFixed(0)}pts, enemy dmg-soaked ${Math.round(base.enemyDmg)}→${Math.round(withG.enemyDmg)}`);
}

console.log('\n=== DAILY / SHARED SEEDS reproduce a run ===');
{
  const a = freshRun('daily-2026-06-01'), b = freshRun('daily-2026-06-01');
  ok('Same seed string → identical seed + shop', a.seed === b.seed && a.shop.join(',') === b.shop.join(','), `seed ${a.seed}, shop [${a.shop.join(',')}]`);
  const c = freshRun('daily-2026-06-02');
  ok('Different date → different seed', c.seed !== a.seed, `${a.seed} vs ${c.seed}`);
  const d = freshRun('seed-cool-run-42'), e = freshRun('seed-cool-run-42');
  ok('Shared custom seed reproduces', d.seed === e.seed && d.shop.join(',') === e.shop.join(','));
}

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ ' + fail + ' FAILED: ' + fails.join(', ')}  (${pass} passed, ${fail} failed)\n`);
process.exit(fail ? 1 : 0);
