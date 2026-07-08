import { useMemo } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import { createSheetsClient } from '@/lib/google/sheets';
import {
  createRoutinesRepository,
  type RoutinesRepository,
} from '@/features/routines/api/routinesRepository';
import { env } from '@/lib/env';

export function useRoutinesRepository(): RoutinesRepository | null {
  const { client } = useAuth();
  return useMemo(() => {
    if (!client) return null;
    if (!env.taskchuteSpreadsheetId) return null;
    return createRoutinesRepository({
      sheets: createSheetsClient(client),
      spreadsheetId: env.taskchuteSpreadsheetId,
    });
  }, [client]);
}
