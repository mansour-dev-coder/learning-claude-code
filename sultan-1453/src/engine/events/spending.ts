// Discretionary spending the Divan presses on the Sultan. Ottoman kingship ran on visible largesse:
// a full treasury invites demands for mosques, fleets, festivals and gifts, and refusing them has a political cost.
import type { EventDef } from './types';
import type { GameState, NeighbourId } from '../types';
import { canAfford, clamp, livingPrinces, log, ottomanProvinces, princeAge, shock, shocks, spend, stance } from '../state';
import { computeBudget } from '../economy';
import { C } from '../constants';
import { k } from './helpers';
import { startProjectFromEvent } from './economy';

/** Treasury expressed in months of total expenses. */
export function treasuryMonths(s: GameState) {
  return s.treasury / Math.max(1, computeBudget(s).totalExpenses);
}

/** Weight grows with the size of the treasury: the fuller the chest, the louder the Divan. */
const purse = (base: number) => (s: GameState) => base * Math.max(0, treasuryMonths(s) - 3) / 3;

export const SPENDING_EVENTS: EventDef[] = [
  {
    id: 'imperialKulliye',
    title: 'An imperial mosque for the Sultan’s name',
    category: 'religion',
    presenter: 'seyhulislam',
    cooldown: 30,
    condition: (s) => treasuryMonths(s) > 4 && !s.projects.some((p) => p.id === 'kulliye'),
    weight: purse(2),
    prepare: (s) => ({ pid: s.capital }),
    brief: (s) => `The Mufti reminds the Sultan that every great ruler of the House of Osman has left a külliye — mosque, medrese, imaret, hospital — endowed in perpetuity. The treasury holds ${k(s.treasury)}.`,
    options: [
      { id: 'build', label: 'Endow a great külliye in the capital (6M over 24 months)', summary: 'Ulema and merchants honoured for generations; a large, slow drain on the treasury.', apply: (ctx, c) => { startProjectFromEvent(ctx, 'kulliye', String(c.pid)); shock(ctx.s, 'ulema', 4); } },
      { id: 'medrese', label: 'A medrese only (1.2M over 12 months)', summary: 'A smaller gesture.', apply: (ctx, c) => startProjectFromEvent(ctx, 'medrese', String(c.pid)) },
      { id: 'refuse', label: 'The treasury is for the army', summary: 'The ulema call the Sultan miserly from the pulpit.', apply: (ctx) => shocks(ctx.s, { ulema: -6, merchants: -2 }) },
    ],
    defaultOption: 'refuse',
  },
  {
    id: 'fleetProgramme',
    title: 'The Kapudan asks for a fleet',
    category: 'military',
    presenter: 'kapudanPasha',
    cooldown: 24,
    condition: (s) => treasuryMonths(s) > 4 && s.army.fleet.galleys < 120,
    weight: (s) => purse(1.5)(s) * (s.neighbours.venice.stance < 0 || s.provinces.constantinople.owner !== 'ottoman' ? 1.5 : 1),
    brief: (s) => `${s.ministers.kapudanPasha.name} says ${s.army.fleet.galleys} galleys cannot face Venice's ${s.neighbours.venice.navy}. He wants a building programme at Gelibolu.`,
    options: [
      { id: 'large', label: 'Build 30 galleys', summary: (s) => `${k(30 * C.galleyBuildCost * (s.flags.arsenal ? 0.67 : 1))}, plus their upkeep for years.`, available: (s) => canAfford(s, 30 * C.galleyBuildCost * (s.flags.arsenal ? 0.67 : 1)), apply: (ctx) => buildFleet(ctx.s, 30, ctx) },
      { id: 'small', label: 'Build 10 galleys', summary: (s) => `${k(10 * C.galleyBuildCost * (s.flags.arsenal ? 0.67 : 1))}.`, available: (s) => canAfford(s, 10 * C.galleyBuildCost), apply: (ctx) => buildFleet(ctx.s, 10, ctx) },
      { id: 'arsenal', label: 'Build an arsenal first (3M over 12 months)', summary: 'Cheaper galleys later.', available: (s) => !s.flags.arsenal && !s.projects.some((p) => p.id === 'tersane'), apply: (ctx) => startProjectFromEvent(ctx, 'tersane', 'gelibolu') },
      { id: 'refuse', label: 'Not now', summary: 'The sea stays Venetian.', apply: (ctx) => { ctx.s.ministers.kapudanPasha.loyalty = clamp(ctx.s.ministers.kapudanPasha.loyalty - 5); } },
    ],
    defaultOption: 'refuse',
  },
  {
    id: 'embassyGifts',
    title: 'A foreign embassy at the Porte',
    category: 'diplomacy',
    presenter: 'nisanci',
    cooldown: 8,
    condition: () => true,
    weight: (s) => 1 + purse(0.6)(s),
    prepare: (s, rng) => {
      const opts = Object.values(s.neighbours).filter((n) => n.maxArmy > 0 || n.id === 'papacy' || n.id === 'venice');
      return opts.length ? { who: rng.pick(opts).id } : null;
    },
    brief: (s, c) => `Envoys of ${s.neighbours[c.who as NeighbourId].ruler} have presented gifts. Custom requires robes of honour (hil'at) and return gifts worthy of the Sultan's dignity.`,
    options: [
      { id: 'lavish', label: `Lavish return gifts (${k(300_000)})`, summary: 'The envoys go home dazzled.', available: (s) => canAfford(s, 300_000), apply: (ctx, c) => { spend(ctx.s, 300_000); stance(ctx.s, c.who as NeighbourId, 12); } },
      { id: 'customary', label: `The customary gifts (${k(80_000)})`, summary: 'Correct, unremarkable.', available: (s) => canAfford(s, 80_000), apply: (ctx, c) => { spend(ctx.s, 80_000); stance(ctx.s, c.who as NeighbourId, 4); } },
      { id: 'meagre', label: 'Send them off with a robe each', summary: 'Taken as an insult.', apply: (ctx, c) => stance(ctx.s, c.who as NeighbourId, -8) },
    ],
    defaultOption: 'customary',
  },
  {
    id: 'royalFestival',
    title: 'A circumcision festival for the princes',
    category: 'dynasty',
    presenter: 'valide',
    cooldown: 48,
    condition: (s) => livingPrinces(s).some((p) => p.relation === 'son' && princeAge(s, p.birthYear) >= 7 && princeAge(s, p.birthYear) <= 12),
    weight: (s) => 1.5 + purse(1)(s),
    brief: () => 'The princes have reached the age for their circumcision feast (sünnet düğünü): weeks of processions, guild parades, fireworks and gifts to the army and the people.',
    options: [
      { id: 'grand', label: `A grand festival (${k(1_500_000)})`, summary: 'The capital talks of nothing else; the corps receives gifts.', available: (s) => canAfford(s, 1_500_000), apply: (ctx) => { spend(ctx.s, 1_500_000); shocks(ctx.s, { harem: 10, janissaries: 6, merchants: 5, millets: 2 }); for (const p of ottomanProvinces(ctx.s).filter((x) => x.id === ctx.s.capital)) p.loyalty = clamp(p.loyalty + 5); log(ctx, 'court', 'A grand circumcision festival is held for the princes.'); } },
      { id: 'modest', label: `A modest palace ceremony (${k(300_000)})`, summary: 'Proper but quiet.', available: (s) => canAfford(s, 300_000), apply: (ctx) => { spend(ctx.s, 300_000); shock(ctx.s, 'harem', 3); } },
      { id: 'none', label: 'No festival', summary: 'The princes’ mothers are humiliated.', apply: (ctx) => shocks(ctx.s, { harem: -10, janissaries: -3 }) },
    ],
    defaultOption: 'modest',
  },
];

function buildFleet(s: GameState, n: number, ctx: Parameters<EventDef['options'][number]['apply']>[0]) {
  spend(s, Math.round(n * C.galleyBuildCost * (s.flags.arsenal ? 0.67 : 1)));
  s.army.fleet.galleys += n;
  log(ctx, 'military', `${n} galleys are laid down at Gelibolu.`);
}
