import { describe, expect, it } from 'vitest';
import { createGame } from '../src/engine';
import { optionEffects, divanCounsel, answer, reaction } from '../src/court/counsel';

const s = createGame({ scenario: 'mehmed1451', seed: 3 });
const donative = s.pendingDilemmas.find((d) => /donative/i.test(d.title))!;

describe('counsel', () => {
  it('dry-runs options without touching the state', () => {
    const before = JSON.stringify(s);
    const eff = optionEffects(s, donative);
    expect(JSON.stringify(s)).toBe(before);
    const gen = eff.find((e) => e.optionId === 'generous')!;
    expect(gen.treasury).toBeLessThan(0);
    expect(gen.factions.janissaries).toBeGreaterThan(0);
    expect(eff.find((e) => e.optionId === 'refuse')!.factions.janissaries).toBeLessThan(0);
  });
  it('ministers argue from their offices', () => {
    const c = divanCounsel(s, donative);
    const agha = c.find((x) => x.role === 'janissaryAgha')!;
    expect(agha.recommends).toBe('generous');
    expect(agha.opposes).toBe('refuse');
    const defterdar = c.find((x) => x.role === 'defterdar')!;
    expect(defterdar.recommends).not.toBe('generous');
  });
  it('answers and reactions are deterministic text', () => {
    const eff = optionEffects(s, donative);
    const m = s.ministers.defterdar;
    expect(answer(s, m, donative, eff, 'cost')).toMatch(/akçe/);
    expect(answer(s, m, donative, eff, 'sound')).toBe(answer(s, m, donative, eff, 'sound'));
    expect(reaction(s, s.ministers.janissaryAgha, eff, 'generous')).toBeTruthy();
  });
});

import { audienceBrief, audienceInput } from '../src/llm/converse';
describe('audience briefing', () => {
  it('gives the courtier his agenda, the matter and the engine figures', () => {
    const m = s.ministers[donative.presenter as 'janissaryAgha'];
    const brief = audienceBrief(s, { name: m.name, title: 'x', kind: 'minister', dilemmas: [donative.id] });
    expect(brief).toContain(m.name);
    expect(brief).toMatch(/SECRET agenda/);
    expect(brief).toContain(donative.title);
    expect(brief).toMatch(/3\.75M akçe/);
    expect(audienceInput([{ who: 'sultan', text: 'Hello' }, { who: 'them', text: 'My Sultan' }], 'Is the corps loyal?')).toMatch(/THE SULTAN NOW SAYS/);
  });
});
