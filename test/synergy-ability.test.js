// Verifies every SYNERGY (trait) actually changes combat as described, and every ABILITY
// in use actually fires and produces its effect. Pure-sim, no DOM. Run: node test/synergy-ability.test.js
//
// Method: the sim reads traits from board composition, but `opts.aug.player.traitBonus` can
// push a trait's count to any breakpoint with a minimal board — so we A/B the SAME fixed
// matchup with the trait OFF vs ON and assert the observable effect appears only when ON.
import { simulate } from '../js/sim/combat.js';
import { UNITS, UNITS_BY_ID } from '../js/data/units.js';
import { TRAITS } from '../js/data/traits.js';

let pass = 0, fail = 0; const fails = [];
const ok = (name, cond, detail) => { if (cond) { pass++; console.log(`  ✓ ${name}${detail ? '  — ' + detail : ''}`); } else { fail++; fails.push(name); console.log(`  ✗ ${name}${detail ? '  — ' + detail : ''}`); } };

const U = (defId, col, row, star = 1) => ({ defId, col, row, star });
function sim(P, E, { player, enemy, seed = 7 } = {}) {
  const aug = {};
  if (player) aug.player = { traitBonus: player };
  if (enemy) aug.enemy = { traitBonus: enemy };
  return simulate(P, E, seed, { aug });
}
// event helpers (player units get ids in board order starting at 0)
const evs = (r) => r.events;
const count = (r, pred) => evs(r).filter(pred).length;
const dmgBy = (r, src, type) => evs(r).filter(e => e.type === 'damage' && e.src === src && (!type || e.dmgType === type));
const firstDmgTo = (r, id, type) => evs(r).find(e => e.type === 'damage' && e.id === id && (!type || e.dmgType === type));
const casts = (r) => evs(r).filter(e => e.type === 'cast');

// A tanky, low-threat enemy wall so most fights last long enough to observe effects.
const WALL = [U('bone_guard', 3, 1, 3), U('bone_guard', 4, 1, 3), U('bone_guard', 3, 2, 3)];
// strong killers (to force a lone player unit to die — for revive)
const KILLERS = [U('royal_blade', 3, 1, 3), U('royal_blade', 4, 1, 3), U('bramble_brute', 3, 2, 3)];

console.log('\n=== SYNERGIES (trait A/B: OFF vs ON) ===');

