import { useMemo, useState } from 'react';
import { addDays } from 'date-fns';
import { ChevronLeft, ChevronRight, List, GanttChartSquare } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { formatJst, jstDate, jstIsoDayOfWeek, startOfJstWeek, WEEKDAY_JA } from '@/lib/time/jst';
import { useTasks } from '@/features/tasks/hooks/useTasks';
import { useDeleteTask, useUpdateTask } from '@/features/tasks/hooks/useTaskMutations';
import { TaskList } from '@/features/tasks/components/TaskList';
import { DayTimeline } from '@/features/tasks/components/DayTimeline';
import { DAILY_CAPACITY_MINUTES, sumEstimateMinutes } from '@/features/tasks/workload';
import type { Task } from '@/features/tasks/types';

type ViewMode = 'list' | 'timeline';

/** Monday..Sunday for "this week + weekOffset weeks" (0 = the week containing today). */
function buildWeekDays(weekOffset: number): Date[] {
  const monday = addDays(startOfJstWeek(new Date()), weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

interface DayButtonProps {
  date: Date;
  dateKey: string;
  active: boolean;
  dayMinutes: number;
  /** Shared across the whole week strip so every day's bar uses the same
   * vertical scale (same convention as the 実績 タブ日次稼働推移). */
  scaleMinutes: number;
  onSelect: () => void;
}

/** A date in the week strip — also a drop target for dragged tasks. */
function DayButton({ date, dateKey, active, dayMinutes, scaleMinutes, onSelect }: DayButtonProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dateKey });
  const [showTooltip, setShowTooltip] = useState(false);
  const pct = Math.round((dayMinutes / DAILY_CAPACITY_MINUTES) * 100);
  const overCapacity = dayMinutes > DAILY_CAPACITY_MINUTES;
  const barHeightPct = Math.min(100, Math.round((dayMinutes / scaleMinutes) * 100));
  // 1日の許容量(480分=8時間)＝100%の高さ位置（コンテナ上端からの距離%）。
  // 週全体で同じscaleMinutesを使うため、この線はどの日のバーでも同じ高さに
  // 揃い、それを超えている日のバーだけが線より上まで伸びる。
  // 「bottom:100%」で表現すると、どの日も超過していない通常時（線が天井＝
  // 100%の位置）は要素自体がコンテナの外（真上）にはみ出し、overflow-hidden
  // でクリップされて見えなくなるため、top基準（0%＝天井）で位置指定する。
  const capacityLineTopPct = Math.max(
    0,
    100 - Math.round((DAILY_CAPACITY_MINUTES / scaleMinutes) * 100),
  );
  // JST-safe day-of-week (0=Sun..6=Sat, matching WEEKDAY_JA/getDay's own
  // convention) — date.getDay() reads the runtime's local timezone, which
  // only happens to agree with JST when the device itself is set to Japan.
  const jstDow = jstIsoDayOfWeek(date) % 7;

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onSelect}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      className={cn(
        'relative flex flex-1 flex-col items-center gap-1 rounded-md p-1 text-xs transition-colors hover:bg-accent',
        isOver && 'ring-2 ring-primary ring-offset-1',
      )}
      aria-label={`${formatJst(date, 'M/d')} この日の工数 ${pct}%`}
    >
      {/* 工数バー：実績タブの日次稼働推移と同じ「下から積み上がる棒グラフ」。
          1日の許容量(480分=8時間)＝100%の高さに全日共通の赤線を重ね、
          超過している日のバーだけが線を越えて伸びて見えるようにする。 */}
      <div className="relative flex h-16 w-full items-end justify-center">
        {showTooltip ? (
          <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[10px] font-medium text-background shadow-md">
            {dayMinutes}分（{pct}%）
          </div>
        ) : null}
        <div
          className="pointer-events-none absolute inset-x-0 border-t-2 border-destructive/70"
          style={{ top: `${capacityLineTopPct}%` }}
        />
        <div
          className={cn(
            'w-[90%] overflow-hidden rounded-t transition-[height]',
            overCapacity ? 'bg-destructive' : active ? 'bg-primary' : 'bg-muted-foreground/40',
          )}
          style={{ height: `${barHeightPct}%` }}
        />
      </div>
      <span
        className={cn(
          'text-[10px]',
          active
            ? 'font-semibold text-primary'
            : jstDow === 0
              ? 'text-destructive'
              : jstDow === 6
                ? 'text-blue-600'
                : 'text-muted-foreground',
        )}
      >
        {WEEKDAY_JA[jstDow]}
      </span>
      <span className={cn('font-semibold', active && 'text-primary')}>
        {formatJst(date, 'M/d')}
      </span>
    </button>
  );
}

