// POST {state, text, pending} → {actions, reply}. Actions are validated proposals; the client's engine applies them.
import { parseCommand } from '../../../src/llm/parseCommand';
import type { GameState } from '../../../src/engine/types';
import type { Action } from '../../../src/engine/actions';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { state, text, pending } = (await req.json()) as { state: GameState; text: string; pending?: Action[] };
  if (typeof text !== 'string' || !text.trim()) return Response.json({ actions: [], reply: 'No orders given.' });
  const r = await parseCommand(state, text, { pending: Array.isArray(pending) ? pending : [] });
  return Response.json({ actions: r.actions, reply: [r.reply, ...r.invalid.map((i) => `✗ ${i.tool}: ${i.error}`)].filter(Boolean).join(' ') });
}
