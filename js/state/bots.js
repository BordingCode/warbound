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
import { TRAITS, activeTraits } from '../data/traits.js';
import { SHOP_ODDS, XP_TO_NEXT, MAX_LEVEL, POOL_COPIES } from './run.js';
import { simulate, playerDamage } from '../sim/combat.js';
import { augmentBundle, AUGMENT_IDS, AUGMENTS } from '../data/augments.js';

// augments a bot may draft — combat/synergy/build value (skip pure-econ; a bot's economy
// doesn't model interest/reroll perks). Bots draft RANDOMLY, so a thinking player still wins.
const BOT_AUGMENTS = AUGMENT_IDS.filter((id) => AUGMENTS[id].cat !== 'econ');

export const START_HP = 200;     // ladder HP pool — enlarged from 130 for longer (~19-round) games + less punishing per-loss; damage shape unchanged so difficulty/placement balance is preserved
const INTEREST_CAP = 5;

const byCost = { 1: [], 2: [], 3: [], 4: [], 5: [] };
for (const u of UNITS) byCost[u.cost].push(u.defId);
const costOf = (id) => (UNITS_BY_ID[id] ? UNITS_BY_ID[id].cost : 1);
const hasTrait = (id, t) => { const d = UNITS_BY_ID[id]; return d && (d.origin === t || d.klass === t); };
// raw stat proxy (the DUMB fielding heuristic — used at low difficulty / on a "blunder")
const power = (id, star) => { const s = statsForStar(UNITS_BY_ID[id], star); return s.hp * 0.045 + s.ad * 0.55 + costOf(id) * 12; };
// SMART unit value — credits casters/support for their ability (the dumb proxy ignores AP).
function unitValue(id, star) {
  const def = UNITS_BY_ID[id]; const s = statsForStar(def, star);
  let v = s.hp * 0.04 + s.ad * 0.5 + costOf(id) * 8;
  const ab = def.ability, m = star === 3 ? 1.7 : star === 2 ? 1.3 : 1;
  if (ab && (ab.type === 'magic' || ab.type === 'heal' || ab.type === 'shield' || ab.type === 'summon')) v += (ab.ap || ab.summonHp || 200) * 0.10 * m;
  return v;
}
// SMART board score — rewards active SYNERGY breakpoints + a healthy frontline (the genuine
// power sources the dumb proxy is blind to). units: [{defId, star}]; tb = augment trait crowns.
function boardScore(units, tb) {
  let v = 0; for (const u of units) v += unitValue(u.defId, u.star);
  const active = activeTraits(units.map((u) => UNITS_BY_ID[u.defId]), tb || {});
  for (const t in active) { const a = active[t]; if (a.tier > 0 && TRAITS[t]) v += (TRAITS[t].breakpoints.indexOf(a.tier) + 1) * 45; }
  const melee = units.filter((u) => (UNITS_BY_ID[u.defId].range || 1) === 1).length;
  if (units.length >= 3 && melee === 0) v *= 0.72;   // all-squishy boards fold
  return v;
}
// difficulty (0..5) -> probability a given decision is made SMARTLY (else a plausible 'blunder'
// reverting to the dumb heuristic). Bronze≈0.10 ... Master=1.0. Skill, never stats.
function smartProb(difficulty) { return Math.max(0, Math.min(1, 0.10 + (difficulty || 0) * 0.18)); }
// position a set of units on enemy rows 0-3: melee front (row 3), ranged back; protect the
// highest-value ranged 'carry' in a back corner.
function positionBoard(units) {
  const ranged = units.filter((u) => (UNITS_BY_ID[u.defId].range || 1) > 1).sort((a, b) => unitValue(b.defId, b.star) - unitValue(a.defId, a.star));
  const melee = units.filter((u) => (UNITS_BY_ID[u.defId].range || 1) === 1);
  const out = [];
  let f = 0;
  for (const u of melee) { out.push({ defId: u.defId, star: u.star, col: 1 + (f % 6), row: 3 }); f++; }
  const backCols = [0, 6, 2, 4, 1, 5, 3];   // carry first -> corner
  ranged.forEach((u, i) => out.push({ defId: u.defId, star: u.star, col: backCols[i % backCols.length], row: i % 2 ? 1 : 0 }));
  return out;
}
// trait -> all champion ids carrying it (cross-cost zealotry)
const traitPool = {};
for (const u of UNITS) for (const t of [u.origin, u.klass]) (traitPool[t] = traitPool[t] || []).push(u.defId);

