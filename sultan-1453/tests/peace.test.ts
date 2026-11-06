import { describe, expect, it } from 'vitest';
import { createGame, resolveTurn, type Action, type GameState } from '../src/engine';
import { peaceAcceptance, peaceGate, devastate } from '../src/engine/war';

function albaniaWar(seed: number): GameState {
  const s = createGame({ scenario: 'mehmed1451', seed });
  s.pendingDilemmas = [];
  const war = s.wars.find((w) => w.enemies.includes('albania'))!;
  war.score = 60; // e.g. two crushing field victories and a raid
  return s;
}

describe('resilient minor powers', () => {
  it('Skanderbeg does not cede Krujë or accept vassalage after field defeats alone', () => {
    const s = albaniaWar(1);
    const war = s.wars.find((w) => w.enemies.includes('albania'))!;
    expect(peaceGate(s, war, 'albania').open).toBe(false);
    expect(peaceAcceptance(s, war, 'albania', 'cession')).toBe(0);
    expect(peaceAcceptance(s, war, 'albania', 'vassalage')).toBe(0);
    for (let seed = 1; seed <= 30; seed++) {
      const r = resolveTurn(albaniaWar(seed), [{ type: 'offerPeace', target: 'albania', terms: 'cession', province: 'kruje' } as Action]);
      expect(r.state.provinces.kruje.owner).toBe('albania');
      expect(r.state.wars.some((w) => w.enemies.includes('albania'))).toBe(true);
    }
  });

  it('a breached capital opens the gate', () => {
    const s = albaniaWar(2);
    const war = s.wars.find((w) => w.enemies.includes('albania'))!;
    war.capitalBreached.push('albania');
    expect(peaceGate(s, war, 'albania').open).toBe(true);
    expect(peaceAcceptance(s, war, 'albania', 'cession')).toBeGreaterThan(0.3);
  });

  it('sustained devastation opens the gate only after enough seasons (3 for resilience ≥ 8)', () => {
    const s = albaniaWar(3);
    const war = s.wars.find((w) => w.enemies.includes('albania'))!;
    devastate(s, war, 'albania', 5);
    s.date.year += 1;
    devastate(s, war, 'albania', 5);
    expect(peaceGate(s, war, 'albania').open).toBe(false);
    s.date.year += 1;
    devastate(s, war, 'albania', 5);
    expect(peaceGate(s, war, 'albania').open).toBe(true);
  });

  it('coalition collapse opens the gate; less resilient powers are not gated', () => {
    const s = albaniaWar(4);
    const war = s.wars.find((w) => w.enemies.includes('albania'))!;
    war.peakEnemies = 2; // e.g. Venice fought alongside and has made peace
    expect(peaceGate(s, war, 'albania').open).toBe(true);
    // Serbia (resilience 3) can be pushed into cession by battlefield results alone
    s.wars.push({ id: 'w-serbia', enemies: ['serbia'], casusBelli: 'test', startedTurn: 0, score: 60, declaredByUs: true, peakEnemies: 1, devastation: {}, capitalBreached: [] });
    expect(peaceGate(s, s.wars[s.wars.length - 1], 'serbia').open).toBe(true);
    expect(peaceAcceptance(s, s.wars[s.wars.length - 1], 'serbia', 'cession')).toBeGreaterThan(0.3);
  });
});
