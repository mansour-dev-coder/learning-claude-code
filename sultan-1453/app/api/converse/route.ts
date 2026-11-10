// POST {state, speaker, history, text} → streamed words of the courtier. Nothing in the game changes.
import { converse } from '../../../src/llm/audience';
import type { GameState } from '../../../src/engine/types';
import type { Speaker, Turn } from '../../../src/llm/converse';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { state, speaker, history, text } = (await req.json()) as { state: GameState; speaker: Speaker; history?: Turn[]; text: string };
  if (typeof text !== 'string' || !text.trim()) return new Response('', { status: 400 });
  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(ctrl) {
      try { await converse(state, speaker, Array.isArray(history) ? history : [], text, { onText: (t) => ctrl.enqueue(enc.encode(t)) }); }
      catch (e) { ctrl.enqueue(enc.encode(`\u0000ERROR ${process.env.ANTHROPIC_API_KEY ? (e as Error).message : 'no ANTHROPIC_API_KEY on the server'}`)); }
      ctrl.close();
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
