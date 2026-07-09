import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { TaskTimer } from './TaskTimer';
import { CategoryTag } from './CategoryTag';
import { useCategoryColorMap } from '@/features/tasks/hooks/useCategoryColorMap';
import type { Task } from '@/features/tasks/types';

interface CurrentTaskCardProps {
  task: Task | null;
  onEnd: () => void;
  isPending: boolean;
}

export function CurrentTaskCard({ task, onEnd, isPending }: CurrentTaskCardProps) {
  const categoryColorMap = useCategoryColorMap();
  if (!task) {
    return (
      <Card className="border-dashed bg-card/60 p-4 text-center">
        <Badge variant="muted">— 進行中なし</Badge>
        <p className="mt-2 text-sm text-muted-foreground">「次を開始」で次のタスクをスタート</p>
      </Card>
    );
  }
  const startedAt = task.actualStartTime ?? task.scheduledStartTime;
  return (
    <Card className="border-amber-200 bg-amber-50 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        進行中
      </div>
      <div className="mt-1 flex items-start justify-between gap-2">
        <div className="flex-1">
          <h3 className="text-base font-semibold leading-tight">{task.taskName}</h3>
          <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            {task.category ? (
              <CategoryTag name={task.category} colorKey={categoryColorMap.get(task.category)} />
            ) : null}
          </div>
        </div>
      </div>
      <div className="mt-3">
        <TaskTimer startedAt={startedAt} estimateMinutes={task.estimateMinutes} />
      </div>
      <Button variant="destructive" className="mt-4 w-full" onClick={onEnd} disabled={isPending}>
        ■ 現在を終了
      </Button>
    </Card>
  );
}
