import { useMemo } from 'react';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { useTasks } from '@/features/tasks/hooks/useTasks';
import { useStartTask, useEndTask, useDeleteTask } from '@/features/tasks/hooks/useTaskMutations';
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
import { formatJst } from '@/lib/time/jst';

function partition(tasks: Task[]): {
  todays: Task[];
  activeTasks: Task[];
  doneTasks: Task[];
  currentTasks: Task[];
  currentMeeting: Task | null;
  next: Task | null;
  allDoneToday: boolean;
} {
  const todayKey = formatJst(new Date(), 'yyyy-MM-dd');
  const todays = tasks.filter((t) => formatJst(t.scheduledStartTime, 'yyyy-MM-dd') === todayKey);
  const activeTasks = todays.filter((t) => t.status !== TaskStatus.Done);
  const doneTasks = todays.filter((t) => t.status === TaskStatus.Done);
  // Meetings run on the calendar's own clock (see meetingStatus.ts) and never
  // join the manual-task spotlight below — they get their own separate timer
  // display instead (CurrentMeetingCard). Multiple manual tasks can run at
  // once (parallel execution), so this is every in-progress one, not just
  // the first.
  const manualTasks = tasks.filter((t) => t.source !== TaskSource.Meeting);
  const currentTasks = manualTasks.filter((t) => t.status === TaskStatus.InProgress);
  const currentMeeting =
    tasks.find((t) => t.source === TaskSource.Meeting && t.status === TaskStatus.InProgress) ??
    null;
  // Today counts as "all done" only once it had tasks and every one of them
  // is finished — a day with nothing scheduled yet is a different state (see
  // the emptyMessage branches below) and should still be able to peek ahead.
  const allDoneToday = todays.length > 0 && activeTasks.length === 0;
  // Unlike `currentTasks` above, "next up" merges tasks and meetings into one
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
  return { todays, activeTasks, doneTasks, currentTasks, currentMeeting, next, allDoneToday };
}

export function TodayRoute() {
  const tasksQuery = useTasks();
  const startMutation = useStartTask();
  const endMutation = useEndTask();
  const deleteMutation = useDeleteTask();

  const waitingQuery = useWaitingTasks();

  const { activeTasks, doneTasks, currentTasks, currentMeeting, next, allDoneToday } = useMemo(
    () => partition(tasksQuery.data ?? []),
    [tasksQuery.data],
  );

  // All-day meetings get their own "終日予定" section above the regular
  // list — they have no start-time slot to sit in among timed tasks.
  const allDayTasks = useMemo(() => activeTasks.filter((t) => isAllDayMeeting(t)), [activeTasks]);
  const regularActiveTasks = useMemo(
    () => activeTasks.filter((t) => !isAllDayMeeting(t)),
    [activeTasks],
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
              {currentTasks.length > 0 ? (
                currentTasks.map((task) => (
                  <CurrentTaskCard
                    key={task.taskId}
                    task={task}
                    onEnd={() => endMutation.mutate(task.taskId)}
                    isPending={endMutation.isPending}
                  />
                ))
              ) : (
                <CurrentTaskCard task={null} onEnd={() => {}} isPending={false} />
              )}
              {next && next.source === TaskSource.Meeting ? (
                <NextMeetingCard task={next} />
              ) : (
                <NextTaskCard
                  task={next}
                  onStart={() => next && startMutation.mutate(next.taskId)}
                  isPending={startMutation.isPending}
                />
              )}
            </>
          )}

          {allDayTasks.length > 0 ? (
            <div className="pt-2">
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                終日予定
              </h2>
              <TaskList
                tasks={allDayTasks}
                nextTaskId={next?.taskId ?? null}
                onDelete={(taskId) => deleteMutation.mutate(taskId)}
                isDeleting={deleteMutation.isPending}
              />
            </div>
          ) : null}

          {doneTasks.length > 0 ? (
            <div className="pt-2">
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

          <div className="pt-2">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              本日のタスク一覧
            </h2>
            <TaskList
              tasks={regularActiveTasks}
              nextTaskId={next?.taskId ?? null}
              onDelete={(taskId) => deleteMutation.mutate(taskId)}
              isDeleting={deleteMutation.isPending}
              emptyMessage={
                doneTasks.length > 0
                  ? '本日のタスクはすべて完了しました'
                  : '本日のタスクはまだありません'
              }
            />
          </div>

          {dueWaitingTasks.length > 0 ? (
            <div className="pt-2">
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                本日の確認待ち
              </h2>
              <WaitingTaskListItems tasks={dueWaitingTasks} />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
