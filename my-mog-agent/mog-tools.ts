/**
 * mog-tools.ts
 * -------------
 * A clean, fully-typed set of tool functions built on top of the
 * `@mog-sdk/node` headless spreadsheet engine.
 *
 * Each exported function is a small, self-describing "tool" that an agent
 * (or any caller) can invoke. Functions operate on a `Workbook` handle that
 * you create once with `createWorkbook()` / `importFromXlsx()` and pass around,
 * then release with `closeWorkbook()` when you are done.
 *
 * Everything here is a thin, ergonomic wrapper — the real spreadsheet work
 * (582 formula functions, XLSX I/O, charts, tables) is done by the native
 * Rust engine inside `@mog-sdk/node`.
 */

import {
  createWorkbook as sdkCreateWorkbook,
  type Workbook,
  type Worksheet,
  type CellValue,
} from '@mog-sdk/node';
import { readFileSync, writeFileSync } from 'node:fs';

/** A value that can be written into a cell. */
export type CellInput = string | number | boolean | null | Date;

/** A two-dimensional block of cell values (rows of columns). */
export type Grid = CellInput[][];

/** Chart kinds supported by the convenience `createChart` tool. */
export type ChartType =
  | 'bar'
  | 'column'
  | 'line'
  | 'area'
  | 'pie'
  | 'doughnut'
  | 'scatter'
  | 'bubble'
  | 'combo'
  | 'radar'
  | 'stock'
  | 'funnel'
  | 'waterfall';

export type { Workbook, Worksheet, CellValue };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a worksheet by name, falling back to the active sheet.
 * Optionally create the sheet if it does not exist yet.
 */
async function resolveSheet(
  wb: Workbook,
  sheetName?: string,
  createIfMissing = false,
): Promise<Worksheet> {
  if (!sheetName) return wb.activeSheet;
  const existing = await wb.findSheet(sheetName);
  if (existing) return existing;
  if (createIfMissing) return wb.sheets.add(sheetName);
  throw new Error(
    `Sheet "${sheetName}" not found. Pass { createSheet: true } to create it.`,
  );
}

/** Convert an A1 cell address (e.g. "C5") into 0-based { row, col }. */
function parseA1(address: string): { row: number; col: number } {
  const match = /^([A-Za-z]+)(\d+)$/.exec(address.trim());
  if (!match) throw new Error(`Invalid A1 cell address: "${address}"`);
  const [, letters, digits] = match as unknown as [string, string, string];
  let col = 0;
  for (const ch of letters.toUpperCase()) {
    col = col * 26 + (ch.charCodeAt(0) - 64);
  }
  return { row: Number(digits) - 1, col: col - 1 };
}

