import { describe, expect, it } from 'vitest';
import { MEETING_MISS_GRACE, reconcileMeetingFlicker } from './useTasks';
import { TaskSource, TaskStatus, type Task } from '@/features/tasks/types';

let seq = 0;
function makeTask(overrides: Partial<Task> = {}): Task {
  seq += 1;
  return {
    taskId: `t${seq}`,
    taskName: `task-${seq}`,
    category: null,
    estimateMinutes: 30,
    scheduledStartTime: new Date('2026-07-10T10:00:00+09:00'),
    scheduledEndTime: new Date('2026-07-10T10:30:00+09:00'),
    actualStartTime: null,
    actualEndTime: null,
    status: TaskStatus.NotStarted,
    calendarEventId: 'evt',
    source: null,
    recurringEventId: null,
    countsTowardWorkload: true,
    ...overrides,
  };
}

describe('reconcileMeetingFlicker', () => {
  it('returns the fresh list unchanged when there is no previous snapshot', () => {
    const fresh = [makeTask({ source: TaskSource.Meeting })];
    expect(reconcileMeetingFlicker(fresh, undefined, new Map())).toBe(fresh);
  });

  it('carries over a meeting missing from the fresh fetch for one grace cycle', () => {
    const meeting = makeTask({ taskId: 'm1', source: TaskSource.Meeting });
    const other = makeTask({ taskId: 't2' });
    const previous = [meeting, other];
    const fresh = [other]; // meeting vanished from this fetch
    const streaks = new Map<string, number>();

    const result = reconcileMeetingFlicker(fresh, previous, streaks);

    expect(result).toContainEqual(meeting);
    expect(result).toContainEqual(other);
    expect(streaks.get('m1')).toBe(1);
  });

  it('drops the meeting once it has missed more than the grace limit', () => {
    const meeting = makeTask({ taskId: 'm1', source: TaskSource.Meeting });
    const other = makeTask({ taskId: 't2' });
    const streaks = new Map<string, number>([['m1', MEETING_MISS_GRACE]]);

    const result = reconcileMeetingFlicker([other], [meeting, other], streaks);

    expect(result).toEqual([other]);
    expect(streaks.has('m1')).toBe(false);
  });

  it('clears the miss streak once the meeting reappears in a fresh fetch', () => {
    const meeting = makeTask({ taskId: 'm1', source: TaskSource.Meeting });
    const streaks = new Map<string, number>([['m1', 1]]);

    const result = reconcileMeetingFlicker([meeting], [meeting], streaks);

    expect(result).toEqual([meeting]);
    expect(streaks.has('m1')).toBe(false);
  });

  it('never carries over a missing non-meeting task', () => {
    const manual = makeTask({ taskId: 'x1', source: null });
    const streaks = new Map<string, number>();

    const result = reconcileMeetingFlicker([], [manual], streaks);

    expect(result).toEqual([]);
    expect(streaks.size).toBe(0);
  });

  it('sorts carried-over meetings back into scheduled order', () => {
    const early = makeTask({
      taskId: 'm-early',
      source: TaskSource.Meeting,
      scheduledStartTime: new Date('2026-07-10T09:00:00+09:00'),
      scheduledEndTime: new Date('2026-07-10T09:30:00+09:00'),
    });
    const late = makeTask({
      taskId: 't-late',
      scheduledStartTime: new Date('2026-07-10T11:00:00+09:00'),
      scheduledEndTime: new Date('2026-07-10T11:30:00+09:00'),
    });
    const streaks = new Map<string, number>();

    const result = reconcileMeetingFlicker([late], [early, late], streaks);

    expect(result.map((t) => t.taskId)).toEqual(['m-early', 't-late']);
  });
});
