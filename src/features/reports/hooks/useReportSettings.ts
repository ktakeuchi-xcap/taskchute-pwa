import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/useAuth';
import { createSheetsClient } from '@/lib/google/sheets';
import { env } from '@/lib/env';
import { listReportSettings } from '@/features/reports/api/reportSettingsRepository';

export const REPORT_SETTINGS_QUERY_KEY = ['reportSettings'] as const;

export function useReportSettings() {
  const { client } = useAuth();
  const sheets = useMemo(() => (client ? createSheetsClient(client) : null), [client]);

  return useQuery({
    queryKey: REPORT_SETTINGS_QUERY_KEY,
    queryFn: async () => {
      if (!sheets || !env.taskchuteSpreadsheetId) throw new Error('repository unavailable');
      return listReportSettings(sheets, env.taskchuteSpreadsheetId);
    },
    enabled: !!sheets && !!env.taskchuteSpreadsheetId,
    staleTime: 5 * 60_000,
  });
}
