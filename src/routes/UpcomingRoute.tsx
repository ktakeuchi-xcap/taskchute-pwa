import { useMemo, useState } from 'react';
import { addDays } from 'date-fns';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { formatJst, jstDate, WEEKDAY_JA } from '@/lib/time/jst';
import { useTasks } from '@/features/tasks/hooks/useTasks';
import { useDeleteTask, useUpdateTask } from '@/features/tasks/hooks/useTaskMutations';
import { TaskList } from '@/features/tasks/components/TaskList';
import { DAILY_CAPACITY_MINUTES, sumEstimateMinutes } from '@/features/tasks/workload';
import type { Task } from '@/features/tasks/types';

const DAYS_BEFORE_TODAY = 3;
const DAYS_AFTER_TODAY = 14;
/** Index of "today" within the day list — also the default selection. */
const DEFAULT_SELECTED_INDEX = DAYS_BEFORE_TODAY;

function buildDayList(): Date[] {
  const today = new Date();
  const start = addDays(today, -DAYS_BEFORE_TODAY);
  const totalDays = DAYS_BEFORE_TODAY + DAYS_AFTER_TODAY + 1; // +1 for today itself
  return Array.from({ length: totalDays }, (_, i) => addDays(start, i));
}

interface DayButtonProps {
  date: Date;
  dateKey: string;
  active: boolean;
  dayMinutes: number;
  onSelect: () => void;
}

/** A date in the day strip — also a drop target for dragged tasks. */
function DayButton({ date, dateKey, active, dayMinutes, onSelect }: DayButtonProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dateKey });
  const pct = Math.min(100, Math.round((dayMinutes / DAILY_CAPACITY_MINUTES) * 100));
  const overCapacity = dayMinutes > DAILY_CAPACITY_MINUTES;

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onSelect}
      className={cn(
        'flex h-14 w-12 flex-shrink-0 flex-col items-center justify-center rounded-lg border text-xs transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-foreground hover:bg-accent',
        isOver && 'ring-2 ring-primary ring-offset-1',
      )}
    >
      <span
        className={cn(
          'text-[10px]',
          !active && date.getDay() === 0 && 'text-destructive',
          !active && date.getDay() === 6 && 'text-blue-600',
        )}
      >
        {WEEKDAY_JA[date.getDay()]}
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
  const days = useMemo(() => buildDayList(), []);
  const [selectedKey, setSelectedKey] = useState(() =>
    formatJst(days[DEFAULT_SELECTED_INDEX]!, 'yyyy-MM-dd'),
  );
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);

  const tasksQuery = useTasks();
  const deleteMutation = useDeleteTask();
  const updateMutation = useUpdateTask();

  // Delay-based activation lets a plain tap (e.g. the edit/delete buttons)
  // pass through normally — a drag only starts after a brief hold, which also
  // keeps this from fighting with the day strip's horizontal scroll.
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

  const selectedTasks = tasksByDay.get(selectedKey) ?? [];
  const totalMinutes = sumEstimateMinutes(selectedTasks);
  const selectedPct = Math.round((totalMinutes / DAILY_CAPACITY_MINUTES) * 100);
  const selectedDate = days.find((d) => formatJst(d, 'yyyy-MM-dd') === selectedKey) ?? days[0]!;
  const selectedLabel = `${formatJst(selectedDate, 'M月d日')}（${WEEKDAY_JA[selectedDate.getDay()]}）`;

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
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="space-y-3 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          予定
        </h2>

        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
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
