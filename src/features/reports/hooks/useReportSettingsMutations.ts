import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/useAuth';
import { createSheetsClient } from '@/lib/google/sheets';
import { env } from '@/lib/env';
import {
  deleteReportSetting,
  upsertReportSetting,
  type ReportSetting,
} from '@/features/reports/api/reportSettingsRepository';
import { REPORT_SETTINGS_QUERY_KEY } from './useReportSettings';

function useReportSettingsSheets() {
  const { client } = useAuth();
  return useMemo(() => (client ? createSheetsClient(client) : null), [client]);
}

export function useUpsertReportSetting() {
  const sheets = useReportSettingsSheets();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (setting: ReportSetting) => {
      if (!sheets || !env.taskchuteSpreadsheetId) throw new Error('repository unavailable');
      await upsertReportSetting(sheets, env.taskchuteSpreadsheetId, setting);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: REPORT_SETTINGS_QUERY_KEY }),
  });
}

export function useDeleteReportSetting() {
  const sheets = useReportSettingsSheets();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (category: string) => {
      if (!sheets || !env.taskchuteSpreadsheetId) throw new Error('repository unavailable');
      await deleteReportSetting(sheets, env.taskchuteSpreadsheetId, category);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: REPORT_SETTINGS_QUERY_KEY }),
  });
}