/** Coerce a raw CSV field into a number/boolean/null where it makes sense. */
function inferType(raw: string): CellInput {
  if (raw === '') return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  // Only treat as a number when the whole field is numeric.
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

/** Minimal RFC-4180 CSV parser (handles quoted fields, commas and newlines). */
function parseCsv(text: string, separator = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === separator) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  // Flush the trailing field/row (files may not end with a newline).
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

/**
 * createWorkbook — start a new, empty workbook.
 *
 * @returns A live `Workbook` handle. Remember to `closeWorkbook(wb)` when done.
 */
export async function createWorkbook(): Promise<Workbook> {
  return sdkCreateWorkbook();
}

export interface AddDataOptions {
  /** The rows/columns of data to write. */
  data: Grid;
  /** Target sheet name. Defaults to the workbook's active sheet. */
  sheet?: string;
  /** Top-left anchor cell in A1 notation. Defaults to "A1". */
  startCell?: string;
  /** Create the target sheet if it does not already exist. */
  createSheet?: boolean;
}

/**
 * addDataToSheet — write a 2D block of values into a sheet.
 *
 * Strings beginning with "=" are treated as formulas by the engine.
 *
 * @returns The number of cells written.
 */
export async function addDataToSheet(
  wb: Workbook,
  options: AddDataOptions,
): Promise<number> {
  const { data, sheet, startCell = 'A1', createSheet = false } = options;
  if (data.length === 0) return 0;
  const ws = await resolveSheet(wb, sheet, createSheet);
  await ws.setRange(startCell, data);
  return data.reduce((sum, row) => sum + row.length, 0);
}

/**
 * setCellFormula — write a single formula (or value) into one cell.
 */
export async function setCellFormula(
  wb: Workbook,
  address: string,
  formula: string | CellInput,
  sheet?: string,
): Promise<void> {
  const ws = await resolveSheet(wb, sheet);
  await ws.setCell(address, formula);
}

/**
 * calculateFormulas — force a full recalculation of every formula.
 *
 * The engine recalculates automatically on write, so this is mainly useful
 * after bulk edits or when you want to be explicit.
 */
export async function calculateFormulas(wb: Workbook): Promise<void> {
  await wb.calculate();
}

/**
 * getCellValue — read the computed value of a single cell.
 */
export async function getCellValue(
  wb: Workbook,
  address: string,
  sheet?: string,
): Promise<CellValue> {
  const ws = await resolveSheet(wb, sheet);
  return ws.getValue(address);
}

/**
 * readSheet — read every cell value of a sheet as a 2D array.
 */
export async function readSheet(
  wb: Workbook,
  sheet?: string,
): Promise<CellValue[][]> {
  const ws = await resolveSheet(wb, sheet);
  return ws.getData();
}

/**
 * describeSheet — an LLM-friendly, line-by-line description of a range,
 * including formulas. Defaults to the sheet's used range.
 */
export async function describeSheet(
  wb: Workbook,
  sheet?: string,
  range?: string,
): Promise<string> {
  const ws = await resolveSheet(wb, sheet);
  return range ? ws.describeRange(range) : ws.describe();
}

export interface SummarizeOptions {
  /** Include a sample of the data in the summary (default: true). */
  includeData?: boolean;
  /** Maximum number of sample rows. */
  maxRows?: number;
  /** Maximum number of sample columns. */
  maxCols?: number;
}

/**
 * summarizeSheet — a compact overview of a sheet: dimensions, headers,
 * value/formula counts and a small data sample. Ideal for feeding to an LLM.
 */
export async function summarizeSheet(
  wb: Workbook,
  sheet?: string,
  options: SummarizeOptions = {},
): Promise<string> {
  const ws = await resolveSheet(wb, sheet);
  return ws.summarize(options);
}

/**
 * exportToXlsx — serialize the workbook to an `.xlsx` file on disk.
 *
 * @returns The raw bytes that were written (also handy for buffers/uploads).
 */
export async function exportToXlsx(
  wb: Workbook,
  path: string,
): Promise<Uint8Array> {
  return wb.save(path);
}

export interface ImportXlsxOptions {
  /** Import computed values only, skipping formula reconstruction. */
  valuesOnly?: boolean;
}

/**
 * importFromXlsx — open an existing `.xlsx` workbook from a path or buffer.
 *
 * @returns A live `Workbook` handle. Remember to `closeWorkbook(wb)` when done.
 */
export async function importFromXlsx(
  source: string | Uint8Array,
  options: ImportXlsxOptions = {},
): Promise<Workbook> {
  // createWorkbook has distinct overloads for file paths vs. raw buffers.
  return typeof source === 'string'
    ? sdkCreateWorkbook(source, options)
    : sdkCreateWorkbook(source, options);
}

export interface ImportCsvOptions {
  /** Treat `input` as a file path instead of raw CSV text. */
  fromFile?: boolean;
  /** Field separator (default ","). */
  separator?: string;
  /** Convert numeric/boolean-looking fields to real values (default true). */
  inferTypes?: boolean;
  /** Name for the sheet that receives the data (default: the active sheet). */
  sheetName?: string;
}

/**
 * importFromCsv — build a new workbook from CSV text (or a CSV file).
 *
 * @returns A live `Workbook` handle. Remember to `closeWorkbook(wb)` when done.
 */
export async function importFromCsv(
  input: string,
  options: ImportCsvOptions = {},
): Promise<Workbook> {
  const {
    fromFile = false,
    separator = ',',
    inferTypes = true,
    sheetName,
  } = options;

  const text = fromFile ? readFileSync(input, 'utf8') : input;
  const rawRows = parseCsv(text, separator);
  const grid: Grid = inferTypes
    ? rawRows.map((row) => row.map(inferType))
    : rawRows;

  const wb = await sdkCreateWorkbook();
  if (grid.length > 0) {
    const ws = sheetName
      ? await wb.sheets.add(sheetName)
      : wb.activeSheet;
    await ws.setRange('A1', grid);
  }
  return wb;
}

/**
 * sheetToCsv — export a sheet (or a range of it) to an RFC-4180 CSV string.
 */
export async function sheetToCsv(
  wb: Workbook,
  sheet?: string,
  range?: string,
): Promise<string> {
  const ws = await resolveSheet(wb, sheet);
  return ws.toCSV(range ? { range } : undefined);
}

/**
 * sheetToJson — export a sheet to an array of row objects keyed by header.
 */
export async function sheetToJson(
  wb: Workbook,
  sheet?: string,
): Promise<Record<string, CellValue>[]> {
  const ws = await resolveSheet(wb, sheet);
  return ws.toJSON();
}

export interface CreateChartOptions {
  /** Data range in A1 notation, e.g. "A1:C5". */
  dataRange: string;
  /** Chart type (default: "column"). */
  type?: ChartType;
  /** Target sheet name. Defaults to the active sheet. */
  sheet?: string;
  /** Chart title. */
  title?: string;
  /** Anchor cell in A1 notation (e.g. "F2"). Takes precedence over row/col. */
  anchorCell?: string;
  /** Anchor row (0-based). Used when `anchorCell` is not given. Default 0. */
  anchorRow?: number;
  /** Anchor column (0-based). Used when `anchorCell` is not given. Default 5. */
  anchorCol?: number;
  /** Width of the chart in cell columns (default 8). */
  width?: number;
  /** Height of the chart in cell rows (default 15). */
  height?: number;
  /** Optional series-labels range in A1 notation. */
  seriesRange?: string;
  /** Optional category-labels range in A1 notation. */
  categoryRange?: string;
}

/**
 * createChart — add a chart to a sheet, anchored at a cell.
 *
 * @returns The id of the created chart.
 */
export async function createChart(
  wb: Workbook,
  options: CreateChartOptions,
): Promise<string> {
  const ws = await resolveSheet(wb, options.sheet);
  const anchor = options.anchorCell
    ? parseA1(options.anchorCell)
    : { row: options.anchorRow ?? 0, col: options.anchorCol ?? 5 };

  const chart = await ws.charts.add({
    type: options.type ?? 'column',
    dataRange: options.dataRange,
    anchorRow: anchor.row,
    anchorCol: anchor.col,
    width: options.width ?? 8,
    height: options.height ?? 15,
    ...(options.title ? { title: options.title } : {}),
    ...(options.seriesRange ? { seriesRange: options.seriesRange } : {}),
    ...(options.categoryRange ? { categoryRange: options.categoryRange } : {}),
  });
  return chart.id;
}

export interface AddTableOptions {
  /** Table name (auto-generated if omitted). */
  name?: string;
  /** Whether the first row contains headers (default true). */
  hasHeaders?: boolean;
  /** Target sheet name. Defaults to the active sheet. */
  sheet?: string;
}

/**
 * addTable — turn a range into a structured table.
 *
 * @returns The name of the created table.
 */
export async function addTable(
  wb: Workbook,
  range: string,
  options: AddTableOptions = {},
): Promise<string> {
  const ws = await resolveSheet(wb, options.sheet);
  const info = await ws.tables.add(range, {
    ...(options.name ? { name: options.name } : {}),
    hasHeaders: options.hasHeaders ?? true,
  });
  return info.name;
}

/**
 * closeWorkbook — release the native engine resources for a workbook.
 *
 * Always call this when you are finished; the engine holds native handles
 * that are not freed by the garbage collector.
 */
export async function closeWorkbook(wb: Workbook): Promise<void> {
  await wb.dispose();
}

/** Helper bundle so callers can `import tools from './mog-tools.js'`. */
export const tools = {
  createWorkbook,
  addDataToSheet,
  setCellFormula,
  calculateFormulas,
  getCellValue,
  readSheet,
  describeSheet,
  summarizeSheet,
  exportToXlsx,
  importFromXlsx,
  importFromCsv,
  sheetToCsv,
  sheetToJson,
  createChart,
  addTable,
  closeWorkbook,
};

export default tools;
