import type { DocsClient } from '@/lib/google/docs';
import type { DriveClient } from '@/lib/google/drive';
import type { ReportDocContent } from '../reportData';

export interface GenerateReportDocDeps {
  docs: DocsClient;
  drive: DriveClient;
}

export interface GeneratedReportDoc {
  documentId: string;
  url: string;
}

/**
 * Creates the actual Google Doc for a report, in two passes:
 *
 * 1. Insert all the plain-text paragraphs (header block) plus an empty
 *    table — insertTable only creates the grid, it can't seed cell text at
 *    creation time, so cells are filled in a second pass below.
 * 2. Read the document back to find where each table cell (and the
 *    paragraph Docs auto-inserts right after the table) actually landed,
 *    then insert the footer + all six cells' text in one batchUpdate,
 *    ordered from the largest index to the smallest — inserting at a later
 *    position never shifts the indices of the earlier ones still queued
 *    behind it in the same request array.
 */
export async function generateReportDoc(
  deps: GenerateReportDocDeps,
  content: ReportDocContent,
  folderId: string,
): Promise<GeneratedReportDoc> {
  const { docs, drive } = deps;
  const { documentId } = await docs.create(content.title);

  const tableInsertIndex = 1 + content.headerText.length;
  await docs.batchUpdate(documentId, [
    { insertText: { location: { index: 1 }, text: content.headerText } },
    ...content.headerBoldRanges.map((r) => ({
      updateTextStyle: {
        range: { startIndex: 1 + r.start, endIndex: 1 + r.end },
        textStyle: { bold: true },
        fields: 'bold',
      },
    })),
    { insertTable: { location: { index: tableInsertIndex }, rows: 2, columns: 3 } },
  ]);

  const doc = await docs.get(documentId);
  const tableArrIndex = doc.body.content.findIndex((el) => el.table);
  const tableEl = doc.body.content[tableArrIndex];
  // Docs always keeps at least one paragraph after a table so typing can
  // continue past it — that auto-inserted paragraph is where the footer goes.
  const trailingEl = doc.body.content[tableArrIndex + 1];
  const table = tableEl?.table;
  if (!table || !trailingEl || trailingEl.startIndex === undefined) {
    throw new Error('作業報告書の表構造の取得に失敗しました（想定外のドキュメント構造）');
  }

  const cellTexts: [string, string, string, string, string, string] = [
    ...content.tableHeaderCells,
    ...content.tableDataCells,
  ];
  const cells = [
    table.tableRows[0]?.tableCells[0],
    table.tableRows[0]?.tableCells[1],
    table.tableRows[0]?.tableCells[2],
    table.tableRows[1]?.tableCells[0],
    table.tableRows[1]?.tableCells[1],
    table.tableRows[1]?.tableCells[2],
  ];

  const insertions: Array<{ index: number; text: string }> = [
    { index: trailingEl.startIndex, text: content.footerText },
  ];
  cells.forEach((cell, i) => {
    const cellStart = cell?.content[0]?.startIndex;
    if (cellStart === undefined) {
      throw new Error('作業報告書の表セルの取得に失敗しました（想定外のドキュメント構造）');
    }
    insertions.push({ index: cellStart, text: cellTexts[i] });
  });
  insertions.sort((a, b) => b.index - a.index);

  await docs.batchUpdate(
    documentId,
    insertions.map((i) => ({ insertText: { location: { index: i.index }, text: i.text } })),
  );

  if (folderId) {
    await drive.moveToFolder(documentId, folderId);
  }

  return { documentId, url: `https://docs.google.com/document/d/${documentId}/edit` };
}
