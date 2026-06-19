/**
 * run-model.ts
 * ------------
 * One-command generator for the "Sector Consensus vs My Model" workbook, for
 * any company. Ships three sector presets (Tech/SaaS, Consumer/Retail, Energy).
 *
 *   pnpm run-model              # build all three presets
 *   pnpm run-model saas         # build a single preset
 *   pnpm run-model energy --out ./heli.xlsx
 *
 * To build your own company, add a preset below (or import
 * `buildFinancialModel` and pass a `Partial<ModelConfig>` from your own code).
 */

import { dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFinancialModel, type ModelConfig } from './financial-model.js';

interface Preset {
  file: string;
  config: Partial<ModelConfig>;
}

const PRESETS: Record<string, Preset> = {
  // Tech/SaaS — high growth, high margin, net cash (this is the shipped default).
  saas: {
    file: 'Model_NIMB_TechSaaS.xlsx',
    config: {
      company: 'Nimbus Cloud Inc',
      ticker: 'NIMB',
      sector: 'Tech/SaaS',
      price: 45,
      shares: 100,
      netDebt: -150,
      nextEarnings: '2026-07-28',
      assumptions: {
        revGrowth: 0.16, growthFade: 0.03, ebitdaMargin: 0.26, niMargin: 0.135, fcfConv: 0.85,
        peerEvEbitda: 13, peerPe: 22, peerEvRev: 5, peerPs: 5,
      },
      consensus: {
        revenue: { prior: 1000, current: 1150, ntm: 1300 },
        ebitda: { prior: 250, current: 295, ntm: 340 },
        netIncome: { prior: 120, current: 150, ntm: 175 },
      },
    },
  },

  // Consumer/Retail — large revenue, thin margins, modest growth, net debt.
  retail: {
    file: 'Model_MMRT_Retail.xlsx',
    config: {
      company: 'MetroMart Retail',
      ticker: 'MMRT',
      sector: 'Consumer/Retail',
      price: 62,
      shares: 210,
      netDebt: 480,
      nextEarnings: '2026-08-20',
      assumptions: {
        revGrowth: 0.055, growthFade: 0.01, ebitdaMargin: 0.11, niMargin: 0.05, fcfConv: 0.55,
        peerEvEbitda: 9, peerPe: 15, peerEvRev: 0.9, peerPs: 0.8,
      },
      consensus: {
        revenue: { prior: 18000, current: 18900, ntm: 19800 },
        ebitda: { prior: 1980, current: 2079, ntm: 2178 },
        netIncome: { prior: 900, current: 945, ntm: 990 },
      },
    },
  },

  // Energy — capital heavy, high EBITDA margin, low growth, sizeable net debt.
  energy: {
    file: 'Model_HELI_Energy.xlsx',
    config: {
      company: 'Helios Energy',
      ticker: 'HELI',
      sector: 'Energy',
      price: 95,
      shares: 400,
      netDebt: 6000,
      nextEarnings: '2026-08-05',
      assumptions: {
        revGrowth: 0.035, growthFade: 0.01, ebitdaMargin: 0.45, niMargin: 0.18, fcfConv: 0.35,
        peerEvEbitda: 5.5, peerPe: 11, peerEvRev: 2.0, peerPs: 1.5,
      },
      consensus: {
        revenue: { prior: 22000, current: 22660, ntm: 23300 },
        ebitda: { prior: 9900, current: 10197, ntm: 10485 },
        netIncome: { prior: 3960, current: 4079, ntm: 4194 },
      },
    },
  },
};

const here = dirname(fileURLToPath(import.meta.url));

interface Args {
  names: string[];
  out?: string;
  ticker?: string;
  sector?: string;
  name?: string;
  capiq: boolean;
}

function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  const a: Args = { names: [], capiq: false };
  for (let i = 0; i < args.length; i++) {
    const x = args[i]!;
    if (x === '--out') a.out = args[++i];
    else if (x === '--ticker') a.ticker = args[++i];
    else if (x === '--sector') a.sector = args[++i];
    else if (x === '--name') a.name = args[++i];
    else if (x === '--capiq') a.capiq = true;
    else a.names.push(x);
  }
  return a;
}

async function main(): Promise<void> {
  const { names, out, ticker, sector, name, capiq } = parseArgs(process.argv);

  // Ticker mode: build one workbook for any company.
  //   pnpm run-model --ticker AAPL --capiq --sector "Tech/SaaS"
  if (ticker) {
    const config: Partial<ModelConfig> = {
      company: name ?? ticker,
      ticker,
      sector: sector ?? 'Other',
      dataSource: capiq ? 'capiq' : 'static',
    };
    const safe = ticker.replace(/[^A-Za-z0-9]/g, '_');
    const outPath = out
      ? isAbsolute(out) ? out : join(here, out)
      : join(here, `Model_${safe}${capiq ? '_CapIQ' : ''}.xlsx`);
    const bytes = await buildFinancialModel(outPath, config);
    console.log(
      `✓ ${ticker} (${config.sector}${capiq ? ', CapIQ live' : ''}) -> ${outPath}  (${bytes.byteLength.toLocaleString()} bytes)`,
    );
    if (capiq) {
      console.log('  Open in Excel with the S&P Capital IQ add-in — the =CIQ(...) cells will populate.');
    }
    return;
  }

  const which = names.length === 0 || names[0] === 'all' ? Object.keys(PRESETS) : names;

  for (const name of which) {
    const preset = PRESETS[name];
    if (!preset) {
      console.error(`Unknown preset "${name}". Available: ${Object.keys(PRESETS).join(', ')}, all`);
      process.exitCode = 1;
      continue;
    }
    const outPath =
      out && which.length === 1 ? (isAbsolute(out) ? out : join(here, out)) : join(here, preset.file);
    const bytes = await buildFinancialModel(outPath, preset.config);
    console.log(
      `✓ ${name.padEnd(7)} ${preset.config.company} (${preset.config.sector}) ` +
        `-> ${outPath}  (${bytes.byteLength.toLocaleString()} bytes)`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
