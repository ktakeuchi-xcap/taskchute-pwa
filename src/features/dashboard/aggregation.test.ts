import { describe, expect, it } from 'vitest';
import {
  actualMinutes,
  aggregateDailyTotals,
  aggregateMonthlyByCategory,
  toPersonMonths,
} from './aggregation';
import { TaskStatus, type Task } from '@/features/tasks/types';

let seq = 0;
function makeTask(overrides: Partial<Task>): Task {
  seq += 1;
  return {
    taskId: `t${seq}`,
    taskName: `task-${seq}`,
    category: null,
    estimateMinutes: 30,
    scheduledStartTime: new Date('2026-06-01T09:00:00+09:00'),
    scheduledEndTime: new Date('2026-06-01T09:30:00+09:00'),
    actualStartTime: null,
    actualEndTime: null,
    status: TaskStatus.NotStarted,
    calendarEventId: 'evt',
    source: null,
    ...overrides,
  };
}

describe('actualMinutes', () => {
  it('returns 0 for a task that is not Done', () => {
    const task = makeTask({
      status: TaskStatus.InProgress,
      actualStartTime: new Date('2026-06-01T09:00:00+09:00'),
    });
    expect(actualMinutes(task)).toBe(0);
  });

  it('returns 0 when actual times are missing', () => {
    const task = makeTask({ status: TaskStatus.Done });
    expect(actualMinutes(task)).toBe(0);
  });

  it('computes the actual duration in minutes for a Done task', () => {
    const task = makeTask({
      status: TaskStatus.Done,
      actualStartTime: new Date('2026-06-01T09:00:00+09:00'),
      actualEndTime: new Date('2026-06-01T09:45:00+09:00'),
    });
    expect(actualMinutes(task)).toBe(45);
  });
});

describe('aggregateMonthlyByCategory', () => {
  it('sums actual minutes per category for the given month, sorted descending', () => {
    const tasks = [
      makeTask({
        category: '案件A',
        status: TaskStatus.Done,
        actualStartTime: new Date('2026-06-05T09:00:00+09:00'),
        actualEndTime: new Date('2026-06-05T09:30:00+09:00'),
      }),
      makeTask({
        category: '案件A',
        status: TaskStatus.Done,
        actualStartTime: new Date('2026-06-10T09:00:00+09:00'),
        actualEndTime: new Date('2026-06-10T10:00:00+09:00'),
      }),
      makeTask({
        category: '案件B',
        status: TaskStatus.Done,
        actualStartTime: new Date('2026-06-15T09:00:00+09:00'),
        actualEndTime: new Date('2026-06-15T09:15:00+09:00'),
      }),
      // Different month — must be excluded.
      makeTask({
        category: '案件A',
        status: TaskStatus.Done,
        actualStartTime: new Date('2026-07-01T09:00:00+09:00'),
        actualEndTime: new Date('2026-07-01T10:00:00+09:00'),
      }),
      // Not Done — must be excluded even though it has actual times.
      makeTask({
        category: '案件A',
        status: TaskStatus.InProgress,
        actualStartTime: new Date('2026-06-20T09:00:00+09:00'),
      }),
    ];
    const result = aggregateMonthlyByCategory(tasks, '2026-06');
    expect(result).toEqual([
      { category: '案件A', minutes: 90 },
      { category: '案件B', minutes: 15 },
    ]);
  });

  it('groups uncategorized tasks under the fallback label', () => {
    const tasks = [
      makeTask({
        category: null,
        status: TaskStatus.Done,
        actualStartTime: new Date('2026-06-05T09:00:00+09:00'),
        actualEndTime: new Date('2026-06-05T09:20:00+09:00'),
      }),
    ];
    const result = aggregateMonthlyByCategory(tasks, '2026-06');
    expect(result).toEqual([{ category: '未分類', minutes: 20 }]);
  });
});

describe('toPersonMonths', () => {
  it('treats 160 hours (40h/week × 4 weeks) as exactly 1 person-month', () => {
    expect(toPersonMonths(160 * 60)).toBe(1);
  });

  it('scales linearly for partial amounts', () => {
    expect(toPersonMonths(80 * 60)).toBe(0.5);
  });
});

describe('aggregateDailyTotals', () => {
  it('sums actual minutes per day and fills in zero for days with no Done tasks', () => {
    const tasks = [
      makeTask({
        status: TaskStatus.Done,
        actualStartTime: new Date('2026-06-05T09:00:00+09:00'),
        actualEndTime: new Date('2026-06-05T09:40:00+09:00'),
      }),
      makeTask({
        status: TaskStatus.Done,
        actualStartTime: new Date('2026-06-05T14:00:00+09:00'),
        actualEndTime: new Date('2026-06-05T14:20:00+09:00'),
      }),
    ];
    const result = aggregateDailyTotals(tasks, ['2026-06-04', '2026-06-05', '2026-06-06']);
    expect(result).toEqual([
      { dateKey: '2026-06-04', minutes: 0 },
      { dateKey: '2026-06-05', minutes: 60 },
      { dateKey: '2026-06-06', minutes: 0 },
    ]);
  });

  it('ignores dates not present in the requested key list', () => {
    const tasks = [
      makeTask({
        status: TaskStatus.Done,
        actualStartTime: new Date('2026-06-05T09:00:00+09:00'),
        actualEndTime: new Date('2026-06-05T09:40:00+09:00'),
      }),
    ];
    const result = aggregateDailyTotals(tasks, ['2026-06-06']);
    expect(result).toEqual([{ dateKey: '2026-06-06', minutes: 0 }]);
  });
});
