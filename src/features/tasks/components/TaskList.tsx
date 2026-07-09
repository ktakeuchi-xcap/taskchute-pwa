import { useState } from 'react';
import { TaskRow } from './TaskRow';
import { DraggableTaskRow } from './DraggableTaskRow';
import { EditTaskForm } from './EditTaskForm';
import { TaskSource, type Task } from '@/features/tasks/types';

interface TaskListProps {
  tasks: Task[];
  nextTaskId: string | null;
  onDelete?: (taskId: string) => void;
  isDeleting?: boolean;
  emptyMessage?: string;
  /** When true, each row can be dragged (e.g. onto a date in 予定's day strip). */
  draggable?: boolean;
}

export function TaskList({
  tasks,
  nextTaskId,
  onDelete,
  isDeleting = false,
  emptyMessage = '本日のタスクはまだありません',
  draggable = false,
}: TaskListProps) {
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {tasks.map((task) =>
        editingTaskId === task.taskId ? (
          <EditTaskForm
            key={task.taskId}
            task={task}
            onCancel={() => setEditingTaskId(null)}
            onSaved={() => setEditingTaskId(null)}
          />
        ) : draggable && task.source !== TaskSource.Meeting ? (
          <DraggableTaskRow
            key={task.taskId}
            task={task}
            isNext={task.taskId === nextTaskId}
            onDelete={onDelete}
            isDeleting={isDeleting}
            onEdit={() => setEditingTaskId(task.taskId)}
          />
        ) : (
          <TaskRow
            key={task.taskId}
            task={task}
            isNext={task.taskId === nextTaskId}
            onDelete={onDelete}
            isDeleting={isDeleting}
            onEdit={() => setEditingTaskId(task.taskId)}
          />
        ),
      )}
    </div>
  );
}
