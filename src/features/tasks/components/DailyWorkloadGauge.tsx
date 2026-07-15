import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  DAILY_CAPACITY_MINUTES,
  sumEstimateMinutes,
  expectedProgressPercent,
} from '@/features/tasks/workload';
import type { Task } from '@/features/tasks/types';

interface DailyWorkloadGaugeProps {
  activeTasks: Task[];
  doneTasks: Task[];
}

// A short completed task can be just a few % of the full-day scale — enforce a
// minimum visible width so any non-zero "done" amount actually shows as a sliver
// instead of rendering indistinguishably thin next to the active segment.
const MIN_VISIBLE_PCT = 4;
// Once over capacity, stretch the track's scale so the 100% mark sits partway
// across it (with this much headroom left after the filled bar) instead of at
// the very edge — that's what leaves room for the bar to visibly run past it.
const OVERFLOW_HEADROOM_PCT = 20;

/**
 * A workload gauge for "today" that stays visible regardless of whether a
 * task is in progress (previously embedded further down the page, it would
 * scroll out of view once CurrentTaskCard grew to show the running timer).
 * The bar is split into a completed segment and a remaining segment so
 * progress through the day's plan is visible at a glance. Once over 100%,
 * the track rescales so the filled bar visibly runs past a "100%" mark
 * instead of just being clamped to the same width. A second marker shows
 * how far through today's capacity you'd expect to be by the current time.
 */
export function DailyWorkloadGauge({ activeTasks, doneTasks }: DailyWorkloadGaugeProps) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const doneMinutes = sumEstimateMinutes(doneTasks);
  const activeMinutes = sumEstimateMinutes(activeTasks);
  const totalMinutes = doneMinutes + activeMinutes;

  if (totalMinutes === 0 && doneTasks.length === 0 && activeTasks.length === 0) return null;

  const doneCapPct = (doneMinutes / DAILY_CAPACITY_MINUTES) * 100;
  const activeCapPct = (activeMinutes / DAILY_CAPACITY_MINUTES) * 100;
  const totalCapPct = doneCapPct + activeCapPct;
  const totalPct = Math.round(totalCapPct);
  const isOverflowing = totalCapPct > 100;

  const scale = isOverflowing ? totalCapPct + OVERFLOW_HEADROOM_PCT : 100;
  const toTrackPct = (capPct: number) => (capPct / scale) * 100;

  const doneTrackRaw = toTrackPct(doneCapPct);
  const donePct = doneMinutes > 0 ? Math.min(100, Math.max(MIN_VISIBLE_PCT, doneTrackRaw)) : 0;
  const activeTrackRaw = Math.max(0, toTrackPct(activeCapPct));
  const filledPct = Math.min(100, donePct + activeTrackRaw);
  const capMarkPct = toTrackPct(100);
  const overflowPct = isOverflowing ? Math.max(0, filledPct - capMarkPct) : 0;
  const activePct = Math.max(0, filledPct - donePct - overflowPct);
  const expectedPct = toTrackPct(expectedProgressPercent(now));

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
      <div className="relative mt-3">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
          {donePct > 0 ? (
            <div
              className="h-full flex-shrink-0 bg-emerald-500 transition-[width]"
              style={{ width: `${donePct}%` }}
            />
          ) : null}
          {activePct > 0 ? (
            <div
              className="h-full flex-shrink-0 bg-primary transition-[width]"
              style={{ width: `${activePct}%` }}
            />
          ) : null}
          {overflowPct > 0 ? (
            <div
              className="h-full flex-shrink-0 bg-destructive transition-[width]"
              style={{ width: `${overflowPct}%` }}
            />
          ) : null}
        </div>
        {isOverflowing ? (
          <div
            className="absolute top-1/2 h-3.5 w-px -translate-y-1/2 bg-destructive/50"
            style={{ left: `${capMarkPct}%` }}
            aria-hidden
          />
        ) : null}
        <div
          className="absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded-full bg-foreground/60"
          style={{ left: `${expectedPct}%` }}
          title={`現在時刻の目安：${Math.round(expectedProgressPercent(now))}%`}
        />
      </div>
    </div>
  );
}
