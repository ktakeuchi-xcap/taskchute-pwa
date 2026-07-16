import type { Task, TaskSource, TaskStatus } from '@/features/tasks/types';
import {
  TaskSource as TaskSourceValues,
  TaskStatus as TaskStatusValues,
} from '@/features/tasks/types';
import { parseSheetDateCell, formatDateForSheet } from '@/lib/google/sheetDate';
import { buildHeaderIndex, TASKDB_HEADERS } from './headers';

const STATUS_VALUES: ReadonlySet<string> = new Set<TaskStatus>(Object.values(TaskStatusValues));

// Looked up leniently (not via buildHeaderIndex/TASKDB_HEADERS) so existing
// spreadsheets that haven't added these columns yet keep working exactly as
// before — tasks just read/write as ordinary (non-meeting) tasks.
const SOURCE_HEADER = 'Source';
const RECURRING_EVENT_ID_HEADER = 'RecurringEventID';
const COUNTS_TOWARD_WORKLOAD_HEADER = 'CountsTowardWorkload';

function findColumn(headerRow: unknown[], header: string): number {
  return headerRow.findIndex((cell) => cell === header);
}

function asSource(value: unknown): TaskSource | null {
  return value === TaskSourceValues.Meeting ? TaskSourceValues.Meeting : null;
}

function asNullableString(value: unknown): string | null {
  const s = asString(value);
  return s.length === 0 ? null : s;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
}

function asNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

// getValues reads with valueRenderOption=UNFORMATTED_VALUE, so a cell that
// was checked/unchecked as a Sheets checkbox comes back as a real JS boolean
// (`false`), not the string "FALSE" — String(false) is lowercase "false",
// which `asString(value) !== 'FALSE'` would never match, silently treating
// an unchecked box as "counts toward workload". This checks the boolean case
// directly instead of round-tripping it through asString's String(value).
function isFalseFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value === false;
  return asString(value).trim().toUpperCase() === 'FALSE';
}

function asStatus(value: unknown): TaskStatus {
  const s = asString(value);
  if (STATUS_VALUES.has(s)) return s as TaskStatus;
  return TaskStatusValues.NotStarted;
}

/**
 * In-memory shape used by the repository. Carries the absolute (1-based) sheet
 * row number alongside the Task so updates can target the right row without
 * an additional lookup.
 */
export interface TaskWithRow {
  task: Task;
  rowNumber: number;
}

export function parseTaskDbRows(values: unknown[][]): TaskWithRow[] {
  if (values.length === 0) return [];
  const [headerRow, ...rows] = values;
  if (!headerRow) return [];
  const idx = buildHeaderIndex(headerRow, TASKDB_HEADERS);
  const sourceCol = findColumn(headerRow, SOURCE_HEADER);
  const recurringEventIdCol = findColumn(headerRow, RECURRING_EVENT_ID_HEADER);
  const countsTowardWorkloadCol = findColumn(headerRow, COUNTS_TOWARD_WORKLOAD_HEADER);

  const tasks: TaskWithRow[] = [];
  rows.forEach((row, i) => {
    const taskId = asString(row[idx.TaskID]);
    if (!taskId) return;
    const start = parseSheetDateCell(row[idx.ScheduledStartTime]);
    const end = parseSheetDateCell(row[idx.ScheduledEndTime]);
    if (!start || !end) return;
    tasks.push({
      rowNumber: i + 2, // +1 for header, +1 for 1-based
      task: {
        taskId,
        taskName: asString(row[idx.TaskName]),
        category: (() => {
          const c = asString(row[idx.Category]);
          return c.length === 0 ? null : c;
        })(),
        estimateMinutes: asNumber(row[idx.EstimateMinutes]),
        scheduledStartTime: start,
        scheduledEndTime: end,
        actualStartTime: parseSheetDateCell(row[idx.ActualStartTime]),
        actualEndTime: parseSheetDateCell(row[idx.ActualEndTime]),
        status: asStatus(row[idx.Status]),
        calendarEventId: asString(row[idx.CalendarEventID]),
        source: sourceCol === -1 ? null : asSource(row[sourceCol]),
        recurringEventId:
          recurringEventIdCol === -1 ? null : asNullableString(row[recurringEventIdCol]),
        // Missing column or blank cell both default to true (計上する) — an
        // explicit "FALSE" is the only way to opt a task out.
        countsTowardWorkload:
          countsTowardWorkloadCol === -1 ? true : !isFalseFlag(row[countsTowardWorkloadCol]),
      },
    });
  });
  return tasks;
}

/**
 * Build a sheet row aligned with the provided header row so each column lands
 * in the correct position even if the user has reordered them.
 */
export function buildTaskRow(headerRow: unknown[], task: Task): unknown[] {
  const idx = buildHeaderIndex(headerRow, TASKDB_HEADERS);
  const sourceCol = findColumn(headerRow, SOURCE_HEADER);
  const recurringEventIdCol = findColumn(headerRow, RECURRING_EVENT_ID_HEADER);
  const countsTowardWorkloadCol = findColumn(headerRow, COUNTS_TOWARD_WORKLOAD_HEADER);
  const row = new Array<unknown>(headerRow.length).fill('');
  row[idx.TaskID] = task.taskId;
  row[idx.TaskName] = task.taskName;
  row[idx.Category] = task.category ?? '';
  row[idx.EstimateMinutes] = task.estimateMinutes;
  row[idx.ScheduledStartTime] = formatDateForSheet(task.scheduledStartTime);
  row[idx.ScheduledEndTime] = formatDateForSheet(task.scheduledEndTime);
  row[idx.ActualStartTime] = task.actualStartTime ? formatDateForSheet(task.actualStartTime) : '';
  row[idx.ActualEndTime] = task.actualEndTime ? formatDateForSheet(task.actualEndTime) : '';
  row[idx.Status] = task.status;
  row[idx.CalendarEventID] = task.calendarEventId;
  // If the sheet hasn't gotten these columns yet, this is silently dropped —
  // the row still writes correctly as an ordinary task.
  if (sourceCol !== -1) row[sourceCol] = task.source ?? '';
  if (recurringEventIdCol !== -1) row[recurringEventIdCol] = task.recurringEventId ?? '';
  // Left blank for the (much more common) true case, matching how a blank
  // cell already reads as true in parseTaskDbRows above — keeps the sheet
  // free of "TRUE" clutter for tasks that just use the default.
  if (countsTowardWorkloadCol !== -1) {
    row[countsTowardWorkloadCol] = task.countsTowardWorkload ? '' : 'FALSE';
  }
  return row;
}

/**
 * Calendar event title format (matches legacy GAS):
 *   - with category:    `(${category})_${name}`
 *   - without category: `${name}`
 */
export function formatEventTitle(taskName: string, category: string | null): string {
  return category ? `(${category})_${taskName}` : taskName;
}

const TITLED_RE = /^\((.*?)\)_(.*)/s;

export function parseEventTitle(title: string): { taskName: string; category: string | null } {
  const m = TITLED_RE.exec(title);
  if (m && m[1] !== undefined && m[2] !== undefined) {
    return { category: m[1], taskName: m[2] };
  }
  return { category: null, taskName: title };
}
