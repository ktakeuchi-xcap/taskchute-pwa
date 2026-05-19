import { useQuery } from '@tanstack/react-query';
import { useTaskRepository } from './useTaskRepository';

export function useCategories() {
  const repo = useTaskRepository();
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      if (!repo) throw new Error('repository unavailable');
      return repo.listCategories();
    },
    enabled: !!repo,
    staleTime: 5 * 60_000,
  });
}
