/**
 * Reading a spreadsheet whose shape is unknown.
 *
 * Exports from accounting systems put a title and a company name above the
 * table, sometimes a blank row, sometimes a leading unnamed column. Demanding
 * a fixed layout means every export needs reshaping by hand before it can be
 * used, which is exactly the work the import is supposed to remove.
 *
 * So the header row is found rather than assumed: the row that most looks like
 * a set of column names with data underneath it.
 */

import * as XLSX from "xlsx";

export interface Sheet {
  name: string;
  headers: string[];
  rows: CellValue[][];
  /** Which row of the file the headers came from, for reporting. */
  headerRowIndex: number;
  /** Rows above the header — usually a title and the company name. */
  preamble: string[];
}

export type CellValue = string | number | boolean | null;

/** Reads every sheet, locating each one's header row independently. */
export function readWorkbook(buffer: ArrayBuffer | Buffer): Sheet[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });

  return wb.SheetNames.map((name) => {
    const grid = XLSX.utils.sheet_to_json<CellValue[]>(wb.Sheets[name], {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    });

    return locateTable(name, grid);
  }).filter((s) => s.headers.length > 0 && s.rows.length > 0);
}

function locateTable(name: string, grid: CellValue[][]): Sheet {
  const headerRowIndex = findHeaderRow(grid);

  if (headerRowIndex < 0) {
    return { name, headers: [], rows: [], headerRowIndex: -1, preamble: [] };
  }

  const rawHeaders = grid[headerRowIndex].map((c) => text(c));

  // Trailing empty columns are padding from the export, not real columns.
  let width = rawHeaders.length;
  while (width > 0 && !rawHeaders[width - 1]) width--;

  const headers = rawHeaders.slice(0, width);

  const rows = grid
    .slice(headerRowIndex + 1)
    .map((r) => Array.from({ length: width }, (_, i) => r[i] ?? null))
    .filter((r) => r.some((c) => text(c) !== ""));

  const preamble = grid
    .slice(0, headerRowIndex)
    .map((r) => r.map((c) => text(c)).filter(Boolean).join(" "))
    .filter(Boolean);

  return { name, headers, rows, headerRowIndex, preamble };
}

/**
 * The header row is the one whose cells read like labels — short, textual,
 * mostly distinct — and which has data under it. Scoring every candidate row
 * beats taking the first non-empty one, which on this kind of export is the
 * report title.
 */
function findHeaderRow(grid: CellValue[][]): number {
  let best = -1;
  let bestScore = 0;

  const limit = Math.min(grid.length, 30);

  for (let i = 0; i < limit; i++) {
    const row = grid[i];
    if (!row) continue;

    const cells = row.map((c) => text(c)).filter(Boolean);
    if (cells.length < 2) continue;

    // Labels are words, not figures.
    const textual = cells.filter((c) => !isNumeric(c)).length;
    const distinct = new Set(cells.map((c) => c.toLowerCase())).size;
    const shortEnough = cells.filter((c) => c.length <= 40).length;

    // A header is worthless without rows beneath it.
    const below = grid.slice(i + 1, i + 6).filter((r) => r?.some((c) => text(c) !== ""));
    if (below.length === 0) continue;

    // The rows below should be wider than a stray note — and typically carry
    // numbers where the header carries words.
    const filledBelow =
      below.reduce((total, r) => total + r.filter((c) => text(c) !== "").length, 0) /
      below.length;

    const score =
      textual * 2 +
      distinct * 1.5 +
      shortEnough +
      Math.min(filledBelow, cells.length) * 2 -
      // A title row is one or two wide cells; penalise narrow rows.
      (cells.length < 3 ? 20 : 0);

    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }

  return best;
}

export function text(value: CellValue): string {
  if (value == null) return "";
  return String(value).trim();
}

export function isNumeric(value: string): boolean {
  if (!value) return false;
  return /^-?[\d\s.,]+$/.test(value) && /\d/.test(value);
}

/**
 * Parses a number written the Norwegian way — space as thousands separator,
 * comma as decimal — as well as the plain form. Returns null when the cell is
 * not a number at all, so a missing amount is never silently read as zero.
 */
export function parseNumber(value: CellValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const raw = text(value);
  if (!raw) return null;

  const cleaned = raw
    .replace(/ /g, "")
    .replace(/\s/g, "")
    .replace(/kr$/i, "")
    .replace(/,/g, ".");

  // A thousands separator written as a dot: 1.234.567
  const dots = (cleaned.match(/\./g) ?? []).length;
  const normalised =
    dots > 1 ? cleaned.replace(/\.(?=.*\.)/g, "") : cleaned;

  const parsed = Number(normalised);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Excel stores dates as a serial number counted from 30 December 1899. A cell
 * may also arrive as text in any of the usual orders.
 */
export function parseDate(value: CellValue): string | null {
  if (typeof value === "number") {
    if (value < 1 || value > 80_000) return null;
    const ms = Date.UTC(1899, 11, 30) + value * 86_400_000;
    return new Date(ms).toISOString().slice(0, 10);
  }

  const raw = text(value);
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${year}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }

  return null;
}

/** Reads a yes/no cell in either language, or a checkbox. */
export function parseBoolean(value: CellValue): boolean | null {
  if (typeof value === "boolean") return value;

  const raw = text(value).toLowerCase();
  if (!raw) return null;

  if (["ja", "yes", "true", "1", "x", "aktiv", "active"].includes(raw)) return true;
  if (["nei", "no", "false", "0", "inaktiv", "inactive"].includes(raw)) return false;

  return null;
}
