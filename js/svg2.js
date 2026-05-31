// "Detailed" champion art (v2) — sleek fantasy vector: slimmer proportions, layered gear,
// capes, gradient shading, and an ARTICULATED rig (separate head / torso / two arms / two legs /
// cape / weapon groups) so limbs can actually move. Kept entirely separate from the classic
// art in svg.js; selected at runtime by the art-set toggle. viewBox 0 0 100 140, feet ~y132.
import { PALETTES } from './svg.js';

// Per-hero v2 design overrides (exemplars hand-tuned; others fall back to class+origin defaults).
// build: body proportions; weapon: which weapon to draw; cape: cape colour key; accent: colour key.
const ART2 = {
  knight_captain: { accent: '#ffd95c', cape: '#b23b3b', weapon: 'sword', shield: true, build: 'broad', plume: '#ffd95c' },
  lich:           { accent: '#8cff9e', cape: '#1d3b2a', weapon: 'skullstaff', hood: true, build: 'gaunt' },
  shadow_dancer:  { accent: '#9fb0ff', cape: '#2a3550', weapon: 'daggers', hood: true, build: 'slim' },
};

// gradient helper — namespaced per def so multiple heroes on screen don't collide
function grads(def, p) {
  const id = (s) => `g2-${def.defId}-${s}`;
  return `<defs>
    <linearGradient id="${id('skin')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tint(p.skin, 18)}"/><stop offset="1" stop-color="${shade(p.skin, 14)}"/></linearGradient>
    <linearGradient id="${id('robe')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tint(p.primary, 16)}"/><stop offset="1" stop-color="${shade(p.primary, 22)}"/></linearGradient>
    <linearGradient id="${id('metal')}" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="${tint(p.secondary, 28)}"/><stop offset=".5" stop-color="${p.secondary}"/><stop offset="1" stop-color="${shade(p.secondary, 26)}"/></linearGradient>
    <linearGradient id="${id('cape')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tint(p.cape, 12)}"/><stop offset="1" stop-color="${shade(p.cape, 30)}"/></linearGradient>
  </defs>`;
}
// quick colour math (no deps): lighten/darken a #rrggbb by pct
function clamp(n) { return Math.max(0, Math.min(255, Math.round(n))); }
function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function toHex(r, g, b) { return '#' + [r, g, b].map((x) => clamp(x).toString(16).padStart(2, '0')).join(''); }
function tint(c, pct) { const [r, g, b] = hex(c); const f = pct / 100; return toHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f); }
function shade(c, pct) { const [r, g, b] = hex(c); const f = 1 - pct / 100; return toHex(r * f, g * f, b * f); }

