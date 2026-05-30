// Warbound — game loop. Planning phase (interactive shop/bench/board + drag) → combat
// (sim + timeline playback) → resolve → next round, until 10 wins or 0 lives.
import { el, $, $$ } from './dom.js';
import { UNITS_BY_ID } from './data/units.js';
import { TRAITS, activeTraits } from './data/traits.js';
import { championSVG } from './svg.js';
import { simulate } from './sim/combat.js';
import { hashSeed } from './rng.js';
import { CombatPlayer } from './render/player.js';
import { createDragController } from './input/drag.js';
import { getEnemyBoard } from './data/enemies.js';
import * as Run from './state/run.js';
import { resume as audioResume, Sfx, setEnabled as setSound, isEnabled as soundOn } from './audio/audio.js';
import { launchConfetti } from './render/fx.js';

let run = Run.load() || Run.freshRun();
let combatSpeed = 1;
let inCombat = false;
let dragCtl = null;
let player = null;

// ---------- board ----------
function unitNode(u, team) {
  const def = UNITS_BY_ID[u.defId];
  const node = el(`.unit.team-${team}`, { dataset: { star: u.star, uid: u.uid || '' } });
  node.style.transform = `translate(${u.col * 100}%, ${u.row * 100}%)`;
  node.append(
    el('.stars', {}, u.star > 1 ? '★'.repeat(u.star) : ''),
    el('.frame', { html: championSVG(def, { size: 60 }) }),
    el('.bars', {}, [el('.bar.hp', {}, [el('.trail'), el('.fill')]), el('.bar.mana', {}, [el('.fill')])]),
  );
  if (u.items && u.items.length) node.append(el('.item-dots', {}, u.items.map(() => el('i'))));
  node.querySelector('.bar.hp .fill').style.transform = 'scaleX(1)';
  node.querySelector('.bar.hp .trail').style.transform = 'scaleX(1)';
  node.querySelector('.bar.mana .fill').style.transform = 'scaleX(0)';
  return node;
}

function buildBoardEl() {
  const stage = el('.stage');
  const wrap = el('.board-wrap');
  const tiles = el('.tiles');
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const zone = r < 4 ? 'enemy-zone' : 'player-zone';
    tiles.append(el(`.tile.${zone}${(r + c) % 2 ? ' alt' : ''}`, { dataset: { col: c, row: r } }));
  }
  const units = el('.units');
  if (!inCombat) for (const u of run.board) {
    const n = unitNode(u, 'player');
    units.append(n);
  }
  wrap.append(tiles, el('.midline'), units, el('.fx-dom'));
  stage.append(wrap);
  return { stage, wrap, units };
}

// ---------- traits ----------
function buildTraitsEl() {
  const defs = run.board.map((u) => UNITS_BY_ID[u.defId]);
  const active = activeTraits(defs);
  const rail = el('.traits-rail');
  const entries = Object.entries(active).filter(([t]) => TRAITS[t]).sort((a, b) => (b[1].tier - a[1].tier) || (b[1].count - a[1].count));
  if (!entries.length) rail.append(el('.trait-chip', {}, 'Place champions to form synergies'));
  for (const [t, info] of entries) {
    const def = TRAITS[t];
    const tierIdx = def.breakpoints.indexOf(info.tier) + 1;
    const next = def.breakpoints.find((b) => b > info.count);
    rail.append(el(`.trait-chip${info.tier ? ' active tier-' + tierIdx : ''}`, { title: def.bonusText[info.tier] || def.desc }, [
      el('span.dot', { style: { background: def.color } }),
      el('span', {}, def.name),
      el('span.cnt', {}, next ? `${info.count}/${next}` : `${info.count}`),
    ]));
  }
  return rail;
}

// ---------- shop / bench ----------
function buildShopEl() {
  const row = el('.shop-row');
  run.shop.forEach((id, i) => {
    const def = id && UNITS_BY_ID[id];
    if (!def) { row.append(el('.shop-card.empty')); return; }
    const owned = [...run.board, ...run.bench.filter(Boolean)].some((u) => u.defId === id);
    const card = el(`.shop-card.cost-${def.cost}${owned ? ' owned' : ''}`, { onclick: () => doBuy(i) }, [
      el('span.price', {}, `${def.cost}⛁`),
      el('.art', { html: championSVG(def, { size: 46 }) }),
      el('.nm', {}, def.name),
      el('.tags', {}, `${TRAITS[def.origin].name} · ${TRAITS[def.klass].name}`),
    ]);
    row.append(card);
  });
  const inc = Run.income(run);
  const controls = el('.shop-controls', {}, [
    el('button.btn.primary', { onclick: doBuyXP }, [el('span', {}, 'Buy XP'), el('span', { style: { opacity: .7 } }, '4⛁')]),
    el('button.btn.reroll', { onclick: doReroll }, [el('span', {}, '⟳'), el('span', { style: { opacity: .7 } }, '2⛁')]),
    el('span', { style: { marginLeft: 'auto', fontSize: '11px', color: 'var(--ink-dim)' } }, `+${inc.total}/turn (⛁${inc.interest} int${inc.streakBonus ? ' +' + inc.streakBonus + ' streak' : ''})`),
  ]);
  return el('.shop', {}, [controls, row]);
}

