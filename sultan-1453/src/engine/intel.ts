// What the Divan *tells* the Sultan, as opposed to what is true.
// Ministers with an agenda shade their reports; honesty scales the distortion.
// The UI ledger and the LLM see the *reported* view unless an audit or the Chief Eunuch reveals the truth.
import type { Budget, FactionId, GameState, NeighbourId } from './types';
import { computeBudget } from './economy';
import { clamp } from './state';

export interface ReportedView {
  budget: Budget;
  treasury: number;
  factions: Record<FactionId, number>;
  neighbourStance: Record<NeighbourId, number>;
  neighbourArmy: Record<NeighbourId, number>;
  /** which minister distorted what, for the engine's own debugging and the post-game reveal */
  distortions: { minister: string; what: string }[];
}

export function reportedView(s: GameState): ReportedView {
  const truth = computeBudget(s);
  const distortions: ReportedView['distortions'] = [];
  const budget: Budget = JSON.parse(JSON.stringify(truth));
  const audited = typeof s.flags.auditedTurn === 'number' && s.turn - (s.flags.auditedTurn as number) <= 2;

  // Defterdar: an embezzler hides the shrinkage line by reporting lower revenue (books still balance).
  const d = s.ministers.defterdar;
  const shrink = budget.expenses.find((e) => e.key === 'shrinkage');
  if (shrink && !audited) {
    budget.expenses = budget.expenses.filter((e) => e.key !== 'shrinkage');
    const lines = budget.revenue.filter((r) => r.key === 'taxFarms' || r.key === 'customs');
    const total = lines.reduce((a, b) => a + b.amount, 0) || 1;
    for (const l of lines) l.amount = Math.round(l.amount - (shrink.amount * l.amount) / total);
    distortions.push({ minister: d.name, what: `under-reports tax farm and customs revenue by ${shrink.amount.toLocaleString()} akçe/month` });
  }
  budget.totalRevenue = budget.revenue.reduce((a, b) => a + b.amount, 0);
  budget.totalExpenses = budget.expenses.reduce((a, b) => a + b.amount, 0);
  budget.net = budget.totalRevenue - budget.totalExpenses;

  const factions = { ...s.factions };
  const agha = s.ministers.janissaryAgha;
  if (agha.agenda === 'janissaryPatron') {
    const bias = ((100 - agha.honesty) / 100) * 20;
    factions.janissaries = clamp(Math.round(factions.janissaries + bias));
    distortions.push({ minister: agha.name, what: `reports the corps ${bias.toFixed(0)} points more content than it is` });
  }
  for (const f of Object.keys(factions) as FactionId[]) factions[f] = Math.round(factions[f]);

  const neighbourStance = {} as Record<NeighbourId, number>;
  const neighbourArmy = {} as Record<NeighbourId, number>;
  for (const n of Object.values(s.neighbours)) {
    neighbourStance[n.id] = Math.round(n.stance);
    neighbourArmy[n.id] = Math.round(n.fieldArmy / 500) * 500; // spies give round numbers
  }
  const gv = s.ministers.grandVizier;
  if (gv.agenda === 'peaceParty' && gv.agendaTarget) {
    const t = gv.agendaTarget as NeighbourId;
    const bias = ((100 - gv.honesty) / 100) * 40;
    neighbourStance[t] = clamp(Math.round(neighbourStance[t] + bias), -100, 100);
    neighbourArmy[t] = Math.round((neighbourArmy[t] * (1 + bias / 60)) / 500) * 500;
    distortions.push({ minister: gv.name, what: `paints ${s.neighbours[t].name} as friendlier (+${bias.toFixed(0)}) and stronger than it is` });
  }
  const rb = s.ministers.beylerbeyRumelia;
  if (rb.agenda === 'warParty') {
    const k = 1 - ((100 - rb.honesty) / 100) * 0.4;
    for (const id of ['hungary', 'serbia', 'wallachia', 'albania', 'byzantium'] as NeighbourId[]) neighbourArmy[id] = Math.round((neighbourArmy[id] * k) / 500) * 500;
    distortions.push({ minister: rb.name, what: `understates Balkan armies by ${Math.round((1 - k) * 100)}%` });
  }
  return { budget, treasury: s.treasury, factions, neighbourStance, neighbourArmy, distortions };
}
