// "Detailed" champion art (v2) — sleek fantasy vector: slimmer proportions, layered gear,
// capes/wings, gradient shading, and an ARTICULATED rig (separate head / torso / two arms /
// two legs / cape / weapon groups) so limbs can actually move. Fully separate from the classic
// art in svg.js; selected at runtime by the art-set toggle. viewBox 0 0 100 140, feet ~y130.
import { PALETTES } from './svg.js';

// ---- per-hero design table (all 29) ----
// accent: colour key · cape: cape colour or null · weapon · build · head · plume · shield · wings
const ART2 = {
  // Human (disciplined, blue/steel)
  knight_captain:  { accent: '#ffd95c', cape: '#b23b3b', weapon: 'sword',     build: 'broad', head: 'helm',  plume: '#ffd95c', shield: true },
  court_mage:      { accent: '#6fb1ff', cape: null,      weapon: 'orbstaff',  build: 'normal', head: 'hat' },
  crossbowman:     { accent: '#cfd8e6', cape: null,      weapon: 'crossbow',  build: 'slim',  head: 'cap' },
  royal_blade:     { accent: '#eae2ff', cape: '#3a4d7a', weapon: 'rapier',    build: 'slim',  head: 'bare' },
  field_medic:     { accent: '#7affc0', cape: null,      weapon: 'staff',     build: 'normal', head: 'circlet' },
  // Undead (green, gaunt)
  bone_guard:      { accent: '#d8e6cc', cape: null,      weapon: 'sword',     build: 'broad', head: 'helm',  shield: true },
  lich:            { accent: '#8cff9e', cape: '#1d3b2a', weapon: 'skullstaff', build: 'gaunt', head: 'hood' },
  skeleton_archer: { accent: '#b6e0a0', cape: null,      weapon: 'bow',       build: 'gaunt', head: 'bare' },
  wraith:          { accent: '#b0ffd8', cape: '#16261c', weapon: 'scythe',    build: 'gaunt', head: 'hood' },
  necromancer:     { accent: '#6effa0', cape: '#16332420', weapon: 'skullstaff', build: 'gaunt', head: 'hood' },
  // Elf (teal, graceful)
  thornguard:      { accent: '#7fe6b0', cape: null,      weapon: 'spear',     build: 'normal', head: 'circlet', shield: true },
  moon_priestess:  { accent: '#aef0ff', cape: '#2f7d6b', weapon: 'orbstaff',  build: 'slim',  head: 'hood' },
  wood_ranger:     { accent: '#8fe07a', cape: null,      weapon: 'bow',       build: 'slim',  head: 'hood' },
  shadow_dancer:   { accent: '#9fb0ff', cape: '#2a3550', weapon: 'daggers',   build: 'slim',  head: 'hood' },
  grove_healer:    { accent: '#7affc0', cape: null,      weapon: 'staff',     build: 'normal', head: 'circlet' },
  spirit_caller:   { accent: '#b0ffe0', cape: '#2f7d6b', weapon: 'orbstaff',  build: 'normal', head: 'hood' },
  // Demon (red, horned)
  hellguard:       { accent: '#ff8a4c', cape: null,      weapon: 'axe',       build: 'broad', head: 'horns', shield: true },
  warlock:         { accent: '#ff5a3c', cape: '#5a1414', weapon: 'wand',      build: 'normal', head: 'hood' },
  fel_archer:      { accent: '#ff7a5c', cape: null,      weapon: 'bow',       build: 'slim',  head: 'horns' },
  imp_assassin:    { accent: '#ff9a6c', cape: null,      weapon: 'claws',     build: 'slim',  head: 'horns' },
  pit_summoner:    { accent: '#ff5e8a', cape: '#5a1414', weapon: 'skullstaff', build: 'broad', head: 'horns' },
  // Beast (amber, feral)
  beast_hunter:    { accent: '#ffc46a', cape: null,      weapon: 'bow',       build: 'slim',  head: 'horns' },
  bramble_brute:   { accent: '#c8e06a', cape: null,      weapon: 'club',      build: 'broad', head: 'horns' },
  pack_stalker:    { accent: '#ffb15a', cape: null,      weapon: 'claws',     build: 'slim',  head: 'horns' },
  druid_healer:    { accent: '#9be86a', cape: null,      weapon: 'staff',     build: 'normal', head: 'horns' },
  beastmaster:     { accent: '#ffd24a', cape: '#7a4a2a', weapon: 'spear',     build: 'broad', head: 'horns' },
  // Dragon (gold, winged elite)
  dragon_knight:   { accent: '#ffd24a', cape: null,      weapon: 'greatsword', build: 'broad', head: 'helm', plume: '#ffd24a', wings: true },
  dragon_sage:     { accent: '#c79bff', cape: '#6a3fa0', weapon: 'orbstaff',  build: 'normal', head: 'hood', wings: true },
  wyrm_archer:     { accent: '#ffce5c', cape: null,      weapon: 'bow',       build: 'slim',  head: 'hood', wings: true },
};
const DEFAULT_HEAD = { knight: 'helm', mage: 'hat', ranger: 'hood', assassin: 'hood', healer: 'circlet', summoner: 'hood' };

