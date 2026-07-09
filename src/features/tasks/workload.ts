import type { Task } from './types';

/** A day's capacity for the workload bar/summary — 480 minutes (8 hours) = 100%. */
export const DAILY_CAPACITY_MINUTES = 480;

export function sumEstimateMinutes(tasks: Task[] | undefined): number {
  return (tasks ?? []).reduce((sum, t) => sum + t.estimateMinutes, 0);
}
