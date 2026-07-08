import { addDays } from 'date-fns';
import type { CalendarClient } from '@/lib/google/calendar';
import type { SheetsClient, ValueRange } from '@/lib/google/sheets';
import { TASKDB_HEADERS, TASKDB_SHEET, buildHeaderIndex } from '@/features/tasks/api/headers';
import { parseEventTitle, parseTaskDbRows } from '@/features/tasks/api/serializers';
import { formatDateForSheet } from '@/lib/google/sheetDate';
import { TaskStatus } from '@/features/tasks/types';

const SYNC_WINDOW_DAYS = 15;

export interface SyncCalendarDeps {
  sheets: SheetsClient;
  calendar: CalendarClient;
  spreadsheetId: string;
  calendarId: string;
  now?: () => Date;
}

export interface SyncCalendarResult {
  updatedCount: number;
  windowStart: Date;
  windowEnd: Date;
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
 * Pull recent (±15d) Calendar events and reconcile any title / time changes
 * back into the TaskDB sheet.
 *
 * Status=Done rows are handled differently: `endTask` already patches the
 * Calendar event's start/end to the *actual* execution times, so a manual
 * edit on a completed event means "correct the actual record", not "change
 * the original plan". Their title/time edits are written to
 * ActualStartTime/ActualEndTime instead of Scheduled*, and the estimate is
 * left untouched (it's the plan, not the outcome).
 */
export async function syncCalendarToSheet(deps: SyncCalendarDeps): Promise<SyncCalendarResult> {
  const { sheets, calendar, spreadsheetId, calendarId } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const windowStart = addDays(now, -SYNC_WINDOW_DAYS);
  const windowEnd = addDays(now, SYNC_WINDOW_DAYS);

  const [sheetValues, events] = await Promise.all([
    sheets.getValues(spreadsheetId, TASKDB_SHEET),
    calendar.list(calendarId, windowStart, windowEnd),
  ]);
  if (sheetValues.length === 0) {
    return { updatedCount: 0, windowStart, windowEnd };
  }
  const headerRow = sheetValues[0]!;
  const idx = buildHeaderIndex(headerRow, TASKDB_HEADERS);
  const sheetTasks = parseTaskDbRows(sheetValues);

  const sheetByEventId = new Map(
    sheetTasks.filter((t) => t.task.calendarEventId).map((t) => [t.task.calendarEventId, t]),
  );

  const cellRange = (col0Based: number, row: number) =>
    `${TASKDB_SHEET}!${columnLetter(col0Based + 1)}${row}`;

  const updates: ValueRange[] = [];
  let updatedCount = 0;

  for (const event of events) {
    const sheetTask = sheetByEventId.get(event.id);
    if (!sheetTask) continue;

    const isDone = sheetTask.task.status === TaskStatus.Done;
    const { taskName: calName, category: calCat } = parseEventTitle(event.summary);
    const titleChanged = sheetTask.task.taskName !== calName || sheetTask.task.category !== calCat;

    const row = sheetTask.rowNumber;
    const rowUpdates: ValueRange[] = [];

    if (titleChanged) {
      rowUpdates.push(
        { range: cellRange(idx.TaskName, row), values: [[calName]] },
        { range: cellRange(idx.Category, row), values: [[calCat ?? '']] },
      );
    }

    if (isDone) {
      const currentStart = sheetTask.task.actualStartTime ?? sheetTask.task.scheduledStartTime;
      const currentEnd = sheetTask.task.actualEndTime ?? sheetTask.task.scheduledEndTime;
      if (currentStart.getTime() !== event.start.getTime()) {
        rowUpdates.push({
          range: cellRange(idx.ActualStartTime, row),
          values: [[formatDateForSheet(event.start)]],
        });
      }
      if (currentEnd.getTime() !== event.end.getTime()) {
        rowUpdates.push({
          range: cellRange(idx.ActualEndTime, row),
          values: [[formatDateForSheet(event.end)]],
        });
      }
    } else {
      const startChanged = sheetTask.task.scheduledStartTime.getTime() !== event.start.getTime();
      const endChanged = sheetTask.task.scheduledEndTime.getTime() !== event.end.getTime();
      if (startChanged) {
        rowUpdates.push({
          range: cellRange(idx.ScheduledStartTime, row),
          values: [[formatDateForSheet(event.start)]],
        });
      }
      if (endChanged) {
        rowUpdates.push({
          range: cellRange(idx.ScheduledEndTime, row),
          values: [[formatDateForSheet(event.end)]],
        });
      }
      if (startChanged || endChanged) {
        const newEstimate = Math.round((event.end.getTime() - event.start.getTime()) / 60_000);
        rowUpdates.push({ range: cellRange(idx.EstimateMinutes, row), values: [[newEstimate]] });
      }
    }

    if (rowUpdates.length === 0) continue;
    updates.push(...rowUpdates);
    updatedCount += 1;
  }

  if (updates.length > 0) {
    await sheets.batchUpdateValues(spreadsheetId, updates);
  }

  return { updatedCount, windowStart, windowEnd };
}
