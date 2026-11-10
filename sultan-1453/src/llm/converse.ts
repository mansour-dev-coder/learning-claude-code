// A private audience: one courtier speaking in character with the Sultan. Read-only: it returns words, never actions.
import type { GameState, Minister } from '../engine/types';
import { TITLES } from '../engine/data/ministers';
import { realmSummary, agendaText } from './context';
import { optionEffects, divanCounsel, describeEffects } from '../court/counsel';

export interface Speaker {
  name: string;
  title: string;
  kind: string;
  /** dilemma ids this person presents */
  dilemmas: string[];
  note?: string;
}

export interface Turn { who: 'sultan' | 'them'; text: string }

function minister(s: GameState, name: string): Minister | undefined {
  return Object.values(s.ministers).find((m) => m.name === name);
}

/** The briefing for the courtier (system part, stable across one audience). */
export function audienceBrief(s: GameState, sp: Speaker): string {
  const m = minister(s, sp.name);
  const L: string[] = [];
  if (m) {
    L.push(`YOU ARE ${m.name}, ${TITLES[m.role]}. ${m.personality}`);
    L.push(`Your SECRET agenda (never state it): ${agendaText(s, m.agenda, m.agendaTarget)}. Your honesty is ${m.honesty >= 70 ? 'high' : m.honesty >= 45 ? 'middling' : 'low'}; your personal loyalty to the Sultan is ${m.loyalty >= 70 ? 'strong' : m.loyalty >= 45 ? 'conditional' : 'weak'}; your competence is ${m.competence >= 7 ? 'great' : m.competence >= 4 ? 'ordinary' : 'poor'}.`);
  } else {
    L.push(`YOU ARE ${sp.name}, ${sp.title}.${sp.note ? ` ${sp.note}` : ''}`);
    if (sp.kind === 'valide') L.push('You are the Sultan’s mother or the senior lady of the harem: you may call him "my son" and speak with a mother’s licence.');
    if (sp.kind === 'prince') L.push('You are a prince of the dynasty, speaking to your father. Under the law of fratricide your life may one day depend on him: be careful.');
    if (sp.kind === 'petitioner') L.push('You are a humble subject at the palace gate, overwhelmed to be speaking to the Sultan himself.');
  }
  L.push(`\nTHE REALM AS THE REGISTERS REPORT IT:\n${realmSummary(s)}`);
  const ds = s.pendingDilemmas.filter((d) => sp.dilemmas.includes(d.id));
  const others = s.pendingDilemmas.filter((d) => !sp.dilemmas.includes(d.id));
  for (const d of ds) {
    const eff = optionEffects(s, d);
    const mine = m ? divanCounsel(s, d, eff).find((c) => c.name === m.name) : undefined;
    L.push(`\nMATTER YOU PRESENT: "${d.title}". ${d.brief}`);
    for (const e of eff) L.push(`- "${e.label}"${e.available ? '' : ' (not possible now)'}: ${m ? describeEffects(m, e, s) : ''}.`);
    if (mine) L.push(`Your own counsel: favour "${eff.find((e) => e.optionId === mine.recommends)?.label}", oppose "${eff.find((e) => e.optionId === mine.opposes)?.label}".`);
    const rivals = divanCounsel(s, d, eff).filter((c) => c.name !== m?.name && c.recommends !== mine?.recommends).slice(0, 3);
    if (rivals.length) L.push(`Others in the Divan disagree: ${rivals.map((c) => `${c.name} (${c.title}) favours "${eff.find((e) => e.optionId === c.recommends)?.label}"`).join('; ')}.`);
  }
  if (others.length) L.push(`\nOther matters before the Divan this month (presented by others): ${others.map((d) => `"${d.title}" (${d.presenterName})`).join('; ')}.`);
  return L.join('\n');
}

/** The conversation so far as a single user turn (keeps every edition on one simple call). */
export function audienceInput(history: Turn[], text: string): string {
  const past = history.slice(-12).map((t) => `${t.who === 'sultan' ? 'THE SULTAN' : 'YOU'}: ${t.text}`).join('\n');
  return `${past ? `THE AUDIENCE SO FAR:\n${past}\n\n` : ''}THE SULTAN NOW SAYS:\n"""${text.slice(0, 1500)}"""\n\nReply as yourself.`;
}
