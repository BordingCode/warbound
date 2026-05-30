// Persistent ranked progression for the ladder. A full ladder (you can climb AND drop tiers),
// stored in localStorage. Placement in an 8-warband lobby earns/loses Rank Points (RP):
// top-4 gains, bottom-4 loses (TFT model). Your tier sets the AI DIFFICULTY (0..5) — higher
// tiers make the warlords make SMARTER DECISIONS (never better stats).
// no emoji — the UI renders a tinted SVG medallion (icons.rankMedal) in each tier's colour.
export const TIERS = [
  { name: 'Bronze',   color: '#cd7f32' },
  { name: 'Silver',   color: '#cdd3da' },
  { name: 'Gold',     color: '#ffce5c' },
  { name: 'Platinum', color: '#5fd0c8' },
  { name: 'Diamond',  color: '#6fb1ff' },
  { name: 'Master',   color: '#c79bff' },
];
export const RP_PER_TIER = 100;
const MAX_TIER = TIERS.length - 1;          // Master = 5
const SAVE_KEY = 'warbound_rank_v1';

// RP change by finishing place (1st..8th): top-4 gain, bottom-4 lose.
const RP_BY_PLACE = { 1: 50, 2: 35, 3: 25, 4: 12, 5: -10, 6: -20, 7: -30, 8: -40 };
export function placementRP(place) { return RP_BY_PLACE[place] != null ? RP_BY_PLACE[place] : -40; }

export function loadRP() { try { return Math.max(0, parseInt(localStorage.getItem(SAVE_KEY) || '0', 10) || 0); } catch { return 0; } }
function saveRP(rp) { try { localStorage.setItem(SAVE_KEY, String(Math.max(0, Math.round(rp)))); } catch {} }
export function resetRank() { try { localStorage.removeItem(SAVE_KEY); } catch {} }

// Resolve an RP total into a rank object.
export function rankFromRP(rp) {
  rp = Math.max(0, Math.round(rp));
  const tier = Math.min(MAX_TIER, Math.floor(rp / RP_PER_TIER));
  const t = TIERS[tier];
  const inTier = tier >= MAX_TIER ? rp - MAX_TIER * RP_PER_TIER : rp - tier * RP_PER_TIER;
  const nextAt = tier < MAX_TIER ? RP_PER_TIER : null;   // RP within tier needed to promote
  return { rp, tier, difficulty: tier, name: t.name, color: t.color, inTier, nextAt };
}
export function currentRank() { return rankFromRP(loadRP()); }

// Apply a finished ladder run's placement to the saved RP. Returns a summary for the UI.
export function applyPlacement(place) {
  const before = loadRP();
  const delta = placementRP(place);
  const after = Math.max(0, before + delta);
  saveRP(after);
  const r0 = rankFromRP(before), r1 = rankFromRP(after);
  return { before, after, delta, rankBefore: r0, rank: r1, promoted: r1.tier > r0.tier, demoted: r1.tier < r0.tier };
}
