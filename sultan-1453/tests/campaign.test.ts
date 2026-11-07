import { describe, expect, it } from 'vitest';
import { MISSIONS, MISSION_BY_ID } from '../src/campaign/missions';
import { advanceMission, isUnlocked, newProgress, recordResult, sandboxUnlocked, startMission } from '../src/campaign/runner';
import type { Action, GameState } from '../src/engine';
import type { MissionDef, MissionResult, MissionRun } from '../src/campaign/types';

/** Play a mission with a scripted policy until it ends. Unanswered dilemmas take their defaults. */
function play(def: MissionDef, seed: number, policy: (s: GameState, run: MissionRun) => Action[], unlocked: string[] = []): MissionResult {
  const progress = { ...newProgress(), unlocked: unlocked as never };
  let { state, run } = startMission(def, seed, progress);
  for (let i = 0; i < 40; i++) {
    const r = advanceMission(def, state, run, policy(state, run));
    state = r.state; run = r.run;
    if (r.result) return r.result;
  }
  throw new Error('mission did not end');
}

describe('campaign structure', () => {
  it('has nine missions; 1–3 playable, 4–9 stubs; each unlocks the next', () => {
    expect(MISSIONS.map((m) => m.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(MISSIONS.filter((m) => m.start).map((m) => m.id)).toEqual(['accession', 'rumeli-hisari', 'constantinople']);
    let p = newProgress();
    expect(isUnlocked(p, MISSIONS[0])).toBe(true);
    expect(isUnlocked(p, MISSIONS[1])).toBe(false);
    p = recordResult(p, { missionId: 'accession', won: true, stars: 2, months: 8, spent: 0, losses: 0, highlights: [], reason: '', treasuryStart: 0, treasuryEnd: 0, bonusMet: false, underPar: true, rewardText: '' });
    expect(isUnlocked(p, MISSIONS[1])).toBe(true);
    expect(p.unlocked).toContain('corpsLoyalty');
    expect(sandboxUnlocked(p)).toBe(false);
    // a worse replay never lowers the record
    p = recordResult(p, { missionId: 'accession', won: false, stars: 0, months: 14, spent: 0, losses: 0, highlights: [], reason: '', treasuryStart: 0, treasuryEnd: 0, bonusMet: false, underPar: false, rewardText: null });
    expect(p.results.accession).toMatchObject({ stars: 2, won: true });
    expect(isUnlocked(p, MISSIONS[3])).toBe(false); // stubs stay locked
  });

  it('starting states follow the historical timeline and rewards', () => {
    const p = newProgress();
    const m2 = startMission(MISSION_BY_ID['rumeli-hisari'], 1, p).state;
    expect(m2.date).toEqual({ year: 1452, month: 4 });
    expect(m2.flags.bosporusFortress).toBeFalsy();
    expect(m2.pendingDilemmas.map((d) => d.eventId)).toContain('bosporusFortress');
    expect(m2.dynasty.princes.find((x) => x.id === 'ahmed')?.alive).toBe(false);
    const m3 = startMission(MISSION_BY_ID.constantinople, 1, p).state;
    expect(m3.provinces.constantinople.owner).toBe('byzantium');
    expect(m3.army.artillery.bombards).toBe(0); // no reward yet
    expect(m3.flags.lockFleet).toBe(true);
    const m3b = startMission(MISSION_BY_ID.constantinople, 1, { ...p, unlocked: ['bombards', 'corpsLoyalty'] }).state;
    expect(m3b.army.artillery.bombards).toBeGreaterThanOrEqual(10);
    expect(m3b.factions.janissaries).toBeGreaterThan(m3.factions.janissaries);
  });
});

describe('missions are winnable and scored', () => {
  it('Mission 1: Karaman rises in April and can be brought to terms', () => {
    let wins = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const r = play(MISSION_BY_ID.accession, seed, (s, run) => {
        const acts: Action[] = s.pendingDilemmas.map((d) => ({ type: 'resolveDilemma', dilemmaId: d.id, optionId: d.eventId === 'accessionDonative' ? 'generous' : d.defaultOptionId }));
        if (s.arrears > 0) acts.push({ type: 'payArrears' });
        if (s.factions.janissaries < 55 && s.treasury > 6_000_000) acts.push({ type: 'grantDonative', akcePerMan: 200 });
        if (run.marks.karamanRose && s.wars.some((w) => w.enemies.includes('karaman'))) acts.push({ type: 'offerPeace', target: 'karaman', terms: 'whitePeace' });
        return acts;
      });
      if (r.won) {
        wins++;
        expect(r.stars).toBeGreaterThanOrEqual(1);
        expect(r.months).toBeGreaterThanOrEqual(3);
      }
    }
    expect(wins).toBeGreaterThanOrEqual(6);
  });

  it('Mission 2: building at once earns two stars; hiring Orban earns the third', () => {
    const r = play(MISSION_BY_ID['rumeli-hisari'], 3, (s) => {
      const acts: Action[] = s.pendingDilemmas.map((d) => ({ type: 'resolveDilemma', dilemmaId: d.id, optionId: d.eventId === 'bosporusFortress' ? 'build' : d.eventId === 'orbanCannon' ? 'hire' : d.defaultOptionId }));
      return acts;
    });
    expect(r.won).toBe(true);
    expect(r.months).toBeLessThanOrEqual(6);
    expect(r.underPar).toBe(true);
    expect(r.bonusMet).toBe(true);
    expect(r.stars).toBe(3);
    expect(r.spent).toBeGreaterThan(3_000_000); // the fortress alone costs 3M
  });

  it('Mission 2 fails on the clock if the fortress is never ordered', () => {
    const r = play(MISSION_BY_ID['rumeli-hisari'], 4, (s) => s.pendingDilemmas.map((d) => ({ type: 'resolveDilemma', dilemmaId: d.id, optionId: d.eventId === 'bosporusFortress' ? 'wait' : d.defaultOptionId })));
    expect(r.won).toBe(false);
    expect(r.stars).toBe(0);
    expect(r.reason).toMatch(/Time ran out/);
  });

  it('Mission 3: a prepared assault takes Constantinople in most seeds, faster with bombards', () => {
    const run3 = (seed: number, unlocked: string[]) =>
      play(MISSION_BY_ID.constantinople, seed, (s, run) => {
        const acts: Action[] = [];
        if (run.months === 0) acts.push({ type: 'declareWar', target: 'byzantium', casusBelli: 'Orhan' }, { type: 'startCampaign', target: 'constantinople', artillery: true, fleet: true });
        if (s.arrears > 0) acts.push({ type: 'payArrears' });
        return acts;
      }, unlocked);
    const withGuns = Array.from({ length: 8 }, (_, i) => run3(100 + i, ['bombards']));
    const without = Array.from({ length: 8 }, (_, i) => run3(100 + i, []));
    expect(withGuns.filter((r) => r.won).length).toBeGreaterThanOrEqual(6);
    const avg = (rs: MissionResult[]) => rs.filter((r) => r.won).reduce((a, r) => a + r.months, 0) / Math.max(1, rs.filter((r) => r.won).length);
    expect(withGuns.filter((r) => r.won).length).toBeGreaterThanOrEqual(without.filter((r) => r.won).length);
    if (without.some((r) => r.won)) expect(avg(withGuns)).toBeLessThanOrEqual(avg(without));
    for (const r of withGuns.filter((x) => x.won)) {
      expect(r.highlights.some((h) => /Constantinople/.test(h))).toBe(true);
      expect(r.losses).toBeGreaterThan(0);
    }
  });
});
