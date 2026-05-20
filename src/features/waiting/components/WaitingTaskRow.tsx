import { Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatJst } from '@/lib/time/jst';
import type { WaitingTask } from '@/features/waiting/types';

interface WaitingTaskRowProps {
  task: WaitingTask;
  onToggleComplete: (completed: boolean) => void;
  onRemove: () => void;
  isPending: boolean;
}

function followUpChip(date: Date | null): { text: string; overdue: boolean } | null {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdue = date.getTime() < today.getTime();
  return {
    overdue,
    text: overdue
      ? `期限切れ ${formatJst(date, 'M/d')}`
      : `${formatJst(date, 'M/d')} 確認`,
  };
}

export function WaitingTaskRow({
  task,
  onToggleComplete,
  onRemove,
  isPending,
}: WaitingTaskRowProps) {
  const chip = followUpChip(task.followUpDate);
  return (
    <Card className={cn('p-3', task.completed && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={task.completed}
          onChange={(e) => onToggleComplete(e.target.checked)}
          disabled={isPending}
          className="mt-0.5 h-5 w-5 cursor-pointer accent-primary"
          aria-label={task.completed ? '未完了に戻す' : '完了にする'}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {task.completed ? <Badge variant="done">完了</Badge> : <Badge variant="wait">WAITING</Badge>}
          </div>
          <div className={cn('mt-1 truncate text-sm font-medium', task.completed && 'line-through')}>
            {task.taskName}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            {task.waitingFor ? <span>依頼先: {task.waitingFor}</span> : null}
            <span>依頼日: {formatJst(task.delegatedDate, 'M/d')}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {chip && !task.completed ? (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-medium',
                chip.overdue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800',
              )}
            >
              {chip.text}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onRemove}
            disabled={isPending}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="削除"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Card>
  );
}
