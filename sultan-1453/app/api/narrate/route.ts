// POST {state, chronicle} → streamed narration text, then "\0WARNINGS" + JSON array of audit warnings.
import { narrateMonth } from '../../../src/llm/narrate';
import type { GameState } from '../../../src/engine/types';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { state, chronicle } = (await req.json()) as { state: GameState; chronicle?: string[] };
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const res = await narrateMonth(state, {
        chronicle: Array.isArray(chronicle) ? chronicle.slice(-2) : [],
        onText: (t) => controller.enqueue(enc.encode(t)),
        signal: req.signal,
      });
      controller.enqueue(enc.encode(`\u0000WARNINGS${JSON.stringify(res.warnings)}`));
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}
