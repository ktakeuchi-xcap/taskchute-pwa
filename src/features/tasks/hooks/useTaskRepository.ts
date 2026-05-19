import { useMemo } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import { createSheetsClient } from '@/lib/google/sheets';
import { createCalendarClient } from '@/lib/google/calendar';
import { createTaskRepository, type TaskRepository } from '@/features/tasks/api/taskRepository';
import { env } from '@/lib/env';

/**
 * Build a TaskRepository bound to the current AuthClient.
 * Returns null when auth or env isn't ready — callers should gate query.enabled on this.
 */
export function useTaskRepository(): TaskRepository | null {
  const { client } = useAuth();
  return useMemo(() => {
    if (!client) return null;
    if (!env.taskchuteSpreadsheetId || !env.taskchuteCalendarId) return null;
    return createTaskRepository({
      sheets: createSheetsClient(client),
      calendar: createCalendarClient(client),
      spreadsheetId: env.taskchuteSpreadsheetId,
      calendarId: env.taskchuteCalendarId,
    });
  }, [client]);
}
