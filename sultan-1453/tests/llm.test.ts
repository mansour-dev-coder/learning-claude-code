import { describe, expect, it } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { createGame, resolveTurn, computeBudget } from '../src/engine';
import { ACTION_TOOLS, toolCallToAction, ACTION_SPECS } from '../src/llm/actionTools';
import { realmSummary, ordersSheet } from '../src/llm/context';
import { parseCommand, parseShortcuts, previewOrders } from '../src/llm/parseCommand';
import { narrateMonth, narrationInput } from '../src/llm/narrate';
import { auditNarration } from '../src/llm/audit';
import { fmtAkce } from '../src/engine/state';
import type { Client } from '../src/llm/client';

const game = () => createGame({ scenario: 'mehmed1451', seed: 42 });

// ── fakes standing in for the Anthropic client (no network in tests) ──────────
function fakeCreate(responses: Partial<Anthropic.Beta.BetaMessage>[], calls: unknown[] = []): Client {
  let i = 0;
  return { beta: { messages: { create: async (params: unknown) => { calls.push(params); return { stop_reason: 'tool_use', ...responses[Math.min(i++, responses.length - 1)] }; } } } } as unknown as Client;
}
function fakeStream(text: string, stop: string = 'end_turn'): Client {
  const events = [...text.match(/.{1,40}/gs)!].map((t) => ({ type: 'content_block_delta', delta: { type: 'text_delta', text: t } }));
  return {
    beta: { messages: { stream: () => ({
      async *[Symbol.asyncIterator]() { yield* events; },
      finalMessage: async () => ({ stop_reason: stop, stop_details: stop === 'refusal' ? { category: 'test' } : null, usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 5, cache_creation_input_tokens: 0 } }),
    }) } },
  } as unknown as Client;
}
const toolUse = (name: string, input: object, id = `tu_${name}`) => ({ type: 'tool_use', id, name, input });

describe('order tools', () => {
  it('cover every engine action and are strict-schema compliant', () => {
    const names = ACTION_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('resolveDilemma');
    expect(names).not.toContain('endTurn');
    let optional = 0;
    for (const t of ACTION_TOOLS) {
      expect(t.strict).toBe(true);
      const schema = t.input_schema as unknown as { additionalProperties: boolean; required: string[]; properties: Record<string, unknown> };
      expect(schema.additionalProperties).toBe(false);
      for (const r of schema.required) expect(schema.properties).toHaveProperty(r);
      optional += Object.keys(schema.properties).length - schema.required.length;
    }
    // stays inside the API's strict-mode budget for optional parameters across all tools
    expect(optional).toBeLessThanOrEqual(24);
    expect(ACTION_SPECS.length).toBe(ACTION_TOOLS.length);
  });

  it('re-validates model output at the boundary', () => {
    expect(toolCallToAction('castCannon', { guns: 20 })).toEqual({ ok: true, action: { type: 'castCannon', guns: 20 } });
    expect(toolCallToAction('appointPrince', { princeId: 'bayezid' })).toEqual({ ok: true, action: { type: 'appointPrince', princeId: 'bayezid', province: null } });
    expect(toolCallToAction('castCannon', { guns: 2.5 }).ok).toBe(false);
    expect(toolCallToAction('declareWar', { target: 'france', casusBelli: 'x' }).ok).toBe(false);
    expect(toolCallToAction('setTax', { tax: 'cizye', value: 40, extra: 1 }).ok).toBe(false);
    expect(toolCallToAction('conjureGold', {}).ok).toBe(false);
    expect(toolCallToAction('enactLaw', {}).ok).toBe(false);
  });
});

describe('what the LLM is allowed to see', () => {
  it('gets the Defterdar’s reported books, not the hidden truth', () => {
    const s = game();
    expect(s.ministers.defterdar.agenda).toBe('embezzle');
    const truth = computeBudget(s);
    const sheet = realmSummary(s);
    expect(sheet).not.toMatch(/shrinkage|Unaccounted/i);
    expect(sheet).not.toContain(fmtAkce(truth.totalRevenue));
    const input = narrationInput(s);
    expect(input).toContain('SECRET agenda'); // narrator may colour speech…
    expect(ordersSheet(s)).not.toContain('SECRET'); // …but the order parser never sees agendas
  });
});

