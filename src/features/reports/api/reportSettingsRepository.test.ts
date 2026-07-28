import { describe, expect, it } from 'vitest';
import { getReportSetting, listReportSettings } from './reportSettingsRepository';
import type { SheetsClient } from '@/lib/google/sheets';

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
