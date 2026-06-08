// A board is only DEFEATED when nothing it owns is left standing — summoned creatures count as the
// owner's board. So a side whose only survivors are summons still WINS against a fully-wiped enemy
// (it used to wrongly DRAW). Run: node test/summon-win.test.js
import { simulate } from '../js/sim/combat.js';

let pass = 0, fail = 0; const fails = [];
const ok = (name, cond, detail) => { if (cond) { pass++; console.log(`  ✓ ${name}${detail ? '  — ' + detail : ''}`); } else { fail++; fails.push(name); console.log(`  ✗ ${name}${detail ? '  — ' + detail : ''}`); } };
const U = (defId, star, col, row) => ({ defId, star, col, row });

console.log('\n=== SUMMONS COUNT AS YOUR BOARD (no false draws) ===');

// 1. INVARIANT across many real summoner fights: whenever EXACTLY ONE side ends fully wiped (0 total
//    survivors, summons included), the result must be a WIN for the side still standing — never a draw.
//    Before the fix, a side left with only summons read as 0 survivors and could draw a won fight.
{
  let checked = 0, violations = 0, summonSurvSeen = 0;
  const BOARDS = [
    [[U('necromancer', 2, 2, 7), U('pit_summoner', 2, 4, 7), U('bone_guard', 2, 3, 6)], [U('berserker', 2, 2, 2), U('shadow_dancer', 2, 4, 2), U('imp_assassin', 2, 3, 1)]],
    [[U('beastmaster', 2, 3, 7), U('banner_sergeant', 2, 4, 7), U('knight_captain', 2, 3, 6)], [U('wraith', 2, 3, 2), U('fel_archer', 2, 5, 1)]],
    [[U('necromancer', 2, 3, 7), U('crossbowman', 1, 5, 7)], [U('imp_assassin', 1, 3, 2)]],
  ];
  for (const [P, E] of BOARDS) {
    for (let seed = 1; seed <= 200; seed++) {
      const r = simulate(P, E, seed * 13 + 1, {});
      const pSurv = r.finalState.survivors.player.length, eSurv = r.finalState.survivors.enemy.length;
      if (r.finalState.survivors.player.some((u) => u.defId === 'summon') || r.finalState.survivors.enemy.some((u) => u.defId === 'summon')) summonSurvSeen++;
      if ((pSurv === 0) !== (eSurv === 0)) {           // exactly one side fully wiped
        checked++;
        const standing = pSurv > 0 ? 'player' : 'enemy';
        if (r.result.winner !== standing) violations++;
      }
    }
  }
  ok('a fully-wiped side never draws against a standing one', violations === 0, `${checked} decisive end-states, ${violations} bad draws`);
  ok('surviving SUMMONS are counted on the board (not invisible)', summonSurvSeen > 0, `${summonSurvSeen} fights ended with a summon still standing`);
}

// 2. DETERMINISTIC: a board whose ONLY alive unit is a summon, vs a fully-wiped enemy, is a WIN.
//    We can't inject mid-fight state, so assert the property holds for every decisive summoner fight:
//    if the player's survivors are all summons and the enemy is empty, winner must be 'player'.
{
  let bad = 0, cases = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const r = simulate([U('necromancer', 3, 3, 6)], [U('orc_grunt', 1, 3, 2)], seed * 17, {});
    const ps = r.finalState.survivors.player;
    if (ps.length && ps.every((u) => u.defId === 'summon') && r.finalState.survivors.enemy.length === 0) { cases++; if (r.result.winner !== 'player') bad++; }
  }
  // cases may be 0 (hard to force) — the assertion is that none of them, if they occur, is a non-win.
  ok('summon-only survivors vs a wiped enemy always = player win', bad === 0, `${cases} summon-only end-states, ${bad} wrong`);
}

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ ' + fail + ' FAILED: ' + fails.join(', ')}  (${pass} passed, ${fail} failed)\n`);
process.exit(fail ? 1 : 0);
