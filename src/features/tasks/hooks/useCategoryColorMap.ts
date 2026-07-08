import { useMemo } from 'react';
import { useCategories } from './useCategories';

/** Map of category name -> color key, resolved from the (cached) category master list. */
export function useCategoryColorMap(): Map<string, string | null> {
  const categoriesQuery = useCategories();
  return useMemo(() => {
    const map = new Map<string, string | null>();
    for (const c of categoriesQuery.data ?? []) {
      map.set(c.name, c.color);
    }
    return map;
  }, [categoriesQuery.data]);
}
