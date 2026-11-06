// Pure text builders shared by the Node narrator and the browser edition (no SDK, no fs).
import type { GameState } from '../engine/types';
import { dilemmaSheet, divanRoster, monthSheet, realmSummary, LETTERS } from './context';
import { fmtDate } from '../engine/calendar';

export function narrationInput(s: GameState, chronicle: string[] = []): string {
  return [
    '# REALM', realmSummary(s), '',
    '# EVENTS', monthSheet(s.lastReport), '',
    '# THE DIVAN', divanRoster(s), '',
    '# DILEMMAS', dilemmaSheet(s), '',
    '# CHRONICLE (your recent narration, for continuity only)',
    chronicle.length ? chronicle.slice(-2).map((c) => c.slice(0, 1500)).join('\n---\n') : '(none yet)',
    '',
    s.status === 'active' ? `Narrate ${fmtDate(s.date)} now.` : `The reign has ended: ${s.statusReason}. Narrate it.`,
  ].join('\n');
}

/** Deterministic, LLM-free rendering: used offline, on refusals, and when the API is unreachable. */
export function plainNarration(s: GameState): string {
  const L: string[] = [`## ${fmtDate(s.date)}`, ''];
  const r = s.lastReport;
  if (r) {
    for (const d of r.decisions) L.push(`- ${d.dilemma}: ${d.option}${d.byDefault ? ' (by default)' : ''}`);
    for (const f of r.facts) if (!r.decisions.some((d) => f.startsWith(`${d.dilemma}: `))) L.push(`- ${f}`);
    for (const a of r.actionsRejected) L.push(`- Not carried out: ${a.reason}`);
  }
  if (s.status !== 'active') {
    L.push('', `**${s.statusReason}**`);
    return L.join('\n');
  }
  L.push('', '### The Divan');
  s.pendingDilemmas.forEach((d, i) => {
    L.push('', `**${i + 1}. ${d.title}** — ${d.presenterName}`, d.brief);
    d.options.forEach((o, j) => L.push(`- **${LETTERS[j]})** ${o.available ? o.label : `~~${o.label}~~`} — ${o.summary}`));
  });
  return L.join('\n');
}

