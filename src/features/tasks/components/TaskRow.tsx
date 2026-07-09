import { Pencil, Tag, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatJst } from '@/lib/time/jst';
import { TaskSource, TaskStatus, type Task } from '@/features/tasks/types';
import { useCategoryColorMap } from '@/features/tasks/hooks/useCategoryColorMap';
import { CategoryTag } from './CategoryTag';

interface TaskRowProps {
  task: Task;
  isNext?: boolean;
  onDelete?: (taskId: string) => void;
  isDeleting?: boolean;
  onEdit?: () => void;
  /** Meeting tasks can't be edited, but can still have a 案件 tag assigned. */
  onTagCategory?: () => void;
}

const STATUS_DOT: Record<TaskStatus, string> = {
  [TaskStatus.NotStarted]: 'bg-gray-300',
  [TaskStatus.InProgress]: 'bg-amber-500',
  [TaskStatus.Done]: 'bg-emerald-500',
};

export function TaskRow({
  task,
  isNext = false,
  onDelete,
  isDeleting = false,
  onEdit,
  onTagCategory,
}: TaskRowProps) {
  const isDone = task.status === TaskStatus.Done;
  const isInProgress = task.status === TaskStatus.InProgress;
  const isMeeting = task.source === TaskSource.Meeting;
  const isAllDay = isMeeting && task.estimateMinutes === 0;
  const categoryColorMap = useCategoryColorMap();

  const handleDelete = () => {
    const message = isDone
      ? `「${task.taskName}」を削除しますか？完了済みの実績データも削除されます。この操作は取り消せません。`
      : `「${task.taskName}」を削除しますか？この操作は取り消せません。`;
    if (window.confirm(message)) {
      onDelete?.(task.taskId);
    }
  };

  if (isAllDay) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-1">
        <span className="flex-shrink-0 rounded bg-violet-100 px-1 py-0.5 text-[10px] text-violet-700">
          終日
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-violet-900">
          {task.taskName}
        </span>
        {task.category ? (
          <CategoryTag name={task.category} colorKey={categoryColorMap.get(task.category)} />
        ) : null}
        {onTagCategory ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 flex-shrink-0 text-violet-700 hover:text-violet-900"
            aria-label="案件を設定"
            onClick={onTagCategory}
          >
            <Tag className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
    );
  }

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
          {isMeeting ? (
            <>
              <span className="rounded bg-violet-100 px-1 py-0.5 text-violet-700">会議</span>
              {' ・ '}
            </>
          ) : null}
          {formatJst(task.scheduledStartTime, 'HH:mm')} –{' '}
          {formatJst(task.scheduledEndTime, 'HH:mm')}
          {' ・ '}
          {task.estimateMinutes}分
          {task.category ? (
            <>
              {' ・ '}
              <CategoryTag name={task.category} colorKey={categoryColorMap.get(task.category)} />
            </>
          ) : null}
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
      {onTagCategory && isMeeting ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="案件を設定"
          onClick={onTagCategory}
        >
          <Tag className="h-4 w-4" />
        </Button>
      ) : null}
      {onEdit && !isMeeting ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="タスクを編集"
          onClick={onEdit}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ) : null}
      {onDelete && !isMeeting ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
          aria-label="タスクを削除"
          onClick={handleDelete}
          disabled={isDeleting}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}
