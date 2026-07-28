import { describe, expect, it } from 'vitest';
import { generateReportDoc } from './generateReportDoc';
import type { DocsClient, DocDocument } from '@/lib/google/docs';
import type { DriveClient } from '@/lib/google/drive';
import type { ReportDocContent } from '../reportData';

const CONTENT: ReportDocContent = {
  title: '作業報告書_案件A_2026年6月',
  headerText: 'header-block-text',
  headerBoldRanges: [{ start: 0, end: 6 }],
  tableHeaderCells: ['No.', 'アクティビティ', '作業実績'],
  tableDataCells: ['1', '案件A', '・週次MTGへの参加'],
  footerText: 'footer-block-text',
};

function fakeDocAfterTableInsert(): DocDocument {
  return {
    documentId: 'doc1',
    body: {
      content: [
        { startIndex: 1, endIndex: 50, paragraph: {} },
        {
          startIndex: 50,
          endIndex: 120,
          table: {
            rows: 2,
            columns: 3,
            tableRows: [
              {
                startIndex: 51,
                endIndex: 80,
                tableCells: [
                  { startIndex: 52, endIndex: 55, content: [{ startIndex: 53, endIndex: 54 }] },
                  { startIndex: 55, endIndex: 60, content: [{ startIndex: 56, endIndex: 57 }] },
                  { startIndex: 60, endIndex: 79, content: [{ startIndex: 61, endIndex: 62 }] },
                ],
              },
              {
                startIndex: 80,
                endIndex: 119,
                tableCells: [
                  { startIndex: 81, endIndex: 89, content: [{ startIndex: 82, endIndex: 83 }] },
                  { startIndex: 89, endIndex: 99, content: [{ startIndex: 91, endIndex: 92 }] },
                  { startIndex: 99, endIndex: 119, content: [{ startIndex: 101, endIndex: 102 }] },
                ],
              },
            ],
          },
        },
        { startIndex: 120, endIndex: 121, paragraph: {} },
      ],
    },
  };
}

function createMockDocs(): DocsClient & { batchCalls: unknown[][] } {
  const batchCalls: unknown[][] = [];
  return {
    batchCalls,
    async create() {
      return { documentId: 'doc1' };
    },
    async batchUpdate(_documentId, requests) {
      batchCalls.push(requests);
    },
    async get() {
      return fakeDocAfterTableInsert();
    },
  };
}

function createMockDrive(): DriveClient & { moved: Array<{ fileId: string; folderId: string }> } {
  const moved: Array<{ fileId: string; folderId: string }> = [];
  return {
    moved,
    async moveToFolder(fileId, folderId) {
      moved.push({ fileId, folderId });
    },
  };
}

describe('generateReportDoc', () => {
  it('inserts the header block and an empty table in the first batchUpdate — no bold styling yet', async () => {
    const docs = createMockDocs();
    const drive = createMockDrive();
    await generateReportDoc({ docs, drive }, CONTENT, 'folder-1');

    const first = docs.batchCalls[0] as Array<Record<string, unknown>>;
    expect(first).toEqual([
      { insertText: { location: { index: 1 }, text: 'header-block-text' } },
      {
        insertTable: { location: { index: 1 + 'header-block-text'.length }, rows: 2, columns: 3 },
      },
    ]);
  });

  it('fills the footer and all six cells in the second batchUpdate, ordered from the largest index down, then bolds the header ranges last', async () => {
    const docs = createMockDocs();
    const drive = createMockDrive();
    await generateReportDoc({ docs, drive }, CONTENT, 'folder-1');

    const second = docs.batchCalls[1] as Array<Record<string, unknown>>;
    const insertions = second.filter(
      (r): r is { insertText: { location: { index: number }; text: string } } => 'insertText' in r,
    );
    const indices = insertions.map((r) => r.insertText.location.index);
    expect(indices).toEqual([120, 101, 91, 82, 61, 56, 53]);

    const byIndex = new Map(
      insertions.map((r) => [r.insertText.location.index, r.insertText.text]),
    );
    expect(byIndex.get(120)).toBe('footer-block-text');
    expect(byIndex.get(53)).toBe('No.');
    expect(byIndex.get(56)).toBe('アクティビティ');
    expect(byIndex.get(61)).toBe('作業実績');
    expect(byIndex.get(82)).toBe('1');
    expect(byIndex.get(91)).toBe('案件A');
    expect(byIndex.get(101)).toBe('・週次MTGへの参加');

    // Bold styling is applied last — after every insertion — so nothing
    // subsequently inserted can inherit it (the bug this regression guards).
    expect(second[second.length - 1]).toEqual({
      updateTextStyle: {
        range: { startIndex: 1, endIndex: 7 },
        textStyle: { bold: true },
        fields: 'bold',
      },
    });
  });

  it('moves the created doc into the given folder and returns its edit URL', async () => {
    const docs = createMockDocs();
    const drive = createMockDrive();
    const result = await generateReportDoc({ docs, drive }, CONTENT, 'folder-1');

    expect(drive.moved).toEqual([{ fileId: 'doc1', folderId: 'folder-1' }]);
    expect(result).toEqual({
      documentId: 'doc1',
      url: 'https://docs.google.com/document/d/doc1/edit',
    });
  });

  it('skips moving the file when no folder is configured', async () => {
    const docs = createMockDocs();
    const drive = createMockDrive();
    await generateReportDoc({ docs, drive }, CONTENT, '');
    expect(drive.moved).toEqual([]);
  });

  it('throws a clear error if the document has no table after the insert (unexpected structure)', async () => {
    const docs: DocsClient = {
      async create() {
        return { documentId: 'doc1' };
      },
      async batchUpdate() {},
      async get() {
        return { documentId: 'doc1', body: { content: [{ startIndex: 1, endIndex: 2 }] } };
      },
    };
    const drive = createMockDrive();
    await expect(generateReportDoc({ docs, drive }, CONTENT, 'folder-1')).rejects.toThrow(
      '想定外のドキュメント構造',
    );
  });
});
