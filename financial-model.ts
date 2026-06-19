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
  scale?: number;     // multiplier applied to the result (e.g. 1e-6 for $ -> $M)
}

export const CAPIQ_FIELDS: Record<string, CapIqField> = {
  companyName: { m: 'IQ_COMPANY_NAME' },
  price: { m: 'IQ_CLOSEPRICE' },
  shares: { m: 'IQ_SHARESOUTSTANDING', scale: 1e-6 }, // -> millions
  netDebt: { m: 'IQ_NET_DEBT', period: 'IQ_LTM', scale: 1e-6 },
  taxRate: { m: 'IQ_EFFECT_TAX_RATE', period: 'IQ_FY', scale: 0.01 }, // % -> decimal
  nextEarnings: { m: 'IQ_NEXT_EARNINGS_DATE' },
  epsEst: { m: 'IQ_EPS_EST', period: 'IQ_FY+1' },
  revPrior: { m: 'IQ_TOTAL_REV', period: 'IQ_FY', scale: 1e-6 },
  revCons: { m: 'IQ_REVENUE_EST', period: 'IQ_FY+1', scale: 1e-6 },
  revNtm: { m: 'IQ_REVENUE_EST', period: 'IQ_NTM', scale: 1e-6 },
  ebitdaPrior: { m: 'IQ_EBITDA', period: 'IQ_FY', scale: 1e-6 },
  ebitdaCons: { m: 'IQ_EBITDA_EST', period: 'IQ_FY+1', scale: 1e-6 },
  ebitdaNtm: { m: 'IQ_EBITDA_EST', period: 'IQ_NTM', scale: 1e-6 },
  niPrior: { m: 'IQ_NI', period: 'IQ_FY', scale: 1e-6 },
  niCons: { m: 'IQ_NI_EST', period: 'IQ_FY+1', scale: 1e-6 },
  niNtm: { m: 'IQ_NI_EST', period: 'IQ_NTM', scale: 1e-6 },
};

