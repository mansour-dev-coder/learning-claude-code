// Streams the month's narration. Read-only: takes a frozen snapshot, returns prose. It cannot touch state.
import Anthropic from '@anthropic-ai/sdk';
import type { GameState } from '../engine/types';
import { FALLBACK, MODEL, getClient, prompt, type Client } from './client';
import { dilemmaSheet, divanRoster, monthSheet, realmSummary, LETTERS } from './context';
import { auditNarration } from './audit';
import { fmtDate } from '../engine/calendar';

export interface NarrationResult {
  text: string;
  /** numbers the narrator wrote that are not in its sources, or other rule breaks */
  warnings: string[];
  source: 'claude' | 'fallback';
  usage?: { input: number; cacheRead: number; cacheWrite: number; output: number };
}

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

export async function narrateMonth(
  state: GameState,
  opts: { chronicle?: string[]; onText?: (delta: string) => void; client?: Client; signal?: AbortSignal } = {},
): Promise<NarrationResult> {
  const s = deepFreeze(structuredClone(state));
  const input = narrationInput(s, opts.chronicle);
  const client = opts.client ?? getClient();
  try {
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 64000,
        ...FALLBACK,
        output_config: { effort: 'medium' },
        system: [{ type: 'text', text: `${prompt('game_master')}\n\n${prompt('ministers')}`, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: input }],
      },
      { signal: opts.signal },
    );
    let text = '';
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        text += event.delta.text;
        opts.onText?.(event.delta.text);
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal' || !text.trim()) {
      const fb = plainNarration(s);
      opts.onText?.(`\n${fb}`);
      return { text: fb, warnings: [`narration declined (${final.stop_details?.category ?? 'no text'}); engine summary shown instead`], source: 'fallback' };
    }
    const u = final.usage;
    return {
      text,
      warnings: auditNarration(text, [input]),
      source: 'claude',
      usage: { input: u.input_tokens, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, output: u.output_tokens },
    };
  } catch (err) {
    // any SDK failure (auth, rate limit, network, missing credentials) degrades to the engine's own summary
    if (err instanceof Anthropic.AnthropicError) {
      const fb = plainNarration(s);
      opts.onText?.(fb);
      return { text: fb, warnings: [`narrator unavailable: ${(err as Error).message}`], source: 'fallback' };
    }
    throw err;
  }
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

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}
