import { describe, expect, it } from 'vitest';
import { syncCalendarToSheet } from './syncCalendarToSheet';
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
];

function mockSheets(values: unknown[][]): SheetsClient & {
  batchUpdates: ValueRange[][];
} {
  const batchUpdates: ValueRange[][] = [];
  return {
    batchUpdates,
    async getValues() {
      return values;
    },
    async appendRows() {},
    async updateRange() {},
    async batchUpdateValues(_id, data) {
      batchUpdates.push(data);
    },
    async deleteRow() {},
    async getSheetMetadata() {
      return [];
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
      throw new Error('not used');
    },
    async delete() {},
  };
}

describe('syncCalendarToSheet', () => {
  it('updates the sheet row when an event title changes', async () => {
    const start = new Date('2026-05-25T10:00:00+09:00');
    const end = new Date('2026-05-25T10:30:00+09:00');
    const sheets = mockSheets([
      HEADER,
      [
        'tid-a',
        '旧タイトル',
        '',
        30,
        dateToSheetSerial(start),
        dateToSheetSerial(end),
        '',
        '',
        'Not Started',
        'evt-a',
      ],
    ]);
    const calendar = mockCalendar([
      {
        id: 'evt-a',
        summary: '(管理)_新タイトル',
        start,
        end,
        colorId: null,
      },
    ]);
    const result = await syncCalendarToSheet({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      calendarId: 'cid',
      now: () => new Date('2026-05-25T08:00:00+09:00'),
    });
    expect(result.updatedCount).toBe(1);
    expect(sheets.batchUpdates).toHaveLength(1);
    const ranges = sheets.batchUpdates[0]!.map((u) => u.range);
    expect(ranges.some((r) => /TaskDB!B2$/.test(r))).toBe(true); // TaskName
    expect(ranges.some((r) => /TaskDB!C2$/.test(r))).toBe(true); // Category
  });

  it('does not touch Status=Done rows', async () => {
    const start = new Date('2026-05-25T10:00:00+09:00');
    const end = new Date('2026-05-25T10:30:00+09:00');
    const sheets = mockSheets([
      HEADER,
      [
        'tid-b',
        '旧名',
        '',
        30,
        dateToSheetSerial(start),
        dateToSheetSerial(end),
        '',
        '',
        'Done',
        'evt-b',
      ],
    ]);
    const calendar = mockCalendar([
      {
        id: 'evt-b',
        summary: '違う名前',
        start: new Date('2026-05-25T11:00:00+09:00'),
        end: new Date('2026-05-25T11:30:00+09:00'),
        colorId: null,
      },
    ]);
    const result = await syncCalendarToSheet({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      calendarId: 'cid',
      now: () => new Date('2026-05-25T08:00:00+09:00'),
    });
    expect(result.updatedCount).toBe(0);
    expect(sheets.batchUpdates).toHaveLength(0);
  });

  it('updates start/end and recomputes EstimateMinutes', async () => {
    const oldStart = new Date('2026-05-25T10:00:00+09:00');
    const oldEnd = new Date('2026-05-25T10:30:00+09:00');
    const newStart = new Date('2026-05-25T11:00:00+09:00');
    const newEnd = new Date('2026-05-25T11:45:00+09:00'); // 45 minutes
    const sheets = mockSheets([
      HEADER,
      [
        'tid-c',
        'タスク',
        '',
        30,
        dateToSheetSerial(oldStart),
        dateToSheetSerial(oldEnd),
        '',
        '',
        'Not Started',
        'evt-c',
      ],
    ]);
    const calendar = mockCalendar([
      { id: 'evt-c', summary: 'タスク', start: newStart, end: newEnd, colorId: null },
    ]);
    const result = await syncCalendarToSheet({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      calendarId: 'cid',
      now: () => new Date('2026-05-25T08:00:00+09:00'),
    });
    expect(result.updatedCount).toBe(1);
    // Estimate cell update should contain 45
    const updates = sheets.batchUpdates[0]!;
    const estimateUpdate = updates.find((u) => /TaskDB!D2$/.test(u.range));
    expect(estimateUpdate?.values).toEqual([[45]]);
  });
});
