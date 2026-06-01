# my-mog-agent

A small **Node.js + TypeScript** toolkit that wraps the
[`@mog-sdk/node`](https://www.npmjs.com/package/@mog-sdk/node) headless
spreadsheet engine into a clean set of **callable tools** — the kind of
functions you can hand to an agent or call directly from a script.

The heavy lifting (582 formula functions, XLSX import/export, charts, tables)
is done by the native Rust engine inside `@mog-sdk/node`. This repo just gives
it an ergonomic, fully-typed surface.

## Requirements

- Node.js >= 18 (developed on 22)
- [pnpm](https://pnpm.io)

## Setup

```bash
pnpm install
pnpm start        # runs the example in index.ts
```

## Scripts

| Script            | Description                                  |
| ----------------- | -------------------------------------------- |
| `pnpm start`      | Run the example script (`index.ts`) via tsx  |
| `pnpm build`      | Compile to `dist/` with `tsc`                |
| `pnpm typecheck`  | Type-check without emitting                  |
| `pnpm clean`      | Remove the `dist/` folder                    |

## The tools (`mog-tools.ts`)

Every function is small, documented and fully typed. You create a workbook
handle once, pass it to the tools, and `closeWorkbook` it when done.

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

You can import them individually or as a bundle:

```ts
import { createWorkbook, addDataToSheet } from './mog-tools.js';
// or
import tools from './mog-tools.js';
```

## Example

```ts
import {
  createWorkbook,
  addDataToSheet,
  createChart,
  exportToXlsx,
  closeWorkbook,
} from './mog-tools.js';

const wb = await createWorkbook();

await addDataToSheet(wb, {
  data: [
    ['Product', 'Q1', 'Q2', 'Total'],
    ['Widgets', 100, 150, '=SUM(B2:C2)'],
    ['Gadgets', 200, 250, '=SUM(B3:C3)'],
  ],
});

await createChart(wb, {
  type: 'column',
  dataRange: 'A1:C3',
  title: 'Quarterly Sales',
  anchorCell: 'F2',
});

await exportToXlsx(wb, 'sales.xlsx');
await closeWorkbook(wb);
```

See [`index.ts`](./index.ts) for a full walkthrough (create → data → formulas →
describe/summarize → chart → export → re-import → CSV round-trip).

## Notes

- The engine recalculates formulas automatically on write; `calculateFormulas()`
  is there for when you want to be explicit after bulk edits.
- Always call `closeWorkbook()` — the engine holds native handles that the
  garbage collector does not free.
