// Inline SVG icon set — replaces emoji so the UI matches the game's hand-made SVG look.
// ic(name) returns an SVG string (fill: currentColor, sized 1em) — drop it into el({html}).
// iconEl(name) wraps it in an element for child arrays. crest()/rankMedal() are tinted shapes.
import { el } from './dom.js';

const P = {
  gold:   '<circle cx="12" cy="12" r="9" opacity=".25"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="4.4" fill="#0b0f17"/><rect x="11" y="8.6" width="2" height="6.8" rx="1" fill="currentColor"/>',
  spoils: '<path d="M12 2l2.6 4.4L20 7l-4 4 1 6-5-2.6L7 17l1-6-4-4 5.4-.6z"/>',
  heart:  '<path d="M12 21S3.5 14.6 3.5 8.8C3.5 5.9 5.8 4 8.3 4c1.8 0 3 .9 3.7 2 .7-1.1 1.9-2 3.7-2 2.5 0 4.8 1.9 4.8 4.8C20.5 14.6 12 21 12 21z"/>',
  sword:  '<path d="M12 2l3 3v8l-1.5 2v3h1v2h-5v-2h1v-3l-1.5-2V5z"/>',
  shield: '<path d="M12 2l8 3v6c0 5-3.4 9-8 11C7.4 20 4 16 4 11V5z"/>',
  book:   '<path d="M4 4h6c1.1 0 2 .9 2 2v14c0-1.1-.9-2-2-2H4zM20 4h-6c-1.1 0-2 .9-2 2v14c0-1.1.9-2 2-2h6z"/>',
  coffer: '<path d="M3 9l2-4h14l2 4zM3 10h18v8a1 1 0 01-1 1H4a1 1 0 01-1-1zM10.5 10h3v3h-3z"/>',
  gem:    '<path d="M6 3h12l3 5-9 13L3 8z" opacity=".9"/><path d="M3 8h18M9 3L6 8l6 13M15 3l3 5-6 13" fill="none" stroke="#0b0f17" stroke-width="1"/>',
  skull:  '<path d="M12 2C7 2 4 5.4 4 10c0 2.6 1.2 4.3 2.5 5.3V19h2v-2h2v2h2.9v-2h2v2H20v-3.7C21.3 14.3 22.5 12.6 22.5 10 22.5 5.4 19 2 12 2z"/><circle cx="8.6" cy="11" r="2" fill="#0b0f17"/><circle cx="15.4" cy="11" r="2" fill="#0b0f17"/>',
  crown:  '<path d="M3 8l3.5 3L12 5l5.5 6L21 8l-1.5 11h-15zM3 20h18v2H3z"/>',
  trophy: '<path d="M7 4h10v3c0 3-2 5-5 5S7 10 7 7zM5 4H3v2c0 2 1.5 3.5 3.5 3.7M19 4h2v2c0 2-1.5 3.5-3.5 3.7M11 13h2v4h-2zM8 19h8v2H8z"/>',
  star:   '<path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17.6 5.9 20.4l1.5-6.8L2.2 9l6.9-.7z"/>',
  bag:    '<path d="M8 7V6a4 4 0 018 0v1h2l1 13H5L6 7zM10 7h4V6a2 2 0 00-4 0z"/>',
  sell:   '<path d="M6 7h12l-1 14H7zM9 7V5h6v2M4 7h16" fill="none" stroke="currentColor" stroke-width="2"/>',
  lock:   '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3" fill="none" stroke="currentColor" stroke-width="2"/>',
  unlock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 017.5-1.8" fill="none" stroke="currentColor" stroke-width="2"/>',
  sound:  '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8a5 5 0 010 8M18.5 5.5a9 9 0 010 13" fill="none" stroke="currentColor" stroke-width="2"/>',
  mute:   '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2"/>',
  burst:  '<path d="M12 2l2 6 6-3-3 6 6 2-6 2 3 6-6-3-2 6-2-6-6 3 3-6-6-2 6-2-3-6 6 3z"/>',
  eye:    '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3"/>',
  ban:    '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 6l12 12" stroke="currentColor" stroke-width="2"/>',
  codex:  '<path d="M5 3h11a2 2 0 012 2v16l-3-2-3 2-3-2-3 2V4a1 1 0 011-1z"/>',
  help:   '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 9a3 3 0 115 2.2c-.9.7-1.5 1.2-1.5 2.3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="17.5" r="1.2"/>',
  back:   '<path d="M14 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  retry:  '<path d="M5 12a7 7 0 1 1 2 5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 17v-4h4"/>',
  flame:  '<path d="M12 2c1 4-3 5-3 9a3 3 0 006 0c0-1.5-1-2-1-3 2 1 4 3 4 6a6 6 0 01-12 0c0-5 5-7 6-12z"/>',
  potion: '<path d="M9 3h6v2l-1 1v3l4 7a3 3 0 01-2.7 4.3H8.7A3 3 0 016 16l4-7V6L9 5z"/>',
  bow:    '<path d="M5 3 Q19 12 5 21" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 3v18M5 12h15l-3-3M20 12l-3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  wand:   '<path d="M4 20L14 10" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M17 2l1.2 3L21.5 6l-3.3 1L17 10l-1.2-3L12.5 6l3.3-1z"/>',
  // ---- augment-specific art (one recognisable shape per augment family) ----
  anvil:    '<path d="M3 7h12a5 5 0 01-5 5H9v3h4v2H6v-2h1v-3a4 4 0 01-4-4z"/><rect x="2" y="5" width="9" height="2.4" rx="1"/><rect x="8" y="18" width="9" height="2.5" rx="1"/>',
  wall:     '<path d="M3 5h18v14H3z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 10h18M3 14.5h18M9.5 5v5M14.5 5v5M7 10v4.5M17 10v4.5M11 14.5V19" stroke="currentColor" stroke-width="1.4"/>',
  boots:    '<path d="M7 3h3.2v8H15a4 4 0 014 4v2H7z"/><path d="M7 19h13" stroke="currentColor" stroke-width="1.6"/><path d="M10.2 11h2" stroke="#0b0f17" stroke-width="1"/>',
  fang:     '<path d="M4 4h16l-1.6 7c-.7 4-1.6 9-4.4 9-1.5 0-2.2-1.6-2-3 .2-1.6-1.4-1.6-1.2 0 .2 1.4-.5 3-2 3-2.8 0-3.7-5-4.4-9z"/>',
  target:   '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4.8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="1.6"/>',
  paw:      '<ellipse cx="12" cy="15.5" rx="4.4" ry="3.6"/><circle cx="6.2" cy="11.5" r="2"/><circle cx="10" cy="7.6" r="2.1"/><circle cx="14" cy="7.6" r="2.1"/><circle cx="17.8" cy="11.5" r="2"/>',
  banner:   '<path d="M6 3v18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M7.2 4h12l-3 4 3 4h-12z"/>',
  axe:      '<path d="M5 20.5L14.5 7.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M11 4.5c4-2.2 8.2-.2 9.2 4-4.2-.3-6.4.8-7.4 3.6-2-3-4.2-5-1.8-7.6z"/>',
  thorns:   '<path d="M4 13c5 0 8-3 9-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M13 5l3-1-1 3M8.5 9l3-.6-.7 3M5.5 12.4l3 .2-1.4 2.6" fill="currentColor"/><path d="M11 17c3 .5 6 .2 9-2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  telescope:'<path d="M2.5 14.5l13-5 1.7 4.6-13 5z" /><path d="M15.5 9.5l4-1.5 1.3 3.4-4 1.5z"/><path d="M5.5 17l-1.2 3.6M9.5 15.6l1.2 3.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
};
export function ic(name, { size = '1em', cls = '' } = {}) {
  const body = P[name];
  if (!body) return '';
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true" focusable="false">${body}</svg>`;
}
export function iconEl(name, cls = '') { return el(`i.ic-wrap${cls ? '.' + cls : ''}`, { html: ic(name) }); }

