// Combat renderer: plays back a sim event timeline onto the DOM board.
// The sim already decided the outcome; this is pure performance (juice + readability).
// Pausable / speed-scalable / skippable because it only animates `events`.
import { el } from '../dom.js';
import { championSVG } from '../champ-art.js';
import { summonSVG } from '../svg.js';
import { UNITS_BY_ID } from '../data/units.js';
import { Sfx } from '../audio/audio.js';
import { Shake } from './fx.js';
import { ic } from '../icons.js';
import { MOVE_INTERVAL } from '../sim/combat.js';

const DT_COLORS = { physical: 'var(--dt-physical)', magic: 'var(--dt-magic)', true: 'var(--dt-true)', heal: 'var(--dt-heal)' };

// Per-unit ability VFX. The SHAPE signals what the ability DOES (execute / drain / frost / stomp /
// summon / volley / nuke …) so the player learns a unit by its cast; the COLOUR is the per-unit
// signal so same-role neighbours still differ. `fx` = primary effect shape, `fx2` = an optional
// secondary read (e.g. Wraith = execute THEN life-drain; Knight = stomp THEN team haste-wave).
const UNIT_FX = {
  // Human
  knight_captain: { c: '#ffd95c', fx: 'stomp', fx2: 'teamAura' }, court_mage: { c: '#6fb1ff', fx: 'ringBurst' }, crossbowman: { c: '#dfe7f2', fx: 'arrows', fx2: 'frost' }, field_medic: { c: '#7affc0', fx: 'heal' }, banner_sergeant: { c: '#ffe08a', fx: 'rune', fx2: 'teamAura' },
  // Undead
  bone_guard: { c: '#d8e6cc', fx: 'stomp' }, lich: { c: '#8cff9e', fx: 'ringBurst', fx2: 'frost' }, skeleton_archer: { c: '#b6e0a0', fx: 'arrows' }, wraith: { c: '#b0ffd8', fx: 'execMark', fx2: 'drain' }, necromancer: { c: '#6effa0', fx: 'rune' }, death_knight: { c: '#7fffb0', fx: 'chop', fx2: 'drain' },
  // Elf
  moon_priestess: { c: '#aef0ff', fx: 'ringBurst' }, wood_ranger: { c: '#8fe07a', fx: 'arrows' }, shadow_dancer: { c: '#9fb0ff', fx: 'execMark' }, grove_healer: { c: '#7affc0', fx: 'heal' },
  // Demon
  hellguard: { c: '#ff8a4c', fx: 'sweep' }, warlock: { c: '#ff5a3c', fx: 'pillar' }, fel_archer: { c: '#ff7a5c', fx: 'arrows', fx2: 'hexSeal' }, imp_assassin: { c: '#ff9a6c', fx: 'execMark' }, pit_summoner: { c: '#ff5e8a', fx: 'rune' }, oathbreaker: { c: '#ff6a8a', fx: 'chop', fx2: 'hexSeal' },
  // Beast / the Wilds
  beast_hunter: { c: '#ffc46a', fx: 'arrows' }, bramble_brute: { c: '#c8e06a', fx: 'sweep' }, pack_stalker: { c: '#ffb15a', fx: 'execMark' }, druid_healer: { c: '#9be86a', fx: 'shield' }, beastmaster: { c: '#ffd24a', fx: 'rune' },
  // Dragon
  dragon_knight: { c: '#ff7a3c', fx: 'cone' }, dragon_sage: { c: '#c79bff', fx: 'cone' }, wyrm_archer: { c: '#ff7a3c', fx: 'arrows' }, wyrmguard: { c: '#ffd24a', fx: 'shield', fx2: 'teamAura' },
  // Orc / the Warhorde
  berserker: { c: '#8fd24a', fx: 'execMark', fx2: 'drain' }, orc_grunt: { c: '#7fc24a', fx: 'stomp' }, orc_shaman: { c: '#aef06a', fx: 'ringBurst', fx2: 'frost' }, axethrower: { c: '#9bd05a', fx: 'arrows' }, warboss: { c: '#6fae3a', fx: 'slam', fx2: 'stomp' },
};

export class CombatPlayer {
  constructor(unitsLayer, fxLayer) {
    this.unitsLayer = unitsLayer;
    this.fxLayer = fxLayer;
    this.nodes = new Map();      // id -> { el, maxHp, hp }
    this.speed = 1;
    this.raf = 0;
    this.critPending = new Set();   // attacker ids whose next hit lands a crit
    this.pauseFor = 0;              // remaining hit-stop in *combat ms* (frozen clock)
    this.unitStats = new Map();   // combat id -> { defId, team, dealt, tanked } (per-unit live stats)
    this.fightMs = 0; this.statsEl = null; this._statsDirty = false; this._statRows = null;
    this.stageEl = unitsLayer.closest('.stage') || unitsLayer.closest('.board-wrap') || unitsLayer;
    // shake the .stage (no overflow/clip/shadow of its own) so it moves as one cheap GPU layer
    this.shake = new Shake(this.stageEl);
  }

  _ms(base) { return base / this.speed; }   // scale every animation/timeout by combat speed
  // hit-stop: freeze the combat clock briefly so an impact reads with weight (Vlambeer/Smash).
  hitStop(ms) { this.pauseFor = Math.max(this.pauseFor, ms); }

  clear() {
    this.unitsLayer.replaceChildren();
    this.fxLayer.replaceChildren();
    this.nodes.clear();
    this.unitStats.clear(); this.fightMs = 0; this._statRows = null;
    if (this.statsEl) { this.statsEl.remove(); this.statsEl = null; }
  }

  // ordered per-unit stats for YOUR warband (spawn order = board order) — for planning persistence.
  playerStats() { return [...this.unitStats.values()].filter((s) => s.team === 'player').map((s) => ({ defId: s.defId, dealt: Math.round(s.dealt), tanked: Math.round(s.tanked) })); }

