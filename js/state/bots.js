// AI trainers for LADDER mode (Auto Chess / Underlords / TFT style). Each bot is its own
// economy "player": same income curve, levels up, buys champions, fuses 3-into-1, fields a
// real board you fight. Last warband standing wins.
//
// RESEARCH UPGRADES over the PokéBattler ladder (from the genre study):
//  1. TRUE SHARED POOL — the human and all 8 bots draw champions from ONE bag (lobby.pool).
//     Buying removes a copy for everyone; an eliminated player's units return to the bag.
//     This is the genre's signature: rivals contesting your units is real, not cosmetic.
//  2. COMEBACK — the lowest-HP survivor each round is the "underdog": the human gets a free
//     item-component draft (mirrors TFT's lowest-HP-first carousel pick); bots get bonus gold.
//
// Pure logic, deterministic from one seed (each bot owns a seeded RNG). No DOM.
import { RNG, seedFromString } from '../rng.js';
import { UNITS, UNITS_BY_ID, statsForStar } from '../data/units.js';
import { SHOP_ODDS, XP_TO_NEXT, MAX_LEVEL, POOL_COPIES } from './run.js';
import { simulate, playerDamage } from '../sim/combat.js';
import { augmentBundle, AUGMENT_IDS, AUGMENTS } from '../data/augments.js';

// augments a bot may draft — combat/synergy/build value (skip pure-econ; a bot's economy
// doesn't model interest/reroll perks). Bots draft RANDOMLY, so a thinking player still wins.
const BOT_AUGMENTS = AUGMENT_IDS.filter((id) => AUGMENTS[id].cat !== 'econ');

export const START_HP = 130;     // ladder HP pool — tuned for ~12-20 round games
const INTEREST_CAP = 5;

const byCost = { 1: [], 2: [], 3: [], 4: [], 5: [] };
for (const u of UNITS) byCost[u.cost].push(u.defId);
const costOf = (id) => (UNITS_BY_ID[id] ? UNITS_BY_ID[id].cost : 1);
const hasTrait = (id, t) => { const d = UNITS_BY_ID[id]; return d && (d.origin === t || d.klass === t); };
// power proxy for picking the strongest `level` units to field
const power = (id, star) => { const s = statsForStar(UNITS_BY_ID[id], star); return s.hp * 0.045 + s.ad * 0.55 + costOf(id) * 12; };
// trait -> all champion ids carrying it (cross-cost zealotry)
const traitPool = {};
for (const u of UNITS) for (const t of [u.origin, u.klass]) (traitPool[t] = traitPool[t] || []).push(u.defId);

// ---- the rival warlords (fantasy-flavoured styles) ----
export const STYLES = [
  { id: 'warlord', name: 'Warlord Gorn',      emoji: '🗡', desc: 'Levels fast, fields a big warband', levelBias: 1.2,  econFloor: 0,  pref: null,       reroll: 0.1 },
  { id: 'baron',   name: 'Baron Goldhand',    emoji: '💰', desc: 'Hoards gold, spikes hard late',     levelBias: 1.0,  econFloor: 50, pref: null,       reroll: 0.05 },
  { id: 'gambit',  name: 'Gambit the Mad',    emoji: '🎲', desc: 'Rerolls relentlessly for ★★★',      levelBias: 0.85, econFloor: 18, pref: 'lowcost', reroll: 0.9 },
  { id: 'undead',  name: 'Necrarch the Risen', emoji: '💀', desc: 'Undead horde',                     levelBias: 1.0,  econFloor: 22, pref: 'undead',  reroll: 0.5 },
  { id: 'elf',     name: 'Sylvaen Dawnblade',  emoji: '🏹', desc: 'Elf evasion',                      levelBias: 1.0,  econFloor: 22, pref: 'elf',     reroll: 0.5 },
  { id: 'demon',   name: "Mal'akar the Fell",  emoji: '👹', desc: 'Demon burn',                       levelBias: 1.0,  econFloor: 22, pref: 'demon',   reroll: 0.5 },
  { id: 'knight',  name: 'Dame Ironwall',      emoji: '🛡', desc: 'Knight wall',                      levelBias: 0.95, econFloor: 25, pref: 'knight',  reroll: 0.4 },
  { id: 'mage',    name: 'Archmagus Vorne',    emoji: '🔮', desc: 'Mage burst',                       levelBias: 1.0,  econFloor: 22, pref: 'mage',    reroll: 0.5 },
];

