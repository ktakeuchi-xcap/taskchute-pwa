import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import { createSheetsClient } from '@/lib/google/sheets';
import { createCalendarClient } from '@/lib/google/calendar';
import { createTasksClient } from '@/lib/google/tasks';
import { env } from '@/lib/env';
import { syncCalendarToSheet } from './syncCalendarToSheet';
import { syncMeetingsToSheet } from './syncMeetingsToSheet';
import { syncWaitingFromTasks } from './syncWaitingFromTasks';
import { TASKS_QUERY_KEY } from '@/features/tasks/hooks/useTasks';
import { WAITING_QUERY_KEY } from '@/features/waiting/hooks/useWaitingTasks';

export interface SyncSummary {
  tasksUpdated: number;
  tasksDeleted: number;
  meetingsAdded: number;
  meetingsUpdated: number;
  meetingsDeleted: number;
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
      meetingCalendarId: env.meetingCalendarId,
    };
  }, [client]);

  // useAutoSync fires this mutation from several independent triggers (mount,
  // a 30s interval, tab-visibility changes) and the manual "同期" button can
  // fire it too — with nothing else guarding against overlap, two runs firing
  // close together would each read TaskDB before the other's writes landed,
  // and then race to append/delete rows from that stale snapshot (duplicate
  // meetings on insert, wrong rows removed on delete). Coalescing concurrent
  // calls into the single in-flight run makes "at most one sync at a time"
  // an actual invariant instead of a lucky timing coincidence.
  const inFlightRef = useRef<Promise<SyncSummary> | null>(null);

  return useMutation<SyncSummary, Error, void>({
    mutationFn: async () => {
      if (inFlightRef.current) return inFlightRef.current;

      const run = (async () => {
        if (!deps) throw new Error('not authenticated');
        // syncCalendarToSheet and syncMeetingsToSheet both mutate TaskDB by
        // row number computed from their own snapshot of the sheet. Running
        // them concurrently let one's row deletions shift positions out from
        // under the other's stale row numbers, occasionally deleting the
        // wrong rows (meeting tasks would vanish). They must run one at a
        // time; the WaitingList sync touches a different sheet and stays
        // parallel.
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
        const meetings = deps.meetingCalendarId
          ? await syncMeetingsToSheet({
              sheets: deps.sheets,
              calendar: deps.calendar,
              spreadsheetId: deps.spreadsheetId,
              meetingCalendarId: deps.meetingCalendarId,
            })
          : { addedCount: 0, updatedCount: 0, deletedCount: 0 };
        return {
          tasksUpdated: cal.updatedCount,
          tasksDeleted: cal.deletedCount,
          meetingsAdded: meetings.addedCount,
          meetingsUpdated: meetings.updatedCount,
          meetingsDeleted: meetings.deletedCount,
          waitingUpdated: wait.updatedCount,
          waitingCleared: wait.clearedCount,
        };
      })();

      inFlightRef.current = run;
      try {
        return await run;
      } finally {
        inFlightRef.current = null;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: WAITING_QUERY_KEY });
    },
  });
}
