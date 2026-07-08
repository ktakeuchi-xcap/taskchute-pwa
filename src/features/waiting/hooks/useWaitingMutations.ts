import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { WaitingTask, WaitingTaskInput } from '@/features/waiting/types';
import { useWaitingRepository } from './useWaitingRepository';
import { WAITING_QUERY_KEY } from './useWaitingTasks';

interface OptimisticContext {
  previous: WaitingTask[] | undefined;
}

export function useAddWaitingTask() {
  const repo = useWaitingRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: WaitingTaskInput) => {
      if (!repo) throw new Error('repository unavailable');
      return repo.add(input);
    },
    onSuccess: (task) => {
      qc.setQueryData<WaitingTask[]>(WAITING_QUERY_KEY, (old) => [task, ...(old ?? [])]);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: WAITING_QUERY_KEY }),
  });
}

export function useUpdateWaitingTask() {
  const repo = useWaitingRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      systemTaskId,
      input,
    }: {
      systemTaskId: string;
      input: WaitingTaskInput;
    }) => {
      if (!repo) throw new Error('repository unavailable');
      return repo.update(systemTaskId, input);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: WAITING_QUERY_KEY }),
  });
}

export function useToggleWaitingComplete() {
  const repo = useWaitingRepository();
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; completed: boolean }, OptimisticContext>({
    mutationFn: async ({ id, completed }) => {
      if (!repo) throw new Error('repository unavailable');
      await repo.toggleComplete(id, completed);
    },
    onMutate: async ({ id, completed }) => {
      await qc.cancelQueries({ queryKey: WAITING_QUERY_KEY });
      const previous = qc.getQueryData<WaitingTask[]>(WAITING_QUERY_KEY);
      qc.setQueryData<WaitingTask[]>(WAITING_QUERY_KEY, (old) =>
        (old ?? []).map((t) => (t.systemTaskId === id ? { ...t, completed } : t)),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(WAITING_QUERY_KEY, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: WAITING_QUERY_KEY }),
  });
}

export function useRemoveWaitingTask() {
  const repo = useWaitingRepository();
  const qc = useQueryClient();
  return useMutation<void, Error, string, OptimisticContext>({
    mutationFn: async (id) => {
      if (!repo) throw new Error('repository unavailable');
      await repo.remove(id);
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: WAITING_QUERY_KEY });
      const previous = qc.getQueryData<WaitingTask[]>(WAITING_QUERY_KEY);
      qc.setQueryData<WaitingTask[]>(WAITING_QUERY_KEY, (old) =>
        (old ?? []).filter((t) => t.systemTaskId !== id),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(WAITING_QUERY_KEY, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: WAITING_QUERY_KEY }),
  });
}
