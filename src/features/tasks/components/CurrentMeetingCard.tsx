import { Card } from '@/components/ui/card';
import { TaskTimer } from './TaskTimer';
import type { Task } from '@/features/tasks/types';

interface CurrentMeetingCardProps {
  task: Task;
}

/**
 * Shows the currently in-progress meeting's timer on the 今日 tab. Meetings
 * are deliberately excluded from CurrentTaskCard's single manual-task
 * spotlight (see TodayRoute.tsx), so without this they'd have no visible
 * timer at all while the user is on 今日 — FloatingTimer only appears on
 * other tabs. Read-only: no end button, since meeting status auto-completes
 * from the calendar's own schedule (see meetingStatus.ts).
 */
export function CurrentMeetingCard({ task }: CurrentMeetingCardProps) {
  const startedAt = task.actualStartTime ?? task.scheduledStartTime;
  return (
    <Card className="border-violet-200 bg-violet-50 p-4">
      <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
        会議中
      </span>
      <h3 className="mt-1.5 text-base font-semibold leading-tight">{task.taskName}</h3>
      <div className="mt-3">
        <TaskTimer startedAt={startedAt} estimateMinutes={task.estimateMinutes} />
      </div>
    </Card>
  );
}
