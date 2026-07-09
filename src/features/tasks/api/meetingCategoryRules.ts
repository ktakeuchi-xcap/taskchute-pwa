import type { SheetsClient } from '@/lib/google/sheets';
import { formatDateForSheet, parseSheetDateCell } from '@/lib/google/sheetDate';
import { buildHeaderIndex } from './headers';

export const MEETING_CATEGORY_RULES_SHEET = 'MeetingCategoryRules';

export const MEETING_CATEGORY_RULES_HEADERS = {
  RecurringEventID: 'RecurringEventID',
  Category: 'Category',
  EffectiveFromDate: 'EffectiveFromDate',
} as const;

export interface MeetingCategoryRule {
  recurringEventId: string;
  category: string | null;
  /** null means "applies to every occurrence, past and future". */
  effectiveFromDate: Date | null;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
}

/**
 * Rules created by tagging a meeting with "これ以降のすべての予定"/"すべての予定"
 * (see setMeetingCategory in taskRepository.ts) — consulted by
 * syncMeetingsToSheet when a newly-synced occurrence has no category of its
 * own yet. Missing sheet (not created yet) degrades to "no rules" rather
 * than failing the sync.
 */
export async function listMeetingCategoryRules(
  sheets: SheetsClient,
  spreadsheetId: string,
): Promise<MeetingCategoryRule[]> {
  // Guards the whole read, not just getValues — a sheet that exists but
  // doesn't have the expected header row (e.g. not created correctly yet)
  // must degrade the same way a missing sheet does, not crash the sync.
  try {
    const values = await sheets.getValues(spreadsheetId, MEETING_CATEGORY_RULES_SHEET);
    if (values.length === 0) return [];
    const idx = buildHeaderIndex(values[0]!, MEETING_CATEGORY_RULES_HEADERS);
    return values
      .slice(1)
      .map((row) => ({
        recurringEventId: asString(row[idx.RecurringEventID]),
        category: (() => {
          const c = asString(row[idx.Category]);
          return c.length === 0 ? null : c;
        })(),
        effectiveFromDate: parseSheetDateCell(row[idx.EffectiveFromDate]),
      }))
      .filter((r) => r.recurringEventId.length > 0);
  } catch {
    return [];
  }
}

/**
 * Replaces any existing rule for this series with the given one — a series
 * has at most one active rule at a time; the latest tagging action always
 * wins. Throws (with a clear message) if the sheet hasn't been created yet,
 * since silently dropping a "from now on"/"all" tagging action would be
 * confusing — unlike the read path, this is a user-initiated write.
 */
export async function upsertMeetingCategoryRule(
  sheets: SheetsClient,
  spreadsheetId: string,
  rule: MeetingCategoryRule,
): Promise<void> {
  let values: unknown[][];
  try {
    values = await sheets.getValues(spreadsheetId, MEETING_CATEGORY_RULES_SHEET);
  } catch (err) {
    throw new Error(
      `"${MEETING_CATEGORY_RULES_SHEET}" シートが見つかりません。スプレッドシートに` +
        `${MEETING_CATEGORY_RULES_SHEET}シート（見出し行: RecurringEventID, Category, EffectiveFromDate）` +
        `を追加してください。(${err instanceof Error ? err.message : String(err)})`,
      { cause: err },
    );
  }
  if (values.length === 0) {
    throw new Error(`"${MEETING_CATEGORY_RULES_SHEET}" シートに見出し行がありません`);
  }
  const idx = buildHeaderIndex(values[0]!, MEETING_CATEGORY_RULES_HEADERS);
  const rowIndex = values.findIndex(
    (row, i) => i > 0 && asString(row[idx.RecurringEventID]) === rule.recurringEventId,
  );
  const rowValues = [
    rule.recurringEventId,
    rule.category ?? '',
    rule.effectiveFromDate ? formatDateForSheet(rule.effectiveFromDate) : '',
  ];
  if (rowIndex === -1) {
    await sheets.appendRows(spreadsheetId, MEETING_CATEGORY_RULES_SHEET, [rowValues]);
  } else {
    await sheets.updateRange(
      spreadsheetId,
      `${MEETING_CATEGORY_RULES_SHEET}!A${rowIndex + 1}:C${rowIndex + 1}`,
      [rowValues],
    );
  }
}
