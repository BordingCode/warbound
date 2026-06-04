// Must-pick augment detector (Phase D). Measures each augment's MARGINAL win-rate: re-runs the
// comp-balance round-robin (10 archetype comps × random legal boards) with the player comp HOLDING
// the augment, vs the no-augment baseline. Reports avg Δ (general power) + best per-comp Δ
// (comp-defining power), flags must-picks (avg Δ ≥ +6 pts) and dead combat augments (avg Δ < +1 pt).
// Econ augments have ~0 combat Δ by design (their value is economic) and are listed separately.
// Prints a report; edits NOTHING. Run: node js/sim/augment-balance.mjs   [SEEDS=16]
import { simulate } from './combat.js';
import { UNITS_BY_ID, STAR_MULT } from '../data/units.js';
import { RNG } from '../rng.js';
import { AUGMENTS, AUGMENT_IDS, augmentBundle } from '../data/augments.js';

const STAR_BY_COST = { 1: 3, 2: 3, 3: 2, 4: 1, 5: 1 };
const FRONT = new Set(['knight', 'assassin']);
const COMPS = {
  Knight:   ['knight_captain', 'bone_guard', 'hellguard', 'crossbowman', 'court_mage', 'field_medic'],
  Mage:     ['court_mage', 'lich', 'warlock', 'orc_shaman', 'bone_guard', 'field_medic'],
  Assassin: ['wraith', 'shadow_dancer', 'pack_stalker', 'imp_assassin', 'bone_guard', 'field_medic'],
  Undead:   ['bone_guard', 'lich', 'skeleton_archer', 'wraith', 'necromancer', 'death_knight'],
  Demon:    ['hellguard', 'warlock', 'fel_archer', 'imp_assassin', 'bone_guard', 'field_medic'],
  Beast:    ['bramble_brute', 'beast_hunter', 'pack_stalker', 'knight_captain', 'druid_healer', 'beastmaster'],
  Elf:      ['knight_captain', 'moon_priestess', 'wood_ranger', 'shadow_dancer', 'grove_healer', 'bone_guard'],
  Ranger:   ['crossbowman', 'wood_ranger', 'fel_archer', 'knight_captain', 'axethrower', 'field_medic'],
  Summoner: ['necromancer', 'pit_summoner', 'beastmaster', 'banner_sergeant', 'bone_guard', 'field_medic'],
  Dragon:   ['dragon_knight', 'dragon_sage', 'wyrm_archer', 'knight_captain', 'bone_guard', 'grove_healer'],
};
const names = Object.keys(COMPS);
const SEEDS = parseInt(process.env.SEEDS || '16', 10);

function placeComp(ids, enemy, rng) {
  const out = []; const cols = [1, 2, 3, 4, 5, 6];
  for (let i = cols.length - 1; i > 0; i--) { const j = rng.int(0, i); [cols[i], cols[j]] = [cols[j], cols[i]]; }
  let fc = 0, bc = 0;
  for (const id of ids) {
    const u = UNITS_BY_ID[id]; const star = STAR_BY_COST[u.cost] || 1; const front = FRONT.has(u.klass);
    const row = enemy ? (front ? (rng.int(0, 1) ? 1 : 2) : (rng.int(0, 1) ? 0 : 1))
                      : (front ? (rng.int(0, 1) ? 6 : 5) : (rng.int(0, 1) ? 7 : 6));
    out.push({ defId: id, star, col: cols[(front ? fc++ : bc++) % 6], row });
  }
  return out;
}

// win-rate of comp A vs all other comps, A optionally holding an augment bundle
function compWR(A, augBundle) {
  let w = 0, g = 0;
  for (const B of names) {
    if (A === B) continue;
    const rng = new RNG(99);
    for (let s = 0; s < SEEDS; s++) {
      const opt = augBundle ? { aug: { player: augBundle } } : {};
      if (simulate(placeComp(COMPS[A], false, rng), placeComp(COMPS[B], true, rng), s * 37 + 11, opt).result.winner === 'player') w++;
      g++;
    }
  }
  return w / g;
}

// baseline per-comp winrate (no augment)
const baseWR = {}; for (const A of names) baseWR[A] = compWR(A, null);
const baseAvg = names.reduce((s, A) => s + baseWR[A], 0) / names.length;

const rows = [];
for (const id of AUGMENT_IDS) {
  const a = AUGMENTS[id];
  // Any econ effect (gold/xp/boardPlus/…) makes the fixed-comp COMBAT test an incomplete measure
  // of the augment's value (e.g. Warlord's Gambit's +1 board slot can't show here) → exclude it
  // from combat flags rather than mislabel it a trap.
  const econInfluenced = a.cat === 'econ' || !!a.econ || !!a.once;
  const bundle = augmentBundle([id]);
  let sum = 0, best = -Infinity, bestComp = '';
  for (const A of names) { const d = compWR(A, bundle) - baseWR[A]; sum += d; if (d > best) { best = d; bestComp = A; } }
  rows.push({ id, name: a.name, tier: a.tier, cat: a.cat, econInfluenced, avg: sum / names.length, best, bestComp });
}

// meaningful flag = WITHIN-TIER outlier: the marginal Δ vs no-augment is inflated (real games all
// have augments), so compare each augment to the MEDIAN of its tier's pure-combat augments.
const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const tierMed = {};
for (const t of ['common', 'rare', 'prismatic']) tierMed[t] = median(rows.filter((r) => !r.econInfluenced && r.tier === t).map((r) => r.avg));

const pct = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1);
rows.sort((x, y) => y.avg - x.avg);
console.log(`\n=== AUGMENT MARGINAL WIN-RATE (baseline comp avg ${(baseAvg * 100).toFixed(1)}%, SEEDS=${SEEDS}) ===`);
console.log('Δ is vs a NO-augment comp (inflated — flags compare WITHIN-tier instead).');
console.log('  avgΔ   bestΔ (comp)        tier      cat       augment');
const OUT = 0.08;   // ≥ this far above/below the tier median = a real outlier
for (const r of rows) {
  const med = tierMed[r.tier] || 0;
  const flag = r.econInfluenced ? '  · econ/board (combat test can’t value it)'
    : r.avg - med >= OUT ? `  ⚠ over-tuned (+${((r.avg - med) * 100).toFixed(0)} vs ${r.tier} median)`
      : r.cat === 'synergy' || r.best >= 0.12 ? `  ◆ comp-defining (${r.bestComp})`   // conditional: judge by best, not avg
        : med - r.avg >= OUT ? `  ✗ weak (${((r.avg - med) * 100).toFixed(0)} vs ${r.tier} median)` : '';
  console.log(`  ${pct(r.avg).padStart(5)}  ${pct(r.best).padStart(5)} ${('(' + r.bestComp + ')').padEnd(11)} ${r.tier.padEnd(9)} ${r.cat.padEnd(8)} ${r.name}${flag}`);
}
const over = rows.filter((r) => !r.econInfluenced && r.avg - (tierMed[r.tier] || 0) >= OUT);
const weak = rows.filter((r) => !r.econInfluenced && r.cat !== 'synergy' && (tierMed[r.tier] || 0) - r.avg >= OUT);
console.log(`\n  ${over.length} over-tuned vs tier: ${over.map((r) => r.name).join(', ') || '—'}`);
console.log(`  ${weak.length} weak vs tier: ${weak.map((r) => r.name).join(', ') || '—'}`);
console.log(`  tier medians: common ${pct(tierMed.common)}, rare ${pct(tierMed.rare)}, prismatic ${pct(tierMed.prismatic)}\n`);
