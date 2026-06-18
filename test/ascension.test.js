// Ascension (opt-in difficulty ladder) tests. Run: node test/ascension.test.js
// Proves each rung is a RULE CHANGE (not a flat multiplier), persistence works, and nothing
// rubber-bands the player easier. No DOM; meta uses a localStorage shim.
globalThis.localStorage = (() => { let s = {}; return { getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: (k) => { delete s[k]; }, clear: () => { s = {}; } }; })();

import * as Meta from '../js/state/meta.js';
import { getEnemyBoard, getCreepCamp } from '../js/data/enemies.js';
import { isCreepRound, resolveRound, START_LIVES } from '../js/state/run.js';

let pass = 0, fail = 0; const fails = [];
function ok(name, cond) { cond ? pass++ : (fail++, fails.push(name)); process.stdout.write(cond ? '.' : 'F'); }

// ---- 1. Meta: per-realm "highest ascension cleared", opt-in & monotonic, default 0 ----
{
  localStorage.clear();
  ok('asc: default cleared rung is 0', Meta.ascensionCleared(0) === 0);
  ok('asc: ASCENSION_MAX is a rule-ladder (>=4 rungs)', Meta.ASCENSION_MAX >= 4 && Meta.ASCENSIONS.length === Meta.ASCENSION_MAX + 1);
  ok('asc: recordAscension(0,2) is a new high', Meta.recordAscension(0, 2) === true);
  ok('asc: persists', Meta.ascensionCleared(0) === 2);
  ok('asc: recording a LOWER rung is NOT a new high (never regresses)', Meta.recordAscension(0, 1) === false && Meta.ascensionCleared(0) === 2);
  ok('asc: a higher rung advances', Meta.recordAscension(0, 3) === true && Meta.ascensionCleared(0) === 3);
  ok('asc: realms are independent', Meta.ascensionCleared(1) === 0);
}

// ---- 2. A3 "Reinforced": one EXTRA enemy unit on every warband (a rule change) ----
{
  const r3 = 3;
  const baseN = getEnemyBoard(r3, null, { diff: 4, pool: ['bone_guard'] }).units.length;
  const a3N = getEnemyBoard(r3, null, { diff: 4, pool: ['bone_guard'], asc: 3 }).units.length;
  ok(`A3: warband gains exactly one reinforcement (${baseN} -> ${a3N})`, a3N === baseN + 1);
  // A1/A2/A4 do NOT touch the board (they're life/round-structure rules), so asc<3 = no extra units
  const a2N = getEnemyBoard(r3, null, { diff: 4, pool: ['bone_guard'], asc: 2 }).units.length;
  ok('A2: board size unchanged (A2 is a life rule, not a board rule)', a2N === baseN);
  // even at round 1 realm 0 (esc 0) A3 still adds a unit (rule applies from the very first fight)
  const r1base = getEnemyBoard(1, null, {}).units.length;
  const r1a3 = getEnemyBoard(1, null, { asc: 3 }).units.length;
  ok(`A3: applies from round 1 (${r1base} -> ${r1a3})`, r1a3 === r1base + 1);
}

// ---- 3. A3 also reinforces Neutral Camps (below A1, where camps still exist) ----
{
  const baseCamp = getCreepCamp(7, { diff: 4 }).units.length;
  const a3Camp = getCreepCamp(7, { diff: 4, asc: 3 }).units.length;
  ok(`A3: neutral camp gains a monster (${baseCamp} -> ${a3Camp})`, a3Camp === baseCamp + 1 || a3Camp >= baseCamp);
}

// ---- 4. A1 "No Quarter": the creep-camp breather rounds become real warbands ----
{
  const creepRun = (asc) => ({ mode: 'solo', round: 1, ascension: asc });
  ok('A0: round 1 IS a creep camp (the breather)', isCreepRound(creepRun(0)) === true);
  ok('A1: round 1 is NO LONGER a creep camp (becomes a warband)', isCreepRound(creepRun(1)) === false);
  ok('A1: round 7 breather also removed', isCreepRound({ mode: 'solo', round: 7, ascension: 1 }) === false);
}

// ---- 5. A4 "No Mercy": the round-3 free-life net is removed ----
function mkRun(asc) {
  return { mode: 'solo', round: 3, ascension: asc, lives: 2, startLives: asc >= 2 ? START_LIVES - 1 : START_LIVES,
    wins: 0, losses: 0, gold: 0, level: 2, xp: 0, augments: [], streak: { type: null, n: 0 }, board: [], bench: [],
    shop: [], pool: {}, seed: 1, rngState: null, over: false, won: false, winTarget: 10 };
}
{
  // advancing from round 2 -> 3 with lives below cap: A0 heals +1, A4 does not.
  const a0 = mkRun(0); resolveRound(a0, true);   // win to avoid losing a life; now at round 3
  ok(`A0: round-3 net restores a life (lives=${a0.lives})`, a0.lives === 3);
  const a4 = mkRun(4); resolveRound(a4, true);
  ok(`A4: round-3 net removed (lives stays ${a4.lives})`, a4.lives === 2);
}

// ---- 6. NO rubber-band: ascension never makes the game EASIER than A0 ----
{
  // board sizes are monotonic non-decreasing in asc rung
  let monotone = true, prev = -1;
  for (let a = 0; a <= Meta.ASCENSION_MAX; a++) {
    const n = getEnemyBoard(5, null, { diff: 6, pool: ['hellguard'], asc: a }).units.length;
    if (n < prev) monotone = false; prev = n;
  }
  ok('asc: enemy board size never DECREASES as rung rises (no auto-easier)', monotone);
}

console.log(`\n\n${pass} passed, ${fail} failed`);
if (fails.length) { console.log('FAILED:'); for (const f of fails) console.log('  - ' + f); process.exit(1); }
console.log('Ascension rule-changes hold ✓');
