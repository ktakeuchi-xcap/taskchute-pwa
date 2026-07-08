import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatJst } from '@/lib/time/jst';
import { CategoryTag } from './CategoryTag';
import { useCategoryColorMap } from '@/features/tasks/hooks/useCategoryColorMap';
import type { Task } from '@/features/tasks/types';

interface NextTaskCardProps {
  task: Task | null;
  onStart: () => void;
  isPending: boolean;
  startDisabled: boolean;
}

export function NextTaskCard({ task, onStart, isPending, startDisabled }: NextTaskCardProps) {
  const categoryColorMap = useCategoryColorMap();
  if (!task) {
    return (
      <Card className="border-dashed bg-card/60 p-4 text-center">
        <Badge variant="muted">— 次の予定なし</Badge>
        <p className="mt-2 text-sm text-muted-foreground">「追加」タブからタスクを足してください</p>
      </Card>
    );
  }
  return (
    <Card className="border-blue-200 bg-blue-50 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        次のタスク
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Badge variant="next">NEXT</Badge>
        {task.category ? (
          <CategoryTag name={task.category} colorKey={categoryColorMap.get(task.category)} />
        ) : null}
      </div>
      <h3 className="mt-1.5 text-base font-semibold leading-tight">{task.taskName}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        予定: {formatJst(task.scheduledStartTime, 'M/d HH:mm')} ・ {task.estimateMinutes}分
      </p>
      <Button className="mt-4 w-full" onClick={onStart} disabled={isPending || startDisabled}>
        ▶ 次を開始
      </Button>
    </Card>
  );
}
