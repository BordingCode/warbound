// Automated comp-balance tuner.  Run: node js/sim/tuner.mjs
//
// HOW IT WORKS
// The combat sim reads unit/trait numbers from the live objects UNITS_BY_ID and TRAITS.
// So we can tune purely in memory: snapshot the originals, then express balance as a set of
// KNOBS (each a multiplier over a group of source values). For a candidate set of knob values
// we reset to the snapshot, re-apply every knob, run the realistic mirrored round-robin, and
// score how far each comp's win-rate is from 50%.  Coordinate-descent hill-climbing nudges one
// knob at a time (±step), keeping a change only if it lowers the score.  Deterministic sim +
// fixed seeds => deterministic score => stable climb.
//
// It does NOT edit source files. It prints the converged multipliers + concrete suggested
// numbers (only for knobs that actually moved) so the change to units.js / traits.js is small.

import { simulate } from './combat.js';
import { UNITS, UNITS_BY_ID } from '../data/units.js';
import { TRAITS } from '../data/traits.js';

// ---- realistic archetype comps + mirrored placement (same as autobalance.js) ----
const COMPS = {
  Knight:   ['knight_captain', 'bone_guard', 'hellguard', 'crossbowman', 'court_mage', 'field_medic'],
  Mage:     ['court_mage', 'lich', 'warlock', 'orc_shaman', 'bone_guard', 'field_medic'],
  Assassin: ['wraith', 'shadow_dancer', 'pack_stalker', 'imp_assassin', 'bone_guard', 'field_medic'],
  Undead:   ['bone_guard', 'lich', 'skeleton_archer', 'wraith', 'necromancer', 'field_medic'],
  Demon:    ['hellguard', 'warlock', 'fel_archer', 'imp_assassin', 'bone_guard', 'field_medic'],
  Beast:    ['bramble_brute', 'beast_hunter', 'pack_stalker', 'knight_captain', 'druid_healer', 'beastmaster'],
  Elf:      ['knight_captain', 'moon_priestess', 'wood_ranger', 'shadow_dancer', 'grove_healer', 'bone_guard'],
  Ranger:   ['crossbowman', 'wood_ranger', 'fel_archer', 'knight_captain', 'axethrower', 'field_medic'],
  Summoner: ['necromancer', 'pit_summoner', 'beastmaster', 'banner_sergeant', 'bone_guard', 'field_medic'],
  Dragon:   ['dragon_knight', 'dragon_sage', 'knight_captain', 'bone_guard', 'moon_priestess', 'grove_healer'],
  Orc:      ['warboss', 'orc_grunt', 'berserker', 'axethrower', 'orc_shaman', 'field_medic'],
};
// Realistic stars: cheap units reach 3★, elites stay 1★ — how real boards actually look. Tuning
// against flat 2★ (the old default) ignored that cheap Demon/Summoner units hit 3★ and dominate.
const STAR_BY_COST = { 1: 3, 2: 3, 3: 2, 4: 1, 5: 1 };
function place(ids, enemy) {
  const front = ['knight', 'assassin'], out = []; let fc = 0, bc = 0;
  for (const id of ids) {
    const u = UNITS_BY_ID[id]; const k = u.klass; const star = STAR_BY_COST[u.cost] || 1;
    if (front.includes(k)) { out.push({ defId: id, star, col: 1 + (fc % 6), row: enemy ? (fc < 3 ? 1 : 2) : (fc < 3 ? 6 : 5) }); fc++; }
    else { out.push({ defId: id, star, col: 1 + (bc % 6), row: enemy ? (bc % 2 ? 0 : 1) : (bc % 2 ? 7 : 6) }); bc++; }
  }
  return out;
}
const NAMES = Object.keys(COMPS);
// IMPORTANT: combat matchups are near-deterministic (RNG only jitters crit/dodge timing), so a
// matchup resolves ~0%/~100% and per-matchup win-rates are COARSE. With too few seeds the climber
// overfits the seed sample (verified: a 9-seed optimum did NOT generalise to 15 seeds). Use a high
// seed count for a trustworthy signal; this is an OFFLINE tool, so prefer slow-but-correct.
const SEEDS = 15;                                  // fights per matchup (more = smoother + less overfit, slower)
function winRates() {
  const wins = NAMES.map(() => 0), games = NAMES.map(() => 0);
  for (let i = 0; i < NAMES.length; i++) for (let j = 0; j < NAMES.length; j++) {
    if (i === j) continue;
    const P = place(COMPS[NAMES[i]], false), E = place(COMPS[NAMES[j]], true);
    for (let s = 1; s <= SEEDS; s++) { games[i]++; if (simulate(P, E, s * 31 + 5).result.winner === 'player') wins[i]++; }
  }
  return NAMES.map((n, i) => ({ name: n, wr: wins[i] / games[i] }));
}
// loss: squared distance from 50%, with extra penalty for anything outside the 35–65% band.
function score() {
  let L = 0;
  for (const r of winRates()) {
    const d = r.wr - 0.5; L += d * d;
    if (r.wr > 0.65) L += 3 * (r.wr - 0.65) ** 2;
    if (r.wr < 0.35) L += 3 * (0.35 - r.wr) ** 2;
  }
  return L;
}

