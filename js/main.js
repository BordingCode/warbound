// Warbound — game loop. Planning phase (interactive shop/bench/board + drag) → combat
// (sim + timeline playback) → resolve → next round, until 10 wins or 0 lives.
import { el, $, $$ } from './dom.js';
import { UNITS, UNITS_BY_ID, statsForStar } from './data/units.js';
import { TRAITS, activeTraits } from './data/traits.js';
import { championSVG } from './svg.js';
import { simulate } from './sim/combat.js';
import { hashSeed } from './rng.js';
import { CombatPlayer } from './render/player.js';
import { createDragController } from './input/drag.js';
import { getEnemyBoard } from './data/enemies.js';
import { COMPONENTS, itemDef, itemLabel } from './data/items.js';
import { AUGMENTS, TIER_LABEL, augmentBundle } from './data/augments.js';
import * as Run from './state/run.js';
import { resume as audioResume, Sfx, setEnabled as setSound, isEnabled as soundOn } from './audio/audio.js';
import { launchConfetti } from './render/fx.js';

let run = Run.load() || Run.freshRun();
let combatSpeed = 1;
let inCombat = false;
let dragCtl = null;
let player = null;
let prevTraitTiers = {};   // for flashing synergy chips when they level up

// ---------- board ----------
function unitNode(u, team) {
  const def = UNITS_BY_ID[u.defId];
  const node = el(`.unit.team-${team}`, { dataset: { star: u.star, uid: u.uid || '' } });
  node.style.transform = `translate(${u.col * 100}%, ${u.row * 100}%)`;
  node.style.zIndex = u.row + 1;            // Y-sort: lower rows draw on top
  node.append(
    el('.base'),
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
  if (!inCombat) {
    for (const u of run.board) units.append(unitNode(u, 'player'));
    // scout: dimmed preview of the upcoming enemy board so the player can counter-position
    const enemy = getEnemyBoard(run.round, null);
    for (const e of enemy.units) {
      const n = unitNode(e, 'enemy');
      n.classList.add('preview');
      units.append(n);
    }
  }
  wrap.append(tiles, el('.midline'), units, el('.fx-dom'));
  stage.append(wrap);
  return { stage, wrap, units };
}

// ---------- traits ----------
function buildTraitsEl() {
  const defs = run.board.map((u) => UNITS_BY_ID[u.defId]);
  const active = activeTraits(defs, augmentBundle(run.augments).traitBonus);
  const rail = el('.traits-rail');
  const entries = Object.entries(active).filter(([t]) => TRAITS[t]).sort((a, b) => (b[1].tier - a[1].tier) || (b[1].count - a[1].count));
  if (!entries.length) rail.append(el('.trait-chip', {}, 'Place champions to form synergies'));
  const tiers = {};
  for (const [t, info] of entries) {
    const def = TRAITS[t];
    const tierIdx = def.breakpoints.indexOf(info.tier) + 1;
    const next = def.breakpoints.find((b) => b > info.count);
    tiers[t] = info.tier;
    const leveledUp = info.tier > 0 && info.tier !== (prevTraitTiers[t] || 0);
    rail.append(el(`.trait-chip${info.tier ? ' active tier-' + tierIdx : ''}${leveledUp ? ' flash' : ''}`, { onclick: () => showTraitInfo(t) }, [
      el('span.dot', { style: { background: def.color } }),
      el('span', {}, def.name),
      el('span.cnt', {}, next ? `${info.count}/${next}` : `${info.count}`),
    ]));
  }
  prevTraitTiers = tiers;
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
      el('button.card-info', { onclick: (e) => { e.stopPropagation(); showUnitInfo(def, 1, []); } }, 'ⓘ'),
      el('.art', { html: championSVG(def, { size: 46 }) }),
      el('.nm', {}, def.name),
      el('.tags', {}, `${TRAITS[def.origin].name} · ${TRAITS[def.klass].name}`),
    ]);
    row.append(card);
  });
  const inc = Run.income(run);
  const controls = el('.shop-controls', {}, [
    el('button.btn.primary', { onclick: doBuyXP }, [el('span', {}, 'Buy XP'), el('span', { style: { opacity: .7 } }, '4⛁')]),
    el('button.btn.reroll', { onclick: doReroll }, [el('span', {}, '⟳'), el('span', { style: { opacity: .7 } }, Run.freeRerollsLeft(run) > 0 ? 'FREE' : '2⛁')]),
    el(`button.btn${run.shopLocked ? ' primary' : ''}`, { title: 'Freeze the shop so it keeps these champions next round', onclick: doLock }, run.shopLocked ? '🔒' : '🔓'),
    el('button.econ-info', { style: { marginLeft: 'auto' }, onclick: showEconomyInfo }, [el('span', {}, `+${inc.total}⛁/turn`), el('span', { style: { opacity: .7 } }, 'ⓘ')]),
  ]);
  return el(`.shop${run.shopLocked ? ' locked' : ''}`, {}, [controls, row]);
}

