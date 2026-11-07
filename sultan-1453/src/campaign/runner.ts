// Runs a mission month by month around resolveTurn, keeps score, and records progress.
import type { GameState, MonthReport } from '../engine/types';
import type { Action } from '../engine/actions';
import { resolveTurn } from '../engine/turn';
import { MISSIONS, MISSION_BY_ID } from './missions';
import type { CampaignProgress, Capability, MissionDef, MissionResult, MissionRun } from './types';

export function newProgress(): CampaignProgress {
  return { version: 1, results: {}, unlocked: [] };
}

export function isUnlocked(p: CampaignProgress, def: MissionDef) {
  if (def.stub) return false;
  if (def.index === 1) return true;
  const prev = MISSIONS.find((m) => m.index === def.index - 1);
  return !!prev && !!p.results[prev.id]?.won;
}

export function sandboxUnlocked(p: CampaignProgress) {
  return p.unlocked.includes('sandbox');
}

const men = (s: GameState) => s.army.janissaries + s.army.palaceCavalry + (s.campaign ? s.campaign.janissaries + s.campaign.palaceCavalry + s.campaign.timariots : 0);

export function startMission(def: MissionDef, seed: number, progress: CampaignProgress): { state: GameState; run: MissionRun } {
  if (!def.start) throw new Error(`mission ${def.id} is not playable yet`);
  const state = def.start(seed, new Set<Capability>(progress.unlocked));
  return {
    state,
    run: { missionId: def.id, startTurn: state.turn, months: 0, startTreasury: state.treasury, spent: 0, losses: 0, highlights: [], marks: {}, status: 'active', reason: null },
  };
}

const NOTABLE = /victory|defeat|siege of .* begins|lays siege|raises the siege|storm|surrender|falls|declares war|war is declared|Peace with|put to death|executed|dies|Completed|Orban|Conqueror|mutiny|riot|plague|Red Apple/i;
const ROUTINE = /month \d+: breach|under siege by/;

/** Resolve one month of a mission. Returns the new state, the engine report, the updated run, and a result once it ends. */
export function advanceMission(def: MissionDef, state: GameState, run: MissionRun, actions: Action[]): { state: GameState; report: MonthReport; run: MissionRun; result: MissionResult | null } {
  const before = men(state);
  const { state: next, report } = resolveTurn(state, actions);
  const r: MissionRun = structuredClone(run);
  r.months += 1;
  r.spent += Math.max(0, report.treasuryStart + report.budget.totalRevenue - report.treasuryEnd);
  // losses: soldiers who did not come back (recruits and graduations are not counted against them)
  const lost = before - men(next);
  if (lost > 0 && !report.facts.some((f) => /pass into the Janissary corps/.test(f))) r.losses += lost;

  const scripted = def.script ? def.script(next, r) : [];
  const decisions = state.pendingDilemmas.map((d) => `${d.title}: `);
  for (const f of [...report.facts, ...scripted]) {
    if (decisions.some((d) => f.startsWith(d))) continue; // the Sultan's own rulings are not news
    if (NOTABLE.test(f) && !ROUTINE.test(f) && !r.highlights.includes(f)) r.highlights.push(f);
  }
  r.highlights = r.highlights.slice(-10);

  let result: MissionResult | null = null;
  const obj = def.objective.check(next, r);
  if (obj.met) {
    r.status = 'won';
    r.reason = obj.progress;
  } else if (next.status !== 'active') {
    r.status = 'lost';
    r.reason = next.statusReason ?? 'The reign has ended.';
  } else if (r.months >= def.limit) {
    r.status = 'lost';
    r.reason = `Time ran out: ${def.limit} months have passed. ${obj.progress}.`;
  }
  if (r.status !== 'active') result = scoreMission(def, next, r);
  return { state: next, report, run: r, result };
}

export function scoreMission(def: MissionDef, s: GameState, run: MissionRun): MissionResult {
  const won = run.status === 'won';
  const underPar = won && run.months <= def.par;
  const bonusMet = won && def.bonus.check(s, run);
  return {
    missionId: def.id,
    won,
    stars: won ? 1 + (underPar ? 1 : 0) + (bonusMet ? 1 : 0) : 0,
    months: run.months,
    spent: Math.round(run.spent),
    losses: Math.round(run.losses),
    highlights: run.highlights.slice(-6),
    reason: run.reason ?? '',
    treasuryStart: run.startTreasury,
    treasuryEnd: Math.round(s.treasury),
    bonusMet,
    underPar,
    rewardText: won ? def.reward.text : null,
  };
}

/** Record a finished mission: keep the best stars, unlock its rewards on a win. */
export function recordResult(p: CampaignProgress, res: MissionResult): CampaignProgress {
  const next: CampaignProgress = structuredClone(p);
  const prev = next.results[res.missionId];
  next.results[res.missionId] = {
    stars: Math.max(prev?.stars ?? 0, res.stars),
    months: prev?.won ? Math.min(prev.months, res.won ? res.months : prev.months) : res.months,
    won: !!prev?.won || res.won,
  };
  if (res.won) for (const c of MISSION_BY_ID[res.missionId].reward.unlocks) if (!next.unlocked.includes(c)) next.unlocked.push(c);
  return next;
}