  // Live per-unit stats panel: one row per YOUR champion (dmg dealt + dmg tanked). Champion icons
  // are built ONCE (keyed by combat id); per-frame updates only touch the two number text nodes.
  // NOTE: the always-on floating panel is disabled — stats now live behind the top-bar "Warband
  // stats" button (showStats). Per-unit data is still tracked (in the 'damage' handler) for that
  // overlay and for playerStats(); this method is a no-op so nothing floats over the board.
  _updateStats() {
    return;   // disabled: stats moved to the top-bar overlay (showStats). Data still tracked elsewhere.
    const mine = [...this.unitStats.entries()].filter(([, s]) => s.team === 'player');
    if (!this.statsEl || !this._statRows || this._statRows.size !== mine.length) {
      if (this.statsEl) this.statsEl.remove();
      this._statRows = new Map();
      const rows = mine.map(([id, s]) => {
        const def = UNITS_BY_ID[s.defId];
        const dealtEl = el('span.cs-dealt', {}, '0'), tankEl = el('span.cs-tank', {}, '0');
        this._statRows.set(id, { dealtEl, tankEl });
        return el('.cs-row', {}, [el('span.cs-champ', { html: def ? championSVG(def, { size: 16 }) : '' }), el('span.cs-ic', { html: ic('sword') }), dealtEl, el('span.cs-ic', { html: ic('shield') }), tankEl]);
      });
      this.statsEl = el('.combat-stats', {}, [el('.cs-head', {}, 'Your warband'), ...rows]);
      (this.unitsLayer.closest('.board-wrap') || this.stageEl).appendChild(this.statsEl);
    }
    for (const [id, s] of mine) { const r = this._statRows.get(id); if (r) { r.dealtEl.textContent = Math.round(s.dealt); r.tankEl.textContent = Math.round(s.tanked); } }
  }

