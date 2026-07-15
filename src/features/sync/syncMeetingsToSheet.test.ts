import { describe, expect, it } from 'vitest';
import { syncMeetingsToSheet } from './syncMeetingsToSheet';
import { TASKDB_HEADERS } from '@/features/tasks/api/headers';
import type { SheetsClient, ValueRange } from '@/lib/google/sheets';
import type { CalendarClient, CalendarEvent } from '@/lib/google/calendar';
import { dateToSheetSerial } from '@/lib/google/sheetDate';

const HEADER = [
  TASKDB_HEADERS.TaskID,
  TASKDB_HEADERS.TaskName,
  TASKDB_HEADERS.Category,
  TASKDB_HEADERS.EstimateMinutes,
  TASKDB_HEADERS.ScheduledStartTime,
  TASKDB_HEADERS.ScheduledEndTime,
  TASKDB_HEADERS.ActualStartTime,
  TASKDB_HEADERS.ActualEndTime,
  TASKDB_HEADERS.Status,
  TASKDB_HEADERS.CalendarEventID,
  'Source',
];

function mockSheets(
  initialTaskDbValues: unknown[][],
  rulesValues: unknown[][] = [],
): SheetsClient & {
  appended: unknown[][][];
  batchUpdates: ValueRange[][];
  deletedRows: Array<{ sheetId: number; rowIndex: number }>;
  deleteCallCount: number;
} {
  // A live, mutating copy — deleteRow/appendRows must be reflected in the
  // next getValues call for the dedup pre-pass's "delete then re-read" flow
  // to be testable.
  let taskDbValues = initialTaskDbValues.map((row) => [...row]);
  const appended: unknown[][][] = [];
  const batchUpdates: ValueRange[][] = [];
  const deletedRows: Array<{ sheetId: number; rowIndex: number }> = [];
  const state = { deleteCallCount: 0 };
  return {
    appended,
    batchUpdates,
    deletedRows,
    get deleteCallCount() {
      return state.deleteCallCount;
    },
    async getValues(_id, range) {
      return range.startsWith('MeetingCategoryRules') ? rulesValues : taskDbValues;
    },
    async appendRows(_id, _range, rows) {
      appended.push(rows);
      taskDbValues = [...taskDbValues, ...rows];
    },
    async updateRange() {},
    async batchUpdateValues(_id, data) {
      batchUpdates.push(data);
    },
    async deleteRow(_id, sheetId, rowIndex) {
      state.deleteCallCount += 1;
      deletedRows.push({ sheetId, rowIndex });
      taskDbValues = taskDbValues.filter((_, i) => i !== rowIndex);
    },
    async deleteRows(_id, sheetId, rowIndexes) {
      state.deleteCallCount += 1;
      for (const rowIndex of [...rowIndexes].sort((a, b) => b - a)) {
        deletedRows.push({ sheetId, rowIndex });
      }
      const toRemove = new Set(rowIndexes);
      taskDbValues = taskDbValues.filter((_, i) => !toRemove.has(i));
    },
    async getSheetMetadata() {
      return [{ sheetId: 42, title: 'TaskDB' }];
    },
  };
}

function mockCalendar(events: CalendarEvent[]): CalendarClient {
  return {
    async list() {
      return events;
    },
    async insert() {
      throw new Error('not used');
    },
    async patch() {
      throw new Error('not used (one-way sync)');
    },
    async delete() {
      throw new Error('not used (one-way sync)');
    },
  };
}

function baseEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'evt-1',
    summary: '定例会議',
    start: new Date('2026-07-09T10:00:00+09:00'),
    end: new Date('2026-07-09T10:30:00+09:00'),
    colorId: null,
    isAllDay: false,
    selfResponseStatus: null,
    recurringEventId: null,
    ...overrides,
  };
}

