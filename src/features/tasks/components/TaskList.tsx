import { TaskRow } from './TaskRow';
import type { Task } from '@/features/tasks/types';

interface TaskListProps {
  tasks: Task[];
  nextTaskId: string | null;
}

export function TaskList({ tasks, nextTaskId }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
        本日のタスクはまだありません
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <TaskRow key={task.taskId} task={task} isNext={task.taskId === nextTaskId} />
      ))}
    </div>
  );
}
