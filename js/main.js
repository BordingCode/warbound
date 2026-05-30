// Warbound — game loop. Planning phase (interactive shop/bench/board + drag) → combat
// (sim + timeline playback) → resolve → next round, until 10 wins or 0 lives.
import { el, $, $$ } from './dom.js';
import { UNITS, UNITS_BY_ID, statsForStar } from './data/units.js';
import { TRAITS, activeTraits } from './data/traits.js';
import { championSVG } from './svg.js';
import { ic, iconEl, crest, rankMedal } from './icons.js';
import { simulate } from './sim/combat.js';
import { hashSeed } from './rng.js';
import { CombatPlayer } from './render/player.js';
import { createDragController } from './input/drag.js';
import { getEnemyBoard, pathChoices } from './data/enemies.js';
import { COMPONENTS, itemDef, itemLabel } from './data/items.js';
import { AUGMENTS, TIER_LABEL, augmentBundle } from './data/augments.js';
import * as Run from './state/run.js';
import * as Bots from './state/bots.js';
import * as Rank from './state/rank.js';
import * as Meta from './state/meta.js';
import { resume as audioResume, Sfx, setEnabled as setSound, isEnabled as soundOn } from './audio/audio.js';
import { launchConfetti } from './render/fx.js';

let run = null;            // set by boot (solo resume) or a mode start
let lobby = null;          // ladder-mode warlord lobby
let combatSpeed = 1;
let inCombat = false;
let dragCtl = null;
let player = null;
let prevTraitTiers = {};   // for flashing synergy chips when they level up

const LOBBY_KEY = 'warbound_lobby_v1';
function saveLobby() { try { if (lobby) localStorage.setItem(LOBBY_KEY, JSON.stringify(Bots.serializeLobby(lobby))); } catch {} }
function clearLobby() { try { localStorage.removeItem(LOBBY_KEY); } catch {} }
function persist() { Run.save(run); if (run.mode === 'ladder') saveLobby(); }

// Who am I fighting this round: the matched warlord (ladder) or the authored gym ladder (solo).
function getOpponent() {
  if (run.mode === 'ladder' && lobby && lobby.opponent) {
    const o = lobby.opponent;
    return {
      name: o.ghost ? 'Battle Echo' : o.name,
      traitHint: o.ghost ? 'a mirror of a rival warband' : o.style.desc,
      units: (o.board || []).map((u) => ({ ...u })),
    };
  }
  // Warpath: the foe is keyed to WINS, not the round — you only advance to the next warband when
  // you beat the current one. A loss replays the SAME foe (while your round/economy keeps growing
  // so you can break the wall), costing a life rather than skipping you past an undefeated enemy.
  // Past act 1 the chosen path adds difficulty + themes the reinforcements.
  return getEnemyBoard(run.wins + 1, null, { diff: run.pathDiff || 0, pool: run.pathPool, name: (run.act || 1) > 1 ? run.pathName : null });
}

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
    const enemy = getOpponent();
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
  const active = activeTraits(defs, teamTraitBonus());
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
    el(`button.btn${run.shopLocked ? ' primary' : ''}`, { title: 'Freeze the shop so it keeps these champions next round', onclick: doLock, html: ic(run.shopLocked ? 'lock' : 'unlock') }),
    el('button.econ-info', { style: { marginLeft: 'auto' }, onclick: showEconomyInfo }, [el('span', {}, `+${inc.total}⛁/turn`), el('span', { style: { opacity: .7 } }, 'ⓘ')]),
  ]);
  return el(`.shop${run.shopLocked ? ' locked' : ''}`, {}, [controls, row]);
}

// ladder info bar: this match's lobby-wide modifier + your chosen warlord power (tappable)
function buildLobbyBar() {
  if (!lobby) return null;
  const bar = el('.lobby-bar');
  const pw = Bots.POWERS[lobby.human.powerId];
  if (pw) bar.append(el('.lobby-chip.power', { title: `${pw.name}: ${pw.desc}`, onclick: () => showWarlordInfo(lobby.human) }, [el('span.lc-ic', { html: ic(pw.icon) }), el('span', {}, pw.name)]));
  const m = lobby.modifier;
  if (m && m.id !== 'none') bar.append(el('.lobby-chip.mod', { title: m.desc, onclick: () => modal2(m.name, m.desc) }, [el('span.lc-ic', { html: ic(m.icon) }), el('span', {}, m.name)]));
  return bar.children.length ? bar : null;
}
// tiny info popup
function modal2(title, body) {
  const ov = el('.overlay', { onclick: (e) => { if (e.target.classList.contains('overlay')) e.currentTarget.remove(); } },
    el('.help-card', { style: { maxWidth: '300px' } }, [el('h2', { style: { fontSize: '19px' } }, title), el('p', { style: { fontSize: '13.5px', lineHeight: '1.4' } }, body), el('button.btn.primary.go', { onclick: () => ov.remove() }, 'OK')]));
  document.body.append(ov);
}

// a warlord's heraldic crest (works for the human proxy or a bot)
function crestOf(p, size = 20) { return crest(p.color || (p.style && p.style.color) || '#888', p.sigil || (p.style && p.style.sigil) || '?', size); }
// an augment's icon by category (no emoji): combat=sword, econ=coffer, synergy=gem, build=star.
function augIcon(a) { return ic({ combat: 'sword', econ: 'coffer', synergy: 'gem', build: 'star' }[a && a.cat] || 'star'); }

