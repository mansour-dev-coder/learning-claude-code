// Server side of a private audience (Next.js route, CLI). Read-only: returns the courtier's words.
import type { GameState } from '../engine/types';
import { MODEL, getClient, prompt, type Client } from './client';
import { audienceBrief, audienceInput, type Speaker, type Turn } from './converse';

export async function converse(state: GameState, sp: Speaker, history: Turn[], text: string, opts: { client?: Client; onText?: (t: string) => void } = {}): Promise<string> {
  const client = opts.client ?? getClient();
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 1500,
    output_config: { effort: 'low' },
    system: [
      { type: 'text', text: `${prompt('audience')}\n\n${prompt('ministers')}`, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: audienceBrief(state, sp) },
    ],
    messages: [{ role: 'user', content: audienceInput(history, text) }],
  });
  let out = '';
  for await (const ev of stream) if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') { out += ev.delta.text; opts.onText?.(ev.delta.text); }
  return out.trim();
}
