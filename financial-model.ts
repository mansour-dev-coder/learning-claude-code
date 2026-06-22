/**
 * financial-model.ts
 * ------------------
 * Builds "Sector_Consensus_vs_My_Model.xlsx" — a reusable, multi-sector
 * equity research master template that compares Market Consensus vs. My Model
 * for Revenue / EBITDA / Net Income plus sector-specific KPIs, with valuation
 * multiples, a full DCF, sensitivity & scenarios, and charts.
 *
 * Everything is driven by live Excel formulas and a single sector dropdown
 * (`SelectedSector`). Change the dropdown or any Inputs value and the whole
 * model — KPIs, cards, valuation, DCF, charts — recomputes.
 *
 * Built entirely with the @mog-sdk/node headless engine. Run with:
 *   pnpm model
 */

import {
  createWorkbook,
  type Workbook,
  type Worksheet,
} from '@mog-sdk/node';
import type { CellFormat } from '@mog-sdk/contracts/core';
import type { ValidationRule, CFRuleInput, CFValueType } from '@mog-sdk/contracts/api';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';

// Precise local shape for conditional-format inputs. The SDK's CFRuleInput is a
// (lossy) Omit-union, so we model the variants we use and let them flow into it.
type CFStyleInput = {
  backgroundColor?: string;
  fontColor?: string;
  bold?: boolean;
  italic?: boolean;
  numberFormat?: string;
};
type CFPoint = { type: CFValueType; value?: number | string; color: string };
type CFInput =
  | { type: 'cellValue'; operator: 'greaterThan' | 'lessThan' | 'greaterThanOrEqual' | 'lessThanOrEqual' | 'equal' | 'notEqual' | 'between' | 'notBetween'; value1: number | string; value2?: number | string; style: CFStyleInput }
  | { type: 'formula'; formula: string; style: CFStyleInput }
  | { type: 'colorScale'; colorScale: { minPoint: CFPoint; midPoint?: CFPoint; maxPoint: CFPoint } };

// CFInput[] is structurally assignable to the SDK's CFRuleInput[] parameter.
const asRules = (rules: CFInput[]): CFRuleInput[] => rules as unknown as CFRuleInput[];

// ---------------------------------------------------------------------------
// Palette & number formats
// ---------------------------------------------------------------------------

const C = {
  navy: '#1F3864',
  blue: '#2E5C9A',
  header: '#305496',
  lightBlue: '#D9E1F2',
  paleBlue: '#EAF0FA',
  cardBg: '#F2F6FC',
  white: '#FFFFFF',
  greenBg: '#C6EFCE',
  greenFg: '#006100',
  redBg: '#FFC7CE',
  redFg: '#9C0006',
  amberBg: '#FFEB9C',
  amberFg: '#9C6500',
  gray: '#BFBFBF',
  ink: '#1A1A1A',
};

const NF = {
  usd: '$#,##0.0',
  usd2: '$#,##0.00',
  num1: '#,##0.0',
  int: '#,##0',
  pct: '0.0%',
  pct0: '0%',
  mult: '0.0"x"',
  date: 'MMM D, YYYY',
};

const thinBorder = { style: 'thin' as const, color: C.gray };

// ---------------------------------------------------------------------------
// Sector KPI templates (5 KPIs per sector; units carried in the label)
// ---------------------------------------------------------------------------

const SECTORS = [
  'Tech/SaaS',
  'Consumer/Retail',
  'Healthcare/Biotech',
  'Industrials',
  'Financials',
  'Energy',
  'Other',
] as const;

// names[sector] and values[sector], 5 rows each, aligned by slot.
const KPI: Record<string, { names: string[]; values: number[] }> = {
  'Tech/SaaS': {
    names: ['ARR ($M)', 'Net Rev Retention (%)', 'Rule of 40 (%)', 'Gross Margin (%)', 'CAC Payback (mo)'],
    values: [1200, 118, 46, 78, 14],
  },
  'Consumer/Retail': {
    names: ['Same-Store Sales (%)', 'Gross Margin (%)', 'Inventory Turns (x)', 'Store Count (#)', 'Online Mix (%)'],
    values: [4.5, 42, 5.2, 1450, 31],
  },
  'Healthcare/Biotech': {
    names: ['R&D % of Rev (%)', 'Pipeline Assets (#)', 'Patients (k)', 'Gross Margin (%)', 'Cash Runway (mo)'],
    values: [22, 12, 340, 74, 28],
  },
  Industrials: {
    names: ['Book-to-Bill (x)', 'Capacity Util (%)', 'Backlog ($M)', 'Operating Margin (%)', 'ROIC (%)'],
    values: [1.08, 84, 2300, 16, 13],
  },
  Financials: {
    names: ['Net Interest Margin (%)', 'Efficiency Ratio (%)', 'ROE (%)', 'Tier 1 Capital (%)', 'Loan Growth (%)'],
    values: [3.2, 58, 13.5, 12.2, 7],
  },
  Energy: {
    names: ['Production (mboe/d)', 'Realized ($/boe)', 'Lifting Cost ($/boe)', 'Reserve Life (yr)', 'FCF Yield (%)'],
    values: [520, 68, 12.5, 9.4, 11],
  },
  Other: {
    names: ['Revenue Growth (%)', 'Gross Margin (%)', 'Operating Margin (%)', 'FCF Margin (%)', 'ROIC (%)'],
    values: [12, 55, 20, 18, 14],
  },
};