// ---------- ladder standings (warlord HP roster) ----------
function buildStandings() {
  if (!lobby) return null;
  const oppId = lobby.opponent && !lobby.opponent.ghost ? lobby.opponent.id : null;
  const sorted = [...lobby.players].sort((a, b) => (b.alive - a.alive) || (b.hp - a.hp));
  const row = el('.standings');
  for (const p of sorted) {
    const hp = Math.max(0, Math.round(p.hp));
    const isUnder = p.alive && lobby.underdog === p.id;
    row.append(el(`.warlord${p.alive ? '' : ' dead'}${p.isHuman ? ' you' : ''}${p.id === oppId ? ' foe' : ''}${isUnder ? ' under' : ''}`,
      { dataset: { id: p.isHuman ? 'you' : p.id }, title: `${p.name}${p.isHuman ? '' : ' — ' + p.style.desc}${p.alive ? ' · ' + hp + ' HP' : ' · #' + p.place}`, onclick: () => showWarlordInfo(p) }, [
        el('span.wem', { html: crestOf(p, 20) }),
        el('.hpbar', {}, el('.hpfill', { style: { transform: `scaleX(${Math.min(1, hp / Bots.START_HP)})` } })),
        el('span.whp', {}, p.alive ? hp : '#' + p.place),
      ]));
  }
  return row;
}
// Snapshot of the last-rendered standings so we can animate changes (HP drain, FLIP reorder,
// KO callouts) when the strip is rebuilt after a round.
let prevWarlord = {};   // id -> { hp, alive }
let prevHumanHp = null;
// Capture current chip screen-rects (called BEFORE the DOM is swapped) for FLIP.
function captureWarlordRects() {
  const rects = {};
  document.querySelectorAll('.standings .warlord').forEach((c) => { rects[c.dataset.id] = c.getBoundingClientRect(); });
  return rects;
}
// After the new strip is in the DOM: drain HP bars from their old value, FLIP reorder, KO flash.
function animateStandings(oldRects) {
  if (run.mode !== 'ladder' || !lobby) return;
  const strip = document.querySelector('.standings'); if (!strip) return;
  strip.querySelectorAll('.warlord').forEach((chip) => {
    const id = chip.dataset.id;
    const p = lobby.players.find((x) => (x.isHuman ? 'you' : x.id) === id); if (!p) return;
    const prev = prevWarlord[id];
    // HP drain: start the bar at the previous HP, then transition to the current value
    const fill = chip.querySelector('.hpfill');
    const cur = Math.max(0, Math.min(1, p.hp / Bots.START_HP));
    if (fill && prev && prev.hp != null && Math.abs(prev.hp - p.hp) > 0.5) {
      const pf = Math.max(0, Math.min(1, prev.hp / Bots.START_HP));
      fill.style.transition = 'none'; fill.style.transform = `scaleX(${pf})`; void fill.offsetWidth;
      fill.style.transition = 'transform .5s cubic-bezier(.4,0,.2,1)';
      requestAnimationFrame(() => { fill.style.transform = `scaleX(${cur})`; });
    }
    // KO callout: a warlord that just fell (skip FLIP for it so the slam isn't overridden)
    const justKO = prev && prev.alive && !p.alive;
    if (justKO) { chip.classList.add('ko'); setTimeout(() => chip.classList.remove('ko'), 1000); return; }
    // FLIP: slide from its old position to the new one
    if (oldRects && oldRects[id]) {
      const nr = chip.getBoundingClientRect();
      const dx = oldRects[id].left - nr.left, dy = oldRects[id].top - nr.top;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        chip.style.transition = 'none'; chip.style.transform = `translate(${dx}px,${dy}px)`; void chip.offsetWidth;
        chip.style.transition = 'transform .4s cubic-bezier(.34,1.3,.64,1)';
        requestAnimationFrame(() => { chip.style.transform = ''; });
      }
    }
  });
  // "you took damage" flash on the HP pill
  if (prevHumanHp != null && lobby.human.hp < prevHumanHp - 0.5) {
    const pill = document.querySelector('.stat-pill.hppill');
    if (pill) { pill.classList.add('hp-hit'); setTimeout(() => pill.classList.remove('hp-hit'), 600); }
  }
  // refresh snapshot
  prevWarlord = {}; lobby.players.forEach((p) => { prevWarlord[p.isHuman ? 'you' : p.id] = { hp: p.hp, alive: p.alive }; });
  prevHumanHp = lobby.human.hp;
}

function showWarlordInfo(p) {
  Sfx.click();
  const hp = Math.max(0, Math.round(p.hp));
  const isFoe = lobby && lobby.opponent && !lobby.opponent.ghost && lobby.opponent.id === p.id;
  const ov = el('.overlay', { onclick: (e) => { if (e.target.classList.contains('overlay')) e.currentTarget.remove(); } },
    el('.help-card', { style: { maxWidth: '300px' } }, [
      el('h2', { style: { fontSize: '19px', display: 'flex', alignItems: 'center', gap: '7px' }, html: crestOf(p, 24) + `<span>${p.isHuman ? (p.warlordName || 'You') : p.name}</span>` }),
      el('.sub', {}, p.isHuman ? 'Your warband.' : p.style.desc),
      el('.istats', {}, [
        el('.istat', {}, [el('span', { style: { color: 'var(--ink-dim)' } }, 'Status'), el('span', {}, p.alive ? `${hp} HP` : `Fallen · #${p.place}`)]),
        el('.istat', {}, [el('span', { style: { color: 'var(--ink-dim)' } }, 'Level'), el('span', {}, p.isHuman ? run.level : (p.level || '?'))]),
      ]),
      Bots.POWERS[p.powerId] ? el('.sub', { style: { color: 'var(--gold)', marginTop: '8px' } }, `✦ ${Bots.POWERS[p.powerId].name}: ${Bots.POWERS[p.powerId].desc}`) : null,
      (!p.isHuman && Bots.TAUNTS[p.id]) ? el('.sub', { style: { fontStyle: 'italic', marginTop: '4px' } }, `“${Bots.TAUNTS[p.id]}”`) : null,
      (lobby.underdog === p.id && p.alive) ? el('.sub', { style: { color: 'var(--gold)', marginTop: '6px' } }, 'Underdog — lowest HP gets a free item each round.') : null,
      isFoe ? el('.sub', { style: { color: 'var(--hp)', marginTop: '6px' } }, 'Your foe this round — scout their warband on the dimmed board.') : null,
      el('button.btn.primary.go', { onclick: () => ov.remove() }, 'Close'),
    ]));
  document.body.append(ov);
}

