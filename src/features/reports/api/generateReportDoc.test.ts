import { describe, expect, it } from 'vitest';
import { generateReportDoc } from './generateReportDoc';
import type { DocsClient, DocDocument } from '@/lib/google/docs';
import type { DriveClient } from '@/lib/google/drive';
import type { ReportDocContent } from '../reportData';

const CONTENT: ReportDocContent = {
  title: '作業報告書_案件A_2026年6月',
  headerText: 'header-block-text', // 17 chars — "header"(0-6) + "-block-text"
  headerBoldRanges: [{ start: 0, end: 6 }],
  headerFontSizeRanges: [{ range: { start: 0, end: 6 }, pointSize: 16 }],
  headerRightAlignRanges: [{ start: 7, end: 12 }], // "block"
  tableHeaderCells: ['No.', 'アクティビティ', '作業実績'],
  tableDataCells: ['1', '案件A', '・週次MTGへの参加'],
  footerText: 'footer-block-text', // 17 chars, same shape as headerText
  footerBoxRange: { start: 7, end: 12 }, // "block"
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
  it('inserts the header block, an empty table, and the column widths in the first batchUpdate — no text styling yet', async () => {
    const docs = createMockDocs();
    const drive = createMockDrive();
    await generateReportDoc({ docs, drive }, CONTENT, 'folder-1');

    const first = docs.batchCalls[0] as Array<Record<string, unknown>>;
    // A trailing "\n" is added so the table starts a fresh paragraph — Docs
    // rejects insertTable at a mid-paragraph location with a 400.
    const tableInsertIndex = 1 + 'header-block-text'.length + 1;
    expect(first[0]).toEqual({
      insertText: { location: { index: 1 }, text: 'header-block-text\n' },
    });
    expect(first[1]).toEqual({
      insertTable: { location: { index: tableInsertIndex }, rows: 2, columns: 3 },
    });
    const columnRequests = first.slice(2) as Array<{
      updateTableColumnProperties: {
        tableStartLocation: { index: number };
        columnIndices: number[];
        tableColumnProperties: { width: { magnitude: number } };
      };
    }>;
    expect(columnRequests.map((r) => r.updateTableColumnProperties.columnIndices)).toEqual([
      [0],
      [1],
      [2],
    ]);
    expect(
      columnRequests.map(
        (r) => r.updateTableColumnProperties.tableColumnProperties.width.magnitude,
      ),
    ).toEqual([29.2, 132.7, 326]);
    expect(
      columnRequests.every(
        (r) => r.updateTableColumnProperties.tableStartLocation.index === tableInsertIndex,
      ),
    ).toBe(true);
  });

  it('fills the footer and all six cells in the second batchUpdate, ordered from the largest index down, styling last', async () => {
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

    // All insertText requests come first (as a contiguous block), everything
    // after them is styling — applied last so nothing subsequently inserted
    // can inherit it (the bug this regression guards, see ISS-27).
    expect(second.slice(0, insertions.length).every((r) => 'insertText' in r)).toBe(true);
    expect(second.slice(insertions.length).every((r) => !('insertText' in r))).toBe(true);
  });

  it('applies the base font size to the whole header block, then overrides the title/total-line ranges', async () => {
    const docs = createMockDocs();
    const drive = createMockDrive();
    await generateReportDoc({ docs, drive }, CONTENT, 'folder-1');

    const second = docs.batchCalls[1] as Array<Record<string, unknown>>;
    const fontSizeRequests = second.filter(
      (
        r,
      ): r is {
        updateTextStyle: {
          range: { startIndex: number; endIndex: number };
          textStyle: { fontSize?: { magnitude: number } };
        };
      } =>
        'updateTextStyle' in r &&
        !!(r as { updateTextStyle: { textStyle?: { fontSize?: unknown } } }).updateTextStyle
          .textStyle?.fontSize,
    );
    // Base size over the whole header block (index 1 .. tableInsertIndex,
    // which includes the extra trailing "\n").
    expect(fontSizeRequests[0]).toEqual({
      updateTextStyle: {
        range: { startIndex: 1, endIndex: 1 + 'header-block-text'.length + 1 },
        textStyle: { fontSize: { magnitude: 12, unit: 'PT' } },
        fields: 'fontSize',
      },
    });
    // Title override (start 0, end 6 within headerText -> absolute 1..7) at 16pt.
    expect(fontSizeRequests[1]).toEqual({
      updateTextStyle: {
        range: { startIndex: 1, endIndex: 7 },
        textStyle: { fontSize: { magnitude: 16, unit: 'PT' } },
        fields: 'fontSize',
      },
    });
  });

  it('bolds only the requested header ranges', async () => {
    const docs = createMockDocs();
    const drive = createMockDrive();
    await generateReportDoc({ docs, drive }, CONTENT, 'folder-1');

    const second = docs.batchCalls[1] as Array<Record<string, unknown>>;
    expect(second).toContainEqual({
      updateTextStyle: {
        range: { startIndex: 1, endIndex: 7 },
        textStyle: { bold: true },
        fields: 'bold',
      },
    });
  });

  it('right-aligns the report-date and sender-name lines', async () => {
    const docs = createMockDocs();
    const drive = createMockDrive();
    await generateReportDoc({ docs, drive }, CONTENT, 'folder-1');

    const second = docs.batchCalls[1] as Array<Record<string, unknown>>;
    expect(second).toContainEqual({
      updateParagraphStyle: {
        range: { startIndex: 8, endIndex: 13 },
        paragraphStyle: { alignment: 'END' },
        fields: 'alignment',
      },
    });
  });

  it('sizes table header cells at 12pt and data cells at 10.5pt', async () => {
    const docs = createMockDocs();
    const drive = createMockDrive();
    await generateReportDoc({ docs, drive }, CONTENT, 'folder-1');

    const second = docs.batchCalls[1] as Array<{
      updateTextStyle?: {
        range: { startIndex: number; endIndex: number };
        textStyle: { fontSize?: { magnitude: number } };
      };
    }>;
    const byStart = new Map(
      second
        .filter((r) => r.updateTextStyle?.textStyle.fontSize)
        .map((r) => [
          r.updateTextStyle!.range.startIndex,
          r.updateTextStyle!.textStyle.fontSize!.magnitude,
        ]),
    );
    expect(byStart.get(53)).toBe(12); // "No."
    expect(byStart.get(56)).toBe(12); // "アクティビティ"
    expect(byStart.get(61)).toBe(12); // "作業実績"
    expect(byStart.get(82)).toBe(10.5); // "1"
    expect(byStart.get(91)).toBe(10.5); // "案件A"
    expect(byStart.get(101)).toBe(10.5); // activity text
  });

  it('boxes and right-aligns the 検収印 block (年月日/宛先/担当) at the correct absolute offset', async () => {
    const docs = createMockDocs();
    const drive = createMockDrive();
    await generateReportDoc({ docs, drive }, CONTENT, 'folder-1');

    const second = docs.batchCalls[1] as Array<Record<string, unknown>>;
    // footer inserted at 120; footerBoxRange {7,12} -> absolute 127..132.
    expect(second).toContainEqual({
      updateParagraphStyle: {
        range: { startIndex: 127, endIndex: 132 },
        paragraphStyle: expect.objectContaining({
          alignment: 'END',
          borderTop: expect.objectContaining({ width: { magnitude: 1, unit: 'PT' } }),
          borderBottom: expect.anything(),
          borderLeft: expect.anything(),
          borderRight: expect.anything(),
        }),
        fields: 'alignment,borderTop,borderBottom,borderLeft,borderRight',
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
