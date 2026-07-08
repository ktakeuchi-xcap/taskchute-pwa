import { useQuery } from '@tanstack/react-query';
import { useTaskRepository } from './useTaskRepository';

export const CATEGORIES_QUERY_KEY = ['categories'] as const;

export function useCategories() {
  const repo = useTaskRepository();
  return useQuery({
    queryKey: CATEGORIES_QUERY_KEY,
    queryFn: async () => {
      if (!repo) throw new Error('repository unavailable');
      return repo.listCategories();
    },
    enabled: !!repo,
    staleTime: 5 * 60_000,
  });
}
