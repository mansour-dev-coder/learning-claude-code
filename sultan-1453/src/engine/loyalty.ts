// Faction loyalty = shock + mean reversion.
// Each faction has an *equilibrium* computed from the structural situation (pay, wars, laws, coinage…).
// Events apply immediate shocks; every month current loyalty closes a share of the gap to equilibrium.
import type { FactionId, GameState, NeighbourId } from './types';
import { FACTIONS } from './types';
import { C, DIFFICULTY } from './constants';
import { LAW_BY_ID } from './data/laws';
import { clamp, ottomanProvinces, sultanAge, type TurnCtx } from './state';

const CHRISTIAN: NeighbourId[] = ['hungary', 'venice', 'papacy', 'serbia', 'wallachia', 'byzantium', 'albania'];
const MUSLIM: NeighbourId[] = ['karaman', 'mamluks', 'aqqoyunlu'];
const BALKAN: NeighbourId[] = ['hungary', 'serbia', 'wallachia', 'albania', 'byzantium', 'venice'];

export interface EquilibriumTerm {
  label: string;
  value: number;
}

export function equilibriumTerms(s: GameState, f: FactionId): EquilibriumTerm[] {
  const t: EquilibriumTerm[] = [{ label: 'base', value: 55 + DIFFICULTY[s.difficulty].loyalty }];
  const add = (label: string, value: number) => {
    if (Math.abs(value) >= 0.5) t.push({ label, value: Math.round(value) });
  };
  const recent = (flag: string, months: number) => typeof s.flags[flag] === 'number' && s.turn - (s.flags[flag] as number) <= months;
  const enemies = s.wars.flatMap((w) => w.enemies);
  const debased = s.coinage.lastDebasementTurn >= 0 && s.turn - s.coinage.lastDebasementTurn <= 24;
  const m = s.ministers;

  for (const mod of s.modifiers) add(mod.label, mod.faction?.[f] ?? 0);
  for (const l of s.laws) add(LAW_BY_ID[l.id]?.name ?? l.id, LAW_BY_ID[l.id]?.factionShift[f] ?? 0);
  for (const key of Object.keys(s.flags)) {
    if (key.startsWith(`perm_${f}_`)) add(key.slice(6 + f.length), Number(s.flags[key]));
  }

  switch (f) {
    case 'janissaries': {
      const monthlyPay = s.army.janissaries * C.janissaryDailyPay * 30 + 1;
      if (s.arrears > 0) add('pay in arrears', -Math.min(40, 8 + (s.arrears / monthlyPay) * 10));
      if (debased) add('debased coin', -12);
      if (recent('lastVictoryTurn', 12)) add('recent victories and booty', 10);
      if (recent('lastDefeatTurn', 12)) add('recent defeat', -8);
      if (!s.wars.some((w) => w.declaredByUs) && s.turn - Number(s.flags.lastWarEndTurn ?? -999) > 30 && s.turn > 30) add('long peace, no booty', -6);
      add('Sultan’s martial standing', (s.sultan.martial - 5) * 2);
      add('Agha’s standing', (m.janissaryAgha.loyalty - 50) / 8);
      if (sultanAge(s) < 18) add('boy Sultan', -6);
      break;
    }
    case 'ulema': {
      add('Sultan’s piety', (s.sultan.piety - 5) * 2.5);
      add('Mufti’s standing', (m.seyhulislam.loyalty - 50) / 8);
      if (debased) add('debased coin', -3);
      add('wars on Muslim rulers', -5 * enemies.filter((e) => MUSLIM.includes(e)).length);
      add('ghaza against the infidel', 3 * Math.min(2, enemies.filter((e) => CHRISTIAN.includes(e)).length));
      break;
    }
    case 'rumelianBeys': {
      add('Balkan wars (timars and booty)', 7 * Math.min(2, enemies.filter((e) => BALKAN.includes(e)).length));
      const c = s.campaign;
      if (c && s.turn - c.startedTurn > 7) add('campaign dragging on', -8);
      add('Beylerbey’s standing', (m.beylerbeyRumelia.loyalty - 50) / 8);
      add('Rumelian prosperity', (avgProsperity(s, 'rumelia') - 60) / 4);
      break;
    }
    case 'anatolianBeys': {
      add('eastern wars', 5 * Math.min(2, enemies.filter((e) => MUSLIM.includes(e)).length));
      if (m.grandVizier.faction === 'anatolianBeys') add('one of their own as Grand Vizier', 6);
      add('Beylerbey’s standing', (m.beylerbeyAnatolia.loyalty - 50) / 8);
      add('Anatolian prosperity', (avgProsperity(s, 'anatolia') - 60) / 4);
      if (s.campaign && s.turn - s.campaign.startedTurn > 7) add('long service away from their timars', -5);
      break;
    }
    case 'harem': {
      const v = s.dynasty.valide;
      if (v?.alive) add('Valide’s influence', (v.influence - 50) / 5);
      const adultsAppointed = s.dynasty.princes.filter((p) => p.alive && p.relation === 'son' && p.province).length;
      add('princes holding sancaks', 3 * adultsAppointed);
      add('Chief Eunuch’s standing', (s.dynasty.chiefEunuch.loyalty - 50) / 8);
      break;
    }
    case 'merchants': {
      add('customs rate', -(s.taxes.customsRate - 4) * 5);
      if (enemies.includes('venice')) add('war with Venice', -15);
      if (debased) add('debased coin', -15);
      if (enemies.length === 0) add('peace on the roads', 5);
      break;
    }
    case 'millets': {
      add('cizye rate', -(s.taxes.cizyePerHousehold - Number(s.flags.customaryCizye ?? 35)) * 0.8);
      add('wars on Christian powers', -2 * enemies.filter((e) => CHRISTIAN.includes(e)).length);
      add('kadı justice', (m.kazasker.competence - 5) * 1.5);
      break;
    }
  }
  return t;
}