function buildEnemyScout(enemy) {
  const defs = enemy.units.map((u) => UNITS_BY_ID[u.defId]);
  const active = Object.entries(activeTraits(defs)).filter(([t, i]) => TRAITS[t] && i.tier > 0)
    .sort((a, b) => b[1].count - a[1].count).slice(0, 4);
  const row = el('.enemy-scout');
  row.append(el('span.scout-label', {}, 'Foe:'));
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
  tray.append(el('span.tray-label', { html: ic('bag') }));
  if (!run.items.length) { tray.append(el('span', { style: { color: 'var(--ink-faint)', fontSize: '11px' } }, 'No items — win rounds to earn them. Drag an item onto a champion.')); return tray; }
  for (const it of run.items) {
    const d = itemDef(it.id);
    tray.append(el('.item-chip', { dataset: { iid: it.iid }, title: d.name, html: ic(d.icon) }));
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
// map uid -> star across board+bench (to detect a fuse/upgrade after a buy)
function starMap() { const m = {}; for (const u of [...run.board, ...run.bench.filter(Boolean)]) m[u.uid] = u.star; return m; }
function doBuy(i) {
  const before = starMap();
  act(() => Run.buy(run, i));
  // celebrate the emotional peak of the genre: a champion that just leveled up (TFT 1→2→3★)
  const upgraded = [...run.board, ...run.bench.filter(Boolean)].find((u) => before[u.uid] != null && u.star > before[u.uid]);
  if (upgraded) { celebrateFuse(upgraded.uid, upgraded.star); Sfx.fuse(); }
  else Sfx.buy();
}
// pop + gold shine on the upgraded champion's node (board unit or bench slot)
function celebrateFuse(uid, star) {
  const node = document.querySelector(`.units .unit[data-uid="${uid}"]`) || document.querySelector(`.bench .slot[data-uid="${uid}"]`);
  if (!node) return;
  node.classList.add('fusing');
  if (star >= 3) node.classList.add('fusing-gold');   // ★★★ = the holographic gold moment
  setTimeout(() => node.classList.remove('fusing', 'fusing-gold'), 700);
}
function doBuyXP() { act(() => Run.buyXP(run)); Sfx.click(); }
function doReroll() { act(() => Run.reroll(run)); Sfx.click(); }
function doLock() { run.shopLocked = !run.shopLocked; Run.save(run); Sfx.click(); renderPlanning(); }

// ---------- planning render ----------
function renderPlanning() {
  inCombat = false;
  const enemy = getOpponent();
  const boardLimitTxt = `${run.board.length}/${Run.boardLimit(run)}`;
  const { stage, wrap, units } = buildBoardEl();

  const game = el('.game', {}, [
    el('.topbar', {}, [
      el('.stat-pill.gold', {}, [el('span.ico', {}, '⛁'), el('span', {}, run.gold)]),
      run.mode === 'ladder'
        ? el(`.stat-pill hppill${lobby.human.hp <= 30 ? ' danger' : ''}`, {}, [iconEl('heart', 'hp-ic'), el('span', {}, ` ${Math.max(0, Math.round(lobby.human.hp))}`), el('span', { style: { color: 'var(--ink-dim)', fontSize: '11px', marginLeft: '4px' } }, `${Bots.aliveCount(lobby)} left`)])
        : el(`.stat-pill${run.lives <= 2 ? ' danger' : ''}`, {}, [iconEl('heart', 'hp-ic'), el('span', {}, ` ${run.lives}`), el('span', { style: { color: 'var(--hp)', marginLeft: '6px' }, title: `Act ${run.act || 1} · ${run.wins} total wins` }, `Act ${run.act || 1} · ${run.wins % 10}/10`)]),
      el('.stat-pill.round', {}, `Rd ${run.round}`),
      el('button.btn', { style: { padding: '5px 10px' }, title: 'Codex', onclick: () => showCodex('units'), html: ic('codex') }),
      el(`button.btn#shakeBtn${motionOn() ? ' primary' : ''}`, { style: { padding: '5px 10px' }, title: 'Screen shake (turn off if the game feels laggy)', onclick: toggleMotion, html: ic('burst') }),
      el('button.btn#soundBtn', { style: { padding: '5px 10px' }, title: 'Sound', onclick: toggleSound, html: ic(soundOn() ? 'sound' : 'mute') }),
      el('button.btn', { style: { padding: '5px 10px' }, title: 'How to play', onclick: showHelp }, '?'),
    ]),
    el('.topbar', { style: { cursor: 'pointer' }, onclick: showEconomyInfo }, [
      el('.stat-pill', {}, [el('span', { style: { color: 'var(--gold)' } }, `Lv ${run.level}`), el('span', { style: { color: 'var(--ink-dim)', fontSize: '11px' } }, ` · ${boardLimitTxt} units`)]),
      el('.xpbar', { title: 'XP to next level (+2 each round)' }, el('.fill', { style: { transform: `scaleX(${Run.xpNeeded(run) ? run.xp / Run.xpNeeded(run) : 1})` } })),
      el('span', { style: { fontSize: '10px', color: 'var(--ink-dim)', whiteSpace: 'nowrap' } }, Run.xpNeeded(run) ? `${run.xp}/${Run.xpNeeded(run)} ⓘ` : 'MAX'),
    ]),
    run.augments.length ? el('.relic-bar', {}, run.augments.map((id) => el(`span.relic tier-${AUGMENTS[id].tier}`, { title: `${AUGMENTS[id].name}: ${AUGMENTS[id].desc}`, onclick: () => showAugmentInfo(id), html: augIcon(AUGMENTS[id]) }))) : null,
    buildTraitsEl(),
    run.mode === 'ladder' ? buildLobbyBar() : null,
    run.mode === 'ladder' ? buildStandings() : null,
    el('.phase-banner', {}, `${run.mode === 'ladder' ? 'Versus' : 'Next'}: ${enemy.name} — ${enemy.traitHint}`),
    buildEnemyScout(enemy),
    stage,
    el('.combat-ctl', {}, [
      el('button.btn.primary#readyBtn', { style: { fontSize: '15px', padding: '10px 22px' }, onclick: startCombat }, 'Ready'),
      el('button.btn#spd1', { onclick: () => setSpeed(1) }, '1×'),
      el('button.btn#spd2', { onclick: () => setSpeed(2) }, '2×'),
      el('button.btn#spd4', { onclick: () => setSpeed(4) }, '4×'),
      el('.sell-zone#sellZone', { style: { marginLeft: 'auto' }, html: ic('sell') + ' Sell' }),
    ]),
    buildItemsTray(),
    buildBenchEl(),
    buildShopEl(),
  ]);
  const oldRects = run.mode === 'ladder' ? captureWarlordRects() : null;   // FLIP: positions before swap
  $('#app').replaceChildren(game);
  highlightSpeed();
  if (run.mode === 'ladder') animateStandings(oldRects);

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
    if (it) dragCtl.makeDraggable(c, iid, 'item', `<div class="item-ghost">${ic(itemDef(it.id).icon)}</div>`);
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
        el('span.di', { html: ic(d.icon) }), el('span.dn', {}, d.name),
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
          el('span.di', { html: augIcon(a) }), el('span.dn', {}, a.name), el('span.dm', {}, a.desc),
        ]);
        if ((run.banishLeft || 0) > 0) card.append(el('button.aug-banish', { title: 'Banish (remove from this run\'s offers)', onclick: (e) => banish(id, e), html: ic('ban') }));
        return card;
      })),
      el('.draft-tools', {}, [
        el('button.btn', { onclick: () => { run.gold += SKIP_GOLD; Sfx.sell(); done(); } }, `Skip (+${SKIP_GOLD}⛁)`),
        (run.augRerollLeft || 0) > 0 ? el('button.btn', { onclick: () => { run.augRerollLeft--; Sfx.click(); render(); } }, `⟳ Reroll (${run.augRerollLeft})`) : null,
        (run.banishLeft || 0) > 0 ? el('span', { style: { fontSize: '10px', color: 'var(--ink-faint)', alignSelf: 'center' } }, `${run.banishLeft} banish left`) : null,
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
      el('h2', { style: { fontSize: '19px' }, html: augIcon(a) + ' ' + a.name }),
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
  const active = activeTraits(playerDefs, teamTraitBonus())[traitId];
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
          el('span.aug-ic', { html: augIcon(a) }), el('span', { style: { fontWeight: 700 } }, a.name),
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
      el('h2', { style: { fontSize: '20px' }, html: ic('codex') + ' Codex' }),
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
function toggleSound() { audioResume(); setSound(!soundOn()); const b = $('#soundBtn'); if (b) b.innerHTML = ic(soundOn() ? 'sound' : 'mute'); if (soundOn()) Sfx.click(); }
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
        row('Reroll shop', '2⛁', 'New shop choices. Freeze to keep them next round.'),
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
    ['coffer', '<b>Buy champions</b> from the shop (bottom) — tap a card. Each costs gold ⛁.'],
    ['sword', '<b>Drag</b> champions from your bench onto the board to deploy them. Drag to the Sell zone to sell.'],
    ['gem', '<b>Synergies:</b> matching <b>Origins</b> (Undead, Elf, Dragon…) & <b>Classes</b> (Knight, Mage…) unlock team bonuses — see the bar near the top.'],
    ['star', '<b>3 copies</b> of the same champion auto-fuse into a stronger ★★ (then ★★★).'],
    ['shield', '<b>Position matters:</b> tanks in front, fragile carries in back. Then press Ready.'],
    ['eye', '<b>Tap a champion</b> to inspect its stats & ability. Watch the dimmed enemy preview to counter them.'],
    ['trophy', 'Beat <b>10 warbands</b> to clear an <b>Act</b>, then choose a harder <b>path</b> to keep climbing. Survive on <b>5 lives</b>.'],
  ];
  const ov = el('.overlay', {}, el('.help-card', {}, [
    el('h2', {}, 'How to play'),
    el('.sub', {}, 'Warbound — a fantasy auto-battler'),
    el('ul', {}, tips.map(([e, t]) => el('li', {}, [el('span.e', { html: ic(e) }), el('span', { html: t })]))),
    el('button.btn.primary.go', { onclick: () => { audioResume(); try { localStorage.setItem('warbound_intro', '1'); } catch {} ov.remove(); } }, "Let's go"),
  ]));
  document.body.append(ov);
}
function seenIntro() { try { return localStorage.getItem('warbound_intro') === '1'; } catch { return false; } }

