// Seeded, serialisable RNG (mulberry32). The 32-bit state lives in GameState.rngState so a saved game
// replays identically. Never use Math.random() inside the engine.

export class Rng {
  state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  /** uniform [0,1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('pick from empty array');
    return arr[Math.floor(this.next() * arr.length)];
  }
  /** approx normal via sum of uniforms (Irwin–Hall), mean 0 sd 1 */
  normal(): number {
    let s = 0;
    for (let i = 0; i < 6; i++) s += this.next();
    return (s - 3) * Math.SQRT2;
  }
  /** multiplicative "dice" factor centred on 1, e.g. spread 0.25 → roughly 0.75–1.25 */
  dice(spread = 0.25): number {
    return Math.max(0.2, 1 + this.normal() * spread * 0.5);
  }
  weighted<T>(items: readonly { item: T; weight: number }[]): T | null {
    const total = items.reduce((a, b) => a + Math.max(0, b.weight), 0);
    if (total <= 0) return null;
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, it.weight);
      if (r < 0) return it.item;
    }
    return items[items.length - 1].item;
  }
}

export function seedFrom(text: string | number): number {
  const s = String(text);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
