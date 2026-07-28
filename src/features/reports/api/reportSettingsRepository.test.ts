import { describe, expect, it } from 'vitest';
import {
  deleteReportSetting,
  getReportSetting,
  listReportSettings,
  upsertReportSetting,
} from './reportSettingsRepository';
import { REPORT_SETTINGS_SHEET } from './headers';
import type { SheetsClient, ValueRange } from '@/lib/google/sheets';

const HEADER = ['Category', 'ClientName', 'FolderID'];

function mockSheets(values: unknown[][] | (() => never)): SheetsClient {
  return {
    async getValues() {
      if (typeof values === 'function') return values();
      return values;
    },
    async appendRows() {},
    async updateRange() {},
    async batchUpdateValues() {},
    async deleteRow() {},
    async deleteRows() {},
    async getSheetMetadata() {
      return [];
    },
    async addSheet() {
      return { sheetId: 1, title: '' };
    },
  };
}

interface RecordingSheetsOptions {
  values?: unknown[][];
  throwsOnGetValues?: boolean;
}

function createRecordingSheets(options: RecordingSheetsOptions): SheetsClient & {
  appendCalls: unknown[][][];
  updateRangeCalls: Array<{ range: string; values: unknown[][] }>;
  batchUpdateCalls: ValueRange[][];
  deleteRowCalls: Array<{ sheetId: number; rowIndex: number }>;
  addSheetCalls: string[];
} {
  const appendCalls: unknown[][][] = [];
  const updateRangeCalls: Array<{ range: string; values: unknown[][] }> = [];
  const batchUpdateCalls: ValueRange[][] = [];
  const deleteRowCalls: Array<{ sheetId: number; rowIndex: number }> = [];
  const addSheetCalls: string[] = [];
  return {
    appendCalls,
    updateRangeCalls,
    batchUpdateCalls,
    deleteRowCalls,
    addSheetCalls,
    async getValues() {
      if (options.throwsOnGetValues) throw new Error('Unable to parse range');
      return options.values ?? [];
    },
    async appendRows(_id, _range, rows) {
      appendCalls.push(rows);
    },
    async updateRange(_id, range, values) {
      updateRangeCalls.push({ range, values });
    },
    async batchUpdateValues(_id, data) {
      batchUpdateCalls.push(data);
    },
    async deleteRow(_id, sheetId, rowIndex) {
      deleteRowCalls.push({ sheetId, rowIndex });
    },
    async deleteRows() {},
    async getSheetMetadata() {
      return [{ sheetId: 5, title: REPORT_SETTINGS_SHEET }];
    },
    async addSheet(_id, title) {
      addSheetCalls.push(title);
      return { sheetId: 5, title };
    },
  };
}

describe('listReportSettings', () => {
  it('returns [] when the sheet does not exist yet', async () => {
    const sheets = mockSheets(() => {
      throw new Error('Unable to parse range');
    });
    expect(await listReportSettings(sheets, 'sid')).toEqual([]);
  });

  it('returns [] when the header row is missing expected columns', async () => {
    const sheets = mockSheets([['Category', 'SomethingElse']]);
    expect(await listReportSettings(sheets, 'sid')).toEqual([]);
  });

  it('parses each row, skipping ones with no category', async () => {
    const sheets = mockSheets([
      HEADER,
      ['案件A', '株式会社PKSHA Technology', 'folder-a'],
      ['', 'ignored', 'ignored'],
      ['案件B', '株式会社NHK', 'folder-b'],
    ]);
    const result = await listReportSettings(sheets, 'sid');
    expect(result).toEqual([
      { category: '案件A', clientName: '株式会社PKSHA Technology', folderId: 'folder-a' },
      { category: '案件B', clientName: '株式会社NHK', folderId: 'folder-b' },
    ]);
  });
});

describe('getReportSetting', () => {
  it('finds the row matching the given category', async () => {
    const sheets = mockSheets([HEADER, ['案件A', '株式会社PKSHA Technology', 'folder-a']]);
    const result = await getReportSetting(sheets, 'sid', '案件A');
    expect(result).toEqual({
      category: '案件A',
      clientName: '株式会社PKSHA Technology',
      folderId: 'folder-a',
    });
  });

  it('returns null when no row matches', async () => {
    const sheets = mockSheets([HEADER, ['案件A', '株式会社PKSHA Technology', 'folder-a']]);
    expect(await getReportSetting(sheets, 'sid', '案件C')).toBeNull();
  });
});

