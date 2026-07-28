import type { SheetsClient } from '@/lib/google/sheets';
import { buildHeaderIndex } from '@/features/tasks/api/headers';
import { REPORT_SETTINGS_SHEET, REPORT_SETTINGS_HEADERS } from './headers';

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
