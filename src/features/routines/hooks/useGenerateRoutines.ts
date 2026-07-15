import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import { createSheetsClient } from '@/lib/google/sheets';
import { createCalendarClient } from '@/lib/google/calendar';
import { generateNextWeekRoutines } from '@/features/routines/api/routineGenerator';
import { env } from '@/lib/env';
import { TASKS_QUERY_KEY, useIsSyncing } from '@/features/tasks/hooks/useTasks';

export function useGenerateRoutines() {
  const { client } = useAuth();
  const qc = useQueryClient();
  const isSyncing = useIsSyncing();
  const deps = useMemo(() => {
    if (!client) return null;
    if (!env.taskchuteSpreadsheetId || !env.taskchuteCalendarId) return null;
    return {
      sheets: createSheetsClient(client),
      calendar: createCalendarClient(client),
      spreadsheetId: env.taskchuteSpreadsheetId,
      calendarId: env.taskchuteCalendarId,
    };
  }, [client]);

  return useMutation({
    mutationFn: async () => {
      if (!deps) throw new Error('repository unavailable');
      return generateNextWeekRoutines(deps);
    },
    onSuccess: () => {
      // See useTaskMutations.ts — skip the forced refetch while a sync is in
      // flight; its own authoritative read will cover this once it settles.
      if (!isSyncing) qc.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
    },
  });
}