function buildBenchEl() {
  const bench = el('.bench');
  run.bench.forEach((u) => {
    const slot = el(`.slot${u ? ' filled' : ''}`);
    if (u) {
      const inner = el('.frame', { html: championSVG(UNITS_BY_ID[u.defId], { size: 38 }) });
      if (u.star > 1) inner.append(el('.stars', { style: { position: 'absolute', top: '-2px' } }, '★'.repeat(u.star)));
      slot.append(inner);
      slot.dataset.uid = u.uid;
    }
    bench.append(slot);
  });
  return bench;
}

// ---------- actions ----------
function act(fn) { audioResume(); fn(); Run.save(run); renderPlanning(); }
function doBuy(i) { act(() => Run.buy(run, i)); Sfx.buy(); }
function doBuyXP() { act(() => Run.buyXP(run)); Sfx.click(); }
function doReroll() { act(() => Run.reroll(run)); Sfx.click(); }

// ---------- planning render ----------
function renderPlanning() {
  inCombat = false;
  const enemy = getEnemyBoard(run.round, null);
  const boardLimitTxt = `${run.board.length}/${Run.boardLimit(run)}`;
  const { stage, wrap, units } = buildBoardEl();

  const game = el('.game', {}, [
    el('.topbar', {}, [
      el('.stat-pill.gold', {}, [el('span.ico', {}, '⛁'), el('span', {}, run.gold)]),
      el('.stat-pill', {}, [el('span.lives', {}, '❤'.repeat(run.lives)), el('span', { style: { color: 'var(--hp)', marginLeft: '4px' } }, `${run.wins}/10`)]),
      el('.stat-pill.round', {}, `Round ${run.round}`),
      el('button.btn#soundBtn', { style: { padding: '5px 10px' }, onclick: toggleSound }, soundOn() ? '🔊' : '🔇'),
      el('button.btn', { style: { padding: '5px 10px' }, onclick: showHelp }, '?'),
    ]),
    el('.topbar', {}, [
      el('.stat-pill', {}, [el('span', { style: { color: 'var(--gold)' } }, `Lv ${run.level}`), el('span', { style: { color: 'var(--ink-dim)', fontSize: '11px' } }, ` · ${boardLimitTxt}`)]),
      el('.xpbar', {}, el('.fill', { style: { transform: `scaleX(${Run.xpNeeded(run) ? run.xp / Run.xpNeeded(run) : 1})` } })),
    ]),
    buildTraitsEl(),
    el('.phase-banner', {}, `Next: ${enemy.name} — ${enemy.traitHint}`),
    stage,
    el('.combat-ctl', {}, [
      el('button.btn.primary#readyBtn', { style: { fontSize: '15px', padding: '10px 22px' }, onclick: startCombat }, '⚔ Ready'),
      el('button.btn#spd1', { onclick: () => setSpeed(1) }, '1×'),
      el('button.btn#spd2', { onclick: () => setSpeed(2) }, '2×'),
      el('button.btn#spd4', { onclick: () => setSpeed(4) }, '4×'),
      el('.sell-zone#sellZone', { style: { marginLeft: 'auto' } }, '🗑 Sell'),
    ]),
    buildBenchEl(),
    buildShopEl(),
  ]);
  $('#app').replaceChildren(game);
  highlightSpeed();

  // drag wiring
  dragCtl = createDragController({
    boardWrap: wrap, sellZone: $('#sellZone'),
    onPlace: (uid, col, row) => act(() => Run.placeOnBoard(run, uid, col, row)),
    onBench: (uid) => act(() => Run.benchUnit(run, uid)),
    onSell: (uid) => { act(() => Run.sellUid(run, uid)); Sfx.sell(); },
  });
  // make board units + bench units draggable
  units.querySelectorAll('.unit').forEach((n) => {
    const uid = n.dataset.uid; const u = run.board.find((x) => x.uid === uid);
    if (u) dragCtl.makeDraggable(n, uid, 'board', championSVG(UNITS_BY_ID[u.defId], { size: 56 }));
  });
  $$('.bench .slot.filled').forEach((s) => {
    const uid = s.dataset.uid; const u = run.bench.find((x) => x && x.uid === uid);
    if (u) dragCtl.makeDraggable(s, uid, 'bench', championSVG(UNITS_BY_ID[u.defId], { size: 56 }));
  });
}

