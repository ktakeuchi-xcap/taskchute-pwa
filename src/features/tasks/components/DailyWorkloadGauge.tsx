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
  const donePct = Math.min(100, (doneMinutes / DAILY_CAPACITY_MINUTES) * 100);
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
      <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-emerald-500 transition-[width]"
          style={{ width: `${donePct}%` }}
        />
        <div
          className={cn(
            'h-full transition-[width]',
            totalPct > 100 ? 'bg-destructive' : 'bg-primary',
          )}
          style={{ width: `${activePct}%` }}
        />
      </div>
    </div>
  );
}
