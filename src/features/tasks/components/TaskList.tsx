import { useState } from 'react';
import { TaskRow } from './TaskRow';
import { DraggableTaskRow } from './DraggableTaskRow';
import { EditTaskForm } from './EditTaskForm';
import { SetMeetingCategoryForm } from './SetMeetingCategoryForm';
import { SetMeetingWorkloadForm } from './SetMeetingWorkloadForm';
import { isAllDayMeeting } from '@/features/tasks/meetingStatus';
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

/** All-day meetings float to the top; everything else keeps its given order. */
function sortForDisplay(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => Number(isAllDayMeeting(b)) - Number(isAllDayMeeting(a)));
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
  const [taggingTaskId, setTaggingTaskId] = useState<string | null>(null);
  const [workloadTaskId, setWorkloadTaskId] = useState<string | null>(null);

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {sortForDisplay(tasks).map((task) =>
        editingTaskId === task.taskId ? (
          <EditTaskForm
            key={task.taskId}
            task={task}
            onCancel={() => setEditingTaskId(null)}
            onSaved={() => setEditingTaskId(null)}
          />
        ) : taggingTaskId === task.taskId ? (
          <SetMeetingCategoryForm
            key={task.taskId}
            task={task}
            onCancel={() => setTaggingTaskId(null)}
            onSaved={() => setTaggingTaskId(null)}
          />
        ) : workloadTaskId === task.taskId ? (
          <SetMeetingWorkloadForm
            key={task.taskId}
            task={task}
            onCancel={() => setWorkloadTaskId(null)}
            onSaved={() => setWorkloadTaskId(null)}
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
            onTagCategory={() => setTaggingTaskId(task.taskId)}
            onSetWorkload={() => setWorkloadTaskId(task.taskId)}
          />
        ),
      )}
    </div>
  );
}
