// Augment balance harness. For each archetype comp, calibrate an enemy that gives a ~50%
// baseline (so there's headroom to measure up AND down), then measure each augment's
// win-rate DELTA (with augment minus baseline) on every comp.
//   - useless  : best delta across comps is tiny (doesn't even help its intended build)
//   - must-pick: mean delta across comps is large (helps ~everything a lot)
// Run: node test/augment-balance.js
import { simulate } from '../js/sim/combat.js';
import { getEnemyBoard } from '../js/data/enemies.js';
import { AUGMENTS, AUGMENT_IDS, augmentBundle } from '../js/data/augments.js';

const FRONT = new Set(['knight', 'assassin']);
function placeComp(defIds) {
  const out = []; let fc = 0, bc = 0;
  const klassOf = { knight_captain: 'knight', bone_guard: 'knight', hellguard: 'knight', bramble_brute: 'knight', dragon_knight: 'knight', mountain_king: 'knight', ironbeard: 'knight', imp_assassin: 'assassin', shadow_dancer: 'assassin', wraith: 'assassin', pack_stalker: 'assassin' };
  for (const id of defIds) {
    if (FRONT.has(klassOf[id])) { out.push({ defId: id, star: 2, col: 1 + (fc % 6), row: fc < 3 ? 6 : 5 }); fc++; }
    else { out.push({ defId: id, star: 2, col: 1 + (bc % 6), row: bc % 2 ? 7 : 6 }); bc++; }
  }
  return out;
}
const COMPS = {
  Mage: ['court_mage', 'lich', 'moon_priestess', 'warlock', 'knight_captain', 'field_medic'],
  Knight: ['knight_captain', 'bone_guard', 'hellguard', 'bramble_brute', 'court_mage', 'field_medic'],
  Assassin: ['imp_assassin', 'wraith', 'shadow_dancer', 'pack_stalker', 'bone_guard', 'druid_healer'],
  Undead: ['bone_guard', 'skeleton_archer', 'lich', 'wraith', 'necromancer', 'field_medic'],
  Ranger: ['skeleton_archer', 'crossbowman', 'wood_ranger', 'fel_archer', 'beast_hunter', 'knight_captain'],
  Mixed: ['knight_captain', 'court_mage', 'skeleton_archer', 'imp_assassin', 'field_medic', 'bone_guard'],
};

// Fixed mixed enemy board (rows 0-3); a per-comp handicap f scales enemy HP+AD ~50%.
const ENEMY = [
  { defId: 'bramble_brute', star: 2, col: 2, row: 3 }, { defId: 'hellguard', star: 2, col: 4, row: 3 },
  { defId: 'bone_guard', star: 2, col: 6, row: 3 }, { defId: 'shadow_dancer', star: 2, col: 5, row: 2 },
  { defId: 'warlock', star: 2, col: 3, row: 0 }, { defId: 'moon_priestess', star: 2, col: 4, row: 0 },
  { defId: 'fel_archer', star: 2, col: 1, row: 1 },
];

const N = 60;
function wr(P, bundle, f) {
  let w = 0;
  for (let s = 1; s <= N; s++) if (simulate(P, ENEMY, s * 17 + 3, { aug: { player: bundle, enemy: { hp: f, ad: f } } }).result.winner === 'player') w++;
  return w / N;
}
const EMPTY = augmentBundle([]);
// economy augments give run-long gold/xp/board, not single-combat power — the harness
// can't value those, so report them separately rather than flagging them "useless".
const isEcon = (id) => AUGMENTS[id].cat === 'econ' || (AUGMENTS[id].econ && !AUGMENTS[id].combat && !AUGMENTS[id].cond && !AUGMENTS[id].traitBonus);

const compData = {};
for (const [name, ids] of Object.entries(COMPS)) {
  const P = placeComp(ids);
  // sweep enemy handicap f; pick the one giving baseline nearest 50%
  let best = null;
  for (let f = -0.6; f <= 2.0; f += 0.1) { const b = wr(P, EMPTY, f); if (!best || Math.abs(b - 0.5) < Math.abs(best.b - 0.5)) best = { f, b }; }
  compData[name] = { P, f: best.f, base: best.b };
}
console.log('=== baselines (enemy HP/AD handicap calibrated toward 50%) ===');
for (const [n, d] of Object.entries(compData)) console.log(`  ${n.padEnd(9)} base ${(d.base * 100).toFixed(0)}%  (enemy ${d.f >= 0 ? '+' : ''}${(d.f * 100).toFixed(0)}%)`);

const rows = [];
for (const id of AUGMENT_IDS) {
  const bundle = augmentBundle([id]);
  const deltas = {};
  for (const [name, d] of Object.entries(compData)) deltas[name] = wr(d.P, bundle, d.f) - d.base;
  const vals = Object.values(deltas);
  const max = Math.max(...vals), mean = vals.reduce((s, x) => s + x, 0) / vals.length;
  const bestComp = Object.entries(deltas).sort((a, b) => b[1] - a[1])[0][0];
  rows.push({ id, tier: AUGMENTS[id].tier, econ: isEcon(id), max, mean, bestComp });
}

console.log('\n=== COMBAT AUGMENTS (win-rate delta; mean=across comps, best=its fit comp) ===');
rows.filter((r) => !r.econ).sort((a, b) => b.mean - a.mean).forEach((r) => {
  const flag = r.max < 0.07 ? '  ⚠ USELESS' : r.mean > 0.20 ? '  ⚠ MUST-PICK' : '';
  console.log(`  mean ${r.mean >= 0 ? '+' : ''}${(r.mean * 100).toFixed(0).padStart(3)}%  best +${(r.max * 100).toFixed(0).padStart(3)}% (${r.bestComp.padEnd(8)})  ${r.tier.padEnd(9)} ${r.id}${flag}`);
});
console.log('\n=== ECONOMY augments (not combat-measured — value is run-long gold/xp/slots) ===');
rows.filter((r) => r.econ).forEach((r) => console.log(`  ${r.tier.padEnd(9)} ${r.id}`));
