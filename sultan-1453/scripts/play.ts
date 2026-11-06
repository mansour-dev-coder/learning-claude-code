// npm run play -- [--scenario mehmed1451|murad1421|fictional] [--year 1470] [--seed 7] [--difficulty normal] [--offline]
// Terminal edition: Claude narrates and parses your orders; the engine decides. --offline needs no API key.
import { createInterface } from 'node:readline/promises';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createGame, resolveTurn, formatLedger, succeed, Rng, type Action, type GameState } from '../src/engine';
import { describeAction } from '../src/engine/actions';
import type { TurnCtx } from '../src/engine/state';
import type { ScenarioId } from '../src/engine/data/scenarios';
import { narrateMonth, plainNarration, parseCommand, parseShortcuts, previewOrders, realmSummary, MODEL } from '../src/llm';

const arg = (n: string, d?: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const offline = process.argv.includes('--offline') || !process.env.ANTHROPIC_API_KEY && !process.argv.includes('--online');
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

const HELP = `
Speak your orders in plain words ("pay the Janissaries the customary donative, cast twenty guns, and send Bayezid to Amasya"),
or pick options by number and letter: "1a 2c".
  /orders     list orders recorded this month      /undo   remove the last order
  /end        end the month (unanswered dilemmas take their default)
  /ledger     the Defterdar's report               /help   this help
  /save NAME  save to saves/NAME.json              /load NAME
  /quit`;

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let s: GameState = createGame({
    scenario: (arg('scenario', 'mehmed1451') as ScenarioId),
    seed: Number(arg('seed', String(Date.now() % 1e9))),
    difficulty: (arg('difficulty', 'normal') as 'normal'),
    fictional: { year: Number(arg('year', '1460')) },
  });
  const chronicle: string[] = [];
  console.log(bold('\nSULTAN: 1453') + dim(offline ? '  (offline: engine text, numbered choices)' : `  (narrator: ${MODEL})`));
  console.log(dim(HELP));

  const show = async () => {
    console.log('');
    if (offline) {
      console.log(plainNarration(s));
      return;
    }
    const res = await narrateMonth(s, { chronicle, onText: (t) => process.stdout.write(t) });
    console.log('');
    chronicle.push(res.text);
    for (const w of res.warnings) console.log(dim(`  ⚠ ${w}`));
    if (res.usage) console.log(dim(`  tokens: ${res.usage.input} in (+${res.usage.cacheRead} cached), ${res.usage.output} out`));
  };

  await show();
  let orders: Action[] = [];
  for (;;) {
    if (s.status !== 'active') {
      const ctx: TurnCtx = { s: structuredClone(s), rng: new Rng(s.rngState), facts: [] };
      const a = (await rl.question(bold('\nContinue as the successor? (y/n) '))).trim().toLowerCase();
      if (a.startsWith('y') && succeed(ctx)) {
        s = ctx.s;
        s.rngState = ctx.rng.state;
        // the new reign opens with its own Divan
        s = resolveTurn(s, []).state;
        await show();
        continue;
      }
      break;
    }
    const line = (await rl.question(bold('\nYour orders, my Sultan › '))).trim();
    if (!line) continue;
    if (line === '/quit') break;
    if (line === '/help') { console.log(HELP); continue; }
    if (line === '/ledger') { console.log(offline ? formatLedger(s, { truth: false }) : realmSummary(s)); continue; }
    if (line === '/orders') { console.log(orders.length ? orders.map((o, i) => `  ${i + 1}. ${describeAction(o)}`).join('\n') : '  none'); continue; }
    if (line === '/undo') { orders.pop(); continue; }
    if (line.startsWith('/save')) {
      mkdirSync('saves', { recursive: true });
      const f = `saves/${line.split(/\s+/)[1] ?? 'quick'}.json`;
      writeFileSync(f, JSON.stringify({ state: s, orders, chronicle }));
      console.log(dim(`  saved to ${f}`));
      continue;
    }
    if (line.startsWith('/load')) {
      const f = `saves/${line.split(/\s+/)[1] ?? 'quick'}.json`;
      if (!existsSync(f)) { console.log(`  no save at ${f}`); continue; }
      const data = JSON.parse(readFileSync(f, 'utf8'));
      s = data.state; orders = data.orders ?? []; chronicle.splice(0, chronicle.length, ...(data.chronicle ?? []));
      await show();
      continue;
    }
    if (line === '/end') {
      const { state, report } = resolveTurn(s, orders);
      for (const r of report.actionsRejected) console.log(dim(`  ✗ ${r.reason}`));
      s = state;
      orders = [];
      await show();
      continue;
    }

    let proposed = parseShortcuts(s, line);
    if (!proposed) {
      if (offline) { console.log('  Offline: use numbered choices like "1a 2b", or /help.'); continue; }
      const parsed = await parseCommand(s, line, { pending: orders });
      if (parsed.reply) console.log(`  ${parsed.reply}`);
      for (const bad of parsed.invalid) console.log(dim(`  ✗ ${bad.tool}: ${bad.error}`));
      proposed = parsed.actions;
    }
    // replace earlier answers to the same dilemma
    for (const p of proposed) if (p.type === 'resolveDilemma') orders = orders.filter((o) => !(o.type === 'resolveDilemma' && o.dilemmaId === p.dilemmaId));
    const preview = previewOrders(s, [...orders, ...proposed]).slice(orders.length);
    for (const p of preview) console.log(`  ${p.ok ? '✓' : '✗'} ${p.note}`);
    orders.push(...preview.filter((p) => p.ok).map((p) => p.action));
    console.log(dim(`  ${orders.length} order(s) recorded. /end to close the month.`));
  }
  rl.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
