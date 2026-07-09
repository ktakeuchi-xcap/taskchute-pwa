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
  deletedRows: Array<{ sheetId: number; rowIndex: number }>;
  updateCalls: Array<{ range: string; values: unknown[][] }>;
} {
  const appendCalls: unknown[][][] = [];
  const batchUpdates: ValueRange[][] = [];
  const deletedRows: Array<{ sheetId: number; rowIndex: number }> = [];
  const updateCalls: Array<{ range: string; values: unknown[][] }> = [];
  return {
    appendCalls,
    batchUpdates,
    deletedRows,
    updateCalls,
    async getValues(_id, range) {
      if (range.startsWith('TaskDB')) return state.TaskDB;
      if (range === 'Settings!A:A') return state.Settings;
      if (range.startsWith('Settings')) {
        // honour "Settings!A2:A" by slicing the header row.
        return state.Settings.slice(1);
      }
      return [];
    },
    async appendRows(_id, range, rows) {
      appendCalls.push(rows);
      if (range.startsWith('Settings')) {
        state.Settings.push(...rows);
      } else {
        state.TaskDB.push(...rows);
      }
    },
    async updateRange(_id, range, values) {
      updateCalls.push({ range, values });
    },
    async batchUpdateValues(_id, data) {
      batchUpdates.push(data);
    },
    async deleteRow(_id, sheetId, rowIndex) {
      deletedRows.push({ sheetId, rowIndex });
    },
    async getSheetMetadata() {
      return [
        { sheetId: 42, title: 'TaskDB' },
        { sheetId: 7, title: 'Settings' },
      ];
    },
  };
}

function createMockCalendar(): CalendarClient & {
  inserted: CalendarEvent[];
  patches: Array<{ id: string; patch: unknown }>;
  deleted: string[];
} {
  const inserted: CalendarEvent[] = [];
  const patches: Array<{ id: string; patch: unknown }> = [];
  const deleted: string[] = [];
  return {
    inserted,
    patches,
    deleted,
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
        isAllDay: false,
        selfResponseStatus: null,
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
        isAllDay: false,
        selfResponseStatus: null,
      };
    },
    async delete(_calId, eventId) {
      deleted.push(eventId);
    },
  };
}

