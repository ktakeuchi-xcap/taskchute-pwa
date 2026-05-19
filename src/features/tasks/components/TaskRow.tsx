import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatJst } from '@/lib/time/jst';
import { TaskStatus, type Task } from '@/features/tasks/types';

interface TaskRowProps {
  task: Task;
  isNext?: boolean;
}

const STATUS_DOT: Record<TaskStatus, string> = {
  [TaskStatus.NotStarted]: 'bg-gray-300',
  [TaskStatus.InProgress]: 'bg-amber-500',
  [TaskStatus.Done]: 'bg-emerald-500',
};

export function TaskRow({ task, isNext = false }: TaskRowProps) {
  const isDone = task.status === TaskStatus.Done;
  const isInProgress = task.status === TaskStatus.InProgress;
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm transition-opacity',
        isDone && 'opacity-50',
        isInProgress && 'border-amber-300 ring-1 ring-amber-200',
      )}
    >
      <span className={cn('h-2.5 w-2.5 flex-shrink-0 rounded-full', STATUS_DOT[task.status])} />
      <div className="min-w-0 flex-1">
        <div className={cn('truncate text-sm font-medium', isDone && 'line-through')}>
          {task.taskName}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {formatJst(task.scheduledStartTime, 'HH:mm')} – {formatJst(task.scheduledEndTime, 'HH:mm')}
          {' ・ '}
          {task.estimateMinutes}分
          {task.category ? <span className="ml-1">・ {task.category}</span> : null}
        </div>
      </div>
      <div className="flex flex-shrink-0 flex-col items-end gap-1">
        {isInProgress && <Badge variant="progress">進行中</Badge>}
        {isDone && <Badge variant="done">完了</Badge>}
        {!isInProgress && !isDone && isNext && <Badge variant="next">次へ</Badge>}
        {!isInProgress && !isDone && !isNext && (
          <span className="text-[11px] text-muted-foreground">未着手</span>
        )}
      </div>
    </div>
  );
}
