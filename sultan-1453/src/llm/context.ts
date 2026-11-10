// Builds the read-only fact sheets the LLM sees. This is the guardrail on what Claude can know:
// - figures come from reportedView() (what the Divan tells the Sultan), never the hidden truth;
// - ministers' private agendas are passed only as a labelled secret for the narrator to colour speech;
// - nothing here is ever written back into GameState.
import type { GameState, MonthReport, PendingDilemma } from '../engine/types';
import { FACTIONS } from '../engine/types';
import { fmtDate } from '../engine/calendar';
import { reportedView } from '../engine/intel';
import { grainConsumption } from '../engine/economy';
import { fmtAkce, livingPrinces, ottomanProvinces, princeAge, sultanAge } from '../engine/state';
import { TITLES } from '../engine/data/ministers';
import { LAWS } from '../engine/data/laws';
import { PROJECTS } from '../engine/data/projects';

const FACTION_LABEL: Record<string, string> = { janissaries: 'Janissaries', ulema: 'Ulema', rumelianBeys: 'Rumelian beys', anatolianBeys: 'Anatolian beys', harem: 'Harem', merchants: 'Merchants', millets: 'Christian millets' };

export const LETTERS = 'abcdefgh';

/** "Dilemma 2, option b" ↔ engine ids. The narrator shows letters; the parser maps them back. */
export function dilemmaKey(d: PendingDilemma, index: number) {
  return { number: index + 1, options: d.options.map((o, i) => ({ letter: LETTERS[i], id: o.id, label: o.label, available: o.available })) };
}

function mood(v: number) {
  return v >= 75 ? 'devoted' : v >= 60 ? 'content' : v >= 45 ? 'uneasy' : v >= 30 ? 'resentful' : 'mutinous';
}

/** The realm as the Sultan's officials report it. */
export function realmSummary(s: GameState): string {
  const v = reportedView(s);
  const b = v.budget;
  const L: string[] = [];
  const tim = Object.values(s.army.timariots).reduce((a, x) => a + x, 0);
  L.push(`DATE: ${fmtDate(s.date)}. Sultan ${s.sultan.name}, aged ${sultanAge(s)}, health ${healthWord(s.sultan.health)}. Capital: ${s.provinces[s.capital].name}.`);
  L.push(`TREASURY (as reported by the Defterdar): ${fmtAkce(v.treasury)} akçe. Monthly revenue ${fmtAkce(b.totalRevenue)}, expenses ${fmtAkce(b.totalExpenses)}, balance ${fmtAkce(b.net)}.${s.arrears > 0 ? ` ARREARS owed to the troops: ${fmtAkce(s.arrears)}.` : ''}`);
  L.push(`Revenue lines: ${b.revenue.filter((x) => x.amount).map((x) => `${x.label} ${fmtAkce(x.amount)}`).join('; ')}.`);
  L.push(`Expense lines: ${b.expenses.filter((x) => x.amount).map((x) => `${x.label} ${fmtAkce(x.amount)}`).join('; ')}.`);
  L.push(`Grain for the capital: ${(s.grain.stock / Math.max(1, grainConsumption(s))).toFixed(1)} months for ${s.grain.population.toLocaleString()} people.`);
  L.push(`Army at home: ${s.army.janissaries.toLocaleString()} Janissaries, ${s.army.palaceCavalry.toLocaleString()} Porte cavalry, about ${Math.round(tim / 1000)}k timariot sipahis, ${s.army.artillery.guns} guns and ${s.army.artillery.bombards} great bombards, ${s.army.fleet.galleys} galleys.`);
  if (s.campaign) {
    const c = s.campaign;
    L.push(`ARMY IN THE FIELD against ${s.provinces[c.target].name}: ${c.phase}; ${(c.janissaries + c.palaceCavalry + c.timariots).toLocaleString()} men, morale ${mood(c.morale)}, ${c.supply.toFixed(0)} months of provisions${c.ledBySultan ? '; the Sultan commands in person' : ''}.`);
  }
  for (const sg of s.sieges) L.push(`SIEGE of ${s.provinces[sg.province].name} (${sg.attacker === 'ottoman' ? 'by us' : `by ${s.neighbours[sg.attacker as 'hungary'].name}`}): month ${sg.months}, breach ${Math.round(sg.breach)}%, ${sg.defenders.toLocaleString()} defenders.`);
  L.push(`Factions (as reported): ${FACTIONS.map((f) => `${FACTION_LABEL[f]} ${mood(v.factions[f])} (${v.factions[f]})`).join('; ')}.`);
  L.push(`Wars: ${s.wars.length ? s.wars.map((w) => `${w.enemies.map((e) => s.neighbours[e].name).join(' and ')} (we are ${w.score > 20 ? 'winning' : w.score < -20 ? 'losing' : 'evenly matched'})`).join('; ') : 'none'}.`);
  L.push(`Foreign powers (spies' reports): ${Object.values(s.neighbours).filter((n) => n.maxArmy > 0 || n.id === 'papacy').map((n) => `${n.name} under ${n.ruler}: ${n.relation}, ${attitude(v.neighbourStance[n.id])}, ~${Math.round(v.neighbourArmy[n.id] / 1000)}k men`).join('; ')}.`);
  const provs = ottomanProvinces(s);
  const restless = provs.filter((p) => p.loyalty < 35).map((p) => p.name);
  L.push(`Provinces: ${provs.length} under the Sultan.${restless.length ? ` Restless: ${restless.join(', ')}.` : ''}`);
  const v2 = s.dynasty.valide;
  L.push(`Dynasty: ${v2?.alive ? `${v2.name} (${v2.note})` : 'no senior lady of the harem'}. Princes: ${livingPrinces(s).map((p) => `${p.name} [${p.id}] (${p.relation}, ${princeAge(s, p.birthYear)}${p.province ? `, governing ${s.provinces[p.province].name}` : ''}${p.heldBy ? `, held by ${s.neighbours[p.heldBy].name}` : ''})`).join('; ') || 'none'}.`);
  if (s.laws.length) L.push(`Laws in force: ${s.laws.map((l) => l.name).join('; ')}.`);
  if (s.projects.length) L.push(`Under construction: ${s.projects.map((p) => `${p.name} at ${s.provinces[p.province].name} (${p.monthsLeft} months left)`).join('; ')}.`);
  return L.join('\n');
}