describe('TaskRepository', () => {
  it('listTasks returns tasks sorted by scheduled start', async () => {
    const start1 = new Date('2026-05-19T09:00:00+09:00');
    const end1 = new Date('2026-05-19T09:30:00+09:00');
    const start2 = new Date('2026-05-19T10:00:00+09:00');
    const end2 = new Date('2026-05-19T10:30:00+09:00');
    const buildRow = (id: string, start: Date, end: Date): unknown[] => [
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

  it('updateTask rewrites name/category/estimate/start-end and patches the calendar event', async () => {
    const start = new Date('2026-05-19T10:00:00+09:00');
    const end = new Date('2026-05-19T10:30:00+09:00');
    const sheets = createMockSheets({
      TaskDB: [
        HEADER,
        [
          'tid-a',
          'A',
          '管理',
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
    const repo = createTaskRepository({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      calendarId: 'cid',
    });

    const newStart = new Date('2026-05-19T11:00:00+09:00');
    const updated = await repo.updateTask('tid-a', {
      taskName: 'A改',
      estimateMinutes: 45,
      category: '営業',
      startTime: newStart,
    });

    expect(updated.taskName).toBe('A改');
    expect(updated.category).toBe('営業');
    expect(updated.estimateMinutes).toBe(45);
    expect(updated.scheduledStartTime.toISOString()).toBe(newStart.toISOString());
    expect(updated.scheduledEndTime.toISOString()).toBe(
      new Date(newStart.getTime() + 45 * 60_000).toISOString(),
    );

    expect(sheets.batchUpdates).toHaveLength(1);
    expect(sheets.batchUpdates[0]).toHaveLength(5);
    expect(calendar.patches).toEqual([
      {
        id: 'evt-a',
        patch: {
          summary: '(営業)_A改',
          start: newStart,
          end: new Date(newStart.getTime() + 45 * 60_000),
        },
      },
    ]);
  });

  it('throws when updating a non-existent task', async () => {
    const sheets = createMockSheets({ TaskDB: [HEADER], Settings: [] });
    const calendar = createMockCalendar();
    const repo = createTaskRepository({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      calendarId: 'cid',
    });
    await expect(
      repo.updateTask('missing', { taskName: 'x', estimateMinutes: 10 }),
    ).rejects.toThrowError(/not found/);
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

  it('listCategories returns name/color pairs from Settings A2:B', async () => {
    const sheets = createMockSheets({
      TaskDB: [HEADER],
      Settings: [
        ['header', 'color'],
        ['管理', 'blue'],
        ['営業', ''],
        ['', ''],
        ['開発', 'green'],
      ],
    });
    const calendar = createMockCalendar();
    const repo = createTaskRepository({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      calendarId: 'cid',
    });
    const cats = await repo.listCategories();
    expect(cats).toEqual([
      { name: '管理', color: 'blue' },
      { name: '営業', color: null },
      { name: '開発', color: 'green' },
    ]);
  });

  it('addCategory appends a name/color row to the Settings sheet', async () => {
    const sheets = createMockSheets({
      TaskDB: [HEADER],
      Settings: [['header'], ['管理', 'blue']],
    });
    const calendar = createMockCalendar();
    const repo = createTaskRepository({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      calendarId: 'cid',
    });
    await repo.addCategory('営業', 'purple');
    expect(sheets.appendCalls).toEqual([[['営業', 'purple']]]);
  });

  it('updateCategory rewrites the matching name/color cells in place', async () => {
    const sheets = createMockSheets({
      TaskDB: [HEADER],
      Settings: [['header'], ['管理', 'blue'], ['営業', 'red'], ['開発', 'green']],
    });
    const calendar = createMockCalendar();
    const repo = createTaskRepository({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      calendarId: 'cid',
    });
    await repo.updateCategory('営業', '営業企画', 'amber');
    // '営業' is at array index 2 -> spreadsheet row 3 (1-based).
    expect(sheets.updateCalls).toEqual([
      { range: 'Settings!A3:B3', values: [['営業企画', 'amber']] },
    ]);
  });

  it('throws when updating a non-existent category', async () => {
    const sheets = createMockSheets({
      TaskDB: [HEADER],
      Settings: [['header'], ['管理', 'blue']],
    });
    const calendar = createMockCalendar();
    const repo = createTaskRepository({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      calendarId: 'cid',
    });
    await expect(repo.updateCategory('存在しない', '新名', 'blue')).rejects.toThrowError(
      /not found/,
    );
  });

  it('deleteCategory removes the matching row from the Settings sheet', async () => {
    const sheets = createMockSheets({
      TaskDB: [HEADER],
      Settings: [['header'], ['管理'], ['営業'], ['開発']],
    });
    const calendar = createMockCalendar();
    const repo = createTaskRepository({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      calendarId: 'cid',
    });
    await repo.deleteCategory('営業');
    // '営業' is at array index 2 (header=0, 管理=1, 営業=2) -> 0-based grid row index 2.
    expect(sheets.deletedRows).toEqual([{ sheetId: 7, rowIndex: 2 }]);
  });

  it('throws when deleting a non-existent category', async () => {
    const sheets = createMockSheets({
      TaskDB: [HEADER],
      Settings: [['header'], ['管理']],
    });
    const calendar = createMockCalendar();
    const repo = createTaskRepository({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      calendarId: 'cid',
    });
    await expect(repo.deleteCategory('存在しない')).rejects.toThrowError(/not found/);
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

  it('deleteTask removes the sheet row and the calendar event', async () => {
    const start = new Date('2026-05-19T10:00:00+09:00');
    const end = new Date('2026-05-19T10:30:00+09:00');
    const sheets = createMockSheets({
      TaskDB: [
        HEADER,
        [
          'tid-other',
          'other',
          '',
          30,
          dateToSheetSerial(start),
          dateToSheetSerial(end),
          '',
          '',
          'Not Started',
          'evt-other',
        ],
        [
          'tid-c',
          'C',
          '',
          30,
          dateToSheetSerial(start),
          dateToSheetSerial(end),
          '',
          '',
          'Not Started',
          'evt-c',
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
    });

    await repo.deleteTask('tid-c');

    // tid-c is in row 3 (1-based, header is row 1) -> 0-based grid index 2.
    expect(sheets.deletedRows).toEqual([{ sheetId: 42, rowIndex: 2 }]);
    expect(calendar.deleted).toEqual(['evt-c']);
  });

  it('throws when deleting a non-existent task', async () => {
    const sheets = createMockSheets({ TaskDB: [HEADER], Settings: [] });
    const calendar = createMockCalendar();
    const repo = createTaskRepository({
      sheets,
      calendar,
      spreadsheetId: 'sid',
      calendarId: 'cid',
    });
    await expect(repo.deleteTask('missing')).rejects.toThrowError(/not found/);
  });

  describe('meeting tasks are read-only', () => {
    const HEADER_WITH_SOURCE = [...HEADER, 'Source'];

    function meetingSheets() {
      const start = new Date('2026-07-09T10:00:00+09:00');
      const end = new Date('2026-07-09T10:30:00+09:00');
      return createMockSheets({
        TaskDB: [
          HEADER_WITH_SOURCE,
          [
            'tid-m',
            '定例会議',
            '',
            30,
            dateToSheetSerial(start),
            dateToSheetSerial(end),
            '',
            '',
            'Not Started',
            'evt-m',
            'Meeting',
          ],
        ],
        Settings: [],
      });
    }

    it('rejects updateTask', async () => {
      const repo = createTaskRepository({
        sheets: meetingSheets(),
        calendar: createMockCalendar(),
        spreadsheetId: 'sid',
        calendarId: 'cid',
      });
      await expect(
        repo.updateTask('tid-m', { taskName: 'x', estimateMinutes: 30 }),
      ).rejects.toThrowError(/cannot be edited/);
    });

    it('rejects startTask', async () => {
      const repo = createTaskRepository({
        sheets: meetingSheets(),
        calendar: createMockCalendar(),
        spreadsheetId: 'sid',
        calendarId: 'cid',
      });
      await expect(repo.startTask('tid-m')).rejects.toThrowError(/cannot be started/);
    });

    it('rejects endTask', async () => {
      const repo = createTaskRepository({
        sheets: meetingSheets(),
        calendar: createMockCalendar(),
        spreadsheetId: 'sid',
        calendarId: 'cid',
      });
      await expect(repo.endTask('tid-m')).rejects.toThrowError(/cannot be ended/);
    });

    it('rejects deleteTask', async () => {
      const repo = createTaskRepository({
        sheets: meetingSheets(),
        calendar: createMockCalendar(),
        spreadsheetId: 'sid',
        calendarId: 'cid',
      });
      await expect(repo.deleteTask('tid-m')).rejects.toThrowError(/cannot be deleted/);
    });
  });
});
