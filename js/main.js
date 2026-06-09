// Warbound — game loop. Planning phase (interactive shop/bench/board + drag) → combat
// (sim + timeline playback) → resolve → next round. Warpath: beat 10 warbands (a loss replays the
// same warband until you win). Trials/Endless: win/survive on lives. Ladder: outlast 7 rivals on HP.
import { el, $, $$ } from './dom.js';
import { UNITS, UNITS_BY_ID, ORIGINS, statsForStar, STAR_MULT, ULT3 } from './data/units.js';
import { TRAITS, activeTraits } from './data/traits.js';
import { championSVG, getArtSet, setArtSet } from './champ-art.js';
import { ic, iconEl, crest, rankMedal } from './icons.js';
import { gearArt } from './gear-art.js';
import { simulate } from './sim/combat.js';
import { hashSeed } from './rng.js';
import { CombatPlayer, unitStatsPanel } from './render/player.js';
import { createDragController } from './input/drag.js';
import { getEnemyBoard, REALMS, realmAt, bossForRealm, getTrialBoard, getCreepCamp, TRIAL_COUNT } from './data/enemies.js';
import { COMPONENTS, ITEMS, itemDef, itemLabel, traitGrantsFor, isEmblem, EMBLEMS, combine as combineItems } from './data/items.js';
import { CREATURES_LIST } from './data/creatures.js';
import { AUGMENTS, TIER_LABEL, augmentBundle } from './data/augments.js';
import { HONORS, HONOR_CATS, HONOR_BY_ID, TOTAL_BOUNTY } from './data/honors.js';
import * as Run from './state/run.js';
import * as Bots from './state/bots.js';
import * as Rank from './state/rank.js';
import * as Meta from './state/meta.js';
import { resume as audioResume, Sfx, setEnabled as setSound, isEnabled as soundOn } from './audio/audio.js';
import { launchConfetti } from './render/fx.js';

let run = null;            // set by boot (solo resume) or a mode start
let lobby = null;          // ladder-mode warlord lobby
// Endless mode reinforcement pool — a rich cross-race mix so the infinite waves stay varied.
const ENDLESS_POOL = ['warboss', 'berserker', 'axethrower', 'dragon_knight', 'warlock', 'lich', 'wraith',
  'necromancer', 'pit_summoner', 'moon_priestess', 'bramble_brute', 'beastmaster', 'hellguard'];
const SPEEDS = [[0.5, '½×'], [1, '1×'], [2, '2×'], [4, '4×']];   // ½× is the new, calmer default
const spdId = (s) => String(s).replace('.', '');
let combatSpeed = (() => { try { const v = parseFloat(localStorage.getItem('warbound_speed')); return SPEEDS.some(([s]) => s === v) ? v : 0.5; } catch { return 0.5; } })();
let inCombat = false;
let dragCtl = null;
let lastBattleStats = null;   // per-unit stats from the last fight; shown in planning until the next battle
let lastBattleUids = null;    // board uids in combat-spawn order, so per-unit stats map to the RIGHT instance
let lastVerdict = null;       // P0.1: plain-language "why you won/lost" + breakdown from the last fight
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
  // so you can break the wall). The current REALM sets the difficulty + themes the reinforcements.
  if (run.mode === 'trials') return getTrialBoard(run.wins);   // boss-rush: next boss = bosses beaten
  // Endless: difficulty climbs every win and never stops; every 10th wave is a BOSS for a spike.
  // Depth (wins) is the only score — there is no win, only how far the Warhorde lets you march.
  if (run.mode === 'endless') {
    const wave = run.wins + 1;
    if (wave % 10 === 0) return bossForRealm(Math.floor(run.wins / 10));   // bosses cycle then scale up
    const b = getEnemyBoard(wave, null, { diff: run.wins, pool: ENDLESS_POOL });
    return { ...b, name: 'Wave ' + wave, traitHint: 'the horde grows — survive' };
  }
  const realm = realmAt(run.realm || 0);
  // Neutral Camp (creep) rounds — a wild-monster breather that drops loot, doesn't count as a warband.
  if (Run.isCreepRound(run)) return getCreepCamp(run.round, { diff: realm.diff });
  // the realm's 10th/final warband is a themed BOSS with a gimmick (telegraphed pre-fight).
  if (run.wins + 1 === Run.WIN_TARGET) return bossForRealm(realm.index);
  return getEnemyBoard(run.wins + 1, null, { diff: realm.diff, pool: realm.pool });
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
  // On-screen battle stats (opt-in): each of YOUR champions shows last fight's damage dealt & tanked.
  if (team === 'player' && !inCombat && battleStatsOn()) {
    const bs = battleStatForUnit(u);
    if (bs) node.append(el('.unit-bstat', { title: 'Last battle — damage dealt ⚔ / tanked 🛡' }, [
      el('span.ub-d', { html: ic('sword') }), el('span', {}, String(bs.dealt)),
      el('span.ub-t', { html: ic('shield') }), el('span', {}, String(bs.tanked)),
    ]));
  }
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
  if (!inCombat) {   // standing reminder that the near rows take the hits and the far rows are safe
    wrap.append(
      el('.pos-cue.front', { title: 'Your front row engages first — put tanks here' }, 'Front line'),
      el('.pos-cue.back', { title: 'Ranged & fragile carries are safest here' }, 'Back line'),
    );
  }
  stage.append(wrap);
  return { stage, wrap, units };
}

