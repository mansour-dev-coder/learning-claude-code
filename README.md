# my-mog-agent

A **Node.js + TypeScript** project (pnpm) that wraps the
[`@mog-sdk/node`](https://www.npmjs.com/package/@mog-sdk/node) headless
spreadsheet engine into a clean set of **callable tools**, plus a complete,
reusable **equity-research financial model** generator.

The heavy lifting (582 formula functions, XLSX import/export, charts, tables,
conditional formatting, data validation) is done by the native Rust engine
inside `@mog-sdk/node`. This repo gives it an ergonomic, fully-typed surface.

## Requirements

- Node.js >= 18 (developed on 22)
- [pnpm](https://pnpm.io)

## Setup

```bash
pnpm install
pnpm start    # runs the mog-tools example (index.ts)
pnpm model    # builds Sector_Consensus_vs_My_Model.xlsx
```

## Scripts

| Script           | Description                                       |
| ---------------- | ------------------------------------------------- |
| `pnpm start`     | Run the mog-tools example (`index.ts`)            |
| `pnpm model`     | Build the default financial model (`financial-model.ts`) |
| `pnpm run-model` | Build presets for any company (`run-model.ts`) — see below |
| `pnpm build`     | Compile to `dist/` with `tsc`                     |
| `pnpm typecheck` | Type-check without emitting                       |
| `pnpm clean`     | Remove the `dist/` folder                         |

---

## 1. The reusable tools — `mog-tools.ts`

Small, documented, fully-typed functions. Create a workbook handle once, pass
it to the tools, and `closeWorkbook` it when done.

| Tool                  | What it does                                            |
| --------------------- | ------------------------------------------------------- |
| `createWorkbook()`    | Start a new, empty workbook                             |
| `addDataToSheet()`    | Write a 2D block of values/formulas into a sheet        |
| `setCellFormula()`    | Write a single formula or value into one cell           |
| `calculateFormulas()` | Force a full recalculation                              |
| `getCellValue()`      | Read the computed value of one cell                     |
| `readSheet()`         | Read a whole sheet as a 2D array                        |
| `describeSheet()`     | LLM-friendly, line-by-line description (incl. formulas) |
| `summarizeSheet()`    | Compact overview: dimensions, headers, counts, sample   |
| `createChart()`       | Add a chart anchored at a cell                          |
| `addTable()`          | Turn a range into a structured table                    |
| `exportToXlsx()`      | Save the workbook to an `.xlsx` file                    |
| `importFromXlsx()`    | Open an `.xlsx` file (path or buffer)                   |
| `importFromCsv()`     | Build a workbook from CSV text or a CSV file            |
| `sheetToCsv()`        | Export a sheet/range to CSV                             |
| `sheetToJson()`       | Export a sheet to row objects keyed by header           |
| `closeWorkbook()`     | Release the native engine resources                     |

```ts
import { createWorkbook, addDataToSheet, createChart, exportToXlsx, closeWorkbook } from './mog-tools.js';

const wb = await createWorkbook();
await addDataToSheet(wb, {
  data: [
    ['Product', 'Q1', 'Q2', 'Total'],
    ['Widgets', 100, 150, '=SUM(B2:C2)'],
    ['Gadgets', 200, 250, '=SUM(B3:C3)'],
  ],
});
await createChart(wb, { type: 'column', dataRange: 'A1:C3', title: 'Quarterly Sales', anchorCell: 'F2' });
await exportToXlsx(wb, 'sales.xlsx');
await closeWorkbook(wb);
```

---

## 2. The financial model — `financial-model.ts`

`buildFinancialModel(outPath)` generates **`Sector_Consensus_vs_My_Model.xlsx`**,
a master template comparing **Market Consensus vs. My Model** for Revenue /
EBITDA / Net Income plus sector-specific KPIs, with valuation multiples, a full
DCF, sensitivity & scenarios, and charts.

```ts
import { buildFinancialModel } from './financial-model.js';
await buildFinancialModel('Sector_Consensus_vs_My_Model.xlsx');
```

### Workbook structure (8 sheets)

1. **Dashboard** — company header, **sector dropdown** (the master
   `SelectedSector`), metric cards (Revenue / EBITDA / Net Income with YoY &
   vs-consensus + colour-coded BEAT/MISS signal), auto-updating sector KPI
   summary, valuation strip (EV/EBITDA, P/E, EV/Rev, P/S, DCF fair value, avg
   implied, upside), a **Beat/Miss & implied-stock-move gauge** (editable
   rules), and an embedded comparison chart.
2. **Inputs** — every assumption in one place: general, my assumptions,
   peer multiples, DCF/WACC, editable beat/miss rules, real-time-data
   placeholders, a scenario dropdown, and a **Load Example Template** table.
3. **Consensus** — prior / current / NTM consensus financials + EPS.
4. **MyModel** — projections derived from the assumptions.
5. **Valuation** — market multiples, implied prices from peer multiples, a
   **WACC build-up**, a **5-year DCF** (terminal value, PV, equity bridge,
   fair value/share), and a **WACC × terminal-growth sensitivity grid** with a
   colour scale.
6. **Scenarios** — Base / Bull / Bear fair values + a **tornado** table of
   fair-value swings to ±20% driver moves.
7. **Charts** — Consensus-vs-My **column** chart, sector-KPI **radar**, and a
   Net-Income **waterfall** bridge.
8. **SectorKPIs** — the dynamic backbone: a KPI name/value matrix per sector
   that the Dashboard reads via `INDEX/MATCH(SelectedSector, …)`.

### Everything is dynamic

- One **dropdown** (`SelectedSector`, the orange cell on the Dashboard) drives
  every sector-specific KPI on the Dashboard and the radar chart.
- All numbers are **live Excel formulas** off named ranges — change any Input
  (or the scenario) and the cards, valuation, DCF, sensitivity and charts
  recompute.

### Sector templates (5 KPIs each, auto-switching)

Tech/SaaS · Consumer/Retail · Healthcare/Biotech · Industrials · Financials ·
Energy · Other — e.g. Tech/SaaS shows ARR, Net Revenue Retention, Rule of 40,
Gross Margin, CAC Payback; Retail shows Same-Store Sales, Inventory Turns, …

### Regenerate for any company — `run-model.ts`

One command builds the workbook for any company. Three sector presets ship in
the box (realistic base cases where DCF fair value lands near the price):

```bash
pnpm run-model            # build all three presets
pnpm run-model saas       # Tech/SaaS  — Nimbus Cloud (NIMB)
pnpm run-model retail     # Retail     — MetroMart Retail (MMRT)
pnpm run-model energy     # Energy     — Helios Energy (HELI)
pnpm run-model energy --out ./heli.xlsx
```

Add your own company by dropping a preset into `run-model.ts`, or import the
generator directly:

```ts
import { buildFinancialModel } from './financial-model.js';

await buildFinancialModel('MyCo.xlsx', {
  company: 'Acme Corp', ticker: 'ACME', sector: 'Industrials',
  price: 120, shares: 50, netDebt: 800,
  assumptions: { revGrowth: 0.10, ebitdaMargin: 0.18, niMargin: 0.09, fcfConv: 0.6,
                 peerEvEbitda: 11, peerPe: 18, peerEvRev: 2, peerPs: 1.8 },
  consensus: { revenue: { prior: 4000, current: 4300, ntm: 4600 } },
});
```

Any field you omit falls back to `DEFAULT_CONFIG` (the Tech/SaaS base case).

### Live data via S&P Capital IQ (`--capiq`)

If you have the **Capital IQ Excel add-in**, build a workbook whose data cells
are live `=CIQ(...)` formulas keyed to a ticker — they populate the moment you
open the file in Excel:

```bash
pnpm run-model --ticker AAPL --capiq --sector "Tech/SaaS" --name "Apple Inc."
# -> Model_AAPL_CapIQ.xlsx
```

What becomes live (the rest stays as your editable judgment):

| Cell(s) | CapIQ formula |
|---|---|
| Company / Price / Net debt / Tax / Next earnings | `IQ_COMPANY_NAME`, `IQ_LASTSALEPRICE`, `IQ_NET_DEBT`, `IQ_EFFECT_TAX_RATE`, `IQ_EST_NEXT_EARNINGS_DATE` |
| Shares | `IQ_MARKETCAP/Price` (falls back to `IQ_SHARESOUTSTANDING`) — unit-robust |
| My Assumptions | seeded from consensus — `RevGrowth = ConsRev/PriorRev-1`, margins = `ConsX/ConsRev` |
| Valuation multiples | the stock's **current trading** multiples, derived live (e.g. `EV/EBITDA = (Px*Sh+NetDebt)/ConsEBITDA`); edit for peer premium |
| WACC build-up | **Risk-free** `IQ_RISK_FREE_RATE`, **ERP** `IQ_EQUITY_RISK_PREMIUM`, **Beta** `IQ_BETA`, **cost of debt** `IQ_COST_DEBT`, **weights** from live market cap & `IQ_TOTAL_DEBT` — WACC recomputes per ticker |
| Valuation cross-checks | analyst target `IQ_PRICE_TARGET`, 52-wk range `IQ_HIGH/LOW_PRICE_52_WEEKS` |
| **House assumptions** (gold cells) | terminal growth, growth fade, FCF conversion, beat/miss rules — **not** ticker-specific; set once. Every live pull is `IFERROR`-guarded with a sensible fallback. |

**Units:** CapIQ currency figures are assumed to arrive in **millions** (institutional default), matching the model's `$M` labels — so no scaling is applied. If your CapIQ returns *actual* units (revenue shows ~391,000,000,000 instead of 391,000), set `CAPIQ_MAG = 1e-6` at the top of `financial-model.ts`.

**Valuation (Goldman-style, adapted from a sell-side CrowdStrike model):**
- **DCF rigor** — proper **unlevered FCF** (EBITDA − capex − cash-tax-on-EBIT − ΔNWC − SBC), EBITDA **margin ramp** to a terminal margin, **mid-year convention**, and a post-/pre-**SBC** basis toggle. Capex/D&A/SBC pulled from CapIQ (IFERROR → % of revenue).
- **EV bridge** — market cap + net debt + minority interest − associates.
- **Football field** (cols I–K) — TV by Gordon **and** exit multiple (with implied-exit-multiple & implied-perpetuity-growth checks); fair value by DCF (Gordon/exit), comps, analyst target; 52-wk range; consolidated **low / midpoint / high** range.
- **Forward multiples grid** — EV/Rev, EV/EBITDA, P/E, FCF yield (current FY & NTM).
- **Comps tab** — comparable companies pulled live from CapIQ (`IQ_COMPARABLE_COMPANIES` auto comp set, with a sector-default fallback), peer **median** multiples → **implied value** on our consensus metrics.
| Consensus Revenue / EBITDA / Net income | `IQ_TOTAL_REV` (actual `IQ_FY`), `IQ_REVENUE_EST` / `IQ_EBITDA_EST` / `IQ_NI_EST` (`IQ_FY+1`, `IQ_NTM`) |

**Dynamic:** every CIQ formula references the `Ticker` named range (the
amber Ticker cell, `Inputs!D5`). Change that one cell — e.g. `AAPL` → `MSFT` —
and the whole model (company, price, consensus, valuation, DCF, charts)
re-pulls automatically. No rebuild needed.

Notes:
- These cells show `#NAME?` until opened in Excel **with the CapIQ add-in** —
  only Excel + CapIQ can evaluate `CIQ()` (the headless build can't).
- Every mnemonic/period/scale lives in one editable map, **`CAPIQ_FIELDS`** in
  `financial-model.ts`. If a cell shows `#NAME?` in Excel, adjust the mnemonic
  there for your CapIQ version (they vary slightly by release).
- Values are scaled to the model's units ($M, decimal %, millions of shares).

### Load Example Template

The workbook ships pre-loaded with a Tech/SaaS sample (Nimbus Cloud, NIMB). The
**Load Example Template** table on the Inputs sheet lists additional sample
companies (MetroMart Retail, Helix Therapeutics) you can copy into the General
block to switch.

---

## Notes

- **XLSX post-processing.** `@mog-sdk/node` 0.8.1's writer drops list-validation
  dropdowns and the fill/font colors for cellIs/expression conditional formats.
  `buildFinancialModel` re-injects both into the OOXML after save (see
  `injectExcelFeatures`), so the sector/scenario **dropdowns** and the
  **beat/miss color-coding** work in Excel, and `fullCalcOnLoad` is set so
  everything (incl. CapIQ) recalculates on open.
- The engine recalculates on write; `calculateFormulas()` / `wb.calculate()` is
  there for explicit recompute after bulk edits.
- Named ranges are created **before** the formulas that reference them — define
  names first or formulas cache `#NAME?`.
- Always `closeWorkbook()` / `wb.dispose()` — the engine holds native handles.
