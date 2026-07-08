import { useMemo, useState } from 'react';
import { addDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { formatJst, WEEKDAY_JA } from '@/lib/time/jst';
import { useTasks } from '@/features/tasks/hooks/useTasks';
import { useDeleteTask } from '@/features/tasks/hooks/useTaskMutations';
import { TaskList } from '@/features/tasks/components/TaskList';
import type { Task } from '@/features/tasks/types';

const DAYS_AHEAD = 14;
/** A day's capacity for the workload bar — 360 minutes (6 hours) = 100%. */
const CAPACITY_MINUTES = 360;

function buildDayList(): Date[] {
  const today = new Date();
  return Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i + 1));
}

function sumEstimateMinutes(tasks: Task[] | undefined): number {
  return (tasks ?? []).reduce((sum, t) => sum + t.estimateMinutes, 0);
}

export function UpcomingRoute() {
  const days = useMemo(() => buildDayList(), []);
  const [selectedKey, setSelectedKey] = useState(() => formatJst(days[0]!, 'yyyy-MM-dd'));

  const tasksQuery = useTasks();
  const deleteMutation = useDeleteTask();

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
  const selectedPct = Math.round((totalMinutes / CAPACITY_MINUTES) * 100);
  const selectedDate = days.find((d) => formatJst(d, 'yyyy-MM-dd') === selectedKey) ?? days[0]!;
  const selectedLabel = `${formatJst(selectedDate, 'M月d日')}（${WEEKDAY_JA[selectedDate.getDay()]}）`;

  return (
    <div className="space-y-3 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">予定</h2>

      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {days.map((d) => {
          const key = formatJst(d, 'yyyy-MM-dd');
          const dayMinutes = sumEstimateMinutes(tasksByDay.get(key));
          const pct = Math.min(100, Math.round((dayMinutes / CAPACITY_MINUTES) * 100));
          const overCapacity = dayMinutes > CAPACITY_MINUTES;
          const active = key === selectedKey;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedKey(key)}
              className={cn(
                'flex h-14 w-12 flex-shrink-0 flex-col items-center justify-center rounded-lg border text-xs transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-foreground hover:bg-accent',
              )}
            >
              <span
                className={cn(
                  'text-[10px]',
                  !active && d.getDay() === 0 && 'text-destructive',
                  !active && d.getDay() === 6 && 'text-blue-600',
                )}
              >
                {WEEKDAY_JA[d.getDay()]}
              </span>
              <span className="font-semibold">{formatJst(d, 'M/d')}</span>
              {/* 工数バー：1日の許容量(360分=6時間)を100%とした充填率 */}
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
                    overCapacity
                      ? 'bg-destructive'
                      : active
                        ? 'bg-primary-foreground'
                        : 'bg-primary',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </button>
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
        <TaskList
          tasks={selectedTasks}
          nextTaskId={null}
          onDelete={(taskId) => deleteMutation.mutate(taskId)}
          isDeleting={deleteMutation.isPending}
          emptyMessage="この日の予定はまだありません"
        />
      )}
    </div>
  );
}
