// Visual juice: trauma-based screen shake + confetti. Render-only, never touches the sim.
// Shake uses the trauma model (shake = trauma^2, coherent-ish noise), applied as a
// transform on a wrapper so it composites cheaply. Confetti adapted from gamedev-kb.

// Cheap, GPU-friendly screen shake. Translate-only (no rotate -> no re-clip/repaint of the
// rounded, shadowed board), promotes its own layer with translate3d + will-change, decays
// fast, and is fully skippable (reduced-motion or the user's toggle).
export function shakeEnabled() {
  try { if (localStorage.getItem('warbound_shake') === '0') return false; } catch {}
  try { if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false; } catch {}
  return true;
}
export class Shake {
  constructor(targetEl) {
    this.el = targetEl;
    this.trauma = 0; this.t = 0; this.raf = 0; this.running = false;
    this.disabled = !shakeEnabled();
  }
  add(amount) {
    if (this.disabled || !this.el) return;
    this.trauma = Math.min(1, this.trauma + amount);
    if (!this.running) { this.running = true; this.el.style.willChange = 'transform'; this.raf = requestAnimationFrame(() => this._tick()); }
  }
  _tick() {
    this.t += 0.05;
    const s = this.trauma * this.trauma;
    if (s < 0.0016) {
      this.el.style.transform = ''; this.el.style.willChange = 'auto';
      this.running = false; return;
    }
    const nx = Math.sin(this.t * 31.1) * Math.cos(this.t * 12.7);
    const ny = Math.sin(this.t * 27.3 + 1.1) * Math.cos(this.t * 16.9);
    const px = nx * 7 * s, py = ny * 7 * s;       // translate only, modest amplitude
    this.el.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0)`;
    this.trauma = Math.max(0, this.trauma - 0.04); // fast decay (~0.4s) so it's a punch, not a rumble
    this.raf = requestAnimationFrame(() => this._tick());
  }
  stop() { cancelAnimationFrame(this.raf); this.running = false; this.trauma = 0; if (this.el) { this.el.style.transform = ''; this.el.style.willChange = 'auto'; } }
}

export function launchConfetti(duration = 2400) {
  let canvas = document.getElementById('confetti-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'confetti-canvas';
    Object.assign(canvas.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2000' });
    document.body.appendChild(canvas);
  }
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth; canvas.height = window.innerHeight; canvas.style.display = 'block';
  const colors = ['#ffce5c', '#6fb1ff', '#54e6c0', '#ff7eb6', '#c79bff', '#9be86a'];
  const shapes = ['rect', 'circle', 'ribbon'];
  const ps = [];
  const start = Date.now();
  for (let i = 0; i < 110; i++) ps.push({
    x: canvas.width * 0.25 + Math.random() * canvas.width * 0.5, y: -20 - Math.random() * canvas.height * 0.3,
    vx: (Math.random() - 0.5) * 5, vy: Math.random() * 3 + 1.5, w: Math.random() * 10 + 5, h: Math.random() * 6 + 3,
    color: colors[Math.floor(Math.random() * colors.length)], rot: Math.random() * 360, rotV: (Math.random() - 0.5) * 10,
    wobble: Math.random() * Math.PI * 2, shape: shapes[Math.floor(Math.random() * shapes.length)],
  });
  (function animate() {
    const elapsed = Date.now() - start;
    const fade = elapsed > duration - 500 ? Math.max(0, (duration - elapsed) / 500) : 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.globalAlpha = fade;
    ps.forEach((p) => {
      p.x += p.vx + Math.sin(p.wobble) * 0.7; p.y += p.vy; p.rot += p.rotV; p.wobble += 0.06; p.vy += 0.025;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate((p.rot * Math.PI) / 180); ctx.fillStyle = p.color;
      if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, p.w / 2.5, 0, Math.PI * 2); ctx.fill(); }
      else if (p.shape === 'ribbon') ctx.fillRect(-p.w / 2, -1, p.w, 3);
      else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (elapsed < duration) requestAnimationFrame(animate);
    else { ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.style.display = 'none'; }
  })();
}