// Signature powers — one per warlord (and the player picks one at run start). Each is a
// modest, roughly-balanced whole-warband COMBAT buff routed through the sim's aug.flat channel
// (COMBAT_KEYS), so it applies identically to a human or AI board. Identity + run variety.
export const POWERS = {
  warlord: { name: "Warlord's Banner", icon: '🗡', desc: '+9% Attack Damage to your whole warband.', flat: { ad: 0.09 } },
  baron:   { name: 'War Chest',        icon: '💰', desc: '+9% max Health to your whole warband.', flat: { hp: 0.09 } },
  gambit:  { name: 'Frenzy',           icon: '🎲', desc: '+9% Attack Speed to your whole warband.', flat: { as: 0.09 } },
  undead:  { name: 'Grave Bond',       icon: '💀', desc: 'Your champions revive once at 25% HP.', flat: { revive: 0.25 } },
  elf:     { name: 'Moonward',         icon: '🏹', desc: 'Your champions start with a 130 shield.', flat: { shield: 130 } },
  demon:   { name: 'Soul Drain',       icon: '👹', desc: 'Lifesteal: heal 12% of damage dealt.', flat: { vamp: 0.12 } },
  knight:  { name: 'Bulwark',          icon: '🛡', desc: '+18 Armor & Magic Resist to your warband.', flat: { armor: 18, mr: 18 } },
  mage:    { name: 'Arcane Surge',     icon: '🔮', desc: '+45 Ability Power to your whole warband.', flat: { ap: 45 } },
};
// Lobby-wide modifier — one random rule per match, applied to EVERY warband's combat. Forces a
// fresh approach each game (TFT Encounters / HS Battlegrounds Anomalies).
export const MODIFIERS = [
  { id: 'none',     name: 'Fair Fight',    icon: '⚔', desc: 'No special rules this match.', flat: {} },
  { id: 'bloodlust',name: 'Bloodlust',     icon: '🩸', desc: 'Every champion has +12% Attack Damage.', flat: { ad: 0.12 } },
  { id: 'ironhide', name: 'Ironhide',      icon: '🪨', desc: 'Every champion has +20 Armor & MR.', flat: { armor: 20, mr: 20 } },
  { id: 'haste',    name: 'Battle Haste',  icon: '💨', desc: 'Every champion has +14% Attack Speed.', flat: { as: 0.14 } },
  { id: 'arcane',   name: 'Arcane Storm',  icon: '🔮', desc: 'Every champion has +30 Ability Power.', flat: { ap: 30 } },
  { id: 'vampiric', name: 'Vampiric Field',icon: '🧛', desc: 'Every champion heals 10% of damage dealt.', flat: { vamp: 0.10 } },
  { id: 'glass',    name: 'Glass Cannons', icon: '💥', desc: '+18% Attack Damage but -12% Health for all.', flat: { ad: 0.18, hp: -0.12 } },
  { id: 'fortified',name: 'Fortified',     icon: '🏰', desc: 'Every champion starts with a 160 shield.', flat: { shield: 160 } },
];
const mergeFlat = (...objs) => { const o = {}; for (const m of objs) if (m) for (const [k, v] of Object.entries(m)) o[k] = (o[k] || 0) + v; return o; };
// the combat aug.flat bundle for a player = their warlord power + the lobby modifier.
export function powerFlat(player, lobby) {
  const pw = player && !player.ghost && player.powerId ? (POWERS[player.powerId] && POWERS[player.powerId].flat) : null;
  const mod = lobby && lobby.modifier ? lobby.modifier.flat : null;
  return mergeFlat(pw, mod);
}

// short personality barks per warlord (shown when you scout / face them)
export const TAUNTS = {
  warlord: 'Numbers win wars. I have more.',
  baron: 'Patience. Then I buy your defeat.',
  gambit: 'Roll the bones — fortune favours me!',
  undead: 'My fallen simply rise again.',
  elf: 'You cannot strike what you cannot touch.',
  demon: 'Your strength will feed mine.',
  knight: 'Break upon my wall, then.',
  mage: 'Knowledge is the sharpest blade.',
};