function healthWord(h: number) {
  return h >= 80 ? 'robust' : h >= 60 ? 'fair' : h >= 40 ? 'ailing' : 'gravely ill';
}
function attitude(st: number) {
  return st >= 40 ? 'friendly' : st >= 10 ? 'cordial' : st > -20 ? 'wary' : st > -50 ? 'hostile' : 'implacable';
}

/** The Divan's ministers with public persona and private agenda (narrator only). */
export function divanRoster(s: GameState): string {
  return Object.values(s.ministers)
    .map((m) => `- ${m.name}, ${TITLES[m.role]}: ${m.personality} [SECRET agenda: ${agendaText(s, m.agenda, m.agendaTarget)}; personal loyalty to the Sultan ${m.loyalty >= 70 ? 'strong' : m.loyalty >= 45 ? 'conditional' : 'weak'}]`)
    .join('\n') + `\n- ${s.dynasty.chiefEunuch.name}, ${s.dynasty.chiefEunuch.title}: the palace gatekeeper and the Sultan's ears in the harem.` + (s.dynasty.valide?.alive ? `\n- ${s.dynasty.valide.name}: ${s.dynasty.valide.note}.` : '');
}

export function agendaText(s: GameState, a: string, target?: string) {
  switch (a) {
    case 'embezzle': return 'skims the revenues and keeps the books looking clean; deflects any talk of audits';
    case 'peaceParty': return `wants peace with ${target && s.neighbours[target as 'byzantium'] ? s.neighbours[target as 'byzantium'].name : 'the Christian powers'}, may be in their pay; talks up their strength and goodwill`;
    case 'warParty': return 'wants campaigns and glory; talks down enemy strength';
    case 'janissaryPatron': return 'shields the corps; says it is more content than it is';
    case 'orthodoxy': return 'presses the interests of the ulema and sharia';
    case 'princeFaction': return 'quietly backs one prince for the succession';
    default: return 'loyal; speaks plainly';
  }
}

