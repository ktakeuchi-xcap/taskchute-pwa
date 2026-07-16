import { CalendarColor, type CalendarClient } from '@/lib/google/calendar';
import type { SheetsClient, ValueRange } from '@/lib/google/sheets';
import { formatDateForSheet } from '@/lib/google/sheetDate';
import {
  MeetingCategoryScope,
  TaskSource,
  TaskStatus,
  type Task,
  type TaskInput,
  type CategoryInfo,
} from '@/features/tasks/types';
import { deriveMeetingTaskStatus } from '@/features/tasks/meetingStatus';
import { buildHeaderIndex, TASKDB_HEADERS, TASKDB_SHEET, SETTINGS_SHEET } from './headers';
import { upsertMeetingCategoryRule, upsertMeetingWorkloadRule } from './meetingCategoryRules';
import { buildTaskRow, formatEventTitle, parseTaskDbRows, type TaskWithRow } from './serializers';
import { acquireSyncLockOrWait, releaseSyncLock } from '@/features/sync/syncLock';

// Looked up leniently (not via buildHeaderIndex/TASKDB_HEADERS), same as
// Source/RecurringEventID in serializers.ts — a sheet that hasn't added this
// column yet just can't have any task opted out of workload from here.
const COUNTS_TOWARD_WORKLOAD_HEADER = 'CountsTowardWorkload';

function findColumn(headerRow: unknown[], header: string): number {
  return headerRow.findIndex((cell) => cell === header);
}

export interface TaskRepository {
  listTasks(): Promise<Task[]>;
  listCategories(): Promise<CategoryInfo[]>;
  addCategory(name: string, color: string): Promise<void>;
  updateCategory(oldName: string, newName: string, color: string): Promise<void>;
  deleteCategory(name: string): Promise<void>;
  addTask(input: TaskInput): Promise<Task>;
  updateTask(taskId: string, input: TaskInput): Promise<Task>;
  startTask(taskId: string): Promise<Task>;
  endTask(taskId: string): Promise<Task>;
  deleteTask(taskId: string): Promise<void>;
  setMeetingCategory(
    taskId: string,
    category: string | null,
    scope: MeetingCategoryScope,
  ): Promise<Task>;
  setCountsTowardWorkload(
    taskId: string,
    counts: boolean,
    scope: MeetingCategoryScope,
  ): Promise<Task>;
}