// ---------- combat ----------
async function startCombat() {
  if (inCombat) return;
  audioResume();
  inCombat = true;
  const enemy = getOpponent();
  const playerBoard = run.board.map(({ defId, star, col, row }) => ({ defId, star, col, row }));
  const enemyBoard = enemy.units.map(({ defId, star, col, row }) => ({ defId, star, col, row }));
  const seed = hashSeed(run.seed, run.round);
  // build the combat aug: player augments, plus (in ladder) warlord powers + the lobby modifier
  const soloBundle = Object.assign(augmentBundle(run.augments), { traitBonus: teamTraitBonus() });
  if (run.mode !== 'ladder' && run.metaFlat) for (const k in run.metaFlat) soloBundle.flat[k] = (soloBundle.flat[k] || 0) + run.metaFlat[k];   // gear's team AD% etc.
  let augOpt = { aug: { player: soloBundle } };
  if (run.mode === 'ladder' && lobby) {
    const pb = augmentBundle(run.augments);
    const pf = Bots.powerFlat(lobby.human, lobby);   // human warlord power + modifier
    for (const [k, v] of Object.entries(pf)) pb.flat[k] = (pb.flat[k] || 0) + v;
    augOpt = { aug: { player: pb, enemy: Bots.botBundle(lobby.opponent, lobby) } };
  }
  const sim = simulate(playerBoard, enemyBoard, seed, augOpt);
  const { events, result } = sim;

  // hide planning-only controls, keep board
  $$('.bench .slot, .shop, .combat-ctl .btn:not(#readyBtn)').forEach(() => {});
  const ready = $('#readyBtn'); if (ready) { ready.disabled = true; ready.textContent = 'Fighting…'; }
  setBanner(`vs ${enemy.name}`);

  player = new CombatPlayer($('.units'), $('.fx-dom'));
  const winner = await player.play(events, { speed: combatSpeed });
  const won = winner === 'player';
  won ? Sfx.victory() : Sfx.defeat();
  if (won) launchConfetti(2000);
  const sv = result.survivors;
  setBanner(won ? `Round won! (${sv.player} survived)` : winner === 'enemy' ? `Round lost — ${sv.enemy} enemies left` : 'Draw — counts as a loss');

  const finishedRound = run.round;

  if (run.mode === 'ladder') {
    const hpBefore = lobby.human.hp;
    run.lives = 999;                       // ladder uses the HP pool, not lives
    Run.resolveRound(run, won);            // income / passive xp / shop roll / round++
    run.over = false; run.won = false;
    const summary = Bots.resolveLadderRound(lobby, playerBoard, sim, finishedRound);
    run.hp = lobby.human.hp;
    persist();
    if (summary.over) clearLobby(); else saveLobby();
    const lost = Math.round(hpBefore - lobby.human.hp);
    const hpMsg = lost > 0 ? ` · −${lost} HP` : won ? ' · unscathed' : '';
    const koMsg = summary.dead && summary.dead.length ? ` · ${summary.dead.join(', ')} fell` : '';
    setBanner(`${won ? 'Round won!' : winner === 'enemy' ? 'Round lost' : 'Draw'}${hpMsg}${koMsg}`);
    setTimeout(() => {
      if (summary.over) { endScreen(summary); return; }
      const thenUnderdog = () => summary.humanIsUnderdog ? offerUnderdogDraft(renderPlanning) : renderPlanning();
      if (shouldAugment(finishedRound)) offerAugment(thenUnderdog);   // augments in ladder too (depth)
      else thenUnderdog();
    }, summary.dead && summary.dead.length ? 2000 : 1200);
    return;
  }

  Run.resolveRound(run, won);
  Run.save(run);
  setTimeout(() => {
    if (run.over) endScreen();
    else if (run.actComplete) { run.actComplete = false; Run.save(run); offerPath(renderPlanning); }
    else if (shouldAugment(finishedRound)) offerAugment(renderPlanning);
    else if (shouldDraft(finishedRound)) offerDraft(renderPlanning);
    else renderPlanning();
  }, 1100);
}

