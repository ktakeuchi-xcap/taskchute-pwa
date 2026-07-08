import { CalendarColor, type CalendarClient } from '@/lib/google/calendar';
import type { SheetsClient, ValueRange } from '@/lib/google/sheets';
import { formatDateForSheet } from '@/lib/google/sheetDate';
import { TaskStatus, type Task, type TaskInput, type CategoryInfo } from '@/features/tasks/types';
import { buildHeaderIndex, TASKDB_HEADERS, TASKDB_SHEET, SETTINGS_SHEET } from './headers';
import { buildTaskRow, formatEventTitle, parseTaskDbRows, type TaskWithRow } from './serializers';

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

  return {
    async listTasks() {
      const values = await sheets.getValues(spreadsheetId, TASKDB_SHEET);
      const parsed = parseTaskDbRows(values);
      return parsed
        .map((t) => t.task)
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
      };

      await sheets.appendRows(spreadsheetId, TASKDB_SHEET, [buildTaskRow(headerRow, task)]);
      return task;
    },

    async updateTask(taskId, input) {
      const { headerRow, tasksWithRow } = await loadAll();
      const idx = buildHeaderIndex(headerRow, TASKDB_HEADERS);
      const target = tasksWithRow.find((t) => t.task.taskId === taskId);
      if (!target) throw new Error(`Task not found: ${taskId}`);

      const startTime = input.startTime ?? target.task.scheduledStartTime;
      const endTime = new Date(startTime.getTime() + input.estimateMinutes * 60_000);
      const category = input.category ?? null;

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
      };
    },

    async startTask(taskId) {
      const { headerRow, tasksWithRow } = await loadAll();
      const idx = buildHeaderIndex(headerRow, TASKDB_HEADERS);
      const target = tasksWithRow.find((t) => t.task.taskId === taskId);
      if (!target) throw new Error(`Task not found: ${taskId}`);

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
    },

    async endTask(taskId) {
      const { headerRow, tasksWithRow } = await loadAll();
      const idx = buildHeaderIndex(headerRow, TASKDB_HEADERS);
      const target = tasksWithRow.find((t) => t.task.taskId === taskId);
      if (!target) throw new Error(`Task not found: ${taskId}`);

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
    },

    async deleteTask(taskId) {
      const { tasksWithRow } = await loadAll();
      const target = tasksWithRow.find((t) => t.task.taskId === taskId);
      if (!target) throw new Error(`Task not found: ${taskId}`);

      const sheetsMeta = await sheets.getSheetMetadata(spreadsheetId);
      const taskDbSheet = sheetsMeta.find((s) => s.title === TASKDB_SHEET);
      if (!taskDbSheet) throw new Error(`Sheet not found: ${TASKDB_SHEET}`);

      if (target.task.calendarEventId) {
        await calendar.delete(calendarId, target.task.calendarEventId);
      }
      await sheets.deleteRow(spreadsheetId, taskDbSheet.sheetId, target.rowNumber - 1);
    },
  };
}
