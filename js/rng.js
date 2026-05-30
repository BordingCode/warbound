// Seeded deterministic RNG (mulberry32). Same seed => same sequence.
// The whole game's fairness + replays + headless balancing depend on this being the
// ONLY source of randomness in sim/shop logic. Never call Math.random() in gameplay.
// Adapted from ~/cc/gamedev-kb/recipes/seeded-rng.js.

export class RNG {
  constructor(seed = 0x9e3779b9) {
    this.seed = seed >>> 0;
    this.state = this.seed;
  }
  next() { // float in [0,1)
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min, max) { return min + Math.floor(this.next() * (max - min + 1)); } // inclusive
  range(min, max) { return min + this.next() * (max - min); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  chance(p) { return this.next() < p; }
  save() { return { seed: this.seed, state: this.state }; }
  load(s) { this.seed = s.seed >>> 0; this.state = s.state >>> 0; return this; }
}

// Stable uint32 from a string seed (shareable run codes).
export function seedFromString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Combine two integers into a new stable seed (per-combat seeds = hash(runSeed, round)).
export function hashSeed(a, b) {
  let h = (a >>> 0) ^ Math.imul(b >>> 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
