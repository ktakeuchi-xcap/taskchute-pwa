import { useWaitingTasks } from '@/features/waiting/hooks/useWaitingTasks';
import {
  useRemoveWaitingTask,
  useToggleWaitingComplete,
} from '@/features/waiting/hooks/useWaitingMutations';
import { WaitingTaskRow } from './WaitingTaskRow';

export function WaitingTaskList() {
  const query = useWaitingTasks();
  const toggle = useToggleWaitingComplete();
  const remove = useRemoveWaitingTask();

  if (query.isLoading) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
        読み込み中…
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        確認待ちの読み込みに失敗しました：
        {query.error instanceof Error ? query.error.message : '不明なエラー'}
      </div>
    );
  }
  const tasks = query.data ?? [];
  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
        確認待ちのタスクはありません
      </div>
    );
  }
  const active = tasks.filter((t) => !t.completed).length;
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-muted-foreground">{active}件 待機中</div>
      {tasks.map((task) => (
        <WaitingTaskRow
          key={task.systemTaskId}
          task={task}
          onToggleComplete={(completed) => toggle.mutate({ id: task.systemTaskId, completed })}
          onRemove={() => remove.mutate(task.systemTaskId)}
          isPending={toggle.isPending || remove.isPending}
        />
      ))}
    </div>
  );
}
