import type { WaitingTask } from '@/features/waiting/types';
import { formatDateForSheet, parseSheetDateCell } from '@/lib/google/sheetDate';
import { buildHeaderIndex } from '@/features/tasks/api/headers';
import { WAITING_HEADERS } from './headers';

export interface WaitingWithRow {
  task: WaitingTask;
  rowNumber: number;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
}

export function parseWaitingRows(values: unknown[][]): WaitingWithRow[] {
  if (values.length === 0) return [];
  const [headerRow, ...rows] = values;
  if (!headerRow) return [];
  const idx = buildHeaderIndex(headerRow, WAITING_HEADERS);

  const out: WaitingWithRow[] = [];
  rows.forEach((row, i) => {
    const systemTaskId = asString(row[idx.SystemTaskID]);
    if (!systemTaskId) return;
    const delegatedDate = parseSheetDateCell(row[idx.DelegatedDate]);
    if (!delegatedDate) return;
    const waitingFor = asString(row[idx.WaitingFor]);
    out.push({
      rowNumber: i + 2,
      task: {
        systemTaskId,
        taskName: asString(row[idx.TaskName]),
        waitingFor: waitingFor.length === 0 ? null : waitingFor,
        delegatedDate,
        followUpDate: parseSheetDateCell(row[idx.FollowUpDate]),
        googleTaskId: asString(row[idx.GoogleTaskID]),
        completed: false, // status not stored in sheet; set by syncer from Google Tasks
      },
    });
  });
  return out;
}

export function buildWaitingRow(headerRow: unknown[], task: WaitingTask): unknown[] {
  const idx = buildHeaderIndex(headerRow, WAITING_HEADERS);
  const row = new Array<unknown>(headerRow.length).fill('');
  row[idx.SystemTaskID] = task.systemTaskId;
  row[idx.TaskName] = task.taskName;
  row[idx.WaitingFor] = task.waitingFor ?? '';
  row[idx.DelegatedDate] = formatDateForSheet(task.delegatedDate);
  row[idx.FollowUpDate] = task.followUpDate ? formatDateForSheet(task.followUpDate) : '';
  row[idx.GoogleTaskID] = task.googleTaskId;
  return row;
}