export function dilemmaSheet(s: GameState): string {
  if (!s.pendingDilemmas.length) return 'No dilemmas are before the Divan this month.';
  return s.pendingDilemmas
    .map((d, i) => {
      const k = dilemmaKey(d, i);
      const opts = d.options.map((o, j) => `   (${LETTERS[j]}) ${o.label} — ${o.summary}${o.available ? '' : ' [NOT POSSIBLE NOW: cannot afford or conditions unmet]'}`).join('\n');
      return `DILEMMA ${k.number} — "${d.title}" — presented by ${d.presenterName}\n   Facts: ${d.brief}\n${opts}\n   If the Sultan gives no order: (${LETTERS[d.options.findIndex((o) => o.id === d.defaultOptionId)]})`;
    })
    .join('\n\n');
}

/** What happened in the month just resolved, as the engine decided it. */
export function monthSheet(r: MonthReport | null): string {
  if (!r) return 'This is the first month of the reign. Narrate the accession.';
  const L: string[] = [`EVENTS OF ${fmtDate(r.date).toUpperCase()} (weather: ${r.weather}) — these happened; narrate them, add nothing that changes them:`];
  for (const d of r.decisions) L.push(`- Decision on "${d.dilemma}": ${d.option}${d.byDefault ? ' (the Sultan gave no order; the default course was taken)' : ''}.`);
  for (const a of r.actionsApplied) if (!r.decisions.some((d) => a.startsWith(d.dilemma))) L.push(`- Order carried out: ${a}.`);
  for (const a of r.actionsRejected) L.push(`- Order that could not be carried out: ${a.reason}.`);
  for (const f of r.facts) if (!r.decisions.some((d) => f.startsWith(`${d.dilemma}: `))) L.push(`- ${f}`);
  if (r.grain.shortage) L.push('- There was a bread shortage in the capital.');
  const moves = Object.entries(r.factionDeltas).filter(([, v]) => Math.abs(v) >= 3).map(([f, v]) => `${FACTION_LABEL[f]} ${v > 0 ? 'warmer' : 'colder'}`);
  if (moves.length) L.push(`- Mood shifts: ${moves.join(', ')}.`);
  return L.join('\n');
}

/** Lookup tables the order parser needs: dilemma/option ids, princes, valid targets. */
export function ordersSheet(s: GameState): string {
  const L: string[] = ['CURRENT DILEMMAS (use these ids with resolveDilemma):'];
  s.pendingDilemmas.forEach((d, i) => {
    const k = dilemmaKey(d, i);
    L.push(`  Dilemma ${k.number} "${d.title}" id=${d.id}: ${k.options.map((o) => `(${o.letter}) ${o.label} → optionId=${o.id}${o.available ? '' : ' [not possible now]'}`).join('; ')}`);
  });
  if (!s.pendingDilemmas.length) L.push('  (none)');
  L.push(`PRINCES: ${livingPrinces(s).map((p) => `${p.name} → princeId=${p.id} (${p.relation}, age ${princeAge(s, p.birthYear)})`).join('; ') || 'none'}`);
  L.push(`OUR PROVINCES: ${ottomanProvinces(s).map((p) => `${p.name}=${p.id}`).join(', ')}`);
  const enemyProvs = Object.values(s.provinces).filter((p) => p.owner !== 'ottoman');
  L.push(`FOREIGN PROVINCES: ${enemyProvs.map((p) => `${p.name}=${p.id} (${p.owner}${s.wars.some((w) => w.enemies.includes(p.owner as 'hungary')) ? ', AT WAR' : ''})`).join(', ')}`);
  L.push(`TREASURY ${fmtAkce(s.treasury)} akçe; arrears ${fmtAkce(s.arrears)}; army ${s.campaign ? `in the field against ${s.provinces[s.campaign.target].name} (${s.campaign.phase})` : 'at home'}.`);
  L.push(`LAWS AVAILABLE: ${LAWS.filter((l) => !s.laws.some((x) => x.id === l.id)).map((l) => `${l.name}=${l.id}`).join('; ')}. IN FORCE: ${s.laws.map((l) => l.id).join(', ') || 'none'}.`);
  L.push(`PROJECTS: ${PROJECTS.map((p) => `${p.name}=${p.id}`).join('; ')}.`);
  return L.join('\n');
}