// ---- snapshot originals ----
const isDragon = (id) => UNITS_BY_ID[id].origin === 'dragon';
const baseU = {}; for (const u of UNITS) baseU[u.defId] = { hp: u.hp, ad: u.ad, ability: JSON.parse(JSON.stringify(u.ability)) };
const baseT = {}; for (const t in TRAITS) baseT[t] = JSON.parse(JSON.stringify(TRAITS[t].bonuses));
const r3 = (x) => Math.round(x * 1000) / 1000;
const scaleVal = (b, v) => (Number.isInteger(b) ? Math.round(b * v) : r3(b * v));   // keep fractions (e.g. critDmg 1.5) precise; only true ints round

function resetBase() {
  for (const u of UNITS) { const b = baseU[u.defId]; u.hp = b.hp; u.ad = b.ad; u.ability = JSON.parse(JSON.stringify(b.ability)); }
  for (const t in TRAITS) TRAITS[t].bonuses = JSON.parse(JSON.stringify(baseT[t]));
}

// ---- knob factories (each mutates live data = snapshot * value; groups are disjoint) ----
const knobs = [];
const K = (name, min, max, apply) => knobs.push({ name, value: 1, min, max, step: 0.06, apply });

// class power (hp+ad) — dragons excluded (their own knob)
for (const klass of ['knight', 'mage', 'ranger', 'assassin', 'healer', 'summoner'])
  K('cls:' + klass, 0.78, 1.3, (v) => { for (const u of UNITS) if (u.klass === klass && !isDragon(u.defId)) { u.hp = Math.round(baseU[u.defId].hp * v); u.ad = Math.round(baseU[u.defId].ad * v); } });
// dragon power (hp+ad+ability) — the elite outlier, its own lever
K('dragon', 0.6, 1.1, (v) => { for (const u of UNITS) if (isDragon(u.defId)) { u.hp = Math.round(baseU[u.defId].hp * v); u.ad = Math.round(baseU[u.defId].ad * v); if (u.ability.ap != null) u.ability.ap = Math.round(baseU[u.defId].ability.ap * v); if (u.ability.adRatio != null) u.ability.adRatio = r3(baseU[u.defId].ability.adRatio * v); } });
// ability power by archetype (non-dragon)
const abilityKnob = (name, match, fields) => K('ab:' + name, 0.7, 1.35, (v) => { for (const u of UNITS) { if (isDragon(u.defId) || !match(u.ability)) continue; for (const f of fields) if (u.ability[f] != null) u.ability[f] = scaleVal(baseU[u.defId].ability[f], v); } });
abilityKnob('nuke', (a) => a.type === 'magic', ['ap']);
abilityKnob('exec', (a) => a.target === 'lowestEnemyHP', ['adRatio']);
abilityKnob('volley', (a) => a.target === 'mostEnemies', ['adRatio']);
abilityKnob('melee', (a) => a.type === 'physical' && (a.target === 'cluster' || a.target === 'current'), ['adRatio']);
abilityKnob('summon', (a) => a.type === 'summon', ['summonHp', 'summonAd']);
abilityKnob('heal', (a) => a.type === 'heal' || a.type === 'shield', ['ap']);
// trait power
const traitKnob = (t, keys) => K('tr:' + t, 0.6, 1.5, (v) => { for (const bp in TRAITS[t].bonuses) for (const key of keys) if (baseT[t][bp][key] != null) TRAITS[t].bonuses[bp][key] = scaleVal(baseT[t][bp][key], v); });
traitKnob('knight', ['block']);
traitKnob('undead', ['revivePct']);
traitKnob('elf', ['dodge', 'shield']);
traitKnob('demon', ['burn', 'manaBurn']);
traitKnob('beast', ['ferocity']);
traitKnob('orc', ['ferocity', 'vamp']);
traitKnob('dragon', ['mr']);
traitKnob('mage', ['ap']);
traitKnob('assassin', ['critChance', 'critDmg']);
traitKnob('ranger', ['rangerAS']);
traitKnob('summoner', ['summonPower']);
traitKnob('healer', ['healAmp', 'regen']);