describe('parseCommand', () => {
  it('turns tool calls into validated actions', async () => {
    const s = game();
    const d = s.pendingDilemmas[0];
    const calls: unknown[] = [];
    const client = fakeCreate([{ content: [toolUse('resolveDilemma', { dilemmaId: d.id, optionId: d.options[1].id }), toolUse('castCannon', { guns: 20 }), { type: 'text', text: 'It is recorded, my Sultan.' }] as never }], calls);
    const r = await parseCommand(s, 'customary donative and twenty guns', { client });
    expect(r.actions).toEqual([{ type: 'resolveDilemma', dilemmaId: d.id, optionId: d.options[1].id }, { type: 'castCannon', guns: 20 }]);
    expect(r.reply).toContain('recorded');
    const params = calls[0] as { model: string; tool_choice: { type: string }; tools: unknown[]; fallbacks?: unknown; betas?: unknown };
    expect(params.model).toBe('claude-sonnet-5-5');
    expect(params.tool_choice.type).toBe('auto');
    // no re-routing of declined requests to another model
    expect(params.fallbacks).toBeUndefined();
    expect(params.betas).toBeUndefined();
  });

  it('sends invalid calls back once for correction', async () => {
    const s = game();
    const calls: unknown[] = [];
    const client = fakeCreate([{ content: [toolUse('castCannon', { guns: 'twenty' })] as never }, { content: [toolUse('castCannon', { guns: 20 }, 'tu2')] as never }], calls);
    const r = await parseCommand(s, 'twenty guns', { client });
    expect(calls.length).toBe(2);
    expect(r.actions).toEqual([{ type: 'castCannon', guns: 20 }]);
    expect(r.invalid).toEqual([]);
  });

  it('degrades gracefully when the API is unavailable', async () => {
    const client = { beta: { messages: { create: async () => { throw new Anthropic.APIConnectionError({ message: 'offline' }); } } } } as unknown as Client;
    const r = await parseCommand(game(), 'anything', { client });
    expect(r.source).toBe('unavailable');
    expect(r.actions).toEqual([]);
  });

  it('shortcut syntax and dry-run preview', () => {
    const s = game();
    const a = parseShortcuts(s, '1a 2b')!;
    expect(a).toHaveLength(2);
    expect(parseShortcuts(s, 'pay them')).toBeNull();
    const preview = previewOrders(s, [...a, { type: 'castCannon', bombards: 1 }, { type: 'startCampaign', target: 'constantinople' }]);
    expect(preview.slice(0, 2).every((p) => p.ok)).toBe(true);
    expect(preview[2].ok).toBe(false); // no master founder yet
    expect(preview[3].note).toMatch(/not at war/i);
    expect(s.treasury).toBe(game().treasury); // the real state is untouched
  });
});

describe('narrateMonth', () => {
  it('streams text, never mutates state, and flags invented figures', async () => {
    const s = resolveTurn(game(), []).state;
    const before = JSON.stringify(s);
    let streamed = '';
    const r = await narrateMonth(s, { client: fakeStream('## March 1451\nThe Defterdar counted 9,999,999 akçe that no ledger records.'), onText: (t) => (streamed += t) });
    expect(r.source).toBe('claude');
    expect(streamed).toBe(r.text);
    expect(r.warnings.join(' ')).toContain('9,999,999');
    expect(JSON.stringify(s)).toBe(before);
  });

  it('falls back to the engine’s own text on a refusal', async () => {
    const s = game();
    const r = await narrateMonth(s, { client: fakeStream('x', 'refusal') });
    expect(r.source).toBe('fallback');
    expect(r.text).toContain(s.pendingDilemmas[0].title);
  });

  it('audit accepts figures that are in the sources', () => {
    expect(auditNarration('The corps of 5,000 men demands 1.88M akçe in 1451.', ['5,000 Janissaries; 1,875,000 akçe'])).toEqual([]);
  });
});
