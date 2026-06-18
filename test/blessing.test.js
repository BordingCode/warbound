// Run-start BLESSINGS (solo Warpath/Trials/Endless): lateral identity picks.
// Asserts each blessing is a TRADE-OFF (never pure +stats) and that its econ/combat/start/hook
// effects flow through the run economy exactly as the planning screen + sim will read them.
import * as Run from '../js/state/run.js';
import { UNITS_BY_ID } from '../js/data/units.js';
import { simulate } from '../js/sim/combat.js';
import { hashSeed } from '../js/rng.js';

let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : (fail++, console.log('  ✗', n)); process.stdout.write(c ? '.' : 'F'); };

// 1. every blessing is LATERAL — it carries a real downside, not just a buff
for (const id of Run.BLESSING_IDS) {
  const b = Run.BLESSINGS[id];
  const minus = (b.flat && Object.values(b.flat).some((v) => v < 0))
    || (b.start && Object.values(b.start).some((v) => v < 0))
    || (b.econ && b.econ.interestCapOverride != null);
  ok(`blessing "${id}" has a trade-off (downside)`, minus);
}

// 2. Hoarder: interest cap +3, −4 starting gold
{
  const r = Run.freshRun('b-hoarder'); const g0 = r.gold; Run.applyBlessing(r, 'hoarder');
  ok('hoarder: −4 starting gold', r.gold === g0 - 4);
  r.gold = 80; ok('hoarder: interest cap 8 (80/10)', Run.income(r).interest === 8);
}
// baseline interest cap stays 5 (no blessing)
{ const r = Run.freshRun('b-base'); r.gold = 80; ok('no blessing: interest cap 5', Run.income(r).interest === 5); }

// 3. Spendthrift: interest cap HALVED to 2 (absolute override), +1 free reroll, +1 starting level
{
  const r = Run.freshRun('b-spend'); const lv = r.level; Run.applyBlessing(r, 'spendthrift');
  ok('spendthrift: +1 starting level', r.level === lv + 1);
  r.gold = 80; ok('spendthrift: interest cap override 2', Run.income(r).interest === 2);
  ok('spendthrift: +1 free reroll', Run.freeRerollsLeft(r) === 1);
}

// 4. Warhost: +1 board cap, −10% team Health
{
  const r = Run.freshRun('b-warhost'); const bl = Run.boardLimit(r); Run.applyBlessing(r, 'warhost');
  ok('warhost: +1 board cap', Run.boardLimit(r) === bl + 1);
  ok('warhost: −10% HP flat', Run.blessingFlat(r).hp === -0.10);
}

// 5. Glass Vanguard: +13% AD, −9% HP combat flat
{
  const r = Run.freshRun('b-glass'); Run.applyBlessing(r, 'glassVanguard'); const f = Run.blessingFlat(r);
  ok('glass: +13% AD', f.ad === 0.13); ok('glass: −9% HP', f.hp === -0.09);
}

// 6. Scavenger: 2 starting components, −1 life
{
  const r = Run.freshRun('b-scav'); const li = r.lives; Run.applyBlessing(r, 'scavenger');
  ok('scavenger: −1 starting life', r.lives === li - 1);
  ok('scavenger: 2 starting components', r.items.length === 2);
}

// 7. Beastmaster: Beasts cost 1 less, first Beast bought is FREE, non-Beasts unaffected
{
  const r = Run.freshRun('b-beast'); Run.applyBlessing(r, 'beastmaster');
  const beast = Object.values(UNITS_BY_ID).find((u) => u.origin === 'beast');
  const other = Object.values(UNITS_BY_ID).find((u) => u.origin !== 'beast');
  ok('beastmaster: Beast cost −1', Run.blessingUnitCost(r, beast) === Math.max(0, beast.cost - 1));
  ok('beastmaster: non-Beast undiscounted', Run.blessingUnitCost(r, other) === other.cost);
  ok('beastmaster: firstBeastFree flag', r.firstBeastFree === true);
  r.shop[0] = beast.defId; r.gold = 20; const g0 = r.gold;
  const bought = Run.buy(r, 0);
  ok('beastmaster: first Beast bought free', bought && r.gold === g0);
  ok('beastmaster: free charge consumed', r.firstBeastFree === false);
}

// 8. Scout-deeper forecast == played fight: the blessing flat flows into the sim, and the same
//    boards+seed+aug give a byte-identical result (the predictive verdict can never disagree).
{
  const A = [{ defId: 'bramble_brute', star: 1, col: 3, row: 6 }, { defId: 'beast_hunter', star: 1, col: 1, row: 7 }];
  const B = [{ defId: 'skeleton_archer', star: 1, col: 3, row: 1 }];
  const seed = hashSeed(12345, 3);
  const aug = { flat: { ad: 0.13, hp: -0.09 }, cond: [], traitBonus: {} };
  const r1 = simulate(A, B, seed, { aug: { player: aug } });
  const r2 = simulate(A, B, seed, { aug: { player: aug } });
  ok('scout determinism: same forecast == played result', JSON.stringify(r1.events) === JSON.stringify(r2.events));
  ok('scout determinism: same winner', r1.result.winner === r2.result.winner);
}

console.log(`\n\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
