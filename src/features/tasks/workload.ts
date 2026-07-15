import { formatJst, jstDate } from '@/lib/time/jst';
import type { Task } from './types';

/** A day's capacity for the workload bar/summary — 480 minutes (8 hours) = 100%. */
export const DAILY_CAPACITY_MINUTES = 480;

/** Assumed workday start (JST) the capacity is measured from — see the workload gauge's progress line. */
export const WORKDAY_START_HOUR = 9;

export function sumEstimateMinutes(tasks: Task[] | undefined): number {
  return (tasks ?? []).reduce((sum, t) => sum + t.estimateMinutes, 0);
}

/**
 * What % of today's capacity should be done by now, assuming a flat
 * WORKDAY_START_HOUR-to-(+DAILY_CAPACITY_MINUTES) workday. Clamped to
 * 0-100 outside that window (before start, or once the day's capacity has
 * fully elapsed).
 */
export function expectedProgressPercent(now: Date): number {
  const start = jstDate(
    Number(formatJst(now, 'yyyy')),
    Number(formatJst(now, 'MM')),
    Number(formatJst(now, 'dd')),
    WORKDAY_START_HOUR,
    0,
  );
  const elapsedMinutes = (now.getTime() - start.getTime()) / 60_000;
  return Math.max(0, Math.min(100, (elapsedMinutes / DAILY_CAPACITY_MINUTES) * 100));
}
