// Plain-text ledger. Used by the sim runner and (in Phase 2) as the fact sheet handed to the LLM.
import type { GameState, MonthReport } from './types';
import { FACTIONS } from './types';
import { fmtDate } from './calendar';
import { computeBudget, grainConsumption } from './economy';
import { reportedView } from './intel';
import { fmtAkce, livingPrinces, ottomanProvinces, princeAge, sultanAge } from './state';
import { equilibrium } from './loyalty';

const pad = (s: string | number, n: number) => String(s).padEnd(n);
const lpad = (s: string | number, n: number) => String(s).padStart(n);

const FACTION_LABEL: Record<string, string> = {
  janissaries: 'Janissaries',
  ulema: 'Ulema',
  rumelianBeys: 'Rumelian beys',
  anatolianBeys: 'Anatolian beys',
  harem: 'Harem',
  merchants: 'Merchants',
  millets: 'Christian millets',
};

export function formatLedger(s: GameState, opts: { truth?: boolean } = {}): string {
  const truth = opts.truth ?? true;
  const b = truth ? computeBudget(s) : reportedView(s).budget;
  const view = reportedView(s);
  const L: string[] = [];
  const tim = Object.values(s.army.timariots).reduce((a, x) => a + x, 0);
  L.push(`══ ${fmtDate(s.date)} — ${s.sultan.name}, age ${sultanAge(s)}, health ${Math.round(s.sultan.health)} — capital ${s.provinces[s.capital].name} ══`);
  L.push(`Treasury ${fmtAkce(s.treasury)} akçe   Arrears ${fmtAkce(s.arrears)}   Coin ${s.coinage.silverGrams.toFixed(2)} g Ag   Cizye ${s.taxes.cizyePerHousehold}/hh   Customs ${s.taxes.customsRate}%`);
  L.push(`Budget (${truth ? 'TRUE' : 'as reported by the Defterdar'}), akçe/month:`);
  const rev = b.revenue.filter((x) => x.amount !== 0);
  const exp = b.expenses.filter((x) => x.amount !== 0);
  const rows = Math.max(rev.length, exp.length);
  for (let i = 0; i < rows; i++) {
    const r = rev[i];
    const e = exp[i];
    L.push(`  ${r ? pad(r.label, 42) + lpad(fmtAkce(r.amount), 8) : pad('', 50)}   ${e ? pad(e.label, 38) + lpad(fmtAkce(e.amount), 8) : ''}`.trimEnd());
  }
  L.push(`  ${pad('TOTAL REVENUE', 42)}${lpad(fmtAkce(b.totalRevenue), 8)}   ${pad('TOTAL EXPENSES', 38)}${lpad(fmtAkce(b.totalExpenses), 8)}   NET ${fmtAkce(b.net)}`);
  const cons = grainConsumption(s);
  L.push(`Grain: ${Math.round(s.grain.stock).toLocaleString()} kile (${(s.grain.stock / cons).toFixed(1)} months for ${s.grain.population.toLocaleString()} people)`);
  L.push(`Army: ${s.army.janissaries.toLocaleString()} Janissaries, ${s.army.palaceCavalry.toLocaleString()} Porte cavalry, ${tim.toLocaleString()} timariots at home, ${s.army.artillery.guns} guns + ${s.army.artillery.bombards} bombards (q ${s.army.artillery.quality.toFixed(2)}), ${s.army.fleet.galleys} galleys, cadets ${s.army.cadets.reduce((a, c) => a + c.count, 0)}`);
  if (s.campaign) {
    const c = s.campaign;
    L.push(`Campaign → ${s.provinces[c.target].name}: ${c.phase} (${c.monthsLeftInPhase} mo), ${c.janissaries + c.palaceCavalry + c.timariots} men (${c.janissaries} jan / ${c.palaceCavalry} cav / ${c.timariots} tim), ${c.guns} guns ${c.bombards} bombards, morale ${Math.round(c.morale)}, supply ${c.supply.toFixed(1)}`);
  }
  for (const sg of s.sieges) L.push(`Siege of ${s.provinces[sg.province].name} (${sg.attacker} vs ${sg.defender}): month ${sg.months}, breach ${sg.breach.toFixed(0)}%, ${sg.defenders} defenders, stores ${sg.defenderSupply.toFixed(1)}`);
  L.push('Factions (loyalty → equilibrium):');
  L.push('  ' + FACTIONS.map((f) => `${FACTION_LABEL[f]} ${Math.round(truth ? s.factions[f] : view.factions[f])}→${Math.round(equilibrium(s, f))}`).join(' | '));
  const wars = s.wars.map((w) => `${w.enemies.map((e) => s.neighbours[e].name).join(' + ')} (score ${w.score.toFixed(0)})`);
  L.push(`Wars: ${wars.length ? wars.join('; ') : 'none'}`);
  L.push('Neighbours: ' + Object.values(s.neighbours).filter((n) => n.maxArmy > 0 || n.id === 'papacy').map((n) => `${n.id} ${n.relation} ${Math.round(n.stance)} [${Math.round(n.fieldArmy / 1000)}k]`).join(', '));
  const provs = ottomanProvinces(s);
  L.push(`Provinces: ${provs.length} Ottoman; avg loyalty ${Math.round(provs.reduce((a, p) => a + p.loyalty, 0) / provs.length)}, avg prosperity ${Math.round(provs.reduce((a, p) => a + p.prosperity, 0) / provs.length)}`);
  const princes = livingPrinces(s).map((p) => `${p.name} (${p.relation}, ${princeAge(s, p.birthYear)}${p.province ? ', ' + s.provinces[p.province].name : ''}${p.heldBy ? ', held by ' + p.heldBy : ''}, hh ${Math.round(p.household)}, amb ${Math.round(p.ambition)})`);
  L.push(`Dynasty: ${s.dynasty.valide?.alive ? s.dynasty.valide.name + ' (Valide, inf ' + s.dynasty.valide.influence + ')' : 'no Valide'}; princes: ${princes.join('; ') || 'none'}`);
  if (s.laws.length) L.push(`Laws: ${s.laws.map((l) => l.name).join('; ')}`);
  if (s.projects.length) L.push(`Building: ${s.projects.map((p) => `${p.name} (${p.monthsLeft} mo)`).join('; ')}`);
  if (truth && view.distortions.length) L.push(`Hidden: ${view.distortions.map((d) => `${d.minister} ${d.what}`).join('; ')}`);
  return L.join('\n');
}

