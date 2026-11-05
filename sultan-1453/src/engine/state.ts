// Small mutation helpers shared by every engine module. They operate on a draft GameState that
// resolveTurn() has already deep-cloned, so callers of the engine never see mutation.
import type {
  FactionId,
  GameState,
  LogEntry,
  Modifier,
  NeighbourId,
  Presenter,
  Province,
  ScheduledItem,
} from './types';
import type { Rng } from './rng';
import { fmtDate } from './calendar';
import { C } from './constants';

export interface TurnCtx {
  s: GameState;
  rng: Rng;
  facts: string[];
}

export const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
export const round = (v: number) => Math.round(v);

export function newId(s: GameState, prefix: string): string {
  s.idCounter += 1;
  return `${prefix}-${s.idCounter}`;
}

export function log(ctx: TurnCtx, kind: LogEntry['kind'], text: string) {
  ctx.s.log.push({ turn: ctx.s.turn, date: { ...ctx.s.date }, kind, text });
  ctx.facts.push(text);
}

/** Immediate loyalty shock; it decays back toward equilibrium over following months. */
export function shock(s: GameState, f: FactionId, delta: number) {
  s.factions[f] = clamp(s.factions[f] + delta);
}

export function shocks(s: GameState, d: Partial<Record<FactionId, number>>) {
  for (const [k, v] of Object.entries(d)) shock(s, k as FactionId, v as number);
}

export function canAfford(s: GameState, amount: number) {
  return s.treasury >= amount;
}

export function spend(s: GameState, amount: number) {
  s.treasury -= amount;
}

export function gain(s: GameState, amount: number) {
  s.treasury += amount;
}

export function addModifier(s: GameState, m: Omit<Modifier, 'expiresTurn'> & { months: number }) {
  const { months, ...rest } = m;
  s.modifiers = s.modifiers.filter((x) => x.id !== m.id);
  s.modifiers.push({ ...rest, expiresTurn: s.turn + months });
}

export function hasModifier(s: GameState, id: string) {
  return s.modifiers.some((m) => m.id === id);
}

export function stance(s: GameState, n: NeighbourId, delta: number) {
  s.neighbours[n].stance = clamp(s.neighbours[n].stance + delta, -100, 100);
}

export function schedule(
  s: GameState,
  inMonths: number,
  kind: ScheduledItem['kind'],
  ref: string,
  note: string,
  data?: ScheduledItem['data'],
) {
  s.scheduled.push({ id: newId(s, 'sch'), dueTurn: s.turn + Math.max(1, inMonths), kind, ref, note, data });
}

export function ottomanProvinces(s: GameState): Province[] {
  return Object.values(s.provinces).filter((p) => p.owner === 'ottoman');
}

export function provincesOf(s: GameState, owner: string): Province[] {
  return Object.values(s.provinces).filter((p) => p.owner === owner);
}

export function sultanAge(s: GameState) {
  return s.date.year - s.sultan.birthYear;
}

export function princeAge(s: GameState, birthYear: number) {
  return s.date.year - birthYear;
}

export function livingPrinces(s: GameState) {
  return s.dynasty.princes.filter((p) => p.alive);
}

export function atWarWith(s: GameState, n: NeighbourId) {
  return s.wars.some((w) => w.enemies.includes(n));
}

export function warWith(s: GameState, n: NeighbourId) {
  return s.wars.find((w) => w.enemies.includes(n));
}

export function presenterName(s: GameState, p: Presenter): string {
  if (p === 'valide') return s.dynasty.valide?.name ?? 'the senior lady of the harem';
  if (p === 'chiefEunuch') return `${s.dynasty.chiefEunuch.name}, ${s.dynasty.chiefEunuch.title}`;
  if (p === 'sultan') return s.sultan.name;
  return s.ministers[p].name;
}

export function fmtAkce(n: number): string {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toFixed(2)}M`;
  if (a >= 1_000) return `${sign}${Math.round(a / 1_000)}k`;
  return `${sign}${Math.round(a)}`;
}

export function dateStr(s: GameState) {
  return fmtDate(s.date);
}

/** Monthly cash cost of the standing salaried troops (used by several events for scale). */
export function monthlySalaries(s: GameState) {
  const jan = s.army.janissaries * C.janissaryDailyPay * 30;
  const cav = s.army.palaceCavalry * C.palaceCavalryDailyPay * 30;
  return jan + cav;
}
