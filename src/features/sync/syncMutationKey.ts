/**
 * Shared between useSync.ts (which sets this as its mutationKey) and
 * useTasks.ts (which reads it via useIsMutating to pause its own polling
 * while a sync is in flight) — kept in its own module so the two hooks
 * don't need to import from each other.
 */
export const SYNC_MUTATION_KEY = ['sync'] as const;
