import type { GameState, PendingDilemma, ScheduledItem } from '../types';
import type { Rng } from '../rng';
import type { EventDef } from './types';
import { EVENT_BY_ID, EVENT_LIBRARY } from './library';
import { presenterName, type TurnCtx, log } from '../state';
import { fmtDate } from '../calendar';

function isEligible(s: GameState, e: EventDef) {
  if (e.forcedOnly) return false;
  const last = s.eventHistory[e.id];
  if (last !== undefined && (e.unique || s.turn - last < Math.max(1, e.cooldown))) return false;
  try {
    return e.condition(s);
  } catch {
    return false;
  }
}

function build(s: GameState, rng: Rng, e: EventDef, data?: ScheduledItem['data']): PendingDilemma | null {
  let context = e.prepare ? e.prepare(s, rng) : {};
  if (context === null) return null;
  context = { ...context, ...(data ?? {}) };
  if (typeof context.pid === 'string' && s.provinces[context.pid] && !data?.name) context.name = s.provinces[context.pid].name;
  const presenter = typeof e.presenter === 'function' ? e.presenter(s, context) : e.presenter;
  const options = e.options.map((o) => ({
    id: o.id,
    label: o.label,
    summary: typeof o.summary === 'function' ? o.summary(s, context!) : o.summary,
    available: o.available ? o.available(s, context!) : true,
  }));
  let def = e.defaultOption;
  if (!options.find((o) => o.id === def)?.available) def = options.find((o) => o.available)?.id ?? options[0].id;
  return {
    id: `${e.id}@${s.turn}`,
    eventId: e.id,
    title: e.title,
    presenter,
    presenterName: presenterName(s, presenter),
    brief: e.brief(s, context),
    options,
    defaultOptionId: def,
    context,
    turn: s.turn,
  };
}

/** Pick this month's dilemmas: all forced (scheduled) ones, then weighted draws up to 2–4 total. */
export function selectDilemmas(s: GameState, rng: Rng, forced: ScheduledItem[] = []): PendingDilemma[] {
  const out: PendingDilemma[] = [];
  const used = new Set<string>();
  for (const f of forced) {
    const e = EVENT_BY_ID[f.ref];
    if (!e || used.has(e.id)) continue;
    let ok = true;
    try { ok = e.condition(s); } catch { ok = false; }
    if (!ok) continue;
    const d = build(s, rng, e, f.data);
    if (d) {
      out.push(d);
      used.add(e.id);
    }
  }
  const target = Math.max(out.length, Math.min(4, 2 + rng.int(0, 2)));
  const pool = EVENT_LIBRARY.filter((e) => !used.has(e.id) && isEligible(s, e));
  while (out.length < target && pool.length) {
    const pick = rng.weighted(pool.map((e) => ({ item: e, weight: typeof e.weight === 'function' ? e.weight(s) : e.weight })));
    if (!pick) break;
    pool.splice(pool.indexOf(pick), 1);
    const d = build(s, rng, pick);
    if (d) {
      out.push(d);
      used.add(pick.id);
    }
  }
  for (const d of out) s.eventHistory[d.eventId] = s.turn;
  return out;
}

export function applyDilemmaChoice(ctx: TurnCtx, d: PendingDilemma, optionId: string, byDefault: boolean): { ok: boolean; reason?: string; label?: string } {
  const e = EVENT_BY_ID[d.eventId];
  if (!e) return { ok: false, reason: `unknown event ${d.eventId}` };
  const opt = e.options.find((o) => o.id === optionId);
  if (!opt) return { ok: false, reason: `"${optionId}" is not an option of ${d.title}` };
  if (opt.available && !opt.available(ctx.s, d.context)) return { ok: false, reason: `"${opt.label}" is not possible now (cannot afford or conditions changed)` };
  opt.apply(ctx, d.context);
  log(ctx, 'decision', `${d.title}: ${opt.label}${byDefault ? ' (by default — the Sultan gave no order)' : ''}.`);
  void fmtDate;
  return { ok: true, label: opt.label };
}