export function UpcomingRoute() {
  const [weekOffset, setWeekOffset] = useState(0);
  const days = useMemo(() => buildWeekDays(weekOffset), [weekOffset]);
  const [selectedKey, setSelectedKey] = useState(() => formatJst(new Date(), 'yyyy-MM-dd'));
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const tasksQuery = useTasks();
  const deleteMutation = useDeleteTask();
  const updateMutation = useUpdateTask();

  // Delay-based activation lets a plain tap (e.g. the edit/delete buttons)
  // pass through normally — a drag only starts after a brief hold.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasksQuery.data ?? []) {
      const key = formatJst(t.scheduledStartTime, 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.scheduledStartTime.getTime() - b.scheduledStartTime.getTime());
    }
    return map;
  }, [tasksQuery.data]);

  // Switching weeks almost always leaves the previously-selected date
  // outside the newly-shown week, so it's re-picked here: today if the new
  // week actually contains it (jumping back to "this week"), otherwise the
  // new week's Monday.
  const goToWeek = (offset: number) => {
    setWeekOffset(offset);
    const newDays = buildWeekDays(offset);
    const todayKey = formatJst(new Date(), 'yyyy-MM-dd');
    const containsToday = newDays.some((d) => formatJst(d, 'yyyy-MM-dd') === todayKey);
    setSelectedKey(containsToday ? todayKey : formatJst(newDays[0]!, 'yyyy-MM-dd'));
  };

  // 週7日分の見積分を共通スケールとして使う（実績タブの日次稼働推移と同じ
  // 「表示範囲内の最大値でスケールを揃える」方式）。全日480分以下なら
  // スケールは480分のまま＝100%ラインが各バーの天井に来る。
  const weekDayMinutes = useMemo(
    () => days.map((d) => sumEstimateMinutes(tasksByDay.get(formatJst(d, 'yyyy-MM-dd')))),
    [days, tasksByDay],
  );
  const scaleMinutes = Math.max(DAILY_CAPACITY_MINUTES, ...weekDayMinutes);

  const selectedTasks = tasksByDay.get(selectedKey) ?? [];
  const totalMinutes = sumEstimateMinutes(selectedTasks);
  const selectedPct = Math.round((totalMinutes / DAILY_CAPACITY_MINUTES) * 100);
  const selectedDate = days.find((d) => formatJst(d, 'yyyy-MM-dd') === selectedKey) ?? days[0]!;
  const selectedLabel = `${formatJst(selectedDate, 'M月d日')}（${WEEKDAY_JA[jstIsoDayOfWeek(selectedDate) % 7]}）`;
  const weekStart = days[0]!;
  const weekEnd = days[6]!;
  const weekRangeLabel = `${formatJst(weekStart, 'M/d')}〜${formatJst(weekEnd, 'M/d')}`;

  const handleDragStart = (event: DragStartEvent) => {
    const task = event.active.data.current?.task as Task | undefined;
    setDraggedTask(task ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedTask(null);
    const { active, over } = event;
    if (!over) return;
    const task = active.data.current?.task as Task | undefined;
    if (!task) return;

    const targetKey = String(over.id);
    const currentKey = formatJst(task.scheduledStartTime, 'yyyy-MM-dd');
    if (targetKey === currentKey) return; // dropped back on its own day

    const targetDate = days.find((d) => formatJst(d, 'yyyy-MM-dd') === targetKey);
    if (!targetDate) return;

    // Keep the same time-of-day — only the calendar date moves.
    const newStart = jstDate(
      Number(formatJst(targetDate, 'yyyy')),
      Number(formatJst(targetDate, 'M')),
      Number(formatJst(targetDate, 'd')),
      Number(formatJst(task.scheduledStartTime, 'H')),
      Number(formatJst(task.scheduledStartTime, 'm')),
    );

    updateMutation.mutate({
      taskId: task.taskId,
      input: {
        taskName: task.taskName,
        estimateMinutes: task.estimateMinutes,
        category: task.category ?? undefined,
        startTime: newStart,
      },
    });
  };

  // タイムライン上でタスクを縦にドラッグしたときの時刻変更（同じ日のまま、
  // 見積分数＝所要時間は変えず開始時刻だけを移動する）。
  const handleReschedule = (task: Task, minutesOfDay: number) => {
    const hour = Math.floor(minutesOfDay / 60);
    const minute = minutesOfDay % 60;
    const newStart = jstDate(
      Number(formatJst(task.scheduledStartTime, 'yyyy')),
      Number(formatJst(task.scheduledStartTime, 'M')),
      Number(formatJst(task.scheduledStartTime, 'd')),
      hour,
      minute,
    );
    if (newStart.getTime() === task.scheduledStartTime.getTime()) return; // 元の時刻のまま離した場合は何もしない
    updateMutation.mutate({
      taskId: task.taskId,
      input: {
        taskName: task.taskName,
        estimateMinutes: task.estimateMinutes,
        category: task.category ?? undefined,
        startTime: newStart,
      },
    });
  };

  return (
    <DndContext
      sensors={sensors}
      // Default (rectIntersection) hit-tests the dragged element's own
      // rectangle against each day button — since that rect can be offset
      // from the cursor (drag started from a point inside a taller row),
      // the day that actually highlights/receives the drop doesn't match
      // where the mouse is. pointerWithin hit-tests the pointer coordinates
      // themselves instead, matching what the user visually points at.
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full min-h-0 flex-col gap-3 p-4">
        <h2 className="flex-shrink-0 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          予定
        </h2>

        <div className="flex flex-shrink-0 items-center justify-between">
          <button
            type="button"
            aria-label="前週へ"
            onClick={() => goToWeek(weekOffset - 1)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => goToWeek(0)}
            className="text-xs font-medium text-foreground hover:text-primary"
          >
            {weekOffset === 0 ? `今週（${weekRangeLabel}）` : weekRangeLabel}
          </button>
          <button
            type="button"
            aria-label="次週へ"
            onClick={() => goToWeek(weekOffset + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-shrink-0 gap-1.5">
          {days.map((d, i) => {
            const key = formatJst(d, 'yyyy-MM-dd');
            return (
              <DayButton
                key={key}
                date={d}
                dateKey={key}
                active={key === selectedKey}
                dayMinutes={weekDayMinutes[i]!}
                scaleMinutes={scaleMinutes}
                onSelect={() => setSelectedKey(key)}
              />
            );
          })}
        </div>

        <div className="flex flex-shrink-0 items-baseline justify-between pt-1">
          <h3 className="text-sm font-semibold">{selectedLabel}</h3>
          {selectedTasks.length > 0 ? (
            <p
              className={cn(
                'text-xs',
                selectedPct > 100 ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {selectedTasks.length}件・合計{totalMinutes}分（{selectedPct}%）
            </p>
          ) : null}
        </div>

        {/* リスト／タイムライン切り替え（下部のタブナビとは別の、ページ内タブ） */}
        <div className="flex flex-shrink-0 gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors',
              viewMode === 'list'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <List className="h-3.5 w-3.5" />
            リスト
          </button>
          <button
            type="button"
            onClick={() => setViewMode('timeline')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors',
              viewMode === 'timeline'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <GanttChartSquare className="h-3.5 w-3.5" />
            タイムライン
          </button>
        </div>

        {tasksQuery.isLoading ? (
          <div className="flex-shrink-0 rounded-lg border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
            読み込み中…
          </div>
        ) : tasksQuery.isError ? (
          <div className="flex-shrink-0 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            タスクの読み込みに失敗しました：
            {tasksQuery.error instanceof Error ? tasksQuery.error.message : '不明なエラー'}
          </div>
        ) : viewMode === 'timeline' ? (
          <div className="min-h-0 flex-1">
            <DayTimeline
              date={selectedDate}
              tasks={selectedTasks}
              onReschedule={handleReschedule}
            />
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            <p className="text-[11px] text-muted-foreground">
              タスクを長押しすると、上の日付にドラッグして移動できます
            </p>
            <TaskList
              tasks={selectedTasks}
              nextTaskId={null}
              onDelete={(taskId) => deleteMutation.mutate(taskId)}
              isDeleting={deleteMutation.isPending}
              emptyMessage="この日の予定はまだありません"
              draggable
            />
          </div>
        )}
      </div>

      <DragOverlay>
        {draggedTask ? (
          <div className="rounded-lg border border-primary bg-card px-3 py-2 text-sm font-medium shadow-lg">
            {draggedTask.taskName}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
