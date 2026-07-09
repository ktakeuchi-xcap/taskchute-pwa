import { addDays } from 'date-fns';
import type { CalendarClient, CalendarEvent } from '@/lib/google/calendar';
import type { SheetsClient, ValueRange } from '@/lib/google/sheets';
import { TASKDB_HEADERS, TASKDB_SHEET, buildHeaderIndex } from '@/features/tasks/api/headers';
import { buildTaskRow, parseTaskDbRows } from '@/features/tasks/api/serializers';
import { listMeetingCategoryRules } from '@/features/tasks/api/meetingCategoryRules';
import { formatDateForSheet } from '@/lib/google/sheetDate';
import { TaskSource, TaskStatus, type Task } from '@/features/tasks/types';

const SYNC_WINDOW_DAYS = 15;
const SOURCE_HEADER = 'Source';

export interface SyncMeetingsDeps {
  sheets: SheetsClient;
  calendar: CalendarClient;
  spreadsheetId: string;
  meetingCalendarId: string;
  now?: () => Date;
  generateId?: () => string;
}

export interface SyncMeetingsResult {
  addedCount: number;
  updatedCount: number;
  deletedCount: number;
}

function defaultGenerateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tid-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
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

function isDeclinedBySelf(event: CalendarEvent): boolean {
  return event.selfResponseStatus === 'declined';
}

// All-day events get 0 estimate so they never skew the workload gauge or
// the 案件別月間工数 dashboard — they're shown for visibility only.
function estimateMinutesFor(event: CalendarEvent): number {
  if (event.isAllDay) return 0;
  return Math.max(0, Math.round((event.end.getTime() - event.start.getTime()) / 60_000));
}

/**
 * One-way (Calendar -> Sheet) sync for the user's personal meeting calendar.
 * Never patches or deletes anything on the Calendar side — meeting tasks are
 * read-only from the app (see meetingStatus.ts for how their status is
 * derived, and TaskRow.tsx for why they have no edit/delete/start/end UI).
 *
 * Requires a "Source" column in the TaskDB header row to tell meeting rows
 * apart from ordinary ones; if that column isn't there yet this is a no-op
 * (rather than re-appending every meeting on every sync) so the app degrades
 * gracefully until the column is added.
 */
