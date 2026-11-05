import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import { assaultChance, bombardment, siegeMonth, type Besieger } from '../src/engine/war';
import type { Siege, Weather } from '../src/engine/types';

const baseSiege = (defenders: number, supply: number): Siege => ({ id: 's', province: 'x', attacker: 'ottoman', defender: 'byzantium', breach: 0, defenders, defenderSupply: supply, defenderMorale: 70, months: 0, assaultsFailed: 0, attackers: 0, attackerGuns: 0 });

/** Run a siege until it ends or `maxMonths` pass. Returns months taken, or null if it held. */
function runSiege(seed: number, b: Besieger, walls: number, coastal: boolean, defenders: number, supply: number, maxMonths: number, threshold = 60) {
  const rng = new Rng(seed);
  let s = baseSiege(defenders, supply);
  let men = b.men;
  const weather: Weather[] = ['fair', 'rain', 'fair', 'fair', 'fair', 'rain', 'fair', 'fair', 'harshWinter', 'mild', 'mild', 'rain'];
  for (let m = 0; m < maxMonths; m++) {
    const r = siegeMonth(s, { ...b, men }, walls, coastal, weather[m % 12], rng, { assaultThreshold: threshold });
    s = r.siege;
    men = Math.round(men * (1 - r.attackerLossShare));
    if (r.outcome === 'stormed' || r.outcome === 'surrender') return m + 1;
  }
  return null;
}

// 1453: ~60,000 effective besiegers, ~60 guns incl. ~10 great bombards (Orban), fleet + Rumeli Hisarı close the sea,
// ~7,000 defenders behind the Theodosian walls. Historically: 6 April – 29 May, 53 days.
const MEHMED_1453: Besieger = { men: 60000, guns: 60, bombards: 10, artilleryQuality: 1.0, leadership: 8, morale: 70, seaBlockade: true };

describe('siege resolver', () => {
  it('Constantinople 1453: with great bombards and a blockade the city usually falls in 2–4 months', () => {
    const results = Array.from({ length: 300 }, (_, i) => runSiege(1000 + i, MEHMED_1453, 95, true, 7000, 5, 8));
    const fell = results.filter((x) => x !== null) as number[];
    const within4 = fell.filter((m) => m <= 4).length / results.length;
    const median = [...fell].sort((a, b) => a - b)[Math.floor(fell.length / 2)];
    expect(within4).toBeGreaterThan(0.7);
    expect(median).toBeGreaterThanOrEqual(2);
    expect(median).toBeLessThanOrEqual(4);
    // it should not be a walkover in the first month
    expect(fell.filter((m) => m === 1).length / results.length).toBeLessThan(0.1);
  });

  it('Constantinople without artillery or a blockade holds for at least 6 months (cf. 1394–1402, 1422)', () => {
    const noGuns = { ...MEHMED_1453, guns: 0, bombards: 0, seaBlockade: false };
    const results = Array.from({ length: 300 }, (_, i) => runSiege(5000 + i, noGuns, 95, true, 7000, 5, 6));
    const fell = results.filter((x) => x !== null).length / results.length;
    expect(fell).toBeLessThan(0.05);
  });

  it('a land fortress without a breach falls only once its stores run out', () => {
    const weak = { men: 20000, guns: 0, bombards: 0, artilleryQuality: 0.7, leadership: 5, morale: 60, seaBlockade: false };
    const results = Array.from({ length: 200 }, (_, i) => runSiege(9000 + i, weak, 80, false, 3000, 4, 12));
    const fell = results.filter((x) => x !== null) as number[];
    // nobody falls before the stores are gone
    expect(Math.min(...fell)).toBeGreaterThanOrEqual(4);
    expect(fell.length / results.length).toBeGreaterThan(0.8);
  });

  it('bombardment scales with guns and is blunted by walls and weather', () => {
    const avg = (b: Besieger, walls: number, w: Weather) => {
      const rng = new Rng(7);
      let t = 0;
      for (let i = 0; i < 500; i++) t += bombardment(b, walls, w, rng);
      return t / 500;
    };
    expect(avg(MEHMED_1453, 95, 'fair')).toBeGreaterThan(avg({ ...MEHMED_1453, bombards: 0 }, 95, 'fair'));
    expect(avg(MEHMED_1453, 50, 'fair')).toBeGreaterThan(avg(MEHMED_1453, 95, 'fair'));
    expect(avg(MEHMED_1453, 95, 'fair')).toBeGreaterThan(avg(MEHMED_1453, 95, 'harshWinter'));
  });

  it('assault chance rises with breach and numbers and falls with stronger walls', () => {
    const p = (breach: number, att: number, walls: number) => assaultChance(breach, att, 7000, 8, 70, 70, walls);
    expect(p(80, 60000, 95)).toBeGreaterThan(p(40, 60000, 95));
    expect(p(60, 60000, 95)).toBeGreaterThan(p(60, 20000, 95));
    expect(p(60, 60000, 50)).toBeGreaterThan(p(60, 60000, 95));
    // storming an unbreached Theodosian wall is near-hopeless
    expect(p(10, 60000, 95)).toBeLessThan(0.05);
  });
});
