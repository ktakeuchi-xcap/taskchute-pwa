import type { SheetsClient, ValueRange } from '@/lib/google/sheets';
import { type TasksClient, parseWaitingTitle } from '@/lib/google/tasks';
import { buildHeaderIndex } from '@/features/tasks/api/headers';
import { WAITING_HEADERS, WAITING_SHEET } from '@/features/waiting/api/headers';
import { parseWaitingRows } from '@/features/waiting/api/serializers';
import { formatDateForSheet } from '@/lib/google/sheetDate';

export interface SyncWaitingDeps {
  sheets: SheetsClient;
  tasks: TasksClient;
  spreadsheetId: string;
}

export interface SyncWaitingResult {
  updatedCount: number;
  clearedCount: number;
}

function columnLetter(col1Based: number): string {
  let n = col1Based;
  let out = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    out = String.fromCharCode(65 + m) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * Pull every task from Google Tasks (@default), reconcile titles and due dates
 * back into the WaitingList sheet, and clear rows whose Google Task no longer
 * exists. Row deletion is done by emptying the cells in a single batchUpdate —
 * avoids the classic "delete during iteration" bug from the GAS version.
 */
export async function syncWaitingFromTasks(deps: SyncWaitingDeps): Promise<SyncWaitingResult> {
  const { sheets, tasks, spreadsheetId } = deps;

  const [sheetValues, googleTasks] = await Promise.all([
    sheets.getValues(spreadsheetId, WAITING_SHEET),
    tasks.list(),
  ]);
  if (sheetValues.length === 0) {
    return { updatedCount: 0, clearedCount: 0 };
  }
  const headerRow = sheetValues[0]!;
  const idx = buildHeaderIndex(headerRow, WAITING_HEADERS);
  const sheetTasks = parseWaitingRows(sheetValues);
  const googleMap = new Map(googleTasks.map((t) => [t.id, t]));

  const updates: ValueRange[] = [];
  const rowsToClear: number[] = [];
  let updatedCount = 0;

  for (const sheetTask of sheetTasks) {
    const googleTask = sheetTask.task.googleTaskId
      ? googleMap.get(sheetTask.task.googleTaskId)
      : undefined;

    if (!googleTask) {
      rowsToClear.push(sheetTask.rowNumber);
      continue;
    }

    const parsed = parseWaitingTitle(googleTask.title);
    const googleDueMs = googleTask.due?.getTime() ?? null;
    const sheetDueMs = sheetTask.task.followUpDate?.getTime() ?? null;
    const titleChanged =
      sheetTask.task.taskName !== parsed.taskName ||
      sheetTask.task.waitingFor !== parsed.waitingFor;
    const dueChanged = googleDueMs !== sheetDueMs;
    if (!(titleChanged || dueChanged)) continue;

    const row = sheetTask.rowNumber;
    if (titleChanged) {
      updates.push(
        {
          range: `${WAITING_SHEET}!${columnLetter(idx.TaskName + 1)}${row}`,
          values: [[parsed.taskName]],
        },
        {
          range: `${WAITING_SHEET}!${columnLetter(idx.WaitingFor + 1)}${row}`,
          values: [[parsed.waitingFor ?? '']],
        },
      );
    }
    if (dueChanged) {
      updates.push({
        range: `${WAITING_SHEET}!${columnLetter(idx.FollowUpDate + 1)}${row}`,
        values: [[googleTask.due ? formatDateForSheet(googleTask.due) : '']],
      });
    }
    updatedCount += 1;
  }

  if (rowsToClear.length > 0) {
    const headers = Object.keys(WAITING_HEADERS).length;
    for (const row of rowsToClear) {
      for (let col = 1; col <= headers; col += 1) {
        updates.push({
          range: `${WAITING_SHEET}!${columnLetter(col)}${row}`,
          values: [['']],
        });
      }
    }
  }

  if (updates.length > 0) {
    await sheets.batchUpdateValues(spreadsheetId, updates);
  }

  return { updatedCount, clearedCount: rowsToClear.length };
}
