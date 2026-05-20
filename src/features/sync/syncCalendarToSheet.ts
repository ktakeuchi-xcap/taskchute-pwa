import { addDays } from 'date-fns';
import type { CalendarClient } from '@/lib/google/calendar';
import type { SheetsClient, ValueRange } from '@/lib/google/sheets';
import {
  TASKDB_HEADERS,
  TASKDB_SHEET,
  buildHeaderIndex,
} from '@/features/tasks/api/headers';
import {
  parseEventTitle,
  parseTaskDbRows,
} from '@/features/tasks/api/serializers';
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
 * back into the TaskDB sheet. Status=Done rows are treated as immutable.
 */
export async function syncCalendarToSheet(
  deps: SyncCalendarDeps,
): Promise<SyncCalendarResult> {
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
    sheetTasks
      .filter((t) => t.task.calendarEventId)
      .map((t) => [t.task.calendarEventId, t]),
  );

  const updates: ValueRange[] = [];
  let updatedCount = 0;

  for (const event of events) {
    const sheetTask = sheetByEventId.get(event.id);
    if (!sheetTask) continue;
    if (sheetTask.task.status === TaskStatus.Done) continue;

    const { taskName: calName, category: calCat } = parseEventTitle(event.summary);
    const newEstimate = Math.round(
      (event.end.getTime() - event.start.getTime()) / 60_000,
    );

    const titleChanged =
      sheetTask.task.taskName !== calName ||
      sheetTask.task.category !== calCat;
    const startChanged =
      sheetTask.task.scheduledStartTime.getTime() !== event.start.getTime();
    const endChanged =
      sheetTask.task.scheduledEndTime.getTime() !== event.end.getTime();

    if (!(titleChanged || startChanged || endChanged)) continue;

    const row = sheetTask.rowNumber;
    if (titleChanged) {
      updates.push(
        {
          range: `${TASKDB_SHEET}!${columnLetter(idx.TaskName + 1)}${row}`,
          values: [[calName]],
        },
        {
          range: `${TASKDB_SHEET}!${columnLetter(idx.Category + 1)}${row}`,
          values: [[calCat ?? '']],
        },
      );
    }
    if (startChanged) {
      updates.push({
        range: `${TASKDB_SHEET}!${columnLetter(idx.ScheduledStartTime + 1)}${row}`,
        values: [[formatDateForSheet(event.start)]],
      });
    }
    if (endChanged) {
      updates.push({
        range: `${TASKDB_SHEET}!${columnLetter(idx.ScheduledEndTime + 1)}${row}`,
        values: [[formatDateForSheet(event.end)]],
      });
    }
    if (startChanged || endChanged) {
      updates.push({
        range: `${TASKDB_SHEET}!${columnLetter(idx.EstimateMinutes + 1)}${row}`,
        values: [[newEstimate]],
      });
    }
    updatedCount += 1;
  }

  if (updates.length > 0) {
    await sheets.batchUpdateValues(spreadsheetId, updates);
  }

  return { updatedCount, windowStart, windowEnd };
}
