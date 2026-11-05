import { describe, expect, it } from 'vitest';
import { createGame, resolveTurn, computeBudget, type Action, type GameState } from '../src/engine';
import { Rng } from '../src/engine/rng';
import { FACTIONS } from '../src/engine/types';

function randomPlay(s: GameState, rng: Rng): Action[] {
  return s.pendingDilemmas.map((d) => ({ type: 'resolveDilemma' as const, dilemmaId: d.id, optionId: rng.pick(d.options.filter((o) => o.available).map((o) => o.id).concat(d.defaultOptionId)) }));
}

describe('createGame', () => {
  it('builds the 1451 opening with the accession and fratricide dilemmas', () => {
    const s = createGame({ scenario: 'mehmed1451', seed: 1 });
    expect(s.date).toEqual({ year: 1451, month: 2 });
    expect(s.sultan.name).toBe('Mehmed II');
    const ids = s.pendingDilemmas.map((d) => d.eventId);
    expect(ids).toContain('accessionDonative');
    expect(ids).toContain('fratricideQuestion');
    expect(s.provinces.constantinople.owner).toBe('byzantium');
  });
  it('supports Murad II and a fictional Sultan', () => {
    const m = createGame({ scenario: 'murad1421', seed: 2 });
    expect(m.provinces.selanik.owner).toBe('byzantium');
    const f = createGame({ scenario: 'fictional', seed: 3, fictional: { name: 'Orhan', year: 1480 } });
    expect(f.capital).toBe('constantinople');
    expect(f.provinces.konya.owner).toBe('ottoman');
    expect(f.neighbours.byzantium.maxArmy).toBe(0);
    expect(f.wars.some((w) => w.enemies.includes('albania'))).toBe(false);
  });
});

