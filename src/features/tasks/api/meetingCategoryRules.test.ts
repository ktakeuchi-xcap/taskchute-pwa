import { describe, expect, it } from 'vitest';
import {
  MEETING_CATEGORY_RULES_SHEET,
  listMeetingCategoryRules,
  upsertMeetingCategoryRule,
  listMeetingWorkloadRules,
  upsertMeetingWorkloadRule,
} from './meetingCategoryRules';
import type { SheetsClient, ValueRange } from '@/lib/google/sheets';
import { dateToSheetSerial } from '@/lib/google/sheetDate';

const HEADER = ['RecurringEventID', 'Category', 'EffectiveFromDate'];
const HEADER_WITH_WORKLOAD = [...HEADER, 'CountsTowardWorkload', 'WorkloadEffectiveFromDate'];

function mockSheets(values: unknown[][] | (() => never)): SheetsClient & {
  updateCalls: Array<{ range: string; values: unknown[][] }>;
  appended: unknown[][][];
  batchUpdates: ValueRange[][];
} {
  const updateCalls: Array<{ range: string; values: unknown[][] }> = [];
  const appended: unknown[][][] = [];
  const batchUpdates: ValueRange[][] = [];
  return {
    updateCalls,
    appended,
    batchUpdates,
    async getValues() {
      if (typeof values === 'function') return values();
      return values;
    },
    async appendRows(_id, _range, rows) {
      appended.push(rows);
    },
    async updateRange(_id, range, rowValues) {
      updateCalls.push({ range, values: rowValues });
    },
    async batchUpdateValues(_id, data) {
      batchUpdates.push(data);
    },
    async deleteRow() {},
    async deleteRows() {},
    async getSheetMetadata() {
      return [{ sheetId: 1, title: MEETING_CATEGORY_RULES_SHEET }];
    },
  };
}

describe('listMeetingCategoryRules', () => {
  it('returns [] when the sheet does not exist yet', async () => {
    const sheets = mockSheets(() => {
      throw new Error('Unable to parse range');
    });
    const rules = await listMeetingCategoryRules(sheets, 'sid');
    expect(rules).toEqual([]);
  });

  it('returns [] for an empty sheet', async () => {
    const sheets = mockSheets([]);
    expect(await listMeetingCategoryRules(sheets, 'sid')).toEqual([]);
  });

  it('parses rows, treating an empty EffectiveFromDate as null (applies to all)', async () => {
    const sheets = mockSheets([HEADER, ['series-a', '案件A', ''], ['series-b', '案件B', '']]);
    const rules = await listMeetingCategoryRules(sheets, 'sid');
    expect(rules).toEqual([
      { recurringEventId: 'series-a', category: '案件A', effectiveFromDate: null },
      { recurringEventId: 'series-b', category: '案件B', effectiveFromDate: null },
    ]);
  });

  it('parses a set EffectiveFromDate', async () => {
    const from = new Date('2026-07-09T00:00:00+09:00');
    const sheets = mockSheets([HEADER, ['series-a', '案件A', dateToSheetSerial(from)]]);
    const rules = await listMeetingCategoryRules(sheets, 'sid');
    expect(rules[0]!.effectiveFromDate?.toISOString()).toBe(from.toISOString());
  });
});

describe('upsertMeetingCategoryRule', () => {
  it('appends a new row when no rule exists for the series yet', async () => {
    const sheets = mockSheets([HEADER]);
    await upsertMeetingCategoryRule(sheets, 'sid', {
      recurringEventId: 'series-a',
      category: '案件A',
      effectiveFromDate: null,
    });
    expect(sheets.appended).toEqual([[['series-a', '案件A', '']]]);
  });

  it('overwrites the existing row for the series instead of appending a duplicate', async () => {
    const sheets = mockSheets([HEADER, ['series-a', '旧案件', '']]);
    await upsertMeetingCategoryRule(sheets, 'sid', {
      recurringEventId: 'series-a',
      category: '新案件',
      effectiveFromDate: null,
    });
    expect(sheets.appended).toHaveLength(0);
    expect(sheets.updateCalls).toEqual([
      { range: `${MEETING_CATEGORY_RULES_SHEET}!A2:C2`, values: [['series-a', '新案件', '']] },
    ]);
  });

  it('throws a clear error when the sheet has not been created yet', async () => {
    const sheets = mockSheets(() => {
      throw new Error('Unable to parse range');
    });
    await expect(
      upsertMeetingCategoryRule(sheets, 'sid', {
        recurringEventId: 'series-a',
        category: '案件A',
        effectiveFromDate: null,
      }),
    ).rejects.toThrowError(/MeetingCategoryRules/);
  });
});

