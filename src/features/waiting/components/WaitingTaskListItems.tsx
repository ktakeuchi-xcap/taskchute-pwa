import { useState } from 'react';
import {
  useRemoveWaitingTask,
  useToggleWaitingComplete,
} from '@/features/waiting/hooks/useWaitingMutations';
import type { WaitingTask } from '@/features/waiting/types';
import { WaitingTaskRow } from './WaitingTaskRow';
import { EditWaitingForm } from './EditWaitingForm';

interface WaitingTaskListItemsProps {
  tasks: WaitingTask[];
}

/**
 * The interactive part of a waiting-task list (toggle complete / edit /
 * remove) — pulled out of WaitingTaskList so any screen can render a subset
 * of waiting tasks (see TodayRoute's "today due" section) with the exact
 * same actions instead of re-implementing them.
 */
export function WaitingTaskListItems({ tasks }: WaitingTaskListItemsProps) {
  const toggle = useToggleWaitingComplete();
  const remove = useRemoveWaitingTask();
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {tasks.map((task) =>
        editingId === task.systemTaskId ? (
          <EditWaitingForm
            key={task.systemTaskId}
            task={task}
            onCancel={() => setEditingId(null)}
            onSaved={() => setEditingId(null)}
          />
        ) : (
          <WaitingTaskRow
            key={task.systemTaskId}
            task={task}
            onToggleComplete={(completed) => toggle.mutate({ id: task.systemTaskId, completed })}
            onEdit={() => setEditingId(task.systemTaskId)}
            onRemove={() => remove.mutate(task.systemTaskId)}
            isPending={toggle.isPending || remove.isPending}
          />
        ),
      )}
    </div>
  );
}
