/**
 * index.ts — example usage of the mog-tools toolkit.
 *
 * Run with:  pnpm start
 *
 * It walks through the full lifecycle:
 *   create → add data → formulas → describe/summarize → chart →
 *   export xlsx → re-import → CSV round-trip.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createWorkbook,
  addDataToSheet,
  setCellFormula,
  calculateFormulas,
  getCellValue,
  describeSheet,
  summarizeSheet,
  createChart,
  addTable,
  exportToXlsx,
  importFromXlsx,
  importFromCsv,
  sheetToCsv,
  sheetToJson,
  closeWorkbook,
} from './mog-tools.js';

const here = dirname(fileURLToPath(import.meta.url));
const xlsxPath = join(here, 'sales-report.xlsx');

async function main(): Promise<void> {
  // 1. Create a fresh workbook.
  const wb = await createWorkbook();

  // 2. Add some tabular data. Strings starting with "=" become formulas.
  await addDataToSheet(wb, {
    data: [
      ['Product', 'Q1', 'Q2', 'Q3', 'Total'],
      ['Widgets', 100, 150, 130, '=SUM(B2:D2)'],
      ['Gadgets', 200, 250, 270, '=SUM(B3:D3)'],
      ['Gizmos', 90, 80, 110, '=SUM(B4:D4)'],
    ],
    startCell: 'A1',
  });

  // 3. Add a grand-total formula in a single cell, then recalc explicitly.
  await setCellFormula(wb, 'E5', '=SUM(E2:E4)');
  await calculateFormulas(wb);

  console.log('Grand total (E5):', await getCellValue(wb, 'E5'));

  // 4. Turn the data into a structured table.
  const tableName = await addTable(wb, 'A1:E4', { name: 'Sales' });
  console.log('Created table:', tableName);

  // 5. Inspect the sheet — both a description and an LLM-friendly summary.
  console.log('\n--- describeSheet ---');
  console.log(await describeSheet(wb, undefined, 'A1:E5'));

  console.log('\n--- summarizeSheet ---');
  console.log(await summarizeSheet(wb));

  // 6. Add a chart over the per-product totals.
  const chartId = await createChart(wb, {
    type: 'column',
    dataRange: 'A1:D4',
    title: 'Quarterly Sales by Product',
    anchorCell: 'G2',
  });
  console.log('\nCreated chart:', chartId);

  // 7. Export to an .xlsx file on disk.
  const bytes = await exportToXlsx(wb, xlsxPath);
  console.log(`\nExported ${bytes.byteLength} bytes -> ${xlsxPath}`);
  await closeWorkbook(wb);

  // 8. Re-import the file and confirm the formulas survived the round-trip.
  const reopened = await importFromXlsx(xlsxPath);
  console.log('Re-imported E5:', await getCellValue(reopened, 'E5'));
  console.log('\n--- sheet as JSON ---');
  console.log(await sheetToJson(reopened));
  await closeWorkbook(reopened);

  // 9. Build a workbook straight from CSV text, then export it back to CSV.
  const csv = 'City,Population\nCairo,10000000\nAlexandria,5200000';
  const fromCsv = await importFromCsv(csv);
  console.log('\n--- CSV round-trip ---');
  console.log(await sheetToCsv(fromCsv));
  await closeWorkbook(fromCsv);

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
