import { cn } from '@/lib/utils';
import { DAILY_CAPACITY_MINUTES, sumEstimateMinutes } from '@/features/tasks/workload';
import type { Task } from '@/features/tasks/types';

interface DailyWorkloadGaugeProps {
  activeTasks: Task[];
  doneTasks: Task[];
}

/**
 * A workload gauge for "today" that stays visible regardless of whether a
 * task is in progress (previously embedded further down the page, it would
 * scroll out of view once CurrentTaskCard grew to show the running timer).
 * The bar is split into a completed segment and a remaining segment so
 * progress through the day's plan is visible at a glance.
 */
export function DailyWorkloadGauge({ activeTasks, doneTasks }: DailyWorkloadGaugeProps) {
  const doneMinutes = sumEstimateMinutes(doneTasks);
  const activeMinutes = sumEstimateMinutes(activeTasks);
  const totalMinutes = doneMinutes + activeMinutes;

  if (totalMinutes === 0 && doneTasks.length === 0 && activeTasks.length === 0) return null;

  const totalPct = Math.round((totalMinutes / DAILY_CAPACITY_MINUTES) * 100);
  // A short completed task can be just a few % of the full-day scale — enforce a
  // minimum visible width so any non-zero "done" amount actually shows as a sliver
  // instead of rendering indistinguishably thin next to the active segment.
  const MIN_VISIBLE_PCT = 4;
  const donePctRaw = (doneMinutes / DAILY_CAPACITY_MINUTES) * 100;
  const donePct = doneMinutes > 0 ? Math.max(MIN_VISIBLE_PCT, Math.min(100, donePctRaw)) : 0;
  const activePct = Math.min(100 - donePct, (activeMinutes / DAILY_CAPACITY_MINUTES) * 100);

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          今日の工数
        </h2>
        <p className={cn('text-xs', totalPct > 100 ? 'text-destructive' : 'text-muted-foreground')}>
          完了{doneMinutes}分 / 合計{totalMinutes}分（{totalPct}%）
        </p>
      </div>
      <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {donePct > 0 ? (
          <div
            className="h-full flex-shrink-0 bg-emerald-500 transition-[width]"
            style={{ width: `${donePct}%` }}
          />
        ) : null}
        <div
          className={cn(
            'h-full flex-shrink-0 transition-[width]',
            totalPct > 100 ? 'bg-destructive' : 'bg-primary',
          )}
          style={{ width: `${activePct}%` }}
        />
      </div>
    </div>
  );
}
