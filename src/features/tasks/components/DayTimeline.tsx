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
  /** Called after a task block is dragged to a new time (same day, duration unchanged). Meetings are never draggable. */
  onReschedule?: (task: Task, minutesOfDay: number) => void;
}

const HOUR_HEIGHT_PX = 48;
const DAY_HEIGHT_PX = 24 * HOUR_HEIGHT_PX;
const DEFAULT_SCROLL_HOUR = 7;
// Dragged blocks snap to the same 15-minute grid as new-task start times (REQ-07).
const SNAP_MINUTES = 15;

function minutesFromTopPx(topPx: number): number {
  const raw = (topPx / HOUR_HEIGHT_PX) * 60;
  return Math.max(0, Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES);
}

function formatMinutesOfDay(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

interface DragState {
  taskId: string;
  startClientY: number;
  startTop: number;
  liveTop: number;
  height: number;
}

/**
 * A Google Calendar-style day view: an hour-ruled time axis with each
 * task/meeting positioned and sized by its actual scheduled start/end time
 * (via layoutDayTimeline), instead of the plain top-to-bottom list. All-day
 * meetings have no real position on a time axis, so — matching Google
 * Calendar's own all-day row — they're rendered in a separate strip above
 * the ruled area rather than forced onto it.
 *
 * Fills whatever height its parent gives it (h-full) rather than a fixed
 * pixel box — the caller is expected to size that parent to reach the
 * bottom of the viewport, and only the ruled grid itself scrolls internally.
 *
 * Non-meeting tasks can be dragged vertically to reschedule their start time
 * within the same day (duration stays fixed) — a short press-and-hold (not
 * an instant grab) activates the drag, same convention as the day-strip's
 * cross-day dragging in UpcomingRoute, so a quick tap/swipe still scrolls
 * the timeline natively instead of being hijacked as a drag.
 */
export function DayTimeline({ date, tasks, onReschedule }: DayTimelineProps) {
  const categoryColorMap = useCategoryColorMap();
  const scrollRef = useRef<HTMLDivElement>(null);
  const activateTimerRef = useRef<number | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

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

  const clearActivateTimer = () => {
    if (activateTimerRef.current != null) {
      window.clearTimeout(activateTimerRef.current);
      activateTimerRef.current = null;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {allDayTasks.length > 0 ? (
        <div className="flex-shrink-0 space-y-1">
          {allDayTasks.map((t) => (
            <div
              key={t.taskId}
              className="flex w-full items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-2 py-1"
            >
              <span className="flex-shrink-0 rounded bg-violet-100 px-1 py-0.5 text-[10px] text-violet-700">
                終日
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-violet-900">
                {t.taskName}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-card"
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
              const isDraggable = !isMeeting && !!onReschedule;
              const isDraggingThis = drag?.taskId === task.taskId;
              const displayTop = isDraggingThis ? drag!.liveTop : top;
              const colorClassName = task.category
                ? categoryColorClassName(categoryColorMap.get(task.category))
                : 'border border-border bg-muted text-foreground';

              const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
                if (!isDraggable) return;
                const startClientY = e.clientY;
                const pointerId = e.pointerId;
                const el = e.currentTarget;
                clearActivateTimer();
                activateTimerRef.current = window.setTimeout(() => {
                  el.setPointerCapture(pointerId);
                  setDrag({
                    taskId: task.taskId,
                    startClientY,
                    startTop: top,
                    liveTop: top,
                    height,
                  });
                }, 200);
              };
              const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
                if (!isDraggingThis) return; // not activated yet — let native scroll/tap through
                e.preventDefault();
                const dy = e.clientY - drag!.startClientY;
                const rawTop = drag!.startTop + dy;
                const clamped = Math.max(0, Math.min(DAY_HEIGHT_PX - drag!.height, rawTop));
                setDrag((d) => (d && d.taskId === task.taskId ? { ...d, liveTop: clamped } : d));
              };
              const handlePointerUp = () => {
                clearActivateTimer();
                if (isDraggingThis) {
                  onReschedule?.(task, minutesFromTopPx(drag!.liveTop));
                }
                setDrag((d) => (d && d.taskId === task.taskId ? null : d));
              };
              const handlePointerCancel = () => {
                clearActivateTimer();
                setDrag((d) => (d && d.taskId === task.taskId ? null : d));
              };

              return (
                <button
                  key={task.taskId}
                  type="button"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                  className={cn(
                    'absolute overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm transition-opacity',
                    colorClassName,
                    isDone && 'opacity-50',
                    isInProgress && 'ring-2 ring-amber-400',
                    isDraggable && 'touch-manipulation',
                    isDraggingThis && 'z-20 cursor-grabbing opacity-90 shadow-lg',
                  )}
                  style={{
                    top: `${displayTop}px`,
                    height: `${height}px`,
                    left: `${(column / totalColumns) * 100}%`,
                    width: `calc(${100 / totalColumns}% - 2px)`,
                    transition: isDraggingThis ? 'none' : 'top 0.15s',
                  }}
                >
                  {isDraggingThis ? (
                    <div className="pointer-events-none absolute -top-6 left-0 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background shadow">
                      {formatMinutesOfDay(minutesFromTopPx(drag!.liveTop))}〜
                      {formatMinutesOfDay(minutesFromTopPx(drag!.liveTop) + task.estimateMinutes)}
                    </div>
                  ) : null}
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
        <div className="flex flex-shrink-0 flex-wrap gap-x-2 gap-y-1">
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
