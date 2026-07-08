import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import type { Task } from '@/features/tasks/types';
import { TaskRow } from './TaskRow';

interface DraggableTaskRowProps {
  task: Task;
  isNext?: boolean;
  onDelete?: (taskId: string) => void;
  isDeleting?: boolean;
  onEdit?: () => void;
}

/** Wraps TaskRow so it can be dragged onto a date in the 予定 tab's day strip. */
export function DraggableTaskRow({
  task,
  isNext,
  onDelete,
  isDeleting,
  onEdit,
}: DraggableTaskRowProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.taskId,
    data: { task },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      // touch-action stays at "manipulation" (not "none"): with a delay-based
      // activation constraint, a quick swipe should still scroll the page
      // natively — only a held press promotes into a drag and calls
      // preventDefault at that point. "none" would block native scrolling
      // the instant a finger lands on the row, before the delay even runs.
      className={cn('touch-manipulation', isDragging && 'z-10 opacity-40')}
      {...listeners}
      {...attributes}
    >
      <TaskRow
        task={task}
        isNext={isNext}
        onDelete={onDelete}
        isDeleting={isDeleting}
        onEdit={onEdit}
      />
    </div>
  );
}