// human — manaRegen makes casters cast more often
{
  const P = [U('court_mage', 3, 7), U('bone_guard', 3, 5, 3)];
  const a = sim(P, WALL), b = sim(P, WALL, { player: { human: 6 } });
  ok('Human (mana regen → more casts)', casts(b).length > casts(a).length, `casts ${casts(a).length}→${casts(b).length}`);
}
// knight — block reduces incoming physical (compare first hit on the player knight)
{
  const P = [U('bone_guard', 3, 5, 3)];
  const E = [U('crossbowman', 3, 1, 3)];
  const a = sim(P, E), b = sim(P, E, { player: { knight: 6 } });
  const da = firstDmgTo(a, 0, 'physical'), db = firstDmgTo(b, 0, 'physical');
  ok('Knight (block → less dmg taken)', da && db && db.amount < da.amount, `first hit ${da?.amount}→${db?.amount}`);
}
// mage — ap raises the mage's spell damage
{
  const P = [U('court_mage', 3, 7), U('bone_guard', 3, 5, 3)];
  const a = sim(P, WALL, { player: { human: 6 } });
  const b = sim(P, WALL, { player: { human: 6, mage: 6 } });
  const ma = dmgBy(a, 0, 'magic')[0], mb = dmgBy(b, 0, 'magic')[0];
  ok('Mage (AP → bigger spell)', ma && mb && mb.amount > ma.amount, `nuke ${ma?.amount}→${mb?.amount}`);
}
// elf — dodge (physical) + starting shield
{
  const P = [U('bone_guard', 3, 5, 3)];
  const E = [U('crossbowman', 3, 1, 3)];
  const a = sim(P, E), b = sim(P, E, { player: { elf: 4 } });
  ok('Elf (dodge physical)', count(b, e => e.type === 'dodge') > 0 && count(a, e => e.type === 'dodge') === 0, `dodges ${count(a, e=>e.type==='dodge')}→${count(b, e=>e.type==='dodge')}`);
  const shB = evs(b).find(e => e.type === 'spawn' && e.id === 0)?.shield;
  const shA = evs(a).find(e => e.type === 'spawn' && e.id === 0)?.shield;
  ok('Elf (starting shield)', (shB || 0) > (shA || 0), `shield ${shA}→${shB}`);
}
// demon — burn adds magic damage on each hit
{
  const P = [U('imp_assassin', 3, 5)];
  const a = sim(P, WALL), b = sim(P, WALL, { player: { demon: 6 } });
  ok('Demon (burn = bonus magic per hit)', dmgBy(b, 0, 'magic').length > 0 && dmgBy(a, 0, 'magic').length === 0, `magic hits ${dmgBy(a,0,'magic').length}→${dmgBy(b,0,'magic').length}`);
}
// beast — ferocity ramps attack speed → more attacks over the fight
{
  // long fight (tanky wall) + two front tanks so the beast survives and racks up many attacks.
  // tier 4 (not 6) so ferocity hits ONLY the beast unit, not the tanks — else whole-team AS would
  // shorten the fight and confound the count.
  const P = [U('beast_hunter', 3, 7), U('bone_guard', 2, 5, 3), U('bone_guard', 4, 5, 3)];
  const a = sim(P, WALL), b = sim(P, WALL, { player: { beast: 4 } });
  const atkA = count(a, e => e.type === 'attack' && e.id === 0), atkB = count(b, e => e.type === 'attack' && e.id === 0);
  ok('Beast (ferocity → more attacks)', atkB > atkA, `attacks ${atkA}→${atkB}`);
}
// dragon — magic resist reduces magic damage taken
{
  const P = [U('bone_guard', 3, 5, 3)];
  const E = [U('court_mage', 3, 1)];
  const a = sim(P, E, { enemy: { human: 6 } });
  const b = sim(P, E, { enemy: { human: 6 }, player: { dragon: 2 } });
  const ma = firstDmgTo(a, 0, 'magic'), mb = firstDmgTo(b, 0, 'magic');
  ok('Dragon (MR → less magic dmg)', ma && mb && mb.amount < ma.amount, `magic hit ${ma?.amount}→${mb?.amount}`);
}
// undead — revive once on death
{
  const P = [U('skeleton_archer', 3, 6)];
  const a = sim(P, KILLERS), b = sim(P, KILLERS, { player: { undead: 6 } });
  ok('Undead (revive on death)', count(b, e => e.type === 'revive') > 0 && count(a, e => e.type === 'revive') === 0, `revives ${count(a,e=>e.type==='revive')}→${count(b,e=>e.type==='revive')}`);
}
// ranger — rapid-fire chance ramps attack speed → more attacks
{
  // long fight so the 70%-chance AS bursts accumulate measurably (ranger trait only affects the ranger unit)
  const P = [U('crossbowman', 3, 7), U('bone_guard', 2, 5, 3), U('bone_guard', 4, 5, 3)];
  const a = sim(P, WALL), b = sim(P, WALL, { player: { ranger: 4 } });
  const atkA = count(a, e => e.type === 'attack' && e.id === 0), atkB = count(b, e => e.type === 'attack' && e.id === 0);
  ok('Ranger (rapid fire → more attacks)', atkB > atkA, `attacks ${atkA}→${atkB} (probabilistic)`);
}
// assassin — dive (blink, inherent) + crit from the trait
{
  const P = [U('royal_blade', 3, 7)];
  const a = sim(P, WALL), b = sim(P, WALL, { player: { assassin: 4 } });
  ok('Assassin (dive / blink)', count(a, e => e.type === 'blink' && e.id === 0) > 0, 'dive is inherent to the class');
  ok('Assassin (crit from trait)', count(b, e => e.type === 'attack' && e.id === 0 && e.crit) > 0 && count(a, e => e.type === 'attack' && e.id === 0 && e.crit) === 0, `crits ${count(a,e=>e.type==='attack'&&e.crit)}→${count(b,e=>e.type==='attack'&&e.crit)}`);
}
// healer — healAmp makes Mend heal for more
{
  const P = [U('field_medic', 3, 7), U('bone_guard', 3, 5, 2)];
  const a = sim(P, WALL, { player: { human: 6 } });
  const b = sim(P, WALL, { player: { human: 6, healer: 4 } });
  const ha = evs(a).filter(e => e.type === 'heal' && e.amount > 0)[0], hb = evs(b).filter(e => e.type === 'heal' && e.amount > 0)[0];
  ok('Healer (healAmp → bigger heals)', ha && hb && hb.amount > ha.amount, `mend ${ha?.amount}→${hb?.amount}`);
}
// summoner — summonPower makes the summon tankier
{
  const P = [U('necromancer', 3, 7), U('bone_guard', 3, 5, 3)];
  const a = sim(P, WALL, { player: { human: 6 } });
  const b = sim(P, WALL, { player: { human: 6, summoner: 4 } });
  const sa = evs(a).find(e => e.type === 'spawn' && e.summon), sb = evs(b).find(e => e.type === 'spawn' && e.summon);
  ok('Summoner (stronger summons)', sa && sb && sb.maxHp > sa.maxHp, `summon HP ${sa?.maxHp}→${sb?.maxHp}`);
}

