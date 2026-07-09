import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MeetingCategoryScope, Task, TaskInput } from '@/features/tasks/types';
import { TaskStatus } from '@/features/tasks/types';
import { useTaskRepository } from './useTaskRepository';
import { TASKS_QUERY_KEY } from './useTasks';

interface OptimisticContext {
  previous: Task[] | undefined;
}

export function useAddTask() {
  const repo = useTaskRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TaskInput) => {
      if (!repo) throw new Error('repository unavailable');
      return repo.addTask(input);
    },
    onSuccess: (task) => {
      // Splice into the cache so the UI updates without waiting for the next poll.
      qc.setQueryData<Task[]>(TASKS_QUERY_KEY, (old) => {
        const next = [...(old ?? []), task];
        return next.sort((a, b) => a.scheduledStartTime.getTime() - b.scheduledStartTime.getTime());
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: TASKS_QUERY_KEY }),
  });
}

export function useStartTask() {
  const repo = useTaskRepository();
  const qc = useQueryClient();
  return useMutation<Task, Error, string, OptimisticContext>({
    mutationFn: async (taskId) => {
      if (!repo) throw new Error('repository unavailable');
      return repo.startTask(taskId);
    },
    onMutate: async (taskId) => {
      await qc.cancelQueries({ queryKey: TASKS_QUERY_KEY });
      const previous = qc.getQueryData<Task[]>(TASKS_QUERY_KEY);
      const startedAt = new Date();
      qc.setQueryData<Task[]>(TASKS_QUERY_KEY, (old) =>
        (old ?? []).map((t) =>
          t.taskId === taskId
            ? { ...t, status: TaskStatus.InProgress, actualStartTime: startedAt }
            : t,
        ),
      );
      return { previous };
    },
    onError: (_err, _taskId, ctx) => {
      if (ctx?.previous) qc.setQueryData(TASKS_QUERY_KEY, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: TASKS_QUERY_KEY }),
  });
}

export function useUpdateTask() {
  const repo = useTaskRepository();
  const qc = useQueryClient();
  return useMutation<Task, Error, { taskId: string; input: TaskInput }, OptimisticContext>({
    mutationFn: async ({ taskId, input }) => {
      if (!repo) throw new Error('repository unavailable');
      return repo.updateTask(taskId, input);
    },
    onMutate: async ({ taskId, input }) => {
      await qc.cancelQueries({ queryKey: TASKS_QUERY_KEY });
      const previous = qc.getQueryData<Task[]>(TASKS_QUERY_KEY);
      qc.setQueryData<Task[]>(TASKS_QUERY_KEY, (old) =>
        (old ?? []).map((t) =>
          t.taskId === taskId
            ? {
                ...t,
                taskName: input.taskName,
                category: input.category ?? null,
                estimateMinutes: input.estimateMinutes,
                scheduledStartTime: input.startTime ?? t.scheduledStartTime,
                scheduledEndTime: new Date(
                  (input.startTime ?? t.scheduledStartTime).getTime() +
                    input.estimateMinutes * 60_000,
                ),
              }
            : t,
        ),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(TASKS_QUERY_KEY, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: TASKS_QUERY_KEY }),
  });
}

export function useDeleteTask() {
  const repo = useTaskRepository();
  const qc = useQueryClient();
  return useMutation<void, Error, string, OptimisticContext>({
    mutationFn: async (taskId) => {
      if (!repo) throw new Error('repository unavailable');
      return repo.deleteTask(taskId);
    },
    onMutate: async (taskId) => {
      await qc.cancelQueries({ queryKey: TASKS_QUERY_KEY });
      const previous = qc.getQueryData<Task[]>(TASKS_QUERY_KEY);
      qc.setQueryData<Task[]>(TASKS_QUERY_KEY, (old) =>
        (old ?? []).filter((t) => t.taskId !== taskId),
      );
      return { previous };
    },
    onError: (_err, _taskId, ctx) => {
      if (ctx?.previous) qc.setQueryData(TASKS_QUERY_KEY, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: TASKS_QUERY_KEY }),
  });
}

interface SetMeetingCategoryInput {
  taskId: string;
  category: string | null;
  scope: MeetingCategoryScope;
}

export function useSetMeetingCategory() {
  const repo = useTaskRepository();
  const qc = useQueryClient();
  return useMutation<Task, Error, SetMeetingCategoryInput>({
    mutationFn: async ({ taskId, category, scope }) => {
      if (!repo) throw new Error('repository unavailable');
      return repo.setMeetingCategory(taskId, category, scope);
    },
    // A scope of "from-this"/"all" can touch other rows in the same series
    // too, so there's no simple optimistic patch — just refetch.
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_QUERY_KEY }),
  });
}

export function useEndTask() {
  const repo = useTaskRepository();
  const qc = useQueryClient();
  return useMutation<Task, Error, string, OptimisticContext>({
    mutationFn: async (taskId) => {
      if (!repo) throw new Error('repository unavailable');
      return repo.endTask(taskId);
    },
    onMutate: async (taskId) => {
      await qc.cancelQueries({ queryKey: TASKS_QUERY_KEY });
      const previous = qc.getQueryData<Task[]>(TASKS_QUERY_KEY);
      const endedAt = new Date();
      qc.setQueryData<Task[]>(TASKS_QUERY_KEY, (old) =>
        (old ?? []).map((t) =>
          t.taskId === taskId ? { ...t, status: TaskStatus.Done, actualEndTime: endedAt } : t,
        ),
      );
      return { previous };
    },
    onError: (_err, _taskId, ctx) => {
      if (ctx?.previous) qc.setQueryData(TASKS_QUERY_KEY, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: TASKS_QUERY_KEY }),
  });
}
