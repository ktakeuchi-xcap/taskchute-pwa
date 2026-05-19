import { describe, expect, it } from 'vitest';
import { parseTaskDbRows, buildTaskRow, formatEventTitle, parseEventTitle } from './serializers';
import { TASKDB_HEADERS } from './headers';
import { TaskStatus, type Task } from '@/features/tasks/types';
import { dateToSheetSerial, formatDateForSheet } from '@/lib/google/sheetDate';

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

describe('parseTaskDbRows', () => {
  it('returns [] for empty values', () => {
    expect(parseTaskDbRows([])).toEqual([]);
  });

  it('parses a row using header name lookup, not position', () => {
    // Intentionally reorder headers to verify lookup-by-name.
    const reordered = [...HEADER].reverse();
    const start = new Date('2026-05-19T10:00:00+09:00');
    const end = new Date('2026-05-19T10:30:00+09:00');
    const rowData: Record<string, unknown> = {
      [TASKDB_HEADERS.TaskID]: 'tid-1',
      [TASKDB_HEADERS.TaskName]: 'Test',
      [TASKDB_HEADERS.Category]: '管理',
      [TASKDB_HEADERS.EstimateMinutes]: 30,
      [TASKDB_HEADERS.ScheduledStartTime]: dateToSheetSerial(start),
      [TASKDB_HEADERS.ScheduledEndTime]: dateToSheetSerial(end),
      [TASKDB_HEADERS.ActualStartTime]: '',
      [TASKDB_HEADERS.ActualEndTime]: '',
      [TASKDB_HEADERS.Status]: 'Not Started',
      [TASKDB_HEADERS.CalendarEventID]: 'evt-1',
    };
    const row = reordered.map((h) => rowData[h]);
    const [parsed] = parseTaskDbRows([reordered, row]);
    expect(parsed).toBeDefined();
    expect(parsed!.rowNumber).toBe(2);
    expect(parsed!.task.taskId).toBe('tid-1');
    expect(parsed!.task.category).toBe('管理');
    expect(parsed!.task.estimateMinutes).toBe(30);
    expect(parsed!.task.scheduledStartTime.toISOString()).toBe(start.toISOString());
    expect(parsed!.task.status).toBe(TaskStatus.NotStarted);
  });

  it('skips rows missing a TaskID', () => {
    const row = HEADER.map((h) => (h === TASKDB_HEADERS.TaskID ? '' : 'x'));
    expect(parseTaskDbRows([HEADER, row])).toEqual([]);
  });

  it('treats unknown Status as Not Started rather than throwing', () => {
    const start = new Date('2026-05-19T10:00:00+09:00');
    const end = new Date('2026-05-19T10:30:00+09:00');
    const rowData: Record<string, unknown> = {
      [TASKDB_HEADERS.TaskID]: 'tid-1',
      [TASKDB_HEADERS.TaskName]: 'Test',
      [TASKDB_HEADERS.Category]: '',
      [TASKDB_HEADERS.EstimateMinutes]: 30,
      [TASKDB_HEADERS.ScheduledStartTime]: dateToSheetSerial(start),
      [TASKDB_HEADERS.ScheduledEndTime]: dateToSheetSerial(end),
      [TASKDB_HEADERS.ActualStartTime]: '',
      [TASKDB_HEADERS.ActualEndTime]: '',
      [TASKDB_HEADERS.Status]: '???',
      [TASKDB_HEADERS.CalendarEventID]: 'evt-1',
    };
    const row = HEADER.map((h) => rowData[h]);
    const [parsed] = parseTaskDbRows([HEADER, row]);
    expect(parsed!.task.status).toBe(TaskStatus.NotStarted);
  });
});

describe('buildTaskRow', () => {
  it('writes values in the order defined by the header row', () => {
    const reordered = [
      TASKDB_HEADERS.Status,
      TASKDB_HEADERS.TaskName,
      TASKDB_HEADERS.TaskID,
      TASKDB_HEADERS.Category,
      TASKDB_HEADERS.EstimateMinutes,
      TASKDB_HEADERS.ScheduledStartTime,
      TASKDB_HEADERS.ScheduledEndTime,
      TASKDB_HEADERS.ActualStartTime,
      TASKDB_HEADERS.ActualEndTime,
      TASKDB_HEADERS.CalendarEventID,
    ];
    const start = new Date('2026-05-19T10:00:00+09:00');
    const end = new Date('2026-05-19T10:30:00+09:00');
    const task: Task = {
      taskId: 'tid-1',
      taskName: '報告書執筆',
      category: '管理',
      estimateMinutes: 30,
      scheduledStartTime: start,
      scheduledEndTime: end,
      actualStartTime: null,
      actualEndTime: null,
      status: TaskStatus.NotStarted,
      calendarEventId: 'evt-1',
    };
    const row = buildTaskRow(reordered, task);
    expect(row[reordered.indexOf(TASKDB_HEADERS.TaskID)]).toBe('tid-1');
    expect(row[reordered.indexOf(TASKDB_HEADERS.TaskName)]).toBe('報告書執筆');
    expect(row[reordered.indexOf(TASKDB_HEADERS.ScheduledStartTime)]).toBe(
      formatDateForSheet(start),
    );
    expect(row[reordered.indexOf(TASKDB_HEADERS.Status)]).toBe('Not Started');
  });
});

describe('event title round-trip', () => {
  it('formats and parses with category', () => {
    const title = formatEventTitle('提案書執筆', '管理');
    expect(title).toBe('(管理)_提案書執筆');
    expect(parseEventTitle(title)).toEqual({ taskName: '提案書執筆', category: '管理' });
  });

  it('omits parentheses when category is null', () => {
    const title = formatEventTitle('朝会', null);
    expect(title).toBe('朝会');
    expect(parseEventTitle(title)).toEqual({ taskName: '朝会', category: null });
  });

  it('handles task names that contain parentheses', () => {
    const title = formatEventTitle('テスト(本番想定)', '開発');
    const parsed = parseEventTitle(title);
    expect(parsed.taskName).toBe('テスト(本番想定)');
    expect(parsed.category).toBe('開発');
  });
});