// ---- gradients (namespaced per def so multiple heroes on screen don't collide) ----
function grads(def, p) {
  const id = (s) => `g2-${def.defId}-${s}`;
  return `<defs>
    <linearGradient id="${id('skin')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tint(p.skin, 18)}"/><stop offset="1" stop-color="${shade(p.skin, 14)}"/></linearGradient>
    <linearGradient id="${id('robe')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tint(p.primary, 16)}"/><stop offset="1" stop-color="${shade(p.primary, 24)}"/></linearGradient>
    <linearGradient id="${id('metal')}" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${tint(p.secondary, 30)}"/><stop offset=".5" stop-color="${p.secondary}"/><stop offset="1" stop-color="${shade(p.secondary, 28)}"/></linearGradient>
    <linearGradient id="${id('cape')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tint(p.cape, 12)}"/><stop offset="1" stop-color="${shade(p.cape, 32)}"/></linearGradient>
    <radialGradient id="${id('accent')}" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="${tint(p.accent, 40)}"/><stop offset="1" stop-color="${p.accent}"/></radialGradient>
  </defs>`;
}
function clamp(n) { return Math.max(0, Math.min(255, Math.round(n))); }
function hx(c) { const n = parseInt(c.slice(1, 7), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function toHex(r, g, b) { return '#' + [r, g, b].map((x) => clamp(x).toString(16).padStart(2, '0')).join(''); }
function tint(c, pct) { const [r, g, b] = hx(c); const f = pct / 100; return toHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f); }
function shade(c, pct) { const [r, g, b] = hx(c); const f = 1 - pct / 100; return toHex(r * f, g * f, b * f); }

// ---- weapons (held in the front hand, pivot ~ x26 y90; extend upward) ----
function weaponSVG(w, def, p, ac) {
  const M = `url(#g2-${def.defId}-metal)`, AC = `url(#g2-${def.defId}-accent)`, wood = '#6a4632';
  switch (w) {
    case 'sword': return `<rect x="24.3" y="52" width="3.4" height="38" rx="1.2" fill="${M}"/><rect x="20.5" y="87" width="11" height="3" rx="1.5" fill="${ac}"/><circle cx="26" cy="93" r="2" fill="${ac}"/>`;
    case 'greatsword': return `<path d="M26 44 l3.4 5 v41 h-6.8 v-41 z" fill="${M}"/><rect x="18.5" y="87" width="15" height="3.4" rx="1.7" fill="${ac}"/><circle cx="26" cy="94" r="2.4" fill="${ac}"/>`;
    case 'axe': return `<rect x="24.5" y="50" width="3" height="42" rx="1" fill="${wood}"/><path d="M27.5 51 q13 1 11 15 q-9 -1 -11 -7 z" fill="${M}"/>`;
    case 'spear': return `<rect x="25.2" y="44" width="2.4" height="50" rx="1" fill="${wood}"/><path d="M26.4 37 l4.2 9 h-8.4 z" fill="${M}"/>`;
    case 'mace': return `<rect x="24.6" y="60" width="3" height="32" rx="1" fill="${wood}"/><circle cx="26" cy="55" r="7" fill="${M}"/><path d="M26 46 v-4 M35 55 h4 M26 64 v4 M17 55 h4" stroke="${M}" stroke-width="2.5"/>`;
    case 'club': return `<path d="M22.5 92 l1.5 -28 q4 -3 8 0 l1.5 28 z" fill="${wood}"/><circle cx="27" cy="66" r="1.4" fill="${shade(wood, 25)}"/><circle cx="25" cy="74" r="1.4" fill="${shade(wood, 25)}"/>`;
    case 'scythe': return `<rect x="25" y="46" width="2.6" height="48" rx="1" fill="#2c2018"/><path d="M26 47 q-20 -1 -22 15 q11 -9 22 -7 z" fill="${M}"/>`;
    case 'rapier': return `<rect x="25.3" y="48" width="1.6" height="42" fill="${M}"/><circle cx="26" cy="89" r="3.2" fill="${ac}" opacity=".7"/>`;
    case 'daggers': return `<path d="M26 90 l-1.6 -19 h3.2 z" fill="${M}"/><path d="M74 90 l-1.6 -19 h3.2 z" fill="${M}"/>`;  // back dagger too (mirrored)
    case 'claws': return `<path d="M21.5 90 l-2 -9 M25.5 91 l0 -10 M29.5 90 l2 -9" stroke="${M}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
    case 'bow': return `<path d="M18 53 Q5 90 18 127" stroke="${M}" stroke-width="3" fill="none"/><line x1="18" y1="53" x2="18" y2="127" stroke="${ac}" stroke-width="1.1"/>`;
    case 'crossbow': return `<rect x="13" y="86" width="24" height="3.2" rx="1.2" fill="${wood}"/><path d="M14 79 Q26 84 14 93" stroke="${M}" stroke-width="2.2" fill="none"/><rect x="22" y="89" width="7" height="2.4" fill="${shade(wood, 20)}"/>`;
    case 'staff': return `<rect x="24.6" y="46" width="3" height="48" rx="1.5" fill="${wood}"/><path d="M26 46 q-8 3 0 11 q8 -8 0 -11 z" fill="${ac}"/>`;
    case 'orbstaff': return `<rect x="24.6" y="46" width="3" height="48" rx="1.5" fill="${shade(wood, 8)}"/><circle cx="26" cy="42" r="7" fill="${AC}"/><circle cx="26" cy="42" r="7" fill="none" stroke="#fff" stroke-width="1" opacity=".5"/>`;
    case 'skullstaff': return `<rect x="24.6" y="42" width="3" height="52" rx="1.5" fill="#3a2a1a"/><circle cx="26" cy="38" r="6.2" fill="${ac}"/><circle cx="24.2" cy="37.5" r="1.2" fill="#0b0f17"/><circle cx="27.8" cy="37.5" r="1.2" fill="#0b0f17"/>`;
    case 'wand': return `<rect x="25" y="64" width="2.6" height="28" rx="1.2" fill="#2c2018"/><circle cx="26.3" cy="61" r="4.2" fill="${AC}"/>`;
    default: return '';
  }
}

// ---- rig parts (each its own <g> for animation) ----
function shadow() { return `<ellipse cx="50" cy="130" rx="22" ry="5" fill="#000" opacity=".26"/>`; }
function wings(def, p) {
  const f = `url(#g2-${def.defId}-metal)`;
  return `<g class="v2-wings"><path d="M34 56 Q6 40 2 70 Q18 64 30 78 Q24 64 34 56 Z" fill="${f}" opacity=".9"/><path d="M66 56 Q94 40 98 70 Q82 64 70 78 Q76 64 66 56 Z" fill="${f}" opacity=".9"/></g>`;
}
function cape(def) { return `<g class="v2-cape"><path d="M36 56 Q50 52 64 56 L74 116 Q50 108 26 116 Z" fill="url(#g2-${def.defId}-cape)" opacity=".96"/></g>`; }
function legs(def, p, build) {
  const w = build === 'broad' ? 7.5 : build === 'slim' || build === 'gaunt' ? 5 : 6.2;
  const fill = `url(#g2-${def.defId}-metal)`;
  return `<g class="v2-leg-l"><path d="M${47 - w} 88 q-1.5 22 -2.5 40 l${w} 1 q1 -20 2 -41 Z" fill="${fill}"/></g>
          <g class="v2-leg-r"><path d="M53.5 88 q1 22 2 40 l${w} -1 q-1 -21 -2 -40 Z" fill="${fill}"/></g>`;
}
function shieldSVG(def, p, ac) {
  return `<g class="v2-shield"><path d="M70 64 l10 3 v8 q0 9 -10 13 q-10 -4 -10 -13 v-8 z" fill="url(#g2-${def.defId}-metal)"/><path d="M70 70 v14 M63 76 h14" stroke="${ac}" stroke-width="1.6" opacity=".8"/></g>`;
}
function torso(def, p, a, build) {
  const robe = `url(#g2-${def.defId}-robe)`, metal = `url(#g2-${def.defId}-metal)`;
  if (def.klass === 'knight') {
    return `<g class="v2-torso"><path d="M34 58 Q50 50 66 58 L70 96 Q50 102 30 96 Z" fill="${metal}"/>
      <path d="M44 60 h12 l-2 38 h-8 Z" fill="${robe}"/>
      <path d="M34 58 Q50 53 66 58 L64 67 Q50 62 36 67 Z" fill="${tint(p.secondary, 30)}"/></g>`;
  }
  const leather = def.klass === 'ranger' || def.klass === 'assassin';
  const botY = leather ? 100 : 112, hemX = leather ? 6 : 12;
  return `<g class="v2-torso"><path d="M36 58 Q50 50 64 58 L${50 + hemX + 6} ${botY} Q50 ${botY - 4} ${50 - hemX - 6} ${botY} Z" fill="${robe}"/>
    <path d="M46 58 q4 26 0 ${botY - 60} M54 58 q-4 26 0 ${botY - 60}" stroke="${a.accent}" stroke-width="1.5" fill="none" opacity=".45"/></g>`;
}
function backArm(def, p, a) {
  const fill = def.klass === 'knight' ? `url(#g2-${def.defId}-metal)` : `url(#g2-${def.defId}-robe)`;
  const sh = a.shield ? shieldSVG(def, p, a.accent) : '';
  return `<g class="v2-arm-back"><rect x="64" y="60" width="8" height="30" rx="4" fill="${shade(def.klass === 'knight' ? p.secondary : p.primary, 16)}"/></g>${sh}`;
}
function frontArm(def, p, a) {
  const fill = def.klass === 'knight' ? `url(#g2-${def.defId}-metal)` : `url(#g2-${def.defId}-robe)`;
  const hand = `<circle cx="26" cy="90" r="3.3" fill="url(#g2-${def.defId}-skin)"/>`;
  return `<g class="v2-arm-front"><rect x="24" y="60" width="8" height="30" rx="4" fill="${fill}"/>${hand}${weaponSVG(a.weapon, def, p, a.accent)}</g>`;
}
function head(def, p, a) {
  const skin = `url(#g2-${def.defId}-skin)`, robe = `url(#g2-${def.defId}-robe)`, metal = `url(#g2-${def.defId}-metal)`;
  const type = a.head || DEFAULT_HEAD[def.klass] || 'bare';
  const elfEars = def.origin === 'elf' ? `<path d="M35 40 L28 27 L41 38 Z" fill="${skin}"/><path d="M65 40 L72 27 L59 38 Z" fill="${skin}"/>` : '';
  const horns = (def.origin === 'demon' || def.origin === 'beast' || type === 'horns') ? `<path d="M38 30 q-7 -13 -1 -17 q5 8 9 13 Z" fill="${shade(p.secondary, 8)}"/><path d="M62 30 q7 -13 1 -17 q-5 8 -9 13 Z" fill="${shade(p.secondary, 8)}"/>` : '';
  const undeadEye = def.origin === 'undead' ? p.accent : '#15171f';
  let face, gear = '', eyes;
  if (type === 'hood') {
    face = ''; gear = `<path d="M32 30 Q50 13 68 30 Q70 45 63 51 L37 51 Q30 45 32 30 Z" fill="${robe}"/><path d="M40 45 Q50 39 60 45 Q56 53 50 53 Q44 53 40 45 Z" fill="${shade(p.primary, 38)}"/>`;
    eyes = `<circle cx="45.5" cy="45" r="1.8" fill="${undeadEye}"/><circle cx="54.5" cy="45" r="1.8" fill="${undeadEye}"/>`;
  } else {
    face = `<circle cx="50" cy="40" r="12.5" fill="${skin}"/>`;
    eyes = `<circle cx="45.6" cy="41" r="1.9" fill="${undeadEye}"/><circle cx="54.4" cy="41" r="1.9" fill="${undeadEye}"/>`;
    if (type === 'helm') { gear = `<path d="M37 40 Q50 23 63 40 L62 53 Q50 57 38 53 Z" fill="${metal}"/><rect x="44" y="42" width="12" height="4" rx="1" fill="#0d1320" opacity=".75"/>${a.plume ? `<path d="M50 22 q13 -7 4 9 q-3 3 -4 2 z" fill="${a.plume}"/>` : ''}`; eyes = ''; }
    else if (type === 'hat') { gear = `<path d="M33 40 L50 7 L67 40 Z" fill="${robe}"/><ellipse cx="50" cy="40" rx="18" ry="4.5" fill="${robe}"/><circle cx="50" cy="11" r="3" fill="${a.accent}"/>`; }
    else if (type === 'circlet') { gear = `<path d="M37 34 Q50 28 63 34" stroke="${a.accent}" stroke-width="2.6" fill="none"/><circle cx="50" cy="31" r="2.6" fill="${a.accent}"/>`; }
    else if (type === 'cap') { gear = `<path d="M37 38 Q50 28 63 38 Q50 34 37 38 Z" fill="${shade(p.secondary, 10)}"/>`; }
  }
  return `<g class="v2-head">${elfEars}${face}${gear}${eyes}${horns}</g>`;
}

export function championInnerV2(def) {
  const base = PALETTES[def.origin] || PALETTES.human;
  const a = ART2[def.defId] || { accent: base.accent, weapon: ({ knight: 'sword', mage: 'orbstaff', ranger: 'bow', assassin: 'daggers', healer: 'staff', summoner: 'skullstaff' })[def.klass] || 'sword', build: (def.klass === 'assassin' || def.klass === 'ranger') ? 'slim' : 'normal', head: DEFAULT_HEAD[def.klass] };
  const p = Object.assign({}, base, { accent: a.accent || base.accent, cape: a.cape || base.primary });
  const build = a.build || 'normal';
  return [
    grads(def, p),
    shadow(),
    a.wings ? wings(def, p) : '',
    a.cape ? cape(def) : '',
    backArm(def, p, a),
    legs(def, p, build),
    torso(def, p, a, build),
    frontArm(def, p, a),
    head(def, p, a),
  ].join('');
}

export function championSVGV2(def, { size = 80, cls = '' } = {}) {
  return `<svg class="champ champ-v2 ${cls}" viewBox="0 0 100 140" width="${size}" height="${size * 1.28}"
            xmlns="http://www.w3.org/2000/svg" data-origin="${def.origin}" data-class="${def.klass}">
            <g class="champ-body">${championInnerV2(def)}</g>
          </svg>`;
}
