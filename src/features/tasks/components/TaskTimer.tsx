import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface TaskTimerProps {
  startedAt: Date;
  estimateMinutes: number;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Real-time tick of elapsed seconds with a progress bar against the estimate.
 * Bar turns red when the actual time exceeds the estimate.
 */
export function TaskTimer({ startedAt, estimateMinutes }: TaskTimerProps) {
  const [elapsedSec, setElapsedSec] = useState(() =>
    Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000)),
  );

  useEffect(() => {
    const tick = () =>
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const estimateSec = estimateMinutes * 60;
  const ratio = estimateSec > 0 ? elapsedSec / estimateSec : 0;
  const over = elapsedSec > estimateSec;
  const remaining = Math.max(0, estimateSec - elapsedSec);
  const overBy = Math.max(0, elapsedSec - estimateSec);
  const hours = Math.floor(elapsedSec / 3600);
  const minutes = Math.floor((elapsedSec % 3600) / 60);
  const seconds = elapsedSec % 60;
  const display =
    hours > 0
      ? `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
      : `${pad2(minutes)}:${pad2(seconds)}`;

  return (
    <div className="space-y-2">
      <div
        className="font-mono text-3xl font-bold tabular-nums tracking-tight"
        aria-label="経過時間"
      >
        {display}
      </div>
      <div className="text-xs text-muted-foreground">見積: {estimateMinutes}分</div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-amber-100">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500',
            over ? 'bg-destructive' : 'bg-amber-500',
          )}
          style={{ width: `${Math.min(100, ratio * 100)}%` }}
        />
      </div>
      <div className={cn('text-[11px]', over ? 'text-destructive' : 'text-muted-foreground')}>
        {over
          ? `⚠️ 見積超過 +${Math.ceil(overBy / 60)}分`
          : `${Math.round(ratio * 100)}% 経過（残り約${Math.ceil(remaining / 60)}分）`}
      </div>
    </div>
  );
}