// After clearing an act (every 10 wins) the road FORKS — pick one of three progressively harder,
// themed paths to keep climbing. Harder roads ramp the enemies faster (more stars + numbers).
function offerPath(after) {
  const act = run.act || 1;
  launchConfetti(2500);
  const choices = pathChoices(act);
  const pick = (c) => {
    run.act = act + 1;
    run.pathDiff = (run.pathDiff || 0) + c.diffAdd;
    run.pathName = c.name; run.pathPool = c.pool;
    Run.save(run); Sfx.buy();
    ov.remove();
    after ? after() : renderPlanning();
  };
  const ov = el('.overlay', {}, el('.help-card.path-card', {}, [
    el('.path-trophy', { html: ic('trophy') }),
    el('h2', {}, `Act ${act} cleared!`),
    el('.sub', {}, `${run.wins} warbands beaten. The road splits — choose how dangerous the next stretch gets.`),
    el('.path-row', {}, choices.map((c) => el('button.path-pick', { style: { '--pc': c.color }, onclick: () => pick(c) }, [
      el('.pp-tier', {}, c.label),
      el('.pp-name', {}, c.name),
      el('.pp-hint', {}, c.hint),
      el('.pp-danger', {}, [el('span', { style: { color: 'var(--ink-dim)' } }, 'Danger '), el('span', {}, '▲'.repeat(Math.min(5, c.diffAdd)))]),
    ]))),
  ]));
  document.body.append(ov);
}

// Comeback perk (research: lowest-HP gets first pick). Reuses the component draft, framed as
// an underdog reward so the trailing player gets a free item to stabilise.
function offerUnderdogDraft(after) {
  const ids = Run.draftComponents(run);
  const pick = (id) => { Run.addItem(run, id); persist(); Sfx.buy(); document.querySelector('.overlay')?.remove(); after ? after() : renderPlanning(); };
  const ov = el('.overlay', {}, el('.help-card', {}, [
    el('h2', {}, 'Underdog Gift'),
    el('.sub', {}, "You're lowest on health — claim a free component to fight back. Combine two on a champion for a full item."),
    el('.draft-row', {}, ids.map((id) => { const d = COMPONENTS[id]; return el('button.draft-pick', { onclick: () => pick(id) }, [el('span.di', { html: ic(d.icon) }), el('span.dn', {}, d.name), el('span.dm', {}, Object.entries(d.mods).map(([k, v]) => `+${v < 1 ? Math.round(v * 100) + '%' : v} ${k}`).join(', '))]); })),
  ]));
  document.body.append(ov);
}

function endScreen(ladderSummary) {
  const stat = (label, val) => el('.istat', { style: { minWidth: '120px' } }, [el('span', { style: { color: 'var(--ink-dim)' } }, label), el('span', {}, val)]);
  let head, sub, stats, rankBlock = null;
  if (run.mode === 'ladder') {
    const place = (ladderSummary && ladderSummary.humanPlace) || (lobby && lobby.human.place) || Bots.aliveCount(lobby);
    const first = place === 1;
    if (first) launchConfetti(4000);
    head = first ? '1st PLACE!' : `#${place} of 8`;
    sub = first ? 'Last warband standing — you conquered the ladder!' : `Your warband fell in ${place}${['th', 'st', 'nd', 'rd'][place] || 'th'} place. The other warlords were tougher.`;
    stats = [stat('Placement', `#${place} / 8`), stat('Rounds', run.round - 1)];
    // apply the placement to your rank ONCE, and show the result
    if (!run.rankApplied) { run.rankApplied = true; run._rankResult = Rank.applyPlacement(place); Run.save(run); }
    const rr = run._rankResult;
    if (rr) {
      if (rr.promoted) launchConfetti(4000);
      rankBlock = el('.rank-result', {}, [
        rr.promoted ? el('.rank-flash.promo', {}, [el('span', { html: ic('crown') }), el('span', {}, ` PROMOTED to ${rr.rank.name}!`)])
          : rr.demoted ? el('.rank-flash.demo', {}, `▼ Demoted to ${rr.rank.name}`) : null,
        el('.rank-line', {}, [
          el('span.rank-badge', { style: { color: rr.rank.color } }, [el('span', { html: rankMedal(rr.rank.color, 18) }), el('span', {}, ` ${rr.rank.name}`)]),
          el('span.rp-delta', { style: { color: rr.delta >= 0 ? 'var(--hp)' : 'var(--danger)' } }, `${rr.delta >= 0 ? '+' : ''}${rr.delta} RP`),
        ]),
        rr.rank.nextAt ? el('.rank-bar', { title: `${rr.rank.inTier}/${rr.rank.nextAt} to next tier` }, el('.fill', { style: { transform: `scaleX(${Math.max(0, Math.min(1, rr.rank.inTier / rr.rank.nextAt))})` } })) : null,
      ]);
    }
  } else {
    const act = run.act || 1;
    const reachedFar = run.wins >= 10;
    head = 'RUN OVER';
    sub = reachedFar
      ? `Your warband fell on Act ${act}${run.pathName ? ' — ' + run.pathName : ''}, after ${run.wins} victories. The path only gets harder.`
      : 'A valiant effort. Gear up in the Armory and try again!';
    // earn Spoils ONCE (even on a loss) — the meta-progression that eases the climb
    if (!run.spoilsEarned) { run.spoilsEarned = Meta.spoilsForRun(run.wins, run.round - 1, run.won); Meta.addSpoils(run.spoilsEarned); Run.save(run); }
    stats = [stat('Wins', `${run.wins}`), stat('Act reached', `${act}`), stat('Spoils', `+${run.spoilsEarned || 0}`)];
  }
  const card = el('.endscreen', {}, [
    el('h1', { style: { fontSize: '34px', margin: '0' } }, head),
    el('p', { style: { color: 'var(--ink-dim)', margin: '0' } }, sub),
    el('.istats', { style: { maxWidth: '280px' } }, stats),
    rankBlock,
    run.mode !== 'ladder' && run.augments.length ? el('div', {}, [el('div', { style: { color: 'var(--ink-dim)', fontSize: '12px', marginBottom: '4px' } }, 'Augments gathered'), el('.relic-bar', { style: { justifyContent: 'center' } }, run.augments.map((id) => el(`span.relic tier-${AUGMENTS[id].tier}`, { title: AUGMENTS[id].name, html: augIcon(AUGMENTS[id]) })))]) : null,
    el('button.btn.primary', { style: { fontSize: '16px', padding: '12px 28px' }, onclick: () => chooseMode() }, '↻ Main menu'),
  ]);
  $('#app').replaceChildren(el('.game', { style: { alignItems: 'center', justifyContent: 'center', minHeight: '85svh', textAlign: 'center', gap: '14px' } }, [card]));
}