// ---- the rival warlords (fantasy-flavoured styles) ----
// each warlord is shown as a heraldic CREST (sigil letter on a tinted shield), not an emoji.
// `champ` = a representative champion whose portrait is the warlord's "face" in the picker.
export const STYLES = [
  { id: 'warlord', name: 'Warlord Gorn',       sigil: 'G', color: '#ff7a3c', champ: 'bramble_brute',  desc: 'Levels fast, fields a big warband', levelBias: 1.2,  econFloor: 0,  pref: null,       reroll: 0.1 },
  { id: 'baron',   name: 'Baron Goldhand',     sigil: 'B', color: '#ffce5c', champ: 'dragon_knight',  desc: 'Hoards gold, spikes hard late',     levelBias: 1.0,  econFloor: 50, pref: null,       reroll: 0.05 },
  { id: 'gambit',  name: 'Gambit the Mad',     sigil: 'M', color: '#ff7eb6', champ: 'pack_stalker',   desc: 'Rerolls relentlessly for 3-stars',  levelBias: 0.85, econFloor: 18, pref: 'lowcost', reroll: 0.9 },
  { id: 'undead',  name: 'Necrarch the Risen', sigil: 'N', color: '#8cff9e', champ: 'necromancer',    desc: 'Undead horde',                      levelBias: 1.0,  econFloor: 22, pref: 'undead',  reroll: 0.5 },
  { id: 'elf',     name: 'Sylvaen Dawnblade',  sigil: 'S', color: '#54e6c0', champ: 'moon_priestess', desc: 'Elf evasion',                       levelBias: 1.0,  econFloor: 22, pref: 'elf',     reroll: 0.5 },
  { id: 'demon',   name: "Mal'akar the Fell",  sigil: 'K', color: '#ff5a3c', champ: 'warlock',        desc: 'Demon burn',                        levelBias: 1.0,  econFloor: 22, pref: 'demon',   reroll: 0.5 },
  { id: 'knight',  name: 'Dame Ironwall',      sigil: 'I', color: '#b9c4d0', champ: 'knight_captain', desc: 'Knight wall',                       levelBias: 0.95, econFloor: 25, pref: 'knight',  reroll: 0.4 },
  { id: 'mage',    name: 'Archmagus Vorne',    sigil: 'V', color: '#c79bff', champ: 'dragon_sage',    desc: 'Mage burst',                        levelBias: 1.0,  econFloor: 22, pref: 'mage',    reroll: 0.5 },
];

// Signature powers — one per warlord (and the player picks one at run start). Each is a
// modest, roughly-balanced whole-warband COMBAT buff routed through the sim's aug.flat channel
// (COMBAT_KEYS), so it applies identically to a human or AI board. Identity + run variety.
export const POWERS = {
  warlord: { name: "Warlord's Banner", icon: 'sword',  desc: '+9% Attack Damage to your whole warband.', flat: { ad: 0.09 } },
  baron:   { name: 'War Chest',        icon: 'heart',  desc: '+9% max Health to your whole warband.', flat: { hp: 0.09 } },
  gambit:  { name: 'Frenzy',           icon: 'star',   desc: '+9% Attack Speed to your whole warband.', flat: { as: 0.09 } },
  undead:  { name: 'Grave Bond',       icon: 'skull',  desc: 'Your champions revive once at 25% HP.', flat: { revive: 0.25 } },
  elf:     { name: 'Moonward',         icon: 'shield', desc: 'Your champions start with a 130 shield.', flat: { shield: 130 } },
  demon:   { name: 'Soul Drain',       icon: 'potion', desc: 'Lifesteal: heal 12% of damage dealt.', flat: { vamp: 0.12 } },
  knight:  { name: 'Bulwark',          icon: 'shield', desc: '+18 Armor & Magic Resist to your warband.', flat: { armor: 18, mr: 18 } },
  mage:    { name: 'Arcane Surge',     icon: 'gem',    desc: '+45 Ability Power to your whole warband.', flat: { ap: 45 } },
};
// Lobby-wide modifier — one random rule per match, applied to EVERY warband's combat. Forces a
// fresh approach each game (TFT Encounters / HS Battlegrounds Anomalies).
export const MODIFIERS = [
  { id: 'none',     name: 'Fair Fight',    icon: 'sword',  desc: 'No special rules this match.', flat: {} },
  { id: 'bloodlust',name: 'Bloodlust',     icon: 'sword',  desc: 'Every champion has +12% Attack Damage.', flat: { ad: 0.12 } },
  { id: 'ironhide', name: 'Ironhide',      icon: 'shield', desc: 'Every champion has +20 Armor & MR.', flat: { armor: 20, mr: 20 } },
  { id: 'haste',    name: 'Battle Haste',  icon: 'star',   desc: 'Every champion has +14% Attack Speed.', flat: { as: 0.14 } },
  { id: 'arcane',   name: 'Arcane Storm',  icon: 'gem',    desc: 'Every champion has +30 Ability Power.', flat: { ap: 30 } },
  { id: 'vampiric', name: 'Vampiric Field',icon: 'potion', desc: 'Every champion heals 10% of damage dealt.', flat: { vamp: 0.10 } },
  { id: 'glass',    name: 'Glass Cannons', icon: 'burst',  desc: '+18% Attack Damage but -12% Health for all.', flat: { ad: 0.18, hp: -0.12 } },
  { id: 'fortified',name: 'Fortified',     icon: 'shield', desc: 'Every champion starts with a 160 shield.', flat: { shield: 160 } },
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
    id: style.id, name: style.name, style, powerId: style.id,
    rng: new RNG(seed >>> 0),
    gold: 2, level: 2, xp: 0,
    hp: START_HP, alive: true, place: null,
    roster: [], board: [], augments: [], streakN: 0, lastWon: null, lastStreakWon: null,
  };
}

