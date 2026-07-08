import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import { createSheetsClient } from '@/lib/google/sheets';
import { createCalendarClient } from '@/lib/google/calendar';
import { createTasksClient } from '@/lib/google/tasks';
import { env } from '@/lib/env';
import { syncCalendarToSheet } from './syncCalendarToSheet';
import { syncWaitingFromTasks } from './syncWaitingFromTasks';
import { TASKS_QUERY_KEY } from '@/features/tasks/hooks/useTasks';
import { WAITING_QUERY_KEY } from '@/features/waiting/hooks/useWaitingTasks';

export interface SyncSummary {
  tasksUpdated: number;
  tasksDeleted: number;
  waitingUpdated: number;
  waitingCleared: number;
}

export function useSync() {
  const { client } = useAuth();
  const qc = useQueryClient();
  const deps = useMemo(() => {
    if (!client) return null;
    if (!env.taskchuteSpreadsheetId || !env.taskchuteCalendarId) return null;
    return {
      sheets: createSheetsClient(client),
      calendar: createCalendarClient(client),
      tasks: createTasksClient(client),
      spreadsheetId: env.taskchuteSpreadsheetId,
      calendarId: env.taskchuteCalendarId,
    };
  }, [client]);

  return useMutation<SyncSummary, Error, void>({
    mutationFn: async () => {
      if (!deps) throw new Error('not authenticated');
      const [cal, wait] = await Promise.all([
        syncCalendarToSheet({
          sheets: deps.sheets,
          calendar: deps.calendar,
          spreadsheetId: deps.spreadsheetId,
          calendarId: deps.calendarId,
        }),
        syncWaitingFromTasks({
          sheets: deps.sheets,
          tasks: deps.tasks,
          spreadsheetId: deps.spreadsheetId,
        }),
      ]);
      return {
        tasksUpdated: cal.updatedCount,
        tasksDeleted: cal.deletedCount,
        waitingUpdated: wait.updatedCount,
        waitingCleared: wait.clearedCount,
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: WAITING_QUERY_KEY });
    },
  });
}
