// resolveTurn: the only entry point that advances the game. Pure from the caller's view:
// takes a state and a list of Actions, returns a NEW state and a MonthReport.
import type { FactionId, GameState, MonthReport } from './types';
import { FACTIONS } from './types';
import { Rng } from './rng';
import { nextDate, rollWeather } from './calendar';
import { applyEconomy, applyGrain } from './economy';
import { applyLoyaltyDrift, applyProvinceDrift } from './loyalty';
import { campaignMonth, enemyAI } from './war';
import { dynastyMonth } from './dynasty';
import { applyAction, describeAction, type Action } from './actions';
import { applyDilemmaChoice, selectDilemmas } from './events/select';
import { EFFECTS } from './events/library';
import { PROJECT_BY_ID } from './data/projects';
import { clamp, log, ottomanProvinces, shock, shocks, type TurnCtx } from './state';

const MAX_LOG = 600;

export function resolveTurn(state: GameState, actions: Action[]): { state: GameState; report: MonthReport } {
  if (state.status !== 'active') throw new Error(`game is over: ${state.statusReason}`);
  const s: GameState = structuredClone(state);
  const rng = new Rng(s.rngState);
  const ctx: TurnCtx = { s, rng, facts: [] };
  const startFactions = { ...s.factions };
  const treasuryStart = s.treasury;
  const resolvedDate = { ...s.date };
  s.flags.grainBoughtThisTurn = 0;

  // 1. Orders
  const actionsApplied: string[] = [];
  const actionsRejected: MonthReport['actionsRejected'] = [];
  const decisions: MonthReport['decisions'] = [];
  for (const a of actions) {
    const dilemma = a.type === 'resolveDilemma' ? s.pendingDilemmas.find((d) => d.id === a.dilemmaId || d.eventId === a.dilemmaId) : undefined;
    const r = applyAction(ctx, a);
    if (r.ok) {
      actionsApplied.push(r.summary ?? describeAction(a));
      if (dilemma && a.type === 'resolveDilemma') decisions.push({ dilemma: dilemma.title, option: dilemma.options.find((o) => o.id === a.optionId)?.label ?? a.optionId, byDefault: false });
    } else actionsRejected.push({ action: describeAction(a), reason: r.reason ?? 'rejected' });
  }

  // 2. Dilemmas left unanswered take their default course
  for (const d of s.pendingDilemmas) {
    let r = applyDilemmaChoice(ctx, d, d.defaultOptionId, true);
    if (!r.ok) {
      const alt = d.options.find((o) => o.available)?.id;
      if (alt) r = applyDilemmaChoice(ctx, d, alt, true);
    }
    decisions.push({ dilemma: d.title, option: r.label ?? d.defaultOptionId, byDefault: true });
  }
  s.pendingDilemmas = [];

  // 3. The month passes
  s.weather = rollWeather(s.date, rng);
  const budget = applyEconomy(ctx);
  const grain = applyGrain(ctx, Number(s.flags.grainBoughtThisTurn ?? 0));
  progressProjects(ctx);
  graduateCadets(ctx);
  recoverTimariots(ctx);
  campaignMonth(ctx);
  enemyAI(ctx);
  if (s.status === 'active') dynastyMonth(ctx);
  applyLoyaltyDrift(ctx);
  applyProvinceDrift(ctx);

  // 4. Delayed consequences
  // effects fire in the month they fall due; events are presented at the start of that month
  const isDue = (x: { kind: string; dueTurn: number }) => (x.kind === 'effect' ? x.dueTurn <= s.turn : x.dueTurn <= s.turn + 1);
  const due = s.scheduled.filter(isDue);
  s.scheduled = s.scheduled.filter((x) => !isDue(x));
  for (const item of due.filter((x) => x.kind === 'effect')) EFFECTS[item.ref]?.(ctx, item.data ?? {});
  const forcedEvents = due.filter((x) => x.kind === 'event');

  // 5. Expire modifiers
  s.modifiers = s.modifiers.filter((m) => m.expiresTurn > s.turn);

  // 6. Collapse
  if (s.status === 'active' && ottomanProvinces(s).length < 3) {
    s.status = 'lost';
    s.statusReason = 'The Ottoman realm has been reduced to a handful of towns. The House of Osman is finished.';
  }
  if (s.status === 'active' && s.factions.janissaries <= 3 && s.factions.rumelianBeys < 20) {
    s.status = 'deposed';
    s.statusReason = 'Army and provinces abandon the Sultan together; he is dethroned and confined.';
  }

  const factionDeltas = {} as Record<FactionId, number>;
  for (const f of FACTIONS) factionDeltas[f] = Math.round((s.factions[f] - startFactions[f]) * 10) / 10;

  const report: MonthReport = {
    turn: s.turn,
    date: resolvedDate,
    weather: s.weather,
    budget,
    treasuryStart,
    treasuryEnd: s.treasury,
    arrears: s.arrears,
    grain,
    factionDeltas,
    actionsApplied,
    actionsRejected,
    decisions,
    facts: ctx.facts,
  };
  s.lastReport = report;

  // 7. Advance the calendar and prepare next month's Divan
  s.turn += 1;
  s.date = nextDate(s.date);
  if (s.status === 'active') s.pendingDilemmas = selectDilemmas(s, rng, forcedEvents);
  if (s.log.length > MAX_LOG) s.log = s.log.slice(-MAX_LOG);
  s.rngState = rng.state;
  return { state: s, report };
}