function buildEnemyScout(enemy) {
  const defs = enemy.units.map((u) => UNITS_BY_ID[u.defId]);
  const active = Object.entries(activeTraits(defs)).filter(([t, i]) => TRAITS[t] && i.tier > 0)
    .sort((a, b) => b[1].count - a[1].count).slice(0, 4);
  const row = el('.enemy-scout');
  row.append(el('span.scout-label', {}, '👁 Foe:'));
  if (!active.length) row.append(el('span', { style: { color: 'var(--ink-faint)', fontSize: '11px' } }, 'no synergies'));
  for (const [t, info] of active) {
    const def = TRAITS[t];
    row.append(el('.trait-chip.active', { style: { opacity: .85 }, onclick: () => showTraitInfo(t) }, [
      el('span.dot', { style: { background: def.color } }), el('span', {}, def.name), el('span.cnt', {}, info.count),
    ]));
  }
  return row;
}

function buildItemsTray() {
  const tray = el('.items-tray');
  tray.append(el('span.tray-label', {}, '🎒'));
  if (!run.items.length) { tray.append(el('span', { style: { color: 'var(--ink-faint)', fontSize: '11px' } }, 'No items — win rounds to earn them. Drag an item onto a champion.')); return tray; }
  for (const it of run.items) {
    const d = itemDef(it.id);
    tray.append(el('.item-chip', { dataset: { iid: it.iid }, title: d.name }, d.icon));
  }
  return tray;
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
function doLock() { run.shopLocked = !run.shopLocked; Run.save(run); Sfx.click(); renderPlanning(); }

// ---------- planning render ----------
function renderPlanning() {
  inCombat = false;
  const enemy = getEnemyBoard(run.round, null);
  const boardLimitTxt = `${run.board.length}/${Run.boardLimit(run)}`;
  const { stage, wrap, units } = buildBoardEl();

  const game = el('.game', {}, [
    el('.topbar', {}, [
      el('.stat-pill.gold', {}, [el('span.ico', {}, '⛁'), el('span', {}, run.gold)]),
      el(`.stat-pill${run.lives <= 2 ? ' danger' : ''}`, {}, [el('span.lives', {}, '❤'.repeat(run.lives)), el('span', { style: { color: 'var(--hp)', marginLeft: '4px' } }, `${run.wins}/10`)]),
      el('.stat-pill.round', {}, `Rd ${run.round}`),
      el('button.btn', { style: { padding: '5px 10px' }, onclick: () => showCodex('units') }, '📖'),
      el(`button.btn#shakeBtn${motionOn() ? ' primary' : ''}`, { style: { padding: '5px 10px' }, title: 'Screen shake (turn off if the game feels laggy)', onclick: toggleMotion }, '💥'),
      el('button.btn#soundBtn', { style: { padding: '5px 10px' }, onclick: toggleSound }, soundOn() ? '🔊' : '🔇'),
      el('button.btn', { style: { padding: '5px 10px' }, onclick: showHelp }, '?'),
    ]),
    el('.topbar', { style: { cursor: 'pointer' }, onclick: showEconomyInfo }, [
      el('.stat-pill', {}, [el('span', { style: { color: 'var(--gold)' } }, `Lv ${run.level}`), el('span', { style: { color: 'var(--ink-dim)', fontSize: '11px' } }, ` · ${boardLimitTxt} units`)]),
      el('.xpbar', { title: 'XP to next level (+2 each round)' }, el('.fill', { style: { transform: `scaleX(${Run.xpNeeded(run) ? run.xp / Run.xpNeeded(run) : 1})` } })),
      el('span', { style: { fontSize: '10px', color: 'var(--ink-dim)', whiteSpace: 'nowrap' } }, Run.xpNeeded(run) ? `${run.xp}/${Run.xpNeeded(run)} ⓘ` : 'MAX'),
    ]),
    run.augments.length ? el('.relic-bar', {}, run.augments.map((id) => el(`span.relic tier-${AUGMENTS[id].tier}`, { title: `${AUGMENTS[id].name}: ${AUGMENTS[id].desc}`, onclick: () => showAugmentInfo(id) }, AUGMENTS[id].icon))) : null,
    buildTraitsEl(),
    el('.phase-banner', {}, `Next: ${enemy.name} — ${enemy.traitHint}`),
    buildEnemyScout(enemy),
    stage,
    el('.combat-ctl', {}, [
      el('button.btn.primary#readyBtn', { style: { fontSize: '15px', padding: '10px 22px' }, onclick: startCombat }, '⚔ Ready'),
      el('button.btn#spd1', { onclick: () => setSpeed(1) }, '1×'),
      el('button.btn#spd2', { onclick: () => setSpeed(2) }, '2×'),
      el('button.btn#spd4', { onclick: () => setSpeed(4) }, '4×'),
      el('.sell-zone#sellZone', { style: { marginLeft: 'auto' } }, '🗑 Sell'),
    ]),
    buildItemsTray(),
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
    onEquip: (iid, col, row) => { const u = run.board.find((b) => b.col === col && b.row === row); if (u && Run.equipItem(run, iid, u.uid)) { Sfx.fuse(); act(() => {}); } },
    onInspect: (uid) => showInspect(uid),
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
  $$('.items-tray .item-chip').forEach((c) => {
    const iid = c.dataset.iid; const it = run.items.find((x) => x.iid === iid);
    if (it) dragCtl.makeDraggable(c, iid, 'item', `<div class="item-ghost">${itemDef(it.id).icon}</div>`);
  });
}

// post-round item draft (Underlords-style pick 1 of 3 components)
function offerDraft(after) {
  const ids = Run.draftComponents(run);
  const pick = (id) => { Run.addItem(run, id); Run.save(run); Sfx.buy(); document.querySelector('.overlay')?.remove(); after ? after() : renderPlanning(); };
  const ov = el('.overlay', {}, el('.help-card', {}, [
    el('h2', {}, 'Choose a component'),
    el('.sub', {}, 'Combine two on a champion to forge a powerful item.'),
    el('.draft-row', {}, ids.map((id) => {
      const d = COMPONENTS[id];
      return el('button.draft-pick', { onclick: () => pick(id) }, [
        el('span.di', {}, d.icon), el('span.dn', {}, d.name),
        el('span.dm', {}, Object.entries(d.mods).map(([k, v]) => `+${v < 1 ? Math.round(v * 100) + '%' : v} ${k}`).join(', ')),
      ]);
    })),
  ]));
  document.body.append(ov);
}
function shouldDraft(finishedRound) { return [1, 2, 5, 7, 10].includes(finishedRound); }
function shouldAugment(finishedRound) { return [3, 6, 9].includes(finishedRound); }

// Augment draft (pick 1 of 3 run-shaping powers), with skip-for-gold, banish, reroll.
function offerAugment(after) {
  const SKIP_GOLD = 4;
  const done = () => { Run.save(run); document.querySelector('.overlay')?.remove(); after ? after() : renderPlanning(); };
  const render = () => {
    const existing = document.querySelector('.overlay'); if (existing) existing.remove();
    const ids = Run.draftAugments(run);
    if (!ids.length) { done(); return; }
    const pick = (id) => { Run.addAugment(run, id); Sfx.fuse(); done(); };
    const banish = (id, e) => { e.stopPropagation(); if (Run.banishAugment(run, id)) { Sfx.click(); Run.save(run); render(); } };
    const ov = el('.overlay', {}, el('.help-card', { style: { maxWidth: '360px', width: '92%' } }, [
      el('h2', {}, '✦ Choose an Augment'),
      el('.sub', {}, `A run-shaping power (offer ${Math.min(run.augments.length + 1, 3)} of 3).`),
      el('.draft-row.relics', {}, ids.map((id) => {
        const a = AUGMENTS[id];
        const card = el(`button.draft-pick aug-${a.tier}`, { onclick: () => pick(id) }, [
          el('.aug-tier', {}, `${TIER_LABEL[a.tier]} · ${a.cat}`),
          el('span.di', {}, a.icon), el('span.dn', {}, a.name), el('span.dm', {}, a.desc),
        ]);
        if ((run.banishLeft || 0) > 0) card.append(el('button.aug-banish', { title: 'Banish (remove from this run\'s offers)', onclick: (e) => banish(id, e) }, '🚫'));
        return card;
      })),
      el('.draft-tools', {}, [
        el('button.btn', { onclick: () => { run.gold += SKIP_GOLD; Sfx.sell(); done(); } }, `Skip (+${SKIP_GOLD}⛁)`),
        (run.augRerollLeft || 0) > 0 ? el('button.btn', { onclick: () => { run.augRerollLeft--; Sfx.click(); render(); } }, `⟳ Reroll (${run.augRerollLeft})`) : null,
        (run.banishLeft || 0) > 0 ? el('span', { style: { fontSize: '10px', color: 'var(--ink-faint)', alignSelf: 'center' } }, `🚫 ${run.banishLeft} banish`) : null,
      ]),
    ]));
    document.body.append(ov);
  };
  render();
}

// Quick augment detail popup (from the augment bar).
function showAugmentInfo(id) {
  const a = AUGMENTS[id]; if (!a) return; Sfx.click();
  const ov = el('.overlay', { onclick: (e) => { if (e.target.classList.contains('overlay')) e.currentTarget.remove(); } },
    el('.help-card', { style: { maxWidth: '300px' } }, [
      el('h2', { style: { fontSize: '19px' } }, `${a.icon} ${a.name}`),
      el('.sub', {}, `${TIER_LABEL[a.tier]} · ${a.cat}`),
      el('p', { style: { fontSize: '13.5px', lineHeight: '1.4' } }, a.desc),
      el('button.btn.primary.go', { onclick: () => ov.remove() }, 'Close'),
    ]));
  document.body.append(ov);
}

function showInspect(uid) {
  const u = run.board.find((b) => b.uid === uid) || run.bench.find((b) => b && b.uid === uid);
  if (u) showUnitInfo(UNITS_BY_ID[u.defId], u.star, u.items);
}
// Reusable champion detail sheet (used by inspect, shop (i), and the codex).
function showUnitInfo(def, star = 1, items = []) {
  const s = statsForStar(def, star);
  Sfx.click();
  const row = (label, val) => el('.istat', {}, [el('span', { style: { color: 'var(--ink-dim)' } }, label), el('span', {}, val)]);
  const ov = el('.overlay', { onclick: (e) => { if (e.target.classList.contains('overlay')) e.currentTarget.remove(); } },
    el('.help-card', { style: { maxWidth: '320px' } }, [
      el('h2', { style: { fontSize: '19px' } }, `${def.name} ${star > 1 ? '★'.repeat(star) : ''}`),
      el('.unit-traits', {}, [TRAITS[def.origin], TRAITS[def.klass]].map((t) => el('.trait-chip.active', { onclick: () => showTraitInfo(t === TRAITS[def.origin] ? def.origin : def.klass) }, [el('span.dot', { style: { background: t.color } }), el('span', {}, t.name)]))),
      el('.sub', {}, `Cost ${def.cost}⛁ · ${def.range === 1 ? 'melee' : 'ranged ' + def.range}`),
      el('.istats', {}, [
        row('Health', s.hp), row('Attack', s.ad), row('Atk speed', s.as.toFixed(2)),
        row('Armor', s.armor), row('Magic res', s.mr), row('Mana', def.maxMana),
      ]),
      el('.iability', {}, [el('b', {}, `✦ ${def.ability.name} `), el('span', { style: { color: 'var(--ink-dim)' } }, abilityText(def.ability))]),
      (items && items.length) ? el('.iitems', {}, ['Items: ', items.map((id) => itemLabel(id)).join(', ')]) : null,
      el('button.btn.primary.go', { onclick: () => ov.remove() }, 'Close'),
    ]));
  document.body.append(ov);
}
// Trait detail: every breakpoint's effect (active one highlighted) + which champions have it.
function showTraitInfo(traitId) {
  const def = TRAITS[traitId]; if (!def) return;
  Sfx.click();
  const owned = new Set(run.board.map((u) => u.defId).concat(run.bench.filter(Boolean).map((u) => u.defId)));
  const playerDefs = run.board.map((u) => UNITS_BY_ID[u.defId]);
  const active = activeTraits(playerDefs, augmentBundle(run.augments).traitBonus)[traitId];
  const curTier = active ? active.tier : 0;
  const members = UNITS.filter((u) => u.origin === traitId || u.klass === traitId);
  const ov = el('.overlay', { onclick: (e) => { if (e.target.classList.contains('overlay')) e.currentTarget.remove(); } },
    el('.help-card', { style: { maxWidth: '330px' } }, [
      el('h2', { style: { fontSize: '19px', color: def.color } }, `${def.name}`),
      el('.sub', {}, `${def.axis === 'origin' ? 'Origin' : 'Class'} · ${def.desc}`),
      el('.tiers', {}, def.breakpoints.map((bp) => el(`.tier-row${bp === curTier ? ' on' : ''}`, {}, [
        el('span.tier-n', {}, `${bp}`), el('span', {}, def.bonusText[bp] || ''),
      ]))),
      el('.sub', { style: { marginTop: '8px' } }, `Champions (${active ? active.count : 0} on your board):`),
      el('.trait-members', {}, members.map((m) => el(`.tmem${owned.has(m.defId) ? ' owned' : ''}`, { onclick: () => showUnitInfo(m, 1, []) }, [el('.tmem-art', { html: championSVG(m, { size: 30 }) }), el('span', {}, m.name)]))),
      el('button.btn.primary.go', { onclick: () => ov.remove() }, 'Close'),
    ]));
  document.body.append(ov);
}
// Codex: browse all champions + traits anytime. Reuses showUnitInfo / showTraitInfo.
function showCodex(tab = 'units') {
  Sfx.click();
  const body = el('.codex-body');
  const render = (which) => {
    body.replaceChildren();
    if (which === 'units') {
      const grid = el('.codex-grid');
      [...UNITS].sort((a, b) => a.cost - b.cost).forEach((u) => grid.append(
        el(`.codex-cell.cost-${u.cost}`, { onclick: () => showUnitInfo(u, 1, []) }, [
          el('.art', { html: championSVG(u, { size: 40 }) }), el('.nm', {}, u.name),
        ])));
      body.append(grid);
    } else if (which === 'traits') {
      const list = el('.codex-list');
      for (const [id, t] of Object.entries(TRAITS)) list.append(
        el('.trait-chip.active', { style: { justifyContent: 'flex-start' }, onclick: () => showTraitInfo(id) }, [
          el('span.dot', { style: { background: t.color } }), el('span', {}, t.name),
          el('span', { style: { color: 'var(--ink-faint)', fontSize: '10px', marginLeft: 'auto' } }, t.axis),
        ]));
      body.append(list);
    } else {
      const list = el('.codex-list');
      const order = { common: 0, rare: 1, prismatic: 2 };
      for (const [id, a] of Object.entries(AUGMENTS).sort((x, y) => order[x[1].tier] - order[y[1].tier])) list.append(
        el(`.aug-row tier-${a.tier}`, { onclick: () => showAugmentInfo(id) }, [
          el('span.aug-ic', {}, a.icon), el('span', { style: { fontWeight: 700 } }, a.name),
          el('span', { style: { color: 'var(--ink-faint)', fontSize: '10px', marginLeft: 'auto' } }, TIER_LABEL[a.tier]),
        ]));
      body.append(list);
    }
  };
  const tabs = el('.codex-tabs');
  const tabDefs = [['units', `Champions (${UNITS.length})`], ['traits', `Synergies (${Object.keys(TRAITS).length})`], ['augments', `Augments (${Object.keys(AUGMENTS).length})`]];
  const tabBtns = tabDefs.map(([key, label]) => el(`button.btn${tab === key ? ' primary' : ''}`, { onclick: () => { tab = key; tabBtns.forEach((b, i) => b.classList.toggle('primary', tabDefs[i][0] === key)); render(key); } }, label));
  tabs.append(...tabBtns);
  render(tab);
  const ov = el('.overlay', { onclick: (e) => { if (e.target.classList.contains('overlay')) e.currentTarget.remove(); } },
    el('.help-card', { style: { maxWidth: '360px', width: '92%' } }, [
      el('h2', { style: { fontSize: '20px' } }, '📖 Codex'),
      tabs, body,
      el('button.btn.primary.go', { onclick: () => ov.remove() }, 'Close'),
    ]));
  document.body.append(ov);
}

function abilityText(a) {
  if (a.type === 'magic') return `deals magic damage${a.target === 'cluster' ? ' in an area' : ''} (scales with Ability Power).`;
  if (a.type === 'physical') return a.target === 'lowestEnemyHP' ? 'executes the weakest enemy.' : a.target === 'mostEnemies' ? 'strikes several foes.' : a.stun ? 'smashes and stuns its target.' : 'cleaves nearby foes.';
  if (a.type === 'heal') return 'heals the most wounded ally.';
  if (a.type === 'shield') return 'shields the most wounded ally.';
  if (a.type === 'summon') return 'raises a creature to fight for you.';
  return '';
}

function setSpeed(s) { combatSpeed = s; if (player) player.setSpeed(s); highlightSpeed(); }
function highlightSpeed() { for (const s of [1, 2, 4]) { const b = $(`#spd${s}`); if (b) b.classList.toggle('primary', combatSpeed === s); } }
function setBanner(t) { const b = $('.phase-banner'); if (b) b.textContent = t; }
function toggleSound() { audioResume(); setSound(!soundOn()); const b = $('#soundBtn'); if (b) b.textContent = soundOn() ? '🔊' : '🔇'; if (soundOn()) Sfx.click(); }
function motionOn() { try { return localStorage.getItem('warbound_shake') !== '0'; } catch { return true; } }
function toggleMotion() { try { localStorage.setItem('warbound_shake', motionOn() ? '0' : '1'); } catch {} Sfx.click(); renderPlanning(); }

// Explain the economy with the player's CURRENT live values.
function showEconomyInfo() {
  Sfx.click();
  const inc = Run.income(run);
  const interestNext = 10 - (run.gold % 10);
  const row = (label, val, hint) => el('.econ-row', {}, [el('span', { style: { fontWeight: 700 } }, label), el('span', {}, val), hint ? el('.econ-hint', {}, hint) : null]);
  const ov = el('.overlay', { onclick: (e) => { if (e.target.classList.contains('overlay')) e.currentTarget.remove(); } },
    el('.help-card', { style: { maxWidth: '340px' } }, [
      el('h2', { style: { fontSize: '20px' } }, '⛁ Economy'),
      el('.sub', {}, `You earn gold at the end of every round. This round you'll get +${inc.total}.`),
      el('.econ-rows', {}, [
        row('Base income', `+${inc.base}`, 'Grows a little as the game goes on.'),
        row('Interest', `+${inc.interest}`, `+1 gold per 10 saved (max +5). Save ${interestNext} more to reach the next +1.`),
        row('Win/loss streak', inc.streakBonus ? `+${inc.streakBonus}` : '+0', 'Win OR lose 2+ in a row for bonus gold — losing streaks help you recover.'),
        row('Win bonus', '+1', 'Extra gold each round you win.'),
      ]),
      el('.sub', { style: { marginTop: '6px' } }, 'Spending'),
      el('.econ-rows', {}, [
        row('Buy champion', '3–5⛁', 'Buy 3 of the same to fuse into ★★ (then ★★★).'),
        row('Reroll shop', '2⛁', 'New shop choices. Freeze 🔒 to keep them next round.'),
        row('Buy XP', '4⛁', 'Levels you up faster (see below).'),
      ]),
      el('.sub', { style: { marginTop: '6px' } }, 'Levels & XP'),
      el('.econ-rows', {}, [
        row('Passive XP', '+2 / round', `You gain XP automatically every round (now ${run.xp}/${Run.xpNeeded(run)} to Lv ${run.level + 1}).`),
        row('Your level', `Lv ${run.level}`, `Your level = how many champions you can place on the board (${Run.boardLimit(run)} now). Higher level also unlocks stronger champions in the shop.`),
      ]),
      el('button.btn.primary.go', { onclick: () => ov.remove() }, 'Got it'),
    ]));
  document.body.append(ov);
}

function showHelp() {
  const tips = [
    ['🛒', '<b>Buy champions</b> from the shop (bottom) — tap a card. Each costs gold ⛁.'],
    ['✋', '<b>Drag</b> champions from your bench onto the board to deploy them. Drag to 🗑 to sell.'],
    ['🔗', '<b>Synergies:</b> matching <b>Origins</b> (Undead, Elf, Dragon…) & <b>Classes</b> (Knight, Mage…) unlock team bonuses — see the bar near the top.'],
    ['⭐', '<b>3 copies</b> of the same champion auto-fuse into a stronger ★★ (then ★★★).'],
    ['🛡️', '<b>Position matters:</b> tanks in front, fragile carries in back. Then press ⚔ Ready.'],
    ['🔍', '<b>Tap a champion</b> to inspect its stats & ability. Watch the dimmed enemy preview to counter them.'],
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
  const { events, result } = simulate(playerBoard, enemyBoard, seed, { aug: { player: augmentBundle(run.augments) } });

  // hide planning-only controls, keep board
  $$('.bench .slot, .shop, .combat-ctl .btn:not(#readyBtn)').forEach(() => {});
  const ready = $('#readyBtn'); if (ready) { ready.disabled = true; ready.textContent = '⚔ Fighting…'; }
  setBanner(`⚔ vs ${enemy.name}`);

  player = new CombatPlayer($('.units'), $('.fx-dom'));
  const winner = await player.play(events, { speed: combatSpeed });
  const won = winner === 'player';
  won ? Sfx.victory() : Sfx.defeat();
  if (won) launchConfetti(2000);
  const sv = result.survivors;
  setBanner(won ? `🏆 Round won! (${sv.player} survived)` : winner === 'enemy' ? `💀 Round lost — ${sv.enemy} enemies left` : '⚖ Draw — counts as a loss');

  const finishedRound = run.round;
  Run.resolveRound(run, won);
  Run.save(run);
  setTimeout(() => {
    if (run.over) endScreen();
    else if (shouldAugment(finishedRound)) offerAugment(renderPlanning);
    else if (shouldDraft(finishedRound)) offerDraft(renderPlanning);
    else renderPlanning();
  }, 1100);
}

function endScreen() {
  const won = run.won;
  if (won) launchConfetti(4000);
  const stat = (label, val) => el('.istat', { style: { minWidth: '120px' } }, [el('span', { style: { color: 'var(--ink-dim)' } }, label), el('span', {}, val)]);
  const card = el('.endscreen', {}, [
    el('h1', { style: { fontSize: '34px', margin: '0' } }, won ? '🏆 VICTORY' : '⚔ RUN OVER'),
    el('p', { style: { color: 'var(--ink-dim)', margin: '0' } }, won ? `You won with ${run.lives} ❤ to spare — a true warlord!` : `A valiant effort. Tune your warband and try again!`),
    el('.istats', { style: { maxWidth: '280px' } }, [stat('Wins', `${run.wins} / 10`), stat('Rounds', run.round - 1)]),
    run.augments.length ? el('div', {}, [el('div', { style: { color: 'var(--ink-dim)', fontSize: '12px', marginBottom: '4px' } }, 'Augments gathered'), el('.relic-bar', { style: { justifyContent: 'center' } }, run.augments.map((id) => el(`span.relic tier-${AUGMENTS[id].tier}`, { title: AUGMENTS[id].name }, AUGMENTS[id].icon)))]) : null,
    el('button.btn.primary', { style: { fontSize: '16px', padding: '12px 28px' }, onclick: () => { run = Run.freshRun(); Run.save(run); renderPlanning(); } }, '↻ New Run'),
  ]);
  $('#app').replaceChildren(el('.game', { style: { alignItems: 'center', justifyContent: 'center', minHeight: '85svh', textAlign: 'center', gap: '14px' } }, [card]));
}

renderPlanning();
if (!seenIntro()) showHelp();
// Debug hook (also the seed of a future debug menu): inspect/drive state from console.
window.__wb = {
  get run() { return run; }, Run,
  render: renderPlanning, fight: startCombat,
  place: (uid, c, r) => act(() => Run.placeOnBoard(run, uid, c, r)),
  giveGold: (n) => act(() => (run.gold += n)),
  inspect: (uid) => showInspect(uid),
  end: () => endScreen(),
  sim: (board, round) => simulate(board, getEnemyBoard(round || run.round, null).units.map(({ defId, star, col, row }) => ({ defId, star, col, row })), hashSeed(run.seed, round || run.round), { aug: { player: augmentBundle(run.augments) } }),
};
console.log('[warbound] game loop ready. Round', run.round, '| board limit', Run.boardLimit(run));