export function formatReport(r: MonthReport): string {
  const L: string[] = [];
  L.push(`── Resolved ${fmtDate(r.date)} (weather: ${r.weather}) — treasury ${fmtAkce(r.treasuryStart)} → ${fmtAkce(r.treasuryEnd)}, net budget ${fmtAkce(r.budget.net)}, grain ${r.grain.monthsCover} mo${r.grain.shortage ? ' SHORTAGE' : ''}`);
  for (const d of r.decisions) L.push(`   ⚖ ${d.dilemma} → ${d.option}${d.byDefault ? ' [default]' : ''}`);
  for (const a of r.actionsApplied.filter((x) => !r.decisions.some((d) => x.startsWith(d.dilemma)))) L.push(`   ▶ ${a}`);
  for (const a of r.actionsRejected) L.push(`   ✗ ${a.action}: ${a.reason}`);
  for (const f of r.facts.filter((x) => !r.decisions.some((d) => x.startsWith(`${d.dilemma}: `)))) L.push(`   • ${f}`);
  const deltas = Object.entries(r.factionDeltas).filter(([, v]) => Math.abs(v) >= 2).map(([k, v]) => `${FACTION_LABEL[k]} ${v > 0 ? '+' : ''}${v.toFixed(0)}`);
  if (deltas.length) L.push(`   Δ loyalty: ${deltas.join(', ')}`);
  return L.join('\n');
}
