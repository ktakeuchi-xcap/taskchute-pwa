import { useState } from 'react';
import { ExternalLink, Minus, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUIStore } from '@/store/uiStore';
import { useTasks } from '@/features/tasks/hooks/useTasks';
import { useEndTask } from '@/features/tasks/hooks/useTaskMutations';
import { TaskStatus } from '@/features/tasks/types';
import { TaskTimer } from './TaskTimer';

/**
 * Persistent floating widget (Meet-style "picture in picture") shown while a
 * task is running and the user has navigated away from the 今日 tab, which
 * already shows the full-size timer.
 */
export function FloatingTimer() {
  const currentTab = useUIStore((s) => s.currentTab);
  const setTab = useUIStore((s) => s.setTab);
  const tasksQuery = useTasks();
  const endMutation = useEndTask();
  const [minimized, setMinimized] = useState(false);

  const current = (tasksQuery.data ?? []).find((t) => t.status === TaskStatus.InProgress) ?? null;

  if (!current || currentTab === 'today') return null;

  const startedAt = current.actualStartTime ?? current.scheduledStartTime;

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
      </button>
    );
  }

  return (
    <div
      className="fixed right-4 z-30 w-60 rounded-xl border border-amber-300 bg-amber-50 p-3 shadow-xl"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 4.75rem)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <Badge variant="progress">▶ 進行中</Badge>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            aria-label="最小化"
            onClick={() => setMinimized(true)}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            aria-label="今日のタスクへ移動"
            onClick={() => setTab('today')}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <p className="mt-1 truncate text-sm font-semibold">{current.taskName}</p>
      <TaskTimer startedAt={startedAt} estimateMinutes={current.estimateMinutes} />
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="mt-2 w-full"
        onClick={() => endMutation.mutate(current.taskId)}
        disabled={endMutation.isPending}
      >
        ■ 終了
      </Button>
    </div>
  );
}