// ---------- traits ----------
// Board defs with per-unit Emblem trait-grants attached (so the synergy panel reflects emblems).
function defsWithGrants(board) {
  return board.map((u, i) => {
    const d = UNITS_BY_ID[u.defId];
    const grants = traitGrantsFor(u.items);
    return grants.length ? { ...d, grants, gid: u.uid != null ? u.uid : 'b' + i } : d;
  });
}
function buildTraitsEl() {
  const defs = defsWithGrants(run.board);
  const active = activeTraits(defs, teamTraitBonus());
  const rail = el('.traits-rail');
  // The race banished for this run (Auto-Chess rotation) — a persistent reminder it's off the table.
  if (run.bannedRace && run.mode !== 'ladder' && TRAITS[run.bannedRace]) {
    const d = TRAITS[run.bannedRace];
    rail.append(el('.trait-chip.banished', { title: `${d.name} is banished this run — not in your shop`, onclick: () => modal2('Banished this run', `${d.name} units never appear in your shop this run — one race sits out each run, drawn from the seed (Auto-Chess style). You'll still face ${d.name} in enemy warbands.`) }, [
      el('span', { html: ic('ban'), style: { display: 'inline-flex', color: 'var(--danger)' } }),
      el('span.ban-tag', {}, 'Banished'),
      el('span.dot', { style: { background: d.color } }),
      el('span.ban-race', {}, d.name),
    ]));
  }
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
// Live shared-pool accounting for a unit: how many of its copies are still in the bag, how many
// YOU hold (a 2★ = 3 copies, 3★ = 9), and how many rivals are sitting on (Ladder's shared pool).
function poolInfo(id) {
  const def = UNITS_BY_ID[id]; const total = def ? (Run.POOL_COPIES[def.cost] || 0) : 0;
  const left = (run.pool && run.pool[id] != null) ? run.pool[id] : total;
  const copiesForStar = (s) => (s >= 3 ? 9 : s >= 2 ? 3 : 1);
  let mine = 0;
  for (const u of [...run.board, ...run.bench]) if (u && u.defId === id) mine += copiesForStar(u.star || 1);
  const others = Math.max(0, total - left - mine);
  return { total, left, mine, others, contested: others > 0 };
}
function buildShopEl() {
  const row = el('.shop-row');
  run.shop.forEach((id, i) => {
    const def = id && UNITS_BY_ID[id];
    if (!def) { row.append(el('.shop-card.empty')); return; }
    const owned = [...run.board, ...run.bench.filter(Boolean)].some((u) => u.defId === id);
    const pi = poolInfo(id);
    const card = el(`.shop-card.cost-${def.cost}${owned ? ' owned' : ''}`, { onclick: () => doBuy(i) }, [
      el('span.price', {}, `${def.cost}⛁`),
      el('button.card-info', { onclick: (e) => { e.stopPropagation(); showUnitInfo(def, 1, []); } }, 'ⓘ'),
      // copies left in the shared bag (Auto-Chess pool depletion, surfaced): scarce = few left,
      // contested = rivals are holding copies (Ladder only — solo runs only deplete via you). Hidden
      // while the bag is still full — five identical max numbers on a fresh shop is just noise.
      (pi.left < pi.total || pi.contested)
        ? el(`.pool-cnt${pi.left <= 2 ? ' scarce' : ''}${pi.contested ? ' contested' : ''}`,
            { title: pi.contested ? `${pi.left}/${pi.total} left in the shared pool — ${pi.others} held by rival warlords` : `${pi.left} of ${pi.total} left in the pool` },
            `${pi.left}${pi.contested ? ' ⚔' : ''}`)
        : null,
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
  // P1.1 — transparent underdog supply: when behind, the shop is biased toward your synergies.
  // Always SHOWN, never hidden (the honest White-Hat form of rubber-banding — help, don't deceive).
  const underdog = run.underdogSupply ? el('.underdog-note', { style: { fontSize: '11px', color: 'var(--hp)', textAlign: 'center', margin: '0 0 4px', fontWeight: '700' } },
    '⚑ Underdog supply — while you\'re behind, the shop favours the synergies you\'re building') : null;
  return el(`.shop${run.shopLocked ? ' locked' : ''}`, {}, [controls, underdog, row]);
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

// P2.2 — "beat my run": paste a seed a friend shared to march the SAME boards/shop and compare
// depth. Asynchronous, opt-in, no accounts or pressure — the friendly (naches) social lever.
function showSeedPrompt() {
  Sfx.click();
  const input = el('input.seed-input', { type: 'text', placeholder: 'paste a seed…', style: { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--ink-faint)', background: 'rgba(0,0,0,.3)', color: 'var(--ink)', fontSize: '14px', boxSizing: 'border-box' } });
  const play = () => { const s = input.value.trim(); if (s) { ov.remove(); startSolo(true, 0, s); } };
  const ov = el('.overlay', { onclick: (e) => { if (e.target.classList.contains('overlay')) e.currentTarget.remove(); } },
    el('.help-card', { style: { maxWidth: '320px' } }, [
      el('h2', { style: { fontSize: '19px' } }, 'Play a shared seed'),
      el('p', { style: { fontSize: '13px', color: 'var(--ink-dim)', lineHeight: '1.4' } }, 'Paste a seed a friend shared to march the SAME run and see how far you each get — a friendly challenge, no accounts, no pressure.'),
      input,
      el('.end-btns', { style: { display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '10px' } }, [
        el('button.btn.primary', { onclick: play }, 'Play this seed ▶'),
        el('button.btn', { onclick: () => ov.remove() }, 'Cancel'),
      ]),
    ]));
  document.body.append(ov);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') play(); });
  setTimeout(() => input.focus(), 50);
}

// a warlord's heraldic crest (works for the human proxy or a bot)
function crestOf(p, size = 20) { return crest(p.color || (p.style && p.style.color) || '#888', p.sigil || (p.style && p.style.sigil) || '?', size); }
// an augment's icon by category (no emoji): combat=sword, econ=coffer, synergy=gem, build=star.
function augIcon(a) { return ic((a && a.icon) || { combat: 'sword', econ: 'coffer', synergy: 'gem', build: 'star' }[a && a.cat] || 'star'); }

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
  // P0.3b — telegraph the positioning THREATS so the player can counter-place (the genre's core skill).
  const threat = (txt) => el('.scout-threat', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10.5px', fontWeight: '700', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: '999px', padding: '2px 8px', marginLeft: '4px' } }, txt);
  const divers = enemy.units.filter((u) => (UNITS_BY_ID[u.defId] || {}).dive).length;
  if (divers) row.append(threat(`⚔ ${divers} assassin${divers > 1 ? 's' : ''} — dives your back line; tuck carries in a corner`));
  const bigAoe = enemy.units.some((u) => { const a = (UNITS_BY_ID[u.defId] || {}).ability; return a && a.type === 'magic' && (a.radius || 0) >= 2; });
  if (bigAoe) row.append(threat('✦ heavy AoE — don\'t clump your units'));
  return row;
}

function buildItemsTray() {
  const tray = el(`.items-tray${run.items.length ? '' : ' empty'}`);   // '.empty' is hidden on phones (saves space; no items to drag yet)
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
      slot.dataset.uid = u.uid || '';
    }
    bench.append(slot);
  });
  return bench;
}

// ---------- actions ----------
// Every shop/bench/board mutation goes through act(). Hard-lock it during combat so you can't
// buy, reroll, sell, or drag while the fight you already committed to is playing out.
function act(fn) { if (inCombat) return; audioResume(); fn(); Run.save(run); renderPlanning(); }
// map uid -> star across board+bench (to detect a fuse/upgrade after a buy)
function starMap() { const m = {}; for (const u of [...run.board, ...run.bench.filter(Boolean)]) m[u.uid] = u.star; return m; }
function doBuy(i) {
  const before = starMap();
  act(() => Run.buy(run, i));
  // celebrate the emotional peak of the genre: any champion that just leveled up (TFT 1→2→3★).
  // Use `before[uid] || 1` so a fuse where the freshly-bought copy is the one kept (its prior
  // star is unknown) still celebrates — and celebrate ALL upgrades (a buy can cascade to two).
  const upgraded = [...run.board, ...run.bench.filter(Boolean)].filter((u) => u.star > (before[u.uid] || 1));
  if (upgraded.length) { upgraded.forEach((u) => celebrateFuse(u.uid, u.star)); Sfx.fuse(); }
  else Sfx.buy();
}
// pop + gold shine on the upgraded champion's node (board unit or bench slot). Scoped to YOUR
// units (never the dimmed enemy preview) and guarded so it can't ever target an empty uid.
function celebrateFuse(uid, star) {
  if (!uid) return;
  const node = document.querySelector(`.units .unit.team-player:not(.preview)[data-uid="${uid}"]`) || document.querySelector(`.bench .slot[data-uid="${uid}"]`);
  if (!node) return;
  node.classList.add('fusing');
  if (star >= 3) node.classList.add('fusing-gold');   // ★★★ = the holographic gold moment
  setTimeout(() => node.classList.remove('fusing', 'fusing-gold'), 700);
}
function doBuyXP() { act(() => Run.buyXP(run)); Sfx.click(); }
function doReroll() { act(() => Run.reroll(run)); Sfx.click(); }
function doLock() { if (inCombat) return; run.shopLocked = !run.shopLocked; Run.save(run); Sfx.click(); renderPlanning(); }

// ---------- planning render ----------
function renderPlanning() {
  inCombat = false;
  checkBoardHonors();   // 3★ / 6-stack synergy are board-state honours — re-checked each plan render
  const enemy = getOpponent();
  const boardLimitTxt = `${run.board.length}/${Run.boardLimit(run)}`;
  const overCap = Math.max(0, run.board.length - Run.boardLimit(run));   // you may over-place; just can't fight over-cap
  const { stage, wrap, units } = buildBoardEl();
  // (warband stats moved off the board into a top-bar button overlay — see showStats)

  const game = el(`.game.planning${run.mode === 'ladder' ? '.ladder-mode' : ''}`, {}, [
    el('.topbar', {}, [
      el('.stat-pill.gold', {}, [el('span.ico', {}, '⛁'), el('span', {}, run.gold)]),
      run.mode === 'ladder'
        ? el(`.stat-pill hppill${lobby.human.hp <= 30 ? ' danger' : ''}`, {}, [iconEl('heart', 'hp-ic'), el('span', {}, ` ${Math.max(0, Math.round(lobby.human.hp))}`), el('span', { style: { color: 'var(--ink-dim)', fontSize: '11px', marginLeft: '4px' } }, `${Bots.aliveCount(lobby)} left`)])
        : run.mode === 'solo'
          // Warpath can't be lost — show warband progress (not lives) + a retry badge when you're stuck on a wall.
          ? el('.stat-pill', {}, [iconEl('trophy', 'hp-ic'), el('span', { style: { marginLeft: '4px' }, title: `${realmAt(run.realm || 0).name} · conquer all 10 warbands` }, `${run.wins}/${run.winTarget || Run.WIN_TARGET}`),
              run.retries > 0 ? el('span', { style: { color: 'var(--danger)', marginLeft: '8px', fontWeight: '800' }, title: `Defeated by this warband ${run.retries}×. Regroup and beat them — Warpath replays each fight until you win.` }, `⟳ ${run.retries}`) : null])
          : el(`.stat-pill${run.lives <= 2 ? ' danger' : ''}`, {}, [iconEl('heart', 'hp-ic'), el('span', {}, ` ${run.lives}`), el('span', { style: { color: 'var(--hp)', marginLeft: '6px' }, title: run.mode === 'trials' ? `Slay all ${TRIAL_COUNT} bosses` : 'Endless — survive as deep as you can' }, run.mode === 'endless' ? `Wave ${run.wins + 1}` : `${run.wins}/${run.winTarget || Run.WIN_TARGET}`)]),
      el('.stat-pill.round', {}, `Rd ${run.round}`),
      el('button.btn#optionsBtn', { style: { padding: '5px 10px' }, title: 'Options & menu', onclick: showOptions, html: ic('bars') }),
    ]),
    el('.topbar', { style: { cursor: 'pointer' }, onclick: showEconomyInfo }, [
      el(`.stat-pill${overCap ? ' danger' : ''}`, {}, [el('span', { style: { color: 'var(--gold)' } }, `Lv ${run.level}`), el('span', { style: { color: overCap ? 'var(--danger)' : 'var(--ink-dim)', fontSize: '11px', fontWeight: overCap ? '800' : '400' } }, ` · ${boardLimitTxt} units${overCap ? ` (${overCap} over!)` : ''}`)]),
      el('.xpbar', { title: 'XP to next level (+2 each round)' }, el('.fill', { style: { transform: `scaleX(${Run.xpNeeded(run) ? run.xp / Run.xpNeeded(run) : 1})` } })),
      el('span', { style: { fontSize: '10px', color: 'var(--ink-dim)', whiteSpace: 'nowrap' } }, Run.xpNeeded(run) ? `${run.xp}/${Run.xpNeeded(run)} ⓘ` : 'MAX'),
    ]),
    run.augments.length ? el('.relic-bar', {}, run.augments.map((id) => el(`span.relic tier-${AUGMENTS[id].tier}`, { title: `${AUGMENTS[id].name}: ${AUGMENTS[id].desc}`, onclick: () => showAugmentInfo(id), html: augIcon(AUGMENTS[id]) }))) : null,
    buildTraitsEl(),
    run.mode === 'ladder' ? buildLobbyBar() : null,
    run.mode === 'ladder' ? buildStandings() : null,
    lastVerdict ? verdictCard(lastVerdict) : null,
    enemy.boss
      ? el('.phase-banner.boss-banner', {}, [
          el('div', { style: { fontWeight: '800', letterSpacing: '.04em' } }, `☠ BOSS — ${enemy.name}`),
          el('div', { style: { fontSize: '12px', color: 'var(--gold)', marginTop: '2px' } }, `${enemy.gimmickName}: ${enemy.gimmickDesc}`),
        ])
      : el('.phase-banner', {}, `${run.mode === 'ladder' ? 'Versus' : 'Next'}: ${enemy.name} — ${enemy.traitHint}`),
    buildEnemyScout(enemy),
    stage,
    el('.combat-ctl', {}, [
      el(`button.btn${overCap ? '.over-cap' : '.primary'}#readyBtn`, { style: { fontSize: '15px', padding: '10px 22px' }, onclick: startCombat }, overCap ? `Bench ${overCap} to fight` : 'Ready'),
      ...SPEEDS.map(([s, lbl]) => el(`button.btn#spd${spdId(s)}`, { onclick: () => setSpeed(s) }, lbl)),
    ]),
    // Full-width Sell drop bar — always on-screen and the WHOLE bar is the drop target, so it
    // stays droppable even when grabbing a unit swaps the label to "Sell +N⛁" (no resize/shift).
    el('.sell-zone#sellZone', { html: ic('sell') + ' Sell' }),
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
    onEquipUnit: (iid, uid) => { if (Run.equipItem(run, iid, uid)) { Sfx.fuse(); act(() => {}); } },   // equip onto the champion under the pointer (forgiving drop)
    onInspect: (uid) => showInspect(uid),
    onGrab: (uid, kind) => {
      if (kind !== 'item') { const u = Run.findUnit(run, uid); const sz = $('#sellZone'); if (u && sz) sz.innerHTML = ic('sell') + ` Sell <b style="color:var(--gold)">+${Run.sellValueOf(u.defId, u.star)}⛁</b>`; }
      showDragStats(uid, kind);
    },
    onDragOver: (overUid) => updateDragCompare(overUid),
    onRelease: () => { const sz = $('#sellZone'); if (sz) sz.innerHTML = ic('sell') + ' Sell'; hideDragStats(); },
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
  maybeCoach();
}

// P1.4 — progressive first-run onboarding: fire ONE plain-language tip the moment it's relevant
// (a pair on the bench → "buy a third"), each once ever (saved flag), so veterans never see them.
const COACH_TIPS = [
  { id: 'fuse', icon: 'star', text: 'You have two of the same champion — buy a third to fuse them into a stronger ★★!',
    when: () => { const c = {}; for (const u of [...run.board, ...run.bench.filter(Boolean)]) { c[u.defId] = (c[u.defId] || 0) + 1; if (c[u.defId] === 2) return true; } return false; } },
  { id: 'synergy', icon: 'gem', text: 'Synergy active! Matching Origins & Classes unlock team bonuses — see the bar near the top.',
    when: () => $$('.trait-chip.active').length > 0 },
  { id: 'position', icon: 'shield', text: 'Positioning wins fights: put tanky Knights in the FRONT row to shield your ranged units behind them.',
    when: () => run.round >= 2 },
  { id: 'item', icon: 'sword', text: 'Drag two item components onto one champion to forge a powerful item.',
    when: () => (run.items && run.items.length >= 2) },
  { id: 'reroll', icon: 'coffer', text: 'Out of options? Reroll the shop (⟳) for a fresh set of champions.',
    when: () => run.round >= 3 },
];
function coachSeen(id) { try { return (localStorage.getItem('warbound_coach') || '').includes('|' + id + '|'); } catch { return true; } }
function markCoach(id) { try { localStorage.setItem('warbound_coach', (localStorage.getItem('warbound_coach') || '|') + id + '|'); } catch {} }
function maybeCoach() {
  if (run.mode === 'ladder') return;            // onboarding tips fire in the solo/Trials/Endless flow
  for (const t of COACH_TIPS) {
    if (coachSeen(t.id)) continue;
    let ok = false; try { ok = t.when(); } catch { ok = false; }
    if (!ok) continue;
    markCoach(t.id);
    coachToast(t.icon, t.text);
    return;   // one tip at a time
  }
}
function coachToast(icon, text) {
  const t = el('.honor-toast.coach', { style: { background: 'rgba(20,28,40,0.97)', borderColor: 'var(--gold)' } }, [
    el('.ht-medal', { style: { color: 'var(--gold)' }, html: ic(icon) }),
    el('.ht-body', {}, [el('.ht-label', {}, 'Tip'), el('.ht-name', { style: { fontWeight: '600', fontSize: '13px', whiteSpace: 'normal' } }, text)]),
  ]);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 5200);
}

// post-round item draft (Underlords-style pick 1 of 3 components)
function offerDraft(after) {
  const ids = Run.draftComponents(run);
  const pick = (id) => { Run.addItem(run, id); Run.save(run); Sfx.buy(); ov.remove(); after ? after() : renderPlanning(); };
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
function shouldDraft(finishedRound) { return [2].includes(finishedRound); }   // rounds 1 & 7 are Neutral Camps now
function shouldCarousel(finishedRound) { return [5, 10].includes(finishedRound); }   // Auto-Chess carousel, every 5 rounds
function shouldAugment(finishedRound) { return [3, 6, 9].includes(finishedRound); }
function shouldEmblem(finishedRound) { return [4, 8].includes(finishedRound); }   // Warpath-only

// The Carousel (Auto Chess): grab ONE free champion — each comes carrying an item component. Catch-up
// is baked into the wheel (further behind → stronger units). Warpath-family only (bots get no carousel,
// so the Ladder stays fair). Pick the unit you want, the synergy you're building, or the item.
function offerCarousel(after) {
  const picks = Run.draftCarousel(run);
  if (!picks.length) { after ? after() : renderPlanning(); return; }
  const grab = (p) => {
    Run.grantUnit(run, p.unitId); Run.addItem(run, p.itemId);
    Run.save(run); Sfx.fuse(); if (motionOn()) launchConfetti(1200);
    ov.remove(); after ? after() : renderPlanning();
  };
  const ov = el('.overlay', {}, el('.help-card carousel-card', { style: { maxWidth: '470px', width: '95%' } }, [
    el('h2', {}, '✦ The Carousel'),
    el('.sub', {}, 'Grab one free champion — it comes carrying an item to forge with. Take the unit, the synergy, or the item.'),
    el('.carousel-row', {}, picks.map((p) => {
      const def = UNITS_BY_ID[p.unitId]; const it = COMPONENTS[p.itemId];
      return el(`button.carousel-pick cost-${def.cost}`, { onclick: () => grab(p) }, [
        el('.cp-item', { title: it.name, html: ic(it.icon) }),
        el('.cp-art', { html: championSVG(def, { size: 50 }) }),
        el('.cp-nm', {}, def.name),
        el('.cp-tags', {}, `${TRAITS[def.origin].name} · ${TRAITS[def.klass].name}`),
        el('.cp-cost', {}, `${def.cost}⛁ · + ${it.name}`),
      ]);
    })),
  ]));
  document.body.append(ov);
}

// Warpath-only emblem draft: equip on a champion to grant it an extra Origin/Class trait.
function offerEmblem(after) {
  const ids = Run.draftEmblems(run);
  const pick = (id) => { Run.addItem(run, id); Run.save(run); Sfx.buy(); ov.remove(); after ? after() : renderPlanning(); };
  const ov = el('.overlay', {}, el('.help-card', {}, [
    el('h2', {}, 'Choose an Emblem'),
    el('.sub', {}, 'Equip on a champion to grant it an extra trait — force a synergy you couldn’t reach.'),
    el('.draft-row', {}, ids.map((id) => {
      const d = EMBLEMS[id]; const t = Object.keys(d.traitGrant)[0]; const tr = TRAITS[t];
      const stat = Object.entries(d.mods).map(([k, v]) => `+${v < 1 ? Math.round(v * 100) + '%' : v} ${k}`).join(', ');
      return el('button.draft-pick', { onclick: () => pick(id) }, [
        el('span.di', { html: ic(d.icon) }), el('span.dn', {}, d.name),
        el('span.dm', { style: { color: tr.color } }, `+1 ${tr.name}${stat ? ' · ' + stat : ''}`),
      ]);
    })),
  ]));
  document.body.append(ov);
}

// Loot from a cleared Neutral Camp (creep round): one guaranteed item component, auto-granted.
function dropCreepLoot(after) {
  const id = Run.randomComponent(run);
  Run.addItem(run, id); Run.save(run); Sfx.fuse();
  if (motionOn()) launchConfetti(1100);
  const d = COMPONENTS[id];
  const ov = el('.overlay', {}, el('.help-card', { style: { maxWidth: '300px' } }, [
    el('h2', {}, '⚑ Camp cleared!'),
    el('.sub', {}, 'The wild monsters dropped an item — combine two on a champion to forge gear.'),
    el('.draft-row', {}, [el('.draft-pick', { style: { flex: 'none', minWidth: '120px', margin: '0 auto' } }, [
      el('span.di', { html: ic(d.icon) }), el('span.dn', {}, d.name),
      el('span.dm', {}, Object.entries(d.mods).map(([k, v]) => `+${v < 1 ? Math.round(v * 100) + '%' : v} ${k}`).join(', ')),
    ])]),
    el('button.btn.primary.go', { onclick: () => { ov.remove(); after ? after() : renderPlanning(); } }, 'Take the loot ▶'),
  ]));
  document.body.append(ov);
}

// Augment draft (pick 1 of 3 run-shaping powers), with skip-for-gold, banish, reroll.
function offerAugment(after) {
  const SKIP_GOLD = 4;
  let curOv = null;     // the augment overlay currently shown (reroll replaces it) — remove THIS one, not whatever overlay happens to be first in the DOM
  const done = () => { Run.save(run); if (curOv) curOv.remove(); after ? after() : renderPlanning(); };
  const render = () => {
    if (curOv) curOv.remove();
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
    curOv = ov;
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
  if (u) showUnitInfo(UNITS_BY_ID[u.defId], u.star, u.items, { sell: Run.sellValueOf(u.defId, u.star) });
}
// the ability's headline output number at a given star (so the upgrade benefit is visible).
function abilityValue(def, star) {
  const a = def.ability, m = STAR_MULT[star] || 1;
  if (a.type === 'magic' || a.type === 'heal' || a.type === 'shield') return Math.round((a.ap || 0) * m);
  if (a.type === 'physical') return Math.round(statsForStar(def, star).ad * (a.adRatio || 1.5));
  if (a.type === 'summon') return Math.round((a.summonAd || 0) * m);
  return 0;
}
// Plain-language summary of a unit's PASSIVE signature(s), keyed by (trigger:op). '' if none.
const PASSIVE_PHRASE = {
  'spawn:guard': 'soaks 15% of adjacent allies’ incoming damage',
  'hit:sacrifice': 'spends a little of its own HP each strike for bonus magic',
  'hit:focus': 'locks onto one target and ramps up damage the longer it fires',
  'spawn:casterScale': 'gains Ability Power for each allied caster',
  'hit:bonusVs': 'lands extra damage when striking a healthy foe',
  'kill:gainManaSelf': 'refunds mana on a kill, chaining its strikes',
  'spawn:rageSelf': 'builds attack speed the longer it fights',
  'allyDeath:raiseCorpse': 'raises a Risen whenever an ally falls',
  'spawn:mark': 'marks the enemy carry — the whole team hits it harder',
  'cast:buffAS': 'each cast briefly hastes the allies beside it',
  'dodge:buffAS': 'a dodged attack powers up its next strikes',
  'hit:magic': 'every few autos looses a bonus bolt',
  'allyDeath:heal': 'bursts healing onto the wounded when an ally dies',
  'spawn:lifesteal': 'always leeches life from its attacks',
  'attacked:shield': 'hardens with a shield as it is struck',
  'spawn:thorns': 'reflects damage back at attackers',
  'lowHp:shield': 'phases out behind a shield when badly hurt',
};
function passiveSummary(a) {
  const entries = a.passive ? (Array.isArray(a.passive) ? a.passive : [a.passive]) : [];
  const phrases = [];
  for (const p of entries) {
    const op = (p.verbs && p.verbs[0] && p.verbs[0].op) || '';
    const ph = PASSIVE_PHRASE[p.on + ':' + op];
    if (ph) phrases.push(ph);
  }
  if (!phrases.length) return '';
  return phrases.join('; ').replace(/^./, (c) => c.toUpperCase()) + '.';
}
function abilityDesc(def, star) {
  const a = def.ability, v = abilityValue(def, star);
  if (a.noCast) return passiveSummary(a) || 'A purely passive champion.';   // no cast — identity is the passive
  let s;
  // A hand-written blurb (when present) describes the spell's distinct IDENTITY — preferred over the
  // generic by-type text below; `{v}` is filled with the headline value at the current star.
  if (a.blurb) s = a.blurb.replace(/\{v\}/g, v);
  else if (a.type === 'magic') s = `Deals ${v} magic damage${a.target === 'cluster' ? ' to all nearby foes' : ''}.`;
  else if (a.type === 'physical') s = a.target === 'lowestEnemyHP' ? `Executes the lowest-HP enemy for ${Math.round(v * 1.3)}.` : a.target === 'mostEnemies' ? `Hits several foes for ${Math.round(v * 0.9)} each.` : a.stun ? `Smashes for ${v} and stuns.` : `Cleaves nearby foes for ${v}.`;
  else if (a.type === 'heal') s = `Heals the most wounded ally for ${v}.`;
  else if (a.type === 'shield') s = `Shields the most wounded ally for ${v}.`;
  else if (a.type === 'summon') s = `Raises a creature (${Math.round((a.summonHp || 0) * (STAR_MULT[star] || 1))} HP, ${v} AD).`;
  else s = abilityText(a);
  const ps = passiveSummary(a);
  return ps ? `${s}  Passive: ${ps.replace(/^./, (c) => c.toLowerCase())}` : s;
}
// Reusable champion detail sheet (used by inspect, shop (i), and the codex).
// Shows a per-STAR scaling table (HP / Attack / Ability across ★1–★3) so the upgrade payoff is clear.
function showUnitInfo(def, star = 1, items = [], opts = {}) {
  const s = statsForStar(def, star);
  Sfx.click();
  const STARS = [1, 2, 3];
  const abScales = !def.ability.noCast && ['magic', 'heal', 'shield', 'physical', 'summon'].includes(def.ability.type);
  const abLabel = { magic: 'Spell', heal: 'Heal', shield: 'Shield', summon: 'Minion AD' }[def.ability.type] || 'Ability';
  const ssRow = (label, fn) => el('.ss-row', {}, [el('span.ss-l', {}, label), ...STARS.map((st) => el(`span.ss-v${st === star ? ' cur' : ''}`, {}, String(fn(st))))]);
  const ov = el('.overlay', { onclick: (e) => { if (e.target.classList.contains('overlay')) e.currentTarget.remove(); } },
    el('.help-card', { style: { maxWidth: '320px' } }, [
      el('h2', { style: { fontSize: '19px' } }, `${def.name} ${star > 1 ? '★'.repeat(star) : ''}`),
      el('.unit-traits', {}, (() => {
        const natural = [def.origin, def.klass];
        const granted = [...new Set(traitGrantsFor(items || []))].filter((t) => !natural.includes(t));   // emblem-granted, not already natural
        const chip = (tid, viaEmblem) => { const t = TRAITS[tid]; if (!t) return null;
          return el(`.trait-chip.active${viaEmblem ? ' granted' : ''}`, { onclick: () => showTraitInfo(tid), title: viaEmblem ? `${t.name} — granted by an Emblem` : '' },
            [el('span.dot', { style: { background: t.color } }), el('span', {}, t.name), viaEmblem ? el('span.ce', { html: ic('crown') }) : null]); };
        return [...natural.map((t) => chip(t, false)), ...granted.map((t) => chip(t, true))].filter(Boolean);
      })()),
      el('.sub', {}, `Cost ${def.cost}⛁ · ${def.range === 1 ? 'melee' : 'ranged ' + def.range}`),
      // P0.3 — teach POSITIONING (the genre's core skill): how this unit fights, so you know where
      // to place it. Dive units want safety, ranged want screening, melee want the front.
      (() => {
        const t = def.dive ? 'Dives to the enemy back line — it kills their carries but folds if focused. Keep it survivable.'
          : def.range >= 2 ? 'Fights from the back — screen it behind a front line so it can fire safely.'
          : 'Holds the front — engages the nearest foe. Put it up front to shield your ranged units.';
        return el('.iposition', { style: { fontSize: '12px', color: 'var(--ink-dim)', margin: '2px 0 6px', display: 'flex', gap: '6px', alignItems: 'baseline' } },
          [el('span', { style: { color: 'var(--gold)', fontWeight: '700', whiteSpace: 'nowrap' } }, '⌖ Position'), el('span', {}, t)]);
      })(),
      // per-star scaling — the upgrade benefit, with the current star highlighted
      el('.star-scaling', {}, [
        el('.ss-row.ss-head', {}, [el('span.ss-l', {}, 'Upgrade'), ...STARS.map((st) => el(`span.ss-v${st === star ? ' cur' : ''}`, {}, '★'.repeat(st)))]),
        ssRow('Health', (st) => statsForStar(def, st).hp),
        ssRow('Attack', (st) => statsForStar(def, st).ad),
        abScales ? ssRow(abLabel, (st) => abilityValue(def, st)) : null,
      ]),
      el('.istats', {}, [
        el('.istat', {}, [el('span', { style: { color: 'var(--ink-dim)' } }, 'Atk speed'), el('span', {}, s.as.toFixed(2))]),
        el('.istat', {}, [el('span', { style: { color: 'var(--ink-dim)' } }, 'Armor'), el('span', {}, s.armor)]),
        el('.istat', {}, [el('span', { style: { color: 'var(--ink-dim)' } }, 'Magic res'), el('span', {}, s.mr)]),
        el('.istat', {}, [el('span', { style: { color: 'var(--ink-dim)' } }, 'Mana'), el('span', {}, def.maxMana)]),
      ]),
      el('.iability', {}, [el('b', { html: ic('burst') + ' ' + def.ability.name + ' ' }), el('span', { style: { color: 'var(--ink-dim)' } }, abilityDesc(def, star))]),
      // 3★ ultimate — the qualitative force-multiplier; lit gold once the unit reaches ★★★.
      ULT3[def.defId] ? el(`.iult${star >= 3 ? ' active' : ''}`, {}, [el('b', {}, '★★★ '), el('span', {}, ULT3[def.defId])]) : null,
      opts.sell != null ? el('.isell', {}, [el('span', { style: { color: 'var(--ink-dim)' } }, 'Sell value'), el('span', { html: `<b style="color:var(--gold)">+${opts.sell}⛁</b>` })]) : null,
      (items && items.length) ? el('.iitems', {}, ['Items: ', items.map((id) => itemLabel(id)).join(', ')]) : null,
      el('button.btn.primary.go', { onclick: () => ov.remove() }, 'Close'),
    ]));
  document.body.append(ov);
}

// ---------- Drag stats: a floating, click-through panel that shows the dragged champion/item's
// stats while you drag, and a dragged-vs-target comparison when you hover one champion over
// another. Gated by the HUD "eye" toggle (dragStatsOn). Wired via the drag controller's
// onGrab / onDragOver / onRelease callbacks. ----------
let _dragCard = null;   // the mounted panel (null when not dragging)
let _dragInfo = null;   // { kind:'unit', def, star } for the dragged champion (for comparisons)

const DSTAT_ROWS = [['hp', 'Health'], ['ad', 'Attack'], ['as', 'Atk spd'], ['armor', 'Armor'], ['mr', 'Magic res'], ['range', 'Range'], ['maxMana', 'Mana']];
function dstatRaw(def, star, k) { if (k === 'hp' || k === 'ad') return statsForStar(def, star)[k]; if (k === 'as') return def.as; return def[k]; }
function dstatDisp(def, star, k) { const v = dstatRaw(def, star, k); return k === 'as' ? v.toFixed(2) : String(v); }
// readable item-mod lines, e.g. {ad:0.18} -> "+18% Attack Damage"
const DMOD_LABEL = { ad: 'Attack Damage', as: 'Attack Speed', ap: 'Ability Power', hp: 'Health', armor: 'Armor', mr: 'Magic Resist', critChance: 'Crit Chance', critDmg: 'Crit Damage', thorns: 'Thorns', vamp: 'Lifesteal', regen: 'Regen', shield: 'Shield', revive: 'Revive' };
function dragModLines(mods) { return Object.entries(mods).map(([k, v]) => `+${(v < 1 && v > -1) ? Math.round(v * 100) + '%' : v} ${DMOD_LABEL[k] || k}`); }

function unitStatCol(def, star) {
  return el('.ds-col', {}, [
    el('.ds-name', { html: championSVG(def, { size: 22 }) + `<span>${def.name}${star > 1 ? ' ' + '★'.repeat(star) : ''}</span>` }),
    el('.ds-sub', {}, `Cost ${def.cost}⛁ · ${def.range === 1 ? 'melee' : 'ranged ' + def.range}`),
    ...DSTAT_ROWS.map(([k, label]) => el('.ds-row', {}, [el('span.ds-l', {}, label), el('span.ds-v', {}, dstatDisp(def, star, k))])),
    el('.ds-ability', {}, [el('b', {}, def.ability.name)]),
  ]);
}
function unitCompareCol(dDef, dStar, oDef, oStar) {
  const head = el('.ds-chead', {}, [el('span.ds-l', {}, 'Stat'),
    el('span.ds-cv', {}, dDef.name.split(' ')[0]), el('span.ds-cv', {}, oDef.name.split(' ')[0])]);
  const rows = DSTAT_ROWS.map(([k, label]) => {
    const dv = dstatRaw(dDef, dStar, k), ov = dstatRaw(oDef, oStar, k);
    const cls = dv > ov ? ' up' : dv < ov ? ' down' : '';
    return el('.ds-crow', {}, [el('span.ds-l', {}, label),
      el(`span.ds-cv${cls}`, {}, dstatDisp(dDef, dStar, k)), el('span.ds-cv', {}, dstatDisp(oDef, oStar, k))]);
  });
  return el('.ds-compare', {}, [el('.ds-ctitle', {}, 'Dragging ▸ vs ◂ target'), head, ...rows]);
}

// one stat column for an item id (used for the dragged item AND the forged-result preview)
function itemDragCol(id) {
  const d = itemDef(id); if (!d) return el('.ds-col', {}, []);
  const tg = d.traitGrant ? Object.keys(d.traitGrant)[0] : null;
  return el('.ds-col', {}, [
    el('.ds-name', { html: ic(d.icon) + `<span>${d.name}</span>` }),
    ...(d.mods ? dragModLines(d.mods).map((t) => el('.ds-row', {}, [el('span.ds-l', {}, t)])) : []),
    tg ? el('.ds-row', {}, [el('span.ds-l', {}, `+1 ${TRAITS[tg] ? TRAITS[tg].name : tg} synergy`)]) : null,
  ]);
}
function showDragStats(uid, kind) {
  if (!dragStatsOn()) return;
  hideDragStats();
  let body = null;
  if (kind === 'item') {
    const it = (run.items || []).find((x) => x.iid === uid); if (!it || !itemDef(it.id)) return;
    _dragInfo = { kind: 'item', id: it.id };
    body = itemDragCol(it.id);
  } else {
    const u = Run.findUnit(run, uid); if (!u) return;
    const def = UNITS_BY_ID[u.defId]; if (!def) return;
    _dragInfo = { kind: 'unit', def, star: u.star, uid };
    body = unitStatCol(def, u.star);
  }
  _dragCard = el('.drag-stats', {}, [body]);
  document.body.append(_dragCard);
}
function updateDragCompare(overUid) {
  if (!_dragCard || !_dragInfo) return;
  const overU = overUid ? Run.findUnit(run, overUid) : null;
  // ITEM drag: if hovering a unit that already holds a component this item combines with,
  // preview the forged item's stats under the dragged item's stats.
  if (_dragInfo.kind === 'item') {
    const children = [itemDragCol(_dragInfo.id)];
    if (overU) {
      let forged = null;
      for (const compId of (overU.items || [])) { const c = combineItems(_dragInfo.id, compId); if (c) { forged = c; break; } }
      const overDef = UNITS_BY_ID[overU.defId];
      if (forged) children.push(el('.ds-forge', {}, [el('.ds-ctitle', {}, `▸ on ${overDef ? overDef.name.split(' ')[0] : 'unit'} — forges`), itemDragCol(forged)]));
    }
    _dragCard.replaceChildren(...children);
    return;
  }
  // UNIT drag: dragged-vs-target comparison
  const overDef = overU ? UNITS_BY_ID[overU.defId] : null;
  if (overDef && overU.uid !== _dragInfo.uid) _dragCard.replaceChildren(unitCompareCol(_dragInfo.def, _dragInfo.star, overDef, overU.star));
  else _dragCard.replaceChildren(unitStatCol(_dragInfo.def, _dragInfo.star));
}
function hideDragStats() { if (_dragCard) { _dragCard.remove(); _dragCard = null; } _dragInfo = null; }
// Trait detail: every breakpoint's effect (active one highlighted) + which champions have it.
// Warband stats as a tidy overlay opened from the top bar (snapshot: live during a fight, else last battle).
function showStats() {
  Sfx.click();
  const live = inCombat && player && typeof player.playerStats === 'function';
  const stats = (live ? player.playerStats() : (lastBattleStats || [])).slice().sort((a, b) => b.dealt - a.dealt);
  const row = (s) => { const d = UNITS_BY_ID[s.defId]; return el('.wstat-row', {}, [
    el('.wstat-champ', { html: d ? championSVG(d, { size: 26 }) : '' }),
    el('.wstat-name', {}, d ? d.name : '—'),
    el('span.wstat-ic', { html: ic('sword') }), el('span.wstat-dealt', {}, String(s.dealt)),
    el('span.wstat-ic.tank', { html: ic('shield') }), el('span.wstat-tank', {}, String(s.tanked)),
  ]); };
  const ov = el('.overlay', { onclick: (e) => { if (e.target.classList.contains('overlay')) e.currentTarget.remove(); } },
    el('.help-card', { style: { maxWidth: '340px' } }, [
      el('h2', { style: { fontSize: '19px' } }, live ? 'Warband — this fight' : 'Last battle'),
      el('.sub', {}, 'Damage dealt and damage tanked by each of your champions.'),
      stats.length
        ? el('.wstat-list', {}, stats.map(row))
        : el('.sub', { style: { marginTop: '6px' } }, 'No battle yet — finish a round and your champions’ numbers show up here.'),
      el('button.btn.primary.go', { onclick: () => ov.remove() }, 'Close'),
    ]));
  document.body.append(ov);
}

function showTraitInfo(traitId) {
  const def = TRAITS[traitId]; if (!def) return;
  Sfx.click();
  const owned = new Set(run.board.map((u) => u.defId).concat(run.bench.filter(Boolean).map((u) => u.defId)));
  const playerDefs = defsWithGrants(run.board);
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
    } else if (which === 'augments') {
      const list = el('.codex-list');
      const order = { common: 0, rare: 1, prismatic: 2 };
      for (const [id, a] of Object.entries(AUGMENTS).sort((x, y) => order[x[1].tier] - order[y[1].tier])) list.append(
        el(`.aug-row tier-${a.tier}`, { onclick: () => showAugmentInfo(id) }, [
          el('span.aug-ic', { html: augIcon(a) }), el('span', { style: { fontWeight: 700 } }, a.name),
          el('span', { style: { color: 'var(--ink-faint)', fontSize: '10px', marginLeft: 'auto' } }, TIER_LABEL[a.tier]),
        ]));
      body.append(list);
    } else if (which === 'items') {
      const list = el('.codex-list');
      const modTxt = (mods) => Object.entries(mods || {}).map(([k, v]) => `+${(v < 1 && v > -1) ? Math.round(v * 100) + '%' : v} ${DMOD_LABEL[k] || k}`).join(', ');
      const section = (title, obj, sub) => {
        list.append(el('.codex-sec', { style: { fontSize: '11px', fontWeight: '800', letterSpacing: '.05em', color: 'var(--ink-dim)', margin: '8px 2px 2px' } }, title));
        for (const [, it] of Object.entries(obj)) list.append(el('.item-row', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 2px' } }, [
          el('span', { style: { color: 'var(--gold)' }, html: ic(it.icon || 'sword') }),
          el('span', { style: { fontWeight: '700', minWidth: '116px' } }, it.name),
          el('span', { style: { fontSize: '11px', color: 'var(--ink-dim)' } }, sub ? sub(it) : modTxt(it.mods)),
        ]));
      };
      section('Components (combine two)', COMPONENTS);
      section('Forged items', ITEMS);
      section('Emblems (grant a synergy)', EMBLEMS, (it) => `Grants ${TRAITS[Object.keys(it.traitGrant)[0]] ? TRAITS[Object.keys(it.traitGrant)[0]].name : ''}` + (Object.keys(it.mods || {}).length ? ' · ' + modTxt(it.mods) : ''));
      body.append(list);
    } else {
      // Bestiary — the unique boss CREATURES of the Trials, each with its signature mechanic.
      const list = el('.codex-list');
      for (const c of CREATURES_LIST) list.append(el('.beast-row', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 2px' } }, [
        el('span', { style: { width: '34px', height: '38px', flex: '0 0 auto' }, html: championSVG(c, { size: 34 }) }),
        el('div', { style: { display: 'flex', flexDirection: 'column', lineHeight: '1.2' } }, [
          el('span', { style: { fontWeight: '700' } }, c.name),
          el('span', { style: { fontSize: '11px', color: 'var(--ink-dim)' } }, c.ability ? `${c.ability.name} — ${abilityText(c.ability)}` : 'A fearsome boss.'),
        ]),
      ]));
      body.append(list);
    }
  };
  const tabs = el('.codex-tabs', { style: { flexWrap: 'wrap' } });
  const tabDefs = [['units', `Champions (${UNITS.length})`], ['traits', `Synergies (${Object.keys(TRAITS).length})`], ['augments', `Augments (${Object.keys(AUGMENTS).length})`], ['items', 'Items'], ['bestiary', `Bestiary (${CREATURES_LIST.length})`]];
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

function setSpeed(s) { combatSpeed = s; try { localStorage.setItem('warbound_speed', String(s)); } catch {} if (player) player.setSpeed(s); highlightSpeed(); }
function highlightSpeed() { for (const [s] of SPEEDS) { const b = $(`#spd${spdId(s)}`); if (b) b.classList.toggle('primary', combatSpeed === s); } }
function setBanner(t) { const b = $('.phase-banner'); if (b) b.textContent = t; }
function toggleSound() { audioResume(); setSound(!soundOn()); const b = $('#soundBtn'); if (b) b.innerHTML = ic(soundOn() ? 'sound' : 'mute'); if (soundOn()) Sfx.click(); }
// Screen shake was removed (laggy). `motionOn()` now only gates the non-shake juice
// (confetti / reveal flashes), which stays on unless the OS asks for reduced motion.
function motionOn() { try { return !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return true; } }
// ---- install-as-app (PWA) ----
function isStandalone() { try { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; } catch { return false; } }
function promptInstall() {
  const p = window.__installPrompt;
  if (p && p.prompt) { p.prompt(); if (p.userChoice) p.userChoice.finally(() => { window.__installPrompt = null; }); return; }
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  modal2('Install Warbound', iOS
    ? 'In Safari, tap the Share button (a square with an upward arrow), then “Add to Home Screen”. Warbound then opens full-screen like a real app — and works offline.'
    : 'Open your browser’s menu (⋮ or the install icon in the address bar) and choose “Install app” / “Add to Home screen”. Warbound then opens full-screen like a real app — and works offline.');
}

// On-screen stats while dragging a champion/item (with a dragged-vs-target comparison). Toggle in Options.
function dragStatsOn() { try { return localStorage.getItem('warbound_dragstats') !== '0'; } catch { return true; } }
function toggleDragStats() { try { localStorage.setItem('warbound_dragstats', dragStatsOn() ? '0' : '1'); } catch {} Sfx.click(); renderPlanning(); }
// Battle stats ON THE BOARD (opt-in, default off): each of your champions shows last fight's
// damage dealt & tanked right on its tile, so you can read your carries/tanks at a glance.
function battleStatsOn() { try { return localStorage.getItem('warbound_battlestats') === '1'; } catch { return false; } }
// Sum the last battle's dealt/tanked for a defId (multiple same-id units aggregate). null if none.
// PER-INSTANCE: this board unit's OWN last-fight stats (matched by uid through the captured
// spawn-order), never summed with other units that share its name. A summoner's number already
// includes its minions' damage (credited home in the combat renderer).
function battleStatForUnit(u) {
  if (!lastBattleStats || !lastBattleUids || !u) return null;
  const i = lastBattleUids.indexOf(u.uid);
  const s = i >= 0 ? lastBattleStats[i] : null;
  return s ? { dealt: s.dealt, tanked: s.tanked } : null;
}

// Consolidated Options & menu — ONE HUD button opens this (replaces the old row of top-bar
// buttons). Holds the view toggles, sound, the info screens, and a way to LEAVE a run you may
// have entered by mistake (with a confirm so a real run isn't abandoned by a stray tap).
function showOptions() {
  Sfx.click();
  function done() { ov.remove(); renderPlanning(); }   // re-render so the board reflects toggle changes
  function askQuit() {
    card.replaceChildren(
      el('h2', { style: { fontSize: '20px' } }, 'Leave this run?'),
      el('.opt-sub', { style: { lineHeight: '1.5', margin: '4px 0 14px' } }, run.mode === 'ladder'
        ? 'You’ll forfeit this ladder game and return to the menu. Quitting doesn’t change your rank.'
        : 'You’ll return to the menu and this run ends. Realms you’ve already conquered and Spoils you’ve banked are kept — only this run’s in-progress board is lost.'),
      el('.opt-confirm', {}, [
        el('button.btn.danger', { style: { padding: '11px 20px' }, onclick: () => { ov.remove(); chooseMode(); } }, [iconEl('back'), el('span', { style: { marginLeft: '6px' } }, 'Quit to menu')]),
        el('button.btn.primary', { style: { padding: '11px 20px' }, onclick: () => { ov.remove(); showOptions(); } }, 'Stay'),
      ]),
    );
  }
  const toggleRow = (iconName, label, sub, isOn, flip) => {
    const sw = el('.opt-switch', {}, el('.opt-knob'));
    const row = el('.opt-row.toggle', { onclick: () => { flip(); const on = isOn(); row.classList.toggle('on', on); sw.classList.toggle('on', on); } },
      [el('.opt-ic', { html: ic(iconName) }), el('.opt-text', {}, [el('.opt-label', {}, label), el('.opt-sub', {}, sub)]), sw]);
    const on = isOn(); row.classList.toggle('on', on); sw.classList.toggle('on', on);
    return row;
  };
  const actionRow = (iconName, label, sub, fn) => el('.opt-row.action', { onclick: () => { ov.remove(); fn(); } },
    [el('.opt-ic', { html: ic(iconName) }), el('.opt-text', {}, [el('.opt-label', {}, label), el('.opt-sub', {}, sub)]), el('.opt-go', { html: '›' })]);
  const card = el('.help-card.options-card', { style: { maxWidth: '340px', width: '92%' } }, [
    el('h2', { style: { fontSize: '20px' }, html: ic('bars') + ' Options' }),
    el('.opt-group', {}, [
      toggleRow('bars', 'Battle stats on board', 'Show each champion’s last-fight damage & tanked, right on its tile', battleStatsOn, () => { try { localStorage.setItem('warbound_battlestats', battleStatsOn() ? '0' : '1'); } catch {} Sfx.click(); }),
      toggleRow('eye', 'Stats while dragging', 'Show a champion’s full stats while you drag it', dragStatsOn, () => { try { localStorage.setItem('warbound_dragstats', dragStatsOn() ? '0' : '1'); } catch {} Sfx.click(); }),
      toggleRow('sound', 'Sound', 'Music & sound effects', soundOn, () => { audioResume(); setSound(!soundOn()); if (soundOn()) Sfx.click(); }),
    ]),
    el('.opt-group', {}, [
      actionRow('sword', 'Last battle report', 'Damage dealt & tanked per champion, full list', showStats),
      actionRow('codex', 'Codex', 'Browse every champion, synergy & augment', () => showCodex('units')),
      actionRow('help', 'How to play', 'The basics, again', showHelp),
    ]),
    el('.opt-group', {}, [el('button.btn.opt-quit', { onclick: askQuit }, [iconEl('back'), el('span', { style: { marginLeft: '6px' } }, 'Quit to main menu')])]),
    el('button.btn.primary.go', { onclick: done }, 'Done'),
  ]);
  const ov = el('.overlay', { onclick: (e) => { if (e.target.classList.contains('overlay')) done(); } }, card);
  document.body.append(ov);
}

// Explain the economy with the player's CURRENT live values.
// Shop odds grid: for each level (1–9), the % chance a shop slot rolls each cost tier (rarity).
// Current level row highlighted, so you can see exactly what levelling up unlocks.
const COST_COLORS = ['#9aa6b8', '#5fd07a', '#5aa6ff', '#c79bff', '#ffce5c'];
function shopOddsTable(cur) {
  const head = el('.so-row.so-head', {}, [el('span.so-lvl', {}, 'Lv'), ...COST_COLORS.map((c, i) => el('span.so-c', { style: { color: c } }, `${i + 1}◆`))]);
  const rows = [];
  for (let lv = 1; lv <= Run.MAX_LEVEL; lv++) {
    const o = Run.SHOP_ODDS[lv] || Run.SHOP_ODDS[Run.MAX_LEVEL];
    rows.push(el(`.so-row${lv === cur ? ' cur' : ''}`, {}, [el('span.so-lvl', {}, String(lv)), ...o.map((p, i) => el('span.so-c', { style: { color: p ? COST_COLORS[i] : 'var(--ink-faint)' } }, p ? `${p}` : '·'))]));
  }
  return el('.shop-odds', {}, [head, ...rows]);
}
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
      // Shop odds by level — the chance each shop slot is a unit of a given cost (rarity). Current level highlighted.
      el('.sub', { style: { marginTop: '6px' } }, 'Shop odds by level (chance per cost)'),
      shopOddsTable(run.level),
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
    ['shield', '<b>Position matters:</b> your <b>front row</b> engages first — put tough units (knights) there to shield your <b>ranged</b> units (mages, archers), who fight best from the <b>back row</b>. Assassins teleport to strike the enemy back line. Then press Ready.'],
    ['eye', '<b>Tap a champion</b> to inspect its stats & ability. Watch the dimmed enemy preview to counter them.'],
    run.mode === 'ladder'
      ? ['trophy', '<b>Last warband standing wins.</b> You and 7 rival warlords share one champion pool. Lose a fight and your <b>HP</b> drops — when it hits 0 you\'re out. Outlast everyone to win.']
      : run.mode === 'trials'
        ? ['trophy', `Slay all <b>${TRIAL_COUNT} boss monsters</b> of the gauntlet (survive on <b>5 lives</b>). Each boss has its own deadly mechanic — learn it, then build to beat it.`]
        : run.mode === 'endless'
          ? ['trophy', 'Hold against <b>endless escalating waves</b> on <b>5 lives</b> — every 10th wave is a boss. There is no winning: <b>bank Spoils for how deep you march.</b>']
          : ['trophy', 'Beat all <b>10 warbands</b> to <b>conquer the realm</b>. Lose a fight? <b>You replay that warband until you win</b> — your gold & board keep growing each try, and you get extra help while you\'re stuck, so press on. Each realm conquered unlocks the next, harder one.'],
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

// P0.1 — "every loss has a clear reason" (DESIGN pillar #2). Read the just-finished fight's event
// timeline into a plain-language verdict + a small damage/tank breakdown. Pure: events in, summary
// out, using only data the sim already emits (spawn/damage/cast/faint).
function fightVerdict(events, won) {
  const u = {};
  for (const e of events) if (e.type === 'spawn' && e.defId && e.defId !== 'summon' && u[e.id] === undefined)
    u[e.id] = { team: e.team, defId: e.defId, star: e.star || 1, dealt: 0, tanked: 0, casts: 0, died: false };
  for (const e of events) {
    if (e.type === 'damage') { if (u[e.src]) u[e.src].dealt += e.amount || 0; if (u[e.id]) u[e.id].tanked += e.amount || 0; }
    else if (e.type === 'cast' && u[e.id]) u[e.id].casts++;
    else if (e.type === 'faint' && u[e.id]) u[e.id].died = true;
  }
  const all = Object.values(u);
  const P = all.filter((x) => x.team === 'player'), E = all.filter((x) => x.team === 'enemy');
  const nm = (x) => (x && UNITS_BY_ID[x.defId] && UNITS_BY_ID[x.defId].name) || 'your unit';
  const sum = (a, k) => a.reduce((s, x) => s + x[k], 0);
  const val = (x) => (UNITS_BY_ID[x.defId] ? UNITS_BY_ID[x.defId].cost : 1) * (x.star || 1);
  const byDealt = P.slice().sort((a, b) => b.dealt - a.dealt);
  const byTank = P.slice().sort((a, b) => b.tanked - a.tanked);
  const carry = P.slice().sort((a, b) => val(b) - val(a))[0];
  const pDealt = sum(P, 'dealt'), eDealt = sum(E, 'dealt'), pTank = sum(P, 'tanked'), eTank = sum(E, 'tanked');
  let text;
  if (won) text = byDealt[0] && byDealt[0].dealt > 0 ? `Clean win — ${nm(byDealt[0])} carried with ${Math.round(byDealt[0].dealt)} damage.` : 'Victory — well fought.';
  else if (carry && carry.died && carry.casts === 0) text = `Your carry ${nm(carry)} died before it could cast — tuck it in a back corner behind your frontline.`;
  else if (pDealt > eDealt * 1.08 && pTank < eTank) text = `You out-damaged them but folded fast — add a tankier frontline (Knight) to buy your carries time.`;
  else if (eTank > pTank * 1.25) text = `Their frontline out-tanked yours — bring armor/MR shred, or upgrade a damage carry.`;
  else if (byDealt[0] && byDealt[0].dealt < eDealt * 0.4) text = `Your damage came up short — three-star a carry or deepen a damage synergy.`;
  else text = `Their board was simply stronger — upgrade a unit to 3★ or push a synergy to its next tier.`;
  return {
    text, won,
    top: byDealt.filter((x) => x.dealt > 0).slice(0, 2).map((x) => ({ defId: x.defId, dealt: Math.round(x.dealt) })),
    tank: byTank[0] && byTank[0].tanked > 0 ? { defId: byTank[0].defId, tanked: Math.round(byTank[0].tanked) } : null,
  };
}
// The after-action card shown on the next planning screen — the verdict + a compact dmg/tank read.
function verdictCard(v) {
  if (!v) return null;
  const accent = v.won ? 'var(--hp)' : 'var(--danger)';
  const chip = (s, label) => el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
    el('div', { style: { width: '30px', height: '34px', flex: '0 0 auto' }, html: UNITS_BY_ID[s.defId] ? championSVG(UNITS_BY_ID[s.defId], { size: 30 }) : '' }),
    el('div', { style: { display: 'flex', flexDirection: 'column', lineHeight: '1.15' } }, [
      el('span', { style: { fontSize: '10px', color: 'var(--ink-dim)' } }, (UNITS_BY_ID[s.defId] || {}).name || ''),
      el('span', { style: { fontSize: '11px', fontWeight: '700' } }, label),
    ]),
  ]);
  const chips = (v.top || []).map((t) => chip(t, `⚔ ${t.dealt}`));
  if (v.tank) chips.push(chip(v.tank, `🛡 ${v.tank.tanked}`));
  return el('div', { style: { background: 'rgba(20,24,34,0.7)', border: `1px solid ${accent}`, borderLeft: `4px solid ${accent}`, borderRadius: '10px', padding: '8px 12px', margin: '4px 0', display: 'flex', flexDirection: 'column', gap: '6px' } }, [
    el('div', {}, [
      el('span', { style: { fontSize: '10px', fontWeight: '800', letterSpacing: '.06em', color: accent, marginRight: '8px' } }, v.won ? 'WHY YOU WON' : 'WHY YOU LOST'),
      el('span', { style: { fontSize: '13px' } }, v.text),
    ]),
    chips.length ? el('div', { style: { display: 'flex', gap: '18px', flexWrap: 'wrap' } }, chips) : null,
  ]);
}

// ---------- combat ----------
async function startCombat() {
  if (inCombat) return;
  // You may PLACE more champions than your level allows, but you can't march to battle over-capped —
  // bench/sell the excess (or Buy XP to raise the cap) first.
  const over = run.board.length - Run.boardLimit(run);
  if (over > 0) { Sfx.click(); modal2('Too many champions', `Your board holds ${run.board.length}, but at level ${run.level} you can field only ${Run.boardLimit(run)}. Bench or sell ${over} champion${over > 1 ? 's' : ''} — or Buy XP to raise your limit — then march.`); return; }
  audioResume();
  inCombat = true;
  lastBattleStats = null;   // a new battle clears the previous battle's per-unit stats
  lastVerdict = null;       // and the previous after-action verdict
  const enemy = getOpponent();
  const playerBoard = run.board.map(({ defId, star, col, row }) => ({ defId, star, col, row }));
  lastBattleUids = run.board.map((b) => b.uid);   // same order the sim spawns + reports stats in
  const enemyBoard = enemy.units.map(({ defId, star, col, row }) => ({ defId, star, col, row }));
  const seed = hashSeed(run.seed, run.round);
  // build the combat aug: player augments, plus (in ladder) warlord powers + the lobby modifier
  const soloBundle = Object.assign(augmentBundle(run.augments), { traitBonus: teamTraitBonus() });
  if (run.mode !== 'ladder' && run.metaFlat) for (const k in run.metaFlat) soloBundle.flat[k] = (soloBundle.flat[k] || 0) + run.metaFlat[k];   // gear's team AD% etc.
  let augOpt = { aug: { player: soloBundle } };
  if (enemy.gimmick) augOpt.aug.enemy = enemy.gimmick;   // Warpath boss gimmick (aug.enemy channel)
  if (run.mode === 'ladder' && lobby) {
    const pb = augmentBundle(run.augments);
    const pf = Bots.powerFlat(lobby.human, lobby);   // human warlord power + modifier
    for (const [k, v] of Object.entries(pf)) pb.flat[k] = (pb.flat[k] || 0) + v;
    augOpt = { aug: { player: pb, enemy: Bots.botBundle(lobby.opponent, lobby) } };
  }
  const sim = simulate(playerBoard, enemyBoard, seed, augOpt);
  const { events, result } = sim;

  // dim + lock planning-only controls during combat (shop/bench/items/speed-other) — visual cue
  // that backs up the act() guard; the board stays interactive for inspect.
  $$('.shop-row, .shop-controls, .bench, .items-tray').forEach((elm) => elm.classList.add('combat-locked'));
  const ready = $('#readyBtn'); if (ready) { ready.disabled = true; ready.textContent = 'Fighting…'; }
  setBanner(`vs ${enemy.name}`);

  player = new CombatPlayer($('.units'), $('.fx-dom'));
  const winner = await player.play(events, { speed: combatSpeed });
  lastBattleStats = player.playerStats();   // keep per-unit stats visible through planning until next fight
  const won = winner === 'player';
  lastVerdict = fightVerdict(events, won);   // P0.1: the plain-language "why" for the next planning screen
  won ? Sfx.victory() : Sfx.defeat();
  if (won) launchConfetti(2000);
  const sv = result.survivors;
  // Warpath can't be lost: a defeat (or draw) replays the SAME warband, so frame it as "try again".
  const soloRetry = !won && run.mode === 'solo';
  setBanner(won ? `Round won! (${sv.player} survived)`
    : soloRetry ? 'Defeated — regroup and beat this warband to advance. You replay until you win.'
    : winner === 'enemy' ? `Round lost — ${sv.enemy} enemies left` : 'Draw — counts as a loss');
  // the fight is over — stop the button reading "Fighting…" until the planning screen re-renders
  // (avoids a brief beat where the result banner contradicts a still-"Fighting…" button).
  if (ready) ready.textContent = won ? 'Victory!' : soloRetry ? 'Try again' : winner === 'enemy' ? 'Defeat' : 'Draw';

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
      $$('.overlay').forEach((o) => o.remove());   // clear anything opened mid-fight (codex/inspect) before post-round prompts
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
    $$('.overlay').forEach((o) => o.remove());   // clear anything opened mid-fight (codex/inspect) before post-round prompts
    if (run.over) endScreen();
    else if (shouldAugment(finishedRound)) offerAugment(renderPlanning);
    else if (shouldEmblem(finishedRound)) offerEmblem(renderPlanning);
    else if (shouldCarousel(finishedRound)) offerCarousel(renderPlanning);
    else if (Run.isCreepRoundNum(finishedRound)) { if (won) dropCreepLoot(renderPlanning); else renderPlanning(); }
    else if (shouldDraft(finishedRound)) offerDraft(renderPlanning);
    else renderPlanning();
  }, 1100);
}

// A calm themed emblem per realm, matching its flavour — tinted with the realm's colour.
const REALM_EMBLEMS = [
  // 0 The Marches — crossed swords (border skirmish)
  '<path d="M4 3.5l9 9-2 2-9-9zM20 3.5l-9 9 2 2 9-9z"/><circle cx="5.5" cy="18.5" r="2.3"/><circle cx="18.5" cy="18.5" r="2.3"/>',
  // 1 The Deepwood — pine tree (elven wood)
  '<path d="M12 2l5 7h-3l4 6h-4v5h-4v-5H6l4-6H7z"/>',
  // 2 The Bonelands — skull (undead horde)
  '<path d="M12 2C7.6 2 4 5.4 4 9.6c0 2.5 1.2 4.2 3 5.4V19h2.2v-2.2h1.6V19h2.4v-2.2h1.6V19H18v-4c1.8-1.2 3-2.9 3-5.4C21 5.4 17.4 2 12 2z"/><circle cx="8.8" cy="10.4" r="1.9" fill="#0c0f17"/><circle cx="15.2" cy="10.4" r="1.9" fill="#0c0f17"/>',
  // 3 The Inferno — flame (demon legions)
  '<path d="M13 2c.6 3-2 4.6-2 7 0 1.3 1 2 2 1.2 1-.8 1.1-2.2 1.3-3.4C16.2 9 17.5 11 17.5 14a5.5 5.5 0 11-11 0c0-2.7 1.6-4.7 3-6.6C10.8 9 12 10.2 12.5 11.4 13.4 9 12 5 13 2z"/>',
  // 4 The Warhorde — crossed orc axes (the bloodlust horde)
  '<path d="M3.5 4.2l3.7 1.1 9.3 12.8-2.9 2.1-9.3-12.8zM20.5 4.2l-3.7 1.1-4 5.5 2.9 2.1 4-5.5zM10.3 14.2l-3.6 5-2.9-2.1 3.6-5z"/><circle cx="12" cy="20.4" r="1.9"/>',
  // 5 The Dragonspire — dragon head profile (dragonsworn)
  '<path d="M2 11l3-1 1-2c1-1 3-1.5 5-1.3-.6.5-1 1.1-1.1 1.8 1.6-.3 3.2.2 4.6 1.3 1.4 1.1 2.3 2.7 2.5 4.6-1.2-1.3-2.5-2-3.9-2.1l1.3 3.4-3.2-2.6c-1.9.6-3.8.2-5.7-1.2.9 0 1.6-.3 2.1-.9-1.3.1-2.4-.3-3.5-1.3z"/><circle cx="9.4" cy="9.8" r=".9" fill="#0c0f17"/>',
  // 6 The Voidreach — void swirl / portal (every horror)
  '<path d="M12 3a9 9 0 109 9 5.5 5.5 0 11-5.5-5.5A9 9 0 0012 3zm0 4.5A4.5 4.5 0 117.5 12 2.7 2.7 0 1012 9.3 4.4 4.4 0 0012 7.5z"/>',
  // 7 The Astral Throne — radiant crown + sunburst (the secret apotheosis)
  '<path d="M12 1.5l1.6 3.2 3.2-1-1 3.2 3.2 1.6-3.2 1.6 1 3.2-3.2-1L12 18.5l-1.6-3.2-3.2 1 1-3.2L5 11.5l3.2-1.6-1-3.2 3.2 1z" opacity=".6"/><path d="M5 14l1.8-5 3 3 2.2-4 2.2 4 3-3 1.8 5z"/><rect x="5" y="14" width="14" height="2.6" rx="1"/>',
];
function realmEmblemSVG(i, size = 30) {
  const inner = REALM_EMBLEMS[i] || '<path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17.6 5.9 20.4l1.5-6.8L2.2 9l6.9-.7z"/>';  // fallback: star (endless realms)
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true">${inner}</svg>`;
}

// Realm select — "Conquer the Realms". Conquered realms are permanent (replay to farm gold);
// the frontier realm is the next to claim; later realms stay locked until you reach them.
function showRealms() {
  audioResume();
  const cleared = Meta.realmsCleared();
  // The final realm is a SECRET — hidden entirely until every realm before it is conquered.
  const secretIdx = REALMS.findIndex((r) => r.secret);
  const revealSecret = secretIdx >= 0 && cleared >= secretIdx;
  const count = (cleared >= REALMS.length) ? cleared + 1
    : (secretIdx < 0) ? Math.max(REALMS.length, cleared + 1)
    : revealSecret ? REALMS.length : secretIdx;
  const totalRealms = (secretIdx < 0 || revealSecret) ? REALMS.length : secretIdx;
  const danger = (d) => '▲'.repeat(Math.max(1, Math.min(6, Math.round(d / 2) + 1)));
  const cards = [];
  for (let i = 0; i < count; i++) {
    const r = realmAt(i);
    const status = i < cleared ? 'conquered' : i === cleared ? 'frontier' : 'locked';
    // drama escalates 0→1 across the realms — later realms look heavier/glowier/ominous.
    const drama = Math.min(1, i / (REALMS.length - 1));
    const dramaClass = drama >= 0.999 ? ' cataclysm' : drama >= 0.6 ? ' epic' : '';
    cards.push(el(`.realm-card ${status}${dramaClass}`, {
      style: { '--rc': r.color, '--d': drama.toFixed(3) },
      onclick: status === 'locked' ? null : () => startSolo(true, i),
    }, [
      el('.rc-side', {}, [el('.rc-num', {}, 'Realm ' + r.num), el('.rc-emblem', { html: realmEmblemSVG(i) }), status === 'conquered' ? el('.rc-mark', { html: ic('trophy') }) : status === 'locked' ? el('.rc-mark', { html: ic('lock') }) : null]),
      el('.rc-body', {}, [
        el('.rc-name', {}, r.name),
        el('.rc-hint', {}, r.hint),
        el('.rc-foot', {}, [
          el('span.rc-danger', {}, [el('span', { style: { color: 'var(--ink-dim)' } }, 'Danger '), el('span', {}, danger(r.diff))]),
          el('span.rc-badge', {}, status === 'conquered' ? 'Conquered · replay' : status === 'frontier' ? 'Conquer ▶' : 'Locked'),
        ]),
      ]),
    ]));
  }
  $('#app').replaceChildren(el('.game', { style: { gap: '12px', padding: '14px', minHeight: '85svh' } }, [
    el('.arm-header', {}, [
      el('button.btn.icon', { onclick: () => chooseMode(), html: ic('back') }),
      el('h1', {}, 'Conquer the Realms'),
      el('.spoils-pill', { onclick: () => showArmory(), style: { cursor: 'pointer' } }, [iconEl('coffer'), el('span', {}, 'Armory')]),
    ]),
    el('.arm-tagline', {}, `${Math.min(cleared, totalRealms)} of ${totalRealms} realms conquered. Beat all 10 warbands of a realm to claim it for good — then march on the next.${revealSecret && cleared < REALMS.length ? ' ✦ A hidden final realm has revealed itself.' : ''}`),
    el('.seed-bar', { style: { display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' } }, [
      el('button.btn', { title: 'A fixed shared challenge — same shops & foes for everyone today', onclick: () => startSolo(true, 0, 'daily-' + new Date().toISOString().slice(0, 10)) }, [el('span', { html: ic('star') }), ' Daily run']),
      el('button.btn', { title: 'Enter a shared seed to replay someone else’s exact run', onclick: () => { const s = prompt('Enter a seed to play a shared run:'); if (s && s.trim()) startSolo(true, 0, s.trim()); } }, [el('span', { html: ic('codex') }), ' Enter seed']),
    ]),
    el('.realm-list', {}, cards),
  ]));
}

// Comeback perk (research: lowest-HP gets first pick). Reuses the component draft, framed as
// an underdog reward so the trailing player gets a free item to stabilise.
function offerUnderdogDraft(after) {
  const ids = Run.draftComponents(run);
  const pick = (id) => { Run.addItem(run, id); persist(); Sfx.buy(); ov.remove(); after ? after() : renderPlanning(); };
  const ov = el('.overlay', {}, el('.help-card', {}, [
    el('h2', {}, 'Underdog Gift'),
    el('.sub', {}, "You're lowest on health — claim a free component to fight back. Combine two on a champion for a full item."),
    el('.draft-row', {}, ids.map((id) => { const d = COMPONENTS[id]; return el('button.draft-pick', { onclick: () => pick(id) }, [el('span.di', { html: ic(d.icon) }), el('span.dn', {}, d.name), el('span.dm', {}, Object.entries(d.mods).map(([k, v]) => `+${v < 1 ? Math.round(v * 100) + '%' : v} ${k}`).join(', '))]); })),
  ]));
  document.body.append(ov);
}

function endScreen(ladderSummary) {
  const stat = (label, val) => el('.istat', { style: { minWidth: '120px' } }, [el('span', { style: { color: 'var(--ink-dim)' } }, label), el('span', {}, val)]);
  let head, sub, stats, rankBlock = null, rewardBlock = null, extraBtn = null;
  // P1.2 — collect honours newly earned THIS run so the closure card can celebrate them.
  const earnedThisRun = [];
  const claim = (id) => { const r = claimHonor(id); if (r) earnedThisRun.push(r.honor); };
  if (run.mode === 'ladder') {
    const place = (ladderSummary && ladderSummary.humanPlace) || (lobby && lobby.human.place) || Bots.aliveCount(lobby);
    const first = place === 1;
    if (first) launchConfetti(4000);
    head = first ? '1st PLACE!' : `#${place} of 8`;
    sub = first ? 'Last warband standing — you conquered the ladder!' : `Your warband fell in ${place}${['th', 'st', 'nd', 'rd'][place] || 'th'} place. The other warlords were tougher.`;
    stats = [stat('Placement', `#${place} / 8`), stat('Rounds', run.round - 1)];
    // apply the placement to your rank ONCE, and show the result
    if (!run.rankApplied) { run.rankApplied = true; run._rankResult = Rank.applyPlacement(place); Run.save(run); }
    // War Honors: a 1st place, and reaching each rank tier (idempotent — fires once ever)
    if (first) claim('ladder_win');
    { const t = Rank.currentRank().tier; if (t >= 2) claim('reach_gold'); if (t >= 4) claim('reach_diamond'); if (t >= 5) claim('reach_master'); }
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
    const isTrials = run.mode === 'trials';
    const isEndless = run.mode === 'endless';
    const won = run.won;
    if (isEndless) {
      head = 'OVERWHELMED';
      sub = `The endless horde marched over you at Wave ${run.wins + 1}. You held ${run.wins} wave${run.wins === 1 ? '' : 's'} — and the deeper you march, the richer the Spoils.`;
    } else if (isTrials) {
      if (won) { launchConfetti(5200); head = 'TRIALS CLEARED'; sub = `You slew every boss of the gauntlet — all ${TRIAL_COUNT}, from the Gloom Slime to the Void Maw itself. A true champion.`; }
      else { head = 'DEFEATED'; sub = `The bosses bested you — ${run.wins}/${TRIAL_COUNT} slain. Gear up in the Armory and face them again.`; }
    } else {
      const realm = realmAt(run.realm || 0);
      if (won) {
        const newConquest = Meta.conquerRealm(realm.index);
        launchConfetti(newConquest ? 4500 : 2200);
        head = 'REALM CONQUERED';
        sub = newConquest ? `${realm.name} is yours for good — the next realm beckons.` : `${realm.name} cleared again. Spoils farmed; conquest already secured.`;
      } else { head = 'DEFEATED'; sub = `${realm.name} held your warband off (${run.wins}/10). Gear up in the Armory and march again.`; }
    }
    // record personal bests for the menu's at-a-glance progress (Endless depth, Trials bosses)
    if (isEndless) Meta.recordBest('endless', run.wins);
    else if (isTrials) Meta.recordBest('trials', run.wins);
    // earn Spoils ONCE — Endless pays for DEPTH (how far you came); other modes use the standard payout.
    if (!run.spoilsEarned) {
      run.spoilsEarned = isEndless ? Math.round(5 * run.wins + (run.round - 1)) : Meta.spoilsForRun(run.wins, run.round - 1, won);
      Meta.addSpoils(run.spoilsEarned); Run.save(run);
    }
    // War Honors: Trials progress, realm conquests (read AFTER conquerRealm above), and a flawless run
    if (isTrials) { if (run.wins >= 1) claim('first_boss'); if (won) claim('clear_trials'); }
    else if (!isEndless && won) {
      const c = Meta.realmsCleared();
      if (c >= 1) claim('first_realm'); if (c >= 3) claim('three_realms');
      if (c >= 7) claim('all_realms'); if (c >= 8) claim('astral');
      if (run.losses === 0) claim('flawless');
    }
    stats = isEndless ? [stat('Depth reached', `Wave ${run.wins + 1}`), stat('Waves held', run.wins)]
          : isTrials ? [stat('Bosses slain', `${run.wins}/${TRIAL_COUNT}`), stat('Rounds', run.round - 1)]
                     : [stat('Realm', realmAt(run.realm || 0).name), stat('Warbands', `${run.wins}/10`)];
    const spoilsTotal = Meta.load().spoils;
    const caches = Math.floor(spoilsTotal / Meta.CHEST_COST);
    rewardBlock = el('.end-reward', {}, [
      el('.er-line', {}, [iconEl('spoils', 'er-ico'), el('span.er-amt', {}, `+${run.spoilsEarned || 0} Spoils`)]),
      el('.er-sub', {}, `${spoilsTotal} total — enough for ${caches} War Cache${caches === 1 ? '' : 's'} in the Armory. Your Spoils & gear carry over; only the in-battle gold resets.`),
    ]);
    extraBtn = isEndless
      ? el('button.btn.primary', { style: { fontSize: '16px', padding: '12px 28px' }, onclick: () => startEndless(true) }, '↻ March again')
      : isTrials
      ? el('button.btn.primary', { style: { fontSize: '16px', padding: '12px 28px' }, onclick: () => startTrials(true) }, won ? '↻ Run the Trials again' : '↻ Retry the Trials')
      : won
        ? el('button.btn.primary', { style: { fontSize: '16px', padding: '12px 28px' }, onclick: () => startSolo(true, realmAt(run.realm || 0).index + 1) }, `Next Realm ▶`)
        : el('button.btn.primary', { style: { fontSize: '16px', padding: '12px 28px' }, onclick: () => startSolo(true, realmAt(run.realm || 0).index) }, `↻ Retry realm`);
  }
  const card = el('.endscreen', {}, [
    el('h1', { style: { fontSize: '34px', margin: '0' } }, head),
    el('p', { style: { color: 'var(--ink-dim)', margin: '0' } }, sub),
    el('.istats', { style: { maxWidth: '280px' } }, stats),
    rewardBlock,
    // P1.2 — celebrate honours earned this run (a satisfying "you achieved something" beat).
    earnedThisRun.length ? el('.end-honors', { style: { display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' } }, [
      el('span', { style: { fontSize: '11px', fontWeight: '800', letterSpacing: '.06em', color: 'var(--gold)' } }, 'WAR HONORS EARNED'),
      el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' } }, earnedThisRun.map((h) =>
        el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', background: 'rgba(255,224,138,0.12)', border: '1px solid var(--gold)', borderRadius: '999px', padding: '3px 10px' } },
          [el('span', { html: ic(h.icon || 'trophy') }), el('span', {}, h.name)]))),
    ]) : null,
    rankBlock,
    run.mode !== 'ladder' && run.augments.length ? el('div', {}, [el('div', { style: { color: 'var(--ink-dim)', fontSize: '12px', marginBottom: '4px' } }, 'Augments gathered'), el('.relic-bar', { style: { justifyContent: 'center' } }, run.augments.map((id) => el(`span.relic tier-${AUGMENTS[id].tier}`, { title: AUGMENTS[id].name, html: augIcon(AUGMENTS[id]) })))]) : null,
    run.mode !== 'ladder' ? el('.seed-share', { style: { fontSize: '12px', color: 'var(--ink-dim)' } }, [
      el('span', {}, 'Seed: '), el('code', { style: { color: 'var(--gold)' } }, run.seedStr),
      el('button.btn', { style: { padding: '3px 8px', marginLeft: '6px', fontSize: '11px' }, onclick: (e) => { try { navigator.clipboard.writeText(run.seedStr); } catch {} e.target.textContent = 'Copied'; } }, 'Copy seed'),
    ]) : null,
    el('.end-btns', { style: { display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' } }, run.mode === 'ladder' ? [
      extraBtn,
      el('button.btn', { style: { fontSize: '15px', padding: '12px 22px' }, onclick: () => chooseMode() }, '↻ Main menu'),
    ] : [
      // non-ladder (Warpath / Trials): retry/next + reach the Armory (spend earned Spoils) + Menu.
      // 'Realms' only for Warpath — it's the realm map, unrelated to the Trials gauntlet.
      extraBtn,
      run.mode === 'solo' ? el('button.btn', { style: { fontSize: '15px', padding: '12px 22px' }, onclick: () => showRealms() }, 'Realms') : null,
      el('button.btn', { style: { fontSize: '15px', padding: '12px 22px' }, onclick: () => showArmory() }, [iconEl('coffer'), el('span', { style: { marginLeft: '6px' } }, 'Armory')]),
      el('button.btn', { style: { fontSize: '15px', padding: '12px 22px' }, onclick: () => chooseMode() }, '✓ Stop here'),
    ]),
    // P1.2 — healthy closure: an explicit, guilt-free "you can stop now" beat (the ethical inverse
    // of an open compulsion loop). Progress is already saved; leaving is framed as a clean win.
    run.mode !== 'ladder' ? el('p', { style: { fontSize: '11px', color: 'var(--ink-faint)', margin: '2px 0 0' } }, 'Well fought. Your Spoils, gear and conquered realms are saved — stop here any time.') : null,
  ]);
  $('#app').replaceChildren(el('.game', { style: { alignItems: 'center', justifyContent: 'center', minHeight: '85svh', textAlign: 'center', gap: '14px' } }, [card]));
}

// ---------- War Honors (one-time achievements across all modes) ----------
// Claim an honour and, if it's newly earned, celebrate it with a toast (which also tells the
// player the Spoils bounty just landed). Safe to call repeatedly — Meta.claimHonor is idempotent.
function claimHonor(id) {
  const res = Meta.claimHonor(id);
  if (res) honorToast(res.honor, res.bounty);
  return res;
}
// A small, self-dismissing banner that slides in from the top when an honour is earned.
let _honorQueue = [];
function honorToast(honor, bounty) {
  _honorQueue.push({ honor, bounty });
  if (_honorQueue.length > 1) return;   // one at a time; the chain re-arms on dismiss
  showNextHonorToast();
}
function showNextHonorToast() {
  const next = _honorQueue[0];
  if (!next) return;
  Sfx.reward(3);
  if (motionOn()) launchConfetti(1600);
  const t = el('.honor-toast', {}, [
    el('.ht-medal', { html: ic(next.honor.icon) }),
    el('.ht-body', {}, [
      el('.ht-label', {}, 'Honour earned'),
      el('.ht-name', {}, next.honor.name),
    ]),
    el('.ht-bounty', {}, [iconEl('spoils', 'ht-sp'), el('span', {}, `+${next.bounty}`)]),
  ]);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { t.remove(); _honorQueue.shift(); showNextHonorToast(); }, 360);
  }, 2600);
}
// Scan the current planning board for honours that are achieved by board STATE (not by an event):
// a 3★ champion and a 6+ synergy. Idempotent — claim only fires the first time. Solo/Trials only
// (the ladder stays free of meta side-effects, and emblems/grants don't apply there).
function checkBoardHonors() {
  if (!run || run.mode === 'ladder') return;
  const units = [...run.board, ...run.bench.filter(Boolean)];
  if (units.some((u) => u.star >= 3)) claimHonor('three_star');
  const active = activeTraits(defsWithGrants(run.board), teamTraitBonus());
  if (Object.values(active).some((info) => info.tier > 0 && info.count >= 6)) claimHonor('six_synergy');
}
// One-time retro-credit so a returning player's board never opens at zero (endowed-progress
// effect), WITHOUT a surprise Spoils windfall: mark already-reached milestones earned, no bounty.
function syncRetroHonors() {
  if (Meta.honorInitDone()) return;
  const cleared = Meta.realmsCleared();
  if (cleared >= 1) Meta.markHonor('first_realm');
  if (cleared >= 3) Meta.markHonor('three_realms');
  if (cleared >= 7) Meta.markHonor('all_realms');
  if (cleared >= 8) Meta.markHonor('astral');     // the hidden final realm (Astral Throne)
  const tier = Rank.currentRank().tier;            // 0 Bronze … 2 Gold … 4 Diamond … 5 Master
  if (tier >= 2) Meta.markHonor('reach_gold');
  if (tier >= 4) Meta.markHonor('reach_diamond');
  if (tier >= 5) Meta.markHonor('reach_master');
  Meta.setHonorInit();
}
// The War Honors board: a quest-log + trophy case. Grouped by category, earned ones lit, locked
// ones dimmed with their goal text. A progress bar up top (never at zero for veterans).
function showHonors(backTo) {
  const earned = Meta.honorsEarned();
  const got = HONORS.filter((h) => earned[h.id]).length;
  const groups = HONOR_CATS.map((cat) => {
    const list = HONORS.filter((h) => h.cat === cat.id);
    const cards = list.map((h) => {
      const have = !!earned[h.id];
      const masked = h.secret && !have;   // a hidden honour: name/desc/bounty stay "???" until earned
      return el(`.honor-card${have ? ' earned' : ' locked'}${masked ? ' secret' : ''}`, { style: { '--hc': cat.color }, title: masked ? 'Hidden — discover it through play' : (have ? 'Earned' : 'Locked') }, [
        el('.hc-medal', { html: ic(have ? h.icon : 'lock') }),
        el('.hc-text', {}, [el('.hc-name', {}, masked ? '???' : h.name), el('.hc-desc', {}, masked ? 'A hidden honour — uncover it through play.' : h.desc)]),
        el('.hc-bounty', { title: masked ? 'Hidden bounty' : `${h.bounty} Spoils bounty` }, [iconEl('spoils', 'hc-sp'), el('span', {}, masked ? '?' : `${h.bounty}`)]),
      ]);
    });
    return el('.honor-group', {}, [
      el('.hg-head', { style: { '--hc': cat.color } }, [el('span.hg-ico', { html: ic(cat.icon) }), el('span', {}, cat.name)]),
      el('.honor-grid', {}, cards),
    ]);
  });
  $('#app').replaceChildren(el('.game', { style: { alignItems: 'center', gap: '14px', paddingBottom: '40px' } }, [
    el('.honors-head', {}, [
      el('h1', { style: { margin: '0' } }, 'War Honors'),
      el('.sub', { style: { color: 'var(--ink-dim)' } }, 'One-time feats across every mode — each pays a Spoils bounty once.'),
      el('.honor-prog', {}, [
        el('.hp-bar', {}, el('.hp-fill', { style: { transform: `scaleX(${got / HONORS.length})` } })),
        el('.hp-label', {}, `${got} / ${HONORS.length} earned`),
      ]),
    ]),
    el('.honors-wrap', {}, groups),
    el('button.btn.primary', { style: { fontSize: '15px', padding: '11px 24px' }, onclick: () => (backTo === 'armory' ? showArmory() : chooseMode()) }, '◂ Back'),
  ]));
}

