import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatJst } from '@/lib/time/jst';
import { TaskSource, TaskStatus, type Task } from '@/features/tasks/types';
import { isAllDayMeeting } from '@/features/tasks/meetingStatus';
import { layoutDayTimeline } from '@/features/tasks/dayTimelineLayout';
import { categoryColorClassName } from '@/features/tasks/categoryColors';
import { useCategoryColorMap } from '@/features/tasks/hooks/useCategoryColorMap';
import { CategoryTag } from './CategoryTag';

interface DayTimelineProps {
  /** The day being shown — only used to detect "today" for the now-line and the initial scroll target. */
  date: Date;
  /** That day's tasks/meetings (all-day ones are split out into their own strip automatically). */
  tasks: Task[];
  selectedTaskId?: string | null;
  onSelectTask?: (taskId: string) => void;
}

const HOUR_HEIGHT_PX = 48;
const DAY_HEIGHT_PX = 24 * HOUR_HEIGHT_PX;
const VISIBLE_HEIGHT_PX = 8 * HOUR_HEIGHT_PX;
const DEFAULT_SCROLL_HOUR = 7;

/**
 * A Google Calendar-style day view: an hour-ruled time axis with each
 * task/meeting positioned and sized by its actual scheduled start/end time
 * (via layoutDayTimeline), instead of the plain top-to-bottom list. All-day
 * meetings have no real position on a time axis, so — matching Google
 * Calendar's own all-day row — they're rendered in a separate strip above
 * the ruled area rather than forced onto it.
 *
 * This is a display-only view (no drag-to-reschedule): tapping a block
 * selects it via onSelectTask so the caller can surface the actual
 * edit/delete/tag controls elsewhere (reusing TaskList's existing per-row
 * actions rather than cramming them into a ~20px-tall block).
 */
export function DayTimeline({ date, tasks, selectedTaskId, onSelectTask }: DayTimelineProps) {
  const categoryColorMap = useCategoryColorMap();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const dateKey = formatJst(date, 'yyyy-MM-dd');
  const isToday = dateKey === formatJst(now, 'yyyy-MM-dd');

  const allDayTasks = useMemo(() => tasks.filter(isAllDayMeeting), [tasks]);
  const timedTasks = useMemo(() => tasks.filter((t) => !isAllDayMeeting(t)), [tasks]);
  const positioned = useMemo(() => layoutDayTimeline(timedTasks, HOUR_HEIGHT_PX), [timedTasks]);

  const earliestStartHour = useMemo(() => {
    if (timedTasks.length === 0) return null;
    const minutes = Math.min(
      ...timedTasks.map(
        (t) =>
          Number(formatJst(t.scheduledStartTime, 'H')) * 60 +
          Number(formatJst(t.scheduledStartTime, 'm')),
      ),
    );
    return minutes / 60;
  }, [timedTasks]);

  const nowMinutes = Number(formatJst(now, 'H')) * 60 + Number(formatJst(now, 'm'));

  // Auto-scroll to a sensible start each time the selected day changes:
  // today scrolls to "now" (with an hour of context above it), other days
  // scroll to their earliest task, and an empty day falls back to 7:00.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const targetHour = isToday ? nowMinutes / 60 : (earliestStartHour ?? DEFAULT_SCROLL_HOUR);
    el.scrollTop = Math.max(0, (targetHour - 1) * HOUR_HEIGHT_PX);
    // Only re-run when the day itself changes — re-scrolling on every
    // now/task-list tick would fight the user's own scroll position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);

  return (
    <div className="space-y-2">
      {allDayTasks.length > 0 ? (
        <div className="space-y-1">
          {allDayTasks.map((t) => (
            <button
              key={t.taskId}
              type="button"
              onClick={() => onSelectTask?.(t.taskId)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-left transition-colors',
                selectedTaskId === t.taskId && 'ring-2 ring-primary',
              )}
            >
              <span className="flex-shrink-0 rounded bg-violet-100 px-1 py-0.5 text-[10px] text-violet-700">
                終日
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-violet-900">
                {t.taskName}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="relative overflow-y-auto rounded-lg border border-border bg-card"
        style={{ height: `${VISIBLE_HEIGHT_PX}px` }}
      >
        <div className="relative" style={{ height: `${DAY_HEIGHT_PX}px` }}>
          {/* 時間軸の目盛り */}
          {Array.from({ length: 24 }, (_, h) => (
            <div
              key={h}
              className="absolute inset-x-0 border-t border-border/60"
              style={{ top: `${h * HOUR_HEIGHT_PX}px` }}
            >
              <span className="absolute -top-2 left-1 w-9 bg-card pr-1 text-[10px] text-muted-foreground">
                {h}:00
              </span>
            </div>
          ))}

          {/* 現在時刻ライン（当日のみ） */}
          {isToday ? (
            <div
              className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
              style={{ top: `${(nowMinutes / 60) * HOUR_HEIGHT_PX}px` }}
            >
              <span className="-ml-1 h-2 w-2 flex-shrink-0 rounded-full bg-destructive" />
              <div className="h-px flex-1 bg-destructive" />
            </div>
          ) : null}

          {/* タスク・会議ブロック（左に目盛りぶんの余白を空ける） */}
          <div className="absolute inset-y-0 left-11 right-1">
            {positioned.map(({ task, top, height, column, totalColumns }) => {
              const isDone = task.status === TaskStatus.Done;
              const isInProgress = task.status === TaskStatus.InProgress;
              const isMeeting = task.source === TaskSource.Meeting;
              const colorClassName = task.category
                ? categoryColorClassName(categoryColorMap.get(task.category))
                : 'border border-border bg-muted text-foreground';
              return (
                <button
                  key={task.taskId}
                  type="button"
                  onClick={() => onSelectTask?.(task.taskId)}
                  className={cn(
                    'absolute overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm transition-opacity',
                    colorClassName,
                    isDone && 'opacity-50',
                    isInProgress && 'ring-2 ring-amber-400',
                    selectedTaskId === task.taskId && 'ring-2 ring-primary',
                  )}
                  style={{
                    top: `${top}px`,
                    height: `${height}px`,
                    left: `${(column / totalColumns) * 100}%`,
                    width: `calc(${100 / totalColumns}% - 2px)`,
                  }}
                >
                  <div className={cn('truncate font-medium', isDone && 'line-through')}>
                    {isMeeting ? '会議・' : ''}
                    {task.taskName}
                  </div>
                  {height >= 32 ? (
                    <div className="truncate text-[10px] opacity-80">
                      {formatJst(task.scheduledStartTime, 'HH:mm')}–
                      {formatJst(task.scheduledEndTime, 'HH:mm')}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 案件マスタの色凡例と同じ表示（ブロック内には収まらない案件名を確認する用） */}
      {timedTasks.some((t) => t.category) ? (
        <div className="flex flex-wrap gap-x-2 gap-y-1">
          {[...new Set(timedTasks.map((t) => t.category).filter((c): c is string => !!c))].map(
            (category) => (
              <CategoryTag
                key={category}
                name={category}
                colorKey={categoryColorMap.get(category)}
              />
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