// ---------- mode select ----------
function startSolo(fresh) {
  if (fresh) Run.clearSave();
  clearLobby();
  const resumed = !fresh && Run.load();
  run = resumed || Run.freshRun();
  run.mode = 'solo'; lobby = null;
  if (!resumed) applyGear(run);          // a NEW Warpath run starts with your equipped gear's boosts
  Run.save(run); renderPlanning();
  if (!seenIntro()) showHelp();
}
// apply the equipped Champion gear's start-of-run boosts to a fresh solo run.
function applyGear(run) {
  const b = Meta.gearBonuses();
  if (b.gold) run.gold += b.gold;
  if (b.lives) run.lives += b.lives;
  if (b.xp) { run.xp += b.xp; while (run.level < Run.MAX_LEVEL && run.xp >= Run.xpNeeded(run)) { run.xp -= Run.xpNeeded(run); run.level++; } }
  run.metaFlat = (b.flat && Object.keys(b.flat).length) ? b.flat : null;       // e.g. team +AD%
  run.metaTraitBonus = (b.traitBonus && Object.keys(b.traitBonus).length) ? b.traitBonus : null;
}
// your team's synergy-count bonus = augment crowns (+ in solo, the gear's synergy crown).
function teamTraitBonus() {
  const tb = { ...augmentBundle(run.augments).traitBonus };
  if (run.mode !== 'ladder' && run.metaTraitBonus) for (const t in run.metaTraitBonus) tb[t] = (tb[t] || 0) + run.metaTraitBonus[t];
  return tb;
}
// Pick a Warlord (your signature power) before the ladder begins — identity + run variety.
function startLadder() { chooseWarlord(); }
function chooseWarlord() {
  Run.clearSave(); clearLobby(); run = Run.freshRun(); run.mode = 'menu'; lobby = null;
  const card = (s) => { const p = Bots.POWERS[s.id]; return el('.warlord-pick', { onclick: () => beginLadder(s.id) }, [
    el('.wp-emoji', { html: crest(s.color, s.sigil, 28) }), el('.wp-name', {}, s.name),
    el('.wp-power', {}, [el('b', {}, p.name + ': '), el('span', {}, p.desc)]),
  ]); };
  const rk = Rank.currentRank();
  $('#app').replaceChildren(el('.game', { style: { alignItems: 'center', justifyContent: 'center', minHeight: '85svh', gap: '10px', padding: '14px' } }, [
    el('h1', { style: { fontSize: '26px', margin: '0', textAlign: 'center' } }, 'Choose your Warlord'),
    el('.rank-pill', { style: { borderColor: rk.color } }, [el('span', { html: rankMedal(rk.color, 16) }), el('span', { style: { color: rk.color } }, ` ${rk.name}`), el('span', { style: { color: 'var(--ink-dim)', fontSize: '11px' } }, rk.nextAt ? `${rk.inTier}/${rk.nextAt} RP` : `${rk.rp} RP`)]),
    el('.sub', { style: { textAlign: 'center', color: 'var(--ink-dim)', marginTop: '-4px' } }, `Your power shapes the run; the other seven are your rivals — playing at ${rk.name} skill.`),
    el('.warlord-grid', {}, Bots.STYLES.map(card)),
    el('button.btn', { style: { marginTop: '4px' }, onclick: () => chooseMode() }, '← Back'),
  ]));
}
function beginLadder(styleId) {
  clearLobby();
  const seed = 'ladder-' + Date.now();
  run = Run.freshRun(seed);
  run.mode = 'ladder'; run.hp = Bots.START_HP; run.lives = 999; run.warlordId = styleId;
  const rk = Rank.currentRank();
  lobby = Bots.createLobby(seed, styleId, rk.difficulty);   // your rank sets how SMART the warlords play
  run.pool = lobby.pool;                  // SHARED POOL: human draws from the same bag as the bots
  persist(); renderPlanning();
  // announce this match's lobby-wide modifier (TFT Encounter / HS Anomaly)
  if (lobby.modifier && lobby.modifier.id !== 'none') {
    setBanner(`${lobby.modifier.name}: ${lobby.modifier.desc}`);
  }
  try { if (localStorage.getItem('warbound_intro_ladder') !== '1') { localStorage.setItem('warbound_intro_ladder', '1'); showHelp(); } } catch {}
}
// The Champion portrait's ARMOUR recolours to the equipped Armor (and weapon tints the accent),
// so swapping gear visibly changes the hero. Rarity drives the colour (steel→blue→purple).
const RARITY_TINT = { common: '#9aa6b8', rare: '#6fb1ff', epic: '#c79bff' };
function heroPalette(m) {
  const pal = {};
  const arm = Meta.equippedItem(m, 'armor'); if (arm) pal.secondary = RARITY_TINT[arm.rarity];   // plate/helm/shield
  const wep = Meta.equippedItem(m, 'weapon'); if (wep) pal.accent = RARITY_TINT[wep.rarity];
  return Object.keys(pal).length ? pal : null;
}

