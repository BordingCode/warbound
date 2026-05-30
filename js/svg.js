// Parametric champion art. One shared humanoid rig, reskinned per CLASS (silhouette:
// headgear + weapon + build) and tinted per ORIGIN (palette + accent). Silhouette-first
// so ~30 units read apart at small size on a busy board. viewBox 0 0 100 120, feet ~y114.
// Returns an SVG markup string; team tint + star glow are layered via CSS classes outside.

// ----- Origin palettes (skin, robe/primary, metal/secondary, accent glow) -----
export const PALETTES = {
  human:  { skin: '#e9b98c', primary: '#3b6ea5', secondary: '#b9c4d0', accent: '#6fb1ff' },
  undead: { skin: '#aeb9a6', primary: '#3a4d39', secondary: '#cfd8c5', accent: '#8cff9e' },
  elf:    { skin: '#d8c39c', primary: '#2f7d6b', secondary: '#cdeee0', accent: '#54e6c0' },
  demon:  { skin: '#8c3b3b', primary: '#5a1414', secondary: '#2a1414', accent: '#ff5a3c' },
  beast:  { skin: '#caa06a', primary: '#7a4a2a', secondary: '#caa06a', accent: '#ffb15a' },
  dragon: { skin: '#d9c27a', primary: '#6a3fa0', secondary: '#e6c04a', accent: '#ffd24a' },
};

export const ORIGINS = Object.keys(PALETTES);
export const CLASSES = ['knight', 'mage', 'ranger', 'assassin', 'healer', 'summoner'];

// ----- shared rig pieces -------------------------------------------------------
function shadow() {
  return `<ellipse cx="50" cy="115" rx="26" ry="6" fill="#000" opacity="0.28"/>`;
}
function legs(p, slim) {
  const w = slim ? 6 : 8;
  return `<rect x="${42 - w / 2 + 4}" y="86" width="${w}" height="26" rx="3" fill="${p.secondary}" opacity="0.9"/>
          <rect x="${58 - w / 2 - 4}" y="86" width="${w}" height="26" rx="3" fill="${p.secondary}" opacity="0.9"/>`;
}
// torso: cloak (mage/healer/summoner), plate (knight), leather (ranger/assassin)
function torso(p, kind) {
  if (kind === 'cloak') {
    return `<path d="M30 58 Q50 48 70 58 L78 108 Q50 100 22 108 Z" fill="${p.primary}"/>
            <path d="M30 58 Q50 48 70 58 L72 80 Q50 74 28 80 Z" fill="${p.accent}" opacity="0.35"/>`;
  }
  if (kind === 'plate') {
    return `<path d="M30 60 Q50 52 70 60 L72 96 Q50 102 28 96 Z" fill="${p.secondary}"/>
            <path d="M44 60 h12 l-2 40 h-8 Z" fill="${p.primary}"/>
            <rect x="34" y="62" width="32" height="8" rx="4" fill="${p.primary}" opacity="0.8"/>`;
  }
  // leather
  return `<path d="M34 58 Q50 50 66 58 L70 100 Q50 96 30 100 Z" fill="${p.primary}"/>
          <path d="M46 58 q4 22 0 42 M54 58 q-4 22 0 42" stroke="${p.secondary}" stroke-width="2" fill="none" opacity="0.7"/>`;
}
function arms(p, kind) {
  const c = kind === 'plate' ? p.secondary : p.primary;
  return `<rect x="22" y="60" width="9" height="30" rx="4.5" fill="${c}"/>
          <rect x="69" y="60" width="9" height="30" rx="4.5" fill="${c}"/>`;
}
function head(p) {
  return `<circle cx="50" cy="42" r="14" fill="${p.skin}"/>
          <circle cx="45" cy="43" r="2.1" fill="#14161e"/><circle cx="55" cy="43" r="2.1" fill="#14161e"/>`;
}
// origin-specific head features for instant silhouette identity
function originAccent(p, origin) {
  switch (origin) {
    case 'elf':    return `<path d="M37 40 L31 30 L41 41 Z" fill="${p.skin}"/><path d="M63 40 L69 30 L59 41 Z" fill="${p.skin}"/>`;
    case 'beast':  return `<path d="M39 33 q-5 -11 1 -13 q4 6 7 9 Z" fill="${p.skin}"/><path d="M61 33 q5 -11 -1 -13 q-4 6 -7 9 Z" fill="${p.skin}"/>`;
    case 'demon':  return `<path d="M41 31 q-6 -8 -2 -13 q5 5 7 10 Z" fill="#241010"/><path d="M59 31 q6 -8 2 -13 q-5 5 -7 10 Z" fill="#241010"/>`;
    case 'undead': return `<circle cx="45" cy="43" r="3.2" fill="#070707"/><circle cx="55" cy="43" r="3.2" fill="#070707"/><circle cx="45" cy="43" r="1.5" fill="${p.accent}"/><circle cx="55" cy="43" r="1.5" fill="${p.accent}"/>`;
    case 'dragon': return `<path d="M50 49 q-8 3 0 9 q8 -6 0 -9 Z" fill="${p.skin}"/><circle cx="46" cy="51" r="1" fill="#000"/>`;
    default:       return '';
  }
}

