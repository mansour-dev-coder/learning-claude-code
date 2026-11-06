// Pure order helpers shared by the Node parser and the browser edition.
import type { GameState } from '../engine/types';
import type { Action } from '../engine/actions';
import { applyAction } from '../engine/actions';
import { Rng } from '../engine/rng';
import type { TurnCtx } from '../engine/state';

/** Offline / shortcut syntax: "1a 2c" picks options by dilemma number and letter. */
export function parseShortcuts(state: GameState, text: string): Action[] | null {
  const tokens = text.trim().toLowerCase().split(/[\s,;]+/).filter(Boolean);
  if (!tokens.length || !tokens.every((t) => /^\d+[a-h]$/.test(t))) return null;
  const out: Action[] = [];
  for (const t of tokens) {
    const d = state.pendingDilemmas[Number(t.slice(0, -1)) - 1];
    const o = d?.options['abcdefgh'.indexOf(t.slice(-1))];
    if (!d || !o) return null;
    out.push({ type: 'resolveDilemma', dilemmaId: d.id, optionId: o.id });
  }
  return out;
}

export interface PreviewLine {
  action: Action;
  ok: boolean;
  note: string;
}

/**
 * Dry-run orders against a throwaway copy, in sequence (so treasury limits chain).
 * Outcomes that depend on dice (peace offers) are masked, so a preview cannot be used to peek at a roll.
 */
export function previewOrders(state: GameState, actions: Action[]): PreviewLine[] {
  const s = structuredClone(state);
  const ctx: TurnCtx = { s, rng: new Rng(0x5eed), facts: [] };
  return actions.map((a) => {
    const r = applyAction(ctx, a);
    if (a.type === 'offerPeace' && r.ok && !r.summary?.startsWith('peace rejected: ')) return { action: a, ok: true, note: 'terms will be put to the envoys' };
    return { action: a, ok: r.ok, note: r.ok ? (r.summary ?? 'ok') : (r.reason ?? 'refused') };
  });
}
