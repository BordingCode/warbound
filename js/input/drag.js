// Pointer-Events drag controller (touch + mouse). Handles dragging champions between
// bench and board tiles, repositioning on the board, and dropping on a sell zone.
// Uses pointer capture + a top-level ghost so it isn't clipped; snaps to tiles.
import { el } from '../dom.js';

export function createDragController({ boardWrap, sellZone, onPlace, onBench, onSell, onEquip, onEquipUnit, onInspect, onGrab, onRelease, onDragOver }) {
  const dragLayer = document.getElementById('drag-layer');
  let active = null; // { uid, kind, ghost, pointerId, srcEl, startX, startY, startT }

  function tileAt(clientX, clientY) {
    const r = boardWrap.getBoundingClientRect();
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null;
    const col = Math.floor(((clientX - r.left) / r.width) * 8);
    const row = Math.floor(((clientY - r.top) / r.height) * 8);
    return { col: Math.max(0, Math.min(7, col)), row: Math.max(0, Math.min(7, row)) };
  }
  function clearHighlights() {
    boardWrap.querySelectorAll('.tile.drop-ok,.tile.drop-bad').forEach((t) => t.classList.remove('drop-ok', 'drop-bad'));
    document.querySelectorAll('.unit.equip-target').forEach((u) => u.classList.remove('equip-target'));
    if (sellZone) sellZone.classList.remove('hot');
  }
  function highlight(clientX, clientY) {
    clearHighlights();
    // dragging an ITEM: highlight the champion under the pointer (items equip onto a unit, not a tile)
    if (active && active.kind === 'item') {
      const id = unitUnder(clientX, clientY, null);
      if (id) { const n = document.querySelector(`.units .unit[data-uid="${id}"]`); if (n) n.classList.add('equip-target'); }
      return;
    }
    if (sellZone) {
      const sr = sellZone.getBoundingClientRect();
      if (clientX >= sr.left && clientX <= sr.right && clientY >= sr.top && clientY <= sr.bottom) { sellZone.classList.add('hot'); return; }
    }
    const tile = tileAt(clientX, clientY);
    if (!tile) return;
    const tEl = boardWrap.querySelector(`.tile[data-col="${tile.col}"][data-row="${tile.row}"]`);
    if (tEl) tEl.classList.add(tile.row >= 4 ? 'drop-ok' : 'drop-bad');
  }

  function start(e, uid, kind, srcEl, artHTML) {
    if (active) return;
    e.preventDefault();
    try { srcEl.setPointerCapture(e.pointerId); } catch {}
    const ghost = el('.drag-ghost', { html: artHTML });
    dragLayer.append(ghost);
    moveGhost(ghost, e.clientX, e.clientY);
    srcEl.classList.add('dragging');
    if (onGrab) onGrab(uid, kind);   // show drag-stats panel (+ for units, the sell value on the sell zone)
    active = { uid, kind, ghost, pointerId: e.pointerId, srcEl, startX: e.clientX, startY: e.clientY, startT: performance.now(), overUid: null };
  }
  function moveGhost(ghost, x, y) { ghost.style.left = x + 'px'; ghost.style.top = y + 'px'; }

  // which OTHER unit (by uid) is under the pointer right now? (the ghost is pointer-events:none, so
  // elementFromPoint sees through it). Used to show a dragged-vs-target stat comparison.
  function unitUnder(x, y, selfUid) {
    const node = document.elementFromPoint(x, y);
    const u = node && node.closest ? node.closest('.unit[data-uid]') : null;
    const id = u && u.dataset ? u.dataset.uid : null;
    return id && id !== selfUid ? id : null;
  }

  function onMove(e) {
    if (!active || e.pointerId !== active.pointerId) return;
    moveGhost(active.ghost, e.clientX, e.clientY);
    highlight(e.clientX, e.clientY);
    if (onDragOver) {   // units: dragged-vs-target compare; items: forge-on-this-unit preview
      const over = unitUnder(e.clientX, e.clientY, active.uid);
      if (over !== active.overUid) { active.overUid = over; onDragOver(over, active.kind); }
    }
  }
  function finish(e, cancelled) {
    if (!active || e.pointerId !== active.pointerId) return;
    const { uid, kind, ghost, srcEl, startX, startY, startT } = active;
    ghost.remove(); srcEl.classList.remove('dragging'); clearHighlights();
    if (onRelease) onRelease();   // hide drag-stats panel + restore the sell zone's default label
    const x = e.clientX, y = e.clientY;
    active = null;
    if (cancelled) return;
    // tap (little movement, short hold) on a champion -> inspect, not drop
    const moved = Math.hypot(x - startX, y - startY);
    if (kind !== 'item' && moved < 9 && performance.now() - startT < 280) { if (onInspect) onInspect(uid, kind); return; }
    if (kind === 'item') {                       // dropping an item onto a unit
      // prefer the champion actually under the pointer (forgiving — works even if the drop
      // lands slightly off the unit's own tile); fall back to the tile beneath.
      const overId = unitUnder(x, y, null);
      if (overId && onEquipUnit) { onEquipUnit(uid, overId); return; }
      const tile = tileAt(x, y);
      if (tile && onEquip) onEquip(uid, tile.col, tile.row);
      return;
    }
    if (sellZone) {
      const sr = sellZone.getBoundingClientRect();
      if (x >= sr.left && x <= sr.right && y >= sr.top && y <= sr.bottom) { onSell(uid); return; }
    }
    const tile = tileAt(x, y);
    if (tile) { if (tile.row >= 4) onPlace(uid, tile.col, tile.row); return; }
    // dropped on bench region?
    const br = document.querySelector('.bench')?.getBoundingClientRect();
    if (br && x >= br.left && x <= br.right && y >= br.top && y <= br.bottom) { onBench(uid); }
  }

  // attach to a draggable element (bench item or board unit)
  function makeDraggable(node, uid, kind, artHTML) {
    node.addEventListener('pointerdown', (e) => start(e, uid, kind, node, artHTML));
    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerup', (e) => finish(e, false));
    node.addEventListener('pointercancel', (e) => finish(e, true));
  }

  return { makeDraggable };
}
