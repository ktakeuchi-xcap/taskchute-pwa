import type { SheetsClient, ValueRange } from '@/lib/google/sheets';
import type { TasksClient } from '@/lib/google/tasks';
import { formatWaitingTitle, parseWaitingTitle } from '@/lib/google/tasks';
import { formatJst } from '@/lib/time/jst';
import { formatDateForSheet } from '@/lib/google/sheetDate';
import { buildHeaderIndex } from '@/features/tasks/api/headers';
import type { WaitingTask, WaitingTaskInput } from '@/features/waiting/types';
import { WAITING_HEADERS, WAITING_SHEET } from './headers';
import { buildWaitingRow, parseWaitingRows } from './serializers';

export interface WaitingRepository {
  list(): Promise<WaitingTask[]>;
  add(input: WaitingTaskInput): Promise<WaitingTask>;
  toggleComplete(systemTaskId: string, completed: boolean): Promise<void>;
  remove(systemTaskId: string): Promise<void>;
}

export interface WaitingRepositoryDeps {
  sheets: SheetsClient;
  tasks: TasksClient;
  spreadsheetId: string;
  now?: () => Date;
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

function defaultGenerateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `wid-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function createWaitingRepository(deps: WaitingRepositoryDeps): WaitingRepository {
  const { sheets, tasks, spreadsheetId } = deps;
  const now = deps.now ?? (() => new Date());
  const generateId = deps.generateId ?? defaultGenerateId;

  async function loadAll() {
    const values = await sheets.getValues(spreadsheetId, WAITING_SHEET);
    if (values.length === 0) throw new Error('WaitingList is empty (no header row)');
    const headerRow = values[0]!;
    const parsed = parseWaitingRows(values);
    return { headerRow, parsed, allValues: values };
  }

  async function loadGoogleStatusMap() {
    const list = await tasks.list();
    return new Map(list.map((t) => [t.id, t]));
  }

  return {
    async list() {
      const { parsed } = await loadAll();
      const googleMap = await loadGoogleStatusMap();
      return parsed
        .map(({ task }) => {
          const googleTask = task.googleTaskId ? googleMap.get(task.googleTaskId) : null;
          if (!googleTask) return { ...task, completed: false };
          // Trust Google Tasks for title / due / completion (it's the source the user touches on phone).
          const parsedTitle = parseWaitingTitle(googleTask.title);
          return {
            ...task,
            taskName: parsedTitle.taskName,
            waitingFor: parsedTitle.waitingFor,
            followUpDate: googleTask.due ?? task.followUpDate,
            completed: googleTask.status === 'completed',
          };
        })
        .sort((a, b) => {
          // Incomplete first, then by followUpDate ascending (null last).
          if (a.completed !== b.completed) return a.completed ? 1 : -1;
          const aT = a.followUpDate?.getTime() ?? Number.POSITIVE_INFINITY;
          const bT = b.followUpDate?.getTime() ?? Number.POSITIVE_INFINITY;
          return aT - bT;
        });
    },

    async add(input) {
      const systemTaskId = generateId();
      const delegatedDate = now();

      const googleTask = await tasks.insert({
        title: formatWaitingTitle(input.taskName, input.waitingFor ?? null),
        notes: `依頼日: ${formatJst(delegatedDate, 'yyyy/MM/dd')}\nシートID: ${systemTaskId}`,
        ...(input.followUpDate ? { due: input.followUpDate } : {}),
      });

      const task: WaitingTask = {
        systemTaskId,
        taskName: input.taskName,
        waitingFor: input.waitingFor ?? null,
        delegatedDate,
        followUpDate: input.followUpDate ?? null,
        googleTaskId: googleTask.id,
        completed: false,
      };

      const values = await sheets.getValues(spreadsheetId, `${WAITING_SHEET}!1:1`);
      const headerRow = values[0];
      if (!headerRow) throw new Error('WaitingList has no header row');
      await sheets.appendRows(spreadsheetId, WAITING_SHEET, [buildWaitingRow(headerRow, task)]);
      return task;
    },

    async toggleComplete(systemTaskId, completed) {
      const { parsed } = await loadAll();
      const target = parsed.find((p) => p.task.systemTaskId === systemTaskId);
      if (!target) throw new Error(`WaitingTask not found: ${systemTaskId}`);
      if (target.task.googleTaskId) {
        await tasks.patch(target.task.googleTaskId, {
          status: completed ? 'completed' : 'needsAction',
        });
      }
    },

    async remove(systemTaskId) {
      const { allValues, parsed, headerRow } = await loadAll();
      const target = parsed.find((p) => p.task.systemTaskId === systemTaskId);
      if (!target) throw new Error(`WaitingTask not found: ${systemTaskId}`);
      if (target.task.googleTaskId) {
        await tasks.delete(target.task.googleTaskId).catch(() => undefined);
      }
      // Clear the row's content in place (avoids needing the sheetId). The row remains
      // but every cell becomes empty so parseWaitingRows ignores it on next read.
      const idx = buildHeaderIndex(headerRow, WAITING_HEADERS);
      const updates: ValueRange[] = Object.keys(WAITING_HEADERS).map((key) => ({
        range: `${WAITING_SHEET}!${columnLetter(idx[key as keyof typeof WAITING_HEADERS] + 1)}${target.rowNumber}`,
        values: [['']],
      }));
      await sheets.batchUpdateValues(spreadsheetId, updates);
      // Avoid "allValues unused" – exists for symmetry with other repository methods.
      void allValues;
      // Update follow-up to avoid leaving stale data in Google Tasks if removal there failed.
      void formatDateForSheet;
    },
  };
}
