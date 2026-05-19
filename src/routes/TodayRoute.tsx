import { useMemo } from 'react';
import { useTasks } from '@/features/tasks/hooks/useTasks';
import { useStartTask, useEndTask } from '@/features/tasks/hooks/useTaskMutations';
import { CurrentTaskCard } from '@/features/tasks/components/CurrentTaskCard';
import { NextTaskCard } from '@/features/tasks/components/NextTaskCard';
import { TaskList } from '@/features/tasks/components/TaskList';
import { TaskStatus, type Task } from '@/features/tasks/types';
import { formatJst } from '@/lib/time/jst';

function partition(tasks: Task[]): {
  todays: Task[];
  current: Task | null;
  next: Task | null;
} {
  const todayKey = formatJst(new Date(), 'yyyy-MM-dd');
  const todays = tasks.filter(
    (t) => formatJst(t.scheduledStartTime, 'yyyy-MM-dd') === todayKey,
  );
  // Current = first In Progress (regardless of date, but typically today)
  const current =
    tasks.find((t) => t.status === TaskStatus.InProgress) ?? null;
  // Next = first Not Started in chronological order (today preferred)
  const next =
    todays.find((t) => t.status === TaskStatus.NotStarted) ??
    tasks.find((t) => t.status === TaskStatus.NotStarted) ??
    null;
  return { todays, current, next };
}

export function TodayRoute() {
  const tasksQuery = useTasks();
  const startMutation = useStartTask();
  const endMutation = useEndTask();

  const { todays, current, next } = useMemo(
    () => partition(tasksQuery.data ?? []),
    [tasksQuery.data],
  );

  return (
    <div className="space-y-3 p-4">
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
          <CurrentTaskCard
            task={current}
            onEnd={() => current && endMutation.mutate(current.taskId)}
            isPending={endMutation.isPending}
          />
          <NextTaskCard
            task={next}
            onStart={() => next && startMutation.mutate(next.taskId)}
            isPending={startMutation.isPending}
            startDisabled={current !== null}
          />

          <div className="pt-2">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              本日のタスク一覧
            </h2>
            <TaskList tasks={todays} nextTaskId={next?.taskId ?? null} />
          </div>
        </>
      )}
    </div>
  );
}
