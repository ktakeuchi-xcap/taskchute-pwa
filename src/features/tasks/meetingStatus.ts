import { TaskSource, TaskStatus, type Task } from './types';

/**
 * Meeting tasks never get a manual start/end press, so their status is
 * derived live from the wall clock against the calendar's own scheduled
 * times instead of being persisted. All-day/zero-duration events (estimate
 * 0) are left as NotStarted forever — there's no meaningful "in progress"
 * moment for those, and including them would skew the workload gauge and
 * effort dashboard.
 */
export function deriveMeetingTaskStatus(task: Task, now: Date): Task {
  if (task.source !== TaskSource.Meeting || task.estimateMinutes <= 0) return task;

  if (now < task.scheduledStartTime) {
    return { ...task, status: TaskStatus.NotStarted, actualStartTime: null, actualEndTime: null };
  }
  if (now <= task.scheduledEndTime) {
    return {
      ...task,
      status: TaskStatus.InProgress,
      actualStartTime: task.scheduledStartTime,
      actualEndTime: null,
    };
  }
  return {
    ...task,
    status: TaskStatus.Done,
    actualStartTime: task.scheduledStartTime,
    actualEndTime: task.scheduledEndTime,
  };
}
