import { describe, expect, it } from 'vitest';
import { createTaskRepository } from './taskRepository';
import { TASKDB_HEADERS } from './headers';
import { TaskStatus } from '@/features/tasks/types';
import { dateToSheetSerial } from '@/lib/google/sheetDate';
import type { SheetsClient, ValueRange } from '@/lib/google/sheets';
import type { CalendarClient, CalendarEvent } from '@/lib/google/calendar';

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

interface SheetState {
  TaskDB: unknown[][];
  Settings: unknown[][];
}

function createMockSheets(state: SheetState): SheetsClient & {
  appendCalls: unknown[][][];
  batchUpdates: ValueRange[][];
} {
  const appendCalls: unknown[][][] = [];
  const batchUpdates: ValueRange[][] = [];
  return {
    appendCalls,
    batchUpdates,
    async getValues(_id, range) {
      if (range.startsWith('TaskDB')) return state.TaskDB;
      if (range.startsWith('Settings')) {
        // honour "Settings!A2:A" by slicing the header row.
        return state.Settings.slice(1);
      }
      return [];
    },
    async appendRows(_id, _range, rows) {
      appendCalls.push(rows);
      state.TaskDB.push(...rows);
    },
    async updateRange() {
      // not used in these tests
    },
    async batchUpdateValues(_id, data) {
      batchUpdates.push(data);
    },
    async deleteRow() {
      // not used
    },
    async getSheetMetadata() {
      return [{ sheetId: 0, title: 'TaskDB' }];
    },
  };
}

function createMockCalendar(): CalendarClient & {
  inserted: CalendarEvent[];
  patches: Array<{ id: string; patch: unknown }>;
} {
  const inserted: CalendarEvent[] = [];
  const patches: Array<{ id: string; patch: unknown }> = [];
  return {
    inserted,
    patches,
    async list() {
      return [];
    },
    async insert(_calId, input) {
      const event: CalendarEvent = {
        id: `evt-${inserted.length + 1}`,
        summary: input.summary,
        start: input.start,
        end: input.end,
        colorId: input.colorId ?? null,
      };
      inserted.push(event);
      return event;
    },
    async patch(_calId, eventId, patch) {
      patches.push({ id: eventId, patch });
      return {
        id: eventId,
        summary: '',
        start: new Date(),
        end: new Date(),
        colorId: null,
      };
    },
    async delete() {
      // not used
    },
  };
}

