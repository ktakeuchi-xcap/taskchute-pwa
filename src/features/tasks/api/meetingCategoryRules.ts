import type { SheetsClient } from '@/lib/google/sheets';
import { formatDateForSheet, parseSheetDateCell } from '@/lib/google/sheetDate';
import { buildHeaderIndex } from './headers';

export const MEETING_CATEGORY_RULES_SHEET = 'MeetingCategoryRules';

export const MEETING_CATEGORY_RULES_HEADERS = {
  RecurringEventID: 'RecurringEventID',
  Category: 'Category',
  EffectiveFromDate: 'EffectiveFromDate',
} as const;

// Looked up leniently (not via buildHeaderIndex/MEETING_CATEGORY_RULES_HEADERS)
// so a sheet created before this feature existed keeps working for category
// rules — "from now on"/"all" workload tagging on a meeting just isn't
// available until these two columns are added (see upsertMeetingWorkloadRule,
// which throws a clear, actionable error for that case rather than silently
// dropping the write).
const COUNTS_TOWARD_WORKLOAD_HEADER = 'CountsTowardWorkload';
const WORKLOAD_EFFECTIVE_FROM_HEADER = 'WorkloadEffectiveFromDate';

export interface MeetingCategoryRule {
  recurringEventId: string;
  category: string | null;
  /** null means "applies to every occurrence, past and future". */
  effectiveFromDate: Date | null;
}

/**
 * Independent of MeetingCategoryRule (own columns, own effective-from date)
 * so tagging a series's category "from now on" can never silently reset a
 * previously-set workload-exclusion rule for that same series, or vice versa.
 */
export interface MeetingWorkloadRule {
  recurringEventId: string;
  countsTowardWorkload: boolean;
  /** null means "applies to every occurrence, past and future". */
  effectiveFromDate: Date | null;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
}

// See the identical helper in serializers.ts: getValues reads with
// valueRenderOption=UNFORMATTED_VALUE, so a Sheets checkbox cell comes back
// as a real JS boolean — String(false) is lowercase "false", which would
// never match a plain `!== 'FALSE'` string comparison.
function isFalseFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value === false;
  return asString(value).trim().toUpperCase() === 'FALSE';
}

function findColumn(headerRow: unknown[], header: string): number {
  return headerRow.findIndex((cell) => cell === header);
}

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
  return `${MEETING_CATEGORY_RULES_SHEET}!${columnLetter(col0Based + 1)}${rowNumber}`;
}

function parseCategoryRulesFromValues(values: unknown[][]): MeetingCategoryRule[] {
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
}