function stdLevel(round) { return Math.max(2, Math.min(MAX_LEVEL, 2 + Math.floor(round * 0.6))); }
function levelUp(bot) { while (bot.level < MAX_LEVEL && bot.xp >= XP_TO_NEXT[bot.level]) { bot.xp -= XP_TO_NEXT[bot.level]; bot.level++; } }

function newBot(style, seed) {
  return {
    id: style.id, name: style.name, emoji: style.emoji, style, powerId: style.id,
    rng: new RNG(seed >>> 0),
    gold: 2, level: 2, xp: 0,
    hp: START_HP, alive: true, place: null,
    roster: [], board: [], augments: [], streakN: 0, lastWon: null, lastStreakWon: null,
  };
}

// a bot drafts one augment, biased toward its trait (thematic + effective), else random.
function botDraftAugment(bot) {
  const owned = new Set(bot.augments);
  let pool = BOT_AUGMENTS.filter((id) => !owned.has(id));
  if (!pool.length) return;
  const pref = bot.style.pref && bot.style.pref !== 'lowcost'
    ? pool.filter((id) => AUGMENTS[id].wantTrait === bot.style.pref) : [];
  const from = (pref.length && bot.rng.next() < 0.7) ? pref : pool;
  bot.augments.push(from[Math.floor(bot.rng.next() * from.length)]);
}
// the FULL combat aug for a player/bot: their augments + warlord power + lobby modifier.
export function botBundle(player, lobby) {
  if (!player || player.ghost) return { flat: powerFlat(player, lobby) };
  const b = augmentBundle(player.augments || []);
  const pf = powerFlat(player, lobby);
  for (const [k, v] of Object.entries(pf)) b.flat[k] = (b.flat[k] || 0) + v;
  return b;
}

// Build a fresh shared pool: POOL_COPIES of every champion, in one bag for the whole lobby.
function freshPool() { const p = {}; for (const u of UNITS) p[u.defId] = POOL_COPIES[u.cost]; return p; }

// Create the lobby: a human proxy (with the warlord power they chose) + 7 OTHER rival warlords
// + ONE shared champion pool + one random lobby-wide modifier for the whole match.
export function createLobby(seedStr, playerStyleId = 'warlord', opponents = 7) {
  const base = seedFromString(String(seedStr) + '-ladder');
  const pool = freshPool();
  const styles = STYLES.filter((s) => s.id !== playerStyleId).slice(0, opponents);
  const bots = styles.map((s, i) => newBot(s, base + i * 7919));
  const chosen = STYLES.find((s) => s.id === playerStyleId) || STYLES[0];
  const human = { id: 'you', name: 'You', emoji: (POWERS[playerStyleId] && POWERS[playerStyleId].icon) || '🧢', warlordName: chosen.name, powerId: playerStyleId, isHuman: true, hp: START_HP, alive: true, place: null, board: [], streakN: 0, lastWon: null, lastStreakWon: null };
  const rng = new RNG(base + 104729);
  const modifier = MODIFIERS[Math.floor(rng.next() * MODIFIERS.length)];
  const lobby = { rng, human, bots, players: [human, ...bots], pool, round: 1, pairs: [], opponent: null, underdog: null, modifier };
  for (const b of bots) botTurn(b, 1, lobby);     // bots shop round 1 (draws from the shared pool)
  matchmake(lobby);
  return lobby;
}

const alivePlayers = (lobby) => lobby.players.filter((p) => p.alive);
export const aliveCount = (lobby) => alivePlayers(lobby).length;
// the lowest-HP alive player (the underdog who gets the comeback perk)
export function underdog(lobby) {
  const alive = alivePlayers(lobby);
  if (alive.length <= 1) return null;
  return alive.reduce((lo, p) => (p.hp < lo.hp ? p : lo), alive[0]);
}