describe('TaskRepository', () => {
  it('listTasks returns tasks sorted by scheduled start', async () => {
    const start1 = new Date('2026-05-19T09:00:00+09:00');
    const end1 = new Date('2026-05-19T09:30:00+09:00');
    const start2 = new Date('2026-05-19T10:00:00+09:00');
    const end2 = new Date('2026-05-19T10:30:00+09:00');
    const buildRow = (
      id: string,
      start: Date,
      end: Date,
    ): unknown[] => [
      id,
      `task-${id}`,
      '',
      30,
      dateToSheetSerial(start),
      dateToSheetSerial(end),
      '',
      '',
      'Not Started',
      `evt-${id}`,
    ];
    const sheets = createMockSheets({
      TaskDB: [HEADER, buildRow('b', start2, end2), buildRow('a', start1, end1)],
      Settings: [],
    });
    const calendar = createMockCalendar();
    const repo = createTaskRepository({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      calendarId: 'cid',
    });
    const tasks = await repo.listTasks();
    expect(tasks.map((t) => t.taskId)).toEqual(['a', 'b']);
  });

  it('addTask creates a calendar event and appends a row with that event id', async () => {
    const sheets = createMockSheets({ TaskDB: [HEADER], Settings: [] });
    const calendar = createMockCalendar();
    const now = new Date('2026-05-19T10:00:00+09:00');
    const repo = createTaskRepository({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      calendarId: 'cid',
      now: () => now,
      generateId: () => 'tid-fixed',
    });
    const task = await repo.addTask({
      taskName: '提案書執筆',
      estimateMinutes: 30,
      category: '管理',
    });
    expect(task.calendarEventId).toBe('evt-1');
    expect(calendar.inserted[0]!.summary).toBe('(管理)_提案書執筆');
    expect(sheets.appendCalls).toHaveLength(1);
    const row = sheets.appendCalls[0]![0]!;
    expect(row[HEADER.indexOf(TASKDB_HEADERS.TaskID)]).toBe('tid-fixed');
    expect(row[HEADER.indexOf(TASKDB_HEADERS.CalendarEventID)]).toBe('evt-1');
    expect(row[HEADER.indexOf(TASKDB_HEADERS.Status)]).toBe(TaskStatus.NotStarted);
  });

  it('addTask without startTime appends after the last task end', async () => {
    const prevStart = new Date('2026-05-19T09:00:00+09:00');
    const prevEnd = new Date('2026-05-19T09:30:00+09:00');
    const sheets = createMockSheets({
      TaskDB: [
        HEADER,
        [
          'prev',
          'prev-name',
          '',
          30,
          dateToSheetSerial(prevStart),
          dateToSheetSerial(prevEnd),
          '',
          '',
          'Not Started',
          'evt-prev',
        ],
      ],
      Settings: [],
    });
    const calendar = createMockCalendar();
    const repo = createTaskRepository({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      calendarId: 'cid',
      now: () => new Date('2026-05-19T12:00:00+09:00'),
      generateId: () => 'tid-x',
    });
    const task = await repo.addTask({ taskName: '次', estimateMinutes: 15 });
    expect(task.scheduledStartTime.toISOString()).toBe(prevEnd.toISOString());
    expect(task.scheduledEndTime.toISOString()).toBe(
      new Date(prevEnd.getTime() + 15 * 60_000).toISOString(),
    );
  });

  it('startTask flips Status and patches calendar to yellow', async () => {
    const start = new Date('2026-05-19T10:00:00+09:00');
    const end = new Date('2026-05-19T10:30:00+09:00');
    const sheets = createMockSheets({
      TaskDB: [
        HEADER,
        [
          'tid-a',
          'A',
          '',
          30,
          dateToSheetSerial(start),
          dateToSheetSerial(end),
          '',
          '',
          'Not Started',
          'evt-a',
        ],
      ],
      Settings: [],
    });
    const calendar = createMockCalendar();
    const startedAt = new Date('2026-05-19T10:05:00+09:00');
    const repo = createTaskRepository({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      calendarId: 'cid',
      now: () => startedAt,
    });
    const updated = await repo.startTask('tid-a');
    expect(updated.status).toBe(TaskStatus.InProgress);
    expect(updated.actualStartTime?.toISOString()).toBe(startedAt.toISOString());

    expect(sheets.batchUpdates).toHaveLength(1);
    const ranges = sheets.batchUpdates[0]!.map((v) => v.range);
    expect(ranges).toEqual([
      expect.stringMatching(/^TaskDB!.+2$/), // status cell in row 2
      expect.stringMatching(/^TaskDB!.+2$/), // actual start cell in row 2
    ]);
    expect(calendar.patches).toEqual([{ id: 'evt-a', patch: { colorId: '5' } }]);
  });

  it('endTask sets Status=Done, ActualEndTime, and resizes calendar event', async () => {
    const start = new Date('2026-05-19T10:00:00+09:00');
    const end = new Date('2026-05-19T10:30:00+09:00');
    const actualStart = new Date('2026-05-19T10:05:00+09:00');
    const sheets = createMockSheets({
      TaskDB: [
        HEADER,
        [
          'tid-b',
          'B',
          '',
          30,
          dateToSheetSerial(start),
          dateToSheetSerial(end),
          dateToSheetSerial(actualStart),
          '',
          'In Progress',
          'evt-b',
        ],
      ],
      Settings: [],
    });
    const calendar = createMockCalendar();
    const endedAt = new Date('2026-05-19T10:25:00+09:00');
    const repo = createTaskRepository({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      calendarId: 'cid',
      now: () => endedAt,
    });
    const updated = await repo.endTask('tid-b');
    expect(updated.status).toBe(TaskStatus.Done);
    expect(updated.actualEndTime?.toISOString()).toBe(endedAt.toISOString());
    expect(calendar.patches[0]!.patch).toEqual({
      colorId: '2',
      start: actualStart,
      end: endedAt,
    });
  });

  it('listCategories returns flattened non-empty strings from Settings A2:A', async () => {
    const sheets = createMockSheets({
      TaskDB: [HEADER],
      Settings: [['header'], ['管理'], ['営業'], [''], ['開発']],
    });
    const calendar = createMockCalendar();
    const repo = createTaskRepository({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      calendarId: 'cid',
    });
    const cats = await repo.listCategories();
    expect(cats).toEqual(['管理', '営業', '開発']);
  });

  it('throws when starting a non-existent task', async () => {
    const sheets = createMockSheets({ TaskDB: [HEADER], Settings: [] });
    const calendar = createMockCalendar();
    const repo = createTaskRepository({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      calendarId: 'cid',
    });
    await expect(repo.startTask('missing')).rejects.toThrowError(/not found/);
  });
});
