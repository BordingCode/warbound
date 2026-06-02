// Parametric champion art. One shared humanoid rig, reskinned per CLASS (silhouette:
// headgear + weapon + build) and tinted per ORIGIN (palette + accent). Silhouette-first
// so ~30 units read apart at small size on a busy board. viewBox 0 0 100 120, feet ~y114.
// Returns an SVG markup string; team tint + star glow are layered via CSS classes outside.

// ----- Origin palettes (skin, robe/primary, metal/secondary, accent glow) -----
export const PALETTES = {
  human:  { skin: '#e9b98c', primary: '#3b6ea5', secondary: '#b9c4d0', accent: '#6fb1ff' },
  // undead = ASHEN bone-grey (no green body) so it never reads like an elf; the spectral
  // green survives only as the eye/trim accent — the iconic "undead glow".
  undead: { skin: '#b4b7ab', primary: '#4f5a68', secondary: '#d9dace', accent: '#8cff9e' },
  // elf = living LEAF-green (pulled off teal/blue) so it stays clear of human's blue casters.
  elf:    { skin: '#d8c39c', primary: '#2f8a52', secondary: '#d6f2dc', accent: '#5fe39a' },
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

// ----- Phase-1 per-hero identity: a chest sigil (shape signal) + a colour key (accent) so
// units that share a class+origin still read apart at a glance. Sigils live in a 0..16 box,
// drawn over the chest. Shape carries identity; the colour key recolours accent details. -----
const SIGILS = {
  shield:   '<path d="M8 0l7 2.4v4.8c0 4.6-3 8-7 9.8-4-1.8-7-5.2-7-9.8V2.4z"/>',
  orb:      '<circle cx="8" cy="8" r="6"/>',
  arrow:    '<path d="M8 0l3.2 5H9.4l.7 11H5.9l.7-11H4.8z"/>',
  diamond:  '<path d="M8 0l5.2 8L8 16 2.8 8z"/>',
  cross:    '<path d="M6 0h4v6h6v4h-6v6H6v-6H0V6h6z"/>',
  skull:    '<path d="M8 0C4.7 0 2 2.5 2 5.8c0 1.8.9 3 2.1 3.8V13H6v-1.6h.9V13h2.2v-1.6h.9V13H12V9.6c1.2-.8 2.1-2 2.1-3.8C14.1 2.5 11.4 0 8 0z"/><circle cx="5.6" cy="6.4" r="1.3" fill="#0b0f17"/><circle cx="10.4" cy="6.4" r="1.3" fill="#0b0f17"/>',
  crescent: '<path d="M10.5 0a8 8 0 100 16A6.2 6.2 0 1110.5 0z"/>',
  leaf:     '<path d="M8 0C3.2 4 1.2 9 4 15c5.8-1 8.8-6 8.8-13-2 .8-3.2 2-4.2 3.8C7.6 4 8 2 8 0z"/>',
  flame:    '<path d="M9 0c.4 3-1.6 4-1.6 6 0 1 .8 1.5 1.6.9C10.2 6 9.8 4.4 11 3c1.3 2 1.9 3.6 1.9 5.8a4.9 4.9 0 11-9.8 0C3.1 6.6 4.2 5 5.4 3.6 7 5.4 8 6.2 8.4 7.2 9 5.4 8 2.8 9 0z"/>',
  fang:     '<path d="M3 0h10l-1.8 5.5L8 14 4.8 5.5z"/>',
  horns:    '<path d="M2 14C1.2 8.4 2.2 3.4 5 .6c.2 3.8 1.2 6.6 3 8.4 1.8-1.8 2.8-4.6 3-8.4 2.8 2.8 3.8 7.8 3 13.4-1.8-2.6-3.8-3.8-6-3.8s-4.2 1.2-6 3.8z"/>',
  star:     '<path d="M8 1l1.9 4.6 5 .4-3.8 3.3 1.2 4.9L8 15.6 3.7 14.2l1.2-4.9L1.1 6l5-.4z"/>',
};
// Per-hero art: a signature accent (colour key) + chest sigil (+ optional build). Most heroes
// share a class silhouette; these two cheap signals make same-class/same-origin units distinct.
const HERO_ART = {
  // Human
  knight_captain:  { palette: { accent: '#ffd95c' }, emblem: 'shield',   build: 'broad' },
  court_mage:      { palette: { accent: '#6fb1ff' }, emblem: 'orb' },
  crossbowman:     { palette: { accent: '#cfd8e6' }, emblem: 'arrow' },
  royal_blade:     { palette: { accent: '#eae2ff' }, emblem: 'diamond' },
  field_medic:     { palette: { accent: '#7affc0' }, emblem: 'cross' },
  // Undead
  bone_guard:      { palette: { accent: '#d8e6cc' }, emblem: 'shield',   build: 'broad' },
  lich:            { palette: { accent: '#8cff9e' }, emblem: 'skull' },
  skeleton_archer: { palette: { accent: '#b6e0a0' }, emblem: 'arrow' },
  wraith:          { palette: { accent: '#b0ffd8' }, emblem: 'crescent' },
  necromancer:     { palette: { accent: '#6effa0' }, emblem: 'orb' },
  // Elf
  thornguard:      { palette: { accent: '#7fe6b0' }, emblem: 'shield',   build: 'broad' },
  moon_priestess:  { palette: { accent: '#aef0ff' }, emblem: 'crescent' },
  wood_ranger:     { palette: { accent: '#8fe07a' }, emblem: 'leaf' },
  shadow_dancer:   { palette: { accent: '#9fb0ff' }, emblem: 'diamond' },
  grove_healer:    { palette: { accent: '#7affc0' }, emblem: 'cross' },
  spirit_caller:   { palette: { accent: '#b0ffe0' }, emblem: 'orb' },
  // Demon
  hellguard:       { palette: { accent: '#ff8a4c' }, emblem: 'shield',   build: 'broad' },
  warlock:         { palette: { accent: '#ff5a3c' }, emblem: 'flame' },
  fel_archer:      { palette: { accent: '#ff7a5c' }, emblem: 'arrow' },
  imp_assassin:    { palette: { accent: '#ff9a6c' }, emblem: 'fang' },
  pit_summoner:    { palette: { accent: '#ff5e8a' }, emblem: 'horns' },
  // Beast
  beast_hunter:    { palette: { accent: '#ffc46a' }, emblem: 'arrow' },
  bramble_brute:   { palette: { accent: '#c8e06a' }, emblem: 'leaf',     build: 'broad' },
  pack_stalker:    { palette: { accent: '#ffb15a' }, emblem: 'fang' },
  druid_healer:    { palette: { accent: '#9be86a' }, emblem: 'cross' },
  beastmaster:     { palette: { accent: '#ffd24a' }, emblem: 'horns' },
  // Dragon
  dragon_knight:   { palette: { accent: '#ffd24a' }, emblem: 'shield',   build: 'broad' },
  dragon_sage:     { palette: { accent: '#c79bff' }, emblem: 'flame' },
  wyrm_archer:     { palette: { accent: '#ffce5c' }, emblem: 'arrow' },
};
function emblem(art) {
  if (!art || !art.emblem || !SIGILS[art.emblem]) return '';
  // off-white crest reads on any torso; the colour key (accent) lives in the gear/glow details.
  return `<g transform="translate(42,68)" fill="#eef3ff" opacity="0.9" stroke="#0b0f17" stroke-width="0.6" stroke-opacity="0.35">${SIGILS[art.emblem]}</g>`;
}

// Build the inner SVG content (no <svg> wrapper) for a champion definition.
// `paletteOverride` lets callers recolor pieces (e.g. the Armory hero's armor = its gear).
export function championInner(def, paletteOverride) {
  if (def.creature) return creatureInner(def);
  const art = HERO_ART[def.defId] || null;
  const p = Object.assign({}, PALETTES[def.origin] || PALETTES.human, (art && art.palette) || {}, paletteOverride || {});
  const kind = TORSO_KIND[def.klass] || 'leather';
  const slim = art && art.build ? art.build === 'slim' : (def.klass === 'assassin' || def.klass === 'ranger');
  return [
    shadow(),
    def.origin === 'dragon' ? wings(p) : '',
    legs(p, slim),
    arms(p, kind),
    torso(p, kind),
    head(p),
    originAccent(p, def.origin),
    gear(p, def.klass),
    emblem(art),
  ].join('');
}

// ── Boss CREATURE art (viewBox 0 0 100 120, ground ~y110). Distinct monster silhouettes,
// keyed by def.shape, tinted by def.accent. NOT the humanoid champion rig. ──
// Local colour shade: positive pct lightens, negative darkens (clamped 0..255).
function shade(c, pct) {
  const n = parseInt((c || '#888888').slice(1, 7), 16);
  const f = 1 + pct / 100;
  const ch = [n >> 16 & 255, n >> 8 & 255, n & 255].map((x) => Math.max(0, Math.min(255, Math.round(x * f))));
  return '#' + ch.map((x) => x.toString(16).padStart(2, '0')).join('');
}
function creatureInner(def) {
  const c = def.accent || '#9aa6b8';
  const shadow = '<ellipse cx="50" cy="111" rx="34" ry="6.5" fill="#00000055"/>';
  const eye = (x, y, col) => `<circle cx="${x}" cy="${y}" r="3" fill="${col || '#16201a'}"/>`;
  const S = {
    slime: () => shadow +
      `<path d="M19 109 Q12 72 23 56 Q33 40 50 42 Q67 40 77 56 Q88 72 81 109 Z" fill="${c}" opacity="0.93"/>` +
      `<path d="M27 60 Q39 49 52 53" stroke="#ffffff" stroke-width="3" fill="none" opacity=".35" stroke-linecap="round"/>` +
      `<circle cx="40" cy="72" r="7.5" fill="#fff"/><circle cx="62" cy="72" r="7.5" fill="#fff"/>` + eye(41, 74) + eye(63, 74) +
      `<path d="M37 90 q13 9 26 0" stroke="#16201a" stroke-width="2.6" fill="none" stroke-linecap="round"/>` +
      `<circle cx="29" cy="112" r="4.2" fill="${c}"/><circle cx="71" cy="111" r="3.4" fill="${c}"/>`,
    golem: () => shadow +
      `<rect x="14" y="70" width="14" height="36" rx="6" fill="#7a7060"/><rect x="72" y="70" width="14" height="36" rx="6" fill="#7a7060"/>` +
      `<rect x="20" y="56" width="60" height="50" rx="11" fill="#8a7f6b"/>` +
      `<rect x="10" y="50" width="22" height="24" rx="9" fill="#9c907a"/><rect x="68" y="50" width="22" height="24" rx="9" fill="#9c907a"/>` +
      `<rect x="38" y="38" width="24" height="20" rx="6" fill="#9c907a"/>` +
      eye(45, 49, '#ffb347') + eye(55, 49, '#ffb347') +
      `<circle cx="50" cy="80" r="9.5" fill="#ff8c3a"/><circle cx="50" cy="80" r="5" fill="#ffe0b0"/>` +
      `<path d="M30 64 l8 9 M68 96 l-8 -9 M50 92 l0 8" stroke="#5f5648" stroke-width="2"/>`,
    wraith: () => shadow +
      `<path d="M50 33 Q29 37 27 70 Q25 101 34 110 Q40 100 44 110 Q50 100 56 110 Q60 100 66 110 Q75 101 73 70 Q71 37 50 33 Z" fill="${c}" opacity=".82"/>` +
      `<path d="M50 33 Q33 35 31 58 L69 58 Q67 35 50 33 Z" fill="#2a2f4a"/>` +
      eye(43, 50, '#9affe9') + eye(57, 50, '#9affe9') +
      `<path d="M30 62 q-9 7 -11 19" stroke="${c}" stroke-width="5" fill="none" stroke-linecap="round" opacity=".8"/>` +
      `<path d="M70 62 q9 7 11 19" stroke="${c}" stroke-width="5" fill="none" stroke-linecap="round" opacity=".8"/>`,
    hydra: () => shadow +
      `<path d="M40 86 Q29 60 25 42" stroke="#6c7d61" stroke-width="9" fill="none" stroke-linecap="round"/>` +
      `<path d="M50 84 Q50 56 50 38" stroke="#6c7d61" stroke-width="9" fill="none" stroke-linecap="round"/>` +
      `<path d="M60 86 Q71 60 75 42" stroke="#6c7d61" stroke-width="9" fill="none" stroke-linecap="round"/>` +
      `<ellipse cx="50" cy="94" rx="30" ry="18" fill="#5b6b52"/>` +
      [[25, 40], [50, 36], [75, 40]].map(([x, y]) =>
        `<ellipse cx="${x}" cy="${y}" rx="8.5" ry="9.5" fill="${c}"/>` + eye(x - 3, y - 1) + eye(x + 3, y - 1) +
        `<path d="M${x - 5} ${y + 6} h10" stroke="#16201a" stroke-width="1.6"/>`).join(''),
    wyrm: () => shadow +
      `<path d="M30 60 Q5 38 8 73 Q23 66 35 75 Z" fill="#7a2a1a" opacity=".9"/>` +
      `<path d="M70 60 Q95 38 92 73 Q77 66 65 75 Z" fill="#7a2a1a" opacity=".9"/>` +
      `<path d="M50 107 Q21 100 25 77 Q29 56 50 56 Q71 56 75 77 Q79 100 50 107 Z" fill="${c}"/>` +
      `<path d="M50 100 Q34 96 36 80 Q38 67 50 67 Q62 67 64 80 Q66 96 50 100 Z" fill="#ffd0a8" opacity=".4"/>` +
      `<path d="M50 58 Q47 42 57 32" stroke="${c}" stroke-width="12" fill="none" stroke-linecap="round"/>` +
      `<path d="M57 32 q-13 -4 -17 7 q11 2 15 -2 z" fill="${c}"/>` +
      `<path d="M52 25 l-3 -9 M63 27 l5 -8" stroke="#ffd24a" stroke-width="2.6" stroke-linecap="round"/>` +
      `<circle cx="55" cy="29" r="2.6" fill="#ffe14a"/>` +
      `<path d="M40 35 q-9 0 -13 4 q7 2 11 0 z" fill="#ffb347"/>`,
    spider: () => shadow +
      // eight jointed legs splayed around a bulbous body + a smaller head with cluster eyes
      [[-1, 0], [-1, 14], [1, 0], [1, 14]].map(([dir, off]) =>
        `<path d="M50 80 q${dir * 22} ${-8 + off} ${dir * 34} ${10 + off}" stroke="#3a2233" stroke-width="3.5" fill="none" stroke-linecap="round"/>`).join('') +
      `<ellipse cx="50" cy="84" rx="26" ry="22" fill="${c}" opacity=".95"/>` +
      `<path d="M40 72 q10 -6 20 0" stroke="#ffffff" stroke-width="2.5" fill="none" opacity=".3" stroke-linecap="round"/>` +
      `<ellipse cx="50" cy="58" rx="13" ry="11" fill="${shade(c, -18)}"/>` +
      `<circle cx="45" cy="56" r="2.6" fill="#1a0f14"/><circle cx="55" cy="56" r="2.6" fill="#1a0f14"/>` +
      `<circle cx="42" cy="61" r="1.6" fill="#1a0f14"/><circle cx="58" cy="61" r="1.6" fill="#1a0f14"/>` +
      `<path d="M44 64 q6 4 12 0" stroke="#1a0f14" stroke-width="2" fill="none"/>`,
    treant: () => shadow +
      // gnarled bark trunk with two limb-arms, a mossy crown and glowing knot-eyes
      `<path d="M30 110 Q26 70 34 50 Q40 36 50 36 Q60 36 66 50 Q74 70 70 110 Z" fill="${shade(c, -34)}"/>` +
      `<path d="M44 108 Q42 78 46 56 M56 108 Q58 78 54 56" stroke="#2c2014" stroke-width="2.4" fill="none" opacity=".6"/>` +
      `<path d="M34 64 Q16 58 12 40 Q22 48 36 52 Z" fill="${shade(c, -28)}"/>` +
      `<path d="M66 64 Q84 58 88 40 Q78 48 64 52 Z" fill="${shade(c, -28)}"/>` +
      `<ellipse cx="50" cy="40" rx="30" ry="20" fill="${c}"/>` +
      `<ellipse cx="32" cy="46" rx="13" ry="11" fill="${shade(c, 12)}"/><ellipse cx="68" cy="46" rx="13" ry="11" fill="${shade(c, 12)}"/>` +
      `<circle cx="43" cy="70" r="4" fill="#ffd24a"/><circle cx="57" cy="70" r="4" fill="#ffd24a"/>` +
      `<circle cx="43" cy="70" r="1.7" fill="#3a2a10"/><circle cx="57" cy="70" r="1.7" fill="#3a2a10"/>` +
      `<path d="M42 84 q8 6 16 0" stroke="#2c2014" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    frost: () => shadow +
      // a crystalline ice colossus — faceted shard body, jagged crown, frozen glow eyes
      `<path d="M50 30 L34 52 L30 104 L70 104 L66 52 Z" fill="${c}" opacity=".94"/>` +
      `<path d="M50 30 L34 52 L50 60 Z" fill="#ffffff" opacity=".5"/>` +
      `<path d="M50 30 L66 52 L50 60 Z" fill="${shade(c, -20)}" opacity=".7"/>` +
      `<path d="M30 104 L50 60 L70 104 Z" fill="${shade(c, -12)}" opacity=".5"/>` +
      `<path d="M40 30 l4 -14 l5 12 l5 -16 l5 18 l6 -10" stroke="${shade(c, 20)}" stroke-width="3" fill="none" stroke-linejoin="round"/>` +
      `<path d="M16 78 l12 6 M84 78 l-12 6" stroke="${c}" stroke-width="5" stroke-linecap="round"/>` +
      `<circle cx="43" cy="62" r="3.4" fill="#eaffff"/><circle cx="57" cy="62" r="3.4" fill="#eaffff"/>` +
      `<circle cx="43" cy="62" r="1.5" fill="#2b6f8c"/><circle cx="57" cy="62" r="1.5" fill="#2b6f8c"/>`,
    void: () => shadow +
      // an eldritch maw — a dark tendrilled mass with a ring of eyes around a gaping fanged mouth
      [0, 1, 2, 3, 4].map((i) => { const a = -2.0 + i * 1.0; return `<path d="M50 80 q${Math.cos(a) * 30} ${Math.sin(a) * 26} ${Math.cos(a) * 40} ${20 + Math.sin(a) * 30}" stroke="${shade(c, -30)}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".85"/>`; }).join('') +
      `<circle cx="50" cy="74" r="30" fill="#160a22"/>` +
      `<circle cx="50" cy="74" r="30" fill="none" stroke="${c}" stroke-width="2.5" opacity=".7"/>` +
      [[34, 60], [50, 52], [66, 60], [30, 78], [70, 78]].map(([x, y]) =>
        `<circle cx="${x}" cy="${y}" r="3.6" fill="${c}"/><circle cx="${x}" cy="${y}" r="1.5" fill="#0b0410"/>`).join('') +
      `<ellipse cx="50" cy="86" rx="15" ry="10" fill="#0b0410"/>` +
      `<path d="M37 84 l4 6 l4 -6 l5 7 l5 -7 l4 6 l4 -6" stroke="${c}" stroke-width="2.2" fill="none" stroke-linejoin="round"/>`,
  };
  return (S[def.shape] || S.slime)();
}

// Full standalone SVG string (used for previews / shop cards). `palette` recolors pieces.
export function championSVG(def, { size = 80, cls = '', palette = null } = {}) {
  return `<svg class="champ ${cls}" viewBox="0 0 100 120" width="${size}" height="${size * 1.2}"
            xmlns="http://www.w3.org/2000/svg" data-origin="${def.origin}" data-class="${def.klass}">
            <g class="champ-body">${championInner(def, palette)}</g>
          </svg>`;
}
