import { describe, expect, it } from 'vitest';
import { Rng, seedFrom } from '../src/engine/rng';

describe('Rng', () => {
  it('is reproducible from a seed and serialisable via its state', () => {
    const a = new Rng(42);
    const seq = Array.from({ length: 5 }, () => a.next());
    const b = new Rng(42);
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(seq);
    const c = new Rng(a.state);
    const d = new Rng(a.state);
    expect(c.next()).toBe(d.next());
  });
  it('stays in range and is roughly uniform', () => {
    const r = new Rng(seedFrom('sultan'));
    let sum = 0;
    for (let i = 0; i < 10000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      sum += x;
    }
    expect(sum / 10000).toBeCloseTo(0.5, 1);
    for (let i = 0; i < 200; i++) {
      const n = r.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });
});
