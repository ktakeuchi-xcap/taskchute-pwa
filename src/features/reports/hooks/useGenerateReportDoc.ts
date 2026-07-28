import { useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/useAuth';
import { createDocsClient } from '@/lib/google/docs';
import { createDriveClient } from '@/lib/google/drive';
import {
  generateReportDoc,
  type GeneratedReportDoc,
} from '@/features/reports/api/generateReportDoc';
import type { ReportDocContent } from '@/features/reports/reportData';

export function useGenerateReportDoc() {
  const { client } = useAuth();
  const deps = useMemo(() => {
    if (!client) return null;
    return { docs: createDocsClient(client), drive: createDriveClient(client) };
  }, [client]);

  return useMutation<GeneratedReportDoc, Error, { content: ReportDocContent; folderId: string }>({
    mutationFn: async ({ content, folderId }) => {
      if (!deps) throw new Error('repository unavailable');
      return generateReportDoc(deps, content, folderId);
    },
  });
}
