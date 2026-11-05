import { describe, expect, it } from 'vitest';
import { createGame, EVENT_LIBRARY, resolveTurn, type Action } from '../src/engine';
import { Rng } from '../src/engine/rng';
import type { TurnCtx } from '../src/engine/state';

describe('event library', () => {
  it('has at least 40 dilemmas with unique ids and valid defaults', () => {
    expect(EVENT_LIBRARY.length).toBeGreaterThanOrEqual(40);
    const ids = new Set(EVENT_LIBRARY.map((e) => e.id));
    expect(ids.size).toBe(EVENT_LIBRARY.length);
    for (const e of EVENT_LIBRARY) {
      expect(e.options.length).toBeGreaterThanOrEqual(2);
      expect(e.options.map((o) => o.id)).toContain(e.defaultOption);
    }
  });

  it('every option of every eligible event applies cleanly across scenarios and mid-game states', () => {
    const states = [];
    for (const scenario of ['mehmed1451', 'murad1421', 'fictional'] as const) {
      for (const seed of [77, 78, 79]) {
        let s = createGame({ scenario, seed, fictional: { year: 1465 } });
        states.push(s);
        const rng = new Rng(seed);
        for (let m = 1; m <= 36 && s.status === 'active'; m++) {
          const acts: Action[] = s.pendingDilemmas.map((d) => ({ type: 'resolveDilemma', dilemmaId: d.id, optionId: rng.pick(d.options.filter((o) => o.available)).id }));
          if (m === 2 && s.wars.length) {
            const t = Object.values(s.provinces).find((p) => s.wars[0].enemies.includes(p.owner as never) && p.adjacent.some((a) => s.provinces[a]?.owner === 'ottoman'));
            if (t) acts.push({ type: 'startCampaign', target: t.id });
          }
          s = resolveTurn(s, acts).state;
          if (m % 6 === 0) states.push(s);
        }
      }
    }
    const exercised = new Set<string>();
    for (const base of states) {
      for (const e of EVENT_LIBRARY) {
        if (!e.forcedOnly && !e.condition(base)) continue;
        for (const o of e.options) {
          const s = structuredClone(base);
          const rng = new Rng(3);
          const c = e.prepare ? e.prepare(s, rng) : {};
          if (c === null) continue;
          const ctx: TurnCtx = { s, rng, facts: [] };
          expect(() => {
            e.brief(s, c);
            if (typeof o.summary === 'function') o.summary(s, c);
            if (!o.available || o.available(s, c)) o.apply(ctx, c);
          }, `${base.scenario}@${base.turn}/${e.id}/${o.id}`).not.toThrow();
          expect(Number.isFinite(s.treasury)).toBe(true);
          exercised.add(e.id);
        }
      }
    }
    const missing = EVENT_LIBRARY.filter((e) => !exercised.has(e.id)).map((e) => e.id);
    expect(missing.length, missing.join(', ')).toBeLessThanOrEqual(Math.floor(EVENT_LIBRARY.length * 0.2));
  });
});