  _spawn(e) {
    const def = e.defId === 'summon' ? null : UNITS_BY_ID[e.defId];
    const node = el(`.unit.team-${e.team}`, { dataset: { star: e.star, id: e.id } });
    node.style.transform = `translate(${e.col * 100}%, ${e.row * 100}%)`;
    node.style.zIndex = e.row + 1;          // Y-sort: lower rows draw on top
    // summoned creature — distinct art per summon kind (wolf/imp/spirit/risen/soldier)
    const art = def ? championSVG(def, { size: 60 }) : summonSVG(e.summonKind || 'risen', { size: 60 });
    node.append(
      el('.base'),
      e.star > 1 ? el('.stars', {}, '★'.repeat(e.star)) : el('.stars'),
      el('.frame', { html: art }),
      el('.bars', {}, [
        el('.bar.hp', {}, [el('.trail'), el('.fill')]),
        el('.bar.mana', {}, [el('.fill', { style: { transform: 'scaleX(0)' } })]),
      ]),
    );
    node.querySelector('.bar.hp .fill').style.transform = 'scaleX(1)';
    node.querySelector('.bar.hp .trail').style.transform = 'scaleX(1)';
    if (e.summon) node.classList.add('summon');
    // cheap hit-flash overlay (opacity = compositor-only; replaces per-hit filter:brightness)
    node.querySelector('.frame').append(el('.hitflash'));
    this.unitsLayer.append(node);
    this.nodes.set(e.id, { el: node, maxHp: e.maxHp, hp: e.hp, team: e.team });
    if (e.defId !== 'summon') { this.unitStats.set(e.id, { defId: e.defId, team: e.team, dealt: 0, tanked: 0 }); if (e.team === 'player') this._statsDirty = true; }
    // spawn pop-in (0 -> 1.15 -> 1, ease-out-back) on the body so the cell anchor never shifts
    const body = node.querySelector('.champ-body');
    if (body) body.animate(
      [{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(1.15)', opacity: 1, offset: .7 }, { transform: 'scale(1)' }],
      { duration: this._ms(340), easing: 'cubic-bezier(.34,1.56,.64,1)' });
  }

  // brief white flash on the struck unit (opacity overlay, GPU-cheap)
  _flash(node, strength = 0.85, ms = 120) {
    const f = node.querySelector('.hitflash'); if (!f) return;
    f.animate([{ opacity: strength }, { opacity: 0 }], { duration: this._ms(ms), easing: 'ease-out' });
  }
  // squash & stretch on the body (volume-preserving), settling with overshoot
  _squash(node, sx = 1.18, sy = 0.84) {
    const body = node.querySelector('.champ-body'); if (!body) return;
    body.animate(
      [{ transform: 'scale(1,1)' }, { transform: `scale(${sx},${sy})`, offset: .3 }, { transform: 'scale(1,1)' }],
      { duration: this._ms(220), easing: 'cubic-bezier(.34,1.56,.64,1)' });
  }
  // Phase-2 signature attack motion per CLASS, so an auto-attack reads as "that's a knight / a
  // ranger / a mage" at a glance. dx,dy = clamped board direction toward the target. The body's
  // idle loop resumes automatically when the one-shot WAAPI animation ends.
  _attackMotion(body, klass, ranged, dx, dy) {
    const run = (kf, ms, easing) => body.animate(kf, { duration: this._ms(ms), easing });
    // v2 "Detailed" art: swing the actual weapon-arm around the shoulder (limbs move, not just the body)
    const arm = body.querySelector && body.querySelector('.v2-arm-front');
    if (arm) {
      const swing = ranged
        ? [{ transform: 'rotate(0)' }, { transform: 'rotate(-13deg)', offset: .4 }, { transform: 'rotate(3deg)', offset: .62 }, { transform: 'rotate(0)' }]
        : [{ transform: 'rotate(0)' }, { transform: 'rotate(-46deg)', offset: .26 }, { transform: 'rotate(40deg)', offset: .55 }, { transform: 'rotate(0)' }];
      arm.animate(swing, { duration: this._ms(ranged ? 320 : (klass === 'knight' ? 380 : 300)), easing: 'cubic-bezier(.3,1.25,.5,1)' });
    }
    if (!ranged) {
      if (klass === 'knight') {                 // heavy overhead chop: wind back, then a weighty fall
        run([{ transform: 'translate(0,0) rotate(0)' },
             { transform: `translate(${-dx * 10}%, -8%) rotate(-7deg)`, offset: .24 },
             { transform: `translate(${dx * 46}%, ${dy * 40}%) rotate(7deg) scale(1.1)`, offset: .54 },
             { transform: 'translate(0,0) rotate(0)' }], 380, 'cubic-bezier(.3,1.25,.5,1)');
      } else if (klass === 'assassin') {        // quick double flick
        run([{ transform: 'translate(0,0)' },
             { transform: `translate(${dx * 30}%, ${dy * 26}%) scale(1.05)`, offset: .18 },
             { transform: 'translate(0,0)', offset: .4 },
             { transform: `translate(${dx * 34}%, ${dy * 28}%) scale(1.05)`, offset: .62 },
             { transform: 'translate(0,0)' }], 300, 'ease-out');
      } else {                                  // default lunge (beast & co.)
        run([{ transform: 'translate(0,0)' },
             { transform: `translate(${dx * 42}%, ${dy * 42}%) scale(1.08)`, offset: .35 },
             { transform: 'translate(0,0)' }], 300, 'cubic-bezier(.3,1.4,.5,1)');
      }
    } else {
      if (klass === 'ranger') {                 // draw & loose: pull the body back, then snap forward
        run([{ transform: 'scaleX(1) translate(0,0)' },
             { transform: `scaleX(.92) translate(${-dx * 10}%,0)`, offset: .42 },
             { transform: `scaleX(1.06) translate(${dx * 9}%,0)`, offset: .6 },
             { transform: 'scaleX(1) translate(0,0)' }], 320, 'ease-out');
      } else if (klass === 'mage') {            // channel: a forward push with a swell
        run([{ transform: 'scale(1)' },
             { transform: `translate(${dx * 8}%, ${dy * 4}%) scale(1.07)`, offset: .5 },
             { transform: 'translate(0,0) scale(1)' }], 340, 'ease-in-out');
      } else if (klass === 'healer') {          // gentle reach (soft, never punchy)
        run([{ transform: 'scale(1)' },
             { transform: 'translateY(-6%) scale(1.03)', offset: .5 },
             { transform: 'scale(1)' }], 380, 'ease-in-out');
      } else {                                   // summoner & other ranged — a conjuring bob
        run([{ transform: 'scale(1)' },
             { transform: 'translateY(-7%) scale(1.05)', offset: .42 },
             { transform: 'scale(1)' }], 340, 'ease-in-out');
      }
    }
  }
  // a scorch decal left where a unit died (Vlambeer "permanence" — makes kills memorable)
  _scorch(x, y) {
    const d = this._fx('vfx-scorch', x, y, {});
    d.animate([{ opacity: .55, transform: 'translate(-50%,-50%) scale(1)' }, { opacity: 0, transform: 'translate(-50%,-50%) scale(.8)' }],
      { duration: 2600, easing: 'ease-in' }).finished.then(() => d.remove()).catch(() => {});
  }

  _setMana(id, frac) {
    const n = this.nodes.get(id); if (!n) return;
    const f = n.el.querySelector('.bar.mana .fill'); if (f) f.style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`;
    if (frac >= 1) { n.el.querySelector('.bar.mana')?.classList.add('full'); } else { n.el.querySelector('.bar.mana')?.classList.remove('full'); }
  }
  _bumpMana(id, by) { const n = this.nodes.get(id); if (!n) return; n.mana = Math.min(1, (n.mana || 0) + by); this._setMana(id, n.mana); }

  _setHP(id, hp) {
    const n = this.nodes.get(id); if (!n) return;
    n.hp = hp;
    const f = Math.max(0, hp / n.maxHp);
    n.el.querySelector('.bar.hp .fill').style.transform = `scaleX(${f})`;
    // trail lags behind (set after a beat)
    const trail = n.el.querySelector('.bar.hp .trail');
    setTimeout(() => { trail.style.transform = `scaleX(${f})`; }, this._ms(90));
  }

  _floatNum(id, text, color, big = false) {
    // bound cosmetic churn under stress (many units hit at once) — crits always show; the HP bar
    // updates regardless. Normal play rarely has >40 live fx nodes, so this is invisible then.
    if (!big && this.fxLayer.childElementCount > 40) return;
    const n = this.nodes.get(id); if (!n) return;
    const m = n.el.style.transform.match(/translate\(([\d.]+)%,\s*([\d.]+)%\)/);
    if (!m) return;
    const num = el(`.dmg-num${big ? ' crit' : ''}`, { style: { color } }, text);
    // place at the unit's tile (percentages of board); convert tile->% of board (tile=12.5%)
    num.style.left = `${(+m[1]) * 0.125 + 6}%`;
    num.style.top = `${(+m[2]) * 0.125 + 4}%`;
    this.fxLayer.append(num);
    // crit numbers pop bigger with an overshoot, then drift up; normals are subtler
    const peak = big ? 1.65 : 1.05;
    num.animate(
      [{ transform: 'translateY(0) scale(.6)', opacity: 1 }, { transform: `translateY(-6px) scale(${peak})`, opacity: 1, offset: .25 }, { transform: `translateY(-30px) scale(${big ? 1.2 : 1})`, opacity: 0 }],
      { duration: this._ms(big ? 780 : 650), easing: 'cubic-bezier(.2,1.4,.5,1)' }
    ).finished.then(() => num.remove()).catch(() => {});
  }

  _spark(id, color, n = 3, spread = 22) {
    if (this.fxLayer.childElementCount > 46) return;   // bound spark churn under heavy simultaneous damage
    const node = this.nodes.get(id); if (!node) return;
    const m = node.el.style.transform.match(/translate\(([\d.]+)%,\s*([\d.]+)%\)/); if (!m) return;
    const cx = (+m[1]) * 0.125 + 6, cy = (+m[2]) * 0.125 + 6;
    n = Math.min(n, 4);                          // cap particle count for weak devices
    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 2 * i) / n + i * 1.1;
      const dx = Math.cos(ang) * spread, dy = Math.sin(ang) * spread - 4;
      const p = el('.spark', { style: { position: 'absolute', left: `${cx}%`, top: `${cy}%`, width: '5px', height: '5px', borderRadius: '50%', background: color } });
      this.fxLayer.append(p);
      p.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(0)`, opacity: 0 }],
        { duration: (320 + i * 20) / this.speed, easing: 'cubic-bezier(.2,.6,.3,1)' }).finished.then(() => p.remove()).catch(() => {});
    }
  }

  // tile-center position of a unit in % of the board (for placing fx)
  _pos(id) {
    const n = this.nodes.get(id); if (!n) return null;
    const m = n.el.style.transform.match(/translate\(([\d.]+)%,\s*([\d.]+)%\)/); if (!m) return null;
    return { x: (+m[1]) * 0.125 + 6.25, y: (+m[2]) * 0.125 + 5.5 };
  }
  _fx(cls, x, y, styles = {}) {
    const e = el('.vfx ' + cls, { style: { position: 'absolute', left: x + '%', top: y + '%', ...styles } });
    this.fxLayer.append(e); return e;
  }

  // ability cast wind-up: the caster charges (glow + scale) before the effect lands
  _windup(id) {
    const n = this.nodes.get(id); if (!n) return;
    n.el.classList.remove('casting'); void n.el.offsetWidth; n.el.classList.add('casting');
    setTimeout(() => n.el && n.el.classList.remove('casting'), this._ms(420));
  }

  // PER-UNIT signature ability visuals: keyed by the casting UNIT (its theme colour + a shape
  // variant), so two heroes that share an ability still look different — a green Lich blast vs a
  // red Warlock pillar vs a blue Court Mage ring. Colour is the per-unit signal; the variant is
  // the shape family. Returns true if it drew one; else _castVfx falls back to the generic shape.
  _signatureVfx(e, c, t) {
    const sp = this.speed;
    const defId = this.unitStats.get(e.id) && this.unitStats.get(e.id).defId;
    const cfg = UNIT_FX[defId];
    if (!cfg) return false;
    const col = cfg.c, p = t || c;
    const glow = `drop-shadow(0 0 6px ${col})`;
    const fade = (cls, x, y, styles, kf, ms, easing) => { const f = this._fx(cls, x, y, styles); f.animate(kf, { duration: ms / sp, easing }).finished.then(() => f.remove()).catch(() => {}); return f; };
    const tn = e.tgt >= 0 ? this.nodes.get(e.tgt) : null;
    // draw one primitive; a unit can stack a primary `fx` + a secondary `fx2` (e.g. execute+drain)
    const draw = (kind) => {
    switch (kind) {
      case 'ringBurst':                // caster magic: expanding coloured ring + bright core
        fade('vfx-ring', p.x, p.y, { borderColor: col, boxShadow: `0 0 10px ${col}` }, [{ transform: 'translate(-50%,-50%) scale(.2)', opacity: .9 }, { transform: 'translate(-50%,-50%) scale(1.8)', opacity: 0 }], 500, 'cubic-bezier(.2,.7,.3,1)');
        fade('vfx-burst', p.x, p.y, { background: col }, [{ transform: 'translate(-50%,-50%) scale(.3)', opacity: .9 }, { transform: 'translate(-50%,-50%) scale(1.4)', opacity: 0 }], 340);
        if (e.tgt >= 0) this._spark(e.tgt, col, 6, 30);
        this.shake.add(0.16); this.hitStop(50); break;
      case 'shards':                   // a sharp detonation that throws coloured shards
        fade('vfx-burst', p.x, p.y, { background: col }, [{ transform: 'translate(-50%,-50%) scale(.2)', opacity: .95 }, { transform: 'translate(-50%,-50%) scale(1.5)', opacity: 0 }], 320);
        if (e.tgt >= 0) this._spark(e.tgt, col, 10, 38);
        this.shake.add(0.2); this.hitStop(55); break;
      case 'pillar':                   // a column of coloured light slams the target
        fade('vfx-beam', p.x, p.y, { background: `linear-gradient(${col}, transparent)`, filter: glow }, [{ transform: 'translate(-50%,-100%) scaleY(.15)', opacity: 0 }, { transform: 'translate(-50%,-100%) scaleY(1)', opacity: .95, offset: .4 }, { transform: 'translate(-50%,-100%) scaleY(1)', opacity: 0 }], 420, 'ease-out');
        fade('vfx-ring', p.x, p.y, { borderColor: col }, [{ transform: 'translate(-50%,-50%) scale(.2)', opacity: .9 }, { transform: 'translate(-50%,-50%) scale(1.3)', opacity: 0 }], 340);
        this.shake.add(0.18); break;
      case 'cone':                     // a breath cone in the unit's colour (fire dragon vs void dragon)
        fade('vfx-cone', (c.x + p.x) / 2, (c.y + p.y) / 2, { background: `radial-gradient(closest-side, #fff, ${col} 45%, transparent)`, filter: glow }, [{ transform: 'translate(-50%,-50%) scale(.3)', opacity: .95 }, { transform: 'translate(-50%,-50%) scale(1.5)', opacity: 0 }], 460, 'ease-out');
        if (e.tgt >= 0) this._spark(e.tgt, col, 7, 30);
        this.shake.add(0.26); this.hitStop(70); break;
      case 'sweep':                    // a wide coloured slash across the front
        fade('vfx-slash', p.x, p.y, { width: '92%', borderTopColor: col, borderRightColor: col, filter: glow }, [{ transform: 'translate(-50%,-50%) rotate(-12deg) scaleX(.3)', opacity: .95 }, { transform: 'translate(-50%,-50%) rotate(6deg) scaleX(1.2)', opacity: 0 }], 260, 'ease-out');
        this.shake.add(0.16); break;
      case 'chop':                     // a brutal coloured downward chop + a flash on the victim
        fade('vfx-slash', p.x, p.y, { width: '70%', borderTopColor: col, borderRightColor: col, filter: glow }, [{ transform: 'translate(-50%,-65%) rotate(-72deg) scale(.4)', opacity: 1 }, { transform: 'translate(-50%,-50%) rotate(8deg) scale(1.1)', opacity: 0 }], 240, 'cubic-bezier(.4,1.2,.5,1)');
        if (tn) this._flash(tn.el, 0.9, 160);
        this.shake.add(0.2); this.hitStop(55); break;
      case 'arrows':                   // a rain of coloured arrows onto the cluster
        for (let i = 0; i < 5; i++) { const ox = (i - 2) * 6; fade('vfx-arrow', p.x + ox, p.y, { background: `linear-gradient(#fff, ${col})`, boxShadow: `0 0 4px ${col}` }, [{ transform: 'translate(-50%,-260%) rotate(50deg)', opacity: 0 }, { transform: 'translate(-50%,-160%) rotate(50deg)', opacity: 1, offset: .25 }, { transform: 'translate(-50%,0%) rotate(50deg)', opacity: 0 }], 380 + i * 30, 'ease-in'); }
        this.shake.add(0.1); break;
      case 'slam':                     // a coloured slam + a spinning stun ring
        fade('vfx-burst', p.x, p.y, { background: col }, [{ transform: 'translate(-50%,-50%) scale(.3)', opacity: .85 }, { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 0 }], 260);
        fade('vfx-stun', p.x, p.y - 9, { borderTopColor: col, borderBottomColor: col, filter: glow }, [{ transform: 'translate(-50%,-50%) scale(.6) rotate(0)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1) rotate(180deg)', opacity: 1, offset: .3 }, { transform: 'translate(-50%,-50%) scale(1) rotate(540deg)', opacity: 0 }], 700, 'linear');
        if (tn) this._flash(tn.el, 0.7, 140);
        this.shake.add(0.18); this.hitStop(55); break;
      case 'rune':                     // a coloured summoning rune flares on the ground
        fade('vfx-rune', c.x, c.y + 2, { borderColor: col, background: `conic-gradient(from 0deg, ${col}44, transparent, ${col}44, transparent)`, boxShadow: `0 0 12px ${col}` }, [{ transform: 'translate(-50%,-50%) scale(.3) rotate(0)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1) rotate(45deg)', opacity: .9, offset: .4 }, { transform: 'translate(-50%,-50%) scale(1.1) rotate(90deg)', opacity: 0 }], 560, 'ease-out');
        this._spark(e.id, col, 7, 26);
        this.shake.add(0.12); break;
      case 'heal':                     // a soft coloured heal glow rising on the ally
        fade('vfx-heal', p.x, p.y, { background: `radial-gradient(closest-side, ${col}, transparent)` }, [{ transform: 'translate(-50%,-50%) scale(.4)', opacity: .8 }, { transform: 'translate(-50%,-90%) scale(1.25)', opacity: 0 }], 520, 'ease-out');
        break;
      case 'shield':                   // a coloured protective bubble pops in around the ally
        fade('vfx-shield', p.x, p.y, { borderColor: col, boxShadow: `0 0 10px ${col}` }, [{ transform: 'translate(-50%,-50%) scale(.3)', opacity: .9 }, { transform: 'translate(-50%,-50%) scale(1.1)', opacity: .2 }], 420, 'cubic-bezier(.3,1.5,.6,1)');
        break;
      case 'execMark':                 // EXECUTE: a crosshair reticle snaps onto the victim + a hard flash
        fade('vfx-reticle', p.x, p.y, { borderColor: col, color: col, filter: glow }, [{ transform: 'translate(-50%,-50%) scale(2.2) rotate(0)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1) rotate(45deg)', opacity: 1, offset: .5 }, { transform: 'translate(-50%,-50%) scale(.65) rotate(90deg)', opacity: 0 }], 300, 'cubic-bezier(.3,1,.4,1)');
        if (tn) this._flash(tn.el, 1, 150);
        if (e.tgt >= 0) this._spark(e.tgt, col, 8, 32);
        this.shake.add(0.2); this.hitStop(60); break;
      case 'drain':                    // LIFE/MANA LEECH: orbs stream from the victim back to the caster
        if (e.tgt >= 0 && c) for (let i = 0; i < 3; i++) { const o = this._fx('vfx-orb', p.x, p.y, { background: col, color: col }); o.animate([{ left: p.x + '%', top: p.y + '%', transform: 'translate(-50%,-50%) scale(1)', opacity: 0 }, { opacity: 1, offset: .2 }, { left: c.x + '%', top: c.y + '%', transform: 'translate(-50%,-50%) scale(.35)', opacity: 0 }], { duration: (420 + i * 70) / sp, easing: 'cubic-bezier(.4,.1,.7,1)', delay: (i * 55) / sp }).finished.then(() => o.remove()).catch(() => {}); }
        break;
      case 'stomp':                    // SLAM / KNOCKBACK: a flat ground shock-ring kicks out + victim jolt
        fade('vfx-shock', p.x, p.y + 4.5, { borderColor: col, filter: glow }, [{ transform: 'translate(-50%,-50%) scaleX(.3) scaleY(.12)', opacity: .9 }, { transform: 'translate(-50%,-50%) scaleX(1.7) scaleY(.55)', opacity: 0 }], 360, 'ease-out');
        if (tn) this._flash(tn.el, 0.7, 140);
        this.shake.add(0.2); this.hitStop(55); break;
      case 'frost':                    // SLOW / FROST: a pale crystal field blooms over the cluster and lingers
        fade('vfx-frost', p.x, p.y, { borderColor: col, color: col, boxShadow: `0 0 10px ${col}` }, [{ transform: 'translate(-50%,-50%) scale(.3) rotate(0)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1) rotate(30deg)', opacity: .85, offset: .3 }, { transform: 'translate(-50%,-50%) scale(1.05) rotate(40deg)', opacity: .6, offset: .7 }, { transform: 'translate(-50%,-50%) scale(1.12) rotate(45deg)', opacity: 0 }], 720, 'ease-out');
        if (e.tgt >= 0) this._spark(e.tgt, col, 4, 22); break;
      case 'hexSeal':                  // DENIAL (mana-burn / heal-cut / shred): a rune-seal clamps + shatters on the victim
        fade('vfx-rune', p.x, p.y, { width: '15%', border: `2px solid ${col}`, background: `conic-gradient(from 0deg, ${col}55, transparent, ${col}55, transparent)`, filter: glow }, [{ transform: 'translate(-50%,-50%) scale(1.7) rotate(0)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(.9) rotate(140deg)', opacity: .95, offset: .5 }, { transform: 'translate(-50%,-50%) scale(.65) rotate(260deg)', opacity: 0 }], 460, 'ease-in'); break;
      case 'teamAura':                 // ALLY BUFF: a soft colour ground-wave radiates from the caster
        fade('vfx-wave', c.x, c.y + 4.5, { borderColor: col, filter: glow }, [{ transform: 'translate(-50%,-50%) scaleX(.2) scaleY(.1)', opacity: .8 }, { transform: 'translate(-50%,-50%) scaleX(2.6) scaleY(1.1)', opacity: 0 }], 560, 'ease-out'); break;
      default: return false;
    }
    return true;
    };
    const ok = draw(cfg.fx);
    if (cfg.fx2) draw(cfg.fx2);   // optional secondary read (e.g. execute → drain, stomp → team haste)
    return ok;
  }

  // Dota-style per-shape ability visuals
  _castVfx(e) {
    const c = this._pos(e.id); if (!c) return;
    const t = e.tgt >= 0 ? this._pos(e.tgt) : null;
    if (this._signatureVfx(e, c, t)) return;   // a named-ability signature took over
    const sp = this.speed;
    switch (e.shape) {
      case 'aoe': {                       // expanding ring + flash at the target cluster
        const p = t || c; const col = e.dragon ? 'var(--dt-fire)' : 'var(--dt-magic)';
        const ring = this._fx('vfx-ring', p.x, p.y, { borderColor: col });
        ring.animate([{ transform: 'translate(-50%,-50%) scale(.2)', opacity: .9 }, { transform: 'translate(-50%,-50%) scale(1.6)', opacity: 0 }], { duration: 460 / sp, easing: 'cubic-bezier(.2,.7,.3,1)' }).finished.then(() => ring.remove()).catch(() => {});
        const flash = this._fx('vfx-burst', p.x, p.y, { background: col });
        flash.animate([{ transform: 'translate(-50%,-50%) scale(.3)', opacity: .85 }, { transform: 'translate(-50%,-50%) scale(1.3)', opacity: 0 }], { duration: 320 / sp }).finished.then(() => flash.remove()).catch(() => {});
        this.shake.add(e.dragon ? 0.22 : 0.12);
        break;
      }
      case 'bolt': {                      // an orb streaks to the target and bursts
        if (!t) break;
        const orb = this._fx('vfx-orb', c.x, c.y, { background: 'var(--dt-magic)' });
        orb.animate([{ left: c.x + '%', top: c.y + '%', transform: 'translate(-50%,-50%) scale(.6)' }, { left: t.x + '%', top: t.y + '%', transform: 'translate(-50%,-50%) scale(1.1)' }], { duration: 220 / sp, easing: 'cubic-bezier(.4,0,.7,1)' }).finished.then(() => { orb.remove(); const b = this._fx('vfx-burst', t.x, t.y, { background: 'var(--dt-magic)' }); b.animate([{ transform: 'translate(-50%,-50%) scale(.3)', opacity: .9 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 }], { duration: 260 / sp }).finished.then(() => b.remove()).catch(() => {}); }).catch(() => {});
        break;
      }
      case 'cleave': case 'strike': {     // a slashing arc bursts at caster front / target
        const p = t || c;
        const arc = this._fx('vfx-slash', p.x, p.y, {});
        arc.animate([{ transform: 'translate(-50%,-50%) rotate(-40deg) scale(.4)', opacity: .95 }, { transform: 'translate(-50%,-50%) rotate(35deg) scale(1.2)', opacity: 0 }], { duration: 240 / sp, easing: 'ease-out' }).finished.then(() => arc.remove()).catch(() => {});
        break;
      }
      case 'heal': {                      // green glow + rising plus on the target ally
        const p = t || c;
        const g = this._fx('vfx-heal', p.x, p.y, {});
        g.animate([{ transform: 'translate(-50%,-50%) scale(.4)', opacity: .8 }, { transform: 'translate(-50%,-50%) scale(1.3)', opacity: 0 }], { duration: 520 / sp }).finished.then(() => g.remove()).catch(() => {});
        break;
      }
      case 'shield': {                    // a bubble pops in around the ally
        const p = t || c;
        const s = this._fx('vfx-shield', p.x, p.y, {});
        s.animate([{ transform: 'translate(-50%,-50%) scale(.3)', opacity: .9 }, { transform: 'translate(-50%,-50%) scale(1.1)', opacity: .2 }], { duration: 420 / sp, easing: 'cubic-bezier(.3,1.5,.6,1)' }).finished.then(() => s.remove()).catch(() => {});
        break;
      }
      case 'summon': {                    // dark poof at the caster
        const s = this._fx('vfx-burst', c.x, c.y, { background: '#9d6bff' });
        s.animate([{ transform: 'translate(-50%,-50%) scale(.2)', opacity: .8 }, { transform: 'translate(-50%,-50%) scale(1.2)', opacity: 0 }], { duration: 360 / sp }).finished.then(() => s.remove()).catch(() => {});
        break;
      }
    }
  }

  _projectile(from, to, kind) {
    const a = this.nodes.get(from), b = this.nodes.get(to);
    if (!a || !b) return;
    const pa = a.el.style.transform.match(/translate\(([\d.]+)%,\s*([\d.]+)%\)/);
    const pb = b.el.style.transform.match(/translate\(([\d.]+)%,\s*([\d.]+)%\)/);
    if (!pa || !pb) return;
    const dot = el('.proj', { style: {
      position: 'absolute', width: '8px', height: '8px', borderRadius: '50%',
      background: kind === 'magic' ? 'var(--dt-magic)' : 'var(--dt-physical)',
      boxShadow: `0 0 8px ${kind === 'magic' ? 'var(--dt-magic)' : 'var(--dt-physical)'}`,
      left: `${(+pa[1]) * 0.125 + 6}%`, top: `${(+pa[2]) * 0.125 + 6}%`,
    } });
    this.fxLayer.append(dot);
    dot.animate(
      [{ left: dot.style.left, top: dot.style.top }, { left: `${(+pb[1]) * 0.125 + 6}%`, top: `${(+pb[2]) * 0.125 + 6}%` }],
      { duration: 180 / this.speed, easing: 'linear' }
    ).finished.then(() => dot.remove()).catch(() => {});
  }

  _apply(e) {
    const n = this.nodes.get(e.id);
    switch (e.type) {
      case 'spawn': this._spawn(e); break;
      case 'move': if (n) {
        // glide one cell over the sim's walk time (MOVE_INTERVAL), scaled by playback speed, with
        // linear easing so a multi-cell march flows smoothly instead of bouncing per cell.
        n.el.style.transition = `transform ${Math.round((MOVE_INTERVAL * 1000) / this.speed)}ms linear`;
        n.el.style.transform = `translate(${e.col * 100}%, ${e.row * 100}%)`;
        n.el.style.zIndex = e.row + 1;
      } break;
      case 'blink': if (n) {
        // assassin DIVE — telegraph it so it reads as an intentional teleport-strike, not a glitch:
        // a fading after-image at the old cell, an instant snap, then a landing puff + spark.
        const from = this._pos(e.id);
        if (from) { const ghost = this._fx('vfx-blink', from.x, from.y); ghost.animate([{ opacity: .5, transform: 'translate(-50%,-50%) scale(1)' }, { opacity: 0, transform: 'translate(-50%,-50%) scale(.4)' }], { duration: 260 / this.speed, easing: 'ease-out' }).finished.then(() => ghost.remove()).catch(() => {}); }
        n.el.style.transition = 'none'; n.el.style.transform = `translate(${e.col * 100}%, ${e.row * 100}%)`; n.el.style.zIndex = e.row + 1; requestAnimationFrame(() => (n.el.style.transition = ''));
        const to = this._pos(e.id);
        if (to) { const land = this._fx('vfx-blink', to.x, to.y); land.animate([{ opacity: .75, transform: 'translate(-50%,-50%) scale(.4)' }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.15)' }], { duration: 240 / this.speed, easing: 'ease-out' }).finished.then(() => land.remove()).catch(() => {}); }
        this._spark(e.id, 'var(--dt-physical)', 5, 22); this.shake.add(0.1);
      } break;
      case 'attack': {
        const a = this.nodes.get(e.id); if (!a) break;
        const body = a.el.querySelector('.champ-body');
        const klass = (UNITS_BY_ID[this.unitStats.get(e.id)?.defId] || {}).klass;
        const from = this._pos(e.id), to = this._pos(e.tgt);
        let dx = 0, dy = 0;
        if (from && to) { dx = Math.max(-1, Math.min(1, (to.x - from.x) / 12.5)); dy = Math.max(-1, Math.min(1, (to.y - from.y) / 12.5)); }
        if (body) this._attackMotion(body, klass, e.ranged, dx, dy);
        if (!e.ranged && from && to) {   // melee: a slash arc lands on the target — bigger & slower for a knight, quick & small for an assassin
          const w = klass === 'knight' ? '72%' : klass === 'assassin' ? '46%' : '58%';
          const slash = this._fx('vfx-slash', to.x, to.y, { width: w });
          slash.animate([{ transform: 'translate(-50%,-50%) rotate(-35deg) scale(.4)', opacity: .9 }, { transform: 'translate(-50%,-50%) rotate(30deg) scale(1)', opacity: 0 }], { duration: this._ms(klass === 'knight' ? 240 : 185), easing: 'ease-out' }).finished.then(() => slash.remove()).catch(() => {});
        }
        if (e.id % 2 === 0 || !e.ranged) { e.ranged ? Sfx.arrow() : Sfx.sword(); }
        if (e.crit) { this.critPending.add(e.id); this.shake.add(0.18); this.hitStop(55); }
        this._bumpMana(e.id, 0.16);     // visual telegraph of the cast bar filling
        break;
      }
      case 'projectile': this._projectile(e.from, e.to, e.kind); break;
      case 'damage': {
        const lethal = e.hp <= 0;
        // Sudden-death drain hits EVERY unit ~30×/s — rendering a number+spark+flash per hit per
        // unit floods the DOM and nearly freezes the game. Draw it cheaply: just the HP bar (+ a
        // light flash only on the killing blow). No floating numbers, sparks, squash, or stats.
        if (e.sd) { this._setHP(e.id, e.hp); if (lethal && n) this._flash(n.el, 0.6, 90); break; }
        const crit = e.src >= 0 && this.critPending.delete(e.src);
        // throttle flash+squash per unit: lethal/crit always play; rapid normal hits on the same
        // unit coalesce (no point queueing 20 overlapping flashes on one fast-attacked tank).
        if (n && (lethal || crit || this.fightMs - (n._fxAt || -999) > 70)) {
          n._fxAt = this.fightMs;
          this._flash(n.el, lethal ? 1 : crit ? 0.95 : 0.8, lethal ? 150 : 110); this._squash(n.el, lethal ? 1.3 : crit ? 1.26 : 1.18, lethal ? 0.72 : 0.84);
        }
        this._setHP(e.id, e.hp);
        if (e.amount > 0) {
          const col = crit ? 'var(--gold)' : (DT_COLORS[e.dmgType] || 'var(--dt-physical)');
          this._floatNum(e.id, crit ? e.amount + '!' : e.amount, col, crit);
          this._spark(e.id, col, e.dmgType === 'magic' ? 5 : crit ? 5 : 3);
        }
        this._bumpMana(e.id, 0.05);
        if (e.amount > 0) {   // per-unit: credit damage dealt to the source, tanked to the target
          const src = this.unitStats.get(e.src); if (src) src.dealt += e.amount;
          const tgt = this.unitStats.get(e.id); if (tgt) tgt.tanked += e.amount;
          this._statsDirty = true;
        }
        break;
      }
      case 'heal': this._setHP(e.id, e.hp); this._floatNum(e.id, '+' + e.amount, DT_COLORS.heal); if (n) this._flash(n.el, 0.5, 160); Sfx.heal(); break;
      case 'shield': if (n) this._floatNum(e.id, '⛨' + e.amount, 'var(--shield)'); break;
      case 'revive': this._setHP(e.id, e.hp); if (n) { this._flash(n.el, 1, 260); this._spark(e.id, 'var(--dt-heal)', 6, 26); this.shake.add(0.14); } break;
      case 'dodge': this._floatNum(e.id, 'dodge', 'var(--ink-dim)'); break;
      case 'cast': if (n) { this._floatNum(e.id, e.name, 'var(--gold)'); Sfx.magic(e.id); this._windup(e.id); this._castVfx(e); if (e.shape === 'aoe' || e.shape === 'summon') this.hitStop(60); n.mana = 0; this._setMana(e.id, 0); } break;
      case 'faint': {
        const pos = this._pos(e.id);
        if (n) { this._spark(e.id, '#ffffff', 8, 30); this._flash(n.el, 1, 90); n.el.classList.add('faint'); setTimeout(() => { n.el.remove(); this.nodes.delete(e.id); }, this._ms(360)); }
        if (pos) this._scorch(pos.x, pos.y);          // permanence: a mark stays where they fell
        Sfx.death(); this.shake.add(0.3); this.hitStop(70);   // a kill is the punchiest beat
        try { if (navigator.vibrate) navigator.vibrate(18); } catch {}
        break;
      }
      // ── ability-verb effects (unique signatures + 3★ ultimates) ──
      case 'cc': this._ccVfx(e); break;
      case 'debuff': this._statusVfx(e, false); break;
      case 'buff': this._statusVfx(e, true); break;
      case 'arc': this._arcVfx(e); break;          // chain-lightning hop (moon_priestess 3★)
      case 'meteor': this._meteorVfx(e); break;    // seeded strike (pit_summoner / dragon_sage 3★)
      case 'end': break;
    }
  }

  // crowd-control landings: a quick coloured ring + glyph on the victim.
  _ccVfx(e) {
    const p = this._pos(e.id); if (!p) return;
    const n = this.nodes.get(e.id);
    const cfg = { stun: { c: '#ffd95c', g: '✦' }, knockup: { c: '#ffe08a', g: '⤊' }, taunt: { c: '#ff6a6a', g: '!' } }[e.kind] || { c: '#fff', g: '✦' };
    this._floatNum(e.id, cfg.g, cfg.c);
    if (this.shake.disabled) return;                 // reduced-motion: glyph only
    const r = this._fx('vfx-stun', p.x, p.y - 9, { borderTopColor: cfg.c, borderBottomColor: cfg.c, filter: `drop-shadow(0 0 5px ${cfg.c})` });
    r.animate([{ transform: 'translate(-50%,-50%) scale(.5) rotate(0)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1) rotate(200deg)', opacity: 1, offset: .3 }, { transform: 'translate(-50%,-50%) scale(1) rotate(540deg)', opacity: 0 }], { duration: 620 / this.speed, easing: 'linear' }).finished.then(() => r.remove()).catch(() => {});
    if (e.kind === 'knockup' && n) this._squash(n.el, 0.8, 1.25);
  }

  // debuffs (red/cool tints) vs buffs (warm/green tints): a tiny labelled pip that floats off.
  _statusVfx(e, good) {
    const map = {
      slow: { c: '#7fe3ff', t: '❄' }, shred: { c: '#ff9a4c', t: '▼def' }, manaBurn: { c: '#6fb1ff', t: '✖mana' },
      healCut: { c: '#ff7eb6', t: '⊘heal' }, dot: { c: '#ff6a3c', t: '🔥' }, mark: { c: '#ffd24a', t: '◎' },
      sacrifice: { c: '#ff5a3c', t: '✦' },
      haste: { c: '#ffe08a', t: '»as' }, lifesteal: { c: '#9be86a', t: '✚' }, dodge: { c: '#cfe0ff', t: '~' },
      thorns: { c: '#c8e06a', t: '✦' }, regen: { c: '#7affc0', t: '+' }, cleanse: { c: '#aef0ff', t: '✧' }, rage: { c: '#ff8a4c', t: '▲' },
    }[e.kind] || { c: good ? '#9be86a' : '#ff7e7e', t: good ? '+' : '–' };
    this._floatNum(e.id, map.t, map.c);
    if (!this.shake.disabled) this._spark(e.id, map.c, good ? 3 : 2, 16);
  }

  // chain-lightning hop: a quick arc drawn between two units.
  _arcVfx(e) {
    const a = this._pos(e.from), b = this._pos(e.to); if (!a || !b) return;
    if (this.shake.disabled) { this._spark(e.to, '#aef0ff', 2, 14); return; }
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    const bolt = this._fx('vfx-arc', mx, my, { width: len + '%', height: '3px', background: 'linear-gradient(90deg, transparent, #aef0ff, #fff, #aef0ff, transparent)', boxShadow: '0 0 6px #aef0ff', transform: `translate(-50%,-50%) rotate(${ang}deg)` });
    bolt.animate([{ opacity: .95, transform: `translate(-50%,-50%) rotate(${ang}deg) scaleX(.2)` }, { opacity: 0, transform: `translate(-50%,-50%) rotate(${ang}deg) scaleX(1)` }], { duration: 240 / this.speed, easing: 'ease-out' }).finished.then(() => bolt.remove()).catch(() => {});
    this._spark(e.to, '#aef0ff', 3, 18);
  }

  // meteor strike: a streak drops onto a cell and detonates.
  _meteorVfx(e) {
    const x = e.col * 12.5 + 6.25, y = e.row * 12.5 + 5.5;
    if (this.shake.disabled) { const f = this._fx('vfx-burst', x, y, { background: '#ff7a3c' }); f.animate([{ opacity: .8, transform: 'translate(-50%,-50%) scale(.5)' }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.2)' }], { duration: 260 / this.speed }).finished.then(() => f.remove()).catch(() => {}); return; }
    const streak = this._fx('vfx-beam', x, y, { background: 'linear-gradient(#ffce5c, #ff5a3c)', filter: 'drop-shadow(0 0 6px #ff7a3c)' });
    streak.animate([{ transform: 'translate(-50%,-160%) scaleY(.6)', opacity: 0 }, { transform: 'translate(-50%,-100%) scaleY(1)', opacity: 1, offset: .55 }, { transform: 'translate(-50%,-100%) scaleY(1)', opacity: 0 }], { duration: 340 / this.speed, easing: 'ease-in' }).finished.then(() => streak.remove()).catch(() => {});
    const boom = this._fx('vfx-ring', x, y, { borderColor: '#ff7a3c', boxShadow: '0 0 10px #ff7a3c' });
    boom.animate([{ transform: 'translate(-50%,-50%) scale(.2)', opacity: .9 }, { transform: 'translate(-50%,-50%) scale(1.5)', opacity: 0 }], { duration: 360 / this.speed, easing: 'cubic-bezier(.2,.7,.3,1)' }).finished.then(() => boom.remove()).catch(() => {});
    this.shake.add(0.16);
  }

  // Play the timeline. Returns a promise resolving with the winner.
  // Accumulator clock (decoupled from wall-time) so we can inject hit-stop pauses and so
  // every effect's duration scales cleanly with speed. CSS reactions read --spd to scale too.
  play(events, { speed = 1, onEvent } = {}) {
    this.clear();
    this.speed = speed;
    this.pauseFor = 0;
    if (this.stageEl) this.stageEl.style.setProperty('--spd', String(speed));
    return new Promise((resolve) => {
      let i = 0;
      let clock = 0;                 // combat ms elapsed
      let last = performance.now();
      const endEvent = events[events.length - 1];
      const tick = (nowReal) => {
        const realDt = Math.min(nowReal - last, 100);   // clamp (tab-stall = no avalanche)
        last = nowReal;
        if (this.pauseFor > 0) { this.pauseFor -= realDt; }   // real-time freeze so it reads at any speed
        else { clock += realDt * this.speed; }
        this.fightMs = clock;
        while (i < events.length && events[i].t <= clock) {
          // a single bad event must never freeze the whole fight (it would soft-lock the run)
          try { this._apply(events[i]); if (onEvent) onEvent(events[i]); }
          catch (err) { console.warn('[warbound] render event skipped:', events[i] && events[i].type, err); }
          i++;
          if (this.pauseFor > 0) break;   // honour a hit-stop triggered by the event just applied
        }
        if (this._statsDirty) { this._updateStats(); this._statsDirty = false; }
        if (i >= events.length) { resolve(endEvent && endEvent.winner); return; }
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    });
  }

  setSpeed(s) { this.speed = s; if (this.stageEl) this.stageEl.style.setProperty('--spd', String(s)); }
  skip() { /* fast path: jump remaining; handled by caller re-play at high speed or instant */ }
  stop() { cancelAnimationFrame(this.raf); }
}

// Static per-unit stats panel for the planning phase — shows the LAST battle's per-champion
// numbers and persists until the next fight starts (mirrors the live panel above).
export function unitStatsPanel(stats) {
  if (!stats || !stats.length) return null;
  const rows = stats.map((s) => {
    const def = UNITS_BY_ID[s.defId];
    return el('.cs-row', {}, [el('span.cs-champ', { html: def ? championSVG(def, { size: 16 }) : '' }), el('span.cs-ic', { html: ic('sword') }), el('span.cs-dealt', {}, String(s.dealt)), el('span.cs-ic', { html: ic('shield') }), el('span.cs-tank', {}, String(s.tanked))]);
  });
  return el('.combat-stats.last-battle', {}, [el('.cs-head', {}, 'Last battle'), ...rows]);
}
