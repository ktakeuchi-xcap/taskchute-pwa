import { useMemo, useState } from 'react';
import { addDays } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
import { DAILY_CAPACITY_MINUTES, sumEstimateMinutes } from '@/features/tasks/workload';
import type { Task } from '@/features/tasks/types';

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
  onSelect: () => void;
}

/** A date in the week strip — also a drop target for dragged tasks. */
function DayButton({ date, dateKey, active, dayMinutes, onSelect }: DayButtonProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dateKey });
  const pct = Math.min(100, Math.round((dayMinutes / DAILY_CAPACITY_MINUTES) * 100));
  const overCapacity = dayMinutes > DAILY_CAPACITY_MINUTES;
  // JST-safe day-of-week (0=Sun..6=Sat, matching WEEKDAY_JA/getDay's own
  // convention) — date.getDay() reads the runtime's local timezone, which
  // only happens to agree with JST when the device itself is set to Japan.
  const jstDow = jstIsoDayOfWeek(date) % 7;

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onSelect}
      className={cn(
        'flex h-14 flex-1 flex-col items-center justify-center rounded-lg border text-xs transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-foreground hover:bg-accent',
        isOver && 'ring-2 ring-primary ring-offset-1',
      )}
    >
      <span
        className={cn(
          'text-[10px]',
          !active && jstDow === 0 && 'text-destructive',
          !active && jstDow === 6 && 'text-blue-600',
        )}
      >
        {WEEKDAY_JA[jstDow]}
      </span>
      <span className="font-semibold">{formatJst(date, 'M/d')}</span>
      {/* 工数バー：1日の許容量(480分=8時間)を100%とした充填率 */}
      <div
        className={cn(
          'mt-0.5 h-1 w-8 overflow-hidden rounded-full',
          active ? 'bg-primary-foreground/30' : 'bg-muted',
        )}
        role="img"
        aria-label={`この日の工数 ${pct}%`}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width]',
            overCapacity ? 'bg-destructive' : active ? 'bg-primary-foreground' : 'bg-primary',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </button>
  );
}

export function UpcomingRoute() {
  const [weekOffset, setWeekOffset] = useState(0);
  const days = useMemo(() => buildWeekDays(weekOffset), [weekOffset]);
  const [selectedKey, setSelectedKey] = useState(() => formatJst(new Date(), 'yyyy-MM-dd'));
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);

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
      <div className="space-y-3 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          予定
        </h2>

        <div className="flex items-center justify-between">
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

        <div className="flex gap-1.5">
          {days.map((d) => {
            const key = formatJst(d, 'yyyy-MM-dd');
            const dayMinutes = sumEstimateMinutes(tasksByDay.get(key));
            return (
              <DayButton
                key={key}
                date={d}
                dateKey={key}
                active={key === selectedKey}
                dayMinutes={dayMinutes}
                onSelect={() => setSelectedKey(key)}
              />
            );
          })}
        </div>

        <div className="flex items-baseline justify-between pt-1">
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

        {tasksQuery.isLoading ? (
          <div className="rounded-lg border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
            読み込み中…
          </div>
        ) : tasksQuery.isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            タスクの読み込みに失敗しました：
            {tasksQuery.error instanceof Error ? tasksQuery.error.message : '不明なエラー'}
          </div>
        ) : (
          <>
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
          </>
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