export async function syncMeetingsToSheet(deps: SyncMeetingsDeps): Promise<SyncMeetingsResult> {
  const { sheets, calendar, spreadsheetId, meetingCalendarId } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const generateId = deps.generateId ?? defaultGenerateId;
  const windowStart = addDays(now, -SYNC_WINDOW_DAYS);
  const windowEnd = addDays(now, SYNC_WINDOW_DAYS);

  const [sheetValues, events] = await Promise.all([
    sheets.getValues(spreadsheetId, TASKDB_SHEET),
    calendar.list(meetingCalendarId, windowStart, windowEnd),
  ]);
  if (sheetValues.length === 0) {
    return { addedCount: 0, updatedCount: 0, deletedCount: 0 };
  }
  const headerRow = sheetValues[0]!;
  const sourceCol = headerRow.findIndex((cell) => cell === SOURCE_HEADER);
  if (sourceCol === -1) {
    return { addedCount: 0, updatedCount: 0, deletedCount: 0 };
  }
  const idx = buildHeaderIndex(headerRow, TASKDB_HEADERS);
  const meetingTasks = parseTaskDbRows(sheetValues).filter(
    (t) => t.task.source === TaskSource.Meeting,
  );
  const rules = await listMeetingCategoryRules(sheets, spreadsheetId);
  const ruleBySeriesId = new Map(rules.map((r) => [r.recurringEventId, r]));

  const byEventId = new Map(meetingTasks.map((t) => [t.task.calendarEventId, t]));
  const qualifyingEvents = events.filter((e) => !isDeclinedBySelf(e));
  const qualifyingEventIds = new Set(qualifyingEvents.map((e) => e.id));

  const cellRange = (col0Based: number, row: number) =>
    `${TASKDB_SHEET}!${columnLetter(col0Based + 1)}${row}`;

  const updates: ValueRange[] = [];
  const rowsToAppend: unknown[][] = [];
  let updatedCount = 0;

  for (const event of qualifyingEvents) {
    const existing = byEventId.get(event.id);
    const estimateMinutes = estimateMinutesFor(event);

    if (!existing) {
      const seriesId = event.recurringEventId ?? event.id;
      const rule = ruleBySeriesId.get(seriesId);
      const category =
        rule &&
        (!rule.effectiveFromDate || event.start.getTime() >= rule.effectiveFromDate.getTime())
          ? rule.category
          : null;
      const task: Task = {
        taskId: generateId(),
        taskName: event.summary,
        category,
        estimateMinutes,
        scheduledStartTime: event.start,
        scheduledEndTime: event.end,
        actualStartTime: null,
        actualEndTime: null,
        status: TaskStatus.NotStarted,
        calendarEventId: event.id,
        source: TaskSource.Meeting,
        recurringEventId: seriesId,
      };
      rowsToAppend.push(buildTaskRow(headerRow, task));
      continue;
    }

    const row = existing.rowNumber;
    const rowUpdates: ValueRange[] = [];
    if (existing.task.taskName !== event.summary) {
      rowUpdates.push({ range: cellRange(idx.TaskName, row), values: [[event.summary]] });
    }
    if (existing.task.scheduledStartTime.getTime() !== event.start.getTime()) {
      rowUpdates.push({
        range: cellRange(idx.ScheduledStartTime, row),
        values: [[formatDateForSheet(event.start)]],
      });
    }
    if (existing.task.scheduledEndTime.getTime() !== event.end.getTime()) {
      rowUpdates.push({
        range: cellRange(idx.ScheduledEndTime, row),
        values: [[formatDateForSheet(event.end)]],
      });
    }
    if (existing.task.estimateMinutes !== estimateMinutes) {
      rowUpdates.push({ range: cellRange(idx.EstimateMinutes, row), values: [[estimateMinutes]] });
    }
    if (rowUpdates.length > 0) {
      updates.push(...rowUpdates);
      updatedCount += 1;
    }
  }

  if (rowsToAppend.length > 0) {
    await sheets.appendRows(spreadsheetId, TASKDB_SHEET, rowsToAppend);
  }
  if (updates.length > 0) {
    await sheets.batchUpdateValues(spreadsheetId, updates);
  }

  // A meeting task whose event is gone from the qualifying set (deleted, or
  // now declined) and whose own scheduled time falls inside the query window
  // is removed from TaskDB — same false-positive guard as
  // syncCalendarToSheet: a task scheduled further out just won't appear in
  // `events` regardless of whether its Calendar event still exists.
  const rowsToDelete = meetingTasks
    .filter((t) => t.task.calendarEventId && !qualifyingEventIds.has(t.task.calendarEventId))
    .filter((t) => {
      const occursAt = t.task.scheduledStartTime.getTime();
      return occursAt >= windowStart.getTime() && occursAt <= windowEnd.getTime();
    })
    .map((t) => t.rowNumber);

  let deletedCount = 0;
  if (rowsToDelete.length > 0) {
    const sheetsMeta = await sheets.getSheetMetadata(spreadsheetId);
    const taskDbSheet = sheetsMeta.find((s) => s.title === TASKDB_SHEET);
    if (taskDbSheet) {
      const sortedDesc = [...rowsToDelete].sort((a, b) => b - a);
      for (const rowNumber of sortedDesc) {
        await sheets.deleteRow(spreadsheetId, taskDbSheet.sheetId, rowNumber - 1);
        deletedCount += 1;
      }
    }
  }

  return { addedCount: rowsToAppend.length, updatedCount, deletedCount };
}
