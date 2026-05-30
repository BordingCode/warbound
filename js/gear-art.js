// Rich, illustrated gear art for the Armory — one detailed SVG per slot, accented by the item's
// rarity (trim colour, gem, and a glow/ornament that grows with tier). Replaces the flat
// monochrome icons for equipped/inventory pieces. viewBox 0 0 64 64; returns an <svg> string.

const TIER = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };

// metallic vertical gradient + a rarity glow, shared defs per render (unique ids via `uid`)
function defs(uid, rc, tier) {
  const glow = [0, 0.12, 0.2, 0.32, 0.45][tier];
  return `<defs>
    <linearGradient id="steel${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e8eef6"/><stop offset=".45" stop-color="#aab6c6"/><stop offset="1" stop-color="#5c6677"/>
    </linearGradient>
    <linearGradient id="rim${uid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".5" stop-color="${rc}"/><stop offset="1" stop-color="#0008"/>
    </linearGradient>
    <radialGradient id="gem${uid}" cx=".35" cy=".3" r=".8">
      <stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="${rc}"/><stop offset="1" stop-color="#0009"/>
    </radialGradient>
    <radialGradient id="aura${uid}" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="${rc}" stop-opacity="${glow}"/><stop offset="1" stop-color="${rc}" stop-opacity="0"/>
    </radialGradient>
  </defs>`;
}
// a small faceted gem
const gem = (uid, x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#gem${uid})" stroke="#0007" stroke-width=".6"/><circle cx="${x - r * .3}" cy="${y - r * .3}" r="${r * .28}" fill="#fff" opacity=".75"/>`;
// tier "rank pips" along the bottom (1..tier+1 little studs in the rarity colour)
function pips(rc, tier) {
  const n = tier + 1; if (n <= 0) return '';
  let s = ''; const w = 4.4, gap = 2, total = n * w + (n - 1) * gap, x0 = 32 - total / 2;
  for (let i = 0; i < n; i++) s += `<rect x="${x0 + i * (w + gap)}" y="58" width="${w}" height="3" rx="1.5" fill="${rc}"/>`;
  return s;
}

const ART = {
  // ---- ARMOR: a layered breastplate with pauldrons, collar, central gem ----
  armor(uid, rc, tier) {
    return `${tier >= 3 ? `<circle cx="32" cy="32" r="30" fill="url(#aura${uid})"/>` : ''}
      <path d="M16 16 L32 12 L48 16 L46 22 L40 20 L40 30 Q32 28 24 30 L24 20 L18 22 Z" fill="url(#steel${uid})" stroke="#2a3140" stroke-width="1"/>
      <path d="M22 26 Q32 23 42 26 L46 46 Q32 56 18 46 Z" fill="url(#steel${uid})" stroke="#2a3140" stroke-width="1.2"/>
      <path d="M22 26 Q32 23 42 26 L44 33 Q32 30 20 33 Z" fill="${rc}" opacity=".5"/>
      <path d="M32 26 L33 50 L31 50 Z" fill="#2a3140" opacity=".6"/>
      <ellipse cx="16" cy="24" rx="6" ry="5" fill="url(#steel${uid})" stroke="#2a3140" stroke-width="1"/>
      <ellipse cx="48" cy="24" rx="6" ry="5" fill="url(#steel${uid})" stroke="#2a3140" stroke-width="1"/>
      <path d="M22 26 Q32 23 42 26" fill="none" stroke="${rc}" stroke-width="1.4"/>
      <path d="M18 46 Q32 56 46 46" fill="none" stroke="${rc}" stroke-width="1.6" opacity=".85"/>
      ${gem(uid, 32, 36, tier >= 2 ? 4.6 : 3.6)}
      ${tier >= 4 ? `<path d="M10 20 L6 14 M54 20 L58 14" stroke="${rc}" stroke-width="1.6" stroke-linecap="round"/>` : ''}
      ${pips(rc, tier)}`;
  },
  // ---- WEAPON: a sword — blade, fullered ridge, rarity crossguard + pommel gem ----
  weapon(uid, rc, tier) {
    return `${tier >= 3 ? `<circle cx="32" cy="32" r="30" fill="url(#aura${uid})"/>` : ''}
      <path d="M32 6 L37 14 L36 40 L32 46 L28 40 L27 14 Z" fill="url(#steel${uid})" stroke="#2a3140" stroke-width="1"/>
      <path d="M32 7 L32 45" stroke="#fff" stroke-width="1" opacity=".5"/>
      <path d="M20 44 Q32 40 44 44 L42 49 Q32 46 22 49 Z" fill="${rc}" stroke="#2a3140" stroke-width="1"/>
      <rect x="30" y="48" width="4" height="11" rx="1.5" fill="#6b4a2a" stroke="#2a3140" stroke-width=".8"/>
      <path d="M30 50 h4 M30 53 h4 M30 56 h4" stroke="#3a2a18" stroke-width=".7"/>
      ${gem(uid, 32, 61, tier >= 2 ? 3.6 : 2.8)}
      ${tier >= 4 ? `<path d="M37 14 q6 6 3 14 M27 14 q-6 6 -3 14" fill="none" stroke="${rc}" stroke-width="1.3" opacity=".8"/>` : ''}
      ${pips(rc, tier)}`;
  },
  // ---- TOME: an ornate spellbook — cover, pages, clasp, cover emblem ----
  tome(uid, rc, tier) {
    return `${tier >= 3 ? `<circle cx="32" cy="32" r="30" fill="url(#aura${uid})"/>` : ''}
      <path d="M14 14 h30 a5 5 0 0 1 5 5 v28 a5 5 0 0 1 -5 5 h-30 Z" fill="${rc}" stroke="#2a3140" stroke-width="1.2"/>
      <path d="M16 16 h28 v32 h-28 Z" fill="#2a3140" opacity=".25"/>
      <rect x="46" y="16" width="4" height="34" rx="1.5" fill="#cdb88a"/>
      <path d="M47 18 v30 M48.5 18 v30" stroke="#9c8456" stroke-width=".5"/>
      <path d="M24 22 h16 M24 26 h12" stroke="#fff" stroke-width="1" opacity=".5"/>
      ${gem(uid, 30, 36, tier >= 2 ? 5 : 4)}
      <path d="M19 49 q-3 2 0 4 h6 q-3 -2 0 -4 Z" fill="#cdb88a" stroke="#2a3140" stroke-width=".7"/>
      ${pips(rc, tier)}`;
  },
  // ---- COFFER: a treasure chest brimming with gold, rarity lock-gem ----
  coffer(uid, rc, tier) {
    return `${tier >= 3 ? `<circle cx="32" cy="32" r="30" fill="url(#aura${uid})"/>` : ''}
      <path d="M14 26 q18 -10 36 0 v6 h-36 Z" fill="#7a5230" stroke="#2a3140" stroke-width="1.2"/>
      <circle cx="24" cy="22" r="3" fill="#ffd86a"/><circle cx="33" cy="20" r="3" fill="#ffce5c"/><circle cx="41" cy="22" r="3" fill="#ffd86a"/>
      <rect x="14" y="32" width="36" height="20" rx="2" fill="#8a5e36" stroke="#2a3140" stroke-width="1.2"/>
      <rect x="14" y="32" width="36" height="6" fill="#000" opacity=".18"/>
      <rect x="16" y="40" width="32" height="3" fill="#ffce5c" opacity=".85"/>
      <rect x="20" y="34" width="3" height="18" fill="#caa24a"/><rect x="41" y="34" width="3" height="18" fill="#caa24a"/>
      <rect x="29" y="36" width="6" height="9" rx="1" fill="#caa24a" stroke="#2a3140" stroke-width=".8"/>
      ${gem(uid, 32, 40, tier >= 2 ? 2.6 : 2)}
      ${pips(rc, tier)}`;
  },
  // ---- RELIC: a glowing orb cradled in metal claws ----
  relic(uid, rc, tier) {
    return `<circle cx="32" cy="30" r="${tier >= 3 ? 26 : 20}" fill="url(#aura${uid})"/>
      <circle cx="32" cy="30" r="13" fill="url(#gem${uid})" stroke="#2a3140" stroke-width="1.2"/>
      <circle cx="27" cy="25" r="3.4" fill="#fff" opacity=".7"/>
      <path d="M20 30 q-4 8 4 14 M44 30 q4 8 -4 14 M32 43 v9" fill="none" stroke="url(#steel${uid})" stroke-width="3" stroke-linecap="round"/>
      <path d="M22 18 q10 -6 20 0" fill="none" stroke="${rc}" stroke-width="1.4" opacity=".7"/>
      <rect x="26" y="50" width="12" height="4" rx="1.5" fill="url(#steel${uid})" stroke="#2a3140" stroke-width=".8"/>
      ${tier >= 2 ? `<path d="M32 12 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5 Z" fill="${rc}"/>` : ''}
      ${tier >= 4 ? `<circle cx="14" cy="20" r="1.6" fill="${rc}"/><circle cx="50" cy="20" r="1.6" fill="${rc}"/><circle cx="46" cy="46" r="1.4" fill="${rc}"/>` : ''}
      ${pips(rc, tier)}`;
  },
};

let _gid = 0;
export function gearArt(slotId, rarityId, size = 48) {
  const rc = ({ common: '#9aa6b8', rare: '#6fb1ff', epic: '#c79bff', legendary: '#ffb031', mythic: '#ff5e8a' })[rarityId] || '#9aa6b8';
  const tier = TIER[rarityId] || 0;
  const fn = ART[slotId] || ART.armor;
  const uid = 'g' + (_gid++);
  return `<svg class="gear-art" viewBox="0 0 64 64" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">${defs(uid, rc, tier)}${fn(uid, rc, tier)}</svg>`;
}