// ---- rig pieces (each its own <g> with a class for animation; transform-box:view-box in CSS) ----
function head(def, p, a) {
  const fg = `url(#g2-${def.defId}-skin)`;
  const ears = def.origin === 'elf' ? `<path d="M34 40 L27 28 L40 38 Z" fill="${fg}"/><path d="M66 40 L73 28 L60 38 Z" fill="${fg}"/>` : '';
  const horns = (def.origin === 'demon' || def.origin === 'beast') ? `<path d="M38 30 q-7 -12 -1 -16 q5 7 9 12 Z" fill="${shade(p.secondary, 10)}"/><path d="M62 30 q7 -12 1 -16 q-5 7 -9 12 Z" fill="${shade(p.secondary, 10)}"/>` : '';
  const eyeGlow = def.origin === 'undead' ? p.accent : '#15171f';
  const hood = a.hood ? `<path d="M32 30 Q50 14 68 30 Q70 44 64 50 L36 50 Q30 44 32 30 Z" fill="url(#g2-${def.defId}-robe)"/><path d="M40 44 Q50 38 60 44 Q56 52 50 52 Q44 52 40 44 Z" fill="${shade(p.primary, 35)}"/>` : '';
  const face = a.hood ? '' : `<circle cx="50" cy="40" r="12.5" fill="${fg}"/>`;
  const eyes = a.hood ? `<circle cx="45" cy="44" r="1.8" fill="${eyeGlow}"/><circle cx="55" cy="44" r="1.8" fill="${eyeGlow}"/>` : `<circle cx="45.5" cy="41" r="1.9" fill="${eyeGlow}"/><circle cx="54.5" cy="41" r="1.9" fill="${eyeGlow}"/>`;
  const plume = a.plume ? `<path d="M50 17 q10 -10 5 6 q-3 4 -5 4 Z" fill="${a.plume}"/>` : '';
  return `<g class="v2-head">${ears}${horns}${face}${hood}${eyes}${plume}</g>`;
}
function cape(def) { return `<g class="v2-cape"><path d="M36 56 Q50 52 64 56 L74 116 Q50 108 26 116 Z" fill="url(#g2-${def.defId}-cape)" opacity=".96"/></g>`; }
function legs(def, p, slim) {
  const w = slim ? 5.5 : 7; const fill = `url(#g2-${def.defId}-metal)`;
  return `<g class="v2-leg-l"><path d="M${46 - w} 88 q-1 22 -2 40 l${w} 1 q1 -20 2 -41 Z" fill="${fill}"/></g>
          <g class="v2-leg-r"><path d="M${54} 88 q1 22 2 40 l${w} -1 q-1 -21 -2 -40 Z" fill="${fill}"/></g>`;
}
function torso(def, p, a) {
  const robe = `url(#g2-${def.defId}-robe)`; const metal = `url(#g2-${def.defId}-metal)`;
  if (def.klass === 'knight') {
    return `<g class="v2-torso"><path d="M34 58 Q50 50 66 58 L70 96 Q50 102 30 96 Z" fill="${metal}"/>
      <path d="M44 60 h12 l-2 38 h-8 Z" fill="${robe}"/>
      <path d="M34 58 Q50 53 66 58 L64 66 Q50 62 36 66 Z" fill="${tint(p.secondary, 30)}"/></g>`;
  }
  // robed (mage/healer/summoner) or leather (ranger/assassin)
  const leather = def.klass === 'ranger' || def.klass === 'assassin';
  return `<g class="v2-torso"><path d="M36 58 Q50 50 64 58 L${leather ? 68 : 74} ${leather ? 100 : 112} Q50 ${leather ? 96 : 104} ${leather ? 32 : 26} ${leather ? 100 : 112} Z" fill="${robe}"/>
    <path d="M46 58 q4 26 0 ${leather ? 40 : 50} M54 58 q-4 26 0 ${leather ? 40 : 50}" stroke="${a.accent}" stroke-width="1.5" fill="none" opacity=".5"/></g>`;
}
function backArm(def, p) { const fill = def.klass === 'knight' ? `url(#g2-${def.defId}-metal)` : `url(#g2-${def.defId}-robe)`; return `<g class="v2-arm-back"><rect x="64" y="60" width="8" height="30" rx="4" fill="${shade(def.klass === 'knight' ? p.secondary : p.primary, 18)}"/></g>`; }
function frontArm(def, p, a) {
  const fill = def.klass === 'knight' ? `url(#g2-${def.defId}-metal)` : `url(#g2-${def.defId}-robe)`;
  const hand = `<circle cx="26" cy="90" r="3.4" fill="url(#g2-${def.defId}-skin)"/>`;
  const weapon = drawWeapon(def, p, a);
  return `<g class="v2-arm-front"><rect x="24" y="60" width="8" height="30" rx="4" fill="${fill}"/>${hand}${weapon}</g>`;
}
function drawWeapon(def, p, a) {
  const w = a.weapon || ({ knight: 'sword', mage: 'staff', healer: 'staff', summoner: 'staff', ranger: 'bow', assassin: 'daggers' })[def.klass] || 'sword';
  switch (w) {
    case 'sword': return `<path d="M26 88 L26 50 L23 50 L23 88 Z" fill="${tint(p.secondary, 35)}"/><rect x="21" y="86" width="10" height="3" rx="1" fill="${a.accent}"/>`;
    case 'skullstaff': return `<rect x="24.5" y="40" width="3" height="56" rx="1.5" fill="${shade('#6a4632', 4)}"/><circle cx="26" cy="38" r="6" fill="${a.accent}"/><circle cx="24" cy="37" r="1.2" fill="#0b0f17"/><circle cx="28" cy="37" r="1.2" fill="#0b0f17"/>`;
    case 'staff': return `<rect x="24.5" y="44" width="3" height="52" rx="1.5" fill="#6a4632"/><circle cx="26" cy="40" r="6.5" fill="${a.accent}"/><circle cx="26" cy="40" r="6.5" fill="none" stroke="#fff" stroke-width="1" opacity=".5"/>`;
    case 'bow': return `<path d="M20 56 Q8 90 20 124" stroke="${tint(p.secondary, 20)}" stroke-width="3" fill="none"/><line x1="20" y1="56" x2="20" y2="124" stroke="${a.accent}" stroke-width="1.2"/>`;
    case 'daggers': return `<path d="M26 88 L24 64 L22 64 L24 88 Z" fill="${tint(p.secondary, 35)}"/><path d="M74 90 L76 66 L78 66 L76 90 Z" fill="${tint(p.secondary, 35)}"/>`;
    default: return '';
  }
}

export function championInnerV2(def) {
  const base = PALETTES[def.origin] || PALETTES.human;
  const a = ART2[def.defId] || { accent: base.accent, weapon: null, build: (def.klass === 'assassin' || def.klass === 'ranger') ? 'slim' : 'normal' };
  const p = Object.assign({}, base, { cape: a.cape || base.primary });
  const slim = a.build === 'slim' || a.build === 'gaunt';
  const hasCape = a.cape || def.klass === 'knight';
  return [
    grads(def, p),
    `<ellipse cx="50" cy="130" rx="22" ry="5" fill="#000" opacity=".26"/>`,
    hasCape ? cape(def) : '',
    backArm(def, p),
    legs(def, p, slim),
    torso(def, p, a),
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
