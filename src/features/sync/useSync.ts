import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import { createSheetsClient } from '@/lib/google/sheets';
import { createCalendarClient } from '@/lib/google/calendar';
import { createTasksClient } from '@/lib/google/tasks';
import { createTaskRepository } from '@/features/tasks/api/taskRepository';
import { env } from '@/lib/env';
import { syncCalendarToSheet } from './syncCalendarToSheet';
import { syncMeetingsToSheet } from './syncMeetingsToSheet';
import { syncWaitingFromTasks } from './syncWaitingFromTasks';
import { releaseSyncLock, tryAcquireSyncLock } from './syncLock';
import { TASKS_QUERY_KEY } from '@/features/tasks/hooks/useTasks';
import { WAITING_QUERY_KEY } from '@/features/waiting/hooks/useWaitingTasks';
import { SYNC_MUTATION_KEY } from './syncMutationKey';
import type { Task } from '@/features/tasks/types';

export interface SyncSummary {
  tasksUpdated: number;
  tasksDeleted: number;
  meetingsAdded: number;
  meetingsUpdated: number;
  meetingsDeleted: number;
  /**
   * Raw Calendar API event count for the meeting window, regardless of
   * whether any of them ended up added/updated — lets a "0 meetings
   * added/updated" result be told apart from "the calendar fetch itself
   * came back empty" (see syncMeetingsToSheet.ts, AppShell.tsx).
   */
  meetingEventsFetched: number;
  waitingUpdated: number;
  waitingCleared: number;
  /**
   * >0 means a "vanished from Calendar" delete pass (ordinary tasks and/or
   * meetings) found a suspiciously large number of rows and skipped the
   * deletion rather than risk mass-deleting real data — see
   * MAX_SAFE_VANISHED_DELETE in syncCalendarToSheet.ts/syncMeetingsToSheet.ts.
   * This should be rare; if it's ever non-zero, something upstream is
   * misidentifying rows as deleted and needs investigating.
   */
  deletionsSkippedForSafety: number;
  /**
   * How many rows this sync recognized as existing meeting rows before
   * deciding what's new — see syncMeetingsToSheet.ts. Stays near 0 across
   * repeated syncs would mean existing rows aren't being recognized as
   * existing, not that events are genuinely new each time.
   */
  existingMeetingRowsFound: number;
}

interface SyncMutationResult extends SyncSummary {
  /**
   * A fresh, authoritative read taken after every write this sync performed
   * has settled — used to replace the tasks cache directly (see onSuccess)
   * instead of merely invalidating it and letting some independently-timed
   * refetch (the 30s poll, a window-focus refetch) race the tail end of our
   * own writes. See useTasks.ts for why an ordinary read can transiently
   * miss a row mid-write.
   */
  finalTasks: Task[];
}

export function useSync() {
  const { client } = useAuth();
  const qc = useQueryClient();
  const deps = useMemo(() => {
    if (!client) return null;
    if (!env.taskchuteSpreadsheetId || !env.taskchuteCalendarId) return null;
    const sheets = createSheetsClient(client);
    const calendar = createCalendarClient(client);
    const spreadsheetId = env.taskchuteSpreadsheetId;
    const calendarId = env.taskchuteCalendarId;
    return {
      sheets,
      calendar,
      tasks: createTasksClient(client),
      spreadsheetId,
      calendarId,
      meetingCalendarId: env.meetingCalendarId,
      taskRepository: createTaskRepository({ sheets, calendar, spreadsheetId, calendarId }),
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
  const inFlightRef = useRef<Promise<SyncMutationResult> | null>(null);

  return useMutation<SyncMutationResult, Error, void>({
    mutationKey: SYNC_MUTATION_KEY,
    mutationFn: async () => {
      if (inFlightRef.current) return inFlightRef.current;

      const run = (async () => {
        if (!deps) throw new Error('not authenticated');
        const empty: SyncMutationResult = {
          tasksUpdated: 0,
          tasksDeleted: 0,
          meetingsAdded: 0,
          meetingsUpdated: 0,
          meetingsDeleted: 0,
          meetingEventsFetched: 0,
          waitingUpdated: 0,
          waitingCleared: 0,
          deletionsSkippedForSafety: 0,
          existingMeetingRowsFound: 0,
          finalTasks: qc.getQueryData<Task[]>(TASKS_QUERY_KEY) ?? [],
        };

        // The in-flight guard above only coalesces calls within this one
        // browser tab/process — it can't see another device or tab running
        // its own independent auto-sync loop. This spreadsheet-backed lock
        // covers that case: if another device claimed it recently, skip this
        // run entirely rather than racing it (see syncLock.ts for details).
        const acquired = await tryAcquireSyncLock(deps.sheets, deps.spreadsheetId, new Date());
        if (!acquired) return empty;

        try {
          // syncCalendarToSheet and syncMeetingsToSheet both mutate TaskDB by
          // row number computed from their own snapshot of the sheet.
          // Running them concurrently let one's row deletions shift
          // positions out from under the other's stale row numbers,
          // occasionally deleting the wrong rows (meeting tasks would
          // vanish). They must run one at a time; the WaitingList sync
          // touches a different sheet and stays parallel.
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
            : {
                addedCount: 0,
                updatedCount: 0,
                deletedCount: 0,
                eventsFetched: 0,
                deletionsSkippedForSafety: 0,
                existingMeetingRowsFound: 0,
              };

          // Taken after every write above has settled, still under the lock
          // so no other device's sync can interleave a write before we
          // capture it — this becomes the new cache value directly (see
          // onSuccess), not just a trigger for yet another independently-
          // timed read.
          const finalTasks = await deps.taskRepository.listTasks();

          return {
            tasksUpdated: cal.updatedCount,
            tasksDeleted: cal.deletedCount,
            meetingsAdded: meetings.addedCount,
            meetingsUpdated: meetings.updatedCount,
            meetingsDeleted: meetings.deletedCount,
            meetingEventsFetched: meetings.eventsFetched,
            waitingUpdated: wait.updatedCount,
            waitingCleared: wait.clearedCount,
            deletionsSkippedForSafety:
              cal.deletionsSkippedForSafety + meetings.deletionsSkippedForSafety,
            existingMeetingRowsFound: meetings.existingMeetingRowsFound,
            finalTasks,
          };
        } finally {
          await releaseSyncLock(deps.sheets, deps.spreadsheetId).catch(() => {});
        }
      })();

      inFlightRef.current = run;
      try {
        return await run;
      } finally {
        inFlightRef.current = null;
      }
    },
    onSuccess: (result) => {
      qc.setQueryData(TASKS_QUERY_KEY, result.finalTasks);
      qc.invalidateQueries({ queryKey: WAITING_QUERY_KEY });
    },
  });
}
