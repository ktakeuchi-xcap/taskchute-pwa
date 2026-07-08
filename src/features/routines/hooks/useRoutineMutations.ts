import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RoutineInput } from '@/features/routines/api/routinesRepository';
import { useRoutinesRepository } from './useRoutinesRepository';
import { ROUTINES_QUERY_KEY } from './useRoutines';

export function useAddRoutine() {
  const repo = useRoutinesRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RoutineInput) => {
      if (!repo) throw new Error('repository unavailable');
      return repo.addRoutine(input);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ROUTINES_QUERY_KEY }),
  });
}

export function useUpdateRoutine() {
  const repo = useRoutinesRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ rowNumber, input }: { rowNumber: number; input: RoutineInput }) => {
      if (!repo) throw new Error('repository unavailable');
      return repo.updateRoutine(rowNumber, input);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ROUTINES_QUERY_KEY }),
  });
}

export function useDeleteRoutine() {
  const repo = useRoutinesRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rowNumber: number) => {
      if (!repo) throw new Error('repository unavailable');
      return repo.deleteRoutine(rowNumber);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ROUTINES_QUERY_KEY }),
  });
}
