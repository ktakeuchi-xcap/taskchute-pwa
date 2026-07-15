import { useIsMutating, useQuery, useQueryClient } from '@tanstack/react-query';
import { TaskSource, type Task } from '@/features/tasks/types';
import { SYNC_MUTATION_KEY } from '@/features/sync/syncMutationKey';
import { useTaskRepository } from './useTaskRepository';

export const TASKS_QUERY_KEY = ['tasks'] as const;

/**
 * A meeting task missing from a fresh fetch gets this many consecutive
 * misses of grace before it's actually dropped from the displayed list.
 *
 * Meeting sync updates several rows' cells in a single batch request (see
 * syncMeetingsToSheet.ts). A plain read landing mid-write can occasionally
 * see a row's ScheduledStartTime/EndTime cells transiently blank, which
 * fails parseTaskDbRows' date parsing and drops that row for one fetch —
 * and since several meetings can be mid-write in the same batch at once,
 * they can all vanish from the list together for a moment (ISS-16). A
 * genuinely deleted/declined meeting keeps missing on every subsequent
 * fetch and still disappears once the grace period is exhausted; a
 * transient read artifact reappears on the very next 30s poll.
 */
export const MEETING_MISS_GRACE = 1;

export function reconcileMeetingFlicker(
  fresh: Task[],
  previous: Task[] | undefined,
  missStreaks: Map<string, number>,
): Task[] {
  if (!previous || previous.length === 0) return fresh;
  const freshIds = new Set(fresh.map((t) => t.taskId));
  const carried: Task[] = [];

  for (const task of previous) {
    if (task.source !== TaskSource.Meeting || freshIds.has(task.taskId)) continue;
    const misses = (missStreaks.get(task.taskId) ?? 0) + 1;
    if (misses <= MEETING_MISS_GRACE) {
      missStreaks.set(task.taskId, misses);
      carried.push(task);
    } else {
      missStreaks.delete(task.taskId);
    }
  }

  for (const task of fresh) {
    if (task.source === TaskSource.Meeting) missStreaks.delete(task.taskId);
  }

  if (carried.length === 0) return fresh;
  return [...fresh, ...carried].sort(
    (a, b) => a.scheduledStartTime.getTime() - b.scheduledStartTime.getTime(),
  );
}

const meetingMissStreaks = new Map<string, number>();

/** Whether a sync (useSync.ts) is currently in flight — see useIsSyncing below. */
export function useIsSyncing(): boolean {
  return useIsMutating({ mutationKey: SYNC_MUTATION_KEY }) > 0;
}

export function useTasks() {
  const repo = useTaskRepository();
  const qc = useQueryClient();
  // While a sync is running, its own ordinary reads could land mid-write
  // (see reconcileMeetingFlicker above); that's a fallback, not the fix. The
  // real fix is not to run a competing read at all during that window — the
  // sync's own onSuccess (useSync.ts) sets the cache directly from its
  // authoritative post-write read once everything has settled.
  const isSyncing = useIsSyncing();
  return useQuery({
    queryKey: TASKS_QUERY_KEY,
    queryFn: async () => {
      if (!repo) throw new Error('repository unavailable');
      const fresh = await repo.listTasks();
      const previous = qc.getQueryData<Task[]>(TASKS_QUERY_KEY);
      return reconcileMeetingFlicker(fresh, previous, meetingMissStreaks);
    },
    enabled: !!repo,
    refetchInterval: isSyncing ? false : 30_000,
    refetchOnWindowFocus: !isSyncing,
    staleTime: 15_000,
  });
}

/** Convenience: invalidate the tasks query (e.g. after manual edits via Sheets UI). */
export function useInvalidateTasks() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
}

/** Synchronous helper for tests / non-hook contexts. */
export function setTasksCache(
  qc: ReturnType<typeof useQueryClient>,
  updater: (old: Task[] | undefined) => Task[],
): void {
  qc.setQueryData<Task[]>(TASKS_QUERY_KEY, updater);
}