// Sector-default comp sets (fallback if CapIQ's auto comp set isn't available).
const DEFAULT_PEERS: Record<string, string[]> = {
  'Tech/SaaS': ['CRWD', 'PANW', 'ZS', 'NET', 'DDOG', 'SNOW', 'MDB', 'OKTA'],
  'Consumer/Retail': ['WMT', 'COST', 'TGT', 'HD', 'LOW', 'TJX', 'DG', 'KR'],
  'Healthcare/Biotech': ['JNJ', 'MRK', 'ABBV', 'LLY', 'PFE', 'AMGN', 'GILD', 'BMY'],
  Industrials: ['HON', 'GE', 'CAT', 'DE', 'MMM', 'EMR', 'ETN', 'ITW'],
  Financials: ['JPM', 'BAC', 'WFC', 'C', 'GS', 'MS', 'USB', 'PNC'],
  Energy: ['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'PSX', 'MPC', 'OXY'],
  Other: ['', '', '', '', '', '', '', ''],
};

// Sample "Load Example Template" companies (editable on the Inputs sheet).
// [name, ticker, sector, price, shares(M), netDebt($M)]
const EXAMPLES: Array<[string, string, string, number, number, number]> = [
  ['Nimbus Cloud Inc', 'NIMB', 'Tech/SaaS', 45, 100, -150],
  ['MetroMart Retail', 'MMRT', 'Consumer/Retail', 62, 210, 480],
  ['Helios Energy', 'HELI', 'Energy', 95, 400, 6000],
];

// ---------------------------------------------------------------------------
// Per-company configuration (lets run-model.ts build any company)
// ---------------------------------------------------------------------------

export interface ModelAssumptions {
  revGrowth: number;
  growthFade: number;
  ebitdaMargin: number;
  niMargin: number;
  fcfConv: number;
  peerEvEbitda: number;
  peerPe: number;
  peerEvRev: number;
  peerPs: number;
}

/** A consensus line item: prior-FY actual, current-FY estimate, next-twelve-months. */
export interface ConsensusTriple {
  prior: number;
  current: number;
  ntm: number;
}

export interface ModelConfig {
  company: string;
  ticker: string;
  sector: string;
  price: number;
  shares: number;
  netDebt: number;
  nextEarnings: string;
  taxRate: number;
  assumptions: ModelAssumptions;
  consensus: { revenue: ConsensusTriple; ebitda: ConsensusTriple; netIncome: ConsensusTriple };
  /**
   * 'static'  — write the literal numbers above (default; works in any Excel).
   * 'capiq'   — write live S&P Capital IQ formulas keyed to `ticker`. The cells
   *             populate when opened in Excel with the CapIQ add-in; in this
   *             headless build they show #NAME? (only Excel+CapIQ can evaluate).
   */
  dataSource: 'static' | 'capiq';
}

// ---------------------------------------------------------------------------
// Capital IQ field map — every mnemonic in one place so you can adjust any
// that differ in your CapIQ environment. `scale` converts CapIQ units to the
// model's units ($M, decimal %, millions of shares).
// ---------------------------------------------------------------------------

export interface CapIqField {
  m: string;          // CapIQ mnemonic
  period?: string;    // period token, e.g. IQ_FY, 'IQ_FY-1', 'IQ_FY+1', IQ_NTM, IQ_LTM
  scale?: number;     // multiplier applied to the result
}

/**
 * CapIQ returns currency figures in this magnitude. Institutional templates
 * default to MILLIONS, so values already arrive in $M and need NO scaling
 * (CAPIQ_MAG = 1). If your CapIQ returns ACTUAL units instead, set 1e-6.
 */
export const CAPIQ_MAG = 1;
const MAGX = CAPIQ_MAG === 1 ? '' : `*${CAPIQ_MAG}`; // formula suffix for inline $ pulls
const PCT = 0.01; // CapIQ rates come back as whole percents (e.g. 21, 8.5) -> decimal

export const CAPIQ_FIELDS: Record<string, CapIqField> = {
  companyName: { m: 'IQ_COMPANY_NAME' },
  price: { m: 'IQ_LASTSALEPRICE' }, // last-traded (live); IQ_CLOSEPRICE is prior close
  // Shares are derived as MarketCap/Price (see src.shares); IQ_SHARESOUTSTANDING fallback.
  marketCap: { m: 'IQ_MARKETCAP', scale: CAPIQ_MAG }, // total market cap ($M)
  sharesDirect: { m: 'IQ_SHARESOUTSTANDING', scale: CAPIQ_MAG }, // fallback share count
  beta: { m: 'IQ_BETA' }, // levered beta (IFERROR-guarded)
  totalDebt: { m: 'IQ_TOTAL_DEBT', scale: CAPIQ_MAG }, // for equity/debt weights
  netDebt: { m: 'IQ_NET_DEBT', period: 'IQ_LTM', scale: CAPIQ_MAG },
  taxRate: { m: 'IQ_EFFECT_TAX_RATE', period: 'IQ_FY', scale: PCT }, // % -> decimal
  nextEarnings: { m: 'IQ_EST_NEXT_EARNINGS_DATE' }, // forward expected date
  epsEst: { m: 'IQ_EPS_EST', period: 'IQ_FY+1' },
  revPrior: { m: 'IQ_TOTAL_REV', period: 'IQ_FY', scale: CAPIQ_MAG },
  revCons: { m: 'IQ_REVENUE_EST', period: 'IQ_FY+1', scale: CAPIQ_MAG },
  revNtm: { m: 'IQ_REVENUE_EST', period: 'IQ_NTM', scale: CAPIQ_MAG },
  ebitdaPrior: { m: 'IQ_EBITDA', period: 'IQ_FY', scale: CAPIQ_MAG },
  ebitdaCons: { m: 'IQ_EBITDA_EST', period: 'IQ_FY+1', scale: CAPIQ_MAG },
  ebitdaNtm: { m: 'IQ_EBITDA_EST', period: 'IQ_NTM', scale: CAPIQ_MAG },
  niPrior: { m: 'IQ_NI', period: 'IQ_FY', scale: CAPIQ_MAG },
  niCons: { m: 'IQ_NI_EST', period: 'IQ_FY+1', scale: CAPIQ_MAG },
  niNtm: { m: 'IQ_NI_EST', period: 'IQ_NTM', scale: CAPIQ_MAG },
  // WACC build-up + valuation cross-checks (all IFERROR-guarded at the call site)
  riskFree: { m: 'IQ_RISK_FREE_RATE', scale: PCT },
  erp: { m: 'IQ_EQUITY_RISK_PREMIUM', scale: PCT },
  costDebt: { m: 'IQ_COST_DEBT', scale: PCT },
  priceTarget: { m: 'IQ_PRICE_TARGET' }, // consensus analyst target price
  high52: { m: 'IQ_HIGH_PRICE_52_WEEKS' },
  low52: { m: 'IQ_LOW_PRICE_52_WEEKS' },
  // --- EV-bridge enrichments (all IFERROR+0 guarded at the call site) ---------
  preferred: { m: 'IQ_PREF_EQUITY', scale: CAPIQ_MAG },           // preferred stock ($M)
  taxAssets: { m: 'IQ_DEF_TAX_ASSET_LT', scale: CAPIQ_MAG },      // non-current deferred tax assets ($M)
  divsPaid: { m: 'IQ_DIV_PAID_CF', period: 'IQ_FY', scale: CAPIQ_MAG }, // cash dividends ($M)
  intangAmort: { m: 'IQ_GW_INTAN_AMORT', period: 'IQ_FY', scale: CAPIQ_MAG }, // amort. of acquired intangibles ($M)
  // --- Historical financials (income statement + cash flow); period set per cell
  hRev: { m: 'IQ_TOTAL_REV', scale: CAPIQ_MAG },
  hGrossProfit: { m: 'IQ_GP', scale: CAPIQ_MAG },
  hSga: { m: 'IQ_SGA_SUPPL', scale: CAPIQ_MAG },                  // SG&A
  hRnd: { m: 'IQ_RD_EXP', scale: CAPIQ_MAG },                     // R&D
  hOpInc: { m: 'IQ_OPER_INC', scale: CAPIQ_MAG },
  hEbitda: { m: 'IQ_EBITDA', scale: CAPIQ_MAG },
  hDa: { m: 'IQ_DA', scale: CAPIQ_MAG },
  hSbc: { m: 'IQ_STOCK_BASED_COMP', scale: CAPIQ_MAG },
  hNi: { m: 'IQ_NI', scale: CAPIQ_MAG },
  hEps: { m: 'IQ_DILUT_EPS_EXCL' },                               // diluted EPS excl. extra
  hCfo: { m: 'IQ_CASH_OPER', scale: CAPIQ_MAG },                  // cash from operations
  hCapex: { m: 'IQ_CAPEX', scale: CAPIQ_MAG },
  // --- DuPont / PP&E roll inputs (IFERROR+0 guarded at call site) -------------
  totalAssets: { m: 'IQ_TOTAL_ASSETS', period: 'IQ_LTM', scale: CAPIQ_MAG },
  totalEquity: { m: 'IQ_TOTAL_COMMON_EQUITY', period: 'IQ_LTM', scale: CAPIQ_MAG },
  ebit: { m: 'IQ_EBIT', period: 'IQ_FY', scale: CAPIQ_MAG },
  ebt: { m: 'IQ_EBT', period: 'IQ_FY', scale: CAPIQ_MAG },
  netPPE: { m: 'IQ_NET_PPE', period: 'IQ_LTM', scale: CAPIQ_MAG },
  ltGrowth: { m: 'IQ_EST_LTG', scale: PCT },                      // consensus long-term growth (%, EPS) — terminal-g reference
  changeNWC: { m: 'IQ_CHANGE_NET_WORKING_CAPITAL', period: 'IQ_FY', scale: CAPIQ_MAG }, // ΔNWC actual ($M)
};

/**
 * Build a CapIQ Excel formula. `idRef` is the identifier token, inserted as-is:
 * pass a named range like `Ticker` (recommended — change one cell and every
 * formula re-pulls) or a quoted literal like `"AAPL"`.
 * e.g. =CIQ(Ticker,"IQ_TOTAL_REV",IQ_FY)*0.000001
 *
 * Pass `fallback` to wrap the pull in IFERROR(...). This is essential: if the
 * CapIQ add-in is missing, a mnemonic is wrong, or a value is unavailable, the
 * raw call returns #NAME?/#VALUE! and that error cascades through every
 * dependent formula (EV, margins, multiples, the DCF, the football field). A
 * fallback keeps the whole model computing on sensible defaults — live data
 * when CapIQ resolves, the static config value otherwise.
 *
 * For a NUMBER fallback the pull is additionally coerced with `+0`. The CapIQ
 * add-in returns a TEXT sentinel (e.g. "Data Unavailable", "NM") for some
 * fields rather than an Excel error, and IFERROR does NOT trap text — it would
 * flow into the cell and blow up the first downstream multiplication as
 * #VALUE!. `(CIQ(...))+0` forces numeric: a number stays a number, any text
 * becomes #VALUE! which IFERROR then catches and replaces with the fallback.
 */
export function ciq(idRef: string, f: CapIqField, fallback?: string | number): string {
  const args = f.period ? `${idRef},"${f.m}",${f.period}` : `${idRef},"${f.m}"`;
  const call = f.scale && f.scale !== 1 ? `CIQ(${args})*${f.scale}` : `CIQ(${args})`;
  if (fallback === undefined) return `=${call}`;
  if (typeof fallback === 'number') return `=IFERROR((${call})+0,${fallback})`;
  return `=IFERROR(${call},"${fallback}")`;
}

/** The shipped Tech/SaaS base case. `buildFinancialModel()` uses this by default. */
export const DEFAULT_CONFIG: ModelConfig = {
  company: 'Nimbus Cloud Inc',
  ticker: 'NIMB',
  sector: 'Tech/SaaS',
  price: 45,
  shares: 100,
  netDebt: -150,
  nextEarnings: '2026-07-28',
  taxRate: 0.21,
  assumptions: {
    revGrowth: 0.16,
    growthFade: 0.03,
    ebitdaMargin: 0.26,
    niMargin: 0.135,
    fcfConv: 0.85,
    peerEvEbitda: 13,
    peerPe: 22,
    peerEvRev: 5,
    peerPs: 5,
  },
  consensus: {
    revenue: { prior: 1000, current: 1150, ntm: 1300 },
    ebitda: { prior: 250, current: 295, ntm: 340 },
    netIncome: { prior: 120, current: 150, ntm: 175 },
  },
  dataSource: 'static',
};

/** Deep-merge a partial config onto the defaults. */
function resolveConfig(c: Partial<ModelConfig>): ModelConfig {
  return {
    ...DEFAULT_CONFIG,
    ...c,
    assumptions: { ...DEFAULT_CONFIG.assumptions, ...(c.assumptions ?? {}) },
    consensus: {
      revenue: { ...DEFAULT_CONFIG.consensus.revenue, ...(c.consensus?.revenue ?? {}) },
      ebitda: { ...DEFAULT_CONFIG.consensus.ebitda, ...(c.consensus?.ebitda ?? {}) },
      netIncome: { ...DEFAULT_CONFIG.consensus.netIncome, ...(c.consensus?.netIncome ?? {}) },
    },
  };
}

// ---------------------------------------------------------------------------
// Small styling helpers
// ---------------------------------------------------------------------------

async function put(ws: Worksheet, addr: string, value: string | number | null) {
  await ws.setCell(addr, value);
}

async function fmt(ws: Worksheet, range: string, f: CellFormat) {
  await ws.formats.setRange(range, f);
}

/** Merge a range only when it spans more than one cell. */
async function mergeRange(ws: Worksheet, range: string) {
  const [a, b] = range.split(':');
  if (b && a !== b) await ws.structure.merge(range);
}

/** Banner / sheet title across a merged range. */
async function banner(ws: Worksheet, range: string, text: string, bg = C.navy) {
  const anchor = range.split(':')[0]!;
  await put(ws, anchor, text);
  await mergeRange(ws, range);
  await fmt(ws, range, {
    bold: true,
    fontSize: 14,
    fontColor: C.white,
    backgroundColor: bg,
    horizontalAlign: 'left',
    verticalAlign: 'middle',
  });
}

/** Section header bar. */
async function section(ws: Worksheet, range: string, text: string) {
  const anchor = range.split(':')[0]!;
  await put(ws, anchor, text);
  await mergeRange(ws, range);
  await fmt(ws, range, {
    bold: true,
    fontSize: 11,
    fontColor: C.white,
    backgroundColor: C.header,
    horizontalAlign: 'left',
  });
}

// ---------------------------------------------------------------------------
// Chart helper
// ---------------------------------------------------------------------------

interface ChartSpec {
  ws: Worksheet;
  type: 'column' | 'bar' | 'line' | 'radar' | 'waterfall';
  title: string;
  series: Array<{ name: string; values: string; categories: string }>;
  anchorRow: number;
  anchorCol: number;
  width?: number;
  height?: number;
  valueAxisTitle?: string;
  dataLabels?: boolean;
}

/**
 * Add a chart with proper labels and position.
 * - Uses an explicit `series[]` (name/values/categories) — this is what
 *   survives the XLSX round-trip, so legend + category labels show in Excel.
 * - `add()` ignores the anchor, so we position with `update()` afterward
 *   (that anchor DOES persist to the file Excel opens).
 */
async function addChart(s: ChartSpec): Promise<void> {
  const chart = await s.ws.charts.add({
    type: s.type,
    anchorRow: 0,
    anchorCol: 0,
    width: s.width ?? 8,
    height: s.height ?? 14,
    title: s.title,
    series: s.series,
    legend: { show: true, visible: true, position: 'b' },
    axis: {
      categoryAxis: { visible: true },
      valueAxis: { visible: true, ...(s.valueAxisTitle ? { title: s.valueAxisTitle } : {}) },
    },
    ...(s.dataLabels ? { dataLabels: { show: true, showValue: true } } : {}),
  });
  await s.ws.charts.update(chart.id, { anchorRow: s.anchorRow, anchorCol: s.anchorCol });
}

// ---------------------------------------------------------------------------
// XLSX post-processing
//
// @mog-sdk/node 0.8.1's writer drops two things on export: (1) data-validation
// list dropdowns, and (2) the fill/font colors for cellIs/expression
// conditional-format rules (it emits <dxfs count="0"/> and no dxfId). We
// re-inject both directly into the OOXML so they work in Excel.
// ---------------------------------------------------------------------------

const DXFS =
  '<dxfs count="3">' +
  '<dxf><font><color rgb="FF006100"/></font><fill><patternFill><bgColor rgb="FFC6EFCE"/></patternFill></fill></dxf>' + // 0 green
  '<dxf><font><color rgb="FF9C0006"/></font><fill><patternFill><bgColor rgb="FFFFC7CE"/></patternFill></fill></dxf>' + // 1 red
  '<dxf><font><color rgb="FF9C6500"/></font><fill><patternFill><bgColor rgb="FFFFEB9C"/></patternFill></fill></dxf>' + // 2 amber
  '</dxfs>';

// sheet file -> list dropdowns to add (sheet order is fixed: 1=Dashboard, 2=Inputs)
function dropdownsFor(path: string): Array<{ sqref: string; values: string[] }> {
  if (path === 'xl/worksheets/sheet1.xml') return [{ sqref: 'G3', values: [...SECTORS] }];
  if (path === 'xl/worksheets/sheet2.xml') return [{ sqref: 'D19', values: ['Base', 'Bull', 'Bear'] }];
  return [];
}

/** Pick a dxfId for a conditional-format rule from its operator/formula. */
function cfDxfId(tag: string, formula?: string): number {
  if (/operator="(greaterThan|greaterThanOrEqual)"/.test(tag)) return 0; // green
  if (/operator="(lessThan|lessThanOrEqual)"/.test(tag)) return 1; // red
  if (/operator="between"/.test(tag)) return 2; // amber
  // Matches both ="BEAT" and >=BeatThresh (and the XML-escaped &gt;/&lt;).
  if (formula && /beat/i.test(formula)) return 0; // green
  if (formula && /miss/i.test(formula)) return 1; // red
  return -1;
}

function injectExcelFeatures(xlsx: Uint8Array): Uint8Array {
  const files = unzipSync(xlsx);
  const get = (p: string) => strFromU8(files[p]!);
  const set = (p: string, s: string) => { files[p] = strToU8(s); };

  // 1. styles.xml — replace the empty <dxfs count="0"/> with our 3 fills.
  if (files['xl/styles.xml']) {
    set('xl/styles.xml', get('xl/styles.xml').replace(/<dxfs count="0"\s*\/>/, DXFS));
  }

  // 2. each worksheet — add dxfId to cfRules + inject dataValidations.
  for (const path of Object.keys(files)) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(path)) continue;
    let s = get(path);

    // 2a. cellIs rules: add dxfId by operator.
    s = s.replace(/<cfRule\b[^>]*type="cellIs"[^>]*>/g, (tag) =>
      tag.includes('dxfId') ? tag : (() => { const id = cfDxfId(tag); return id < 0 ? tag : tag.replace('<cfRule ', `<cfRule dxfId="${id}" `); })());
    // 2b. expression rules: add dxfId by formula content.
    s = s.replace(/<cfRule type="expression"([^>]*)><formula>([^<]*)<\/formula>/g, (m, attrs: string, formula: string) => {
      if (/dxfId/.test(attrs)) return m;
      const id = cfDxfId('', formula);
      return id < 0 ? m : `<cfRule type="expression" dxfId="${id}"${attrs}><formula>${formula}</formula>`;
    });

    // 2c. dataValidations — insert after conditionalFormatting, before drawing/end.
    const dvs = dropdownsFor(path);
    if (dvs.length) {
      const xml =
        `<dataValidations count="${dvs.length}">` +
        dvs.map((d) => `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" sqref="${d.sqref}"><formula1>"${d.values.join(',')}"</formula1></dataValidation>`).join('') +
        `</dataValidations>`;
      let idx = -1;
      for (const mk of ['<hyperlinks', '<printOptions', '<pageMargins', '<drawing', '</worksheet>']) {
        const i = s.indexOf(mk);
        if (i >= 0 && (idx < 0 || i < idx)) idx = i;
      }
      s = s.slice(0, idx) + xml + s.slice(idx);
    }
    set(path, s);
  }

  // 3. workbook.xml — force a full recalc on open (so CapIQ + seeded formulas compute).
  if (files['xl/workbook.xml']) {
    let w = get('xl/workbook.xml');
    w = /<calcPr\b[^>]*\/>/.test(w)
      ? w.replace(/<calcPr\b[^>]*\/>/, '<calcPr calcId="0" fullCalcOnLoad="1"/>')
      : w.replace('</workbook>', '<calcPr calcId="0" fullCalcOnLoad="1"/></workbook>');
    set('xl/workbook.xml', w);
  }

  return zipSync(files);
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export async function buildFinancialModel(
  outPath: string,
  config: Partial<ModelConfig> = {},
): Promise<Uint8Array> {
  const cfg = resolveConfig(config);
  const a = cfg.assumptions;
  const wb = await createWorkbook();

  const dashboard = wb.activeSheet;
  await dashboard.setName('Dashboard');
  const inputs = await wb.sheets.add('Inputs');
  const consensus = await wb.sheets.add('Consensus');
  const myModel = await wb.sheets.add('MyModel');
  const valuation = await wb.sheets.add('Valuation');
  const scenarios = await wb.sheets.add('Scenarios');
  const charts = await wb.sheets.add('Charts');
  const sectorKpis = await wb.sheets.add('SectorKPIs');
  const comps = await wb.sheets.add('Comps');
  const financials = await wb.sheets.add('Financials');
  const quality = await wb.sheets.add('Quality');
  const capacity = await wb.sheets.add('CapacityBuild');

  // -- company identity (from config; defaults to the Tech/SaaS sample) ------
  const { company: coName, ticker, sector: coSector, price, shares, netDebt } = cfg;

  // In CapIQ mode, source cells hold live =CIQ(...) formulas that reference the
  // `Ticker` named range (the Ticker cell). Change that one cell -> all re-pull.
  const cap = cfg.dataSource === 'capiq';
  const F = CAPIQ_FIELDS;
  const TICK = 'Ticker'; // named range -> Inputs!$D$5 (added below)
  const src = {
    company: cap ? ciq(TICK, F.companyName!, coName) : coName,
    price: cap ? ciq(TICK, F.price!, price) : price,
    // MarketCap($M)/Price -> shares (M); falls back to direct share count, then
    // to the static config count if neither pull resolves. Each pull is coerced
    // (+0) so a text sentinel from CapIQ is trapped, not propagated.
    shares: cap ? `=IFERROR((CIQ(${TICK},"${F.marketCap!.m}")${MAGX}/Price)+0,IFERROR((CIQ(${TICK},"${F.sharesDirect!.m}")${MAGX})+0,${shares}))` : shares,
    netDebt: cap ? ciq(TICK, F.netDebt!, netDebt) : netDebt,
    taxRate: cap ? ciq(TICK, F.taxRate!, cfg.taxRate) : cfg.taxRate,
    nextEarnings: cap
      ? `=IFERROR(CIQ(${TICK},"${F.nextEarnings!.m}"),DATE(${cfg.nextEarnings.split('-').map(Number).join(',')}))`
      : cfg.nextEarnings,
  };

  // =========================================================================
  // Named ranges (single source of truth). Defined FIRST so every formula
  // written below resolves immediately — names must exist before referenced.
  // =========================================================================
  const names: [string, string][] = [
    ['Ticker', 'Inputs!$D$5'], ['FYEnd', 'Inputs!$D$12'],
    ['Price', 'Inputs!$D$6'], ['Shares', 'Inputs!$D$7'], ['NetDebt', 'Inputs!$D$8'],
    ['TaxRate', 'Inputs!$D$9'], ['RevGrowthMy', 'Inputs!$D$14'], ['GrowthFade', 'Inputs!$D$15'],
    ['EbitdaMarginMy', 'Inputs!$D$16'], ['NiMarginMy', 'Inputs!$D$17'], ['FcfConv', 'Inputs!$D$18'],
    ['ScenarioName', 'Inputs!$D$19'], ['ScenarioMult', 'Inputs!$D$20'],
    ['PeerEVEBITDA', 'Inputs!$D$23'], ['PeerPE', 'Inputs!$D$24'], ['PeerEVRev', 'Inputs!$D$25'], ['PeerPS', 'Inputs!$D$26'],
    ['RiskFree', 'Inputs!$D$29'], ['ERP', 'Inputs!$D$30'], ['Beta', 'Inputs!$D$31'], ['CostDebt', 'Inputs!$D$32'],
    ['WeightEquity', 'Inputs!$D$33'], ['WeightDebt', 'Inputs!$D$34'], ['TermGrowth', 'Inputs!$D$35'],
    ['BeatThresh', 'Inputs!$D$38'], ['MissThresh', 'Inputs!$D$39'], ['ReactSens', 'Inputs!$D$40'],
    ['CapexPct', 'Inputs!$D$52'], ['DaPct', 'Inputs!$D$53'], ['NwcPct', 'Inputs!$D$54'], ['SbcPct', 'Inputs!$D$55'],
    ['TermMargin', 'Inputs!$D$56'], ['SbcDeduct', 'Inputs!$D$57'], ['Minorities', 'Inputs!$D$58'], ['Associates', 'Inputs!$D$59'],
    ['Preferred', 'Inputs!$D$62'], ['TaxAssets', 'Inputs!$D$63'], ['DivsInNetDebt', 'Inputs!$D$64'],
    ['AnnualSBC', 'Inputs!$D$65'], ['Bridge', 'Inputs!$D$66'], ['SharesVal', 'Inputs!$D$67'], ['NRR', 'Quality!$C$11'],
    ['CapBuildRev', 'CapacityBuild!$C$14'],
    ['SelectedSector', 'Dashboard!$G$3'],
    ['SectorList', 'SectorKPIs!$C$3:$I$3'], ['KpiNames', 'SectorKPIs!$C$4:$I$8'], ['KpiValues', 'SectorKPIs!$C$11:$I$15'],
    ['PriorRev', 'Consensus!$C$4'], ['PriorEBITDA', 'Consensus!$C$5'], ['PriorNI', 'Consensus!$C$6'],
    ['ConsRev', 'Consensus!$D$4'], ['ConsEBITDA', 'Consensus!$D$5'], ['ConsNI', 'Consensus!$D$6'], ['ConsEPS', 'Consensus!$D$7'],
    ['RevMy', 'MyModel!$C$4'], ['EbitdaMy', 'MyModel!$C$5'], ['NiMy', 'MyModel!$C$6'], ['EpsMy', 'MyModel!$C$7'], ['FcfBase', 'MyModel!$C$8'],
    ['EV', 'Valuation!$C$4'], ['AvgImplied', 'Valuation!$C$15'], ['WACC', 'Valuation!$C$20'], ['FairValue', 'Valuation!$C$43'],
  ];
  for (const [n, ref] of names) await wb.names.add(n, ref);

  // =========================================================================
  // SectorKPIs — the dynamic backbone (lookup matrix for the dropdown)
  // =========================================================================
  await banner(sectorKpis, 'A1:I1', 'SECTOR KPI TEMPLATES  —  driven by SelectedSector');
  await put(sectorKpis, 'A3', 'KPI Names →');
  await fmt(sectorKpis, 'A3:A8', { bold: true, fontColor: C.blue });
  // sector header row C3:I3
  for (let s = 0; s < SECTORS.length; s++) {
    await put(sectorKpis, `${col(2 + s)}3`, SECTORS[s]!);
  }
  await fmt(sectorKpis, 'C3:I3', { bold: true, backgroundColor: C.lightBlue, horizontalAlign: 'center' });
  // names block C4:I8
  for (let s = 0; s < SECTORS.length; s++) {
    const names = KPI[SECTORS[s]!]!.names;
    for (let k = 0; k < 5; k++) await put(sectorKpis, `${col(2 + s)}${4 + k}`, names[k]!);
  }
  await put(sectorKpis, 'A10', 'KPI Values →');
  await fmt(sectorKpis, 'A10:A15', { bold: true, fontColor: C.blue });
  for (let s = 0; s < SECTORS.length; s++) await put(sectorKpis, `${col(2 + s)}10`, SECTORS[s]!);
  await fmt(sectorKpis, 'C10:I10', { bold: true, backgroundColor: C.lightBlue, horizontalAlign: 'center' });
  // values block C11:I15
  for (let s = 0; s < SECTORS.length; s++) {
    const values = KPI[SECTORS[s]!]!.values;
    for (let k = 0; k < 5; k++) await put(sectorKpis, `${col(2 + s)}${11 + k}`, values[k]!);
  }
  await fmt(sectorKpis, 'C11:I15', { numberFormat: NF.num1, horizontalAlign: 'center' });
  await sectorKpis.layout.setColumnWidths(rangeWidths(0, 9, 150));

  // =========================================================================
  // Inputs
  // =========================================================================
  await banner(inputs, 'A1:F1', 'INPUTS  —  edit anything; the model recomputes live');
  await inputs.layout.setColumnWidths([[0, 30], [1, 230], [2, 20], [3, 150], [4, 30], [5, 260]]);

  const I = async (row: number, label: string, value: string | number | null, nf?: string) => {
    await put(inputs, `B${row}`, label);
    await put(inputs, `D${row}`, value);
    await fmt(inputs, `B${row}`, { fontColor: C.ink });
    if (nf) await fmt(inputs, `D${row}`, { numberFormat: nf });
    await fmt(inputs, `D${row}`, { backgroundColor: C.cardBg, borders: { outline: true, top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder } });
  };

  await section(inputs, 'B3:D3', cap ? 'GENERAL  (live via S&P Capital IQ)' : 'GENERAL');
  await I(4, 'Company', src.company);
  await I(5, 'Ticker', ticker);
  await I(6, 'Current Price ($)', src.price, NF.usd2);
  await I(7, 'Shares Outstanding (M)', src.shares, NF.int);
  await I(8, 'Net Debt ($M)  [negative = net cash]', src.netDebt, NF.usd);
  await I(9, 'Tax Rate', src.taxRate, NF.pct);
  await I(10, 'Next Earnings Date', src.nextEarnings);
  await fmt(inputs, 'D10', { numberFormat: NF.date });
  await I(11, 'Selected Sector (from Dashboard)', '=SelectedSector');
  // Forecast anchor: the company's last-actual fiscal year-end DATE. Drives the
  // dynamic period headers (e.g. "Dec-2026") so projection columns reflect the
  // company's real reporting calendar & month-end — not generic 1..5.
  await I(12, 'Fiscal Year-End (last actual)', cap
    ? `=IFERROR(CIQ(${TICK},"IQ_PERIODDATE",IQ_FY),DATE(YEAR(TODAY())-1,12,31))`
    : '=DATE(YEAR(TODAY())-1,12,31)', 'mmm-yyyy');

  // In CapIQ mode, seed the operating assumptions from consensus so they adapt
  // to the ticker (still user-overridable — type a number to replace). Peer
  // multiples & FCF conversion stay manual judgment calls.
  await section(inputs, 'B13:D13', cap ? 'MY ASSUMPTIONS  (seeded from consensus — edit to express your view)' : 'MY ASSUMPTIONS');
  // FORWARD growth (NTM ÷ current consensus), capped to a sane band. The old
  // ConsRev/PriorRev−1 used the current-vs-prior ACTUAL move — i.e. growth that
  // already happened — as the forward rate, which explodes hyper-growth names
  // (NBIS: 530→3,444 → 550% → $1tn revenue by yr-4). NTM/current is the true
  // forward rate (NBIS ≈ 54%); capped [−50%, +100%] so no ticker can blow up.
  await I(14, 'Revenue Growth (Year 1, fwd)', cap ? '=MAX(MIN(Consensus!E4/ConsRev-1,1),-0.5)' : a.revGrowth, NF.pct);
  // Self-consistent fade: spread the gap between Year-1 growth and terminal over
  // the 4 remaining years so growth LANDS on terminal by Year 5 (was a flat house %).
  await I(15, 'Growth Fade (per year)  [=(Yr1 g − terminal)/4]', `=MAX((RevGrowthMy*ScenarioMult-TermGrowth)/4,0)`, NF.pct);
  await I(16, 'EBITDA Margin', cap ? '=MAX(MIN(ConsEBITDA/ConsRev,0.9),-0.5)' : a.ebitdaMargin, NF.pct);
  await I(17, 'Net Margin', cap ? '=ConsNI/ConsRev' : a.niMargin, NF.pct);
  // FCF conversion derived from history: actual FCF / EBITDA (Financials FY0),
  // manual-overridable; falls back to the house assumption if actuals absent.
  // Only meaningful when EBITDA is positive (FCF/EBITDA with both negative gave
  // NBIS a nonsense 1,899%); otherwise fall back to the house assumption. Capped.
  await I(18, 'FCF Conversion (FCF / EBITDA)', cap ? `=IF(Financials!E12>0,MAX(MIN(Financials!E23/Financials!E12,1.5),0),${a.fcfConv})` : a.fcfConv, NF.pct);
  await I(19, 'Scenario', 'Base');
  await I(20, 'Scenario Growth Multiplier', '=IF(ScenarioName="Bull",1.25,IF(ScenarioName="Bear",0.7,1))', NF.mult);

  // Valuation multiples: in CapIQ mode default to the stock's CURRENT trading
  // multiples (derived from live data — fully dynamic, no extra mnemonics). Edit
  // to apply a peer premium/discount.
  await section(inputs, 'B22:D22', cap ? 'VALUATION MULTIPLES  (live current — edit for peer premium)' : 'CONSENSUS / PEER MULTIPLES');
  await I(23, 'Peer EV/EBITDA', cap ? '=(Price*Shares+NetDebt)/ConsEBITDA' : a.peerEvEbitda, NF.mult);
  await I(24, 'Peer P/E', cap ? '=Price*Shares/ConsNI' : a.peerPe, NF.mult);
  await I(25, 'Peer EV/Revenue', cap ? '=(Price*Shares+NetDebt)/ConsRev' : a.peerEvRev, NF.mult);
  await I(26, 'Peer P/S', cap ? '=Price*Shares/ConsRev' : a.peerPs, NF.mult);

  // WACC: Beta is pulled (guarded), equity/debt weights derived from live market
  // cap & total debt. Risk-free, ERP, cost of debt are MARKET/HOUSE assumptions
  // (the same across every ticker) — left as inputs by design.
  await section(inputs, 'B28:D28', cap ? 'DCF / WACC  (live build-up; terminal growth = house)' : 'DCF / WACC');
  await I(29, 'Risk-free Rate', cap ? `=IFERROR(CIQ(${TICK},"${F.riskFree!.m}")*${PCT},0.042)` : 0.042, NF.pct);
  await I(30, 'Equity Risk Premium', cap ? `=IFERROR(CIQ(${TICK},"${F.erp!.m}")*${PCT},0.05)` : 0.05, NF.pct);
  await I(31, 'Beta', cap ? `=IFERROR((CIQ(${TICK},"${F.beta!.m}"))+0,1.1)` : 1.2, NF.num1);
  await I(32, 'Pre-tax Cost of Debt', cap ? `=IFERROR(CIQ(${TICK},"${F.costDebt!.m}")*${PCT},0.06)` : 0.06, NF.pct);
  await I(33, 'Weight — Equity', cap ? `=IFERROR((Price*Shares)/(Price*Shares+CIQ(${TICK},"${F.totalDebt!.m}")${MAGX}),0.85)` : 0.85, NF.pct);
  await I(34, 'Weight — Debt', cap ? '=1-WeightEquity' : 0.15, NF.pct);
  // Terminal growth anchored to CapIQ consensus long-term growth (IQ_EST_LTG),
  // but CAPPED at the risk-free rate so a perpetuity g can't exceed the economy's
  // long-run nominal growth. Falls back to the 3% house number.
  await I(35, 'Terminal Growth  (CapIQ LT g, capped at Rf)', cap ? `=IFERROR(MIN(CIQ(${TICK},"IQ_EST_LTG")*0.01,RiskFree),0.03)` : 0.03, NF.pct);

  await section(inputs, 'B37:D37', 'BEAT / MISS RULES (signal settings)');
  await I(38, 'Beat Threshold (surprise %)', 0.02, NF.pct);
  await I(39, 'Miss Threshold (surprise %)', -0.02, NF.pct);
  await I(40, 'Reaction Sensitivity (move per 1% surprise)', 8, NF.mult);

  await section(inputs, 'B42:D42', cap ? 'REAL-TIME DATA (live via Capital IQ)' : 'REAL-TIME DATA (placeholders — wire to a feed)');
  await I(43, 'Live Price', cap ? ciq(TICK, F.price!, price) : null, NF.usd2);
  await I(44, 'Live Consensus Revenue ($M)', cap ? ciq(TICK, F.revCons!, cfg.consensus.revenue.current) : null, NF.usd);
  await I(45, 'Live Consensus EPS', cap ? ciq(TICK, F.epsEst!, +(cfg.consensus.netIncome.current / shares).toFixed(2)) : null, NF.usd2);
  await I(46, 'Last Updated', cap ? '=TODAY()' : null);
  if (cap) {
    // Highlight the Ticker cell as the single editable driver.
    await fmt(inputs, 'D5', { backgroundColor: C.amberBg, fontColor: C.amberFg, bold: true, horizontalAlign: 'center', borders: { outline: true, top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder } });
    // Tint the HOUSE / SIGNAL assumption cells gold so it's obvious what is NOT
    // ticker-driven (these are the same for every company by design).
    const gold = '#FFF2CC';
    for (const r of [15, 18, 35, 38, 39, 40]) {
      await fmt(inputs, `D${r}`, { backgroundColor: gold });
    }
    await put(inputs, 'B48', '▶ DYNAMIC: change the Ticker cell (D5) and every company figure re-pulls from Capital IQ automatically.');
    await put(inputs, 'B49', 'Gold cells = global house/market assumptions (Rf, ERP, terminal growth, fade, FCF conv, signal rules) — set once, same for all tickers.');
    await put(inputs, 'B50', 'Open in Excel with the CapIQ add-in to populate. Each pull is IFERROR-guarded; if a value looks off, verify its mnemonic in CAPIQ_FIELDS.');
    await fmt(inputs, 'B48', { italic: true, bold: true, fontColor: C.greenFg });
    await fmt(inputs, 'B49:B50', { italic: true, fontColor: C.blue });
  }

  // Advanced DCF / FCF assumptions (proper unlevered FCF, margin ramp, SBC, EV bridge).
  await section(inputs, 'B51:D51', 'ADVANCED DCF / FCF');
  // Benchmark vs CURRENT consensus revenue (not the tiny prior-FY actual) and
  // cap, so capex/D&A intensity can't explode (NBIS capex was 767% of PriorRev).
  await I(52, 'Capex (% of revenue)', cap ? `=MIN(IFERROR(ABS(CIQ(${TICK},"IQ_CAPEX",IQ_FY))/ConsRev,0.05),1)` : 0.05, NF.pct);
  await I(53, 'D&A (% of revenue)', cap ? `=MIN(IFERROR(CIQ(${TICK},"IQ_DA",IQ_FY)/ConsRev,0.05),0.5)` : 0.05, NF.pct);
  // NWC intensity derived from history: actual ΔNWC / ΔRevenue (FY0 vs FY-1),
  // manual-overridable; falls back to 5% if actuals absent.
  await I(54, 'Change in NWC (% of ΔRevenue)', cap ? `=MAX(MIN(IFERROR(ABS(CIQ(${TICK},"IQ_CHANGE_NET_WORKING_CAPITAL",IQ_FY))/(Financials!E6-Financials!D6),0.05),0.3),-0.3)` : 0.05, NF.pct);
  await I(55, 'Stock-based comp (% of revenue)', cap ? `=MIN(IFERROR(CIQ(${TICK},"IQ_STOCK_BASED_COMP",IQ_FY)/ConsRev,0.03),0.3)` : 0.03, NF.pct);
  // Terminal EBITDA margin grounded in the actual FY0 EBITDA margin (max of the
  // current model margin and the historical margin); falls back to 30%.
  await I(56, 'Terminal EBITDA Margin', cap ? `=MAX(MIN(IFERROR(MAX(EbitdaMarginMy,Financials!E12/Financials!E6),0.3),0.6),0.05)` : 0.3, NF.pct);
  await I(57, 'Deduct SBC in FCF? (1=post-SBC, 0=pre-SBC)', 1, NF.int);
  await I(58, 'Minority Interest ($M)', cap ? `=IFERROR((CIQ(${TICK},"IQ_MINORITY_INTEREST"))+0,0)` : 0, NF.usd);
  await I(59, 'Associates / Investments ($M)', cap ? `=IFERROR((CIQ(${TICK},"IQ_INVEST_EQUITY_AFFIL"))+0,0)` : 0, NF.usd);
  if (cap) {
    const gold2 = '#FFF2CC';
    for (const r of [54, 56, 57]) await fmt(inputs, `D${r}`, { backgroundColor: gold2 }); // house assumptions
  }

  // EV-bridge enrichments + dilution-aware share count (the consistency rule:
  // if you DON'T expense SBC, you must dilute the share count instead).
  await section(inputs, 'B61:D61', cap ? 'EV BRIDGE & DILUTION (live)' : 'EV BRIDGE & DILUTION');
  await I(62, 'Preferred Stock ($M)', cap ? `=IFERROR((CIQ(${TICK},"${F.preferred!.m}"))+0,0)` : 0, NF.usd);
  await I(63, 'Tax Assets / NOLs ($M)', cap ? `=IFERROR((CIQ(${TICK},"${F.taxAssets!.m}"))+0,0)` : 0, NF.usd);
  await I(64, 'Dividends in Net Debt ($M)', cap ? `=IFERROR(ABS(CIQ(${TICK},"${F.divsPaid!.m}",IQ_FY))+0,0)` : 0, NF.usd);
  await I(65, 'Annual SBC ($M)', cap ? `=IFERROR((CIQ(${TICK},"IQ_STOCK_BASED_COMP",IQ_FY))+0,PriorRev*SbcPct)` : '=PriorRev*SbcPct', NF.usd);
  // Bridge: EV = MktCap + Bridge; Equity = EV - Bridge. One source of truth so
  // every valuation route (DCF, exit-multiple, sensitivity grid, comps) agrees.
  await I(66, 'EV→Equity Bridge ($M)  [computed]', '=NetDebt+Minorities+Preferred+DivsInNetDebt-Associates-TaxAssets', NF.usd);
  // Dilution-aware shares: post-SBC (SbcDeduct=1) -> today's shares; pre-SBC
  // (=0) -> add ~5yrs of SBC-funded dilution at the current price.
  await I(67, 'Shares for Valuation (M)  [computed]', '=Shares+IF(SbcDeduct=0,5*AnnualSBC/Price,0)', NF.int);
  await fmt(inputs, 'D66:D67', { backgroundColor: C.cardBg, italic: true });

  // Validation: scenario dropdown
  await inputs.validations.set('D19', listRule(['Base', 'Bull', 'Bear']));

  // "Load Example Template" reference table
  await section(inputs, 'F3:K3', 'LOAD EXAMPLE TEMPLATE');
  await put(inputs, 'F4', 'Copy a row into General to switch sample company:');
  await fmt(inputs, 'F4', { italic: true, fontColor: C.blue });
  await inputs.setRange('F6', [
    ['Company', 'Ticker', 'Sector', 'Price', 'Shares', 'NetDebt'],
    ...EXAMPLES.map((e) => [...e]),
  ]);
  await fmt(inputs, 'F6:K6', { bold: true, backgroundColor: C.lightBlue });
  await fmt(inputs, 'I7:I9', { numberFormat: NF.usd2 }); // Price
  await fmt(inputs, 'J7:J9', { numberFormat: NF.int }); // Shares
  await fmt(inputs, 'K7:K9', { numberFormat: NF.usd }); // Net Debt

  // =========================================================================
  // Consensus
  // =========================================================================
  await banner(consensus, 'A1:E1', 'MARKET CONSENSUS');
  await consensus.layout.setColumnWidths([[0, 30], [1, 200], [2, 150], [3, 150], [4, 150]]);
  const cn = cfg.consensus;
  // In CapIQ mode each figure is a live CIQ formula guarded by its static
  // consensus value, so the model still computes if a pull is unavailable;
  // otherwise the static number.
  const cq = (field: CapIqField, fallback: number) => (cap ? ciq(TICK, field, fallback) : fallback);
  await consensus.setRange('A3', [
    ['', 'Metric ($M)', 'Prior FY (Actual)', 'Current FY (Consensus)', 'NTM (Consensus)'],
    ['', 'Revenue', cq(F.revPrior!, cn.revenue.prior), cq(F.revCons!, cn.revenue.current), cq(F.revNtm!, cn.revenue.ntm)],
    ['', 'EBITDA', cq(F.ebitdaPrior!, cn.ebitda.prior), cq(F.ebitdaCons!, cn.ebitda.current), cq(F.ebitdaNtm!, cn.ebitda.ntm)],
    ['', 'Net Income', cq(F.niPrior!, cn.netIncome.prior), cq(F.niCons!, cn.netIncome.current), cq(F.niNtm!, cn.netIncome.ntm)],
  ]);
  if (cap) {
    await put(consensus, 'B9', 'Live S&P Capital IQ consensus — open in Excel with the CapIQ add-in to populate.');
    await fmt(consensus, 'B9', { italic: true, fontColor: C.blue });
  }
  await put(consensus, 'B7', 'EPS ($)');
  await put(consensus, 'C7', '=C6/Shares');
  await put(consensus, 'D7', '=D6/Shares');
  await put(consensus, 'E7', '=E6/Shares');
  await fmt(consensus, 'B3:E3', { bold: true, backgroundColor: C.header, fontColor: C.white });
  await fmt(consensus, 'C4:E6', { numberFormat: NF.usd });
  await fmt(consensus, 'C7:E7', { numberFormat: NF.usd2 });
  await fmt(consensus, 'B4:B7', { bold: true });

  // =========================================================================
  // MyModel
  // =========================================================================
  await banner(myModel, 'A1:D1', 'MY MODEL  —  projections from assumptions');
  await myModel.layout.setColumnWidths([[0, 30], [1, 200], [2, 160], [3, 320]]);
  await myModel.setRange('A3', [['', 'Metric ($M)', 'My Projection', 'Formula / Driver']]);
  await fmt(myModel, 'B3:D3', { bold: true, backgroundColor: C.header, fontColor: C.white });
  const my: [string, string, string][] = [
    ['Revenue', '=PriorRev*(1+RevGrowthMy*ScenarioMult)', 'Prior Rev × (1 + growth × scenario)'],
    ['EBITDA', '=RevMy*EbitdaMarginMy', 'Revenue × EBITDA margin'],
    ['Net Income', '=RevMy*NiMarginMy', 'Revenue × net margin'],
    ['EPS ($)', '=NiMy/Shares', 'Net income ÷ shares'],
    ['FCF (Year 0, $M)', '=(EbitdaMy-RevMy*DaPct)*(1-TaxRate)+RevMy*DaPct-RevMy*CapexPct-RevMy*RevGrowthMy*NwcPct-IF(SbcDeduct=1,RevMy*SbcPct,0)', 'Unlevered FCF: NOPAT + D&A − capex − ΔNWC − SBC (same definition as the DCF build)'],
  ];
  for (let i = 0; i < my.length; i++) {
    const r = 4 + i;
    await put(myModel, `B${r}`, my[i]![0]);
    await put(myModel, `C${r}`, my[i]![1]);
    await put(myModel, `D${r}`, my[i]![2]);
  }
  await fmt(myModel, 'C4:C6', { numberFormat: NF.usd });
  await fmt(myModel, 'C7', { numberFormat: NF.usd2 });
  await fmt(myModel, 'C8', { numberFormat: NF.usd });
  await fmt(myModel, 'B4:B8', { bold: true });
  await fmt(myModel, 'D4:D8', { italic: true, fontColor: C.blue });

  // =========================================================================
  // Valuation (multiples + full DCF + sensitivity)
  // =========================================================================
  await banner(valuation, 'A1:H1', 'VALUATION  —  multiples, DCF & sensitivity');
  await valuation.layout.setColumnWidths([[0, 30], [1, 220], ...rangeWidths(2, 7, 120)]);

  await section(valuation, 'B3:C3', 'MARKET MULTIPLES (My Model)');
  const mult: [string, string, string][] = [
    ['Enterprise Value ($M)', '=Price*Shares+Bridge', NF.usd],
    ['EV / EBITDA', '=EV/EbitdaMy', NF.mult],
    ['P / E', '=Price/EpsMy', NF.mult],
    ['EV / Revenue', '=EV/RevMy', NF.mult],
    ['P / S', '=Price*Shares/RevMy', NF.mult],
  ];
  for (let i = 0; i < mult.length; i++) {
    const r = 4 + i;
    await put(valuation, `B${r}`, mult[i]![0]);
    await put(valuation, `C${r}`, mult[i]![1]);
    await fmt(valuation, `C${r}`, { numberFormat: mult[i]![2] });
  }

  await section(valuation, 'B10:C10', 'IMPLIED PRICE (Peer Multiples)');
  const impl: [string, string][] = [
    ['via EV/EBITDA', '=(PeerEVEBITDA*EbitdaMy-Bridge)/SharesVal'],
    ['via P/E', '=PeerPE*EpsMy'],
    ['via EV/Revenue', '=(PeerEVRev*RevMy-Bridge)/SharesVal'],
    ['via P/S', '=PeerPS*RevMy/SharesVal'],
    ['Average Implied Price', '=AVERAGE(C11:C14)'],
  ];
  for (let i = 0; i < impl.length; i++) {
    const r = 11 + i;
    await put(valuation, `B${r}`, impl[i]![0]);
    await put(valuation, `C${r}`, impl[i]![1]);
    await fmt(valuation, `C${r}`, { numberFormat: NF.usd2 });
  }
  await fmt(valuation, 'B15:C15', { bold: true, backgroundColor: C.lightBlue });

  await section(valuation, 'B17:C17', 'WACC');
  await put(valuation, 'B18', 'Cost of Equity'); await put(valuation, 'C18', '=RiskFree+Beta*ERP');
  await put(valuation, 'B19', 'After-tax Cost of Debt'); await put(valuation, 'C19', '=CostDebt*(1-TaxRate)');
  await put(valuation, 'B20', 'WACC'); await put(valuation, 'C20', '=WeightEquity*C18+WeightDebt*C19');
  await fmt(valuation, 'C18:C20', { numberFormat: NF.pct });
  await fmt(valuation, 'B20:C20', { bold: true, backgroundColor: C.lightBlue });

  await section(valuation, 'B22:H22', 'DCF — 5-YEAR PROJECTION');
  await put(valuation, 'B23', 'Period (FY-end)');
  // Dynamic fiscal-period headers (e.g. Dec-2026): FY-end month/day from FYEnd,
  // year = last-actual FY + k. Year 1 = the consensus forecast year (RevMy).
  for (let y = 1; y <= 5; y++) {
    await put(valuation, `${col(2 + (y - 1))}23`, `=IFERROR(DATE(YEAR(FYEnd)+${y},MONTH(FYEnd),DAY(FYEnd)),FYEnd)`);
  }
  await fmt(valuation, 'C23:G23', { numberFormat: 'mmm-yyyy' });
  // Year 1 = consensus base (RevMy); Years 2-5 grow at the forward rate, fading
  // toward terminal. Year-1 growth is the realized move to consensus (display).
  await put(valuation, 'B24', 'Rev Growth');
  await put(valuation, 'C24', '=ConsRev/PriorRev-1');
  await put(valuation, 'D24', '=MAX(RevGrowthMy*ScenarioMult,TermGrowth)');
  for (let y = 3; y <= 5; y++) await put(valuation, `${col(2 + (y - 1))}24`, `=MAX(${col(1 + (y - 1))}24-GrowthFade,TermGrowth)`);
  await put(valuation, 'B25', 'Revenue ($M)');
  await put(valuation, 'C25', '=RevMy');
  for (let y = 2; y <= 5; y++) await put(valuation, `${col(2 + (y - 1))}25`, `=${col(1 + (y - 1))}25*(1+${col(2 + (y - 1))}24)`);
  // EBITDA with margin ramp from current margin toward the terminal margin.
  await put(valuation, 'B26', 'EBITDA ($M)');
  for (let y = 1; y <= 5; y++) {
    const c = col(2 + (y - 1));
    await put(valuation, `${c}26`, `=${c}25*(EbitdaMarginMy+(TermMargin-EbitdaMarginMy)*${(y - 1) / 4})`);
  }
  // Explicit unlevered-FCF waterfall — each bridge item is now its own line:
  // EBITDA → (−)D&A → EBIT → (−)cash taxes → NOPAT → (+)D&A → (−)ΔNWC =
  // Cash from Operations → (−)capex → (−)SBC = Unlevered FCF. (Same economics as
  // the old one-line formula, but ΔNWC and capex are visible bridge items.)
  for (let y = 1; y <= 5; y++) {
    const c = col(2 + (y - 1));
    const prevRev = y === 1 ? 'PriorRev' : `${col(1 + (y - 1))}25`;
    await put(valuation, `${c}27`, `=${c}25*DaPct`);                       // (−) D&A
    await put(valuation, `${c}28`, `=${c}26-${c}27`);                      // EBIT
    await put(valuation, `${c}29`, `=MAX(${c}28,0)*TaxRate`);              // (−) cash taxes (effective rate)
    await put(valuation, `${c}30`, `=${c}28-${c}29`);                      // NOPAT
    await put(valuation, `${c}31`, `=${c}27`);                             // (+) D&A add-back
    await put(valuation, `${c}32`, `=(${c}25-${prevRev})*NwcPct`);         // (−) Change in NWC
    await put(valuation, `${c}33`, `=${c}30+${c}31-${c}32`);               // = Cash from Operations
    await put(valuation, `${c}34`, `=${c}25*CapexPct`);                    // (−) Capex
    await put(valuation, `${c}35`, `=IF(SbcDeduct=1,${c}25*SbcPct,0)`);    // (−) SBC (post-SBC)
    await put(valuation, `${c}36`, `=${c}33-${c}34-${c}35`);               // = Unlevered FCF
  }
  await put(valuation, 'B27', '(−) D&A');
  await put(valuation, 'B28', 'EBIT');
  await put(valuation, 'B29', '(−) Cash Taxes (effective)');
  await put(valuation, 'B30', 'NOPAT');
  await put(valuation, 'B31', '(+) D&A');
  await put(valuation, 'B32', '(−) Change in NWC');
  await put(valuation, 'B33', 'Cash from Operations');
  await put(valuation, 'B34', '(−) Capex');
  await put(valuation, 'B35', '(−) SBC (post-SBC basis)');
  await put(valuation, 'B36', 'Unlevered FCF');
  await fmt(valuation, 'C24:G24', { numberFormat: NF.pct });
  await fmt(valuation, 'C25:G36', { numberFormat: NF.usd });
  await fmt(valuation, 'B23:G23', { bold: true, backgroundColor: C.lightBlue, horizontalAlign: 'center' });
  await fmt(valuation, 'B24:B36', { bold: true });
  await fmt(valuation, 'B33:G33', { bold: true, backgroundColor: C.cardBg });
  await fmt(valuation, 'B36:G36', { bold: true, backgroundColor: C.lightBlue });

  // Mid-year convention: explicit FCF uplifted by (1+WACC)^0.5; terminal at yr 4.5.
  await put(valuation, 'B38', 'PV of explicit FCF (mid-yr)'); await put(valuation, 'C38', '=NPV(WACC,C36:G36)*(1+WACC)^0.5');
  await put(valuation, 'B39', 'Terminal Value'); await put(valuation, 'C39', '=G36*(1+TermGrowth)/MAX(WACC-TermGrowth,0.005)');
  await put(valuation, 'B40', 'PV of Terminal Value'); await put(valuation, 'C40', '=C39/(1+WACC)^4.5');
  await put(valuation, 'B41', 'Enterprise Value (DCF)'); await put(valuation, 'C41', '=C38+C40');
  await put(valuation, 'B42', 'Equity Value (DCF)'); await put(valuation, 'C42', '=C41-Bridge');
  await put(valuation, 'B43', 'Fair Value / Share'); await put(valuation, 'C43', '=C42/SharesVal');
  await put(valuation, 'B44', 'Upside vs Price'); await put(valuation, 'C44', '=FairValue/Price-1');
  await fmt(valuation, 'C38:C42', { numberFormat: NF.usd });
  await fmt(valuation, 'C43', { numberFormat: NF.usd2, bold: true, backgroundColor: C.greenBg, fontColor: C.greenFg });
  await fmt(valuation, 'C44', { numberFormat: NF.pct, bold: true });
  await fmt(valuation, 'B41:B43', { bold: true });

  // -- DCF cross-check (exit multiple) + valuation football field (cols I–K) --
  await valuation.layout.setColumnWidths([[8, 210], [9, 110], [10, 95]]);
  await section(valuation, 'I3:K3', 'DCF CROSS-CHECK & VALUATION SUMMARY');
  await put(valuation, 'I5', 'Terminal Value ($M)'); await put(valuation, 'J5', 'Value');
  await fmt(valuation, 'I5:J5', { bold: true, backgroundColor: C.lightBlue });
  await put(valuation, 'I6', 'Gordon Growth'); await put(valuation, 'J6', '=C39');
  await put(valuation, 'I7', 'Exit Multiple (EV/EBITDA)'); await put(valuation, 'J7', '=G26*PeerEVEBITDA');
  await put(valuation, 'I8', 'Implied exit multiple (Gordon)'); await put(valuation, 'J8', '=C39/G26');
  await put(valuation, 'I9', 'Implied perpetuity g (Exit)'); await put(valuation, 'J9', '=(WACC*J7-G36)/(J7+G36)');
  await fmt(valuation, 'J6:J7', { numberFormat: NF.usd });
  await fmt(valuation, 'J8', { numberFormat: NF.mult });
  await fmt(valuation, 'J9', { numberFormat: NF.pct });

  await put(valuation, 'I11', 'Fair Value / Share'); await put(valuation, 'J11', 'Value'); await put(valuation, 'K11', 'vs Price');
  await fmt(valuation, 'I11:K11', { bold: true, backgroundColor: C.lightBlue });
  const fvRows: [string, string | null][] = [
    ['DCF — Gordon Growth', '=FairValue'],
    ['DCF — Exit Multiple', '=((C38+J7/(1+WACC)^4.5)-Bridge)/SharesVal'],
    ['Comps — Avg Implied', '=AvgImplied'],
    ['Analyst Target (CapIQ)', cap ? `=IFERROR((CIQ(${TICK},"${F.priceTarget!.m}"))+0,"")` : null],
  ];
  for (let i = 0; i < fvRows.length; i++) {
    const r = 12 + i;
    await put(valuation, `I${r}`, fvRows[i]![0]);
    if (fvRows[i]![1]) {
      await put(valuation, `J${r}`, fvRows[i]![1]);
      await put(valuation, `K${r}`, `=IFERROR(J${r}/Price-1,"")`);
    }
  }
  await fmt(valuation, 'J12:J15', { numberFormat: NF.usd2 });
  await fmt(valuation, 'K12:K15', { numberFormat: NF.pct });

  await put(valuation, 'I17', '52-Wk High / Low');
  if (cap) {
    await put(valuation, 'J17', `=IFERROR(CIQ(${TICK},"${F.high52!.m}"),"")`);
    await put(valuation, 'K17', `=IFERROR(CIQ(${TICK},"${F.low52!.m}"),"")`);
  }
  await fmt(valuation, 'J17:K17', { numberFormat: NF.usd2 });

  await section(valuation, 'I19:K19', 'VALUATION RANGE');
  await put(valuation, 'I20', 'Low'); await put(valuation, 'J20', '=MIN(J12:J15)');
  await put(valuation, 'I21', 'Midpoint'); await put(valuation, 'J21', '=MEDIAN(J12:J15)');
  await put(valuation, 'I22', 'High'); await put(valuation, 'J22', '=MAX(J12:J15)');
  await put(valuation, 'I23', 'Current Price'); await put(valuation, 'J23', '=Price');
  await put(valuation, 'I24', 'Upside to Midpoint'); await put(valuation, 'J24', '=J21/Price-1');
  await fmt(valuation, 'J20:J23', { numberFormat: NF.usd2 });
  await fmt(valuation, 'J21', { numberFormat: NF.usd2, bold: true, backgroundColor: C.greenBg, fontColor: C.greenFg });
  await fmt(valuation, 'J24', { numberFormat: NF.pct, bold: true });
  // Add the new valuation cells to the named set used by the Dashboard.
  await wb.names.add('DcfExit', 'Valuation!$J$13');
  await wb.names.add('AnalystTgt', 'Valuation!$J$15');
  await wb.names.add('ValMid', 'Valuation!$J$21');

  // -- Forward multiples grid (current FY vs NTM consensus) ------------------
  await section(valuation, 'I26:K26', 'FORWARD MULTIPLES (on consensus)');
  await put(valuation, 'I27', 'Metric'); await put(valuation, 'J27', 'Current FY'); await put(valuation, 'K27', 'NTM');
  await fmt(valuation, 'I27:K27', { bold: true, backgroundColor: C.lightBlue });
  const fwd: [string, string, string, string][] = [
    ['EV / Revenue', '=EV/ConsRev', '=EV/Consensus!E4', NF.mult],
    ['EV / EBITDA', '=EV/ConsEBITDA', '=EV/Consensus!E5', NF.mult],
    ['P / E', '=Price*Shares/ConsNI', '=Price*Shares/Consensus!E6', NF.mult],
    ['FCF Yield (UFCF/EV)', '=C36/EV', '=G36/EV', NF.pct],
  ];
  for (let i = 0; i < fwd.length; i++) {
    const r = 28 + i;
    await put(valuation, `I${r}`, fwd[i]![0]);
    await put(valuation, `J${r}`, fwd[i]![1]);
    await put(valuation, `K${r}`, fwd[i]![2]);
    await fmt(valuation, `J${r}:K${r}`, { numberFormat: fwd[i]![3], horizontalAlign: 'center' });
  }

  // Sensitivity: Fair Value / Share over WACC (rows) × Terminal Growth (cols).
  // Moved to row 47+ to clear the taller explicit FCF waterfall above.
  await section(valuation, 'B47:H47', 'SENSITIVITY — Fair Value / Share  (WACC × Terminal Growth)');
  await put(valuation, 'B48', 'WACC ↓ / g →');
  for (let cI = 0; cI < 5; cI++) {
    const delta = (cI - 2) * 0.005;
    await put(valuation, `${col(2 + cI)}48`, `=TermGrowth+${delta}`);
  }
  for (let rI = 0; rI < 5; rI++) {
    const r = 49 + rI;
    const wdelta = (rI - 2) * 0.005;
    await put(valuation, `B${r}`, `=WACC+${wdelta}`);
    for (let cI = 0; cI < 5; cI++) {
      const cc = col(2 + cI);
      await put(
        valuation,
        `${cc}${r}`,
        `=(NPV($B${r},$C$36:$G$36)*(1+$B${r})^0.5+($G$36*(1+${cc}$48)/MAX($B${r}-${cc}$48,0.005))/(1+$B${r})^4.5-Bridge)/SharesVal`,
      );
    }
  }
  await fmt(valuation, 'B48:G48', { numberFormat: NF.pct, bold: true, backgroundColor: C.lightBlue, horizontalAlign: 'center' });
  await fmt(valuation, 'B49:B53', { numberFormat: NF.pct, bold: true, backgroundColor: C.lightBlue });
  await fmt(valuation, 'C49:G53', { numberFormat: NF.usd2, horizontalAlign: 'center' });
  await valuation.conditionalFormats.add(['C49:G53'], asRules([
    { type: 'colorScale', colorScale: { minPoint: { type: 'min', color: C.redBg }, midPoint: { type: 'percentile', value: 50, color: C.white }, maxPoint: { type: 'max', color: C.greenBg } } },
  ]));

  // =========================================================================
  // Scenarios + Tornado
  // =========================================================================
  await banner(scenarios, 'A1:H1', 'SCENARIOS & SENSITIVITY');
  await scenarios.layout.setColumnWidths([[0, 30], [1, 150], ...rangeWidths(2, 7, 140)]);
  await scenarios.setRange('A3', [['', 'Scenario', 'Rev Growth', 'EBITDA Margin', 'Implied Rev ($M)', 'Implied EBITDA', 'Fair Value', 'Upside']]);
  await fmt(scenarios, 'B3:H3', { bold: true, backgroundColor: C.header, fontColor: C.white });
  const scen: [string, string, string][] = [
    ['Base', '=RevGrowthMy', '=EbitdaMarginMy'],
    ['Bull', '=RevGrowthMy*1.25', '=EbitdaMarginMy+0.03'],
    ['Bear', '=RevGrowthMy*0.7', '=EbitdaMarginMy-0.04'],
  ];
  for (let i = 0; i < scen.length; i++) {
    const r = 4 + i;
    await put(scenarios, `B${r}`, scen[i]![0]);
    await put(scenarios, `C${r}`, scen[i]![1]);
    await put(scenarios, `D${r}`, scen[i]![2]);
    await put(scenarios, `E${r}`, `=PriorRev*(1+C${r})`);
    await put(scenarios, `F${r}`, `=E${r}*D${r}`);
    await put(scenarios, `G${r}`, `=(PeerEVEBITDA*F${r}-Bridge)/SharesVal`);
    await put(scenarios, `H${r}`, `=G${r}/Price-1`);
  }
  await fmt(scenarios, 'C4:D6', { numberFormat: NF.pct });
  await fmt(scenarios, 'E4:F6', { numberFormat: NF.usd });
  await fmt(scenarios, 'G4:G6', { numberFormat: NF.usd2 });
  await fmt(scenarios, 'H4:H6', { numberFormat: NF.pct });
  await scenarios.conditionalFormats.add(['H4:H6'], asRules(cfUpDown(0)));

  await section(scenarios, 'B8:H8', 'TORNADO — Fair Value swing to ±20% driver moves');
  await scenarios.setRange('A9', [['', 'Driver', 'FV @ -20%', 'FV @ +20%', 'Swing']]);
  await fmt(scenarios, 'B9:E9', { bold: true, backgroundColor: C.lightBlue });
  const fvMult = (gExpr: string, mExpr: string, peerExpr: string, ndExpr: string, shExpr: string) =>
    `=(${peerExpr}*(PriorRev*(1+${gExpr})*${mExpr})-${ndExpr})/${shExpr}`;
  const drivers: [string, string, string][] = [
    ['Revenue Growth', fvMult('RevGrowthMy*0.8', 'EbitdaMarginMy', 'PeerEVEBITDA', 'Bridge', 'SharesVal'), fvMult('RevGrowthMy*1.2', 'EbitdaMarginMy', 'PeerEVEBITDA', 'Bridge', 'SharesVal')],
    ['EBITDA Margin', fvMult('RevGrowthMy', 'EbitdaMarginMy*0.8', 'PeerEVEBITDA', 'Bridge', 'SharesVal'), fvMult('RevGrowthMy', 'EbitdaMarginMy*1.2', 'PeerEVEBITDA', 'Bridge', 'SharesVal')],
    ['Peer EV/EBITDA', fvMult('RevGrowthMy', 'EbitdaMarginMy', 'PeerEVEBITDA*0.8', 'Bridge', 'SharesVal'), fvMult('RevGrowthMy', 'EbitdaMarginMy', 'PeerEVEBITDA*1.2', 'Bridge', 'SharesVal')],
    ['EV Bridge', fvMult('RevGrowthMy', 'EbitdaMarginMy', 'PeerEVEBITDA', 'Bridge*1.2', 'SharesVal'), fvMult('RevGrowthMy', 'EbitdaMarginMy', 'PeerEVEBITDA', 'Bridge*0.8', 'SharesVal')],
    ['Shares (diluted)', fvMult('RevGrowthMy', 'EbitdaMarginMy', 'PeerEVEBITDA', 'Bridge', 'SharesVal*1.2'), fvMult('RevGrowthMy', 'EbitdaMarginMy', 'PeerEVEBITDA', 'Bridge', 'SharesVal*0.8')],
  ];
  for (let i = 0; i < drivers.length; i++) {
    const r = 10 + i;
    await put(scenarios, `B${r}`, drivers[i]![0]);
    await put(scenarios, `C${r}`, drivers[i]![1]);
    await put(scenarios, `D${r}`, drivers[i]![2]);
    await put(scenarios, `E${r}`, `=ABS(D${r}-C${r})`);
  }
  await fmt(scenarios, 'C10:E14', { numberFormat: NF.usd2 });

  // =========================================================================
  // Charts (data tables + 3 charts)
  // =========================================================================
  await banner(charts, 'A1:F1', 'CHARTS');
  await charts.layout.setColumnWidths([[0, 180], ...rangeWidths(1, 5, 130)]);

  // Comparison table (Consensus vs My) -> column chart
  await charts.setRange('A3', [
    ['Metric', 'Consensus', 'My Model'],
    ['Revenue', '=ConsRev', '=RevMy'],
    ['EBITDA', '=ConsEBITDA', '=EbitdaMy'],
    ['Net Income', '=ConsNI', '=NiMy'],
  ]);
  await fmt(charts, 'A3:C3', { bold: true, backgroundColor: C.header, fontColor: C.white });
  await fmt(charts, 'B4:C6', { numberFormat: NF.usd });

  // Active-sector KPI table -> radar chart
  await put(charts, 'A9', 'Active-Sector KPI'); await put(charts, 'B9', 'Value');
  await fmt(charts, 'A9:B9', { bold: true, backgroundColor: C.header, fontColor: C.white });
  for (let k = 0; k < 5; k++) {
    const r = 10 + k;
    await put(charts, `A${r}`, `=INDEX(KpiNames,${k + 1},MATCH(SelectedSector,SectorList,0))`);
    await put(charts, `B${r}`, `=INDEX(KpiValues,${k + 1},MATCH(SelectedSector,SectorList,0))`);
  }
  await fmt(charts, 'B10:B14', { numberFormat: NF.num1 });

  // Net Income bridge -> waterfall chart
  await charts.setRange('A17', [
    ['Net Income Bridge', 'Value'],
    ['Consensus NI', '=ConsNI'],
    ['Revenue Beat', '=(RevMy-ConsRev)*NiMarginMy'],
    ['Margin / Other', '=NiMy-ConsNI-((RevMy-ConsRev)*NiMarginMy)'],
    ['My NI', '=NiMy'],
  ]);
  await fmt(charts, 'A17:B17', { bold: true, backgroundColor: C.header, fontColor: C.white });
  await fmt(charts, 'B18:B21', { numberFormat: NF.usd });

  // Three charts placed to the RIGHT of the data tables (col E), stacked with
  // gaps so they never overlap each other or the data.
  // Series refs MUST be sheet-qualified & absolute or Excel won't plot them.
  await addChart({
    ws: charts, type: 'column', title: 'Consensus vs My Model ($M)',
    anchorRow: 2, anchorCol: 4, valueAxisTitle: '$M', dataLabels: true,
    series: [
      { name: 'Consensus', values: 'Charts!$B$4:$B$6', categories: 'Charts!$A$4:$A$6' },
      { name: 'My Model', values: 'Charts!$C$4:$C$6', categories: 'Charts!$A$4:$A$6' },
    ],
  });
  await addChart({
    ws: charts, type: 'radar', title: 'Sector KPI Profile',
    anchorRow: 18, anchorCol: 4,
    series: [{ name: 'Active Sector', values: 'Charts!$B$10:$B$14', categories: 'Charts!$A$10:$A$14' }],
  });
  await addChart({
    ws: charts, type: 'waterfall', title: 'Net Income Bridge ($M)',
    anchorRow: 34, anchorCol: 4, valueAxisTitle: '$M', dataLabels: true,
    series: [{ name: 'Net Income', values: 'Charts!$B$18:$B$21', categories: 'Charts!$A$18:$A$21' }],
  });

  // =========================================================================
  // Dashboard (home screen)
  // =========================================================================
  await banner(dashboard, 'A1:L1', 'SECTOR CONSENSUS  vs  MY MODEL  —  EQUITY DASHBOARD');
  await dashboard.layout.setColumnWidths([[0, 78], ...rangeWidths(1, 11, 96)]);

  // Company header strip
  const hdr: [string, string, string][] = [
    ['A3', 'Company', '=Inputs!D4'], ['E3', 'Sector', ''], ['I3', 'Current Price', '=Price'],
    ['A4', 'Ticker', '=Inputs!D5'], ['E4', 'Next Earnings', '=Inputs!D10'], ['I4', 'Shares (M)', '=Shares'],
  ];
  for (const [addr, label, value] of hdr) {
    await put(dashboard, addr, label);
    const vCol = String.fromCharCode(addr.charCodeAt(0) + 1);
    if (value) await put(dashboard, `${vCol}${addr.slice(1)}`, value);
    await fmt(dashboard, addr, { bold: true, fontColor: C.blue });
  }
  // sector dropdown is the master SelectedSector cell (G3)
  await put(dashboard, 'G3', coSector);
  await dashboard.validations.set('G3', listRule([...SECTORS]));
  await fmt(dashboard, 'G3', { bold: true, backgroundColor: C.amberBg, fontColor: C.amberFg, horizontalAlign: 'center', borders: { outline: true, top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder } });
  // Header value cells live in the column right of each label (I3->J3, etc.).
  await fmt(dashboard, 'J3', { numberFormat: NF.usd2, bold: true });
  await fmt(dashboard, 'F4', { numberFormat: NF.date, bold: true });
  await fmt(dashboard, 'J4', { numberFormat: NF.int, bold: true });

  // Metric cards
  await metricCard(dashboard, 'B', 6, 'REVENUE ($M)', 'RevMy', 'ConsRev', 'PriorRev', NF.usd);
  await metricCard(dashboard, 'F', 6, 'EBITDA ($M)', 'EbitdaMy', 'ConsEBITDA', 'PriorEBITDA', NF.usd);
  await metricCard(dashboard, 'J', 6, 'NET INCOME ($M)', 'NiMy', 'ConsNI', 'PriorNI', NF.usd);

  // Sector KPI summary (auto-updates with dropdown)
  await section(dashboard, 'B13:L13', 'SECTOR KPI SUMMARY (auto-updates with sector)');
  for (let k = 0; k < 5; k++) {
    const c = 1 + k * 2; // B, D, F, H, J
    await put(dashboard, `${col(c)}14`, `=INDEX(KpiNames,${k + 1},MATCH(SelectedSector,SectorList,0))`);
    await put(dashboard, `${col(c)}15`, `=INDEX(KpiValues,${k + 1},MATCH(SelectedSector,SectorList,0))`);
    await fmt(dashboard, `${col(c)}14:${col(c + 1)}14`, { bold: true, fontColor: C.blue, fontSize: 9 });
    await fmt(dashboard, `${col(c)}15:${col(c + 1)}15`, { bold: true, fontSize: 14, numberFormat: NF.num1 });
    await dashboard.structure.merge(`${col(c)}14:${col(c + 1)}14`);
    await dashboard.structure.merge(`${col(c)}15:${col(c + 1)}15`);
  }

  // Valuation summary
  await section(dashboard, 'B17:L17', 'VALUATION');
  const valLabels = ['EV/EBITDA', 'P/E', 'EV/Rev', 'P/S', 'DCF (Gordon)', 'DCF (Exit)', 'Val Midpt', 'Avg Implied', 'Current Price', 'Upside (Mid)'];
  const valRefs = ['=Valuation!C5', '=Valuation!C6', '=Valuation!C7', '=Valuation!C8', '=FairValue', '=DcfExit', '=ValMid', '=AvgImplied', '=Price', '=Valuation!J24'];
  const valFmts = [NF.mult, NF.mult, NF.mult, NF.mult, NF.usd2, NF.usd2, NF.usd2, NF.usd2, NF.usd2, NF.pct];
  for (let i = 0; i < valLabels.length; i++) {
    const c = 1 + i; // B..I
    await put(dashboard, `${col(c)}18`, valLabels[i]!);
    await put(dashboard, `${col(c)}19`, valRefs[i]!);
    await fmt(dashboard, `${col(c)}18`, { bold: true, fontSize: 9, fontColor: C.blue, horizontalAlign: 'center' });
    await fmt(dashboard, `${col(c)}19`, { bold: true, numberFormat: valFmts[i]!, horizontalAlign: 'center', backgroundColor: C.cardBg });
  }
  await dashboard.conditionalFormats.add(['K19'], asRules(cfUpDown(0)));

  // Beat / Miss & stock-reaction gauge
  await section(dashboard, 'B21:L21', 'EARNINGS SIGNAL  —  Beat/Miss & implied stock move');
  await put(dashboard, 'B22', 'Blended Surprise');
  await put(dashboard, 'D22', '=AVERAGE(RevMy/ConsRev-1,EbitdaMy/ConsEBITDA-1,NiMy/ConsNI-1)');
  await put(dashboard, 'F22', 'Signal');
  await put(dashboard, 'H22', '=IF(D22>=BeatThresh,"LIKELY BEAT  ▲",IF(D22<=MissThresh,"LIKELY MISS  ▼","IN-LINE  ►"))');
  await put(dashboard, 'B23', 'Implied Stock Move');
  await put(dashboard, 'D23', '=D22*ReactSens');
  await put(dashboard, 'F23', 'Rule');
  await put(dashboard, 'H23', '=("Beat>"&TEXT(BeatThresh,"0.0%")&" / Miss<"&TEXT(MissThresh,"0.0%"))');
  await fmt(dashboard, 'B22:B23', { bold: true });
  await fmt(dashboard, 'F22:F23', { bold: true });
  await fmt(dashboard, 'D22', { numberFormat: NF.pct, bold: true, horizontalAlign: 'center' });
  await fmt(dashboard, 'D23', { numberFormat: NF.pct, bold: true, horizontalAlign: 'center' });
  await dashboard.structure.merge('H22:L22');
  await dashboard.structure.merge('H23:L23');
  await fmt(dashboard, 'H22', { bold: true, fontSize: 13, horizontalAlign: 'center' });
  await dashboard.conditionalFormats.add(['D22'], asRules(cfUpDown(0)));
  await dashboard.conditionalFormats.add(['H22'], asRules([
    { type: 'formula', formula: '=$D$22>=BeatThresh', style: { backgroundColor: C.greenBg, fontColor: C.greenFg, bold: true } },
    { type: 'formula', formula: '=$D$22<=MissThresh', style: { backgroundColor: C.redBg, fontColor: C.redFg, bold: true } },
  ]));

  await put(dashboard, 'B40', 'Tip: change the Sector dropdown (orange cell, G3) or any Inputs value — the entire model recomputes.');
  await dashboard.structure.merge('B40:L40');
  await fmt(dashboard, 'B40', { italic: true, fontColor: C.blue });

  // Embedded comparison chart — its own small data block (cols B–D) with the
  // chart anchored to the right (col F) so neither covers the other.
  await dashboard.setRange('B43', [
    ['Metric', 'Consensus', 'My Model'],
    ['Revenue', '=ConsRev', '=RevMy'],
    ['EBITDA', '=ConsEBITDA', '=EbitdaMy'],
    ['Net Income', '=ConsNI', '=NiMy'],
  ]);
  await fmt(dashboard, 'B43:D43', { bold: true, fontColor: C.white, backgroundColor: C.header, fontSize: 9 });
  await fmt(dashboard, 'C44:D46', { numberFormat: NF.usd });
  await fmt(dashboard, 'B44:B46', { bold: true });
  await addChart({
    ws: dashboard, type: 'column', title: 'Consensus vs My Model ($M)',
    anchorRow: 42, anchorCol: 5, valueAxisTitle: '$M', dataLabels: true,
    series: [
      { name: 'Consensus', values: 'Dashboard!$C$44:$C$46', categories: 'Dashboard!$B$44:$B$46' },
      { name: 'My Model', values: 'Dashboard!$D$44:$D$46', categories: 'Dashboard!$B$44:$B$46' },
    ],
  });

  // =========================================================================
  // Comps — comparable companies: live CapIQ peer data -> median -> implied value
  // =========================================================================
  await banner(comps, 'A1:H1', 'COMPARABLE COMPANIES  (live peer multiples → implied value)');
  await comps.layout.setColumnWidths([[0, 90], [1, 190], ...rangeWidths(2, 7, 110)]);
  const peers = DEFAULT_PEERS[cfg.sector] ?? DEFAULT_PEERS['Other']!;
  await comps.setRange('A3', [['Ticker', 'Company', 'Price', 'Mkt Cap ($M)', 'EV ($M)', 'EV/Rev (NTM)', 'EV/EBITDA (NTM)', 'P/E (NTM)']]);
  await fmt(comps, 'A3:H3', { bold: true, backgroundColor: C.header, fontColor: C.white, horizontalAlign: 'center' });
  const N = peers.length;
  for (let i = 0; i < N; i++) {
    const r = 4 + i;
    const def = peers[i] ?? '';
    const A = `$A${r}`;
    // Peer ticker: CapIQ auto comp set (guarded) -> sector-default fallback.
    await put(comps, `A${r}`, cap ? `=IFERROR(CIQ(${TICK},"IQ_COMPARABLE_COMPANIES",${i + 1}),"${def}")` : def);
    if (cap) {
      await put(comps, `B${r}`, `=IFERROR(CIQ(${A},"IQ_COMPANY_NAME"),"")`);
      await put(comps, `C${r}`, `=IFERROR((CIQ(${A},"IQ_LASTSALEPRICE"))+0,"")`);
      await put(comps, `D${r}`, `=IFERROR((CIQ(${A},"IQ_MARKETCAP"))+0,"")`);
      await put(comps, `E${r}`, `=IFERROR((CIQ(${A},"IQ_TEV"))+0,IFERROR(D${r}+(CIQ(${A},"IQ_NET_DEBT",IQ_LTM))+0,""))`);
      await put(comps, `F${r}`, `=IFERROR(E${r}/CIQ(${A},"IQ_REVENUE_EST",IQ_NTM),"")`);
      await put(comps, `G${r}`, `=IFERROR(E${r}/CIQ(${A},"IQ_EBITDA_EST",IQ_NTM),"")`);
      await put(comps, `H${r}`, `=IFERROR(D${r}/CIQ(${A},"IQ_NI_EST",IQ_NTM),"")`);
    }
  }
  await fmt(comps, `C4:C${3 + N}`, { numberFormat: NF.usd2 });
  await fmt(comps, `D4:E${3 + N}`, { numberFormat: NF.usd });
  await fmt(comps, `F4:H${3 + N}`, { numberFormat: NF.mult, horizontalAlign: 'center' });
  const mr = 5 + N; // median row
  await put(comps, `B${mr}`, 'Peer Median');
  for (const cc of ['F', 'G', 'H']) await put(comps, `${cc}${mr}`, `=IFERROR(MEDIAN(${cc}4:${cc}${3 + N}),"")`);
  await fmt(comps, `B${mr}:H${mr}`, { bold: true, backgroundColor: C.lightBlue });
  await fmt(comps, `F${mr}:H${mr}`, { numberFormat: NF.mult, horizontalAlign: 'center', bold: true });

  const ir = mr + 2; // implied-value block
  await section(comps, `A${ir}:F${ir}`, 'IMPLIED VALUE — peer median × our consensus metric');
  await comps.setRange(`A${ir + 1}`, [['Method', 'Median ×', 'Our Metric ($M)', 'Implied ($M)', 'Implied Price', 'vs Price']]);
  await fmt(comps, `A${ir + 1}:F${ir + 1}`, { bold: true, backgroundColor: C.lightBlue });
  const implied: [string, string, string, string][] = [
    ['EV/EBITDA', `=G${mr}`, '=ConsEBITDA', `=IFERROR(G${mr}*ConsEBITDA,"")`],
    ['EV/Revenue', `=F${mr}`, '=ConsRev', `=IFERROR(F${mr}*ConsRev,"")`],
    ['P/E', `=H${mr}`, '=ConsNI', `=IFERROR(H${mr}*ConsNI,"")`],
  ];
  for (let i = 0; i < implied.length; i++) {
    const r = ir + 2 + i;
    await put(comps, `A${r}`, implied[i]![0]);
    await put(comps, `B${r}`, implied[i]![1]);
    await put(comps, `C${r}`, implied[i]![2]);
    await put(comps, `D${r}`, implied[i]![3]);
    const px = implied[i]![0] === 'P/E' ? `=IFERROR(D${r}/SharesVal,"")` : `=IFERROR((D${r}-Bridge)/SharesVal,"")`;
    await put(comps, `E${r}`, px);
    await put(comps, `F${r}`, `=IFERROR(E${r}/Price-1,"")`);
  }
  const avgr = ir + 2 + implied.length;
  await put(comps, `A${avgr}`, 'Average Implied');
  await put(comps, `E${avgr}`, `=IFERROR(AVERAGE(E${ir + 2}:E${ir + 1 + implied.length}),"")`);
  await put(comps, `F${avgr}`, `=IFERROR(E${avgr}/Price-1,"")`);
  await fmt(comps, `A${avgr}:F${avgr}`, { bold: true, backgroundColor: C.greenBg, fontColor: C.greenFg });
  await fmt(comps, `B${ir + 2}:B${avgr}`, { numberFormat: NF.mult });
  await fmt(comps, `C${ir + 2}:D${avgr}`, { numberFormat: NF.usd });
  await fmt(comps, `E${ir + 2}:E${avgr}`, { numberFormat: NF.usd2 });
  await fmt(comps, `F${ir + 2}:F${avgr}`, { numberFormat: NF.pct });
  await wb.names.add('CompsImplied', `Comps!$E$${avgr}`);
  await put(comps, `A${avgr + 2}`, cap
    ? 'Peers: CapIQ auto comp set (IQ_COMPARABLE_COMPANIES) with a sector-default fallback — edit column A to override.'
    : 'Comps populate in CapIQ mode (--capiq). Tickers shown are the sector-default peer set.');
  await fmt(comps, `A${avgr + 2}`, { italic: true, fontColor: C.blue });

  // =========================================================================
  // Financials — historical income statement + cash flow (CapIQ actuals) and a
  // GAAP -> Non-GAAP bridge. Pull HISTORY here; forecasting stays top-down on
  // MyModel/Valuation (a full line-by-line forward build is a per-name job).
  // =========================================================================
  await banner(financials, 'A1:F1', cap ? 'FINANCIALS  —  historical actuals (live via S&P Capital IQ)' : 'FINANCIALS  —  historical actuals (CapIQ mode only)');
  await financials.layout.setColumnWidths([[0, 24], [1, 260], ...rangeWidths(2, 4, 120)]);
  const fCols: [string, string][] = [['C', 'IQ_FY-2'], ['D', 'IQ_FY-1'], ['E', 'IQ_FY']];
  // historical CIQ pull, numeric-coerced + IFERROR-guarded (fallback 0)
  const h = (m: string, period: string) => `=IFERROR((CIQ(${TICK},"${m}",${period}))+0,0)`;
  await put(financials, 'C3', 'FY-2'); await put(financials, 'D3', 'FY-1'); await put(financials, 'E3', 'FY0 (latest)');
  await fmt(financials, 'C3:E3', { bold: true, backgroundColor: C.header, fontColor: C.white, horizontalAlign: 'center' });

  await section(financials, 'B5:E5', 'INCOME STATEMENT ($M)');
  const isLines: [number, string, string | null][] = [
    [6, 'Total Revenue', F.hRev!.m], [7, 'Gross Profit', F.hGrossProfit!.m],
    [8, 'Research & Development', F.hRnd!.m], [9, 'Selling, G&A', F.hSga!.m],
    [10, 'Operating Income', F.hOpInc!.m], [12, 'EBITDA', F.hEbitda!.m],
    [13, 'Depreciation & Amort.', F.hDa!.m], [14, 'Stock-based Comp', F.hSbc!.m],
    [15, 'Net Income (GAAP)', F.hNi!.m],
  ];
  for (const [r, label, m] of isLines) {
    await put(financials, `B${r}`, label);
    if (cap && m) for (const [cc, per] of fCols) await put(financials, `${cc}${r}`, h(m, per));
    await fmt(financials, `C${r}:E${r}`, { numberFormat: NF.usd });
  }
  // Diluted EPS (no scaling) + derived margins / growth
  await put(financials, 'B16', 'Diluted EPS (GAAP)');
  if (cap) for (const [cc, per] of fCols) await put(financials, `${cc}16`, `=IFERROR((CIQ(${TICK},"${F.hEps!.m}",${per}))+0,0)`);
  await fmt(financials, 'C16:E16', { numberFormat: NF.usd2 });
  await put(financials, 'B11', '  Operating Margin %');
  await put(financials, 'B17', '  Gross Margin %');
  await put(financials, 'B18', '  Revenue Growth % y/y');
  for (const cc of ['C', 'D', 'E']) {
    await put(financials, `${cc}11`, `=IFERROR(${cc}10/${cc}6,0)`);
    await put(financials, `${cc}17`, `=IFERROR(${cc}7/${cc}6,0)`);
  }
  await put(financials, 'D18', '=IFERROR(D6/C6-1,0)'); await put(financials, 'E18', '=IFERROR(E6/D6-1,0)');
  await fmt(financials, 'C11:E11', { numberFormat: NF.pct }); await fmt(financials, 'C17:E18', { numberFormat: NF.pct });
  await fmt(financials, 'B6:B18', { fontColor: C.ink });

  await section(financials, 'B20:E20', 'CASH FLOW ($M)');
  await put(financials, 'B21', 'Cash from Operations');
  await put(financials, 'B22', 'Capex');
  await put(financials, 'B23', 'Free Cash Flow (CFO − Capex)');
  await put(financials, 'B24', '  FCF Margin %');
  for (const [cc, per] of fCols) {
    if (cap) { await put(financials, `${cc}21`, h(F.hCfo!.m, per)); await put(financials, `${cc}22`, h(F.hCapex!.m, per)); }
    await put(financials, `${cc}23`, `=${cc}21-ABS(${cc}22)`);
    await put(financials, `${cc}24`, `=IFERROR(${cc}23/${cc}6,0)`);
  }
  await fmt(financials, 'C21:E23', { numberFormat: NF.usd }); await fmt(financials, 'C24:E24', { numberFormat: NF.pct });

  // GAAP -> Non-GAAP bridge (the consistency rule: SBC is added back here for
  // the Non-GAAP view, but valuation uses SharesVal which dilutes when pre-SBC).
  await section(financials, 'B26:E26', 'GAAP → NON-GAAP BRIDGE ($M)');
  await put(financials, 'B27', 'Net Income — GAAP');
  await put(financials, 'B28', '(+) Stock-based Comp');
  await put(financials, 'B29', '(+) Amort. of Acquired Intangibles');
  await put(financials, 'B30', '(+) M&A / One-time (manual)');
  await put(financials, 'B31', 'Net Income — Non-GAAP');
  await put(financials, 'B32', 'Non-GAAP Diluted EPS');
  await put(financials, 'B33', 'GAAP Diluted EPS');
  for (const [cc, per] of fCols) {
    await put(financials, `${cc}27`, `=${cc}15`);
    await put(financials, `${cc}28`, `=${cc}14`);
    if (cap) await put(financials, `${cc}29`, `=IFERROR((CIQ(${TICK},"${F.intangAmort!.m}",${per}))+0,0)`); else await put(financials, `${cc}29`, 0);
    await put(financials, `${cc}30`, 0);
    await put(financials, `${cc}31`, `=${cc}27+${cc}28+${cc}29+${cc}30`);
    await put(financials, `${cc}32`, `=IFERROR(${cc}31/SharesVal,0)`);
    await put(financials, `${cc}33`, `=${cc}16`);
  }
  await fmt(financials, 'C27:E31', { numberFormat: NF.usd });
  await fmt(financials, 'C32:E33', { numberFormat: NF.usd2 });
  await fmt(financials, 'B27:B33', { fontColor: C.ink }); await fmt(financials, 'B31:E31', { bold: true, backgroundColor: C.lightBlue });
  await put(financials, 'B35', cap
    ? '▶ Historical actuals pull live from Capital IQ; each is IFERROR-guarded (shows 0 if a mnemonic is unavailable in your CapIQ build — adjust in CAPIQ_FIELDS).'
    : 'Historical actuals populate in CapIQ mode (--capiq). Forward forecasting stays top-down on MyModel/Valuation.');
  await fmt(financials, 'B35', { italic: true, fontColor: C.blue });

  // =========================================================================
  // Quality — SaaS quality & growth scorecard (Rule of 40, Rule of X, NRR,
  // magic number, margins) with benchmarks. Sourced to Meritech/Bessemer.
  // =========================================================================
  await banner(quality, 'A1:F1', 'QUALITY & GROWTH SCORECARD');
  await quality.layout.setColumnWidths([[0, 24], [1, 300], [2, 110], [3, 150], [4, 120]]);
  await section(quality, 'B4:E4', 'METRICS vs BENCHMARK');
  await quality.setRange('B5', [['Metric', 'Value', 'Benchmark', 'Flag']]);
  await fmt(quality, 'B5:E5', { bold: true, backgroundColor: C.header, fontColor: C.white });
  // rows: label, formula, numberFormat, benchmark text, flag formula
  const qRows: [number, string, string, string, string, string][] = [
    [6, 'Revenue Growth (fwd, ConsRev/PriorRev−1)', '=ConsRev/PriorRev-1', NF.pct, 'context', ''],
    [7, 'EBITDA Margin (my model)', '=EbitdaMy/RevMy', NF.pct, 'context', ''],
    [8, 'FCF Margin (my model)', '=FcfBase/RevMy', NF.pct, 'context', ''],
    [9, 'Gross Margin (FY0 actual)', '=IFERROR(Financials!E17,0.75)', NF.pct, '≥ 70% (software)', '=IF(C9>=0.7,"PASS","WATCH")'],
    [10, 'Rule of 40 (growth + FCF margin)', '=C6+C8', NF.pct, '≥ 40%', '=IF(C10>=0.4,"PASS","WATCH")'],
    [11, 'Net Revenue Retention (input)', '=1.1', NF.pct, '≥120% best / ≥100% ok', '=IF(C11>=1.2,"BEST",IF(C11>=1,"OK","WATCH"))'],
    [12, 'Rule of X (3×growth + FCF margin)', '=3*C6+C8', NF.pct, 'higher = better (Meritech)', '=IF(C12>=1,"STRONG","OK")'],
    [13, 'SaaS Magic Number (ΔRev / SG&A FY0)', '=IFERROR((ConsRev-PriorRev)/Financials!E9,0)', NF.mult, '> 0.75 efficient', '=IF(C13>0.75,"PASS","WATCH")'],
  ];
  for (const [r, label, formula, nf, bench, flag] of qRows) {
    await put(quality, `B${r}`, label);
    await put(quality, `C${r}`, formula);
    await fmt(quality, `C${r}`, { numberFormat: nf });
    await put(quality, `D${r}`, bench);
    if (flag) await put(quality, `E${r}`, flag);
  }
  await fmt(quality, 'C11', { backgroundColor: C.amberBg, fontColor: C.amberFg, bold: true, horizontalAlign: 'center' }); // NRR editable input (=1.1 -> 110%)
  await fmt(quality, 'B10:E10', { bold: true });
  await fmt(quality, 'D6:D8', { italic: true, fontColor: C.blue });
  await put(quality, 'B16', 'Rule of 40 uses FCF margin (Meritech / Bessemer convention); Rule of X weights growth ~3× FCF margin. NRR (amber) is an analyst input — best-in-class >120%.');
  await fmt(quality, 'B16', { italic: true, fontColor: C.blue });

  // -- DuPont ROE decomposition (from the GS/NBIS model) ---------------------
  await section(quality, 'B19:E19', 'DUPONT — ROE DECOMPOSITION');
  await put(quality, 'B20', 'Net Income ($M)'); await put(quality, 'C20', '=NiMy');
  await put(quality, 'B21', 'Pretax Income ($M)');
  await put(quality, 'C21', cap ? `=IFERROR((CIQ(${TICK},"${F.ebt!.m}",IQ_FY))+0,NiMy/(1-TaxRate))` : '=NiMy/(1-TaxRate)');
  await put(quality, 'B22', 'EBIT ($M)');
  await put(quality, 'C22', cap ? `=IFERROR((CIQ(${TICK},"${F.ebit!.m}",IQ_FY))+0,EbitdaMy-RevMy*DaPct)` : '=EbitdaMy-RevMy*DaPct');
  await put(quality, 'B23', 'Sales ($M)'); await put(quality, 'C23', '=RevMy');
  await put(quality, 'B24', 'Total Assets ($M)');
  await put(quality, 'C24', cap ? `=IFERROR((CIQ(${TICK},"${F.totalAssets!.m}",IQ_LTM))+0,RevMy*1.5)` : '=RevMy*1.5');
  await put(quality, 'B25', 'Shareholders Equity ($M)');
  await put(quality, 'C25', cap ? `=IFERROR((CIQ(${TICK},"${F.totalEquity!.m}",IQ_LTM))+0,C24*0.5)` : '=C24*0.5');
  await fmt(quality, 'C20:C25', { numberFormat: NF.usd });
  const dupont: [number, string, string][] = [
    [26, 'Tax Burden (NI / Pretax)', '=IFERROR(C20/C21,0)'],
    [27, 'Interest Burden (Pretax / EBIT)', '=IFERROR(C21/C22,0)'],
    [28, 'EBIT Margin (EBIT / Sales)', '=IFERROR(C22/C23,0)'],
    [29, 'Asset Turnover (Sales / Assets)', '=IFERROR(C23/C24,0)'],
    [30, 'Financial Leverage (Assets / Equity)', '=IFERROR(C24/C25,0)'],
    [31, 'ROE = product of the five', '=IFERROR(C26*C27*C28*C29*C30,0)'],
    [32, 'ROE cross-check (NI / Equity)', '=IFERROR(C20/C25,0)'],
  ];
  for (const [r, label, formula] of dupont) {
    await put(quality, `B${r}`, label); await put(quality, `C${r}`, formula);
    await fmt(quality, `C${r}`, { numberFormat: r === 28 || r === 26 || r === 27 || r === 31 || r === 32 ? NF.pct : NF.mult });
  }
  await fmt(quality, 'B31:C31', { bold: true, backgroundColor: C.lightBlue });

  // -- Model integrity checks (from the GS/NBIS "Check" rows) ----------------
  await section(quality, 'B35:E35', 'MODEL INTEGRITY CHECKS');
  await quality.setRange('B36', [['Check', 'Value', 'Status']]);
  await fmt(quality, 'B36:D36', { bold: true, backgroundColor: C.header, fontColor: C.white });
  const checks: [number, string, string, string][] = [
    [37, 'Terminal value as % of DCF EV (want < 85%)', '=IFERROR(Valuation!C40/Valuation!C41,0)', '=IF(C37<0.85,"OK","REVIEW")'],
    [38, 'Football-field dispersion (max/min − 1, want < 100%)', '=IFERROR(MAX(Valuation!J12:J14)/MIN(Valuation!J12:J14)-1,0)', '=IF(C38<1,"OK","REVIEW")'],
    [39, 'Implied perpetuity g (want 0–4%)', '=Valuation!J9', '=IF(AND(C39>=0,C39<=0.04),"OK","REVIEW")'],
    [40, 'EBITDA margin sane (0–100%)', '=EbitdaMy/RevMy', '=IF(AND(C40>0,C40<1),"OK","REVIEW")'],
    [41, 'DuPont ROE ties (product = NI/Equity)', '=ABS(C31-C32)', '=IF(C41<0.001,"OK","REVIEW")'],
    [42, 'Capacity build vs DCF revenue (Y1 gap)', '=IFERROR(CapBuildRev/Valuation!C25-1,0)', '=IF(ABS(C42)<0.5,"OK","REVIEW")'],
    // DCF reliability envelope: the top-down 5-yr DCF is unreliable for hyper-
    // growth / pre-profit / capex-heavy names (e.g. NBIS), whose value sits in a
    // terminal beyond the explicit window. When flagged, trust the multiples/comps
    // (the valuation-range median is robust to the DCF outlier).
    [43, 'DCF reliability envelope (else use multiples): growth<75%, EBITDA>0, capex<60%', '=RevGrowthMy', '=IF(AND(RevGrowthMy<0.75,EbitdaMarginMy>0,CapexPct<0.6),"OK","REVIEW")'],
  ];
  for (const [r, label, value, status] of checks) {
    await put(quality, `B${r}`, label); await put(quality, `C${r}`, value); await put(quality, `D${r}`, status);
    await fmt(quality, `C${r}`, { numberFormat: NF.pct });
    await quality.conditionalFormats.add([`D${r}`], asRules([
      { type: 'formula', formula: `=$D$${r}="REVIEW"`, style: { backgroundColor: C.redBg, fontColor: C.redFg, bold: true } },
      { type: 'formula', formula: `=$D$${r}="OK"`, style: { backgroundColor: C.greenBg, fontColor: C.greenFg, bold: true } },
    ]));
  }

  // =========================================================================
  // CapacityBuild — generic units × utilization × price revenue engine, the
  // signature technique from the GS/NBIS GPU model. Optional cross-check vs the
  // top-down DCF revenue; generalizes to any capacity business (DCs, semis,
  // telecom, hotels, airlines, energy). Inputs (amber) are user-editable.
  // =========================================================================
  await banner(capacity, 'A1:H1', 'CAPACITY-DRIVEN REVENUE BUILD  (Units × Utilization × Price)');
  await capacity.layout.setColumnWidths([[0, 24], [1, 280], ...rangeWidths(2, 6, 110)]);
  await section(capacity, 'B4:G4', 'BUILD  —  edit amber cells (units, adds, ramp, utilization, price)');
  await put(capacity, 'B5', 'Period (FY-end)');
  for (let y = 0; y < 5; y++) await put(capacity, `${col(2 + y)}5`, `=IFERROR(DATE(YEAR(FYEnd)+${y + 1},MONTH(FYEnd),DAY(FYEnd)),FYEnd)`);
  await fmt(capacity, 'C5:G5', { numberFormat: 'mmm-yyyy' });
  await fmt(capacity, 'B5:G5', { bold: true, backgroundColor: C.lightBlue, horizontalAlign: 'center' });
  const capRows: [number, string][] = [
    [6, 'Units (BoP)'], [7, '(+) Units Added'], [8, 'Units (EoP)'], [9, 'Online Ramp Factor (new adds)'],
    [10, 'Avg Units Online'], [11, 'Utilization %'], [12, 'Effective Units'], [13, 'Price ($k / unit / yr)'],
    [14, 'Revenue ($M)'], [15, '% growth y/y'], [16, 'vs DCF Revenue (gap)'],
  ];
  for (const [r, label] of capRows) await put(capacity, `B${r}`, label);
  for (let y = 0; y < 5; y++) {
    const c = col(2 + y); const p = y === 0 ? null : col(1 + y);
    await put(capacity, `${c}6`, y === 0 ? 50000 : `=${p}8`);          // BoP: input Y1, then prior EoP
    await put(capacity, `${c}7`, 15000);                                // Units added (input)
    await put(capacity, `${c}8`, `=${c}6+${c}7`);                       // EoP
    await put(capacity, `${c}9`, 0.5);                                  // ramp (input)
    await put(capacity, `${c}10`, `=${c}6+${c}7*${c}9`);               // avg online
    await put(capacity, `${c}11`, 0.85);                               // utilization (input)
    await put(capacity, `${c}12`, `=${c}10*${c}11`);                  // effective units
    await put(capacity, `${c}13`, y === 0 ? 20 : `=${p}13*1.05`);     // price ($k/unit/yr), +5%/yr
    await put(capacity, `${c}14`, `=${c}12*${c}13/1000`);            // revenue ($M)
    await put(capacity, `${c}15`, y === 0 ? '' : `=IFERROR(${c}14/${p}14-1,0)`);
    await put(capacity, `${c}16`, `=IFERROR(${c}14/Valuation!${c}25-1,0)`);
  }
  await fmt(capacity, 'C6:G8', { numberFormat: NF.int });
  await fmt(capacity, 'C10:G10', { numberFormat: NF.int }); await fmt(capacity, 'C12:G12', { numberFormat: NF.int });
  await fmt(capacity, 'C9:G9', { numberFormat: NF.num1 }); await fmt(capacity, 'C11:G11', { numberFormat: NF.pct });
  await fmt(capacity, 'C13:G13', { numberFormat: NF.usd }); await fmt(capacity, 'C14:G14', { numberFormat: NF.usd });
  await fmt(capacity, 'C15:G16', { numberFormat: NF.pct });
  await fmt(capacity, 'B14:G14', { bold: true, backgroundColor: C.lightBlue });
  // tint editable input cells amber
  for (const r of [6, 7, 9, 11, 13]) await fmt(capacity, `C${r}:G${r}`, { backgroundColor: C.amberBg });
  await put(capacity, 'B18', 'Revenue = Effective Units × Price. Effective Units = (BoP + Added×Ramp) × Utilization — the ramp factor captures that capacity added mid-year is not online all year (GS/NBIS method). Row 16 cross-checks this bottoms-up build against the top-down DCF revenue.');
  await fmt(capacity, 'B18', { italic: true, fontColor: C.blue });

  // -- Capex / PP&E roll on the Valuation tab (capex builds PP&E; D&A depreciates)
  await section(valuation, 'B58:H58', 'CAPEX / PP&E ROLL  (capex builds PP&E; D&A depreciates it)');
  await put(valuation, 'B59', 'Period (FY-end)');
  for (let y = 0; y < 5; y++) await put(valuation, `${col(2 + y)}59`, `=IFERROR(DATE(YEAR(FYEnd)+${y + 1},MONTH(FYEnd),DAY(FYEnd)),FYEnd)`);
  await fmt(valuation, 'C59:G59', { numberFormat: 'mmm-yyyy' });
  await fmt(valuation, 'B59:G59', { bold: true, backgroundColor: C.lightBlue, horizontalAlign: 'center' });
  const ppeRows: [number, string][] = [
    [60, 'PP&E (BoP)'], [61, '(+) Capex'], [62, '(−) D&A'], [63, 'PP&E (EoP)'],
    [64, 'Capex / D&A (x)'], [65, 'D&A as % of avg PP&E'],
  ];
  for (const [r, label] of ppeRows) await put(valuation, `B${r}`, label);
  for (let y = 0; y < 5; y++) {
    const c = col(2 + y); const p = y === 0 ? null : col(1 + y);
    await put(valuation, `${c}60`, y === 0 ? (cap ? `=IFERROR((CIQ(${TICK},"${F.netPPE!.m}",IQ_LTM))+0,RevMy*0.6)` : '=RevMy*0.6') : `=${p}63`);
    await put(valuation, `${c}61`, `=${c}25*CapexPct`);   // capex = revenue × capex% (matches the DCF)
    await put(valuation, `${c}62`, `=${c}25*DaPct`);      // D&A = revenue × D&A%
    await put(valuation, `${c}63`, `=${c}60+${c}61-${c}62`);
    await put(valuation, `${c}64`, `=IFERROR(${c}61/${c}62,0)`);
    await put(valuation, `${c}65`, `=IFERROR(${c}62/((${c}60+${c}63)/2),0)`);
  }
  await fmt(valuation, 'C60:G63', { numberFormat: NF.usd });
  await fmt(valuation, 'C64:G64', { numberFormat: NF.mult }); await fmt(valuation, 'C65:G65', { numberFormat: NF.pct });
  await fmt(valuation, 'B60:B65', { bold: true });

  // -- finalize --------------------------------------------------------------
  await wb.calculate();
  // Post-process the OOXML to restore dropdowns + conditional-format colors
  // that the SDK writer drops, then write the file.
  const bytes = injectExcelFeatures(await wb.toXlsx());
  writeFileSync(outPath, bytes);
  await wb.dispose();
  return bytes;
}

