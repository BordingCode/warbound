// Warbound — entry point. M0: render a planning-phase layout (board + units + shop +
// bench + traits + HUD) from sample state so the shell is verifiable. Real logic
// (drag, sim, economy) layers on in later milestones.
import { el, $ } from './dom.js';
import { UNITS, UNITS_BY_ID, statsForStar } from './data/units.js';
import { TRAITS, activeTraits } from './data/traits.js';
import { championSVG } from './svg.js';

// ---- sample state (placeholder until economy/run state exists) ----
const sample = {
  gold: 32, hp: 84, lives: 4, wins: 3, round: 'Act 1 · 4', level: 6, xp: 2, xpMax: 6,
  board: [
    { defId: 'knight_captain', star: 2, col: 2, row: 6, team: 'player' },
    { defId: 'bone_guard', star: 1, col: 4, row: 6, team: 'player' },
    { defId: 'court_mage', star: 2, col: 3, row: 7, team: 'player' },
    { defId: 'wood_ranger', star: 1, col: 1, row: 7, team: 'player' },
    { defId: 'shadow_dancer', star: 1, col: 5, row: 7, team: 'player' },
    { defId: 'field_medic', star: 1, col: 6, row: 6, team: 'player' },
    // enemy comp (top half)
    { defId: 'hellguard', star: 2, col: 3, row: 1, team: 'enemy' },
    { defId: 'warlock', star: 1, col: 2, row: 0, team: 'enemy' },
    { defId: 'imp_assassin', star: 2, col: 5, row: 1, team: 'enemy' },
    { defId: 'fel_archer', star: 1, col: 4, row: 0, team: 'enemy' },
  ],
  bench: ['lich', 'wood_ranger', null, 'thornguard', null, null, null, null, null],
  shop: ['skeleton_archer', 'court_mage', 'shadow_dancer', 'moon_priestess', 'dragon_knight'],
};

function unitNode(u) {
  const def = UNITS_BY_ID[u.defId];
  const node = el(`.unit.team-${u.team}`, { dataset: { star: u.star, id: u.defId } });
  node.style.transform = `translate(${u.col * 100}%, ${u.row * 100}%)`;
  node.append(
    el('.stars', {}, '★'.repeat(u.star)),
    el('.frame', { html: championSVG(def, { size: 60 }) }),
    el('.bars', {}, [
      el('.bar.hp', {}, [el('.trail'), el('.fill')]),
      el('.bar.mana', {}, [el('.fill', { style: { transform: 'scaleX(0.4)' } })]),
    ]),
  );
  // set hp/mana fills
  node.querySelector('.bar.hp .fill').style.transform = 'scaleX(1)';
  node.querySelector('.bar.hp .trail').style.transform = 'scaleX(1)';
  return node;
}

function buildBoard() {
  const stage = el('.stage');
  const wrap = el('.board-wrap');
  const tiles = el('.tiles');
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const zone = r < 4 ? 'enemy-zone' : 'player-zone';
      tiles.append(el(`.tile.${zone}${(r + c) % 2 ? ' alt' : ''}`, { dataset: { col: c, row: r } }));
    }
  }
  const units = el('.units');
  for (const u of sample.board) units.append(unitNode(u));
  wrap.append(tiles, el('.midline'), units, el('.fx-dom'));
  stage.append(wrap);
  return stage;
}

function buildTraits() {
  const playerDefs = sample.board.filter((u) => u.team === 'player').map((u) => UNITS_BY_ID[u.defId]);
  const active = activeTraits(playerDefs);
  const rail = el('.traits-rail');
  // sort: active first, by count desc
  const entries = Object.entries(active).sort((a, b) => (b[1].tier - a[1].tier) || (b[1].count - a[1].count));
  for (const [t, info] of entries) {
    const def = TRAITS[t];
    const tierIdx = def.breakpoints.indexOf(info.tier) + 1;
    rail.append(el(`.trait-chip${info.tier ? ' active tier-' + tierIdx : ''}`, {}, [
      el('span.dot', { style: { background: def.color } }),
      el('span', {}, def.name),
      el('span.cnt', {}, `${info.count}`),
    ]));
  }
  return rail;
}

function buildShop() {
  const row = el('.shop-row');
  for (const id of sample.shop) {
    const def = id && UNITS_BY_ID[id];
    if (!def) { row.append(el('.shop-card.empty')); continue; }
    const owned = sample.board.some((u) => u.defId === id) || sample.bench.includes(id);
    row.append(el(`.shop-card.cost-${def.cost}${owned ? ' owned' : ''}`, {}, [
      el('span.price', {}, `${def.cost}⛁`),
      el('.art', { html: championSVG(def, { size: 46 }) }),
      el('.nm', {}, def.name),
      el('.tags', {}, `${TRAITS[def.origin].name} · ${TRAITS[def.klass].name}`),
    ]));
  }
  const controls = el('.shop-controls', {}, [
    el('button.btn.primary', {}, [el('span', {}, 'Buy XP'), el('span', { style: { opacity: .7 } }, '4⛁')]),
    el('button.btn.reroll', {}, [el('span', {}, '⟳ Reroll'), el('span', { style: { opacity: .7 } }, '2⛁')]),
  ]);
  return el('.shop', {}, [controls, row]);
}

function buildBench() {
  const bench = el('.bench');
  for (const id of sample.bench) {
    const slot = el(`.slot${id ? ' filled' : ''}`);
    if (id) slot.append(el('.frame', { html: championSVG(UNITS_BY_ID[id], { size: 38 }) }));
    bench.append(slot);
  }
  return bench;
}

function render() {
  const game = el('.game', {}, [
    el('.topbar', {}, [
      el('.stat-pill.gold', {}, [el('span.ico', {}, '⛁'), el('span', {}, sample.gold)]),
      el('.stat-pill.hp', {}, [el('span.ico', {}, '♥'), el('span', {}, sample.hp)]),
      el('.stat-pill', {}, [el('span.lives', {}, '❤'.repeat(sample.lives)), el('span', { style: { color: 'var(--hp)' } }, ` ${sample.wins}W`)]),
      el('.stat-pill.round', {}, sample.round),
    ]),
    el('.topbar', {}, [
      el('.stat-pill', {}, [el('span', { style: { color: 'var(--gold)' } }, `Lv ${sample.level}`)]),
      el('.xpbar', {}, el('.fill', { style: { transform: `scaleX(${sample.xp / sample.xpMax})` } })),
    ]),
    buildTraits(),
    el('.phase-banner', {}, 'PLANNING — arrange your warband'),
    buildBoard(),
    el('.combat-ctl', {}, [
      el('button.btn.primary', { style: { fontSize: '15px', padding: '10px 24px' } }, '⚔ Ready'),
    ]),
    buildBench(),
    buildShop(),
  ]);
  $('#app').replaceChildren(game);
}

render();
console.log('[warbound] M0 shell rendered.', UNITS.length, 'units in roster');