function applyAll() { resetBase(); for (const k of knobs) k.apply(k.value); }
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const fmtRates = () => winRates().sort((a, b) => b.wr - a.wr).map((r) => `${r.name} ${Math.round(r.wr * 100)}%`).join(' | ');

// ---- hill climb ----
const PASSES = 12;
applyAll();
const before = fmtRates();
let best = score();
process.stdout.write(`start score ${best.toFixed(4)}\n  ${before}\n`);
for (let pass = 0; pass < PASSES; pass++) {
  let improved = false;
  for (const k of knobs) {
    for (const dir of [1, -1]) {
      const old = k.value, nv = clamp(+(old + dir * k.step).toFixed(3), k.min, k.max);
      if (nv === old) continue;
      k.value = nv; applyAll();
      const L = score();
      if (L < best - 1e-6) { best = L; improved = true; }
      else { k.value = old; }
    }
  }
  applyAll();
  process.stdout.write(`pass ${pass + 1}: score ${best.toFixed(4)}\n`);
  if (!improved) break;
}
applyAll();
process.stdout.write(`\nfinal score ${best.toFixed(4)}\n  before: ${before}\n  after:  ${fmtRates()}\n`);

// ---- report only the knobs that actually moved, as concrete source guidance ----
process.stdout.write('\nAPPLY THESE (knob -> multiplier on the source values):\n');
for (const k of knobs) {
  if (Math.abs(k.value - 1) < 0.03) continue;
  process.stdout.write(`  ${k.name.padEnd(14)} x${k.value.toFixed(2)}\n`);
}
process.stdout.write('\nConcrete resulting numbers for moved groups:\n');
for (const k of knobs) {
  if (Math.abs(k.value - 1) < 0.03) continue;
  if (k.name.startsWith('cls:')) { const kl = k.name.slice(4); const u = UNITS.find((x) => x.klass === kl && !isDragon(x.defId)); process.stdout.write(`  ROLE.${kl}: hpx,adx *= ${k.value.toFixed(2)}  (e.g. ${u.defId} -> hp${u.hp} ad${u.ad})\n`); }
  else if (k.name === 'dragon') { process.stdout.write(`  dragons *= ${k.value.toFixed(2)}: ${UNITS.filter((u) => isDragon(u.defId)).map((u) => `${u.defId} hp${u.hp} ad${u.ad} ap${u.ability.ap ?? '-'}`).join(', ')}\n`); }
  else if (k.name.startsWith('ab:')) { const ex = UNITS.find((u) => !isDragon(u.defId) && ({ nuke: (a) => a.type === 'magic', exec: (a) => a.target === 'lowestEnemyHP', volley: (a) => a.target === 'mostEnemies', melee: (a) => a.type === 'physical' && (a.target === 'cluster' || a.target === 'current'), summon: (a) => a.type === 'summon', heal: (a) => a.type === 'heal' || a.type === 'shield' }[k.name.slice(3)])(u.ability)); process.stdout.write(`  ability ${k.name.slice(3)} *= ${k.value.toFixed(2)}  (e.g. ${ex.defId} ${JSON.stringify(ex.ability)})\n`); }
  else if (k.name.startsWith('tr:')) { const t = k.name.slice(3); process.stdout.write(`  TRAITS.${t} *= ${k.value.toFixed(2)}: ${JSON.stringify(TRAITS[t].bonuses)}\n`); }
}