export function equilibrium(s: GameState, f: FactionId) {
  return clamp(equilibriumTerms(s, f).reduce((a, b) => a + b.value, 0), 5, 95);
}

function avgProsperity(s: GameState, region: 'rumelia' | 'anatolia') {
  const ps = ottomanProvinces(s).filter((p) => p.region === region);
  return ps.length ? ps.reduce((a, p) => a + p.prosperity, 0) / ps.length : 50;
}

export function applyLoyaltyDrift(ctx: TurnCtx): Record<FactionId, number> {
  const s = ctx.s;
  const deltas = {} as Record<FactionId, number>;
  for (const f of FACTIONS) {
    const before = s.factions[f];
    const eq = equilibrium(s, f);
    const next = clamp(before + (eq - before) * C.loyaltyReversion + ctx.rng.normal() * 1.2);
    s.factions[f] = Math.round(next * 10) / 10;
    deltas[f] = 0; // filled in by turn.ts against start-of-turn values
  }
  return deltas;
}

/** Province loyalty and prosperity drift. */
export function applyProvinceDrift(ctx: TurnCtx) {
  const s = ctx.s;
  const customary = Number(s.flags.customaryCizye ?? 35);
  for (const p of ottomanProvinces(s)) {
    const plague = s.modifiers.some((m) => m.plague && m.province === p.id);
    const target = clamp(55 + (p.garrison / 1000) * 3 - (s.taxes.cizyePerHousehold - customary) * 0.4 + (p.prosperity - 50) / 5 + (s.factions.millets - 50) / 10);
    p.loyalty = Math.round(clamp(p.loyalty + (target - p.loyalty) * 0.05 + ctx.rng.normal() * 0.5) * 10) / 10;
    const ptarget = plague ? 30 : 85;
    p.prosperity = Math.round(clamp(p.prosperity + (ptarget - p.prosperity) * 0.006 + (plague ? -1.5 : 0)) * 10) / 10;
  }
}