// ---------- Armory (meta-progression: chests + equipping your Champion) ----------
function showArmory() {
  audioResume();
  let invSort = 'slot';            // how the inventory grid is ordered (persists across re-renders)
  const SLOT_ORDER = Object.fromEntries(Meta.SLOTS.map((s, i) => [s.id, i]));
  const RAR_ORDER = { common: 0, rare: 1, epic: 2 };
  const iidNum = (it) => parseInt(String(it.iid).replace(/\D/g, ''), 10) || 0;
  const sortInv = (items, m) => {
    const a = [...items];
    const eq = (it) => (m.equipped[it.slot] === it.iid ? 0 : 1);   // equipped pieces float to the front
    if (invSort === 'slot') a.sort((x, y) => eq(x) - eq(y) || SLOT_ORDER[x.slot] - SLOT_ORDER[y.slot] || RAR_ORDER[y.rarity] - RAR_ORDER[x.rarity] || iidNum(y) - iidNum(x));
    else if (invSort === 'rarity') a.sort((x, y) => eq(x) - eq(y) || RAR_ORDER[y.rarity] - RAR_ORDER[x.rarity] || SLOT_ORDER[x.slot] - SLOT_ORDER[y.slot] || iidNum(y) - iidNum(x));
    else a.sort((x, y) => eq(x) - eq(y) || iidNum(y) - iidNum(x));  // 'recent' = newest first
    return a;
  };
  const render = () => {
    const m = Meta.load();
    const rar = (id) => Meta.RARITIES.find((r) => r.id === id);
    // a socket on the paper-doll: equipped item icon in a rarity ring, or a dim slot ghost
    const socket = (s) => {
      const it = Meta.equippedItem(m, s.id);
      return el(`.socket${it ? ' filled' : ''}`, {
        style: it ? { '--rc': rar(it.rarity).color, '--ic': Meta.itemColor(it) } : {},
        title: it ? `${it.name} — ${Meta.effectText(it)} (tap to unequip)` : `${s.name}: empty`,
        onclick: it ? () => { Meta.unequip(s.id); Sfx.click(); render(); } : null,
      }, [el('.socket-icon', { html: ic(it ? it.icon : s.icon) }), el('.socket-label', {}, s.name)]);
    };
    // a detailed loadout row per slot (name + plain-language effect), rarity-coloured
    const loadoutRow = (s) => {
      const it = Meta.equippedItem(m, s.id);
      return el(`.loadout-row${it ? ' filled' : ' empty'}`, { style: it ? { '--rc': rar(it.rarity).color } : {}, onclick: it ? () => { Meta.unequip(s.id); Sfx.click(); render(); } : null }, [
        el('.lr-icon', { html: ic(it ? it.icon : s.icon) }),
        el('.lr-text', {}, [el('.lr-name', {}, it ? it.name : `${s.name} slot`), el('.lr-eff', {}, it ? Meta.effectText(it) : 'empty — equip a piece below')]),
        it ? el('.lr-x', {}, '✕') : null,
      ]);
    };
    const invCell = (it) => el(`.inv-item${m.equipped[it.slot] === it.iid ? ' eq' : ''}`, { style: { '--rc': rar(it.rarity).color, '--ic': Meta.itemColor(it) }, onclick: () => { Meta.equip(it.iid); Sfx.buy(); render(); }, title: `${Meta.effectText(it)} — tap to equip` }, [
      el('.ii-rar', {}, rar(it.rarity).name),
      el('.ii-icon', { html: ic(it.icon) }),
      el('.ii-name', {}, it.name),
      el('.ii-eff', {}, Meta.effectText(it)),
    ]);
    const canBuy = m.spoils >= Meta.CHEST_COST;
    $('#app').replaceChildren(el('.game.armory-screen', { style: { gap: '12px', padding: '14px', minHeight: '85svh' } }, [
      el('.arm-header', {}, [
        el('button.btn.icon', { onclick: () => chooseMode(), html: ic('back') }),
        el('h1', {}, 'Armory'),
        el('.spoils-pill', {}, [iconEl('spoils', 'sp-ico'), el('span', {}, m.spoils)]),
      ]),
      el('.arm-tagline', {}, 'Gear your Champion — these boosts apply to your Warpath runs.'),
      // paper-doll: portrait (its ARMOUR recolours to your equipped Armor) + rarity-ringed sockets
      el('.champion-panel', {}, [
        el('.champ-portrait', { html: championSVG(UNITS_BY_ID['knight_captain'], { size: 92, palette: heroPalette(m) }) }),
        el('.sockets', {}, Meta.SLOTS.map(socket)),
      ]),
      el('.loadout', {}, Meta.SLOTS.map(loadoutRow)),
      // cache CTA
      el(`.cache-cta${canBuy ? '' : ' dim'}`, { onclick: () => { const r = Meta.openChest(); if (r.ok) revealItem(r.item, render); else modal2('Not enough Spoils', `A War Cache costs ${Meta.CHEST_COST} Spoils. Earn Spoils by playing Warpath — even a loss pays out.`); } }, [
        el('.cc-chest', { html: ic('coffer') }),
        el('.cc-text', {}, [el('.cc-title', {}, 'Open War Cache'), el('.cc-sub', {}, 'a random piece of gear')]),
        el('.cc-cost', {}, [String(Meta.CHEST_COST) + ' ', iconEl('spoils')]),
      ]),
      // Forge: fuse two of the same slot + rarity into one of the next rarity up
      forgePanel(m, rar, render),
      el('.inv-bar', {}, [
        el('.inv-head', {}, m.inventory.length ? `Inventory · ${m.inventory.length}` : 'No gear yet — open a War Cache'),
        m.inventory.length > 1 ? el('.inv-sort', {}, [
          el('span.is-label', {}, 'Sort'),
          ...[['slot', 'Slot'], ['rarity', 'Rarity'], ['recent', 'Newest']].map(([k, lbl]) =>
            el(`button.is-btn${invSort === k ? ' on' : ''}`, { onclick: () => { invSort = k; Sfx.click(); render(); } }, lbl)),
        ]) : null,
      ]),
      el('.inv-grid', {}, sortInv(m.inventory, m).map(invCell)),
    ]));
  };
  render();
}
// The Forge section of the Armory: list every available "fuse 2 same-kind -> 1 higher rarity".
function forgePanel(m, rar, render) {
  if (m.inventory.length < 2) return null;
  const fuses = Meta.combinables(m);
  const rows = fuses.map((g) => {
    const s = Meta.SLOTS.find((x) => x.id === g.slot);
    const up = Meta.nextRarity(g.rarity);
    return el('.forge-row', {
      style: { '--rc': rar(g.rarity).color, '--uc': rar(up).color },
      title: `Consumes two ${rar(g.rarity).name} ${s.name}s`,
      onclick: () => { const r = Meta.combineItems(g.slot, g.rarity); if (r.ok) revealItem(r.item, render); },
    }, [
      el('.fr-icon', { html: ic(s.icon) }),
      el('.fr-text', {}, [
        el('.fr-name', {}, `Fuse two ${rar(g.rarity).name} ${s.name}s`),
        el('.fr-sub', {}, [el('span', {}, '→ one '), el('span.fr-up', {}, `${rar(up).name} ${s.name}`), el('span', {}, `  ·  ${g.items.length} owned`)]),
      ]),
      el('.fr-arrow', { html: ic('burst') }),
    ]);
  });
  return el('.forge', {}, [
    el('.inv-head', {}, 'Forge'),
    rows.length ? el('.forge-list', {}, rows) : el('.forge-empty', {}, 'Collect two of the same slot AND rarity to fuse them into a higher tier.'),
  ]);
}
function revealItem(item, after) {
  Sfx.fuse();
  const rar = Meta.RARITIES.find((r) => r.id === item.rarity);
  const ov = el('.overlay', {}, el(`.reveal-card rarity-${item.rarity}`, { style: { '--rc': rar.color, '--ic': Meta.itemColor(item) } }, [
    el('.reveal-burst'),
    el('.reveal-rarity', {}, rar.name + ' find!'),
    el('.reveal-icon', { html: ic(item.icon) }),
    el('h2', {}, item.name),
    el('.reveal-eff', {}, Meta.effectText(item)),
    el('.reveal-tools', {}, [
      el('button.btn.primary', { onclick: () => { Meta.equip(item.iid); Sfx.fuse(); ov.remove(); after && after(); } }, 'Equip'),
      el('button.btn', { onclick: () => { ov.remove(); after && after(); } }, 'Stash'),
    ]),
  ]));
  document.body.append(ov);
}