describe('syncMeetingsToSheet', () => {
  it('is a no-op when the sheet has no Source column yet', async () => {
    const headerWithoutSource = HEADER.slice(0, -1);
    const sheets = mockSheets([headerWithoutSource]);
    const calendar = mockCalendar([baseEvent()]);
    const result = await syncMeetingsToSheet({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      meetingCalendarId: 'me@example.com',
    });
    expect(result).toEqual({ addedCount: 0, updatedCount: 0, deletedCount: 0 });
    expect(sheets.appended).toHaveLength(0);
  });

  it('appends a new row for a new meeting, tagged with Source=Meeting', async () => {
    const sheets = mockSheets([HEADER]);
    const calendar = mockCalendar([baseEvent()]);
    const result = await syncMeetingsToSheet({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      meetingCalendarId: 'me@example.com',
      generateId: () => 'tid-new',
    });
    expect(result.addedCount).toBe(1);
    expect(sheets.appended).toHaveLength(1);
    const [row] = sheets.appended[0]!;
    expect(row![HEADER.indexOf(TASKDB_HEADERS.TaskName)]).toBe('定例会議');
    expect(row![HEADER.indexOf('Source')]).toBe('Meeting');
    expect(row![HEADER.indexOf(TASKDB_HEADERS.EstimateMinutes)]).toBe(30);
  });

  it('excludes events the user has declined', async () => {
    const sheets = mockSheets([HEADER]);
    const calendar = mockCalendar([baseEvent({ selfResponseStatus: 'declined' })]);
    const result = await syncMeetingsToSheet({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      meetingCalendarId: 'me@example.com',
    });
    expect(result.addedCount).toBe(0);
  });

  it('sets estimate to 0 for all-day events instead of the raw date-diff duration', async () => {
    const sheets = mockSheets([HEADER]);
    const calendar = mockCalendar([
      baseEvent({
        isAllDay: true,
        start: new Date('2026-07-10T00:00:00+09:00'),
        end: new Date('2026-07-11T00:00:00+09:00'),
      }),
    ]);
    const result = await syncMeetingsToSheet({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      meetingCalendarId: 'me@example.com',
    });
    expect(result.addedCount).toBe(1);
    const [row] = sheets.appended[0]!;
    expect(row![HEADER.indexOf(TASKDB_HEADERS.EstimateMinutes)]).toBe(0);
  });

  it('updates title/time for an existing meeting row when the event changes', async () => {
    const oldStart = new Date('2026-07-09T10:00:00+09:00');
    const oldEnd = new Date('2026-07-09T10:30:00+09:00');
    const newStart = new Date('2026-07-09T11:00:00+09:00');
    const newEnd = new Date('2026-07-09T11:45:00+09:00');
    const sheets = mockSheets([
      HEADER,
      [
        'tid-a',
        '旧タイトル',
        '',
        30,
        dateToSheetSerial(oldStart),
        dateToSheetSerial(oldEnd),
        '',
        '',
        'Not Started',
        'evt-a',
        'Meeting',
      ],
    ]);
    const calendar = mockCalendar([
      baseEvent({ id: 'evt-a', summary: '新タイトル', start: newStart, end: newEnd }),
    ]);
    const result = await syncMeetingsToSheet({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      meetingCalendarId: 'me@example.com',
    });
    expect(result.updatedCount).toBe(1);
    expect(sheets.appended).toHaveLength(0);
    const ranges = sheets.batchUpdates[0]!.map((u) => u.range);
    expect(ranges.some((r) => /TaskDB!B2$/.test(r))).toBe(true); // TaskName
    expect(ranges.some((r) => /TaskDB!E2$/.test(r))).toBe(true); // ScheduledStartTime
  });

  it('removes a meeting row whose event was deleted (or declined) within the sync window', async () => {
    const start = new Date('2026-07-09T10:00:00+09:00');
    const end = new Date('2026-07-09T10:30:00+09:00');
    const sheets = mockSheets([
      HEADER,
      [
        'tid-a',
        '削除された会議',
        '',
        30,
        dateToSheetSerial(start),
        dateToSheetSerial(end),
        '',
        '',
        'Not Started',
        'evt-a',
        'Meeting',
      ],
    ]);
    const calendar = mockCalendar([]);
    const result = await syncMeetingsToSheet({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      meetingCalendarId: 'me@example.com',
      now: () => new Date('2026-07-09T08:00:00+09:00'),
    });
    expect(result.deletedCount).toBe(1);
    expect(sheets.deletedRows).toEqual([{ sheetId: 42, rowIndex: 1 }]);
  });

  it('removes several vanished meeting rows in a single batched call, not one per row', async () => {
    const start = new Date('2026-07-09T10:00:00+09:00');
    const end = new Date('2026-07-09T10:30:00+09:00');
    const vanishedRow = (taskId: string, calendarEventId: string) => [
      taskId,
      '削除された会議',
      '',
      30,
      dateToSheetSerial(start),
      dateToSheetSerial(end),
      '',
      '',
      'Not Started',
      calendarEventId,
      'Meeting',
    ];
    const sheets = mockSheets([
      HEADER,
      vanishedRow('tid-a', 'evt-a'),
      vanishedRow('tid-b', 'evt-b'),
      vanishedRow('tid-c', 'evt-c'),
    ]);
    const calendar = mockCalendar([]);
    const result = await syncMeetingsToSheet({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      meetingCalendarId: 'me@example.com',
      now: () => new Date('2026-07-09T08:00:00+09:00'),
    });
    expect(result.deletedCount).toBe(3);
    expect(sheets.deleteCallCount).toBe(1);
    expect(sheets.deletedRows).toEqual([
      { sheetId: 42, rowIndex: 3 },
      { sheetId: 42, rowIndex: 2 },
      { sheetId: 42, rowIndex: 1 },
    ]);
  });

  it('never calls patch or delete on the calendar client', async () => {
    const sheets = mockSheets([
      HEADER,
      [
        'tid-a',
        '会議',
        '',
        30,
        dateToSheetSerial(new Date('2026-07-09T10:00:00+09:00')),
        dateToSheetSerial(new Date('2026-07-09T10:30:00+09:00')),
        '',
        '',
        'Not Started',
        'evt-a',
        'Meeting',
      ],
    ]);
    const calendar = mockCalendar([baseEvent({ id: 'evt-a', summary: '会議（変更）' })]);
    await expect(
      syncMeetingsToSheet({
        sheets,
        calendar,
        spreadsheetId: 'sid',
        meetingCalendarId: 'me@example.com',
      }),
    ).resolves.toBeDefined();
  });

  it('applies an "all occurrences" category rule to a newly-synced occurrence', async () => {
    const RULES_HEADER = ['RecurringEventID', 'Category', 'EffectiveFromDate'];
    const sheets = mockSheets([HEADER], [RULES_HEADER, ['series-a', '案件A', '']]);
    const calendar = mockCalendar([baseEvent({ id: 'evt-9', recurringEventId: 'series-a' })]);
    const result = await syncMeetingsToSheet({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      meetingCalendarId: 'me@example.com',
    });
    expect(result.addedCount).toBe(1);
    const [row] = sheets.appended[0]!;
    expect(row![HEADER.indexOf(TASKDB_HEADERS.Category)]).toBe('案件A');
  });

  it('does not apply a "from this point on" rule to an occurrence before the effective date', async () => {
    const RULES_HEADER = ['RecurringEventID', 'Category', 'EffectiveFromDate'];
    const effectiveFrom = new Date('2026-07-09T00:00:00+09:00');
    const sheets = mockSheets(
      [HEADER],
      [RULES_HEADER, ['series-a', '案件A', dateToSheetSerial(effectiveFrom)]],
    );
    const calendar = mockCalendar([
      baseEvent({
        id: 'evt-old',
        recurringEventId: 'series-a',
        start: new Date('2026-07-02T10:00:00+09:00'),
        end: new Date('2026-07-02T10:30:00+09:00'),
      }),
    ]);
    const result = await syncMeetingsToSheet({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      meetingCalendarId: 'me@example.com',
    });
    expect(result.addedCount).toBe(1);
    const [row] = sheets.appended[0]!;
    expect(row![HEADER.indexOf(TASKDB_HEADERS.Category)]).toBe('');
  });

  it('applies an "all occurrences" workload-exclusion rule to a newly-synced occurrence', async () => {
    const HEADER_WITH_WORKLOAD = [...HEADER, 'CountsTowardWorkload'];
    const RULES_HEADER = [
      'RecurringEventID',
      'Category',
      'EffectiveFromDate',
      'CountsTowardWorkload',
      'WorkloadEffectiveFromDate',
    ];
    const sheets = mockSheets(
      [HEADER_WITH_WORKLOAD],
      [RULES_HEADER, ['series-a', '', '', 'FALSE', '']],
    );
    const calendar = mockCalendar([baseEvent({ id: 'evt-9', recurringEventId: 'series-a' })]);
    const result = await syncMeetingsToSheet({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      meetingCalendarId: 'me@example.com',
    });
    expect(result.addedCount).toBe(1);
    const [row] = sheets.appended[0]!;
    expect(row![HEADER_WITH_WORKLOAD.indexOf('CountsTowardWorkload')]).toBe('FALSE');
  });

  it('defaults a newly-synced occurrence to counting toward workload when no rule applies', async () => {
    const HEADER_WITH_WORKLOAD = [...HEADER, 'CountsTowardWorkload'];
    const sheets = mockSheets([HEADER_WITH_WORKLOAD]);
    const calendar = mockCalendar([baseEvent({ id: 'evt-10' })]);
    const result = await syncMeetingsToSheet({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      meetingCalendarId: 'me@example.com',
    });
    expect(result.addedCount).toBe(1);
    const [row] = sheets.appended[0]!;
    expect(row![HEADER_WITH_WORKLOAD.indexOf('CountsTowardWorkload')]).toBe('');
  });

  it('self-heals a duplicate row (e.g. from a cross-device race) by deleting the extra one', async () => {
    const start = new Date('2026-07-09T10:00:00+09:00');
    const end = new Date('2026-07-09T10:30:00+09:00');
    const duplicateRow = (taskId: string) => [
      taskId,
      '重複した会議',
      '',
      30,
      dateToSheetSerial(start),
      dateToSheetSerial(end),
      '',
      '',
      'Not Started',
      'evt-dup',
      'Meeting',
    ];
    const sheets = mockSheets([HEADER, duplicateRow('tid-a'), duplicateRow('tid-b')]);
    const calendar = mockCalendar([
      baseEvent({ id: 'evt-dup', summary: '重複した会議', start, end }),
    ]);
    const result = await syncMeetingsToSheet({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      meetingCalendarId: 'me@example.com',
    });
    // Row 2 (the earlier one, tid-a) is kept; row 3 (tid-b) is deleted.
    expect(sheets.deletedRows).toEqual([{ sheetId: 42, rowIndex: 2 }]);
    expect(result.deletedCount).toBeGreaterThanOrEqual(1);
    expect(sheets.appended).toHaveLength(0);
  });

  it('ignores ordinary (non-meeting) TaskDB rows entirely', async () => {
    const sheets = mockSheets([
      HEADER,
      [
        'tid-manual',
        '通常タスク',
        '',
        30,
        dateToSheetSerial(new Date('2026-07-09T09:00:00+09:00')),
        dateToSheetSerial(new Date('2026-07-09T09:30:00+09:00')),
        '',
        '',
        'Not Started',
        'evt-manual',
        '',
      ],
    ]);
    const calendar = mockCalendar([]);
    const result = await syncMeetingsToSheet({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      meetingCalendarId: 'me@example.com',
      now: () => new Date('2026-07-09T08:00:00+09:00'),
    });
    expect(result.deletedCount).toBe(0);
    expect(sheets.deletedRows).toHaveLength(0);
  });
});
