import { useMemo } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import { createSheetsClient } from '@/lib/google/sheets';
import { createTasksClient } from '@/lib/google/tasks';
import { createWaitingRepository, type WaitingRepository } from '@/features/waiting/api/waitingRepository';
import { env } from '@/lib/env';

export function useWaitingRepository(): WaitingRepository | null {
  const { client } = useAuth();
  return useMemo(() => {
    if (!client) return null;
    if (!env.taskchuteSpreadsheetId) return null;
    return createWaitingRepository({
      sheets: createSheetsClient(client),
      tasks: createTasksClient(client),
      spreadsheetId: env.taskchuteSpreadsheetId,
    });
  }, [client]);
}