// ---- one economy turn: income -> level -> buy (from shared pool) -> fuse -> rebuild board ----
export function botTurn(bot, round, lobby) {
  const rng = bot.rng;
  const interest = Math.min(INTEREST_CAP, Math.floor(bot.gold / 10));
  const base = round <= 4 ? 2 : round <= 11 ? 4 : 5;
  const streakBonus = bot.streakN >= 5 ? 3 : bot.streakN >= 4 ? 2 : bot.streakN >= 2 ? 1 : 0;
  const underdogGold = (lobby && lobby.underdog === bot.id) ? 3 : 0;   // comeback: bonus gold when behind
  bot.gold += base + interest + streakBonus + (bot.lastWon ? 1 : 0) + underdogGold;
  bot.xp += 2; levelUp(bot);

  const target = Math.max(2, Math.min(MAX_LEVEL, Math.round(stdLevel(round) * (0.7 + 0.3 * bot.style.levelBias) + bot.style.levelBias - 1)));
  const spiking = round >= 9 || bot.level >= target;     // late game: stop hoarding, dump into board
  const floor = spiking ? Math.min(bot.style.econFloor, 8) : bot.style.econFloor;

  let guard = 0;
  while (bot.level < target && bot.gold > floor + 4 && guard++ < 12) { bot.gold -= 4; bot.xp += 4; levelUp(bot); }

  const rerolls = (spiking || rng.next() < bot.style.reroll) ? (bot.style.pref === 'lowcost' ? 4 : spiking ? 3 : 2) : 1;
  guard = 0;
  for (let r = 0; r < rerolls; r++) {
    while (bot.gold > floor && guard++ < 60) {
      const id = rollPick(bot, lobby, rng);
      if (!id) break;
      const c = costOf(id);
      if (c > bot.gold - (r < rerolls - 1 ? 2 : 0)) break;
      bot.gold -= c; lobby.pool[id] = Math.max(0, (lobby.pool[id] || 0) - 1); addCopy(bot, id);
    }
    if (bot.gold <= 2) break;
  }
  if ([3, 6, 9, 12].includes(round)) botDraftAugment(bot);   // match the player's augment power curve
  fuseRoster(bot);
  buildBotBoard(bot);
  return bot;
}

const ownedStar1 = (bot, id) => bot.roster.reduce((n, u) => n + (u.defId === id && u.star === 1 ? 1 : 0), 0);
// roll one shop pick: a cost tier by level odds, then a champion FROM THE SHARED POOL (pool>0),
// biased toward the bot's trait and toward completing a pair into a star-up.
function rollPick(bot, lobby, rng) {
  const odds = SHOP_ODDS[bot.level] || SHOP_ODDS[9];
  let roll = rng.next() * 100, acc = 0, cost = 1;
  for (let c = 1; c <= 5; c++) { acc += odds[c - 1]; if (roll < acc) { cost = c; break; } }
  const avail = (ids) => ids.filter((id) => (lobby.pool[id] || 0) > 0);
  let ids = avail(byCost[cost] || []);
  if (bot.style.pref === 'lowcost') ids = avail(byCost[1].concat(byCost[2]));
  else if (bot.style.pref) {
    let pref = ids.filter((id) => hasTrait(id, bot.style.pref));
    if (!pref.length) pref = avail((traitPool[bot.style.pref] || []).filter((id) => costOf(id) <= bot.gold));
    if (pref.length && rng.next() < 0.85) ids = pref;
  }
  if (!ids.length) return null;
  const completable = ids.filter((id) => { const n = ownedStar1(bot, id); return n >= 1 && n < 3; });
  if (completable.length && rng.next() < 0.6) return completable[Math.floor(rng.next() * completable.length)];
  return ids[Math.floor(rng.next() * ids.length)];
}
function addCopy(bot, defId) { bot.roster.push({ defId, star: 1 }); }

// fuse 3 copies of same (defId,star) into one of star+1, recursively to ★★★.
function fuseRoster(bot) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let star = 1; star <= 2 && !changed; star++) {
      const groups = {};
      bot.roster.forEach((u, i) => { if (u.star === star) (groups[u.defId] = groups[u.defId] || []).push(i); });
      for (const [defId, idxs] of Object.entries(groups)) {
        if (idxs.length >= 3) {
          const keep = idxs[0];
          for (const i of idxs.slice(1, 3)) bot.roster[i] = null;
          bot.roster = bot.roster.filter(Boolean);
          const u = bot.roster.find((x) => x.defId === defId && x.star === star) || bot.roster[keep];
          u.star = star + 1; changed = true; break;
        }
      }
    }
  }
}

