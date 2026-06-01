// Warpath meta-progression tests. Run: node test/meta.test.js
globalThis.localStorage = (() => { let s = {}; return { getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: (k) => { delete s[k]; }, clear: () => { s = {}; } }; })();
import * as Meta from '../js/state/meta.js';

let pass = 0, fail = 0; const fails = [];
function ok(name, cond) { cond ? pass++ : (fail++, fails.push(name)); process.stdout.write(cond ? '.' : 'F'); }
const rng = (seq) => { let i = 0; return () => seq[i++ % seq.length]; };

// ---- spoils: a loss still pays (bootstraps the hard climb) ----
{
  ok('spoils: a loss still earns something', Meta.spoilsForRun(0, 8, false) > 0);
  ok('spoils: a win pays much more than a loss', Meta.spoilsForRun(10, 14, true) > Meta.spoilsForRun(0, 8, false) + 30);
}

// ---- coherence: each slot's effect/icon/colour match its theme ----
{
  ok('slots: 5 themed slots', Meta.SLOTS.length === 5);
  const weapon = Meta.makeItem('weapon', 'epic', rng([0.5]));
  ok('weapon -> attack damage, ⚔ icon', weapon.eff.type === 'ad' && weapon.icon === 'sword');
  const tome = Meta.makeItem('tome', 'common', rng([0.5]));
  ok('tome -> XP, 📖 icon', tome.eff.type === 'xp' && tome.icon === 'book');
  const coffer = Meta.makeItem('coffer', 'epic', rng([0.5]));
  ok('coffer -> gold, 💰 icon, scales with rarity', coffer.eff.type === 'gold' && coffer.icon === 'coffer' && coffer.eff.value > Meta.makeItem('coffer', 'common', rng([0.5])).eff.value);
  const relic = Meta.makeItem('relic', 'common', rng([0.1]));
  ok('relic -> synergy crown, named & coloured for its trait', relic.eff.type === 'synergy' && Object.keys(relic.eff.traitBonus).length >= 1 && /Sigil$/.test(relic.name));
  const epicRelic = Meta.makeItem('relic', 'epic', rng([0.1, 0.9]));
  ok('epic relic boosts two synergies', Object.values(epicRelic.eff.traitBonus).reduce((a, b) => a + b, 0) >= 2);
  ok('effectText reads cleanly', /Attack Damage/.test(Meta.effectText(weapon)) && /gold/.test(Meta.effectText(coffer)));
}

// ---- chest: costs spoils, drops an item ----
{
  localStorage.clear(); Meta.addSpoils(40);
  const before = Meta.load().spoils;
  const r1 = Meta.openChest(rng([0.5, 0.5, 0.5]));
  ok('chest: opening costs spoils + drops an item', r1.ok && r1.item && r1.spoils === before - Meta.CHEST_COST);
  Meta.addSpoils(-1000);
  ok('chest: cannot open when broke', Meta.openChest(rng([0.5])).ok === false);
}

// ---- equip: one per slot; second of a slot REPLACES (no duplicate slots) ----
{
  localStorage.clear();
  const t1 = Meta.makeItem('tome', 'common', rng([0.5]));
  const t2 = Meta.makeItem('tome', 'epic', rng([0.5]));
  const m = Meta.load(); m.inventory.push(t1, t2); Meta.save(m);
  Meta.equip(t1.iid); ok('equip: first tome equipped', Meta.load().equipped.tome === t1.iid);
  Meta.equip(t2.iid); ok('equip: second tome REPLACES the first', Meta.load().equipped.tome === t2.iid);
}

// ---- gearBonuses: aggregates start-of-run boosts incl. the combat AD% and synergy crown ----
{
  localStorage.clear();
  const m = Meta.load();
  const w = Meta.makeItem('weapon', 'epic', rng([0.5]));    // +16% AD
  const a = Meta.makeItem('armor', 'rare', rng([0.5]));     // +2 lives
  const c = Meta.makeItem('coffer', 'epic', rng([0.5]));    // +14 gold
  const r = Meta.makeItem('relic', 'common', rng([0.0]));   // +1 synergy
  m.inventory.push(w, a, c, r); Meta.save(m);
  Meta.equip(w.iid); Meta.equip(a.iid); Meta.equip(c.iid); Meta.equip(r.iid);
  const b = Meta.gearBonuses(Meta.load());
  ok('gear: aggregates gold + lives', b.gold === 14 && b.lives === 2);
  ok('gear: weapon AD% goes to combat flat', b.flat.ad >= 0.16);
  ok('gear: relic synergy goes to traitBonus', Object.values(b.traitBonus).reduce((x, y) => x + y, 0) >= 1);
}

// ---- combine: fuse two of the SAME slot+rarity into ONE of the next rarity (consumes both) ----
{
  localStorage.clear();
  const m = Meta.load();
  const a = Meta.makeItem('weapon', 'common', rng([0.5]));
  const b = Meta.makeItem('weapon', 'common', rng([0.5]));
  const c = Meta.makeItem('armor', 'common', rng([0.5]));
  m.inventory.push(a, b, c); Meta.save(m);
  const groups = Meta.combinables(Meta.load());
  ok('combine: finds a 2x same-slot+rarity group', groups.length === 1 && groups[0].slot === 'weapon' && groups[0].items.length === 2);
  Meta.equip(a.iid);
  const r = Meta.combineItems('weapon', 'common');
  const after = Meta.load();
  ok('combine: fuses to the next rarity up', r.ok && r.item.rarity === 'rare' && r.item.slot === 'weapon');
  ok('combine: consumes two, nets one (one weapon left)', after.inventory.filter((x) => x.slot === 'weapon').length === 1);
  ok('combine: unequips a consumed equipped piece', after.equipped.weapon === undefined);
  ok('combine: leaves other slots alone', after.inventory.filter((x) => x.slot === 'armor').length === 1);
  ok('combine: full chain epic→…→godforged (godforged is the ceiling)', Meta.nextRarity('epic') === 'legendary' && Meta.nextRarity('mythic') === 'ascended' && Meta.nextRarity('ascended') === 'celestial' && Meta.nextRarity('celestial') === 'godforged' && Meta.nextRarity('godforged') === null);
  ok('combine: needs two of a kind', Meta.combineItems('weapon', 'rare').ok === false);
}

console.log(`\n\n${pass} passed, ${fail} failed`);
if (fail) { console.log('FAILURES:\n  ' + fails.join('\n  ')); process.exit(1); }