// ---------------------------------------------------------------------------
// Card + small reusable builders
// ---------------------------------------------------------------------------

async function metricCard(
  ws: Worksheet,
  startCol: string,
  startRow: number,
  title: string,
  myName: string,
  consName: string,
  priorName: string,
  numberFormat: string,
) {
  const c0 = startCol;
  const c1 = String.fromCharCode(startCol.charCodeAt(0) + 1);
  const c2 = String.fromCharCode(startCol.charCodeAt(0) + 2);
  const r = startRow;
  await put(ws, `${c0}${r}`, title);
  await ws.structure.merge(`${c0}${r}:${c2}${r}`);
  await fmt(ws, `${c0}${r}:${c2}${r}`, { bold: true, fontColor: C.white, backgroundColor: C.blue, horizontalAlign: 'center' });

  const rows: [string, string, string][] = [
    ['My', `=${myName}`, numberFormat],
    ['Consensus', `=${consName}`, numberFormat],
    ['YoY', `=${myName}/${priorName}-1`, NF.pct],
    ['vs Cons', `=${myName}/${consName}-1`, NF.pct],
    ['Signal', `=IF(${myName}/${consName}-1>=BeatThresh,"BEAT",IF(${myName}/${consName}-1<=MissThresh,"MISS","IN-LINE"))`, ''],
  ];
  for (let i = 0; i < rows.length; i++) {
    const rr = r + 1 + i;
    await put(ws, `${c0}${rr}`, rows[i]![0]);
    await put(ws, `${c1}${rr}`, rows[i]![1]);
    await ws.structure.merge(`${c1}${rr}:${c2}${rr}`);
    await fmt(ws, `${c0}${rr}`, { fontColor: C.ink });
    if (rows[i]![2]) await fmt(ws, `${c1}${rr}`, { numberFormat: rows[i]![2], horizontalAlign: 'right', bold: i < 2 });
    else await fmt(ws, `${c1}${rr}`, { horizontalAlign: 'right', bold: true });
  }
  // card border + fill
  await fmt(ws, `${c0}${r + 1}:${c2}${r + 5}`, { backgroundColor: C.cardBg, borders: { outline: true, top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder } });
  // conditional formatting on YoY / vs Cons / signal
  await ws.conditionalFormats.add([`${c1}${r + 3}:${c2}${r + 3}`], asRules(cfUpDown(0)));
  await ws.conditionalFormats.add([`${c1}${r + 4}:${c2}${r + 4}`], asRules(cfSurprise()));
  await ws.conditionalFormats.add([`${c1}${r + 5}:${c2}${r + 5}`], asRules([
    { type: 'formula', formula: `=${c1}${r + 5}="BEAT"`, style: { backgroundColor: C.greenBg, fontColor: C.greenFg, bold: true } },
    { type: 'formula', formula: `=${c1}${r + 5}="MISS"`, style: { backgroundColor: C.redBg, fontColor: C.redFg, bold: true } },
  ]));
}

