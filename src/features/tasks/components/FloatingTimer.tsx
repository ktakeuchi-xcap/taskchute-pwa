import { useState } from 'react';
import { ExternalLink, Minus, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUIStore } from '@/store/uiStore';
import { useTasks } from '@/features/tasks/hooks/useTasks';
import { useEndTask } from '@/features/tasks/hooks/useTaskMutations';
import { TaskSource, TaskStatus, type Task } from '@/features/tasks/types';
import { TaskTimer } from './TaskTimer';

/**
 * Persistent floating widget (Meet-style "picture in picture") shown while a
 * task is running and the user has navigated away from the 今日 tab, which
 * already shows the full-size timer. Stacks one card per in-progress item —
 * multiple manual tasks can run at once (parallel execution), and a meeting
 * can also be running alongside them.
 */
export function FloatingTimer() {
  const currentTab = useUIStore((s) => s.currentTab);
  const setTab = useUIStore((s) => s.setTab);
  const tasksQuery = useTasks();
  const endMutation = useEndTask();
  const [minimized, setMinimized] = useState(false);

  const currentItems = (tasksQuery.data ?? []).filter((t) => t.status === TaskStatus.InProgress);

  if (currentItems.length === 0 || currentTab === 'today') return null;

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        aria-label="タイマーを開く"
        className="fixed right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-amber-300 bg-amber-50 shadow-xl"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 4.75rem)' }}
      >
        <Timer className="h-5 w-5 text-amber-700" />
        {currentItems.length > 1 ? (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-600 text-[10px] font-semibold text-white">
            {currentItems.length}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div
      className="fixed right-4 z-30 flex w-60 flex-col gap-2"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 4.75rem)' }}
    >
      {currentItems.map((item, i) => (
        <FloatingTimerCard
          key={item.taskId}
          task={item}
          showControls={i === 0}
          onMinimize={() => setMinimized(true)}
          onGoToToday={() => setTab('today')}
          onEnd={() => endMutation.mutate(item.taskId)}
          isEnding={endMutation.isPending}
        />
      ))}
    </div>
  );
}

interface FloatingTimerCardProps {
  task: Task;
  /** Minimize/go-to-today are stack-wide actions — shown once, on the top card. */
  showControls: boolean;
  onMinimize: () => void;
  onGoToToday: () => void;
  onEnd: () => void;
  isEnding: boolean;
}

function FloatingTimerCard({
  task,
  showControls,
  onMinimize,
  onGoToToday,
  onEnd,
  isEnding,
}: FloatingTimerCardProps) {
  const isMeeting = task.source === TaskSource.Meeting;
  const startedAt = task.actualStartTime ?? task.scheduledStartTime;

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 shadow-xl">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="progress">{isMeeting ? '▶ 会議中' : '▶ 進行中'}</Badge>
        {showControls ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              aria-label="最小化"
              onClick={onMinimize}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              aria-label="今日のタスクへ移動"
              onClick={onGoToToday}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}
      </div>
      <p className="mt-1 truncate text-sm font-semibold">{task.taskName}</p>
      <TaskTimer startedAt={startedAt} estimateMinutes={task.estimateMinutes} />
      {isMeeting ? null : (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="mt-2 w-full"
          onClick={onEnd}
          disabled={isEnding}
        >
          ■ 終了
        </Button>
      )}
    </div>
  );
}
