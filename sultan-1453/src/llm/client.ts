// Claude client configuration for the LLM layer.
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Model for narration and order parsing (per the project brief). Override with SULTAN_MODEL. */
export const MODEL = process.env.SULTAN_MODEL ?? 'claude-sonnet-5-5';

export type Client = Pick<Anthropic, 'beta'>;

let shared: Anthropic | null = null;
/** Lazily constructed so the engine and tests never need credentials. Reads ANTHROPIC_API_KEY (or an `ant auth login` profile). */
export function getClient(): Anthropic {
  shared ??= new Anthropic();
  return shared;
}

const cache = new Map<string, string>();
/** Prompts live in src/llm/prompts. Look beside this module first (tsx/vitest), then from the project root (Next.js bundles). */
export function prompt(name: 'game_master' | 'ministers' | 'parser'): string {
  if (!cache.has(name)) {
    const candidates = [join(process.cwd(), 'src', 'llm', 'prompts', `${name}.md`)];
    try { candidates.unshift(join(dirname(fileURLToPath(import.meta.url)), 'prompts', `${name}.md`)); } catch { /* bundled */ }
    const file = candidates.find((f) => existsSync(f));
    if (!file) throw new Error(`prompt ${name}.md not found`);
    cache.set(name, readFileSync(file, 'utf8'));
  }
  return cache.get(name)!;
}
