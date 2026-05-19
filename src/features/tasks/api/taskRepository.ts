import { CalendarColor, type CalendarClient } from '@/lib/google/calendar';
import type { SheetsClient, ValueRange } from '@/lib/google/sheets';
import { formatDateForSheet } from '@/lib/google/sheetDate';
import { TaskStatus, type Task, type TaskInput } from '@/features/tasks/types';
import {
  buildHeaderIndex,
  TASKDB_HEADERS,
  TASKDB_SHEET,
  SETTINGS_SHEET,
} from './headers';
import {
  buildTaskRow,
  formatEventTitle,
  parseTaskDbRows,
  type TaskWithRow,
} from './serializers';

export interface TaskRepository {
  listTasks(): Promise<Task[]>;
  listCategories(): Promise<string[]>;
  addTask(input: TaskInput): Promise<Task>;
  startTask(taskId: string): Promise<Task>;
  endTask(taskId: string): Promise<Task>;
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
        .sort(
          (a, b) =>
            a.scheduledStartTime.getTime() - b.scheduledStartTime.getTime(),
        );
    },

    async listCategories() {
      const values = await sheets.getValues(spreadsheetId, `${SETTINGS_SHEET}!A2:A`);
      return values
        .flat()
        .filter((v): v is string => typeof v === 'string' && v.length > 0);
    },

    async addTask(input) {
      const { headerRow, tasksWithRow } = await loadAll();
      const sortedByEnd = [...tasksWithRow].sort(
        (a, b) =>
          b.task.scheduledEndTime.getTime() - a.task.scheduledEndTime.getTime(),
      );
      const startTime =
        input.startTime ?? sortedByEnd[0]?.task.scheduledEndTime ?? now();
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

      await sheets.appendRows(spreadsheetId, TASKDB_SHEET, [
        buildTaskRow(headerRow, task),
      ]);
      return task;
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
  };
}
