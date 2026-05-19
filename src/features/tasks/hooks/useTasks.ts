import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Task } from '@/features/tasks/types';
import { useTaskRepository } from './useTaskRepository';

export const TASKS_QUERY_KEY = ['tasks'] as const;

export function useTasks() {
  const repo = useTaskRepository();
  return useQuery({
    queryKey: TASKS_QUERY_KEY,
    queryFn: async () => {
      if (!repo) throw new Error('repository unavailable');
      return repo.listTasks();
    },
    enabled: !!repo,
    refetchInterval: 30_000,
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
