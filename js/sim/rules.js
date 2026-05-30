// Pure combat math + selection helpers. No DOM, no Math.random (RNG injected).
// These encode the real TFT-style formulas from the research.
import { dist } from '../grid.js';

// Damage reduction: taken = raw * 100/(100+R). Negative resist clamped to 0.
export function mitigate(raw, type, target) {
  if (type === 'true' || type === 'heal') return raw;
  const r = Math.max(0, type === 'magic' ? target.mr : target.armor);
  return raw * (100 / (100 + r));
}

// Mana gained when taking a hit: 1% pre-mitigation + 3% post-mitigation, capped.
export function manaFromDamage(pre, post) {
  return Math.min(42.5, pre * 0.01 + post * 0.03);
}

// Nearest living enemy to `u`. Deterministic tie-break: closest, then lowest id, then cell.
export function nearestEnemy(u, units) {
  let best = null, bd = Infinity, bid = Infinity;
  for (const t of units) {
    if (!t.alive || t.team === u.team) continue;
    const d = dist(u, t);
    const id = t.id;
    if (d < bd || (d === bd && id < bid)) { best = t; bd = d; bid = id; }
  }
  return best;
}

// Living enemies of `u`, optionally within radius of a center cell.
export function enemiesNear(center, team, units, radius) {
  return units.filter((t) => t.alive && t.team !== team && dist(center, t) <= radius);
}

export function lowestHP(units, team, enemy) {
  let best = null, bv = Infinity, bid = Infinity;
  for (const t of units) {
    if (!t.alive) continue;
    const ofEnemy = t.team !== team;
    if (enemy ? !ofEnemy : ofEnemy) continue;
    if (t.hp < bv || (t.hp === bv && t.id < bid)) { best = t; bv = t.hp; bid = t.id; }
  }
  return best;
}

export function inRange(a, b) { return dist(a, b) <= a.range; }
