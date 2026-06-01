// Single chooser for champion art: Classic (svg.js) vs Detailed v2 (svg2.js). Every caller
// imports championSVG from HERE, so flipping the art-set swaps the look everywhere at once.
// Kept in its own module to avoid a svg.js<->svg2.js import cycle.
import { championSVG as championClassic } from './svg.js';
import { championSVGV2 } from './svg2.js';

let artSet = (() => { try { const v = localStorage.getItem('warbound_artset'); return v === 'classic' || v === 'detailed' ? v : 'detailed'; } catch { return 'detailed'; } })();

export function getArtSet() { return artSet; }
export function setArtSet(s) { artSet = (s === 'classic') ? 'classic' : 'detailed'; try { localStorage.setItem('warbound_artset', artSet); } catch {} }

// Detailed everywhere EXCEPT calls that pass a palette override (the Armory hero recolours its
// armour by equipped gear — a classic-only feature), so those stay on the classic rig.
export function championSVG(def, opts = {}) {
  if (def.creature) return championClassic(def, opts);   // boss monster art lives on the classic path (svg.js creatureInner)
  return (artSet === 'detailed' && !opts.palette) ? championSVGV2(def, opts) : championClassic(def, opts);
}
