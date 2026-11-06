import type { EventDef } from './types';
import type { TurnCtx } from '../state';
import { ECONOMY_EVENTS } from './economy';
import { MILITARY_EVENTS } from './military';
import { COURT_EVENTS } from './court';
import { SPENDING_EVENTS } from './spending';
import { log, spend, shock } from '../state';
import { C } from '../constants';

export const EVENT_LIBRARY: EventDef[] = [...ECONOMY_EVENTS, ...MILITARY_EVENTS, ...COURT_EVENTS, ...SPENDING_EVENTS];
export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENT_LIBRARY.map((e) => [e.id, e]));

/** Delayed consequences queued by events (ScheduledItem.kind === 'effect'). */
export const EFFECTS: Record<string, (ctx: TurnCtx, data: Record<string, string | number | boolean>) => void> = {
  loanInstalment: (ctx, d) => {
    const amt = Number(d.amount ?? 0);
    if (ctx.s.treasury >= amt) spend(ctx.s, amt);
    else {
      ctx.s.treasury = 0;
      shock(ctx.s, 'merchants', -10);
      log(ctx, 'economy', 'The treasury defaults on a loan instalment; the bankers will remember.');
    }
  },
  bombardCast: (ctx) => {
    const cost = ctx.s.flags.foundry ? C.bombardCastCost * 0.75 : C.bombardCastCost;
    if (ctx.s.treasury >= cost) {
      spend(ctx.s, cost);
      ctx.s.army.artillery.bombards += 1;
      log(ctx, 'military', `A great bombard is cast (${ctx.s.army.artillery.bombards} in the park).`);
    } else log(ctx, 'military', 'The founders wait for bronze money that never comes.');
  },
  courtReturns: (ctx) => {
    ctx.s.flags.courtFled = false;
    log(ctx, 'court', 'The court returns to the capital.');
  },
};
