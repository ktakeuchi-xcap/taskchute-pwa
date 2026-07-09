import { describe, expect, it } from 'vitest';
import { deriveMeetingTaskStatus } from './meetingStatus';
import { TaskSource, TaskStatus, type Task } from './types';

function makeMeetingTask(overrides: Partial<Task> = {}): Task {
  return {
    taskId: 't1',
    taskName: '打ち合わせ',
    category: null,
    estimateMinutes: 30,
    scheduledStartTime: new Date('2026-07-09T10:00:00+09:00'),
    scheduledEndTime: new Date('2026-07-09T10:30:00+09:00'),
    actualStartTime: null,
    actualEndTime: null,
    status: TaskStatus.NotStarted,
    calendarEventId: 'evt-1',
    source: TaskSource.Meeting,
    ...overrides,
  };
}

describe('deriveMeetingTaskStatus', () => {
  it('leaves non-meeting tasks untouched', () => {
    const task = makeMeetingTask({ source: null, status: TaskStatus.InProgress });
    expect(deriveMeetingTaskStatus(task, new Date('2026-07-09T10:15:00+09:00'))).toBe(task);
  });

  it('leaves zero-duration (all-day) meeting tasks as NotStarted regardless of time', () => {
    const task = makeMeetingTask({ estimateMinutes: 0 });
    const result = deriveMeetingTaskStatus(task, new Date('2026-07-09T23:00:00+09:00'));
    expect(result.status).toBe(TaskStatus.NotStarted);
    expect(result.actualStartTime).toBeNull();
  });

  it('is NotStarted before the scheduled start time', () => {
    const task = makeMeetingTask();
    const result = deriveMeetingTaskStatus(task, new Date('2026-07-09T09:00:00+09:00'));
    expect(result.status).toBe(TaskStatus.NotStarted);
    expect(result.actualStartTime).toBeNull();
    expect(result.actualEndTime).toBeNull();
  });

  it('is InProgress between scheduled start and end', () => {
    const task = makeMeetingTask();
    const result = deriveMeetingTaskStatus(task, new Date('2026-07-09T10:15:00+09:00'));
    expect(result.status).toBe(TaskStatus.InProgress);
    expect(result.actualStartTime).toEqual(task.scheduledStartTime);
    expect(result.actualEndTime).toBeNull();
  });

  it('is Done after the scheduled end time, with actual times set to the schedule', () => {
    const task = makeMeetingTask();
    const result = deriveMeetingTaskStatus(task, new Date('2026-07-09T11:00:00+09:00'));
    expect(result.status).toBe(TaskStatus.Done);
    expect(result.actualStartTime).toEqual(task.scheduledStartTime);
    expect(result.actualEndTime).toEqual(task.scheduledEndTime);
  });
});
