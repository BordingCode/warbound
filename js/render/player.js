// Combat renderer: plays back a sim event timeline onto the DOM board.
// The sim already decided the outcome; this is pure performance (juice + readability).
// Pausable / speed-scalable / skippable because it only animates `events`.
import { el } from '../dom.js';
import { championSVG } from '../svg.js';
import { UNITS_BY_ID } from '../data/units.js';

const DT_COLORS = { physical: 'var(--dt-physical)', magic: 'var(--dt-magic)', true: 'var(--dt-true)', heal: 'var(--dt-heal)' };

export class CombatPlayer {
  constructor(unitsLayer, fxLayer) {
    this.unitsLayer = unitsLayer;
    this.fxLayer = fxLayer;
    this.nodes = new Map();      // id -> { el, maxHp, hp }
    this.speed = 1;
    this.raf = 0;
  }

  clear() {
    this.unitsLayer.replaceChildren();
    this.fxLayer.replaceChildren();
    this.nodes.clear();
  }

  _spawn(e) {
    const def = e.defId === 'summon' ? null : UNITS_BY_ID[e.defId];
    const node = el(`.unit.team-${e.team}`, { dataset: { star: e.star, id: e.id } });
    node.style.transform = `translate(${e.col * 100}%, ${e.row * 100}%)`;
    const art = def ? championSVG(def, { size: 60 }) :
      `<svg class="champ" viewBox="0 0 100 120"><ellipse cx="50" cy="115" rx="22" ry="5" fill="#0006"/><circle cx="50" cy="60" r="26" fill="#6a7a8a"/><circle cx="42" cy="54" r="4" fill="#1a1a1a"/><circle cx="58" cy="54" r="4" fill="#1a1a1a"/></svg>`;
    node.append(
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
    this.unitsLayer.append(node);
    this.nodes.set(e.id, { el: node, maxHp: e.maxHp, hp: e.hp });
  }

  _setHP(id, hp) {
    const n = this.nodes.get(id); if (!n) return;
    n.hp = hp;
    const f = Math.max(0, hp / n.maxHp);
    n.el.querySelector('.bar.hp .fill').style.transform = `scaleX(${f})`;
    // trail lags behind (set after a beat)
    const trail = n.el.querySelector('.bar.hp .trail');
    setTimeout(() => { trail.style.transform = `scaleX(${f})`; }, 90);
  }

  _floatNum(id, text, color) {
    const n = this.nodes.get(id); if (!n) return;
    const m = n.el.style.transform.match(/translate\(([\d.]+)%,\s*([\d.]+)%\)/);
    if (!m) return;
    const num = el('.dmg-num', { style: { color } }, text);
    // place at the unit's tile (percentages of board); convert tile->% of board (tile=12.5%)
    num.style.left = `${(+m[1]) * 0.125 + 6}%`;
    num.style.top = `${(+m[2]) * 0.125 + 4}%`;
    this.fxLayer.append(num);
    num.animate(
      [{ transform: 'translateY(0) scale(1)', opacity: 1 }, { transform: 'translateY(-26px) scale(1.05)', opacity: 0 }],
      { duration: 650 / this.speed, easing: 'cubic-bezier(0,0,.3,1)' }
    ).finished.then(() => num.remove()).catch(() => {});
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
      case 'move': if (n) n.el.style.transform = `translate(${e.col * 100}%, ${e.row * 100}%)`; break;
      case 'blink': if (n) { n.el.style.transition = 'none'; n.el.style.transform = `translate(${e.col * 100}%, ${e.row * 100}%)`; requestAnimationFrame(() => (n.el.style.transition = '')); } break;
      case 'attack': {
        const a = this.nodes.get(e.id); if (!a) break;
        const body = a.el.querySelector('.champ-body');
        body.classList.remove('attacking'); void body.offsetWidth; body.classList.add('attacking');
        break;
      }
      case 'projectile': this._projectile(e.from, e.to, e.kind); break;
      case 'damage': {
        if (n) { n.el.classList.add('flash', 'hit'); setTimeout(() => n.el.classList.remove('flash', 'hit'), 150); }
        this._setHP(e.id, e.hp);
        if (e.amount > 0) this._floatNum(e.id, e.amount, DT_COLORS[e.type] || 'var(--dt-physical)');
        break;
      }
      case 'heal': this._setHP(e.id, e.hp); this._floatNum(e.id, '+' + e.amount, DT_COLORS.heal); break;
      case 'shield': if (n) this._floatNum(e.id, '⛨' + e.amount, 'var(--shield)'); break;
      case 'revive': this._setHP(e.id, e.hp); if (n) n.el.classList.add('flash'); break;
      case 'dodge': this._floatNum(e.id, 'dodge', 'var(--ink-dim)'); break;
      case 'cast': if (n) { this._floatNum(e.id, e.name, 'var(--gold)'); } break;
      case 'faint': if (n) { n.el.classList.add('faint'); setTimeout(() => { n.el.remove(); this.nodes.delete(e.id); }, 360); } break;
      case 'end': break;
    }
  }

  // Play the timeline. Returns a promise resolving with the winner.
  play(events, { speed = 1, onEvent } = {}) {
    this.clear();
    this.speed = speed;
    return new Promise((resolve) => {
      let i = 0;
      const start = performance.now();
      const endEvent = events[events.length - 1];
      const tick = (nowReal) => {
        const clock = (nowReal - start) * this.speed;  // ms of combat time elapsed
        while (i < events.length && events[i].t <= clock) {
          this._apply(events[i]);
          if (onEvent) onEvent(events[i]);
          i++;
        }
        if (i >= events.length) { resolve(endEvent && endEvent.winner); return; }
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    });
  }

  setSpeed(s) { this.speed = s; }
  skip() { /* fast path: jump remaining; handled by caller re-play at high speed or instant */ }
  stop() { cancelAnimationFrame(this.raf); }
}
