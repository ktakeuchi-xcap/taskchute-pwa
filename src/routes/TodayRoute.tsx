import { useMemo, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { useTasks } from '@/features/tasks/hooks/useTasks';
import { useStartTask, useEndTask, useDeleteTask } from '@/features/tasks/hooks/useTaskMutations';
import { useGenerateRoutines } from '@/features/routines/hooks/useGenerateRoutines';
import { useWaitingTasks } from '@/features/waiting/hooks/useWaitingTasks';
import { WaitingTaskListItems } from '@/features/waiting/components/WaitingTaskListItems';
import { CurrentTaskCard } from '@/features/tasks/components/CurrentTaskCard';
import { CurrentMeetingCard } from '@/features/tasks/components/CurrentMeetingCard';
import { NextTaskCard } from '@/features/tasks/components/NextTaskCard';
import { NextMeetingCard } from '@/features/tasks/components/NextMeetingCard';
import { AllDoneCard } from '@/features/tasks/components/AllDoneCard';
import { TaskList } from '@/features/tasks/components/TaskList';
import { DailyWorkloadGauge } from '@/features/tasks/components/DailyWorkloadGauge';
import { isAllDayMeeting } from '@/features/tasks/meetingStatus';
import { TaskSource, TaskStatus, type Task } from '@/features/tasks/types';
import { addDays, formatJst, startOfJstWeek } from '@/lib/time/jst';

function weekOffsetLabel(offset: number): string {
  if (offset === 0) return '今週';
  if (offset === 1) return '来週';
  return `${offset}週間後`;
}

function partition(tasks: Task[]): {
  todays: Task[];
  activeTasks: Task[];
  doneTasks: Task[];
  current: Task | null;
  currentMeeting: Task | null;
  next: Task | null;
  allDoneToday: boolean;
} {
  const todayKey = formatJst(new Date(), 'yyyy-MM-dd');
  const todays = tasks.filter((t) => formatJst(t.scheduledStartTime, 'yyyy-MM-dd') === todayKey);
  const activeTasks = todays.filter((t) => t.status !== TaskStatus.Done);
  const doneTasks = todays.filter((t) => t.status === TaskStatus.Done);
  // Meetings run on the calendar's own clock (see meetingStatus.ts) and never
  // take over the single manual-task spotlight below — they get their own
  // separate timer display instead (CurrentMeetingCard).
  const manualTasks = tasks.filter((t) => t.source !== TaskSource.Meeting);
  const current = manualTasks.find((t) => t.status === TaskStatus.InProgress) ?? null;
  const currentMeeting =
    tasks.find((t) => t.source === TaskSource.Meeting && t.status === TaskStatus.InProgress) ??
    null;
  // Today counts as "all done" only once it had tasks and every one of them
  // is finished — a day with nothing scheduled yet is a different state (see
  // the emptyMessage branches below) and should still be able to peek ahead.
  const allDoneToday = todays.length > 0 && activeTasks.length === 0;
  // Unlike `current` above, "next up" merges tasks and meetings into one
  // slot — whichever is chronologically first gets shown there (see
  // NextMeetingCard for the meeting case, which has no start button since
  // meetings begin themselves). All-day meetings have no real "next up"
  // moment (no start time to count down to) so they're excluded here, same
  // as they're excluded from ever being "in progress". Once today is fully
  // done, skip the cross-day fallback — peeking at tomorrow's task here
  // undercuts the "you're done for today" moment (see AllDoneCard).
  const next = allDoneToday
    ? null
    : (todays.find((t) => t.status === TaskStatus.NotStarted && !isAllDayMeeting(t)) ??
      tasks.find((t) => t.status === TaskStatus.NotStarted && !isAllDayMeeting(t)) ??
      null);
  return { todays, activeTasks, doneTasks, current, currentMeeting, next, allDoneToday };
}

export function TodayRoute() {
  const tasksQuery = useTasks();
  const startMutation = useStartTask();
  const endMutation = useEndTask();
  const deleteMutation = useDeleteTask();
  const routinesMutation = useGenerateRoutines();
  const [routineFeedback, setRoutineFeedback] = useState<string | null>(null);
  const [routineWeekOffset, setRoutineWeekOffset] = useState(1); // 1 = 来週 (previous default)

  const waitingQuery = useWaitingTasks();

  const { activeTasks, doneTasks, current, currentMeeting, next, allDoneToday } = useMemo(
    () => partition(tasksQuery.data ?? []),
    [tasksQuery.data],
  );

  // "本日の確認待ち" = due today or already overdue (not yet completed) — an
  // overdue follow-up is exactly the kind of thing today's screen should
  // surface, not just items whose date is literally today.
  const dueWaitingTasks = useMemo(() => {
    const todayKey = formatJst(new Date(), 'yyyy-MM-dd');
    return (waitingQuery.data ?? []).filter(
      (t) => !t.completed && t.followUpDate && formatJst(t.followUpDate, 'yyyy-MM-dd') <= todayKey,
    );
  }, [waitingQuery.data]);

  const routineWeekMonday = useMemo(
    () => addDays(startOfJstWeek(new Date()), routineWeekOffset * 7),
    [routineWeekOffset],
  );
  const routineWeekLabel = `${weekOffsetLabel(routineWeekOffset)}（${formatJst(routineWeekMonday, 'M/d')}〜${formatJst(addDays(routineWeekMonday, 4), 'M/d')}）`;

  // A task next up is already shown in full in the NextTaskCard spotlight
  // above, so repeating it in the plain list below is just noise — drop it
  // there. A meeting next up stays in the list: NextMeetingCard doesn't
  // replace its row (no start/end actions to consolidate), and the list is
  // still how other today's meetings are found among each other.
  const listTasks = useMemo(
    () =>
      next && next.source !== TaskSource.Meeting
        ? activeTasks.filter((t) => t.taskId !== next.taskId)
        : activeTasks,
    [activeTasks, next],
  );

  const handleGenerateRoutines = async () => {
    setRoutineFeedback(null);
    try {
      const result = await routinesMutation.mutateAsync(routineWeekOffset);
      if (result.addedCount === 0 && result.skippedCount === 0) {
        setRoutineFeedback('対象のルーチンタスクが見つかりませんでした');
      } else if (result.addedCount === 0) {
        setRoutineFeedback(
          `${routineWeekLabel}分はすでに生成済みです（${result.skippedCount}件スキップ）`,
        );
      } else {
        setRoutineFeedback(
          `${result.weekStartIso}〜${result.weekEndIso} に ${result.addedCount}件追加（${result.skippedCount}件スキップ）`,
        );
      }
    } catch (err) {
      setRoutineFeedback(`生成に失敗しました：${err instanceof Error ? err.message : err}`);
    }
  };

  return (
    <div className="space-y-3 p-4">
      {tasksQuery.isLoading ? (
        <div className="rounded-lg border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
          読み込み中…
        </div>
      ) : tasksQuery.isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          タスクの読み込みに失敗しました：
          {tasksQuery.error instanceof Error ? tasksQuery.error.message : '不明なエラー'}
        </div>
      ) : (
        <>
          <DailyWorkloadGauge activeTasks={activeTasks} doneTasks={doneTasks} />

          {currentMeeting ? <CurrentMeetingCard task={currentMeeting} /> : null}

          {allDoneToday && !currentMeeting ? (
            <AllDoneCard />
          ) : (
            <>
              <CurrentTaskCard
                task={current}
                onEnd={() => current && endMutation.mutate(current.taskId)}
                isPending={endMutation.isPending}
              />
              {next && next.source === TaskSource.Meeting ? (
                <NextMeetingCard task={next} />
              ) : (
                <NextTaskCard
                  task={next}
                  onStart={() => next && startMutation.mutate(next.taskId)}
                  isPending={startMutation.isPending}
                  startDisabled={current !== null}
                />
              )}
            </>
          )}

          <div className="pt-2">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              本日のタスク一覧
            </h2>
            <TaskList
              tasks={listTasks}
              nextTaskId={next?.taskId ?? null}
              onDelete={(taskId) => deleteMutation.mutate(taskId)}
              isDeleting={deleteMutation.isPending}
              emptyMessage={
                doneTasks.length > 0
                  ? '本日のタスクはすべて完了しました'
                  : next && next.source !== TaskSource.Meeting
                    ? '他のタスクはありません'
                    : '本日のタスクはまだありません'
              }
            />
            {doneTasks.length > 0 ? (
              <div className="mt-2">
                <CollapsibleSection title={`完了済み（${doneTasks.length}件）`}>
                  <TaskList
                    tasks={doneTasks}
                    nextTaskId={null}
                    onDelete={(taskId) => deleteMutation.mutate(taskId)}
                    isDeleting={deleteMutation.isPending}
                  />
                </CollapsibleSection>
              </div>
            ) : null}
          </div>

          {dueWaitingTasks.length > 0 ? (
            <div className="pt-2">
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                本日の確認待ち
              </h2>
              <WaitingTaskListItems tasks={dueWaitingTasks} />
            </div>
          ) : null}

          <div className="pt-2">
            <div className="mb-1.5 flex items-center justify-center gap-1">
              <button
                type="button"
                aria-label="前の週へ"
                onClick={() => setRoutineWeekOffset((o) => Math.max(0, o - 1))}
                disabled={routineWeekOffset === 0}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-medium text-foreground">{routineWeekLabel}</span>
              <button
                type="button"
                aria-label="次の週へ"
                onClick={() => setRoutineWeekOffset((o) => o + 1)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <Button
              variant="secondary"
              className="w-full"
              onClick={handleGenerateRoutines}
              disabled={routinesMutation.isPending}
            >
              <CalendarPlus className="h-4 w-4" />
              {routinesMutation.isPending
                ? '生成中…'
                : `${weekOffsetLabel(routineWeekOffset)}のルーチンタスクを生成`}
            </Button>
            {routineFeedback ? (
              <p className="mt-2 text-xs text-muted-foreground">{routineFeedback}</p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
