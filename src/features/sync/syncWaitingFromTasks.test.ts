import { describe, expect, it } from 'vitest';
import { syncWaitingFromTasks } from './syncWaitingFromTasks';
import { WAITING_HEADERS } from '@/features/waiting/api/headers';
import type { SheetsClient, ValueRange } from '@/lib/google/sheets';
import type { GoogleTask, TasksClient } from '@/lib/google/tasks';
import { dateToSheetSerial } from '@/lib/google/sheetDate';

const HEADER = [
  WAITING_HEADERS.SystemTaskID,
  WAITING_HEADERS.TaskName,
  WAITING_HEADERS.WaitingFor,
  WAITING_HEADERS.DelegatedDate,
  WAITING_HEADERS.FollowUpDate,
  WAITING_HEADERS.GoogleTaskID,
];

function mockSheets(values: unknown[][]): SheetsClient & {
  batchUpdates: ValueRange[][];
} {
  const batchUpdates: ValueRange[][] = [];
  return {
    batchUpdates,
    async getValues() {
      return values;
    },
    async appendRows() {},
    async updateRange() {},
    async batchUpdateValues(_id, data) {
      batchUpdates.push(data);
    },
    async deleteRow() {},
    async getSheetMetadata() {
      return [];
    },
  };
}

function mockTasks(list: GoogleTask[]): TasksClient {
  return {
    async list() {
      return list;
    },
    async insert() {
      throw new Error('not used');
    },
    async patch() {
      throw new Error('not used');
    },
    async get() {
      throw new Error('not used');
    },
    async delete() {},
  };
}

describe('syncWaitingFromTasks', () => {
  it('clears rows whose Google Task no longer exists', async () => {
    const delegated = new Date('2026-05-16T09:00:00+09:00');
    const sheets = mockSheets([
      HEADER,
      ['sid-1', 'A', '米森', dateToSheetSerial(delegated), '', 'gt-1'],
    ]);
    const tasks = mockTasks([]); // empty Google Tasks list
    const result = await syncWaitingFromTasks({
      sheets,
      tasks,
      spreadsheetId: 'sid',
    });
    expect(result.clearedCount).toBe(1);
    expect(sheets.batchUpdates).toHaveLength(1);
    // Should clear all 6 columns of row 2
    const ranges = sheets.batchUpdates[0]!.map((u) => u.range);
    expect(ranges).toHaveLength(6);
    expect(ranges.every((r) => /^WaitingList!.+2$/.test(r))).toBe(true);
  });

  it('updates title when Google Task title changed', async () => {
    const delegated = new Date('2026-05-16T09:00:00+09:00');
    const sheets = mockSheets([
      HEADER,
      ['sid-1', '旧依頼', '米森', dateToSheetSerial(delegated), '', 'gt-1'],
    ]);
    const tasks = mockTasks([
      {
        id: 'gt-1',
        title: '[WAIT] 米森: 新しい依頼内容',
        notes: null,
        due: null,
        status: 'needsAction',
      },
    ]);
    const result = await syncWaitingFromTasks({
      sheets,
      tasks,
      spreadsheetId: 'sid',
    });
    expect(result.updatedCount).toBe(1);
    const updates = sheets.batchUpdates[0]!;
    expect(updates.some((u) => u.values[0]![0] === '新しい依頼内容')).toBe(true);
  });

  it('no batchUpdate when nothing changed', async () => {
    const delegated = new Date('2026-05-16T09:00:00+09:00');
    const sheets = mockSheets([
      HEADER,
      ['sid-1', '内容', '米森', dateToSheetSerial(delegated), '', 'gt-1'],
    ]);
    const tasks = mockTasks([
      {
        id: 'gt-1',
        title: '[WAIT] 米森: 内容',
        notes: null,
        due: null,
        status: 'needsAction',
      },
    ]);
    const result = await syncWaitingFromTasks({
      sheets,
      tasks,
      spreadsheetId: 'sid',
    });
    expect(result.updatedCount).toBe(0);
    expect(result.clearedCount).toBe(0);
    expect(sheets.batchUpdates).toHaveLength(0);
  });
});