describe('listMeetingWorkloadRules', () => {
  it('returns [] when the sheet does not exist yet', async () => {
    const sheets = mockSheets(() => {
      throw new Error('Unable to parse range');
    });
    expect(await listMeetingWorkloadRules(sheets, 'sid')).toEqual([]);
  });

  it('returns [] when the workload columns have not been added yet', async () => {
    const sheets = mockSheets([HEADER, ['series-a', '案件A', '']]);
    expect(await listMeetingWorkloadRules(sheets, 'sid')).toEqual([]);
  });

  it('parses an explicit FALSE as excluded, and a blank cell as included', async () => {
    const sheets = mockSheets([
      HEADER_WITH_WORKLOAD,
      ['series-a', '', '', 'FALSE', ''],
      ['series-b', '', '', '', ''],
    ]);
    const rules = await listMeetingWorkloadRules(sheets, 'sid');
    expect(rules).toEqual([
      { recurringEventId: 'series-a', countsTowardWorkload: false, effectiveFromDate: null },
      { recurringEventId: 'series-b', countsTowardWorkload: true, effectiveFromDate: null },
    ]);
  });

  it('parses a set WorkloadEffectiveFromDate', async () => {
    const from = new Date('2026-07-09T00:00:00+09:00');
    const sheets = mockSheets([
      HEADER_WITH_WORKLOAD,
      ['series-a', '', '', 'FALSE', dateToSheetSerial(from)],
    ]);
    const rules = await listMeetingWorkloadRules(sheets, 'sid');
    expect(rules[0]!.effectiveFromDate?.toISOString()).toBe(from.toISOString());
  });
});

describe('upsertMeetingWorkloadRule', () => {
  it('appends a new row when no rule (category or workload) exists for the series yet', async () => {
    const sheets = mockSheets([HEADER_WITH_WORKLOAD]);
    await upsertMeetingWorkloadRule(sheets, 'sid', {
      recurringEventId: 'series-a',
      countsTowardWorkload: false,
      effectiveFromDate: null,
    });
    expect(sheets.appended).toEqual([[['series-a', '', '', 'FALSE', '']]]);
  });

  it('updates only the workload cells of an existing row, leaving Category/EffectiveFromDate untouched', async () => {
    const sheets = mockSheets([
      HEADER_WITH_WORKLOAD,
      ['series-a', '既存の案件', '2026-01-01', '', ''],
    ]);
    await upsertMeetingWorkloadRule(sheets, 'sid', {
      recurringEventId: 'series-a',
      countsTowardWorkload: false,
      effectiveFromDate: null,
    });
    expect(sheets.appended).toHaveLength(0);
    expect(sheets.updateCalls).toHaveLength(0);
    expect(sheets.batchUpdates).toEqual([
      [
        { range: `${MEETING_CATEGORY_RULES_SHEET}!D2`, values: [['FALSE']] },
        { range: `${MEETING_CATEGORY_RULES_SHEET}!E2`, values: [['']] },
      ],
    ]);
  });

  it('throws a clear error when the sheet has not been created yet', async () => {
    const sheets = mockSheets(() => {
      throw new Error('Unable to parse range');
    });
    await expect(
      upsertMeetingWorkloadRule(sheets, 'sid', {
        recurringEventId: 'series-a',
        countsTowardWorkload: false,
        effectiveFromDate: null,
      }),
    ).rejects.toThrowError(/MeetingCategoryRules/);
  });

  it('throws a clear error when the workload columns have not been added yet', async () => {
    const sheets = mockSheets([HEADER, ['series-a', '案件A', '']]);
    await expect(
      upsertMeetingWorkloadRule(sheets, 'sid', {
        recurringEventId: 'series-a',
        countsTowardWorkload: false,
        effectiveFromDate: null,
      }),
    ).rejects.toThrowError(/CountsTowardWorkload/);
  });
});