// ----- per-class headgear + weapon (the silhouette signal) ---------------------
function gear(p, klass) {
  switch (klass) {
    case 'knight': // full helm + tall shield
      return `<path d="M37 40 Q50 22 63 40 L62 52 Q50 56 38 52 Z" fill="${p.secondary}"/>
              <rect x="47" y="30" width="6" height="22" fill="${p.primary}"/>
              <rect x="44" y="40" width="12" height="5" rx="2" fill="#0d1320" opacity="0.7"/>
              <path d="M14 56 q10 -6 20 0 l-2 30 q-8 6 -16 0 Z" fill="${p.secondary}"/>
              <path d="M24 60 v22 M16 70 h16" stroke="${p.accent}" stroke-width="2" opacity="0.8"/>`;
    case 'mage': // tall pointed hat + staff with orb
      return `<path d="M34 38 L50 6 L66 38 Z" fill="${p.primary}"/>
              <ellipse cx="50" cy="38" rx="18" ry="5" fill="${p.primary}"/>
              <circle cx="50" cy="14" r="3" fill="${p.accent}"/>
              <rect x="74" y="36" width="4" height="58" rx="2" fill="#5a4632"/>
              <circle cx="76" cy="34" r="8" fill="${p.accent}"/>
              <circle cx="76" cy="34" r="8" fill="none" stroke="#fff" stroke-width="1" opacity="0.6"/>`;
    case 'ranger': // hood + longbow
      return `<path d="M35 44 Q50 24 65 44 Q58 40 50 40 Q42 40 35 44 Z" fill="${p.primary}"/>
              <path d="M22 30 Q12 60 22 90" stroke="${p.secondary}" stroke-width="3" fill="none"/>
              <line x1="22" y1="30" x2="22" y2="90" stroke="${p.accent}" stroke-width="1.2"/>
              <line x1="22" y1="60" x2="40" y2="60" stroke="#d8d0c0" stroke-width="1.5"/>`;
    case 'assassin': // low hood + twin daggers, slim
      return `<path d="M36 46 Q50 28 64 46 Q57 42 50 42 Q43 42 36 46 Z" fill="#1c1c24"/>
              <rect x="46" y="40" width="8" height="4" fill="#0d1320" opacity="0.8"/>
              <path d="M22 70 l6 -14 3 1 -5 15 Z" fill="${p.secondary}"/>
              <path d="M78 70 l-6 -14 -3 1 5 15 Z" fill="${p.secondary}"/>`;
    case 'healer': // circlet + staff topped with a leaf/cross
      return `<path d="M37 34 Q50 28 63 34" stroke="${p.accent}" stroke-width="3" fill="none"/>
              <circle cx="50" cy="31" r="2.5" fill="${p.accent}"/>
              <rect x="74" y="40" width="4" height="54" rx="2" fill="#cdbfa0"/>
              <path d="M76 30 q-9 4 0 14 q9 -10 0 -14 Z" fill="${p.accent}"/>`;
    case 'summoner': // horned/antlered head + orb in palm
      return `<path d="M38 36 Q30 22 36 18 Q40 26 46 32 Z" fill="${p.secondary}"/>
              <path d="M62 36 Q70 22 64 18 Q60 26 54 32 Z" fill="${p.secondary}"/>
              <circle cx="24" cy="74" r="9" fill="${p.accent}" opacity="0.85"/>
              <circle cx="24" cy="74" r="9" fill="none" stroke="#fff" stroke-width="1" opacity="0.5"/>`;
    default:
      return '';
  }
}

// Dragon origin gets wings behind the body.
function wings(p) {
  return `<path d="M30 58 Q6 50 4 78 Q22 70 34 82 Z" fill="${p.primary}" opacity="0.85"/>
          <path d="M70 58 Q94 50 96 78 Q78 70 66 82 Z" fill="${p.primary}" opacity="0.85"/>`;
}

const TORSO_KIND = {
  knight: 'plate', mage: 'cloak', ranger: 'leather',
  assassin: 'leather', healer: 'cloak', summoner: 'cloak',
};

// Build the inner SVG content (no <svg> wrapper) for a champion definition.
// `paletteOverride` lets callers recolor pieces (e.g. the Armory hero's armor = its gear).
export function championInner(def, paletteOverride) {
  const p = Object.assign({}, PALETTES[def.origin] || PALETTES.human, paletteOverride || {});
  const kind = TORSO_KIND[def.klass] || 'leather';
  const slim = def.klass === 'assassin' || def.klass === 'ranger';
  return [
    shadow(),
    def.origin === 'dragon' ? wings(p) : '',
    legs(p, slim),
    arms(p, kind),
    torso(p, kind),
    head(p),
    originAccent(p, def.origin),
    gear(p, def.klass),
  ].join('');
}

// Full standalone SVG string (used for previews / shop cards). `palette` recolors pieces.
export function championSVG(def, { size = 80, cls = '', palette = null } = {}) {
  return `<svg class="champ ${cls}" viewBox="0 0 100 120" width="${size}" height="${size * 1.2}"
            xmlns="http://www.w3.org/2000/svg" data-origin="${def.origin}" data-class="${def.klass}">
            <g class="champ-body">${championInner(def, palette)}</g>
          </svg>`;
}
