import type { SheetsClient } from '@/lib/google/sheets';
import { buildHeaderIndex } from '@/features/tasks/api/headers';
import { REPORT_SETTINGS_SHEET, REPORT_SETTINGS_HEADERS } from './headers';

const HEADER_ROW = [
  REPORT_SETTINGS_HEADERS.Category,
  REPORT_SETTINGS_HEADERS.ClientName,
  REPORT_SETTINGS_HEADERS.FolderID,
];

function columnLetter(col1Based: number): string {
  let n = col1Based;
  let out = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    out = String.fromCharCode(65 + m) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function cellAddress(rowNumber: number, col0Based: number): string {
  return `${REPORT_SETTINGS_SHEET}!${columnLetter(col0Based + 1)}${rowNumber}`;
}

export interface ReportSetting {
  category: string;
  /** Recipient name up to (not including) "御中" — e.g. "株式会社PKSHA Technology". */
  clientName: string;
  /** Destination Google Drive folder ID the generated report doc is moved into. */
  folderId: string;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
}

/**
 * Reads the ReportSettings sheet (案件ごとの宛名・保存先フォルダ). Degrades to
 * [] if the sheet doesn't exist yet — this feature is opt-in per category,
 * so a missing sheet just means "no report settings configured anywhere
 * yet", not an error, mirroring how listMeetingCategoryRules degrades.
 */
export async function listReportSettings(
  sheets: SheetsClient,
  spreadsheetId: string,
): Promise<ReportSetting[]> {
  let values: unknown[][];
  try {
    values = await sheets.getValues(spreadsheetId, REPORT_SETTINGS_SHEET);
  } catch {
    return [];
  }
  if (values.length === 0) return [];
  let idx: Record<keyof typeof REPORT_SETTINGS_HEADERS, number>;
  try {
    idx = buildHeaderIndex(values[0]!, REPORT_SETTINGS_HEADERS);
  } catch {
    return [];
  }
  return values
    .slice(1)
    .map((row) => ({
      category: asString(row[idx.Category]),
      clientName: asString(row[idx.ClientName]),
      folderId: asString(row[idx.FolderID]),
    }))
    .filter((s) => s.category.length > 0);
}

/** Finds the setting for one category, or null if not configured. */
export async function getReportSetting(
  sheets: SheetsClient,
  spreadsheetId: string,
  category: string,
): Promise<ReportSetting | null> {
  const all = await listReportSettings(sheets, spreadsheetId);
  return all.find((s) => s.category === category) ?? null;
}

/**
 * Reads the sheet, creating it (with the header row) first if it doesn't
 * exist yet — unlike the read-side listReportSettings, a write here is a
 * deliberate user action ("save this category's report settings"), so it
 * should self-provision the sheet rather than require the user to create it
 * by hand first.
 */
async function ensureReportSettingsSheet(
  sheets: SheetsClient,
  spreadsheetId: string,
): Promise<unknown[][]> {
  let values: unknown[][];
  try {
    values = await sheets.getValues(spreadsheetId, REPORT_SETTINGS_SHEET);
  } catch {
    await sheets.addSheet(spreadsheetId, REPORT_SETTINGS_SHEET);
    values = [];
  }
  if (values.length === 0) {
    await sheets.updateRange(spreadsheetId, `${REPORT_SETTINGS_SHEET}!A1:C1`, [HEADER_ROW]);
    return [HEADER_ROW];
  }
  return values;
}

/** Adds a new category's report settings, or updates the existing row for that category. */
export async function upsertReportSetting(
  sheets: SheetsClient,
  spreadsheetId: string,
  setting: ReportSetting,
): Promise<void> {
  const values = await ensureReportSettingsSheet(sheets, spreadsheetId);
  const headerRow = values[0]!;
  const idx = buildHeaderIndex(headerRow, REPORT_SETTINGS_HEADERS);
  const rowIndex = values.findIndex(
    (row, i) => i > 0 && asString(row[idx.Category]) === setting.category,
  );
  if (rowIndex === -1) {
    const row = new Array<unknown>(headerRow.length).fill('');
    row[idx.Category] = setting.category;
    row[idx.ClientName] = setting.clientName;
    row[idx.FolderID] = setting.folderId;
    await sheets.appendRows(spreadsheetId, REPORT_SETTINGS_SHEET, [row]);
  } else {
    const rowNumber = rowIndex + 1;
    await sheets.batchUpdateValues(spreadsheetId, [
      { range: cellAddress(rowNumber, idx.ClientName), values: [[setting.clientName]] },
      { range: cellAddress(rowNumber, idx.FolderID), values: [[setting.folderId]] },
    ]);
  }
}

/** Removes a category's report settings row. Throws if it isn't configured. */
export async function deleteReportSetting(
  sheets: SheetsClient,
  spreadsheetId: string,
  category: string,
): Promise<void> {
  const values = await sheets.getValues(spreadsheetId, REPORT_SETTINGS_SHEET);
  if (values.length === 0) throw new Error(`Category not found: ${category}`);
  const idx = buildHeaderIndex(values[0]!, REPORT_SETTINGS_HEADERS);
  const rowIndex = values.findIndex((row, i) => i > 0 && asString(row[idx.Category]) === category);
  if (rowIndex === -1) throw new Error(`Category not found: ${category}`);

  const sheetsMeta = await sheets.getSheetMetadata(spreadsheetId);
  const sheet = sheetsMeta.find((s) => s.title === REPORT_SETTINGS_SHEET);
  if (!sheet) throw new Error(`Sheet not found: ${REPORT_SETTINGS_SHEET}`);
  await sheets.deleteRow(spreadsheetId, sheet.sheetId, rowIndex);
}
