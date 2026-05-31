// Procedural Web Audio — no asset files. Pleasant, pentatonic, soft envelopes, low-passed
// so nothing is harsh (per the Brain Games audio rule). Audio doubles as an information
// channel: distinct timbres per combat event. Bus: sfx/music -> compressor -> master.
let ctx = null, master = null, sfxBus = null, musicBus = null, comp = null;
let enabled = true, started = false;

const PENT = [0, 3, 5, 7, 10];                 // minor pentatonic semitone offsets
const noteHz = (semi) => 220 * Math.pow(2, semi / 12);

function init() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    comp = ctx.createDynamicsCompressor();
    master = ctx.createGain(); master.gain.value = 0.8;
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9;
    musicBus = ctx.createGain(); musicBus.gain.value = 0.35;
    sfxBus.connect(comp); musicBus.connect(comp); comp.connect(master); master.connect(ctx.destination);
  } catch { ctx = null; }
}

export function resume() { // call on first user gesture
  init();
  if (ctx && ctx.state === 'suspended') ctx.resume();
  started = true;
}
export function setEnabled(on) { enabled = on; try { localStorage.setItem('warbound_sound', on ? '1' : '0'); } catch {} }
export function isEnabled() { try { return localStorage.getItem('warbound_sound') !== '0'; } catch { return true; } }
enabled = isEnabled();

const J = (amt) => 1 + (Math.random() * 2 - 1) * amt;   // pitch/vol jitter (decorative only)

// Core tone with ADSR-ish envelope, low-passed.
function tone(freq, { type = 'triangle', dur = 0.2, attack = 0.006, gain = 0.25, cutoff = 4000, detune = 0, to = sfxBus } = {}) {
  if (!ctx || !enabled) return;
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
  const g = ctx.createGain(); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f); f.connect(g); g.connect(to);
  o.start(t); o.stop(t + dur + 0.02);
}
// Filtered noise burst (impact transient).
function noise(dur = 0.08, { cutoff = 3000, bp = true, gain = 0.25, to = sfxBus } = {}) {
  if (!ctx || !enabled) return;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = bp ? 'bandpass' : 'lowpass'; f.frequency.value = cutoff; f.Q.value = 1.2;
  const g = ctx.createGain(); g.gain.value = gain;
  src.connect(f); f.connect(g); g.connect(to);
  src.start();
}

// ---- event cues ----
export const Sfx = {
  sword() { noise(0.06, { cutoff: 2600 * J(0.1), gain: 0.22 }); tone(noteHz(PENT[2]) * J(0.04), { type: 'square', dur: 0.09, gain: 0.12, cutoff: 2200 }); },
  arrow() { noise(0.05, { cutoff: 4200 * J(0.1), gain: 0.15 }); tone(900 * J(0.08), { type: 'sine', dur: 0.07, gain: 0.07, cutoff: 3000 }); },
  magic(i = 0) { const f = noteHz(PENT[i % 5] + 12); tone(f * J(0.03), { type: 'sine', dur: 0.32, attack: 0.04, gain: 0.16, cutoff: 3500 }); tone(f * 1.5, { type: 'triangle', dur: 0.3, gain: 0.06, cutoff: 3000, detune: 6 }); },
  hurt() { noise(0.05, { cutoff: 1400, gain: 0.1, bp: false }); },
  heal() { const f = noteHz(PENT[0] + 12); tone(f, { type: 'sine', dur: 0.4, attack: 0.05, gain: 0.12 }); tone(f * 1.5, { type: 'sine', dur: 0.45, attack: 0.06, gain: 0.08 }); },
  death() { tone(noteHz(PENT[1]) * 1.2, { type: 'triangle', dur: 0.35, gain: 0.16, cutoff: 1800 }); setTimeout(() => tone(noteHz(PENT[1]) * 0.6, { type: 'sine', dur: 0.3, gain: 0.12, cutoff: 1200 }), 60); noise(0.18, { cutoff: 800, gain: 0.1, bp: false }); },
  buy() { tone(noteHz(PENT[2]), { type: 'triangle', dur: 0.1, gain: 0.16 }); setTimeout(() => tone(noteHz(PENT[2] + 7), { type: 'triangle', dur: 0.14, gain: 0.16 }), 70); },
  sell() { tone(noteHz(PENT[3]), { type: 'sine', dur: 0.1, gain: 0.12 }); setTimeout(() => tone(noteHz(PENT[1]), { type: 'sine', dur: 0.14, gain: 0.12 }), 70); },
  click() { tone(noteHz(PENT[2] + 12), { type: 'sine', dur: 0.05, gain: 0.08, cutoff: 3000 }); },
  fuse() { [0, 2, 4].forEach((i, k) => setTimeout(() => tone(noteHz(PENT[i] + 12), { type: 'triangle', dur: 0.18, gain: 0.16 }), k * 80)); },
  victory() { duck(); [0, 2, 4, 7].forEach((s, k) => setTimeout(() => tone(noteHz(s + 12), { type: 'triangle', dur: 0.4, gain: 0.2, cutoff: 5000 }), k * 130)); },
  defeat() { duck(); [4, 2, 0].forEach((s, k) => setTimeout(() => tone(noteHz(s) * 0.75, { type: 'sine', dur: 0.5, gain: 0.18, cutoff: 1600 }), k * 200)); },
  // Rarity reward fanfare — grander as tier rises (0=common … 4=mythic). Pentatonic & soft, never harsh.
  reward(tier = 0) {
    const t = Math.max(0, Math.min(4, tier));
    const run = [0, 3, 5, 7, 10, 12];                       // rising minor-pentatonic run
    const len = [1, 2, 4, 5, 6][t];
    const g = 0.14 + t * 0.018;
    if (t >= 2) duck();
    for (let k = 0; k < len; k++) {
      const semi = run[k] + 12;
      setTimeout(() => {
        tone(noteHz(semi) * J(0.02), { type: 'triangle', dur: 0.34, gain: g, cutoff: 5200 });
        if (t >= 3) tone(noteHz(semi + 12), { type: 'sine', dur: 0.3, gain: 0.05, cutoff: 6500 });   // shimmer octave
      }, k * 105);
    }
    if (t >= 4) [0, 1, 2, 3].forEach((i) => setTimeout(() => tone(noteHz(PENT[i % 5] + 24) * J(0.05), { type: 'sine', dur: 0.18, gain: 0.06, cutoff: 7000 }), len * 105 + i * 70));   // sparkle tail
  },
};

function duck() { // briefly dip music when a big cue fires
  if (!ctx || !musicBus) return;
  const t = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setTargetAtTime(0.1, t, 0.05);
  musicBus.gain.setTargetAtTime(0.35, t + 0.5, 0.3);
}