export interface TaskRepositoryDeps {
  sheets: SheetsClient;
  calendar: CalendarClient;
  spreadsheetId: string;
  calendarId: string;
  /** Test seam. */
  now?: () => Date;
  /** Test seam. */
  generateId?: () => string;
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

function cellAddress(rowNumber: number, col1Based: number): string {
  return `${TASKDB_SHEET}!${columnLetter(col1Based)}${rowNumber}`;
}

/**
 * Meeting-sourced tasks are read-only from the app (see meetingStatus.ts) —
 * the UI never shows edit/start/end/delete controls for them, but this
 * guards the repository layer too in case a caller bypasses the UI.
 */
function assertNotMeeting(task: Task, action: string): void {
  if (task.source === TaskSource.Meeting) {
    throw new Error(`Meeting task "${task.taskName}" cannot be ${action} from the app`);
  }
}

function defaultGenerateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback (should not happen in modern browsers but keeps SSR / older JSDOM happy)
  return `tid-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function createTaskRepository(deps: TaskRepositoryDeps): TaskRepository {
  const { sheets, calendar, spreadsheetId, calendarId } = deps;
  const now = deps.now ?? (() => new Date());
  const generateId = deps.generateId ?? defaultGenerateId;

  async function loadAll(): Promise<{
    headerRow: unknown[];
    tasksWithRow: TaskWithRow[];
  }> {
    const values = await sheets.getValues(spreadsheetId, TASKDB_SHEET);
    if (values.length === 0) throw new Error('TaskDB is empty (no header row)');
    const headerRow = values[0]!;
    return { headerRow, tasksWithRow: parseTaskDbRows(values) };
  }

  // Holds the same lock a sync run holds for its whole read-then-write span
  // (see acquireSyncLockOrWait's doc comment) — rules out a concurrent sync
  // shifting row numbers out from under a mutation that read them earlier in
  // the same call.
  async function withSyncLock<T>(fn: () => Promise<T>): Promise<T> {
    await acquireSyncLockOrWait(sheets, spreadsheetId);
    try {
      return await fn();
    } finally {
      await releaseSyncLock(sheets, spreadsheetId).catch(() => {});
    }
  }

  return {
    async listTasks() {
      const values = await sheets.getValues(spreadsheetId, TASKDB_SHEET);
      const parsed = parseTaskDbRows(values);
      const nowValue = now();
      return parsed
        .map((t) => deriveMeetingTaskStatus(t.task, nowValue))
        .sort((a, b) => a.scheduledStartTime.getTime() - b.scheduledStartTime.getTime());
    },

    async listCategories() {
      const values = await sheets.getValues(spreadsheetId, `${SETTINGS_SHEET}!A2:B`);
      const out: CategoryInfo[] = [];
      for (const row of values) {
        const name = row[0];
        if (typeof name !== 'string' || name.length === 0) continue;
        const color = row[1];
        out.push({ name, color: typeof color === 'string' && color.length > 0 ? color : null });
      }
      return out;
    },

    async addCategory(name, color) {
      await sheets.appendRows(spreadsheetId, SETTINGS_SHEET, [[name, color]]);
    },

    async updateCategory(oldName, newName, color) {
      const values = await sheets.getValues(spreadsheetId, `${SETTINGS_SHEET}!A:A`);
      const rowIndex = values.findIndex(
        (row, i) => i > 0 && typeof row[0] === 'string' && row[0] === oldName,
      );
      if (rowIndex === -1) throw new Error(`Category not found: ${oldName}`);
      await sheets.updateRange(
        spreadsheetId,
        `${SETTINGS_SHEET}!A${rowIndex + 1}:B${rowIndex + 1}`,
        [[newName, color]],
      );
    },

    async deleteCategory(name) {
      const values = await sheets.getValues(spreadsheetId, `${SETTINGS_SHEET}!A:A`);
      const rowIndex = values.findIndex(
        (row, i) => i > 0 && typeof row[0] === 'string' && row[0] === name,
      );
      if (rowIndex === -1) throw new Error(`Category not found: ${name}`);

      const sheetsMeta = await sheets.getSheetMetadata(spreadsheetId);
      const settingsSheet = sheetsMeta.find((s) => s.title === SETTINGS_SHEET);
      if (!settingsSheet) throw new Error(`Sheet not found: ${SETTINGS_SHEET}`);
      await sheets.deleteRow(spreadsheetId, settingsSheet.sheetId, rowIndex);
    },

    async addTask(input) {
      const { headerRow, tasksWithRow } = await loadAll();
      const sortedByEnd = [...tasksWithRow].sort(
        (a, b) => b.task.scheduledEndTime.getTime() - a.task.scheduledEndTime.getTime(),
      );
      const startTime = input.startTime ?? sortedByEnd[0]?.task.scheduledEndTime ?? now();
      const endTime = new Date(startTime.getTime() + input.estimateMinutes * 60_000);

      const event = await calendar.insert(calendarId, {
        summary: formatEventTitle(input.taskName, input.category ?? null),
        start: startTime,
        end: endTime,
        colorId: CalendarColor.Gray,
      });

      const task: Task = {
        taskId: generateId(),
        taskName: input.taskName,
        category: input.category ?? null,
        estimateMinutes: input.estimateMinutes,
        scheduledStartTime: startTime,
        scheduledEndTime: endTime,
        actualStartTime: null,
        actualEndTime: null,
        status: TaskStatus.NotStarted,
        calendarEventId: event.id,
        source: null,
        recurringEventId: null,
        countsTowardWorkload: input.countsTowardWorkload ?? true,
      };

      await sheets.appendRows(spreadsheetId, TASKDB_SHEET, [buildTaskRow(headerRow, task)]);
      return task;
    },

    async updateTask(taskId, input) {
      return withSyncLock(async () => {
        const { headerRow, tasksWithRow } = await loadAll();
        const idx = buildHeaderIndex(headerRow, TASKDB_HEADERS);
        const target = tasksWithRow.find((t) => t.task.taskId === taskId);
        if (!target) throw new Error(`Task not found: ${taskId}`);
        assertNotMeeting(target.task, 'edited');

        const startTime = input.startTime ?? target.task.scheduledStartTime;
        const endTime = new Date(startTime.getTime() + input.estimateMinutes * 60_000);
        const category = input.category ?? null;
        const countsTowardWorkload = input.countsTowardWorkload ?? target.task.countsTowardWorkload;

        const updates: ValueRange[] = [
          {
            range: cellAddress(target.rowNumber, idx.TaskName + 1),
            values: [[input.taskName]],
          },
          {
            range: cellAddress(target.rowNumber, idx.Category + 1),
            values: [[category ?? '']],
          },
          {
            range: cellAddress(target.rowNumber, idx.EstimateMinutes + 1),
            values: [[input.estimateMinutes]],
          },
          {
            range: cellAddress(target.rowNumber, idx.ScheduledStartTime + 1),
            values: [[formatDateForSheet(startTime)]],
          },
          {
            range: cellAddress(target.rowNumber, idx.ScheduledEndTime + 1),
            values: [[formatDateForSheet(endTime)]],
          },
        ];
        const countsCol = findColumn(headerRow, COUNTS_TOWARD_WORKLOAD_HEADER);
        if (countsCol !== -1) {
          updates.push({
            range: cellAddress(target.rowNumber, countsCol + 1),
            values: [[countsTowardWorkload ? '' : 'FALSE']],
          });
        }
        await sheets.batchUpdateValues(spreadsheetId, updates);

        if (target.task.calendarEventId) {
          await calendar.patch(calendarId, target.task.calendarEventId, {
            summary: formatEventTitle(input.taskName, category),
            start: startTime,
            end: endTime,
          });
        }

        return {
          ...target.task,
          taskName: input.taskName,
          category,
          estimateMinutes: input.estimateMinutes,
          scheduledStartTime: startTime,
          scheduledEndTime: endTime,
          countsTowardWorkload,
        };
      });
    },

    async startTask(taskId) {
      return withSyncLock(async () => {
        const { headerRow, tasksWithRow } = await loadAll();
        const idx = buildHeaderIndex(headerRow, TASKDB_HEADERS);
        const target = tasksWithRow.find((t) => t.task.taskId === taskId);
        if (!target) throw new Error(`Task not found: ${taskId}`);
        assertNotMeeting(target.task, 'started');

        const startedAt = now();
        const updates: ValueRange[] = [
          {
            range: cellAddress(target.rowNumber, idx.Status + 1),
            values: [[TaskStatus.InProgress]],
          },
          {
            range: cellAddress(target.rowNumber, idx.ActualStartTime + 1),
            values: [[formatDateForSheet(startedAt)]],
          },
        ];
        await sheets.batchUpdateValues(spreadsheetId, updates);

        if (target.task.calendarEventId) {
          await calendar.patch(calendarId, target.task.calendarEventId, {
            colorId: CalendarColor.Yellow,
          });
        }
        return {
          ...target.task,
          status: TaskStatus.InProgress,
          actualStartTime: startedAt,
        };
      });
    },

    async endTask(taskId) {
      return withSyncLock(async () => {
        const { headerRow, tasksWithRow } = await loadAll();
        const idx = buildHeaderIndex(headerRow, TASKDB_HEADERS);
        const target = tasksWithRow.find((t) => t.task.taskId === taskId);
        if (!target) throw new Error(`Task not found: ${taskId}`);
        assertNotMeeting(target.task, 'ended');

        const endedAt = now();
        const updates: ValueRange[] = [
          {
            range: cellAddress(target.rowNumber, idx.Status + 1),
            values: [[TaskStatus.Done]],
          },
          {
            range: cellAddress(target.rowNumber, idx.ActualEndTime + 1),
            values: [[formatDateForSheet(endedAt)]],
          },
        ];
        await sheets.batchUpdateValues(spreadsheetId, updates);

        if (target.task.calendarEventId) {
          const startTime = target.task.actualStartTime ?? target.task.scheduledStartTime;
          await calendar.patch(calendarId, target.task.calendarEventId, {
            colorId: CalendarColor.Green,
            start: startTime,
            end: endedAt,
          });
        }
        return {
          ...target.task,
          status: TaskStatus.Done,
          actualEndTime: endedAt,
        };
      });
    },

    async deleteTask(taskId) {
      return withSyncLock(async () => {
        const { tasksWithRow } = await loadAll();
        const target = tasksWithRow.find((t) => t.task.taskId === taskId);
        if (!target) throw new Error(`Task not found: ${taskId}`);
        assertNotMeeting(target.task, 'deleted');

        const sheetsMeta = await sheets.getSheetMetadata(spreadsheetId);
        const taskDbSheet = sheetsMeta.find((s) => s.title === TASKDB_SHEET);
        if (!taskDbSheet) throw new Error(`Sheet not found: ${TASKDB_SHEET}`);

        if (target.task.calendarEventId) {
          await calendar.delete(calendarId, target.task.calendarEventId);
        }
        await sheets.deleteRow(spreadsheetId, taskDbSheet.sheetId, target.rowNumber - 1);
      });
    },

    async setMeetingCategory(taskId, category, scope) {
      return withSyncLock(async () => {
        const { headerRow, tasksWithRow } = await loadAll();
        const idx = buildHeaderIndex(headerRow, TASKDB_HEADERS);
        const target = tasksWithRow.find((t) => t.task.taskId === taskId);
        if (!target) throw new Error(`Task not found: ${taskId}`);
        if (target.task.source !== TaskSource.Meeting) {
          throw new Error(`Task "${target.task.taskName}" is not a meeting task`);
        }

        const updates: ValueRange[] = [
          { range: cellAddress(target.rowNumber, idx.Category + 1), values: [[category ?? '']] },
        ];

        if (scope !== MeetingCategoryScope.This) {
          const seriesId = target.task.recurringEventId;
          if (!seriesId) {
            throw new Error(`Meeting task "${target.task.taskName}" has no recurring series id`);
          }
          const others = tasksWithRow.filter(
            (t) =>
              t.rowNumber !== target.rowNumber &&
              t.task.source === TaskSource.Meeting &&
              t.task.recurringEventId === seriesId &&
              (scope === MeetingCategoryScope.All ||
                t.task.scheduledStartTime.getTime() >= target.task.scheduledStartTime.getTime()),
          );
          for (const other of others) {
            updates.push({
              range: cellAddress(other.rowNumber, idx.Category + 1),
              values: [[category ?? '']],
            });
          }
          await upsertMeetingCategoryRule(sheets, spreadsheetId, {
            recurringEventId: seriesId,
            category,
            effectiveFromDate:
              scope === MeetingCategoryScope.All ? null : target.task.scheduledStartTime,
          });
        }

        await sheets.batchUpdateValues(spreadsheetId, updates);

        return { ...target.task, category };
      });
    },

    async setCountsTowardWorkload(taskId, counts, scope) {
      return withSyncLock(async () => {
        const { headerRow, tasksWithRow } = await loadAll();
        const target = tasksWithRow.find((t) => t.task.taskId === taskId);
        if (!target) throw new Error(`Task not found: ${taskId}`);
        if (target.task.source !== TaskSource.Meeting) {
          throw new Error(`Task "${target.task.taskName}" is not a meeting task`);
        }
        const countsCol = findColumn(headerRow, COUNTS_TOWARD_WORKLOAD_HEADER);
        if (countsCol === -1) {
          throw new Error(
            `"${TASKDB_SHEET}" シートに "${COUNTS_TOWARD_WORKLOAD_HEADER}" の見出し列を追加してください`,
          );
        }

        const value = counts ? '' : 'FALSE';
        const updates: ValueRange[] = [
          { range: cellAddress(target.rowNumber, countsCol + 1), values: [[value]] },
        ];

        if (scope !== MeetingCategoryScope.This) {
          const seriesId = target.task.recurringEventId;
          if (!seriesId) {
            throw new Error(`Meeting task "${target.task.taskName}" has no recurring series id`);
          }
          const others = tasksWithRow.filter(
            (t) =>
              t.rowNumber !== target.rowNumber &&
              t.task.source === TaskSource.Meeting &&
              t.task.recurringEventId === seriesId &&
              (scope === MeetingCategoryScope.All ||
                t.task.scheduledStartTime.getTime() >= target.task.scheduledStartTime.getTime()),
          );
          for (const other of others) {
            updates.push({ range: cellAddress(other.rowNumber, countsCol + 1), values: [[value]] });
          }
          await upsertMeetingWorkloadRule(sheets, spreadsheetId, {
            recurringEventId: seriesId,
            countsTowardWorkload: counts,
            effectiveFromDate:
              scope === MeetingCategoryScope.All ? null : target.task.scheduledStartTime,
          });
        }

        await sheets.batchUpdateValues(spreadsheetId, updates);

        return { ...target.task, countsTowardWorkload: counts };
      });
    },
  };
}
