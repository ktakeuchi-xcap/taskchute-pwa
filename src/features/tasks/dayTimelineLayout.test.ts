import { describe, expect, it } from 'vitest';
import { layoutDayTimeline } from './dayTimelineLayout';
import { TaskStatus, type Task } from './types';

const HOUR_HEIGHT = 48;

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
    recurringEventId: null,
    countsTowardWorkload: true,
    ...overrides,
  };
}

describe('layoutDayTimeline', () => {
  it('positions a single task from its JST start time, scaled by hourHeightPx', () => {
    const task = makeTask({
      scheduledStartTime: new Date('2026-06-01T09:00:00+09:00'),
      scheduledEndTime: new Date('2026-06-01T09:30:00+09:00'),
    });
    const [result] = layoutDayTimeline([task], HOUR_HEIGHT);
    expect(result).toMatchObject({
      top: 9 * HOUR_HEIGHT,
      height: 0.5 * HOUR_HEIGHT,
      column: 0,
      totalColumns: 1,
    });
  });

  it('enforces a minimum visible height for a very short task', () => {
    const task = makeTask({
      estimateMinutes: 5,
      scheduledStartTime: new Date('2026-06-01T09:00:00+09:00'),
      scheduledEndTime: new Date('2026-06-01T09:05:00+09:00'),
    });
    const [result] = layoutDayTimeline([task], HOUR_HEIGHT);
    expect(result!.height).toBe(18);
  });

  it('keeps back-to-back (non-overlapping) tasks each at full width', () => {
    const a = makeTask({
      scheduledStartTime: new Date('2026-06-01T10:00:00+09:00'),
      scheduledEndTime: new Date('2026-06-01T11:00:00+09:00'),
    });
    const b = makeTask({
      scheduledStartTime: new Date('2026-06-01T11:00:00+09:00'),
      scheduledEndTime: new Date('2026-06-01T12:00:00+09:00'),
    });
    const result = layoutDayTimeline([a, b], HOUR_HEIGHT);
    for (const r of result) {
      expect(r.totalColumns).toBe(1);
      expect(r.column).toBe(0);
    }
  });

  it('splits genuinely overlapping tasks into side-by-side columns', () => {
    const a = makeTask({
      scheduledStartTime: new Date('2026-06-01T10:00:00+09:00'),
      scheduledEndTime: new Date('2026-06-01T11:00:00+09:00'),
    });
    const b = makeTask({
      scheduledStartTime: new Date('2026-06-01T10:30:00+09:00'),
      scheduledEndTime: new Date('2026-06-01T11:30:00+09:00'),
    });
    const result = layoutDayTimeline([a, b], HOUR_HEIGHT);
    const byId = new Map(result.map((r) => [r.task.taskId, r]));
    expect(byId.get(a.taskId)!.totalColumns).toBe(2);
    expect(byId.get(b.taskId)!.totalColumns).toBe(2);
    expect(byId.get(a.taskId)!.column).not.toBe(byId.get(b.taskId)!.column);
  });

  it('reuses a freed column once its previous occupant has ended', () => {
    // a: 09:00-09:30, b: 09:15-09:45 (overlaps a), c: 09:45-10:15 (overlaps
    // only b's end boundary, not b's span) — c should reuse a's column
    // (freed at 09:30) rather than opening a third column.
    const a = makeTask({
      scheduledStartTime: new Date('2026-06-01T09:00:00+09:00'),
      scheduledEndTime: new Date('2026-06-01T09:30:00+09:00'),
    });
    const b = makeTask({
      scheduledStartTime: new Date('2026-06-01T09:15:00+09:00'),
      scheduledEndTime: new Date('2026-06-01T09:45:00+09:00'),
    });
    const c = makeTask({
      scheduledStartTime: new Date('2026-06-01T09:45:00+09:00'),
      scheduledEndTime: new Date('2026-06-01T10:15:00+09:00'),
    });
    const result = layoutDayTimeline([a, b, c], HOUR_HEIGHT);
    const byId = new Map(result.map((r) => [r.task.taskId, r]));
    expect(byId.get(a.taskId)!.totalColumns).toBe(2);
    expect(byId.get(c.taskId)!.column).toBe(byId.get(a.taskId)!.column);
  });

  it('returns an empty array for no tasks', () => {
    expect(layoutDayTimeline([], HOUR_HEIGHT)).toEqual([]);
  });
});