console.log('\n=== ABILITIES (each champion casts its unique signature + base effect) ===');
// representative caster per ability; human:6 = mana regen so they cast quickly.
const ABILS = [
  ['Rallying Bash', 'knight_captain', r => casts(r).some(c => c.name === 'Rallying Bash') && count(r, e => e.type === 'cc' && e.kind === 'stun') > 0],
  ['Arcane Nuke', 'court_mage', r => casts(r).some(c => c.name === 'Arcane Nuke') && dmgBy(r, 0, 'magic').length > 0],
  ['Volley', 'crossbowman', r => casts(r).some(c => c.name === 'Volley')],
  ['Regicide', 'royal_blade', r => casts(r).some(c => c.name === 'Regicide')],
  ['Mend', 'field_medic', r => casts(r).some(c => c.name === 'Mend') && count(r, e => e.type === 'heal') > 0],
  ['Wild Aegis', 'druid_healer', r => casts(r).some(c => c.name === 'Wild Aegis') && count(r, e => e.type === 'shield') > 0],
  ['Raise Dead (summon)', 'necromancer', r => casts(r).some(c => c.name === 'Raise Dead') && count(r, e => e.type === 'spawn' && e.summon) > 0],
  ['Fel Cleave', 'hellguard', r => casts(r).some(c => c.name === 'Fel Cleave')],
  ['Dragon Breath', 'dragon_knight', r => casts(r).some(c => c.name === 'Dragon Breath') && dmgBy(r, 0, 'magic').length > 0],
];
for (const [label, defId, check] of ABILS) {
  // caster back row + a 2★ tank up front so the caster lives long enough to cast; mana regen forces casts
  const P = [U(defId, 3, 7), U('bone_guard', 3, 5, 2), U('field_medic', 4, 7)];
  const r = sim(P, WALL, { player: { human: 6 } });
  const namesSeen = [...new Set(casts(r).map(c => c.name))].join(', ') || 'none';
  ok(`${label} (${defId})`, check(r), `casts seen: ${namesSeen}`);
}

console.log('\n=== 3★ ULTIMATES (the qualitative upgrade emits its new effect) ===');
// Each row: a 3★ caster (mana-regen forced) should produce the tagged event its ult adds.
// We check the new sim event tags: debuff{kind}, buff{kind}, cc{kind}, arc, meteor.
const has = (r, type, kind) => evs(r).some(e => e.type === type && (kind == null || e.kind === kind));
// optional 4th element = custom board (some ults need specific positioning to observe)
const ULTS = [
  ['Knight-Captain 3★ hastes adjacent allies', 'knight_captain', r => has(r, 'buff', 'haste'),
    [U('knight_captain', 3, 7, 3), U('bone_guard', 4, 7, 2), U('field_medic', 0, 7)]],
  ['Lich frost-nova slows', 'lich', r => has(r, 'debuff', 'slow')],
  ['Lich 3★ shreds MR', 'lich', r => has(r, 'debuff', 'shred')],
  ['Court Mage 3★ mana-burns', 'court_mage', r => has(r, 'debuff', 'manaBurn')],
  ['Warlock 3★ burns (DoT)', 'warlock', r => has(r, 'debuff', 'dot')],
  ['Hellguard 3★ heal-cuts', 'hellguard', r => has(r, 'debuff', 'healCut')],
  ['Bone Guard 3★ lifesteal', 'bone_guard', r => has(r, 'buff', 'lifesteal')],
  ['Thornguard 3★ knockup', 'thornguard', r => has(r, 'cc', 'knockup')],
  ['Moon Priestess 3★ chains', 'moon_priestess', r => has(r, 'arc', null)],
  ['Pit Summoner 3★ meteors', 'pit_summoner', r => has(r, 'meteor', null)],
  ['Beast Hunter 3★ marks', 'beast_hunter', r => has(r, 'debuff', 'mark')],
  ['Dragon Knight 3★ shred+slow', 'dragon_knight', r => has(r, 'debuff', 'shred') && has(r, 'debuff', 'slow')],
];
for (const [label, defId, check, board] of ULTS) {
  const P = board || [U(defId, 3, 7, 3), U('bone_guard', 3, 5, 2), U('field_medic', 4, 7)];
  const r = sim(P, WALL, { player: { human: 6 } });
  ok(label, check(r));
}

console.log('\n=== WIRING AUDIT (every champion has a UNIQUE signature ability) ===');
const abilityNames = UNITS.map(u => u.ability && u.ability.name);
const dupes = abilityNames.filter((n, i) => abilityNames.indexOf(n) !== i);
ok('All 29 abilities are uniquely named', dupes.length === 0, dupes.length ? `DUPES: ${[...new Set(dupes)].join(', ')}` : `${abilityNames.length} unique`);
const allHaveVerbs = UNITS.every(u => u.ability && Array.isArray(u.ability.verbs) && u.ability.verbs.length);
ok('Every champion ships verb-based ability data', allHaveVerbs);
const allHaveUlt = UNITS.every(u => u.ability && u.ability.ult && Array.isArray(u.ability.ult.verbs) && u.ability.ult.verbs.length);
ok('Every champion has a 3★ ult upgrade', allHaveUlt);

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ ' + fail + ' FAILED: ' + fails.join(', ')}  (${pass} passed, ${fail} failed)\n`);
process.exit(fail ? 1 : 0);