// how well an augment fits the bot's CURRENT board (active synergies + tier). The 'smart' pick.
function augValue(id, activeOnBoard, bot) {
  const a = AUGMENTS[id];
  let v = a.tier === 'prismatic' ? 3 : a.tier === 'rare' ? 2 : 1;
  if (a.wantTrait && activeOnBoard[a.wantTrait]) v += 4;
  if (a.traitBonus) for (const t in a.traitBonus) if (activeOnBoard[t]) v += 2 * a.traitBonus[t];
  if (a.cond) for (const c of a.cond) { const m = c.match || {}; if ((m.origin && activeOnBoard[m.origin]) || (m.klass && activeOnBoard[m.klass])) v += 2; }
  return v + bot.rng.next() * 0.5;
}
// a bot drafts one augment. DUMB (random, trait-biased) at low difficulty; SMART (best of 3 by
// how well it fits the bot's current board) at high difficulty. Same COUNT as the player — only
// the QUALITY of the pick scales. No extra augments, no stats.
function botDraftAugment(bot, difficulty) {
  const owned = new Set(bot.augments);
  const pool = BOT_AUGMENTS.filter((id) => !owned.has(id));
  if (!pool.length) return;
  if (bot.rng.next() >= smartProb(difficulty)) {
    // dumb: trait-biased random (the old behaviour)
    const pref = bot.style.pref && bot.style.pref !== 'lowcost' ? pool.filter((id) => AUGMENTS[id].wantTrait === bot.style.pref) : [];
    const from = (pref.length && bot.rng.next() < 0.7) ? pref : pool;
    bot.augments.push(from[Math.floor(bot.rng.next() * from.length)]);
    return;
  }
  // smart: draw 3, pick the best fit for the board it's actually fielding
  const active = activeTraits((bot.board || []).map((u) => UNITS_BY_ID[u.defId]));
  const three = [];
  const p = pool.slice();
  for (let i = 0; i < 3 && p.length; i++) three.push(p.splice(Math.floor(bot.rng.next() * p.length), 1)[0]);
  three.sort((x, y) => augValue(y, active, bot) - augValue(x, active, bot));
  bot.augments.push(three[0]);
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
export function createLobby(seedStr, playerStyleId = 'warlord', difficulty = 0, opponents = 7) {
  const base = seedFromString(String(seedStr) + '-ladder');
  const pool = freshPool();
  const styles = STYLES.filter((s) => s.id !== playerStyleId).slice(0, opponents);
  const bots = styles.map((s, i) => newBot(s, base + i * 7919));
  const chosen = STYLES.find((s) => s.id === playerStyleId) || STYLES[0];
  const human = { id: 'you', name: 'You', sigil: chosen.sigil, color: chosen.color, warlordName: chosen.name, powerId: playerStyleId, isHuman: true, hp: START_HP, alive: true, place: null, board: [], streakN: 0, lastWon: null, lastStreakWon: null };
  const rng = new RNG(base + 104729);
  const modifier = MODIFIERS[Math.floor(rng.next() * MODIFIERS.length)];
  const lobby = { rng, human, bots, players: [human, ...bots], pool, round: 1, pairs: [], opponent: null, underdog: null, modifier, difficulty };
  for (const b of bots) botTurn(b, 1, lobby);     // bots shop round 1 (draws from the shared pool)
  matchmake(lobby);
  counterPivotAll(lobby);                          // top tiers adapt to their matched foe
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
  if ([3, 6, 9, 12].includes(round)) botDraftAugment(bot, lobby ? lobby.difficulty : 0);   // match the player's augment count
  fuseRoster(bot);
  buildBotBoard(bot, lobby);
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

// candidate fielding sets: top-by-value, plus a set per dominant trait (to hit breakpoints).
function candidateSets(roster, level) {
  const byVal = [...roster].sort((a, b) => unitValue(b.defId, b.star) - unitValue(a.defId, a.star));
  const sets = [byVal.slice(0, level)];
  const tc = {};
  for (const u of roster) for (const t of [UNITS_BY_ID[u.defId].origin, UNITS_BY_ID[u.defId].klass]) tc[t] = (tc[t] || 0) + 1;
  const top = Object.entries(tc).sort((a, b) => b[1] - a[1]).slice(0, 2).map((x) => x[0]);
  for (const t of top) {
    const inT = byVal.filter((u) => { const d = UNITS_BY_ID[u.defId]; return d.origin === t || d.klass === t; });
    const rest = byVal.filter((u) => !inT.includes(u));
    sets.push(inT.concat(rest).slice(0, level));
  }
  return sets;
}
const sameSet = (a, b) => a.length === b.length && a.every((u, i) => b[i] && u.defId === b[i].defId && u.star === b[i].star);
// one-ply lookahead: sim the shortlisted candidate boards head-to-head, pick the one that wins
// most. The bot literally tests its options in the battle engine. (top tiers only)
function simBestCandidate(cands) {
  const uniq = cands.filter((c, i) => cands.findIndex((x) => sameSet(x, c)) === i);
  if (uniq.length < 2) return uniq[0];
  const wins = uniq.map(() => 0);
  for (let i = 0; i < uniq.length; i++) for (let j = 0; j < uniq.length; j++) {
    if (i === j) continue;
    const A = positionBoard(uniq[i]).map((u) => ({ ...u, row: 7 - u.row }));
    const B = positionBoard(uniq[j]);
    if (simulate(A, B, (i * 7 + j * 13 + 5) >>> 0).result.winner === 'player') wins[i]++;
  }
  let best = 0; for (let i = 1; i < uniq.length; i++) if (wins[i] > wins[best]) best = i;
  return uniq[best];
}

// crude positioning (a low-tier blunder): ignore roles — scatter units, exposing carries.
function positionBoardCrude(units, rng) {
  const cols = shuffled([0, 1, 2, 3, 4, 5, 6], rng);
  return units.map((u, i) => ({ defId: u.defId, star: u.star, col: cols[i % cols.length], row: i % 4 }));
}
// Build the enemy-side board (rows 0-3). Decision QUALITY scales with difficulty; never stats.
// Low tier: blunders — fields a RANDOM subset and mis-positions. High tier: synergy-aware pick,
// a sim-tested choice, and protected positioning. Each decision is gated independently.
export function buildBotBoard(bot, lobby) {
  const level = bot.level, roster = bot.roster;
  const sp = smartProb(lobby ? lobby.difficulty : 0);
  let chosen;
  if (roster.length <= level) {
    chosen = roster.slice();
  } else if (bot.rng.next() >= sp) {
    // BLUNDER: field a random subset of the roster (leaves synergies/carries on the bench)
    chosen = shuffled(roster, bot.rng).slice(0, level);
  } else {
    const tb = (bot.augments && bot.augments.length) ? augmentBundle(bot.augments).traitBonus : {};
    const cands = candidateSets(roster, level);
    let best = cands[0], bs = -1;
    for (const c of cands) { const sc = boardScore(c, tb); if (sc > bs) { bs = sc; best = c; } }
    chosen = (lobby && lobby.difficulty >= 4) ? (simBestCandidate(cands) || best) : best;   // top tiers think
  }
  // position smartly or crudely (a second, independent skill check)
  bot.board = (bot.rng.next() < sp) ? positionBoard(chosen) : positionBoardCrude(chosen, bot.rng);
  return bot.board;
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

// ---- reactive counter-pivot (top tiers only) ----
// AFTER matchmaking, a high-difficulty bot re-fields the board that best beats its ACTUAL
// opponent's board — it reads the matchup instead of fielding a generic best. This is pure
// DECISION QUALITY (gated by difficulty, deterministic seeded sims), never a stat advantage;
// low-tier bots never do it (they can't "see" their foe). Bounded: ≤3 candidates × 3 seeds.
function pairOpponent(p, lobby) {
  for (const [a, b] of lobby.pairs) { if (a === p) return b; if (b === p) return a; }
  return null;
}
export function counterPivot(bot, lobby) {
  if (!lobby || (lobby.difficulty || 0) < 4) return;          // Diamond+ only
  if (!bot.roster || bot.roster.length <= bot.level) return;  // no fielding choice to make
  const opp = pairOpponent(bot, lobby);
  if (!opp || opp.ghost || !opp.board || !opp.board.length) return;
  const cands = candidateSets(bot.roster, bot.level).filter((c, i, arr) => arr.findIndex((x) => sameSet(x, c)) === i);
  if (cands.length < 2) return;
  const selfBundle = botBundle(bot, lobby), oppBundle = botBundle(opp, lobby), oppBoard = opp.board;
  let best = null, bestWins = -1;
  for (const c of cands) {
    const A = mirror(positionBoard(c));                        // field the bot on the player half
    let wins = 0;
    for (let s = 0; s < 3; s++) if (simulate(A, oppBoard, (s * 97 + 17) >>> 0, { aug: { player: selfBundle, enemy: oppBundle } }).result.winner === 'player') wins++;
    if (wins > bestWins) { bestWins = wins; best = c; }
  }
  if (best) bot.board = positionBoard(best);
}
function counterPivotAll(lobby) { for (const bot of lobby.bots) if (bot.alive) counterPivot(bot, lobby); }

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
  counterPivotAll(lobby);                          // top tiers re-field to counter their matched foe (incl. your last board)
  return { over: !human.alive || left.length <= 1, humanPlace: human.place, humanAlive: human.alive, dead: dead.map((d) => d.name), humanIsUnderdog: lobby.underdog === 'you' };
}

// ---- persistence (survive a page reload) ----
function serializePlayer(p) {
  if (p.isHuman) return { isHuman: true, name: p.name, sigil: p.sigil, color: p.color, warlordName: p.warlordName, powerId: p.powerId, hp: p.hp, alive: p.alive, place: p.place, board: p.board, streakN: p.streakN, lastWon: p.lastWon, lastStreakWon: p.lastStreakWon };
  return { id: p.id, name: p.name, styleId: p.style.id, rng: p.rng.save(), gold: p.gold, level: p.level, xp: p.xp, hp: p.hp, alive: p.alive, place: p.place, roster: p.roster, board: p.board, augments: p.augments || [], streakN: p.streakN, lastWon: p.lastWon, lastStreakWon: p.lastStreakWon };
}
export function serializeLobby(lobby) {
  const ref = (o) => o ? (o.ghost ? { ghost: true, board: o.board } : (o.isHuman ? 'you' : o.id)) : null;
  return { rng: lobby.rng.save(), round: lobby.round, pool: lobby.pool, underdog: lobby.underdog, modifier: lobby.modifier, difficulty: lobby.difficulty || 0, human: serializePlayer(lobby.human), bots: lobby.bots.map(serializePlayer), opponent: ref(lobby.opponent), pairs: lobby.pairs.map(([a, b]) => [ref(a), ref(b)]) };
}
export function deserializeLobby(obj) {
  if (!obj || !obj.bots) return null;
  const human = { isHuman: true, id: 'you', name: obj.human.name, sigil: obj.human.sigil, color: obj.human.color, warlordName: obj.human.warlordName, powerId: obj.human.powerId, hp: obj.human.hp, alive: obj.human.alive, place: obj.human.place, board: obj.human.board || [], streakN: obj.human.streakN || 0, lastWon: obj.human.lastWon, lastStreakWon: obj.human.lastStreakWon };
  const bots = obj.bots.map((b) => ({ id: b.id, name: b.name, style: STYLES.find((s) => s.id === b.styleId) || STYLES[0], powerId: b.styleId, rng: new RNG(b.rng.seed).load(b.rng), gold: b.gold, level: b.level, xp: b.xp, hp: b.hp, alive: b.alive, place: b.place, roster: b.roster || [], board: b.board || [], augments: b.augments || [], streakN: b.streakN || 0, lastWon: b.lastWon, lastStreakWon: b.lastStreakWon }));
  const byId = { you: human }; for (const b of bots) byId[b.id] = b;
  const deref = (r) => r == null ? null : (r.ghost ? { ghost: true, board: r.board } : byId[r]);
  return { rng: new RNG(obj.rng.seed).load(obj.rng), round: obj.round, pool: obj.pool || freshPool(), underdog: obj.underdog || null, modifier: obj.modifier || MODIFIERS[0], difficulty: obj.difficulty || 0, human, bots, players: [human, ...bots], opponent: deref(obj.opponent), pairs: (obj.pairs || []).map(([a, b]) => [deref(a), deref(b)]) };
}
