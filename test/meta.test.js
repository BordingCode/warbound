// Warpath meta-progression tests. Run: node test/meta.test.js
// Shim localStorage (node has none) so the persist round-trips work.
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

// ---- makeItem: rarity scales the effect; trinket grants a synergy crown ----
{
  const c = Meta.makeItem('weapon', 'common', rng([0.5]));
  const e = Meta.makeItem('weapon', 'epic', rng([0.5]));
  ok('item: epic weapon gives more gold than common', e.eff.value > c.eff.value && c.eff.type === 'gold');
  const tr = Meta.makeItem('trinket', 'common', rng([0.1]));
  ok('item: trinket grants a synergy crown (traitBonus)', tr.eff.type === 'synergy' && tr.eff.traitBonus && Object.keys(tr.eff.traitBonus).length >= 1);
  const epicTr = Meta.makeItem('trinket', 'epic', rng([0.1, 0.9]));
  ok('item: epic trinket can boost two synergies', Object.values(epicTr.eff.traitBonus).reduce((a, b) => a + b, 0) >= 2);
}

// ---- chest: costs spoils, drops an item; equip is one-per-slot (no duplicate slots) ----
{
  localStorage.clear();
  Meta.addSpoils(40);
  const before = Meta.load().spoils;
  const r1 = Meta.openChest(rng([0.5, 0.5, 0.5]));
  ok('chest: opening costs spoils + drops an item', r1.ok && r1.item && r1.spoils === before - Meta.CHEST_COST);
  // can't open when broke
  Meta.addSpoils(-1000);
  ok('chest: cannot open with too few spoils', Meta.openChest(rng([0.5])).ok === false);
}

// ---- equip: one item per slot; equipping a second of the same slot replaces it ----
{
  localStorage.clear();
  const h1 = Meta.makeItem('helm', 'common', rng([0.5]));
  const h2 = Meta.makeItem('helm', 'epic', rng([0.5]));
  const m = Meta.load(); m.inventory.push(h1, h2); Meta.save(m);
  Meta.equip(h1.iid);
  ok('equip: first helm equipped', Meta.load().equipped.helm === h1.iid);
  Meta.equip(h2.iid);
  ok('equip: second helm REPLACES the first (no two helmets)', Meta.load().equipped.helm === h2.iid && Object.values(Meta.load().equipped).filter((x) => x === h1.iid).length === 0);
}

// ---- gearBonuses: aggregates equipped start-of-run boosts ----
{
  localStorage.clear();
  const m = Meta.load();
  const w = Meta.makeItem('weapon', 'epic', rng([0.5]));     // +10 gold
  const a = Meta.makeItem('armor', 'rare', rng([0.5]));      // +2 lives
  const t = Meta.makeItem('trinket', 'common', rng([0.0]));  // +1 synergy
  m.inventory.push(w, a, t); Meta.save(m);
  Meta.equip(w.iid); Meta.equip(a.iid); Meta.equip(t.iid);
  const b = Meta.gearBonuses(Meta.load());
  ok('gear: aggregates gold + lives from equipped pieces', b.gold === 10 && b.lives === 2);
  ok('gear: aggregates the synergy crown into traitBonus', Object.values(b.traitBonus).reduce((x, y) => x + y, 0) >= 1);
}

console.log(`\n\n${pass} passed, ${fail} failed`);
if (fail) { console.log('FAILURES:\n  ' + fails.join('\n  ')); process.exit(1); }