// Build the enemy-side board (rows 0-3): strongest `level` units, melee front (row 3), ranged back.
export function buildBotBoard(bot) {
  const picks = [...bot.roster].sort((a, b) => power(b.defId, b.star) - power(a.defId, a.star)).slice(0, bot.level);
  let f = 0, b = 0; const out = [];
  for (const u of picks) {
    const ranged = (UNITS_BY_ID[u.defId].range || 1) > 1;
    if (ranged) { out.push({ defId: u.defId, star: u.star, col: 1 + (b % 6), row: b % 2 ? 0 : 1 }); b++; }
    else { out.push({ defId: u.defId, star: u.star, col: 1 + (f % 6), row: 3 }); f++; }
  }
  bot.board = out;
  return out;
}

// ---- matchmaking + round resolution ----
export function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function matchmake(lobby) {
  const alive = shuffled(alivePlayers(lobby), lobby.rng);
  lobby.pairs = [];
  for (let i = 0; i < alive.length; i += 2) {
    if (i + 1 < alive.length) lobby.pairs.push([alive[i], alive[i + 1]]);
    else { const g = alive.find((p) => p !== alive[i]) || alive[i]; lobby.pairs.push([alive[i], { ghost: true, board: (g.board || []).slice(), name: 'Echo' }]); }
  }
  const hp = lobby.pairs.find((p) => p[0].isHuman || p[1].isHuman);
  lobby.opponent = hp ? (hp[0].isHuman ? hp[1] : hp[0]) : null;
}

const dmgFrom = (survivors, round) => playerDamage(survivors || [], round);
// reflect a board across the centre line so front stays front (row 3 <-> row 4).
export const mirror = (board) => (board || []).map((u) => ({ ...u, row: 7 - u.row }));
function bumpStreak(p, won) { if (won == null) return; p.streakN = (p.lastStreakWon === won) ? p.streakN + 1 : 1; p.lastStreakWon = won; }

function resolveBotPair(a, b, round, seed, lobby) {
  const A = mirror(a.board || []), B = (b.board || []);
  if (!A.length && !B.length) return;
  const res = simulate(A, B, seed, { aug: { player: botBundle(a, lobby), enemy: botBundle(b, lobby) } });
  const w = res.result.winner;
  if (w === 'player') { if (!b.ghost) b.hp -= dmgFrom(res.finalState.survivors.player, round); a.lastWon = true; }
  else if (w === 'enemy') { a.hp -= dmgFrom(res.finalState.survivors.enemy, round); a.lastWon = false; }
  if (!b.ghost) b.lastWon = (w === 'enemy');
  bumpStreak(a, a.lastWon); if (!b.ghost) bumpStreak(b, b.lastWon);
}

// Called AFTER the human's interactive fight. Applies the human-match HP, auto-resolves the
// other pairs, eliminates the dead (returning their units to the shared pool), advances
// surviving bots, recomputes the underdog, and matchmakes next round. Returns a UI summary.
export function resolveLadderRound(lobby, humanBoard, humanResult, playedRound) {
  const human = lobby.human;
  human.board = mirror(humanBoard);
  const matched = lobby.opponent;
  const w = humanResult.result.winner;
  if (matched && !matched.ghost) {
    if (w === 'player') matched.hp -= dmgFrom(humanResult.finalState.survivors.player, playedRound);
    else if (w === 'enemy') human.hp -= dmgFrom(humanResult.finalState.survivors.enemy, playedRound);
    human.lastWon = (w === 'player'); matched.lastWon = (w === 'enemy');
    bumpStreak(human, human.lastWon); bumpStreak(matched, matched.lastWon);
  } else if (matched && matched.ghost && w === 'enemy') {
    human.hp -= dmgFrom(humanResult.finalState.survivors.enemy, playedRound);
  }
  let s = 1;
  for (const [a, b] of lobby.pairs) {
    if (a.isHuman || b.isHuman) continue;
    resolveBotPair(a, b, playedRound, (playedRound * 131 + (s++) * 17) >>> 0, lobby);
  }
  // eliminate the dead; assign placements; return their champions to the shared pool
  const dead = alivePlayers(lobby).filter((p) => p.hp <= 0).sort((x, y) => x.hp - y.hp);
  let place = alivePlayers(lobby).length;
  for (const p of dead) {
    p.alive = false; p.hp = 0; p.place = place--;
    if (!p.isHuman && p.roster) for (const u of p.roster) { const c = u.star === 3 ? 9 : u.star === 2 ? 3 : 1; lobby.pool[u.defId] = (lobby.pool[u.defId] || 0) + c; }
  }
  const left = alivePlayers(lobby);
  if (left.length === 1) left[0].place = 1;
  // advance round: recompute underdog, bots take their economy turn, matchmake
  const nextRound = playedRound + 1;
  lobby.round = nextRound;
  lobby.underdog = underdog(lobby) ? underdog(lobby).id : null;
  for (const bot of lobby.bots) if (bot.alive) botTurn(bot, nextRound, lobby);
  matchmake(lobby);
  return { over: !human.alive || left.length <= 1, humanPlace: human.place, humanAlive: human.alive, dead: dead.map((d) => d.name), humanIsUnderdog: lobby.underdog === 'you' };
}