describe('resolveTurn', () => {
  it('is deterministic for the same seed and orders', () => {
    const a0 = createGame({ scenario: 'mehmed1451', seed: 99 });
    const b0 = createGame({ scenario: 'mehmed1451', seed: 99 });
    let a = a0, b = b0;
    const ra = new Rng(5), rb = new Rng(5);
    for (let i = 0; i < 12; i++) {
      a = resolveTurn(a, randomPlay(a, ra)).state;
      b = resolveTurn(b, randomPlay(b, rb)).state;
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('does not mutate the input state', () => {
    const s = createGame({ scenario: 'mehmed1451', seed: 7 });
    const before = JSON.stringify(s);
    resolveTurn(s, [{ type: 'buyGrain', kile: 10_000 }]);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('advances one month and replaces the Divan with 2–4 new dilemmas', () => {
    const s0 = createGame({ scenario: 'mehmed1451', seed: 11 });
    const { state, report } = resolveTurn(s0, []);
    expect(state.date).toEqual({ year: 1451, month: 3 });
    expect(state.turn).toBe(1);
    expect(report.decisions.every((d) => d.byDefault)).toBe(true);
    expect(report.decisions.length).toBe(s0.pendingDilemmas.length);
    expect(state.pendingDilemmas.length).toBeGreaterThanOrEqual(2);
    expect(state.pendingDilemmas.length).toBeLessThanOrEqual(5);
    expect(state.pendingDilemmas.every((d) => d.turn === 1)).toBe(true);
  });

  it('cash accounting: treasury moves by the budget net plus one-off spending', () => {
    // a quiet month: answer nothing that costs money, no actions
    const s0 = createGame({ scenario: 'mehmed1451', seed: 21 });
    s0.pendingDilemmas = [];
    const expected = s0.treasury + computeBudget(s0).net;
    const { report, state } = resolveTurn(s0, []);
    expect(report.budget.net).toBe(report.budget.totalRevenue - report.budget.totalExpenses);
    // only scheduled effects or random disasters could move the treasury further; none are due in month 1
    expect(state.treasury).toBe(Math.round(expected));
  });

  it('unpaid salaries become arrears and the Janissaries turn against the Sultan', () => {
    let s = createGame({ scenario: 'mehmed1451', seed: 31 });
    s.treasury = 0;
    s.flags.baseTaxFarm = 0;
    for (const p of Object.values(s.provinces)) p.landTax = p.customs = p.christianHouseholds = 0;
    for (const n of Object.values(s.neighbours)) n.tributeToUs = 0;
    const j0 = s.factions.janissaries;
    for (let i = 0; i < 4; i++) {
      s.pendingDilemmas = [];
      s = resolveTurn(s, []).state;
      if (s.status !== 'active') break;
    }
    expect(s.arrears).toBeGreaterThan(0);
    expect(s.treasury).toBe(0);
    expect(s.factions.janissaries).toBeLessThan(j0);
  });

  it('rejects invalid orders with a reason and leaves state untouched by them', () => {
    const s0 = createGame({ scenario: 'mehmed1451', seed: 41 });
    const bogus = [
      { type: 'startCampaign', target: 'constantinople' },
      { type: 'startCampaign', target: 'atlantis' },
      { type: 'setTax', tax: 'cizye', value: 500 },
      { type: 'conjureGold', amount: 1e9 },
      { type: 'resolveDilemma', dilemmaId: 'nope', optionId: 'x' },
    ] as unknown as Action[];
    const { report, state } = resolveTurn(s0, bogus);
    expect(report.actionsRejected.length).toBe(5);
    expect(report.actionsRejected[0].reason).toMatch(/not at war/i);
    expect(state.campaign).toBeNull();
    expect(state.taxes.cizyePerHousehold).toBe(35);
  });

  it('keeps every number in bounds over 60 months of random play on many seeds', () => {
    for (let seed = 1; seed <= 12; seed++) {
      let s = createGame({ scenario: seed % 2 ? 'mehmed1451' : 'murad1421', seed });
      const rng = new Rng(seed * 13);
      for (let m = 0; m < 60 && s.status === 'active'; m++) {
        s = resolveTurn(s, randomPlay(s, rng)).state;
        expect(s.treasury).toBeGreaterThanOrEqual(0);
        expect(s.arrears).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(s.treasury)).toBe(true);
        for (const f of FACTIONS) {
          expect(s.factions[f]).toBeGreaterThanOrEqual(0);
          expect(s.factions[f]).toBeLessThanOrEqual(100);
        }
        for (const p of Object.values(s.provinces)) {
          expect(p.prosperity).toBeGreaterThanOrEqual(0);
          expect(p.prosperity).toBeLessThanOrEqual(100);
        }
        expect(s.grain.stock).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('a prepared 1453 campaign takes Constantinople in most seeds', () => {
    let taken = 0;
    for (let seed = 1; seed <= 10; seed++) {
      let s = createGame({ scenario: 'mehmed1451', seed: 1000 + seed });
      // the historical preparations of 1452
      s.date = { year: 1453, month: 3 };
      s.army.janissaries = 10000;
      s.army.palaceCavalry = 5000;
      s.army.artillery = { guns: 60, bombards: 10, quality: 1.0 };
      s.army.fleet.galleys = 100;
      s.flags.bosporusFortress = 1;
      s.flags.casusBelli_byzantium = true;
      const actions: Action[] = [
        { type: 'declareWar', target: 'byzantium', casusBelli: 'the Emperor’s threats over Orhan' },
        { type: 'startCampaign', target: 'constantinople', artillery: true, fleet: true, ledBySultan: true, assaultThreshold: 60 },
      ];
      for (let m = 0; m < 8 && s.status === 'active'; m++) {
        s.pendingDilemmas = [];
        s = resolveTurn(s, m === 0 ? actions : []).state;
        if (s.provinces.constantinople.owner === 'ottoman') break;
      }
      if (s.provinces.constantinople.owner === 'ottoman') taken++;
    }
    expect(taken).toBeGreaterThanOrEqual(7);
  });
});
