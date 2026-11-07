// A scripted, conquest-heavy reign 1451→1475 following Mehmed II's historical acquisitions and reforms.
// Used to test that the revenue curve can reach the mid-1470s anchor (~1.8M ducats).
import { createGame, resolveTurn, computeBudget, type Action, type GameState } from '../../src/engine';
import { Rng } from '../../src/engine/rng';
import { transferProvince } from '../../src/engine/war';
import type { TurnCtx } from '../../src/engine/state';
import { succeed } from '../../src/engine/dynasty';
import { grainConsumption } from '../../src/engine/economy';
import { CONQUESTS } from '../../src/campaign/timeline';


export function conquestReign(seed: number, opts: { cizyeRaise?: boolean } = {}) {
  let s: GameState = createGame({ scenario: 'mehmed1451', seed });
  let successions = 0;
  const start = computeBudget(s).totalRevenue;
  const rng = new Rng(seed);
  while (s.status === 'active' && (s.date.year < 1475 || (s.date.year === 1475 && s.date.month < 1))) {
    // Peace with everyone so the script isolates the revenue curve (wars are tested elsewhere).
    s = structuredClone(s);
    s.wars = [];
    s.sieges = [];
    for (const n of Object.values(s.neighbours)) if (n.relation === 'war') n.relation = n.tributeToUs > 0 ? 'tributary' : 'peace';
    for (const n of Object.values(s.neighbours)) n.aggression = 0;
    const ctx: TurnCtx = { s, rng, facts: [] };
    for (const [y, m, ids] of CONQUESTS) if (s.date.year === y && s.date.month === m) for (const id of ids) transferProvince(ctx, id, 'ottoman');
    const acts: Action[] = [];
    // a competent administrator: feeds the capital and keeps the corps paid and rewarded
    if (s.grain.stock < grainConsumption(s) * 2) acts.push({ type: 'buyGrain', kile: grainConsumption(s) * 2 });
    if (s.factions.janissaries < 45 && s.treasury > 5_000_000) acts.push({ type: 'grantDonative', akcePerMan: 300 });
    if (s.date.year === 1453 && s.date.month === 7) acts.push({ type: 'enactLaw', lawId: 'patriarchate' });
    if (s.date.year === 1455 && s.date.month === 1) acts.push({ type: 'enactLaw', lawId: 'tahrir' });
    if (s.date.year === 1460 && s.date.month === 1) acts.push({ type: 'enactLaw', lawId: 'iltizam' });
    if (opts.cizyeRaise && s.date.year === 1465 && s.date.month === 1) acts.push({ type: 'setTax', tax: 'cizye', value: 45 });
    // answer the Divan with whatever is available (cheapest-first keeps the treasury solvent)
    for (const d of s.pendingDilemmas) {
      const o = d.options.find((x) => x.available && x.id === d.defaultOptionId) ?? d.options.find((x) => x.available);
      if (o) acts.push({ type: 'resolveDilemma', dilemmaId: d.id, optionId: o.id });
    }
    s = resolveTurn(s, acts).state;
    if (s.status === 'dead' || s.status === 'deposed') {
      const c: TurnCtx = { s: structuredClone(s), rng: new Rng(s.rngState), facts: [] };
      if (!succeed(c)) break;
      s = c.s;
      successions++;
    }
    if (s.status !== 'active') break;
  }
  const end = computeBudget(s).totalRevenue;
  return { start, end, ratio: end / start, state: s, successions };
}
