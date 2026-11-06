import { describe, expect, it } from 'vitest';
import { conquestReign } from './helpers/conquest';

// Anchor: c. 1475 Iacopo de Promontorio put the Sultan's income near 1.8M ducats, roughly double the
// ~0.85M-ducat central revenue the engine starts with in 1451. See docs/economy.md for the gap analysis.
describe('revenue growth 1451 → 1475 under a conquest-heavy reign', () => {
  const runs = [1, 2, 3].map((seed) => conquestReign(seed));

  it('grows by at least half with the historical conquests and reforms', () => {
    for (const r of runs) {
      expect(r.state.date.year).toBe(1475);
      expect(r.ratio).toBeGreaterThan(1.5);
    }
  });

  // KNOWN GAP: the model reaches ~1.6×, not ~2×. Provinces conquered 1461–75 (Bosnia, Trebizond,
  // Kastamonu & Küre, Lesbos, Caffa) and the Moldavian/Ragusan tributes are not on the map yet.
  // `it.fails` passes while the gap exists and will start failing (prompting removal) once it is closed.
  it.fails('roughly doubles (≥ 1.8×), matching the mid-1470s anchor', () => {
    for (const r of runs) expect(r.ratio).toBeGreaterThanOrEqual(1.8);
  });
});
