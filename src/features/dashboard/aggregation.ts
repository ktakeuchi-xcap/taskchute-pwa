import { formatJst } from '@/lib/time/jst';
import { TaskStatus, type Task } from '@/features/tasks/types';

export const UNCATEGORIZED_LABEL = '未分類';

/**
 * Actual worked minutes for a Done task (0 for anything else, missing actual
 * times, or a task opted out of workload via countsTowardWorkload).
 */
export function actualMinutes(task: Task): number {
  if (!task.countsTowardWorkload) return 0;
  if (task.status !== TaskStatus.Done) return 0;
  if (!task.actualStartTime || !task.actualEndTime) return 0;
  const ms = task.actualEndTime.getTime() - task.actualStartTime.getTime();
  return ms > 0 ? Math.round(ms / 60_000) : 0;
}

export interface CategoryMonthlyTotal {
  category: string;
  minutes: number;
}

/**
 * Sum actual worked minutes per category (案件) for Done tasks whose
 * ActualStartTime falls within `yearMonth` ("yyyy-MM", JST). Sorted by
 * minutes descending. This is the core "案件別月間工数" figure — it's
 * deliberately based on ActualStartTime/EndTime (real work done), not the
 * estimate, per REQ-03.
 */
export function aggregateMonthlyByCategory(
  tasks: Task[],
  yearMonth: string,
): CategoryMonthlyTotal[] {
  const totals = new Map<string, number>();
  for (const task of tasks) {
    if (task.status !== TaskStatus.Done || !task.actualStartTime) continue;
    if (formatJst(task.actualStartTime, 'yyyy-MM') !== yearMonth) continue;
    const minutes = actualMinutes(task);
    if (minutes <= 0) continue;
    const category = task.category ?? UNCATEGORIZED_LABEL;
    totals.set(category, (totals.get(category) ?? 0) + minutes);
  }
  return [...totals.entries()]
    .map(([category, minutes]) => ({ category, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}

// 週40時間稼働×4週＝160時間を1人月とする（一般的なSI業界の換算基準）。
export const MINUTES_PER_PERSON_MONTH = 160 * 60;

export function toPersonMonths(minutes: number): number {
  return minutes / MINUTES_PER_PERSON_MONTH;
}

export interface DailyTotal {
  dateKey: string;
  minutes: number;
}

/** Sum actual worked minutes per day, for exactly the given list of "yyyy-MM-dd" keys (JST). */
export function aggregateDailyTotals(tasks: Task[], dateKeys: string[]): DailyTotal[] {
  const totals = new Map<string, number>(dateKeys.map((key) => [key, 0]));
  for (const task of tasks) {
    if (task.status !== TaskStatus.Done || !task.actualStartTime) continue;
    const key = formatJst(task.actualStartTime, 'yyyy-MM-dd');
    if (!totals.has(key)) continue;
    totals.set(key, (totals.get(key) ?? 0) + actualMinutes(task));
  }
  return dateKeys.map((dateKey) => ({ dateKey, minutes: totals.get(dateKey) ?? 0 }));
}

export interface DailyCategoryBreakdown {
  dateKey: string;
  /** Sorted by minutes descending, same shape as aggregateMonthlyByCategory. */
  categories: CategoryMonthlyTotal[];
}

/**
 * Per-day category breakdown of actual worked minutes, for exactly the given
 * "yyyy-MM-dd" keys (JST) — the per-category companion to
 * aggregateDailyTotals, used to break each day's trend bar down by 案件.
 */
export function aggregateDailyByCategory(
  tasks: Task[],
  dateKeys: string[],
): DailyCategoryBreakdown[] {
  const perDay = new Map<string, Map<string, number>>(dateKeys.map((key) => [key, new Map()]));
  for (const task of tasks) {
    if (task.status !== TaskStatus.Done || !task.actualStartTime) continue;
    const key = formatJst(task.actualStartTime, 'yyyy-MM-dd');
    const dayTotals = perDay.get(key);
    if (!dayTotals) continue;
    const minutes = actualMinutes(task);
    if (minutes <= 0) continue;
    const category = task.category ?? UNCATEGORIZED_LABEL;
    dayTotals.set(category, (dayTotals.get(category) ?? 0) + minutes);
  }
  return dateKeys.map((dateKey) => ({
    dateKey,
    categories: [...(perDay.get(dateKey) ?? new Map<string, number>()).entries()]
      .map(([category, minutes]) => ({ category, minutes }))
      .sort((a, b) => b.minutes - a.minutes),
  }));
}
