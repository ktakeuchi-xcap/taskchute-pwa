import { describe, expect, it } from 'vitest';
import { generateNextWeekRoutines } from './routineGenerator';
import { TASKDB_HEADERS } from '@/features/tasks/api/headers';
import type { SheetsClient } from '@/lib/google/sheets';
import type { CalendarClient, CalendarEvent } from '@/lib/google/calendar';

const TASKDB_HEADER = [
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

const ROUTINE_HEADER = ['Schedule', 'TaskName', 'StartTime', 'Category', 'EstimateMinutes'];

interface SheetState {
  TaskDB: unknown[][];
  RoutineTasks: unknown[][];
}

function createSheets(state: SheetState): SheetsClient & {
  appendCalls: unknown[][][];
} {
  const appendCalls: unknown[][][] = [];
  return {
    appendCalls,
    async getValues(_id, range) {
      if (range.startsWith('TaskDB')) return state.TaskDB;
      if (range.startsWith('RoutineTasks')) return state.RoutineTasks;
      return [];
    },
    async appendRows(_id, _range, rows) {
      appendCalls.push(rows);
    },
    async updateRange() {},
    async batchUpdateValues() {},
    async deleteRow() {},
    async getSheetMetadata() {
      return [];
    },
  };
}

function createCalendar(): CalendarClient & { inserted: CalendarEvent[] } {
  const inserted: CalendarEvent[] = [];
  return {
    inserted,
    async list() {
      return [];
    },
    async insert(_id, input) {
      const ev: CalendarEvent = {
        id: `evt-${inserted.length + 1}`,
        summary: input.summary,
        start: input.start,
        end: input.end,
        colorId: input.colorId ?? null,
      };
      inserted.push(ev);
      return ev;
    },
    async patch() {
      return {
        id: 'x',
        summary: '',
        start: new Date(),
        end: new Date(),
        colorId: null,
      };
    },
    async delete() {},
  };
}

describe('generateNextWeekRoutines', () => {
  it('generates 5 daily tasks (Mon–Fri) when no routines exist yet', async () => {
    const sheets = createSheets({
      TaskDB: [TASKDB_HEADER],
      RoutineTasks: [ROUTINE_HEADER, ['毎日', '朝会', '09:00', '管理', 15]],
    });
    const calendar = createCalendar();
    // 2026-05-19 is a Tuesday in JST → next Monday is 2026-05-25
    const result = await generateNextWeekRoutines({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      calendarId: 'cid',
      now: () => new Date('2026-05-19T10:00:00+09:00'),
      generateId: () => 'tid',
    });
    expect(result.addedCount).toBe(5);
    expect(result.weekStartIso).toBe('2026-05-25');
    expect(result.weekEndIso).toBe('2026-05-29');
    expect(calendar.inserted).toHaveLength(5);
    expect(sheets.appendCalls).toHaveLength(1);
    expect(sheets.appendCalls[0]).toHaveLength(5);
  });

  it('skips dates that already have a task with the same name', async () => {
    const start = new Date('2026-05-25T09:00:00+09:00').getTime();
    const end = new Date('2026-05-25T09:15:00+09:00').getTime();
    // Insert a pre-existing 朝会 on Mon 2026-05-25.
    const SHEETS_EPOCH = 25569;
    const MS_PER_DAY = 86_400_000;
    const JST_OFF = 9 * 3_600_000;
    const toSerial = (ms: number) => (ms + JST_OFF) / MS_PER_DAY + SHEETS_EPOCH;
    const sheets = createSheets({
      TaskDB: [
        TASKDB_HEADER,
        ['t1', '朝会', '管理', 15, toSerial(start), toSerial(end), '', '', 'Not Started', 'e1'],
      ],
      RoutineTasks: [ROUTINE_HEADER, ['毎日', '朝会', '09:00', '管理', 15]],
    });
    const calendar = createCalendar();
    const result = await generateNextWeekRoutines({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      calendarId: 'cid',
      now: () => new Date('2026-05-19T10:00:00+09:00'),
      generateId: () => 'tid',
    });
    expect(result.addedCount).toBe(4); // Tue..Fri only
    expect(result.skippedCount).toBe(1);
    expect(calendar.inserted).toHaveLength(4);
  });

  it('weekday schedule generates only on its day', async () => {
    const sheets = createSheets({
      TaskDB: [TASKDB_HEADER],
      RoutineTasks: [
        ROUTINE_HEADER,
        ['月', '週次レポート', '10:00', '', 60],
        ['金', '振り返り', '17:00', '', 30],
      ],
    });
    const calendar = createCalendar();
    const result = await generateNextWeekRoutines({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      calendarId: 'cid',
      now: () => new Date('2026-05-19T10:00:00+09:00'),
      generateId: () => 'tid',
    });
    expect(result.addedCount).toBe(2);
    const titles = calendar.inserted.map((e) => e.summary).sort();
    expect(titles).toEqual(['振り返り', '週次レポート']);
  });

  it('doesn’t call appendRows when nothing is added', async () => {
    const sheets = createSheets({
      TaskDB: [TASKDB_HEADER],
      RoutineTasks: [ROUTINE_HEADER],
    });
    const calendar = createCalendar();
    const result = await generateNextWeekRoutines({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      calendarId: 'cid',
      now: () => new Date('2026-05-19T10:00:00+09:00'),
    });
    expect(result.addedCount).toBe(0);
    expect(sheets.appendCalls).toHaveLength(0);
  });
});