function listRule(values: string[]): ValidationRule {
  return { type: 'list', values, showDropdown: true, allowBlank: false };
}

/** Green when > threshold, red when below. */
function cfUpDown(threshold: number): CFInput[] {
  return [
    { type: 'cellValue', operator: 'greaterThan', value1: threshold, style: { backgroundColor: C.greenBg, fontColor: C.greenFg } },
    { type: 'cellValue', operator: 'lessThan', value1: threshold, style: { backgroundColor: C.redBg, fontColor: C.redFg } },
  ];
}

/** Beat (green) / miss (red) / in-line (amber) using ±2% bands. */
function cfSurprise(): CFInput[] {
  return [
    { type: 'cellValue', operator: 'greaterThanOrEqual', value1: 0.02, style: { backgroundColor: C.greenBg, fontColor: C.greenFg } },
    { type: 'cellValue', operator: 'lessThanOrEqual', value1: -0.02, style: { backgroundColor: C.redBg, fontColor: C.redFg } },
    { type: 'cellValue', operator: 'between', value1: -0.02, value2: 0.02, style: { backgroundColor: C.amberBg, fontColor: C.amberFg } },
  ];
}

/** 0-based column index -> column letters (0 -> A). */
function col(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** [[col,px],...] for an inclusive 0-based column range. */
function rangeWidths(start: number, end: number, px: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let c = start; c <= end; c++) out.push([c, px]);
  return out;
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const here = dirname(fileURLToPath(import.meta.url));
  const out = join(here, 'Sector_Consensus_vs_My_Model.xlsx');
  buildFinancialModel(out)
    .then((b) => console.log(`Built ${out} (${b.byteLength.toLocaleString()} bytes)`))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    });
}