function chooseMode() {
  Run.clearSave(); clearLobby(); run = Run.freshRun(); run.mode = 'menu'; lobby = null;
  const card = (cls, iconName, title, desc, onclick) => el(`.mode-card${cls}`, { onclick }, [el('.mc-emoji', { html: ic(iconName) }), el('.mc-title', {}, title), el('.mc-desc', {}, desc)]);
  const rk = Rank.currentRank();
  const ladderCard = card(' ladder', 'crown', 'Warlord Ladder', 'Auto-Chess: 8 warlords, ONE shared champion pool, last warband standing wins. Climb the ranks — higher rank = smarter rivals.', () => startLadder());
  ladderCard.append(el('.mc-rank', { style: { color: rk.color } }, [el('span', { html: rankMedal(rk.color, 16) }), el('span', {}, ` ${rk.name}${rk.nextAt ? ` · ${rk.inTier}/${rk.nextAt} RP` : ` · ${rk.rp} RP`}`)]));
  $('#app').replaceChildren(el('.game', { style: { alignItems: 'center', justifyContent: 'center', minHeight: '85svh', gap: '14px' } }, [
    el('h1', { style: { fontSize: '32px', margin: '0', textAlign: 'center' } }, 'Warbound'),
    el('.sub', { style: { textAlign: 'center', color: 'var(--ink-dim)', marginTop: '-6px' } }, 'Choose your battle'),
    el('.mode-menu', {}, [
      // Warpath + its Armory are one visual GROUP — gear belongs to Warpath, not the ladder.
      el('.warpath-group', {}, [
        card('', 'sword', 'Warpath', 'Beat 10 warbands to clear an Act, then fork onto harder, themed paths. Earn Spoils to gear your Champion and ease each run.', () => startSolo(true)),
        el('.armory-bar', { onclick: () => showArmory() }, [
          el('span.ab-ico', { html: ic('coffer') }),
          el('.ab-text', {}, [el('span.ab-label', {}, 'Armory'), el('span.ab-sub', {}, 'gear your Champion — for Warpath')]),
          el('span.ab-spoils', {}, `${Meta.load().spoils} Spoils`),
        ]),
      ]),
      ladderCard,
    ]),
  ]));
}

// ---------- boot ----------
{
  const saved = Run.load();
  if (saved && saved.mode === 'ladder') {
    try { lobby = Bots.deserializeLobby(JSON.parse(localStorage.getItem(LOBBY_KEY) || 'null')); } catch { lobby = null; }
    if (lobby && lobby.human && lobby.human.alive) { run = saved; run.pool = lobby.pool; renderPlanning(); } else { clearLobby(); chooseMode(); }
  } else if (saved && saved.round > 1) {
    run = saved; run.mode = saved.mode || 'solo'; lobby = null; renderPlanning();
    if (!seenIntro()) showHelp();
  } else {
    chooseMode();
  }
}
// Debug hook (also the seed of a future debug menu): inspect/drive state from console.
window.__wb = {
  get run() { return run; }, get lobby() { return lobby; }, Run, Bots,
  ladder: () => startLadder(), menu: () => chooseMode(),
  render: renderPlanning, fight: startCombat,
  place: (uid, c, r) => act(() => Run.placeOnBoard(run, uid, c, r)),
  giveGold: (n) => act(() => (run.gold += n)),
  inspect: (uid) => showInspect(uid),
  end: () => endScreen(),
  sim: (board, round) => simulate(board, getEnemyBoard(round || run.round, null).units.map(({ defId, star, col, row }) => ({ defId, star, col, row })), hashSeed(run.seed, round || run.round), { aug: { player: augmentBundle(run.augments) } }),
};
console.log('[warbound] game loop ready. Round', run.round, '| board limit', Run.boardLimit(run));
