// Post-hoc check on narration: every figure the narrator writes must come from its sources.
// The engine never reads narration, so a slip cannot corrupt state, but the player should not be misled.

const SCALE: Record<string, number> = { m: 1e6, million: 1e6, k: 1e3, thousand: 1e3 };
const NUM = /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(m\b|million\b|k\b|thousand\b)?/gi;

function numbers(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(NUM)) {
    const base = Number(m[1].replace(/,/g, ''));
    const mult = m[2] ? SCALE[m[2].toLowerCase()] : 1;
    if (Number.isFinite(base)) out.push(base * mult);
  }
  return out;
}

/** Numbers in `text` (excluding small counts, ordinals and years) that appear in none of `sources`. */
export function auditNarration(text: string, sources: string[]): string[] {
  const allowed = sources.flatMap(numbers);
  const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.03);
  const warnings: string[] = [];
  const seen = new Set<number>();
  for (const n of numbers(text)) {
    if (n <= 31 || (n >= 1300 && n <= 1600 && Number.isInteger(n)) || seen.has(n)) continue;
    seen.add(n);
    if (!allowed.some((a) => close(n, a))) warnings.push(`narrator used a figure not in the engine's report: ${n.toLocaleString()}`);
  }
  return warnings;
}