describe('upsertReportSetting', () => {
  it('creates the sheet (with header row) first when it does not exist yet', async () => {
    const sheets = createRecordingSheets({ throwsOnGetValues: true });
    await upsertReportSetting(sheets, 'sid', {
      category: '案件A',
      clientName: '株式会社PKSHA Technology',
      folderId: 'folder-a',
    });

    expect(sheets.addSheetCalls).toEqual([REPORT_SETTINGS_SHEET]);
    expect(sheets.updateRangeCalls[0]).toEqual({
      range: `${REPORT_SETTINGS_SHEET}!A1:C1`,
      values: [HEADER],
    });
    expect(sheets.appendCalls).toEqual([[['案件A', '株式会社PKSHA Technology', 'folder-a']]]);
  });

  it('writes the header row (without creating a new sheet) when the sheet exists but is empty', async () => {
    const sheets = createRecordingSheets({ values: [] });
    await upsertReportSetting(sheets, 'sid', {
      category: '案件A',
      clientName: '株式会社PKSHA Technology',
      folderId: 'folder-a',
    });

    expect(sheets.addSheetCalls).toEqual([]);
    expect(sheets.updateRangeCalls[0]).toEqual({
      range: `${REPORT_SETTINGS_SHEET}!A1:C1`,
      values: [HEADER],
    });
    expect(sheets.appendCalls).toEqual([[['案件A', '株式会社PKSHA Technology', 'folder-a']]]);
  });

  it('appends a new row for a category not already present', async () => {
    const sheets = createRecordingSheets({
      values: [HEADER, ['案件A', '株式会社PKSHA Technology', 'folder-a']],
    });
    await upsertReportSetting(sheets, 'sid', {
      category: '案件B',
      clientName: '株式会社NHK',
      folderId: 'folder-b',
    });

    expect(sheets.appendCalls).toEqual([[['案件B', '株式会社NHK', 'folder-b']]]);
    expect(sheets.batchUpdateCalls).toEqual([]);
  });

  it('updates the existing row in place for a category already present', async () => {
    const sheets = createRecordingSheets({
      values: [
        HEADER,
        ['案件A', '株式会社PKSHA Technology', 'folder-a'],
        ['案件B', '株式会社NHK', 'folder-b'],
      ],
    });
    await upsertReportSetting(sheets, 'sid', {
      category: '案件B',
      clientName: '株式会社NHK放送',
      folderId: 'folder-b2',
    });

    expect(sheets.appendCalls).toEqual([]);
    expect(sheets.batchUpdateCalls).toEqual([
      [
        { range: `${REPORT_SETTINGS_SHEET}!B3`, values: [['株式会社NHK放送']] },
        { range: `${REPORT_SETTINGS_SHEET}!C3`, values: [['folder-b2']] },
      ],
    ]);
  });
});

describe('deleteReportSetting', () => {
  it('deletes the row matching the given category', async () => {
    const sheets = createRecordingSheets({
      values: [
        HEADER,
        ['案件A', '株式会社PKSHA Technology', 'folder-a'],
        ['案件B', '株式会社NHK', 'folder-b'],
      ],
    });
    await deleteReportSetting(sheets, 'sid', '案件B');
    expect(sheets.deleteRowCalls).toEqual([{ sheetId: 5, rowIndex: 2 }]);
  });

  it('throws when the category is not found', async () => {
    const sheets = createRecordingSheets({
      values: [HEADER, ['案件A', '株式会社PKSHA Technology', 'folder-a']],
    });
    await expect(deleteReportSetting(sheets, 'sid', '案件C')).rejects.toThrow('Category not found');
  });

  it('throws when the sheet has no rows at all', async () => {
    const sheets = createRecordingSheets({ values: [] });
    await expect(deleteReportSetting(sheets, 'sid', '案件A')).rejects.toThrow('Category not found');
  });
});
