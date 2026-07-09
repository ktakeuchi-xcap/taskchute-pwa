import { useMemo, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { useTasks } from '@/features/tasks/hooks/useTasks';
import { useStartTask, useEndTask, useDeleteTask } from '@/features/tasks/hooks/useTaskMutations';
import { useGenerateRoutines } from '@/features/routines/hooks/useGenerateRoutines';
import { CurrentTaskCard } from '@/features/tasks/components/CurrentTaskCard';
import { NextTaskCard } from '@/features/tasks/components/NextTaskCard';
import { TaskList } from '@/features/tasks/components/TaskList';
import { DailyWorkloadGauge } from '@/features/tasks/components/DailyWorkloadGauge';
import { TaskStatus, type Task } from '@/features/tasks/types';
import { formatJst } from '@/lib/time/jst';

function partition(tasks: Task[]): {
  todays: Task[];
  activeTasks: Task[];
  doneTasks: Task[];
  current: Task | null;
  next: Task | null;
} {
  const todayKey = formatJst(new Date(), 'yyyy-MM-dd');
  const todays = tasks.filter((t) => formatJst(t.scheduledStartTime, 'yyyy-MM-dd') === todayKey);
  const activeTasks = todays.filter((t) => t.status !== TaskStatus.Done);
  const doneTasks = todays.filter((t) => t.status === TaskStatus.Done);
  const current = tasks.find((t) => t.status === TaskStatus.InProgress) ?? null;
  const next =
    todays.find((t) => t.status === TaskStatus.NotStarted) ??
    tasks.find((t) => t.status === TaskStatus.NotStarted) ??
    null;
  return { todays, activeTasks, doneTasks, current, next };
}

export function TodayRoute() {
  const tasksQuery = useTasks();
  const startMutation = useStartTask();
  const endMutation = useEndTask();
  const deleteMutation = useDeleteTask();
  const routinesMutation = useGenerateRoutines();
  const [routineFeedback, setRoutineFeedback] = useState<string | null>(null);

  const { activeTasks, doneTasks, current, next } = useMemo(
    () => partition(tasksQuery.data ?? []),
    [tasksQuery.data],
  );

  const handleGenerateRoutines = async () => {
    setRoutineFeedback(null);
    try {
      const result = await routinesMutation.mutateAsync();
      if (result.addedCount === 0 && result.skippedCount === 0) {
        setRoutineFeedback('対象のルーチンタスクが見つかりませんでした');
      } else if (result.addedCount === 0) {
        setRoutineFeedback(`翌週分はすでに生成済みです（${result.skippedCount}件スキップ）`);
      } else {
        setRoutineFeedback(
          `${result.weekStartIso}〜${result.weekEndIso} に ${result.addedCount}件追加（${result.skippedCount}件スキップ）`,
        );
      }
    } catch (err) {
      setRoutineFeedback(`生成に失敗しました：${err instanceof Error ? err.message : err}`);
    }
  };

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
          <DailyWorkloadGauge activeTasks={activeTasks} doneTasks={doneTasks} />

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
            <TaskList
              tasks={activeTasks}
              nextTaskId={next?.taskId ?? null}
              onDelete={(taskId) => deleteMutation.mutate(taskId)}
              isDeleting={deleteMutation.isPending}
              emptyMessage={
                doneTasks.length > 0
                  ? '本日のタスクはすべて完了しました'
                  : '本日のタスクはまだありません'
              }
            />
            {doneTasks.length > 0 ? (
              <div className="mt-2">
                <CollapsibleSection title={`完了済み（${doneTasks.length}件）`}>
                  <TaskList
                    tasks={doneTasks}
                    nextTaskId={null}
                    onDelete={(taskId) => deleteMutation.mutate(taskId)}
                    isDeleting={deleteMutation.isPending}
                  />
                </CollapsibleSection>
              </div>
            ) : null}
          </div>

          <div className="pt-2">
            <Button
              variant="secondary"
              className="w-full"
              onClick={handleGenerateRoutines}
              disabled={routinesMutation.isPending}
            >
              <CalendarPlus className="h-4 w-4" />
              {routinesMutation.isPending ? '生成中…' : '翌週のルーチンタスクを生成'}
            </Button>
            {routineFeedback ? (
              <p className="mt-2 text-xs text-muted-foreground">{routineFeedback}</p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
