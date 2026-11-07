// How the 3D client reaches Claude. Three implementations share one interface:
// - httpOracle: the Next.js API routes (server holds the API key)
// - the artifact's `sample` capability (web3d/artifact.ts)
// - offlineOracle: the engine's own plain chronicle, buttons and shortcuts only
import type { GameState } from '../engine/types';
import type { Action } from '../engine/actions';
import { plainNarration } from '../llm/sheets';
import { toolCallToAction } from '../llm/actionTools';
import type { CampaignProgress, MissionResult, MissionRun } from '../campaign/types';
import type { CinematicSpec } from './cinematic';

export interface NarrateResult { text: string; warnings: string[] }
export interface ParseResult { actions: Action[]; reply: string }

export interface Oracle {
  readonly online: boolean;
  narrate(state: GameState, chronicle: string[], onText: (text: string) => void): Promise<NarrateResult>;
  parse(state: GameState, text: string, pending: Action[]): Promise<ParseResult>;
}

/** The engine's own account of the month without the Divan (the HUD shows dilemmas as cards). */
export function plainChronicle(s: GameState) {
  const text = plainNarration(s).split('\n### The Divan')[0].trim();
  return text.includes('\n') ? text : `${text}\n\n*The Divan assembles. Your ministers await your word.*`;
}

export const offlineOracle: Oracle = {
  online: false,
  async narrate(s) { return { text: plainChronicle(s), warnings: [] }; },
  async parse() { return { actions: [], reply: 'Free-text orders need Claude. Use the Divan buttons, or type shortcuts like "1a 2c".' }; },
};

/** Next.js API routes: /api/narrate streams text; /api/orders returns parsed actions. */
export function httpOracle(base = ''): Oracle {
  return {
    online: true,
    async narrate(state, chronicle, onText) {
      try {
        const res = await fetch(`${base}/api/narrate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state, chronicle }) });
        if (!res.ok || !res.body) throw new Error(`narrator HTTP ${res.status}`);
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let text = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          text += dec.decode(value, { stream: true });
          const cut = text.indexOf('\u0000WARNINGS');
          onText(cut >= 0 ? text.slice(0, cut) : text);
        }
        const cut = text.indexOf('\u0000WARNINGS');
        const warnings = cut >= 0 ? (JSON.parse(text.slice(cut + 9)) as string[]) : [];
        return { text: cut >= 0 ? text.slice(0, cut) : text, warnings };
      } catch (e) {
        return { text: plainChronicle(state), warnings: [`The chronicler is unavailable (${(e as Error).message}); the plain chronicle is shown.`] };
      }
    },
    async parse(state, text, pending) {
      try {
        const res = await fetch(`${base}/api/orders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state, text, pending }) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { actions: { type: string }[]; reply: string };
        // re-validate on the client too: never trust the wire
        const actions: Action[] = [];
        for (const a of data.actions ?? []) {
          const { type, ...args } = a as { type: string } & Record<string, unknown>;
          const r = toolCallToAction(type, args);
          if (r.ok) actions.push(r.action);
        }
        return { actions, reply: data.reply ?? '' };
      } catch (e) {
        return { actions: [], reply: `The secretary is unavailable (${(e as Error).message}). Use the Divan buttons.` };
      }
    },
  };
}

export interface Storage3D {
  load(): Promise<SaveGame | null>;
  save(g: SaveGame): Promise<string>;
  loadProgress?(): Promise<CampaignProgress | null>;
  saveProgress?(p: CampaignProgress): Promise<void>;
}

export interface SaveGame {
  state: GameState;
  orders: Action[];
  chronicle: string[];
  narration: string;
  warnings: string[];
  /** set when playing a campaign mission */
  mission?: { id: string; run: MissionRun; tutorial: number; result?: MissionResult };
  /** a cinematic the player can watch for the month just resolved */
  watch?: CinematicSpec | null;
}

export function localStore(key = 'sultan1453.3d.save'): Storage3D {
  return {
    async load() {
      try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
    },
    async save(g) {
      try { localStorage.setItem(key, JSON.stringify({ ...g, chronicle: g.chronicle.slice(-2) })); return 'Saved on this device'; } catch { return 'Could not save'; }
    },
    async loadProgress() {
      try { const raw = localStorage.getItem(`${key}.campaign`); return raw ? JSON.parse(raw) : null; } catch { return null; }
    },
    async saveProgress(p) {
      try { localStorage.setItem(`${key}.campaign`, JSON.stringify(p)); } catch { /* storage unavailable */ }
    },
  };
}
