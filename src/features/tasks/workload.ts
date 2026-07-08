import type { Task } from './types';

/** A day's capacity for the workload bar/summary — 360 minutes (6 hours) = 100%. */
export const DAILY_CAPACITY_MINUTES = 360;

export function sumEstimateMinutes(tasks: Task[] | undefined): number {
  return (tasks ?? []).reduce((sum, t) => sum + t.estimateMinutes, 0);
}
