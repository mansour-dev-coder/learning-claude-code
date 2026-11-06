// Claude client configuration for the LLM layer.
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
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

const here = dirname(fileURLToPath(import.meta.url));
const cache = new Map<string, string>();
export function prompt(name: 'game_master' | 'ministers' | 'parser'): string {
  if (!cache.has(name)) cache.set(name, readFileSync(join(here, 'prompts', `${name}.md`), 'utf8'));
  return cache.get(name)!;
}
