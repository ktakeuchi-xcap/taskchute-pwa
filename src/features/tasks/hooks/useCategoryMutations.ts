import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTaskRepository } from './useTaskRepository';
import { CATEGORIES_QUERY_KEY } from './useCategories';

export function useAddCategory() {
  const repo = useTaskRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      if (!repo) throw new Error('repository unavailable');
      return repo.addCategory(name, color);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY }),
  });
}

export function useUpdateCategory() {
  const repo = useTaskRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      oldName,
      newName,
      color,
    }: {
      oldName: string;
      newName: string;
      color: string;
    }) => {
      if (!repo) throw new Error('repository unavailable');
      return repo.updateCategory(oldName, newName, color);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY }),
  });
}

export function useDeleteCategory() {
  const repo = useTaskRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      if (!repo) throw new Error('repository unavailable');
      return repo.deleteCategory(name);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY }),
  });
}
