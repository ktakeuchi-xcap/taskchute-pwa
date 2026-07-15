import { describe, expect, it } from 'vitest';
import { createRoutinesRepository } from './routinesRepository';
import type { SheetsClient, ValueRange } from '@/lib/google/sheets';

const HEADER = ['Schedule', 'TaskName', 'StartTime', 'Category', 'EstimateMinutes'];

function createMockSheets(routineTasks: unknown[][]): SheetsClient & {
  appendCalls: unknown[][][];
  deletedRows: Array<{ sheetId: number; rowIndex: number }>;
  batchUpdates: ValueRange[][];
} {
  const appendCalls: unknown[][][] = [];
  const deletedRows: Array<{ sheetId: number; rowIndex: number }> = [];
  const batchUpdates: ValueRange[][] = [];
  return {
    appendCalls,
    deletedRows,
    batchUpdates,
    async getValues(_id, range) {
      if (range.startsWith('RoutineTasks')) return routineTasks;
      return [];
    },
    async appendRows(_id, _range, rows) {
      appendCalls.push(rows);
      routineTasks.push(...rows);
    },
    async updateRange() {
      // not used
    },
    async batchUpdateValues(_id, data) {
      batchUpdates.push(data);
    },
    async deleteRow(_id, sheetId, rowIndex) {
      deletedRows.push({ sheetId, rowIndex });
    },
    async deleteRows(_id, sheetId, rowIndexes) {
      for (const rowIndex of [...rowIndexes].sort((a, b) => b - a)) {
        deletedRows.push({ sheetId, rowIndex });
      }
    },
    async getSheetMetadata() {
      return [{ sheetId: 99, title: 'RoutineTasks' }];
    },
  };
}

describe('RoutinesRepository', () => {
  it('listRoutines parses rows and converts a numeric time serial to HH:mm', async () => {
    const sheets = createMockSheets([
      HEADER,
      ['月', '週報作成', 0.375, '管理', 30], // 0.375 day = 09:00
      ['火', '朝会', '09:30', '営業', 15],
    ]);
    const repo = createRoutinesRepository({ sheets, spreadsheetId: 'sid' });

    const routines = await repo.listRoutines();
    expect(routines).toEqual([
      {
        rowNumber: 2,
        schedule: '月',
        taskName: '週報作成',
        startTime: '09:00',
        category: '管理',
        estimateMinutes: 30,
      },
      {
        rowNumber: 3,
        schedule: '火',
        taskName: '朝会',
        startTime: '09:30',
        category: '営業',
        estimateMinutes: 15,
      },
    ]);
  });

  it('sorts by frequency tier (businessDay > weekday > monthly), then day, then start time', async () => {
    const sheets = createMockSheets([
      HEADER,
      ['末日', 'A_末日', '18:00', '', 10],
      ['水', 'B_水17', '17:00', '', 10],
      ['15日', 'C_15日', '08:00', '', 10],
      ['毎営業日', 'D_営業10', '10:00', '', 10],
      ['月', 'E_月09', '09:00', '', 10],
      ['初日', 'F_初日', '07:00', '', 10],
      ['毎営業日', 'G_営業08', '08:00', '', 10],
      ['月', 'H_月08', '08:00', '', 10],
    ]);
    const repo = createRoutinesRepository({ sheets, spreadsheetId: 'sid' });

    const routines = await repo.listRoutines();
    expect(routines.map((r) => r.taskName)).toEqual([
      'G_営業08',
      'D_営業10',
      'H_月08',
      'E_月09',
      'B_水17',
      'F_初日',
      'C_15日',
      'A_末日',
    ]);
  });

  it('pushes unparseable schedules to the end without throwing', async () => {
    const sheets = createMockSheets([
      HEADER,
      ['謎スケジュール', 'Z_不明', '09:00', '', 10],
      ['毎営業日', 'A_営業', '09:00', '', 10],
    ]);
    const repo = createRoutinesRepository({ sheets, spreadsheetId: 'sid' });

    const routines = await repo.listRoutines();
    expect(routines.map((r) => r.taskName)).toEqual(['A_営業', 'Z_不明']);
  });

  it('addRoutine appends a row aligned to the header order', async () => {
    const sheets = createMockSheets([HEADER]);
    const repo = createRoutinesRepository({ sheets, spreadsheetId: 'sid' });

    await repo.addRoutine({
      schedule: '15日',
      taskName: '月次請求書送付',
      startTime: '10:00',
      category: '経理',
      estimateMinutes: 20,
    });

    expect(sheets.appendCalls).toEqual([[['15日', '月次請求書送付', '10:00', '経理', 20]]]);
  });

  it('updateRoutine rewrites all columns of the given row', async () => {
    const sheets = createMockSheets([HEADER, ['月', '週報作成', '09:00', '管理', 30]]);
    const repo = createRoutinesRepository({ sheets, spreadsheetId: 'sid' });

    await repo.updateRoutine(2, {
      schedule: '水',
      taskName: '週報作成（改）',
      startTime: '10:30',
      category: '営業',
      estimateMinutes: 45,
    });

    expect(sheets.batchUpdates).toEqual([
      [
        { range: 'RoutineTasks!A2', values: [['水']] },
        { range: 'RoutineTasks!B2', values: [['週報作成（改）']] },
        { range: 'RoutineTasks!C2', values: [['10:30']] },
        { range: 'RoutineTasks!D2', values: [['営業']] },
        { range: 'RoutineTasks!E2', values: [[45]] },
      ],
    ]);
  });

  it('deleteRoutine removes the given row by 0-based grid index', async () => {
    const sheets = createMockSheets([HEADER, ['月', '週報作成', '09:00', '管理', 30]]);
    const repo = createRoutinesRepository({ sheets, spreadsheetId: 'sid' });

    // rowNumber 2 (1-based, header is row 1) -> 0-based grid index 1.
    await repo.deleteRoutine(2);
    expect(sheets.deletedRows).toEqual([{ sheetId: 99, rowIndex: 1 }]);
  });
});