function progressProjects(ctx: TurnCtx) {
  const s = ctx.s;
  if (s.flags.unpaidBills) return;
  for (const p of [...s.projects]) {
    p.monthsLeft -= 1;
    if (p.monthsLeft > 0) continue;
    s.projects = s.projects.filter((x) => x.instanceId !== p.instanceId);
    const def = PROJECT_BY_ID[p.id];
    const prov = s.provinces[p.province];
    const e = def.onComplete;
    if (e.factionShift) {
      for (const [f, v] of Object.entries(e.factionShift)) s.flags[`perm_${f}_${p.instanceId}`] = Number(v);
      shocks(s, e.factionShift);
    }
    if (prov) {
      if (e.prosperity) prov.prosperity = clamp(prov.prosperity + e.prosperity);
      if (e.loyalty) prov.loyalty = clamp(prov.loyalty + e.loyalty);
      if (e.walls) prov.walls = clamp(prov.walls + e.walls);
      if (e.customsMult) prov.customs = Math.round(prov.customs * e.customsMult);
    }
    if (e.flag) {
      s.flags[e.flag] = s.turn;
      if (e.flag === 'foundry') s.army.artillery.quality = clamp(s.army.artillery.quality + 0.2, 0, 1.5);
    }
    log(ctx, 'construction', `Completed: ${p.name}${prov ? ` at ${prov.name}` : ''}.`);
  }
}

function graduateCadets(ctx: TurnCtx) {
  const s = ctx.s;
  const ready = s.army.cadets.filter((c) => c.readyTurn <= s.turn);
  if (!ready.length) return;
  const n = ready.reduce((a, c) => a + c.count, 0);
  s.army.cadets = s.army.cadets.filter((c) => c.readyTurn > s.turn);
  s.army.janissaries += Math.round(n * 0.9);
  shock(s, 'janissaries', 2);
  log(ctx, 'military', `${Math.round(n * 0.9).toLocaleString()} acemi oğlans pass into the Janissary corps.`);
}

function recoverTimariots(ctx: TurnCtx) {
  const s = ctx.s;
  for (const p of ottomanProvinces(s)) {
    const cur = s.army.timariots[p.id] ?? 0;
    const cap = Math.round(p.timarCavalry * (0.5 + 0.5 * (p.prosperity / 100)));
    if (s.campaign) continue; // the levy is in the field; the home share holds the province
    if (cur < cap) s.army.timariots[p.id] = Math.min(cap, Math.round(cur + Math.max(5, cap * 0.03)));
  }
}
