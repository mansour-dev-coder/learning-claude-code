// Free text → engine Actions via tool use. The model only PROPOSES orders. They are validated here against
// the tool schema, then dry-run through the engine on a throwaway copy so the Sultan sees what will be
// refused before he ends the month. Nothing here mutates the real GameState.
import Anthropic from '@anthropic-ai/sdk';
import type { GameState } from '../engine/types';
import type { Action } from '../engine/actions';
import { describeAction } from '../engine/actions';
import { ACTION_TOOLS, toolCallToAction } from './actionTools';
import { ordersSheet } from './context';
import { MODEL, getClient, prompt, type Client } from './client';

export interface ParsedOrders {
  actions: Action[];
  /** the court secretary's confirmation or clarifying question */
  reply: string;
  /** tool calls the model made that failed validation even after one correction round */
  invalid: { tool: string; error: string }[];
  source: 'claude' | 'unavailable';
}

export async function parseCommand(state: GameState, text: string, opts: { client?: Client; pending?: Action[] } = {}): Promise<ParsedOrders> {
  const client = opts.client ?? getClient();
  const already = opts.pending?.length ? `\nORDERS ALREADY RECORDED THIS MONTH (do not repeat them): ${opts.pending.map(describeAction).join('; ')}` : '';
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: 'user', content: `${ordersSheet(state)}${already}\n\nTHE SULTAN SAYS:\n"""${text.slice(0, 4000)}"""` },
  ];
  const request = (msgs: Anthropic.Beta.BetaMessageParam[]) =>
    client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: 'low' },
      system: [{ type: 'text', text: prompt('parser'), cache_control: { type: 'ephemeral' } }],
      tools: ACTION_TOOLS,
      tool_choice: { type: 'auto' }, // forced tool use is not available on this model; the prompt steers it
      messages: msgs,
    });

  try {
    let res = await request(messages);
    if (res.stop_reason === 'refusal') return { actions: [], reply: 'The secretary could not record that order. Please rephrase it.', invalid: [], source: 'claude' };
    let { actions, invalid, reply } = collect(res.content);

    // One correction round: return per-call results, the bad ones as errors, and ask only for fixes.
    if (invalid.length && res.stop_reason !== 'max_tokens') {
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = res.content
        .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
        .map((b) => {
          const bad = invalid.find((x) => x.id === b.id);
          return { type: 'tool_result', tool_use_id: b.id, is_error: !!bad, content: bad ? `Invalid: ${bad.error}` : 'Recorded.' };
        });
      res = await request([...messages, { role: 'assistant', content: res.content }, { role: 'user', content: [...results, { type: 'text', text: 'Re-issue only the invalid orders, corrected. If you cannot, say what is unclear.' }] }]);
      const second = collect(res.content);
      actions = [...actions, ...second.actions];
      invalid = second.invalid;
      reply = [reply, second.reply].filter(Boolean).join(' ');
    }
    return { actions, reply: reply.trim(), invalid: invalid.map(({ tool, error }) => ({ tool, error })), source: 'claude' };
  } catch (err) {
    // Any failure to reach Claude (missing credentials raise a plain Error) degrades to buttons and shortcuts.
    const raw = err instanceof Error ? err.message : String(err);
    const msg = /authentication/i.test(raw) ? "no ANTHROPIC_API_KEY is set on the server" : raw;
    return { actions: [], reply: `The court secretary is unavailable (${msg.slice(0, 120)}). Use numbered choices like "1a 2c".`, invalid: [], source: 'unavailable' };
  }
}

function collect(content: Anthropic.Beta.BetaContentBlock[]) {
  const actions: Action[] = [];
  const invalid: { id: string; tool: string; error: string }[] = [];
  const text: string[] = [];
  for (const b of content) {
    if (b.type === 'text') text.push(b.text);
    if (b.type === 'tool_use') {
      const r = toolCallToAction(b.name, structuredClone(b.input));
      if (r.ok) actions.push(r.action);
      else invalid.push({ id: b.id, tool: b.name, error: r.error });
    }
  }
  return { actions, invalid, reply: text.join(' ') };
}

export { parseShortcuts, previewOrders, type PreviewLine } from './orders';
