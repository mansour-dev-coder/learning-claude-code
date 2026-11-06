// npm run balance — how much of the peacetime surplus is real vs. a passive player?
// Runs 1451–1454 (36 months, no wars declared by us) under three dilemma policies and reports cash flow.
import { createGame, resolveTurn, computeBudget, EVENT_BY_ID, type Action, type GameState } from '../src/engine';
import { Rng } from '../src/engine/rng';

type Policy = 'frugal' | 'random' | 'generous';
const SPEND_WORDS = /build|endow|lavish|grand|large|relief|refit|hire|patronise|buy|fill|bedesten|customary|physician|reinforce|gifts|generous/i;

function choose(s: GameState, policy: Policy, rng: Rng): Action[] {
  return s.pendingDilemmas.map((d) => {
    const opts = d.options.filter((o) => o.available);
    const spendOpts = opts.filter((o) => SPEND_WORDS.test(o.label));
    const cheap = opts.filter((o) => !SPEND_WORDS.test(o.label));
    let pick = rng.pick(opts);
    if (policy === 'frugal' && cheap.length) pick = rng.pick(cheap);
    if (policy === 'generous' && spendOpts.length) pick = spendOpts[0];
    return { type: 'resolveDilemma', dilemmaId: d.id, optionId: pick.id } as Action;
  });
}

for (const policy of ['frugal', 'random', 'generous'] as Policy[]) {
  const nets: number[] = [];
  const ends: number[] = [];
  let discretionary = 0;
  for (let seed = 1; seed <= 20; seed++) {
    let s = createGame({ scenario: 'mehmed1451', seed });
    const rng = new Rng(seed * 7);
    let net = 0;
    const t0 = s.treasury;
    for (let m = 0; m < 36 && s.status === 'active'; m++) {
      for (const d of s.pendingDilemmas) if (['imperialKulliye', 'fleetProgramme', 'embassyGifts', 'royalFestival'].includes(d.eventId)) discretionary++;
      s = resolveTurn(s, choose(s, policy, rng)).state;
      net += s.lastReport!.budget.net;
    }
    nets.push(net / 36);
    ends.push(s.treasury - t0);
  }
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  console.log(`${policy.padEnd(9)} mean budget net ${(avg(nets) / 1e3).toFixed(0)}k/month | treasury change over 3 yrs ${(avg(ends) / 1e6).toFixed(1)}M (min ${(Math.min(...ends) / 1e6).toFixed(1)}M, max ${(Math.max(...ends) / 1e6).toFixed(1)}M) | spending prompts ${(discretionary / 20).toFixed(1)} per run`);
}
void EVENT_BY_ID; void computeBudget;