function setSpeed(s) { combatSpeed = s; if (player) player.setSpeed(s); highlightSpeed(); }
function highlightSpeed() { for (const s of [1, 2, 4]) { const b = $(`#spd${s}`); if (b) b.classList.toggle('primary', combatSpeed === s); } }
function setBanner(t) { const b = $('.phase-banner'); if (b) b.textContent = t; }
function toggleSound() { audioResume(); setSound(!soundOn()); const b = $('#soundBtn'); if (b) b.textContent = soundOn() ? '🔊' : '🔇'; if (soundOn()) Sfx.click(); }

function showHelp() {
  const tips = [
    ['🛒', '<b>Buy champions</b> from the shop (bottom) — tap a card. Each costs gold ⛁.'],
    ['✋', '<b>Drag</b> champions from your bench onto the board to deploy them. Drag to 🗑 to sell.'],
    ['🔗', '<b>Synergies:</b> matching <b>Origins</b> (Undead, Elf, Dragon…) & <b>Classes</b> (Knight, Mage…) unlock team bonuses — see the bar near the top.'],
    ['⭐', '<b>3 copies</b> of the same champion auto-fuse into a stronger ★★ (then ★★★).'],
    ['🛡️', '<b>Position matters:</b> tanks in front, fragile carries in back. Then press ⚔ Ready.'],
    ['🏆', 'Win <b>10 rounds</b> before losing all <b>5 lives ❤</b>.'],
  ];
  const ov = el('.overlay', {}, el('.help-card', {}, [
    el('h2', {}, 'How to play'),
    el('.sub', {}, 'Warbound — a fantasy auto-battler'),
    el('ul', {}, tips.map(([e, t]) => el('li', {}, [el('span.e', {}, e), el('span', { html: t })]))),
    el('button.btn.primary.go', { onclick: () => { audioResume(); try { localStorage.setItem('warbound_intro', '1'); } catch {} ov.remove(); } }, "Let's go ⚔"),
  ]));
  document.body.append(ov);
}
function seenIntro() { try { return localStorage.getItem('warbound_intro') === '1'; } catch { return false; } }

// ---------- combat ----------
async function startCombat() {
  if (inCombat) return;
  audioResume();
  inCombat = true;
  const enemy = getEnemyBoard(run.round, null);
  const playerBoard = run.board.map(({ defId, star, col, row }) => ({ defId, star, col, row }));
  const enemyBoard = enemy.units.map(({ defId, star, col, row }) => ({ defId, star, col, row }));
  const seed = hashSeed(run.seed, run.round);
  const { events } = simulate(playerBoard, enemyBoard, seed);

  // hide planning-only controls, keep board
  $$('.bench .slot, .shop, .combat-ctl .btn:not(#readyBtn)').forEach(() => {});
  const ready = $('#readyBtn'); if (ready) { ready.disabled = true; ready.textContent = '⚔ Fighting…'; }
  setBanner(`⚔ vs ${enemy.name}`);

  player = new CombatPlayer($('.units'), $('.fx-dom'));
  const winner = await player.play(events, { speed: combatSpeed });
  const won = winner === 'player';
  won ? Sfx.victory() : Sfx.defeat();
  if (won) launchConfetti(2000);
  setBanner(won ? '🏆 Round won!' : winner === 'enemy' ? '💀 Round lost' : '⚖ Draw — counts as a loss');

  Run.resolveRound(run, won);
  Run.save(run);
  setTimeout(() => {
    if (run.over) endScreen();
    else renderPlanning();
  }, 1100);
}

function endScreen() {
  const won = run.won;
  if (won) launchConfetti(4000);
  const card = el('.endscreen', {}, [
    el('h1', { style: { fontSize: '34px', margin: '0' } }, won ? '🏆 VICTORY' : '💀 DEFEAT'),
    el('p', { style: { color: 'var(--ink-dim)' } }, won ? `You won the run with ${run.lives} ❤ to spare!` : `Your warband fell at round ${run.round}. ${run.wins} wins.`),
    el('button.btn.primary', { style: { fontSize: '16px', padding: '12px 28px' }, onclick: () => { run = Run.freshRun(); Run.save(run); renderPlanning(); } }, '↻ New Run'),
  ]);
  $('#app').replaceChildren(el('.game', { style: { alignItems: 'center', justifyContent: 'center', minHeight: '80svh', textAlign: 'center', gap: '16px' } }, [card]));
}

renderPlanning();
if (!seenIntro()) showHelp();
// Debug hook (also the seed of a future debug menu): inspect/drive state from console.
window.__wb = {
  get run() { return run; }, Run,
  render: renderPlanning, fight: startCombat,
  place: (uid, c, r) => act(() => Run.placeOnBoard(run, uid, c, r)),
  giveGold: (n) => act(() => (run.gold += n)),
};
console.log('[warbound] game loop ready. Round', run.round, '| board limit', Run.boardLimit(run));
