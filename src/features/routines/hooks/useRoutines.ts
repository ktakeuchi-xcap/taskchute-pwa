import { useQuery } from '@tanstack/react-query';
import { useRoutinesRepository } from './useRoutinesRepository';

export const ROUTINES_QUERY_KEY = ['routines'] as const;

export function useRoutines() {
  const repo = useRoutinesRepository();
  return useQuery({
    queryKey: ROUTINES_QUERY_KEY,
    queryFn: async () => {
      if (!repo) throw new Error('repository unavailable');
      return repo.listRoutines();
    },
    enabled: !!repo,
  });
}
