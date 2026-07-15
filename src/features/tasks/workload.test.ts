import { describe, expect, it } from 'vitest';
import { jstDate } from '@/lib/time/jst';
import {
  DAILY_CAPACITY_MINUTES,
  expectedProgressPercent,
  sumEstimateMinutes,
  WORKDAY_START_HOUR,
} from './workload';
import { TaskSource, TaskStatus, type Task } from './types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    taskId: 't1',
    taskName: 'task',
    category: null,
    estimateMinutes: 30,
    scheduledStartTime: new Date('2026-07-15T10:00:00+09:00'),
    scheduledEndTime: new Date('2026-07-15T10:30:00+09:00'),
    actualStartTime: null,
    actualEndTime: null,
    status: TaskStatus.NotStarted,
    calendarEventId: '',
    source: null,
    recurringEventId: null,
    countsTowardWorkload: true,
    ...overrides,
  };
}

describe('sumEstimateMinutes', () => {
  it('sums estimateMinutes across tasks', () => {
    expect(
      sumEstimateMinutes([makeTask({ estimateMinutes: 30 }), makeTask({ estimateMinutes: 45 })]),
    ).toBe(75);
  });

  it('excludes tasks with countsTowardWorkload false', () => {
    const tasks = [
      makeTask({ estimateMinutes: 30, countsTowardWorkload: true }),
      makeTask({ estimateMinutes: 45, countsTowardWorkload: false }),
      makeTask({ estimateMinutes: 20, source: TaskSource.Meeting, countsTowardWorkload: false }),
    ];
    expect(sumEstimateMinutes(tasks)).toBe(30);
  });

  it('returns 0 for undefined', () => {
    expect(sumEstimateMinutes(undefined)).toBe(0);
  });
});

describe('expectedProgressPercent', () => {
  it('is 0 before the workday starts', () => {
    const before = jstDate(2026, 7, 15, WORKDAY_START_HOUR - 1, 0);
    expect(expectedProgressPercent(before)).toBe(0);
  });

  it('is 50 halfway through the workday', () => {
    const halfwayMinutes = DAILY_CAPACITY_MINUTES / 2;
    const halfway = new Date(
      jstDate(2026, 7, 15, WORKDAY_START_HOUR, 0).getTime() + halfwayMinutes * 60_000,
    );
    expect(expectedProgressPercent(halfway)).toBeCloseTo(50, 5);
  });

  it('caps at 100 once the workday capacity has fully elapsed', () => {
    const after = new Date(
      jstDate(2026, 7, 15, WORKDAY_START_HOUR, 0).getTime() +
        (DAILY_CAPACITY_MINUTES + 60) * 60_000,
    );
    expect(expectedProgressPercent(after)).toBe(100);
  });
});