// ---------- mode select ----------
// Start (or resume) a Warpath run. `realm` = which realm to attempt (fresh runs reset everything).
function startSolo(fresh, realm = 0, seedStr = null) {
  if (fresh) Run.clearSave();
  clearLobby();
  const resumed = !fresh && Run.load();
  run = resumed || Run.freshRun(seedStr || undefined);   // seedStr → daily/shared reproducible run
  run.mode = 'solo'; lobby = null;
  if (!resumed) { run.realm = realm; applyGear(run); }   // a NEW realm run resets + starts with your gear boosts
  Run.save(run); renderPlanning();
  postStart(resumed);
}
// After entering planning: a BRAND-NEW run plays the Banishment reveal, then the intro tip (if
// unseen); a RESUMED run just shows the intro tip. Keeps the two overlays from stacking.
function postStart(resumed) {
  const intro = () => { if (!seenIntro()) showHelp(); };
  if (resumed) { intro(); return; }
  showBanReveal(run.bannedRace, intro);
}
// The Trials — boss-rush mode. Reuses the Warpath economy/planning; the foe each round is a
// unique boss CREATURE. Beat all TRIAL_COUNT bosses to win. Your Armory gear applies; Spoils earned.
function startTrials(fresh) {
  if (fresh) Run.clearSave();
  clearLobby();
  const resumed = !fresh && Run.load();
  run = resumed || Run.freshRun();
  run.mode = 'trials'; lobby = null;
  if (!resumed) applyGear(run);
  run.winTarget = TRIAL_COUNT;
  Run.save(run); renderPlanning();
  postStart(resumed);
}
// Endless — infinite escalating waves on a life pool; bank Spoils scaled to the depth you reach.
// Reuses the whole Warpath economy/planning; only the foe source (getOpponent) + end logic differ.
function startEndless(fresh) {
  if (fresh) Run.clearSave();
  clearLobby();
  const resumed = !fresh && Run.load();
  run = resumed || Run.freshRun();
  run.mode = 'endless'; lobby = null;
  if (!resumed) applyGear(run);
  Run.save(run); renderPlanning();
  postStart(resumed);
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
// Offer THREE random warlords to pick from each game (was: the full roster of 8). Whichever you
// choose, the other seven styles become your rivals — so a 3-of-8 offer keeps the lobby intact.
function pickThreeWarlords() {
  const pool = Bots.STYLES.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, 3);
}
function chooseWarlord() {
  Run.clearSave(); clearLobby(); run = Run.freshRun(); run.mode = 'menu'; lobby = null;
  const offered = pickThreeWarlords();
  const card = (s) => { const p = Bots.POWERS[s.id]; const cdef = UNITS_BY_ID[s.champ];
    return el('.warlord-pick', { style: { '--wc': s.color }, onclick: () => beginLadder(s.id) }, [
      el('.wp-portrait', { html: cdef ? championSVG(cdef, { size: 56 }) : crest(s.color, s.sigil, 28) }),
      el('.wp-name', {}, s.name),
      el('.wp-power', {}, [el('b', {}, p.name + ': '), el('span', {}, p.desc)]),
    ]); };
  const rk = Rank.currentRank();
  $('#app').replaceChildren(el('.game', { style: { alignItems: 'center', justifyContent: 'center', minHeight: '85svh', gap: '10px', padding: '14px' } }, [
    el('h1', { style: { fontSize: '26px', margin: '0', textAlign: 'center' } }, 'Choose your Warlord'),
    el('.rank-pill', { style: { borderColor: rk.color } }, [el('span', { html: rankMedal(rk.color, 16) }), el('span', { style: { color: rk.color } }, ` ${rk.name}`), el('span', { style: { color: 'var(--ink-dim)', fontSize: '11px' } }, rk.nextAt ? `${rk.inTier}/${rk.nextAt} RP` : `${rk.rp} RP`)]),
    el('.sub', { style: { textAlign: 'center', color: 'var(--ink-dim)', marginTop: '-4px' } }, `Pick one of three; your power shapes the run, and the other seven warlords are your rivals — playing at ${rk.name} skill.`),
    el('.warlord-grid', {}, offered.map(card)),
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
const RARITY_TINT = { common: '#9aa6b8', rare: '#6fb1ff', epic: '#c79bff', legendary: '#ffb031', mythic: '#ff5e8a', ascended: '#7df9ff', celestial: '#e7efff', godforged: '#ffe08a' };
function heroPalette(m) {
  const pal = {};
  const arm = Meta.equippedItem(m, 'armor'); if (arm) pal.secondary = RARITY_TINT[arm.rarity];   // plate/helm/shield
  const wep = Meta.equippedItem(m, 'weapon'); if (wep) pal.accent = RARITY_TINT[wep.rarity];
  return Object.keys(pal).length ? pal : null;
}

// ---------- Armory (meta-progression: chests + equipping your Champion) ----------
function showArmory() {
  audioResume();
  const RAR_ORDER = Object.fromEntries(Meta.RARITIES.map((r, i) => [r.id, i]));   // incl. legendary/mythic
  const iidNum = (it) => parseInt(String(it.iid).replace(/\D/g, ''), 10) || 0;
  const render = () => {
    const m = Meta.load();
    const rar = (id) => Meta.RARITIES.find((r) => r.id === id);
    // one clean equipped-slot row per slot: rarity-tinted gear art + name + plain effect (tap to unequip).
    const loadoutRow = (s) => {
      const it = Meta.equippedItem(m, s.id);
      return el(`.loadout-row${it ? ' filled' : ' empty'}`, { style: it ? { '--rc': rar(it.rarity).color } : {}, onclick: it ? () => { Meta.unequip(s.id); Sfx.click(); render(); } : null }, [
        el('.lr-icon', { html: it ? gearArt(it.slot, it.rarity, 32) : ic(s.icon) }),
        el('.lr-text', {}, [
          el('.lr-name', {}, it ? it.name : s.name),
          el('.lr-eff', {}, it ? Meta.effectText(it) : 'Empty'),
        ]),
        it ? el('.lr-rar', { style: { color: rar(it.rarity).color } }, rar(it.rarity).name) : el('.lr-rar.dim', {}, 'slot'),
        it ? el('.lr-x', { html: ic('ban') }) : null,
      ]);
    };
    const invCell = (it) => el(`.inv-item${m.equipped[it.slot] === it.iid ? ' eq' : ''}`, { style: { '--rc': rar(it.rarity).color, '--ic': Meta.itemColor(it) }, onclick: () => { Meta.equip(it.iid); Sfx.buy(); render(); }, title: `${Meta.effectText(it)} — tap to equip` }, [
      el('.ii-rar', {}, rar(it.rarity).name),
      el('.ii-icon', { html: gearArt(it.slot, it.rarity, 46) }),
      el('.ii-name', {}, it.name),
      el('.ii-eff', {}, Meta.effectText(it)),
    ]);
    const sectionHead = (title, note) => el('.arm-section', {}, [el('span.as-title', {}, title), note ? el('span.as-note', {}, note) : null]);
    const canBuy = m.spoils >= Meta.CHEST_COST;
    const equippedCount = Meta.SLOTS.filter((s) => Meta.equippedItem(m, s.id)).length;
    $('#app').replaceChildren(el('.game.armory-screen', { style: { gap: '14px', padding: '14px', minHeight: '85svh' } }, [
      el('.arm-header', {}, [
        el('button.btn.icon', { onclick: () => chooseMode(), html: ic('back') }),
        el('h1', {}, 'Armory'),
        el('button.btn.icon', { title: 'War Honors', onclick: () => { Sfx.click(); showHonors('armory'); }, html: ic('trophy') }),
        el('.spoils-pill', {}, [iconEl('spoils', 'sp-ico'), el('span', {}, m.spoils)]),
      ]),
      // ── Champion: portrait (armour recolours to equipped) + the 5 equipped slots, one clean card ──
      el('.champ-card', {}, [
        el('.champ-hero', {}, [
          el('.champ-portrait', { html: championSVG(UNITS_BY_ID['knight_captain'], { size: 96, palette: heroPalette(m) }) }),
          el('.champ-cap', {}, [el('.cc-title2', {}, 'Your Champion'), el('.cc-sub2', {}, `${equippedCount}/5 slots geared`)]),
        ]),
        el('.loadout', {}, Meta.SLOTS.map(loadoutRow)),
      ]),
      // ── Acquire: open caches, forge duplicates ──
      sectionHead('Get gear', 'boosts apply to your Warpath runs'),
      el(`.cache-cta${canBuy ? '' : ' dim'}`, { onclick: () => { const r = Meta.openChest(); if (r.ok) revealItem(r.item, render); else modal2('Not enough Spoils', `A War Cache costs ${Meta.CHEST_COST} Spoils. Earn Spoils by playing Warpath — even a loss pays out.`); } }, [
        el('.cc-chest', { html: ic('coffer') }),
        el('.cc-text', {}, [el('.cc-title', {}, 'Open War Cache'), el('.cc-sub', {}, 'a random piece of gear')]),
        el('.cc-cost', {}, [String(Meta.CHEST_COST) + ' ', iconEl('spoils')]),
      ]),
      // Healthy/transparent: the cache is the one randomised surface, so we publish the real odds
      // (the genre-ethics rule "show odds if anything is randomised") and remind that the better
      // rarities are FORGE-earned, never gated behind RNG — you're never purely at luck's mercy.
      (() => {
        const tot = Meta.RARITIES.reduce((a, r) => a + r.weight, 0) || 1;
        return el('.cache-odds', { style: { fontSize: '11px', color: 'var(--ink-dim)', margin: '5px 2px 0', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' } }, [
          el('span', { style: { fontWeight: '700' } }, 'Cache odds:'),
          ...Meta.RARITIES.filter((r) => r.weight > 0).map((r) => el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } },
            [el('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: r.color, display: 'inline-block' } }), `${Math.round((r.weight / tot) * 100)}% ${r.name}`])),
          el('span', { style: { opacity: '.85' } }, '· higher rarities are forge-earned, never random'),
        ]);
      })(),
      // FAST PATH: open every cache you can afford at once, auto-equip upgrades, one quick summary.
      Meta.affordableChests(m) >= 2
        ? el('.cache-all', { onclick: () => { const n = Meta.affordableChests(m); const r = Meta.openChests(n); if (r.ok) revealBulk(r.items, render); } },
            [el('span', { html: ic('coffer') }), el('span', {}, `Open all ×${Meta.affordableChests(m)}`), el('span.ca-cost', {}, [String(Meta.affordableChests(m) * Meta.CHEST_COST) + ' ', iconEl('spoils')])])
        : null,
      forgePanel(m, rar, render),
      // ── Inventory — grouped by slot category so each kind of gear is clearly separated ──
      sectionHead('Inventory', m.inventory.length ? `${m.inventory.length} pieces` : 'empty'),
      m.inventory.length
        ? el('.inv-groups', {}, Meta.SLOTS.map((s) => {
            const items = m.inventory.filter((it) => it.slot === s.id);
            if (!items.length) return null;
            const eq = (it) => (m.equipped[it.slot] === it.iid ? 0 : 1);   // equipped piece floats to the front
            items.sort((x, y) => eq(x) - eq(y) || RAR_ORDER[y.rarity] - RAR_ORDER[x.rarity] || iidNum(y) - iidNum(x));
            const equippedHere = items.some((it) => m.equipped[it.slot] === it.iid);
            return el('.inv-group', { style: { '--gc': s.color } }, [
              el('.ig-head', {}, [
                el('.ig-icon', { html: ic(s.icon) }),
                el('span.ig-name', {}, s.name),
                el('span.ig-count', {}, String(items.length)),
                equippedHere ? el('span.ig-eq', {}, 'equipped') : null,
              ]),
              el('.inv-grid', {}, items.map(invCell)),
            ]);
          }).filter(Boolean))
        : el('.inv-empty', {}, 'No gear yet — open a War Cache above.'),
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
      onclick: () => { const r = Meta.combineItems(g.slot, g.rarity); if (r.ok) { if (r.item.rarity === 'mythic') claimHonor('forge_mythic'); if (r.item.rarity === 'godforged') claimHonor('forge_godforged'); revealItem(r.item, render, { autoStash: true }); } },
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
// A representative icon per race for the banishment reveal (icons from icons.js).
const RACE_ICON = { human: 'banner', undead: 'skull', elf: 'bow', demon: 'flame', beast: 'paw', dragon: 'fang', orc: 'axe' };

// "The Banishment" — a quick gameshow spin at the start of every NEW run that reveals which race
// sits out (Auto-Chess-style rotation). Purely cosmetic; dismisses straight into planning. The
// banished race is already decided in the run state (freshRun) — the spin only theatricalises it.
function showBanReveal(banned, onDone) {
  const finish = () => { if (ov.isConnected) ov.remove(); onDone && onDone(); };
  if (!banned || !TRAITS[banned]) { onDone && onDone(); return; }
  const meta = (r) => ({ name: TRAITS[r] ? TRAITS[r].name : r, color: TRAITS[r] ? TRAITS[r].color : '#fff', icon: RACE_ICON[r] || 'skull' });
  const face = el('.ban-face');
  const sub = el('.ban-sub', {}, 'Spinning the wheel of banishment…');
  const go = el('button.btn.primary.go', { style: { visibility: 'hidden' }, onclick: finish }, 'March on ▶');
  const paint = (r, landed) => { const m = meta(r); face.style.setProperty('--rc', m.color); face.classList.toggle('landed', !!landed); face.replaceChildren(el('.ban-ico', { html: ic(m.icon) }), el('.ban-name', {}, m.name)); };
  paint(ORIGINS[0]);
  const ov = el('.overlay.ban-overlay', {}, el('.ban-card', {}, [el('.ban-kicker', {}, 'The Banishment'), face, sub, go]));
  document.body.append(ov);
  const land = () => {
    const m = meta(banned);
    paint(banned, true);
    Sfx.reward(3);
    sub.replaceChildren(el('b', { style: { color: m.color } }, m.name), el('span', {}, ' sits out this run — none appear in your shop. You’ll still face them in battle.'));
    go.style.visibility = 'visible';
    if (motionOn()) launchConfetti(1600);
  };
  if (!motionOn()) { land(); return; }
  // decelerating slot-machine spin, then forced to land on `banned`
  let i = 0, delay = 55;
  const spin = () => {
    paint(ORIGINS[i % ORIGINS.length]); Sfx.click(); i++;
    delay *= 1.14;
    if (delay < 340) setTimeout(spin, delay);
    else { land(); setTimeout(() => { if (ov.isConnected) finish(); }, 4200); }
  };
  setTimeout(spin, 220);
}

function revealItem(item, after, opts = {}) {
  const tier = Math.max(0, Meta.RARITIES.findIndex((r) => r.id === item.rarity));   // 0 common … 5 ascended
  const rar = Meta.RARITIES[tier] || Meta.RARITIES[0];
  const motion = motionOn();
  Sfx.reward(tier);
  // the rarer the find, the louder the moment: confetti (epic+), rotating rays + shake + screen flash (legendary+)
  const confettiMs = [0, 0, 1800, 3600, 5200, 6500, 8000, 9500][tier] || 0;
  if (confettiMs && motion) launchConfetti(confettiMs);
  const hi = tier >= 3;
  if (hi && motion) { const flash = el('.reveal-flash', { style: { '--rc': rar.color } }); document.body.append(flash); setTimeout(() => flash.remove(), 700); }
  const label = ['Common find', 'Rare find!', 'Epic find!', '✦ Legendary! ✦', '★ Mythic! ★', '✦ ASCENDED! ✦', '✦ CELESTIAL! ✦', '★ GODFORGED! ★'][tier] || `${rar.name} find`;
  const ov = el('.overlay', {}, el(`.reveal-card rarity-${item.rarity}${hi && motion ? ' impact' : ''}`, { style: { '--rc': rar.color, '--ic': Meta.itemColor(item) } }, [
    el('.reveal-burst'),
    hi ? el('.reveal-rays') : null,
    el('.reveal-rarity', {}, label),
    el('.reveal-icon', { html: gearArt(item.slot, item.rarity, 84) }),
    el('h2', {}, item.name),
    el('.reveal-eff', {}, Meta.effectText(item)),
    // forge: the item is already in your inventory — just show it and stash (no equip/stash choice).
    opts.autoStash
      ? el('.reveal-tools', {}, [
          el('.reveal-stashed', {}, 'Stashed in your inventory'),
          el('button.btn.primary', { onclick: () => { ov.remove(); after && after(); } }, 'Continue'),
        ])
      : el('.reveal-tools', {}, [
          el('button.btn.primary', { onclick: () => { Meta.equip(item.iid); Sfx.fuse(); ov.remove(); after && after(); } }, 'Equip'),
          el('button.btn', { onclick: () => { ov.remove(); after && after(); } }, 'Stash'),
        ]),
  ]));
  document.body.append(ov);
}

// Fast bulk-open summary: auto-equips upgrades, shows the haul + the rarest with one confetti.
function revealBulk(items, after) {
  const tierOf = (it) => Math.max(0, Meta.RARITIES.findIndex((r) => r.id === it.rarity));
  const upgraded = Meta.equipBestPerSlot();
  const sorted = items.slice().sort((a, b) => tierOf(b) - tierOf(a));
  const bestTier = tierOf(sorted[0]);
  Sfx.reward(bestTier);
  if (motionOn() && bestTier >= 2) launchConfetti([0, 0, 1500, 3000, 4500, 6000, 7500, 9000][bestTier] || 1500);
  const rarColor = (it) => (Meta.RARITIES.find((r) => r.id === it.rarity) || {}).color || '#9aa6b8';
  const ov = el('.overlay', {}, el('.reveal-card bulk-card', { style: { maxWidth: '380px', width: '92%' } }, [
    el('h2', {}, `Opened ${items.length} War Cache${items.length > 1 ? 's' : ''}`),
    el('.bulk-sub', { style: { color: upgraded.length ? 'var(--hp)' : 'var(--ink-dim)' } }, upgraded.length ? `✦ ${upgraded.length} upgrade${upgraded.length > 1 ? 's' : ''} auto-equipped` : 'No upgrades this time — all stashed'),
    el('.bulk-grid', {}, sorted.map((it) => el('.bulk-item', { style: { '--rc': rarColor(it) }, title: `${it.name} — ${Meta.effectText(it)}` }, [
      el('.bi-art', { html: gearArt(it.slot, it.rarity, 40) }),
      el('.bi-name', {}, it.name),
    ]))),
    el('button.btn.primary', { onclick: () => { ov.remove(); after && after(); } }, 'Done'),
  ]));
  document.body.append(ov);
}

function chooseMode() {
  Run.clearSave(); clearLobby(); run = Run.freshRun(); run.mode = 'menu'; lobby = null;
  // Every mode card shares ONE layout (accent icon-chip + title + blurb); only the accent
  // colour (--ac) differs per mode, so the menu reads as a coherent set.
  const card = (accent, iconName, title, desc, onclick) => el('.mode-card', { style: { '--ac': accent }, onclick }, [
    el('.mc-icon', { html: ic(iconName) }),
    el('.mc-body', {}, [el('.mc-title', {}, title), el('.mc-desc', {}, desc)]),
  ]);
  const rk = Rank.currentRank();
  const ladderCard = card('#6fb1ff', 'crown', 'Warlord Ladder', 'Auto-Chess: 8 warlords, ONE shared champion pool, last warband standing wins. Climb the ranks — higher rank = smarter rivals.', () => startLadder());
  ladderCard.querySelector('.mc-body').append(el('.mc-rank', { style: { color: rk.color } }, [el('span', { html: rankMedal(rk.color, 16) }), el('span', {}, ` ${rk.name}${rk.nextAt ? ` · ${rk.inTier}/${rk.nextAt} RP` : ` · ${rk.rp} RP`}`)]));
  // P0.2 — at-a-glance progress per mode (orientation, not a hook): realms conquered + personal bests.
  const totalRealms = REALMS.filter((r) => !r.secret).length;
  const prog = (c, txt, color) => { c.querySelector('.mc-body').append(el('.mc-prog', { style: { fontSize: '11px', color: color || 'var(--ink-dim)', marginTop: '5px', fontWeight: '700' } }, txt)); return c; };
  const warpathCard = prog(card('var(--gold)', 'sword', 'Warpath', 'Conquer the realms: beat all 10 warbands of a realm to claim it for good, then march on the next, harder one. Earn Spoils to gear your Champion.', () => showRealms()),
    `${Math.min(Meta.realmsCleared(), totalRealms)} / ${totalRealms} realms conquered`, 'var(--gold)');
  const trialsCard = card('#ff6a8a', 'burst', 'The Trials', `A boss rush: face a gauntlet of ${TRIAL_COUNT} unique monsters — from the Gloom Slime up to the Void Maw — each with its own deadly mechanic. Build a team, learn each fight, slay them all.`, () => startTrials(true));
  { const b = Meta.best('trials'); if (b > 0) prog(trialsCard, `Best: ${b} / ${TRIAL_COUNT} bosses slain`, '#ff9ab0'); }
  const endlessCard = card('#8fd24a', 'skull', 'Endless', 'Hold against an endless tide of warbands that only grows fiercer — every 10th wave a boss. There is no winning, only how deep you march. Bank Spoils for the depth you reach.', () => startEndless(true));
  { const b = Meta.best('endless'); if (b > 0) prog(endlessCard, `Best: reached Wave ${b + 1}`, '#aef06a'); }
  $('#app').replaceChildren(el('.game', { style: { alignItems: 'center', justifyContent: 'center', minHeight: '85svh', gap: '14px' } }, [
    el('h1.title-main', {}, 'Warbound'),
    el('.sub', { style: { textAlign: 'center', color: 'var(--ink-dim)', marginTop: '-10px' } }, 'Choose your battle'),
    el('.mode-menu', {}, [
      // Warpath + its Armory are one visual GROUP — gear belongs to Warpath, not the ladder.
      el('.warpath-group', {}, [
        warpathCard,
        el('.armory-bar', { onclick: () => showArmory() }, [
          el('span.ab-ico', { html: ic('coffer') }),
          el('.ab-text', {}, [el('span.ab-label', {}, 'Armory'), el('span.ab-sub', {}, 'gear your Champion — for Warpath & Trials')]),
          el('span.ab-spoils', {}, `${Meta.load().spoils} Spoils`),
        ]),
      ]),
      trialsCard,
      endlessCard,
      ladderCard,
    ]),
    (() => { const got = HONORS.filter((h) => Meta.honorsEarned()[h.id]).length; return el('.honors-bar', { onclick: () => { Sfx.click(); showHonors('menu'); } }, [
      el('span.hb-ico', { html: ic('trophy') }),
      el('.hb-text', {}, [el('span.hb-label', {}, 'War Honors'), el('span.hb-sub', {}, 'feats & Spoils bounties across every mode')]),
      el('span.hb-count', {}, `${got}/${HONORS.length}`),
    ]); })(),
    // P1.3 — Codex reachable from home (browse champions, synergies, augments, items, bestiary anytime)
    el('.honors-bar', { onclick: () => { Sfx.click(); showCodex('units'); }, style: { cursor: 'pointer' } }, [
      el('span.hb-ico', { html: ic('codex') }),
      el('.hb-text', {}, [el('span.hb-label', {}, 'Codex'), el('span.hb-sub', {}, 'browse every champion, synergy, augment, item & boss')]),
      el('span.hb-count', {}, '›'),
    ]),
    el('.art-toggle', { onclick: () => { setArtSet(getArtSet() === 'detailed' ? 'classic' : 'detailed'); Sfx.click(); chooseMode(); } }, [
      el('span', { style: { color: 'var(--ink-dim)' } }, 'Character art:'),
      el('span', { style: { fontWeight: 800, color: 'var(--gold)' } }, getArtSet() === 'detailed' ? 'Detailed' : 'Classic'),
      el('span', { style: { color: 'var(--ink-faint)' } }, '· tap to switch'),
    ]),
    el('.art-toggle', { onclick: () => showSeedPrompt(), style: { cursor: 'pointer' } }, [
      el('span', { style: { color: 'var(--ink-dim)' } }, '⚑ Play a shared seed'),
      el('span', { style: { color: 'var(--ink-faint)' } }, '· beat a friend\'s run'),
    ]),
    // Install-as-app: hidden once the game is already running as an installed app.
    isStandalone() ? null : el('.install-pill', { onclick: () => { Sfx.click(); promptInstall(); } }, [el('span', { html: ic('spoils') }), el('span', {}, 'Install app on this device')]),
  ]));
}

// ---------- boot ----------
{
  syncRetroHonors();   // one-time: credit milestones a returning player already reached (no windfall)
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
  honor: (id) => claimHonor(id), honors: () => showHonors('menu'),
  end: () => endScreen(),
  sim: (board, round) => simulate(board, getEnemyBoard(round || run.round, null).units.map(({ defId, star, col, row }) => ({ defId, star, col, row })), hashSeed(run.seed, round || run.round), { aug: { player: augmentBundle(run.augments) } }),
};
console.log('[warbound] game loop ready. Round', run.round, '| board limit', Run.boardLimit(run));
