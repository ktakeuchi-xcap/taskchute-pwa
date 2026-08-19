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
import { isAllDayMeeting } from '@/features/tasks/meetingStatus';
import { TaskSource, TaskStatus } from '@/features/tasks/types';
import { DAILY_CAPACITY_MINUTES } from '@/features/tasks/workload';
import { WorkReportSection } from '@/features/reports/components/WorkReportSection';
import {
  aggregateDailyByCategory,
  aggregateDailyEstimatedTotals,
  aggregateDailyTotals,
  aggregateMonthlyByCategory,
  aggregateMonthlyEstimatedByCategory,
  toPersonMonths,
} from '@/features/dashboard/aggregation';

const TREND_DAYS = 14;

/**
 * `periodOffset` 0 = the TREND_DAYS days ending today (inclusive, the
 * original fixed window); each step shifts the whole non-overlapping window
 * by TREND_DAYS — +1 reaches into the future (all-zero until tasks in that
 * range are actually done, but still browsable, same as 予定's week nav).
 */
function buildTrendDateKeys(periodOffset: number): string[] {
  const today = new Date();
  const start = addDays(today, periodOffset * TREND_DAYS - (TREND_DAYS - 1));
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

  const [trendPeriodOffset, setTrendPeriodOffset] = useState(0);
  const [activeTrendKey, setActiveTrendKey] = useState<string | null>(null);

  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const todayKey = formatJst(new Date(), 'yyyy-MM-dd');

  const todaysTasks = useMemo(
    () => tasks.filter((t) => formatJst(t.scheduledStartTime, 'yyyy-MM-dd') === todayKey),
    [tasks, todayKey],
  );
  const todaysDoneCount = todaysTasks.filter((t) => t.status === TaskStatus.Done).length;
  // Multiple manual tasks can be in progress at once (parallel execution).
  const currentTasks = tasks.filter(
    (t) => t.source !== TaskSource.Meeting && t.status === TaskStatus.InProgress,
  );
  // Merges tasks and meetings — matches TodayRoute's "next up" slot, which
  // shows whichever is chronologically first regardless of source. All-day
  // meetings have no real "next up" moment, so they're excluded.
  const next =
    todaysTasks.find((t) => t.status === TaskStatus.NotStarted && !isAllDayMeeting(t)) ?? null;

  const activeWaiting = (waitingQuery.data ?? []).filter((w) => !w.completed);
  const overdueWaitingCount = activeWaiting.filter(
    (w) => w.followUpDate && formatJst(w.followUpDate, 'yyyy-MM-dd') <= todayKey,
  ).length;

  const trendDateKeys = useMemo(() => buildTrendDateKeys(trendPeriodOffset), [trendPeriodOffset]);
  const dailyTotals = useMemo(
    () => aggregateDailyTotals(tasks, trendDateKeys),
    [tasks, trendDateKeys],
  );
  const dailyCategoryBreakdowns = useMemo(
    () => aggregateDailyByCategory(tasks, trendDateKeys),
    [tasks, trendDateKeys],
  );
  // 見通し（実績とは無関係にその日の予定工数の合計。未完了分も含む）— 実績と
  // 同じ縦軸スケールで比較できるよう、両方の最大値からバーの上限を決める。
  const dailyEstimatedTotals = useMemo(
    () => aggregateDailyEstimatedTotals(tasks, trendDateKeys),
    [tasks, trendDateKeys],
  );
  const maxDailyMinutes = Math.max(
    1,
    ...dailyTotals.map((d) => d.minutes),
    ...dailyEstimatedTotals.map((d) => d.minutes),
  );
  const trendRangeLabel = `${formatJst(new Date(`${trendDateKeys[0]}T00:00:00+09:00`), 'M/d')}〜${formatJst(new Date(`${trendDateKeys[trendDateKeys.length - 1]}T00:00:00+09:00`), 'M/d')}`;

  const monthlyTotals = useMemo(
    () => aggregateMonthlyByCategory(tasks, yearMonth),
    [tasks, yearMonth],
  );
  // 見通し（実績とは無関係にその月に予定されている工数の合計。未完了分も含む）。
  const monthlyEstimatedTotals = useMemo(
    () => aggregateMonthlyEstimatedByCategory(tasks, yearMonth),
    [tasks, yearMonth],
  );
  // 実績・見通しのどちらか一方にしか出てこない案件（例：今月まだ実績が無く予定
  // だけがある案件）も取りこぼさないよう、両方の案件名を合わせた行を作る。
  const monthlyCategoryRows = useMemo(() => {
    const actualByCategory = new Map(monthlyTotals.map((c) => [c.category, c.minutes]));
    const estimatedByCategory = new Map(monthlyEstimatedTotals.map((c) => [c.category, c.minutes]));
    const categories = new Set([...actualByCategory.keys(), ...estimatedByCategory.keys()]);
    return [...categories]
      .map((category) => ({
        category,
        actualMinutes: actualByCategory.get(category) ?? 0,
        estimatedMinutes: estimatedByCategory.get(category) ?? 0,
      }))
      .sort((a, b) => b.actualMinutes - a.actualMinutes || b.estimatedMinutes - a.estimatedMinutes);
  }, [monthlyTotals, monthlyEstimatedTotals]);
  const monthTotalMinutes = monthlyTotals.reduce((sum, c) => sum + c.minutes, 0);
  const monthTotalEstimatedMinutes = monthlyEstimatedTotals.reduce((sum, c) => sum + c.minutes, 0);
  const maxCategoryMinutes = Math.max(
    1,
    ...monthlyCategoryRows.map((c) => Math.max(c.actualMinutes, c.estimatedMinutes)),
  );

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
          {currentTasks.length > 0 ? (
            <>
              進行中：
              <span className="font-medium">
                {currentTasks[0]!.taskName}
                {currentTasks.length > 1 ? ` 他${currentTasks.length - 1}件` : ''}
              </span>
            </>
          ) : next ? (
            <>
              {next.source === TaskSource.Meeting ? '次の会議' : '次のタスク'}：
              <span className="font-medium">{next.taskName}</span>
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
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            日次稼働推移
          </h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="前の期間"
              onClick={() => setTrendPeriodOffset((v) => v - 1)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="w-24 text-center text-xs font-medium">{trendRangeLabel}</span>
            <button
              type="button"
              aria-label="次の期間"
              onClick={() => setTrendPeriodOffset((v) => v + 1)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-muted-foreground/40" />
            実績
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm border border-dashed border-muted-foreground/60" />
            見通し（予定工数）
          </span>
        </div>
        <div className="mt-3 flex h-20 items-end gap-1">
          {dailyTotals.map((d, i) => {
            const heightPct = Math.max(4, Math.round((d.minutes / maxDailyMinutes) * 100));
            const isToday = d.dateKey === todayKey;
            const pctOfDay = Math.round((d.minutes / DAILY_CAPACITY_MINUTES) * 100);
            const isActive = activeTrendKey === d.dateKey;
            const categories = dailyCategoryBreakdowns[i]?.categories ?? [];
            const estimatedMinutes = dailyEstimatedTotals[i]?.minutes ?? 0;
            const estimatedHeightPct = Math.round((estimatedMinutes / maxDailyMinutes) * 100);
            const estimatedPctOfDay = Math.round((estimatedMinutes / DAILY_CAPACITY_MINUTES) * 100);
            return (
              <div key={d.dateKey} className="relative flex flex-1 flex-col items-center gap-1">
                {isActive ? (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 w-max max-w-[45vw] -translate-x-1/2 text-left rounded-md bg-foreground px-2 py-1.5 text-[10px] text-background shadow-md">
                    <div className="whitespace-nowrap font-medium">
                      {formatJst(new Date(`${d.dateKey}T00:00:00+09:00`), 'M/d')}：実績{d.minutes}
                      分（
                      {pctOfDay}%）
                    </div>
                    <div className="whitespace-nowrap text-background/80">
                      見通し：{estimatedMinutes}分（{estimatedPctOfDay}%）
                    </div>
                    {categories.length > 0 ? (
                      <div className="mt-1 space-y-0.5 border-t border-background/20 pt-1">
                        {categories.map((c) => (
                          <div key={c.category} className="flex items-center gap-1">
                            <span
                              className={cn(
                                'h-1.5 w-1.5 flex-shrink-0 rounded-full',
                                categoryDotClassName(categoryColorMap.get(c.category)),
                              )}
                            />
                            <span className="max-w-[100px] flex-1 truncate">{c.category}</span>
                            <span className="flex-shrink-0">{c.minutes}分</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {/* onMouseEnter/onMouseLeave show the tooltip on desktop hover;
                    onClick doubles as the "tap to show" path on touch devices,
                    which never fire hover events. */}
                <button
                  type="button"
                  className="relative flex h-16 w-full items-end"
                  onMouseEnter={() => setActiveTrendKey(d.dateKey)}
                  onMouseLeave={() => setActiveTrendKey((k) => (k === d.dateKey ? null : k))}
                  onClick={() => setActiveTrendKey((k) => (k === d.dateKey ? null : d.dateKey))}
                  aria-label={`${d.dateKey} 実績${d.minutes}分（${pctOfDay}%）／見通し${estimatedMinutes}分（${estimatedPctOfDay}%）`}
                >
                  {/* 見通し（予定工数）— 実績バーの背後に破線の輪郭だけで重ねる。 */}
                  {estimatedHeightPct > 0 ? (
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 rounded-t border border-dashed border-muted-foreground/60"
                      style={{ height: `${estimatedHeightPct}%` }}
                    />
                  ) : null}
                  <div
                    className={cn(
                      'relative flex w-full flex-col-reverse overflow-hidden rounded-t transition-[height]',
                      (!isActive || categories.length === 0) &&
                        (isToday ? 'bg-primary' : 'bg-muted-foreground/40'),
                    )}
                    style={{ height: `${heightPct}%` }}
                  >
                    {/* Only broken down by 案件 color while hovered/tapped —
                        otherwise it's a plain today/other-day bar like before. */}
                    {isActive && categories.length > 0
                      ? categories.map((c) => (
                          <div
                            key={c.category}
                            className={categoryDotClassName(categoryColorMap.get(c.category))}
                            style={{ height: `${(c.minutes / d.minutes) * 100}%` }}
                          />
                        ))
                      : null}
                  </div>
                </button>
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

        {monthlyCategoryRows.length === 0 ? (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            {monthLabel}の実績・見通しはまだありません
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-primary" />
                実績
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm border border-dashed border-muted-foreground/60" />
                見通し（予定工数）
              </span>
            </div>
            {monthlyCategoryRows.map((c) => (
              <div key={c.category} className="flex items-center gap-2">
                <span
                  className={cn(
                    'h-2 w-2 flex-shrink-0 rounded-full',
                    categoryDotClassName(categoryColorMap.get(c.category)),
                  )}
                />
                <span className="w-16 flex-shrink-0 truncate text-xs">{c.category}</span>
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  {c.estimatedMinutes > 0 ? (
                    <div
                      className="absolute inset-y-0 left-0 rounded-full border border-dashed border-muted-foreground/60"
                      style={{
                        width: `${Math.round((c.estimatedMinutes / maxCategoryMinutes) * 100)}%`,
                      }}
                    />
                  ) : null}
                  <div
                    className="relative h-full rounded-full bg-primary transition-[width]"
                    style={{
                      width: `${Math.round((c.actualMinutes / maxCategoryMinutes) * 100)}%`,
                    }}
                  />
                </div>
                <span className="w-24 flex-shrink-0 text-right text-xs text-muted-foreground">
                  <span className="block">{formatHoursMinutes(c.actualMinutes)}</span>
                  <span className="block text-[10px]">{formatPersonMonths(c.actualMinutes)}</span>
                  <span className="block text-[10px]">
                    見通し {formatHoursMinutes(c.estimatedMinutes)}（
                    {formatPersonMonths(c.estimatedMinutes)}）
                  </span>
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
                <span className="block text-[10px] font-normal text-muted-foreground">
                  見通し {formatHoursMinutes(monthTotalEstimatedMinutes)}（
                  {formatPersonMonths(monthTotalEstimatedMinutes)}）
                </span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 作業報告書 */}
      <div className="rounded-lg border border-border bg-card p-3">
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          作業報告書を作成
        </h3>
        <WorkReportSection />
      </div>
    </div>
  );
}
