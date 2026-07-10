import { Card } from '@/components/ui/card';
import { formatJst } from '@/lib/time/jst';
import { CategoryTag } from './CategoryTag';
import { useCategoryColorMap } from '@/features/tasks/hooks/useCategoryColorMap';
import type { Task } from '@/features/tasks/types';

interface NextMeetingCardProps {
  task: Task;
}

/**
 * Occupies the same "next up" slot as NextTaskCard, for when the next
 * chronologically-upcoming item today is a meeting rather than a manual
 * task (see TodayRoute.tsx's partition()). No start button — meetings
 * begin themselves at their scheduled time (see meetingStatus.ts).
 */
export function NextMeetingCard({ task }: NextMeetingCardProps) {
  const categoryColorMap = useCategoryColorMap();
  return (
    <Card className="border-violet-200 bg-violet-50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
          次の会議
        </span>
        {task.category ? (
          <CategoryTag name={task.category} colorKey={categoryColorMap.get(task.category)} />
        ) : null}
      </div>
      <h3 className="mt-1.5 font-display text-base font-semibold leading-tight">{task.taskName}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        予定: {formatJst(task.scheduledStartTime, 'M/d HH:mm')} ・ {task.estimateMinutes}分
      </p>
    </Card>
  );
}