function parseWorkloadRulesFromValues(values: unknown[][]): MeetingWorkloadRule[] {
  if (values.length === 0) return [];
  const headerRow = values[0]!;
  const idx = buildHeaderIndex(headerRow, MEETING_CATEGORY_RULES_HEADERS);
  const countsCol = findColumn(headerRow, COUNTS_TOWARD_WORKLOAD_HEADER);
  if (countsCol === -1) return [];
  const effCol = findColumn(headerRow, WORKLOAD_EFFECTIVE_FROM_HEADER);
  return values
    .slice(1)
    .map((row) => ({
      recurringEventId: asString(row[idx.RecurringEventID]),
      countsTowardWorkload: !isFalseFlag(row[countsCol]),
      effectiveFromDate: effCol === -1 ? null : parseSheetDateCell(row[effCol]),
    }))
    .filter((r) => r.recurringEventId.length > 0);
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
    return parseCategoryRulesFromValues(values);
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

/**
 * Rules created by excluding a meeting from workload with "これ以降のすべての
 * 予定"/"すべての予定" scope (see setCountsTowardWorkload in
 * taskRepository.ts) — consulted by syncMeetingsToSheet when a newly-synced
 * occurrence doesn't have its own CountsTowardWorkload value yet. Degrades to
 * "no rules" if the sheet, or just these two columns, aren't there yet —
 * same as listMeetingCategoryRules.
 */
export async function listMeetingWorkloadRules(
  sheets: SheetsClient,
  spreadsheetId: string,
): Promise<MeetingWorkloadRule[]> {
  try {
    const values = await sheets.getValues(spreadsheetId, MEETING_CATEGORY_RULES_SHEET);
    return parseWorkloadRulesFromValues(values);
  } catch {
    return [];
  }
}

/**
 * Combines listMeetingCategoryRules and listMeetingWorkloadRules into a
 * single read of the MeetingCategoryRules sheet — both used to fetch it
 * independently, doubling this call on every meeting sync for no reason
 * (and doubling the odds of a stray 429 along the way).
 */
export async function listMeetingRules(
  sheets: SheetsClient,
  spreadsheetId: string,
): Promise<{ category: MeetingCategoryRule[]; workload: MeetingWorkloadRule[] }> {
  try {
    const values = await sheets.getValues(spreadsheetId, MEETING_CATEGORY_RULES_SHEET);
    return {
      category: parseCategoryRulesFromValues(values),
      workload: parseWorkloadRulesFromValues(values),
    };
  } catch {
    return { category: [], workload: [] };
  }
}

/**
 * Replaces any existing workload rule for this series. Only ever touches the
 * CountsTowardWorkload/WorkloadEffectiveFromDate cells of that series' row
 * (appending a new row if the series has no row yet, e.g. no category rule
 * either) — never the Category/EffectiveFromDate cells, so this can't
 * clobber an independently-set category rule for the same series (or vice
 * versa; see upsertMeetingCategoryRule). Throws a clear error if the sheet or
 * these two columns don't exist yet, since silently dropping a "from now
 * on"/"all" exclusion action would be confusing.
 */
export async function upsertMeetingWorkloadRule(
  sheets: SheetsClient,
  spreadsheetId: string,
  rule: MeetingWorkloadRule,
): Promise<void> {
  let values: unknown[][];
  try {
    values = await sheets.getValues(spreadsheetId, MEETING_CATEGORY_RULES_SHEET);
  } catch (err) {
    throw new Error(
      `"${MEETING_CATEGORY_RULES_SHEET}" シートが見つかりません。スプレッドシートに` +
        `${MEETING_CATEGORY_RULES_SHEET}シート（見出し行: RecurringEventID, Category, EffectiveFromDate, ` +
        `CountsTowardWorkload, WorkloadEffectiveFromDate）を追加してください。` +
        `(${err instanceof Error ? err.message : String(err)})`,
      { cause: err },
    );
  }
  if (values.length === 0) {
    throw new Error(`"${MEETING_CATEGORY_RULES_SHEET}" シートに見出し行がありません`);
  }
  const headerRow = values[0]!;
  const idx = buildHeaderIndex(headerRow, MEETING_CATEGORY_RULES_HEADERS);
  const countsCol = findColumn(headerRow, COUNTS_TOWARD_WORKLOAD_HEADER);
  const effCol = findColumn(headerRow, WORKLOAD_EFFECTIVE_FROM_HEADER);
  if (countsCol === -1 || effCol === -1) {
    throw new Error(
      `"${MEETING_CATEGORY_RULES_SHEET}" シートに "${COUNTS_TOWARD_WORKLOAD_HEADER}" と ` +
        `"${WORKLOAD_EFFECTIVE_FROM_HEADER}" の見出し列を追加してください` +
        '（会議を「これ以降」「すべて」の範囲で工数対象外に設定するために必要です）',
    );
  }

  const rowIndex = values.findIndex(
    (row, i) => i > 0 && asString(row[idx.RecurringEventID]) === rule.recurringEventId,
  );
  const countsValue = rule.countsTowardWorkload ? '' : 'FALSE';
  const effValue = rule.effectiveFromDate ? formatDateForSheet(rule.effectiveFromDate) : '';

  if (rowIndex === -1) {
    const width = Math.max(idx.RecurringEventID, countsCol, effCol) + 1;
    const row = new Array<unknown>(width).fill('');
    row[idx.RecurringEventID] = rule.recurringEventId;
    row[countsCol] = countsValue;
    row[effCol] = effValue;
    await sheets.appendRows(spreadsheetId, MEETING_CATEGORY_RULES_SHEET, [row]);
  } else {
    const rowNumber = rowIndex + 1;
    await sheets.batchUpdateValues(spreadsheetId, [
      { range: cellAddress(rowNumber, countsCol), values: [[countsValue]] },
      { range: cellAddress(rowNumber, effCol), values: [[effValue]] },
    ]);
  }
}
