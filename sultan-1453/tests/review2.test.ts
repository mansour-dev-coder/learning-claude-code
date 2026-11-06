import { describe, expect, it } from 'vitest';
import { createGame } from '../src/engine';
import { equilibrium } from '../src/engine/loyalty';
import { FACTIONS } from '../src/engine/types';
import { dynastyMonth } from '../src/engine/dynasty';
import { fightCampaignBattle, startCampaign } from '../src/engine/war';
import { Rng } from '../src/engine/rng';
import type { TurnCtx } from '../src/engine/state';

describe('treasury size and faction pressure', () => {
  it('a full treasury does not move any faction equilibrium', () => {
    const s = createGame({ scenario: 'mehmed1451', seed: 1 });
    const before = FACTIONS.map((f) => equilibrium(s, f));
    s.treasury = 400_000_000;
    expect(FACTIONS.map((f) => equilibrium(s, f))).toEqual(before);
  });

  it('a full treasury makes adult rival princes more ambitious', () => {
    const run = (treasury: number) => {
      const s = createGame({ scenario: 'murad1421', seed: 2 });
      s.treasury = treasury;
      s.dynasty.princes.find((p) => p.id === 'kucukMustafa')!.birthYear = 1400; // an adult rival
      const ctx: TurnCtx = { s, rng: new Rng(9), facts: [] };
      for (let i = 0; i < 12; i++) {
        s.sultan.health = 100;
        dynastyMonth(ctx);
        s.status = 'active';
      }
      return s.dynasty.princes.find((p) => p.id === 'kucukMustafa')!.ambition;
    };
    expect(run(400_000_000)).toBeGreaterThan(run(1_000_000) + 5);
  });

  it('a field victory makes the corps expect a donative at the next Divan', () => {
    const s = createGame({ scenario: 'mehmed1451', seed: 3 });
    const ctx: TurnCtx = { s, rng: new Rng(4), facts: [] };
    startCampaign(ctx, { target: 'kruje' });
    let won = false;
    for (let i = 0; i < 20 && !won; i++) won = fightCampaignBattle(ctx, 'albania', 500, 'Skirmish');
    expect(won).toBe(true);
    expect(s.scheduled.some((x) => x.ref === 'victoryDonative')).toBe(true);
  });
});
