// Ladder / AI-warlord tests. Run: node test/ladder.test.js
// Proves the bots are real economy players sharing ONE champion pool, that the pool is
// conserved (the genre's signature contention), that boards scale, and a full lobby resolves.
import { createLobby, botTurn, resolveLadderRound, underdog, STYLES, shuffled, START_HP } from '../js/state/bots.js';
import { simulate } from '../js/sim/combat.js';
import { UNITS, UNITS_BY_ID } from '../js/data/units.js';
import { POOL_COPIES } from '../js/state/run.js';
import { RNG } from '../js/rng.js';

let pass = 0, fail = 0; const fails = [];
function ok(name, cond) { cond ? pass++ : (fail++, fails.push(name)); process.stdout.write(cond ? '.' : 'F'); }

// total champion copies that should ever exist = POOL_COPIES summed over the roster
const TOTAL_COPIES = UNITS.reduce((n, u) => n + POOL_COPIES[u.cost], 0);
// count copies a player holds (a ★2 = 3 base copies, ★3 = 9)
const heldCopies = (p) => (p.roster || []).reduce((n, u) => n + (u.star === 3 ? 9 : u.star === 2 ? 3 : 1), 0);
function copiesInExistence(lobby) {
  let n = Object.values(lobby.pool).reduce((a, b) => a + b, 0);
  for (const b of lobby.bots) n += heldCopies(b);   // human proxy has no roster in these tests
  return n;
}

// ---- 1. lobby creation ----
{
  const lobby = createLobby('seedA');
  ok('lobby: 7 warlords created', lobby.bots.length === 7);
  ok('lobby: shared pool exists', lobby.pool && typeof lobby.pool === 'object');
  ok('lobby: everyone starts at full HP', lobby.players.every((p) => p.hp === START_HP && p.alive));
}

// ---- 2. SHARED POOL is conserved after a round of bot shopping (the headline feature) ----
{
  const lobby = createLobby('poolcons');
  ok(`shared pool: total copies conserved at creation (${copiesInExistence(lobby)}/${TOTAL_COPIES})`, copiesInExistence(lobby) === TOTAL_COPIES);
  // bots already shopped round 1, so the pool must have shrunk below the untouched total
  const inBag = Object.values(lobby.pool).reduce((a, b) => a + b, 0);
  ok(`shared pool: bag shrank as bots bought (bag ${inBag} < total ${TOTAL_COPIES})`, inBag < TOTAL_COPIES);
  // advance several rounds; conservation must hold every round
  let conserved = true;
  for (let r = 2; r <= 12; r++) { for (const b of lobby.bots) botTurn(b, r, lobby); if (copiesInExistence(lobby) !== TOTAL_COPIES) conserved = false; }
  ok('shared pool: conserved across 12 rounds of shopping', conserved);
}

// ---- 3. contention: two bots fighting for the same trait deplete each other's options ----
{
  const lobby = createLobby('contention');
  for (let r = 2; r <= 10; r++) for (const b of lobby.bots) botTurn(b, r, lobby);
  // the pool must never go negative anywhere
  ok('shared pool: no copy count ever negative', Object.values(lobby.pool).every((v) => v >= 0));
}

// ---- 4. bots level + build scaling boards ----
{
  const lobby = createLobby('grow');
  const bot = lobby.bots.find((b) => b.id === 'warlord');
  const lvl1 = bot.level, board1 = bot.board.length;
  for (let r = 2; r <= 12; r++) botTurn(bot, r, lobby);
  ok(`growth: warlord leveled (${lvl1} -> ${bot.level})`, bot.level > lvl1);
  ok('growth: board grew, never exceeds level', bot.board.length >= board1 && bot.board.length <= bot.level);
  ok('growth: some champion reached ★★ by fusing', bot.roster.some((u) => u.star >= 2));
}

// ---- 5. trait zealots favour their trait ----
{
  const lobby = createLobby('zealot');
  const undeadBot = lobby.bots.find((b) => b.id === 'undead');
  for (let r = 2; r <= 12; r++) botTurn(undeadBot, r, lobby);
  const hits = undeadBot.roster.filter((u) => { const d = UNITS_BY_ID[u.defId]; return d.origin === 'undead' || d.klass === 'undead'; }).length;
  ok(`zealot: Necrarch's roster leans Undead (${hits}/${undeadBot.roster.length})`, hits / Math.max(1, undeadBot.roster.length) > 0.5);
}

// ---- 6. every bot board is sim-valid ----
{
  const lobby = createLobby('valid');
  for (const b of lobby.bots) for (let r = 2; r <= 10; r++) botTurn(b, r, lobby);
  let okAll = true;
  for (const b of lobby.bots) {
    const me = b.board.map((u) => ({ ...u, row: 7 - u.row }));
    const res = simulate(me, lobby.bots[0].board, 7);
    if (!['player', 'enemy', 'draw'].includes(res.result.winner) || res.result.durationTicks >= 30 * 45) okAll = false;
  }
  ok('valid: all 7 bot boards resolve in the sim', okAll);
}

// ---- 7. full lobby plays to a placement; HP + pool stay sane ----
{
  const lobby = createLobby('full');
  const ghost = createLobby('full-h').bots.find((b) => b.id === 'knight');
  let over = false, place = null, s = 0;
  while (!over && s++ < 80) {
    const round = lobby.round;
    botTurn(ghost, round, lobby);
    lobby.human.board = ghost.board.map((u) => ({ ...u, row: u.row + 4 }));
    const ob = (lobby.opponent.board || []).map((u) => ({ ...u, row: u.row <= 3 ? u.row : u.row - 4 }));
    const res = simulate(lobby.human.board, ob, round * 7 + 3);
    const r = resolveLadderRound(lobby, lobby.human.board, res, round);
    over = r.over; place = r.humanPlace;
  }
  ok(`full run: resolved within 80 rounds (round ${lobby.round})`, over);
  ok(`full run: human got a placement (${place})`, place != null && place >= 1 && place <= 8);
  ok('full run: HP stayed in [0,max]', lobby.players.every((p) => p.hp >= 0 && p.hp <= START_HP));
  ok('full run: shared pool never went negative', Object.values(lobby.pool).every((v) => v >= 0));
}

// ---- 8. comeback: the underdog is the lowest-HP alive player ----
{
  const lobby = createLobby('underdog');
  lobby.bots[0].hp = 10; lobby.bots[1].hp = 40; lobby.human.hp = 90;
  const u = underdog(lobby);
  ok('comeback: underdog is the lowest-HP survivor', u && u.id === lobby.bots[0].id);
}

// ---- 9. matchmaking shuffle is a permutation ----
{
  const sh = shuffled([0, 1, 2, 3, 4, 5, 6, 7], new RNG(5));
  ok('shuffle: permutation', sh.length === 8 && new Set(sh).size === 8);
}

console.log(`\n\n${pass} passed, ${fail} failed`);
if (fail) { console.log('FAILURES:\n  ' + fails.join('\n  ')); process.exit(1); }
