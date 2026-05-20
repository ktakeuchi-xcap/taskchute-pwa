import { useQuery } from '@tanstack/react-query';
import { useWaitingRepository } from './useWaitingRepository';

export const WAITING_QUERY_KEY = ['waiting'] as const;

export function useWaitingTasks() {
  const repo = useWaitingRepository();
  return useQuery({
    queryKey: WAITING_QUERY_KEY,
    queryFn: async () => {
      if (!repo) throw new Error('repository unavailable');
      return repo.list();
    },
    enabled: !!repo,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
