import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { formatJst, jstToday } from '@/lib/time/jst';
import { useTasks } from '@/features/tasks/hooks/useTasks';
import { useWaitingTasks } from '@/features/waiting/hooks/useWaitingTasks';
import { useCategoryColorMap } from '@/features/tasks/hooks/useCategoryColorMap';
import { categoryDotClassName } from '@/features/tasks/categoryColors';
import { useUIStore } from '@/store/uiStore';
import { TaskStatus } from '@/features/tasks/types';
import {
  aggregateDailyTotals,
  aggregateMonthlyByCategory,
  toPersonMonths,
} from '@/features/dashboard/aggregation';

const TREND_DAYS = 14;

function buildTrendDateKeys(): string[] {
  const today = new Date();
  const start = addDays(today, -(TREND_DAYS - 1));
  return Array.from({ length: TREND_DAYS }, (_, i) => formatJst(addDays(start, i), 'yyyy-MM-dd'));
}

function shiftMonth(year: number, month0: number, delta: number): { year: number; month0: number } {
  const total = year * 12 + month0 + delta;
  return { year: Math.floor(total / 12), month0: ((total % 12) + 12) % 12 };
}

function formatHoursMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}

// 週40時間×4週＝160時間を1人月とする換算（aggregation.tsのMINUTES_PER_PERSON_MONTHに合わせる）。
function formatPersonMonths(minutes: number): string {
  return `${toPersonMonths(minutes).toFixed(2)}人月`;
}

export function DashboardRoute() {
  const tasksQuery = useTasks();
  const waitingQuery = useWaitingTasks();
  const categoryColorMap = useCategoryColorMap();
  const setTab = useUIStore((s) => s.setTab);

  const { year: baseYear, month0: baseMonth0 } = useMemo(() => {
    const t = jstToday();
    return { year: t.getFullYear(), month0: t.getMonth() };
  }, []);
  const [monthOffset, setMonthOffset] = useState(0);
  const { year, month0 } = shiftMonth(baseYear, baseMonth0, monthOffset);
  const yearMonth = `${year}-${String(month0 + 1).padStart(2, '0')}`;
  const monthLabel = `${year}年${month0 + 1}月`;

  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const todayKey = formatJst(new Date(), 'yyyy-MM-dd');

  const todaysTasks = useMemo(
    () => tasks.filter((t) => formatJst(t.scheduledStartTime, 'yyyy-MM-dd') === todayKey),
    [tasks, todayKey],
  );
  const todaysDoneCount = todaysTasks.filter((t) => t.status === TaskStatus.Done).length;
  const current = tasks.find((t) => t.status === TaskStatus.InProgress) ?? null;
  const next = todaysTasks.find((t) => t.status === TaskStatus.NotStarted) ?? null;

  const activeWaiting = (waitingQuery.data ?? []).filter((w) => !w.completed);
  const overdueWaitingCount = activeWaiting.filter(
    (w) => w.followUpDate && formatJst(w.followUpDate, 'yyyy-MM-dd') <= todayKey,
  ).length;

  const dailyTotals = useMemo(() => aggregateDailyTotals(tasks, buildTrendDateKeys()), [tasks]);
  const maxDailyMinutes = Math.max(1, ...dailyTotals.map((d) => d.minutes));

  const monthlyTotals = useMemo(
    () => aggregateMonthlyByCategory(tasks, yearMonth),
    [tasks, yearMonth],
  );
  const monthTotalMinutes = monthlyTotals.reduce((sum, c) => sum + c.minutes, 0);
  const maxCategoryMinutes = Math.max(1, ...monthlyTotals.map((c) => c.minutes));

  if (tasksQuery.isLoading) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
          読み込み中…
        </div>
      </div>
    );
  }

  if (tasksQuery.isError) {
    return (
      <div className="p-4">
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          タスクの読み込みに失敗しました：
          {tasksQuery.error instanceof Error ? tasksQuery.error.message : '不明なエラー'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">実績</h2>

      {/* 今日の進捗 */}
      <button
        type="button"
        onClick={() => setTab('today')}
        className="w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent"
      >
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          今日の進捗
        </h3>
        <p className="mt-1 text-sm">
          {current ? (
            <>
              進行中：<span className="font-medium">{current.taskName}</span>
            </>
          ) : next ? (
            <>
              次のタスク：<span className="font-medium">{next.taskName}</span>
            </>
          ) : (
            '本日のタスクは以上です'
          )}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          完了 {todaysDoneCount} / {todaysTasks.length} 件
        </p>
      </button>

      {/* 確認待ち残数 */}
      <button
        type="button"
        onClick={() => setTab('waiting')}
        className="w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent"
      >
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          確認待ち残数
        </h3>
        <div className="mt-1 flex items-baseline gap-3">
          <p className="text-2xl font-semibold">{activeWaiting.length}</p>
          {overdueWaitingCount > 0 ? (
            <p className="text-xs text-destructive">フォロー予定日超過 {overdueWaitingCount}件</p>
          ) : (
            <p className="text-xs text-muted-foreground">件</p>
          )}
        </div>
      </button>

      {/* 日次稼働推移 */}
      <div className="rounded-lg border border-border bg-card p-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          日次稼働推移（過去{TREND_DAYS}日）
        </h3>
        <div className="mt-2 flex h-20 items-end gap-1">
          {dailyTotals.map((d) => {
            const heightPct = Math.max(4, Math.round((d.minutes / maxDailyMinutes) * 100));
            const isToday = d.dateKey === todayKey;
            return (
              <div key={d.dateKey} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-16 w-full items-end">
                  <div
                    className={cn(
                      'w-full rounded-t transition-[height]',
                      isToday ? 'bg-primary' : 'bg-muted-foreground/40',
                    )}
                    style={{ height: `${heightPct}%` }}
                    role="img"
                    aria-label={`${d.dateKey} ${d.minutes}分`}
                  />
                </div>
                <span className="text-[9px] text-muted-foreground">
                  {formatJst(new Date(`${d.dateKey}T00:00:00+09:00`), 'd')}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 案件別月間工数 */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            案件別月間工数
          </h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="前の月"
              onClick={() => setMonthOffset((v) => v - 1)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="w-20 text-center text-xs font-medium">{monthLabel}</span>
            <button
              type="button"
              aria-label="次の月"
              onClick={() => setMonthOffset((v) => Math.min(0, v + 1))}
              disabled={monthOffset >= 0}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {monthlyTotals.length === 0 ? (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            {monthLabel}の実績はまだありません
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {monthlyTotals.map((c) => (
              <div key={c.category} className="flex items-center gap-2">
                <span
                  className={cn(
                    'h-2 w-2 flex-shrink-0 rounded-full',
                    categoryDotClassName(categoryColorMap.get(c.category)),
                  )}
                />
                <span className="w-16 flex-shrink-0 truncate text-xs">{c.category}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${Math.round((c.minutes / maxCategoryMinutes) * 100)}%` }}
                  />
                </div>
                <span className="w-24 flex-shrink-0 text-right text-xs text-muted-foreground">
                  <span className="block">{formatHoursMinutes(c.minutes)}</span>
                  <span className="block text-[10px]">{formatPersonMonths(c.minutes)}</span>
                </span>
              </div>
            ))}
            <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-xs font-medium">
              <span>合計</span>
              <span className="text-right">
                <span className="block">{formatHoursMinutes(monthTotalMinutes)}</span>
                <span className="block text-[10px] font-normal text-muted-foreground">
                  {formatPersonMonths(monthTotalMinutes)}
                </span>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