// ---- persistence (survive a page reload) ----
function serializePlayer(p) {
  if (p.isHuman) return { isHuman: true, name: p.name, emoji: p.emoji, warlordName: p.warlordName, powerId: p.powerId, hp: p.hp, alive: p.alive, place: p.place, board: p.board, streakN: p.streakN, lastWon: p.lastWon, lastStreakWon: p.lastStreakWon };
  return { id: p.id, name: p.name, emoji: p.emoji, styleId: p.style.id, rng: p.rng.save(), gold: p.gold, level: p.level, xp: p.xp, hp: p.hp, alive: p.alive, place: p.place, roster: p.roster, board: p.board, augments: p.augments || [], streakN: p.streakN, lastWon: p.lastWon, lastStreakWon: p.lastStreakWon };
}
export function serializeLobby(lobby) {
  const ref = (o) => o ? (o.ghost ? { ghost: true, board: o.board } : (o.isHuman ? 'you' : o.id)) : null;
  return { rng: lobby.rng.save(), round: lobby.round, pool: lobby.pool, underdog: lobby.underdog, modifier: lobby.modifier, human: serializePlayer(lobby.human), bots: lobby.bots.map(serializePlayer), opponent: ref(lobby.opponent), pairs: lobby.pairs.map(([a, b]) => [ref(a), ref(b)]) };
}
export function deserializeLobby(obj) {
  if (!obj || !obj.bots) return null;
  const human = { isHuman: true, id: 'you', name: obj.human.name, emoji: obj.human.emoji, warlordName: obj.human.warlordName, powerId: obj.human.powerId, hp: obj.human.hp, alive: obj.human.alive, place: obj.human.place, board: obj.human.board || [], streakN: obj.human.streakN || 0, lastWon: obj.human.lastWon, lastStreakWon: obj.human.lastStreakWon };
  const bots = obj.bots.map((b) => ({ id: b.id, name: b.name, emoji: b.emoji, style: STYLES.find((s) => s.id === b.styleId) || STYLES[0], powerId: b.styleId, rng: new RNG(b.rng.seed).load(b.rng), gold: b.gold, level: b.level, xp: b.xp, hp: b.hp, alive: b.alive, place: b.place, roster: b.roster || [], board: b.board || [], augments: b.augments || [], streakN: b.streakN || 0, lastWon: b.lastWon, lastStreakWon: b.lastStreakWon }));
  const byId = { you: human }; for (const b of bots) byId[b.id] = b;
  const deref = (r) => r == null ? null : (r.ghost ? { ghost: true, board: r.board } : byId[r]);
  return { rng: new RNG(obj.rng.seed).load(obj.rng), round: obj.round, pool: obj.pool || freshPool(), underdog: obj.underdog || null, modifier: obj.modifier || MODIFIERS[0], human, bots, players: [human, ...bots], opponent: deref(obj.opponent), pairs: (obj.pairs || []).map(([a, b]) => [deref(a), deref(b)]) };
}