/** Build a CapIQ Excel formula string, e.g. =CIQ("AAPL","IQ_TOTAL_REV",IQ_FY)*0.000001 */
export function ciq(ticker: string, f: CapIqField): string {
  const args = f.period ? `"${ticker}","${f.m}",${f.period}` : `"${ticker}","${f.m}"`;
  const call = `CIQ(${args})`;
  return f.scale && f.scale !== 1 ? `=${call}*${f.scale}` : `=${call}`;
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

  // -- company identity (from config; defaults to the Tech/SaaS sample) ------
  const { company: coName, ticker, sector: coSector, price, shares, netDebt } = cfg;

  // In CapIQ mode, source cells hold live =CIQ(...) formulas keyed to `ticker`.
  const cap = cfg.dataSource === 'capiq';
  const F = CAPIQ_FIELDS;
  const src = {
    company: cap ? ciq(ticker, F.companyName!) : coName,
    price: cap ? ciq(ticker, F.price!) : price,
    shares: cap ? ciq(ticker, F.shares!) : shares,
    netDebt: cap ? ciq(ticker, F.netDebt!) : netDebt,
    taxRate: cap ? ciq(ticker, F.taxRate!) : cfg.taxRate,
    nextEarnings: cap ? ciq(ticker, F.nextEarnings!) : cfg.nextEarnings,
  };

  // =========================================================================
  // Named ranges (single source of truth). Defined FIRST so every formula
  // written below resolves immediately — names must exist before referenced.
  // =========================================================================
  const names: [string, string][] = [
    ['Price', 'Inputs!$D$6'], ['Shares', 'Inputs!$D$7'], ['NetDebt', 'Inputs!$D$8'],
    ['TaxRate', 'Inputs!$D$9'], ['RevGrowthMy', 'Inputs!$D$14'], ['GrowthFade', 'Inputs!$D$15'],
    ['EbitdaMarginMy', 'Inputs!$D$16'], ['NiMarginMy', 'Inputs!$D$17'], ['FcfConv', 'Inputs!$D$18'],
    ['ScenarioName', 'Inputs!$D$19'], ['ScenarioMult', 'Inputs!$D$20'],
    ['PeerEVEBITDA', 'Inputs!$D$23'], ['PeerPE', 'Inputs!$D$24'], ['PeerEVRev', 'Inputs!$D$25'], ['PeerPS', 'Inputs!$D$26'],
    ['RiskFree', 'Inputs!$D$29'], ['ERP', 'Inputs!$D$30'], ['Beta', 'Inputs!$D$31'], ['CostDebt', 'Inputs!$D$32'],
    ['WeightEquity', 'Inputs!$D$33'], ['WeightDebt', 'Inputs!$D$34'], ['TermGrowth', 'Inputs!$D$35'],
    ['BeatThresh', 'Inputs!$D$38'], ['MissThresh', 'Inputs!$D$39'], ['ReactSens', 'Inputs!$D$40'],
    ['SelectedSector', 'Dashboard!$G$3'],
    ['SectorList', 'SectorKPIs!$C$3:$I$3'], ['KpiNames', 'SectorKPIs!$C$4:$I$8'], ['KpiValues', 'SectorKPIs!$C$11:$I$15'],
    ['PriorRev', 'Consensus!$C$4'], ['PriorEBITDA', 'Consensus!$C$5'], ['PriorNI', 'Consensus!$C$6'],
    ['ConsRev', 'Consensus!$D$4'], ['ConsEBITDA', 'Consensus!$D$5'], ['ConsNI', 'Consensus!$D$6'], ['ConsEPS', 'Consensus!$D$7'],
    ['RevMy', 'MyModel!$C$4'], ['EbitdaMy', 'MyModel!$C$5'], ['NiMy', 'MyModel!$C$6'], ['EpsMy', 'MyModel!$C$7'], ['FcfBase', 'MyModel!$C$8'],
    ['EV', 'Valuation!$C$4'], ['AvgImplied', 'Valuation!$C$15'], ['WACC', 'Valuation!$C$20'], ['FairValue', 'Valuation!$C$34'],
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

  await section(inputs, 'B13:D13', 'MY ASSUMPTIONS');
  await I(14, 'Revenue Growth (Year 1)', a.revGrowth, NF.pct);
  await I(15, 'Growth Fade (per year)', a.growthFade, NF.pct);
  await I(16, 'EBITDA Margin', a.ebitdaMargin, NF.pct);
  await I(17, 'Net Margin', a.niMargin, NF.pct);
  await I(18, 'FCF Conversion', a.fcfConv, NF.pct);
  await I(19, 'Scenario', 'Base');
  await I(20, 'Scenario Growth Multiplier', '=IF(ScenarioName="Bull",1.25,IF(ScenarioName="Bear",0.7,1))', NF.mult);

  await section(inputs, 'B22:D22', 'CONSENSUS / PEER MULTIPLES');
  await I(23, 'Peer EV/EBITDA', a.peerEvEbitda, NF.mult);
  await I(24, 'Peer P/E', a.peerPe, NF.mult);
  await I(25, 'Peer EV/Revenue', a.peerEvRev, NF.mult);
  await I(26, 'Peer P/S', a.peerPs, NF.mult);

  await section(inputs, 'B28:D28', 'DCF / WACC');
  await I(29, 'Risk-free Rate', 0.042, NF.pct);
  await I(30, 'Equity Risk Premium', 0.05, NF.pct);
  await I(31, 'Beta', 1.2, NF.num1);
  await I(32, 'Pre-tax Cost of Debt', 0.06, NF.pct);
  await I(33, 'Weight — Equity', 0.85, NF.pct);
  await I(34, 'Weight — Debt', 0.15, NF.pct);
  await I(35, 'Terminal Growth', 0.03, NF.pct);

  await section(inputs, 'B37:D37', 'BEAT / MISS RULES (editable)');
  await I(38, 'Beat Threshold (surprise %)', 0.02, NF.pct);
  await I(39, 'Miss Threshold (surprise %)', -0.02, NF.pct);
  await I(40, 'Reaction Sensitivity (move per 1% surprise)', 8, NF.mult);

  await section(inputs, 'B42:D42', cap ? 'REAL-TIME DATA (live via Capital IQ)' : 'REAL-TIME DATA (placeholders — wire to a feed)');
  await I(43, 'Live Price', cap ? ciq(ticker, F.price!) : null, NF.usd2);
  await I(44, 'Live Consensus Revenue ($M)', cap ? ciq(ticker, F.revCons!) : null, NF.usd);
  await I(45, 'Live Consensus EPS', cap ? ciq(ticker, F.epsEst!) : null, NF.usd2);
  await I(46, 'Last Updated', cap ? '=TODAY()' : null);
  if (cap) {
    await put(inputs, 'B48', 'Data: S&P Capital IQ (CIQ formulas). Open in Excel with the CapIQ add-in to populate.');
    await put(inputs, 'B49', 'If a cell shows #NAME?, verify the mnemonic/period in CAPIQ_FIELDS for your CapIQ version.');
    await fmt(inputs, 'B48:B49', { italic: true, fontColor: C.blue });
  }

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

  // =========================================================================
  // Consensus
  // =========================================================================
  await banner(consensus, 'A1:E1', 'MARKET CONSENSUS');
  await consensus.layout.setColumnWidths([[0, 30], [1, 200], [2, 150], [3, 150], [4, 150]]);
  const cn = cfg.consensus;
  // In CapIQ mode each figure is a live CIQ formula; otherwise the static number.
  const cq = (field: CapIqField, fallback: number) => (cap ? ciq(ticker, field) : fallback);
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
    ['FCF (Year 0, $M)', '=EbitdaMy*(1-TaxRate)*FcfConv', 'EBITDA × (1-tax) × FCF conversion'],
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
    ['Enterprise Value ($M)', '=Price*Shares+NetDebt', NF.usd],
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
    ['via EV/EBITDA', '=(PeerEVEBITDA*EbitdaMy-NetDebt)/Shares'],
    ['via P/E', '=PeerPE*EpsMy'],
    ['via EV/Revenue', '=(PeerEVRev*RevMy-NetDebt)/Shares'],
    ['via P/S', '=PeerPS*RevMy/Shares'],
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
  await put(valuation, 'B23', 'Year');
  for (let y = 1; y <= 5; y++) { await put(valuation, `${col(2 + (y - 1))}23`, y); }
  // growth fades from RevGrowthMy*ScenarioMult toward TermGrowth
  await put(valuation, 'B24', 'Rev Growth');
  await put(valuation, 'C24', '=MAX(RevGrowthMy*ScenarioMult,TermGrowth)');
  for (let y = 2; y <= 5; y++) await put(valuation, `${col(2 + (y - 1))}24`, `=MAX(${col(1 + (y - 1))}24-GrowthFade,TermGrowth)`);
  await put(valuation, 'B25', 'Revenue ($M)');
  await put(valuation, 'C25', '=RevMy*(1+C24)');
  for (let y = 2; y <= 5; y++) await put(valuation, `${col(2 + (y - 1))}25`, `=${col(1 + (y - 1))}25*(1+${col(2 + (y - 1))}24)`);
  await put(valuation, 'B26', 'EBITDA ($M)');
  for (let y = 1; y <= 5; y++) await put(valuation, `${col(2 + (y - 1))}26`, `=${col(2 + (y - 1))}25*EbitdaMarginMy`);
  await put(valuation, 'B27', 'FCF ($M)');
  for (let y = 1; y <= 5; y++) await put(valuation, `${col(2 + (y - 1))}27`, `=${col(2 + (y - 1))}26*(1-TaxRate)*FcfConv`);
  await fmt(valuation, 'C24:G24', { numberFormat: NF.pct });
  await fmt(valuation, 'C25:G27', { numberFormat: NF.usd });
  await fmt(valuation, 'B23:G23', { bold: true, backgroundColor: C.lightBlue, horizontalAlign: 'center' });
  await fmt(valuation, 'B24:B27', { bold: true });

  await put(valuation, 'B29', 'PV of explicit FCF'); await put(valuation, 'C29', '=NPV(WACC,C27:G27)');
  await put(valuation, 'B30', 'Terminal Value'); await put(valuation, 'C30', '=G27*(1+TermGrowth)/(WACC-TermGrowth)');
  await put(valuation, 'B31', 'PV of Terminal Value'); await put(valuation, 'C31', '=C30/(1+WACC)^5');
  await put(valuation, 'B32', 'Enterprise Value (DCF)'); await put(valuation, 'C32', '=C29+C31');
  await put(valuation, 'B33', 'Equity Value (DCF)'); await put(valuation, 'C33', '=C32-NetDebt');
  await put(valuation, 'B34', 'Fair Value / Share'); await put(valuation, 'C34', '=C33/Shares');
  await put(valuation, 'B35', 'Upside vs Price'); await put(valuation, 'C35', '=FairValue/Price-1');
  await fmt(valuation, 'C29:C33', { numberFormat: NF.usd });
  await fmt(valuation, 'C34', { numberFormat: NF.usd2, bold: true, backgroundColor: C.greenBg, fontColor: C.greenFg });
  await fmt(valuation, 'C35', { numberFormat: NF.pct, bold: true });
  await fmt(valuation, 'B32:B34', { bold: true });

  // Sensitivity: Fair Value / Share over WACC (rows) × Terminal Growth (cols)
  await section(valuation, 'B37:H37', 'SENSITIVITY — Fair Value / Share  (WACC × Terminal Growth)');
  await put(valuation, 'B38', 'WACC ↓ / g →');
  for (let cI = 0; cI < 5; cI++) {
    const delta = (cI - 2) * 0.005;
    await put(valuation, `${col(2 + cI)}38`, `=TermGrowth+${delta}`);
  }
  for (let rI = 0; rI < 5; rI++) {
    const r = 39 + rI;
    const wdelta = (rI - 2) * 0.005;
    await put(valuation, `B${r}`, `=WACC+${wdelta}`);
    for (let cI = 0; cI < 5; cI++) {
      const cc = col(2 + cI);
      await put(
        valuation,
        `${cc}${r}`,
        `=(NPV($B${r},$C$27:$G$27)+($G$27*(1+${cc}$38)/($B${r}-${cc}$38))/(1+$B${r})^5-NetDebt)/Shares`,
      );
    }
  }
  await fmt(valuation, 'B38:G38', { numberFormat: NF.pct, bold: true, backgroundColor: C.lightBlue, horizontalAlign: 'center' });
  await fmt(valuation, 'B39:B43', { numberFormat: NF.pct, bold: true, backgroundColor: C.lightBlue });
  await fmt(valuation, 'C39:G43', { numberFormat: NF.usd2, horizontalAlign: 'center' });
  await valuation.conditionalFormats.add(['C39:G43'], asRules([
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
    await put(scenarios, `G${r}`, `=(PeerEVEBITDA*F${r}-NetDebt)/Shares`);
    await put(scenarios, `H${r}`, `=G${r}/Price-1`);
  }
  await fmt(scenarios, 'C4:D6', { numberFormat: NF.pct });
  await fmt(scenarios, 'E4:F6', { numberFormat: NF.usd });
  await fmt(scenarios, 'G4:G6', { numberFormat: NF.usd2 });
  await fmt(scenarios, 'H4:H6', { numberFormat: NF.pct });
  await scenarios.conditionalFormats.add(['H4:H6'], asRules(cfUpDown(0)));

  await section(scenarios, 'B8:H8', 'TORNADO — Fair Value swing to ±20% driver moves');
  await scenarios.setRange('A9', [['', 'Driver', 'Low FV', 'High FV', 'Swing']]);
  await fmt(scenarios, 'B9:E9', { bold: true, backgroundColor: C.lightBlue });
  const fvMult = (gExpr: string, mExpr: string, peerExpr: string, ndExpr: string, shExpr: string) =>
    `=(${peerExpr}*(PriorRev*(1+${gExpr})*${mExpr})-${ndExpr})/${shExpr}`;
  const drivers: [string, string, string][] = [
    ['Revenue Growth', fvMult('RevGrowthMy*0.8', 'EbitdaMarginMy', 'PeerEVEBITDA', 'NetDebt', 'Shares'), fvMult('RevGrowthMy*1.2', 'EbitdaMarginMy', 'PeerEVEBITDA', 'NetDebt', 'Shares')],
    ['EBITDA Margin', fvMult('RevGrowthMy', 'EbitdaMarginMy*0.8', 'PeerEVEBITDA', 'NetDebt', 'Shares'), fvMult('RevGrowthMy', 'EbitdaMarginMy*1.2', 'PeerEVEBITDA', 'NetDebt', 'Shares')],
    ['Peer EV/EBITDA', fvMult('RevGrowthMy', 'EbitdaMarginMy', 'PeerEVEBITDA*0.8', 'NetDebt', 'Shares'), fvMult('RevGrowthMy', 'EbitdaMarginMy', 'PeerEVEBITDA*1.2', 'NetDebt', 'Shares')],
    ['Net Debt', fvMult('RevGrowthMy', 'EbitdaMarginMy', 'PeerEVEBITDA', 'NetDebt*1.2', 'Shares'), fvMult('RevGrowthMy', 'EbitdaMarginMy', 'PeerEVEBITDA', 'NetDebt*0.8', 'Shares')],
    ['Shares Out', fvMult('RevGrowthMy', 'EbitdaMarginMy', 'PeerEVEBITDA', 'NetDebt', 'Shares*1.2'), fvMult('RevGrowthMy', 'EbitdaMarginMy', 'PeerEVEBITDA', 'NetDebt', 'Shares*0.8')],
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
  await banner(dashboard, 'A1:L1', '📊  SECTOR CONSENSUS  vs  MY MODEL  —  EQUITY DASHBOARD');
  await dashboard.layout.setColumnWidths([[0, 24], ...rangeWidths(1, 11, 96)]);

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
  await fmt(dashboard, 'K3', { numberFormat: NF.usd2, bold: true });
  await fmt(dashboard, 'G4', { numberFormat: NF.date });
  await fmt(dashboard, 'K4', { numberFormat: NF.int });

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
  const valLabels = ['EV/EBITDA', 'P/E', 'EV/Rev', 'P/S', 'DCF Fair Value', 'Avg Implied', 'Current Price', 'DCF Upside'];
  const valRefs = ['=Valuation!C5', '=Valuation!C6', '=Valuation!C7', '=Valuation!C8', '=FairValue', '=AvgImplied', '=Price', '=Valuation!C35'];
  const valFmts = [NF.mult, NF.mult, NF.mult, NF.mult, NF.usd2, NF.usd2, NF.usd2, NF.pct];
  for (let i = 0; i < valLabels.length; i++) {
    const c = 1 + i; // B..I
    await put(dashboard, `${col(c)}18`, valLabels[i]!);
    await put(dashboard, `${col(c)}19`, valRefs[i]!);
    await fmt(dashboard, `${col(c)}18`, { bold: true, fontSize: 9, fontColor: C.blue, horizontalAlign: 'center' });
    await fmt(dashboard, `${col(c)}19`, { bold: true, numberFormat: valFmts[i]!, horizontalAlign: 'center', backgroundColor: C.cardBg });
  }
  await dashboard.conditionalFormats.add(['I19'], asRules(cfUpDown(0)));

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

  // -- finalize --------------------------------------------------------------
  await wb.calculate();
  const bytes = await wb.save(outPath);
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