// a heraldic crest tinted to a colour with an initial — used for the AI warlords (no emoji faces).
export function crest(color, letter, size = 26) {
  return `<svg class="crest" viewBox="0 0 24 28" width="${size}" height="${size * 1.16}" aria-hidden="true">
    <path d="M2 2h20v15c0 5-5 8-10 11C7 25 2 22 2 17z" fill="${color}" opacity="0.9"/>
    <path d="M2 2h20v15c0 5-5 8-10 11C7 25 2 22 2 17z" fill="none" stroke="#0b0f17" stroke-width="1.5"/>
    <text x="12" y="16" text-anchor="middle" font-size="12" font-weight="800" fill="#0b0f17" font-family="system-ui,sans-serif">${letter}</text>
  </svg>`;
}
// a rank medallion tinted to the tier colour.
export function rankMedal(color, size = 18) {
  return `<svg class="rank-medal" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="${color}" opacity=".9"/><circle cx="12" cy="12" r="9" fill="none" stroke="#0b0f17" stroke-width="1.5"/>
    <path d="M12 6l1.6 3.4 3.7.4-2.8 2.5.8 3.7L12 14.6 8.7 16.4l.8-3.7L6.7 9.8l3.7-.4z" fill="#0b0f17" opacity=".55"/>
  </svg>`;
}
