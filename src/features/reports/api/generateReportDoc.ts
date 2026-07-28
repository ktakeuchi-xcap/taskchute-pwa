import type { DocsClient } from '@/lib/google/docs';
import type { DriveClient } from '@/lib/google/drive';
import {
  BASE_FONT_PT,
  TABLE_COLUMN_WIDTHS_PT,
  TABLE_DATA_FONT_PT,
  TABLE_HEADER_FONT_PT,
  type ReportDocContent,
} from '../reportData';

export interface GenerateReportDocDeps {
  docs: DocsClient;
  drive: DriveClient;
}

export interface GeneratedReportDoc {
  documentId: string;
  url: string;
}

function fontSizeRequest(startIndex: number, endIndex: number, pointSize: number) {
  return {
    updateTextStyle: {
      range: { startIndex, endIndex },
      textStyle: { fontSize: { magnitude: pointSize, unit: 'PT' } },
      fields: 'fontSize',
    },
  };
}

function boldRequest(startIndex: number, endIndex: number) {
  return {
    updateTextStyle: {
      range: { startIndex, endIndex },
      textStyle: { bold: true },
      fields: 'bold',
    },
  };
}

function rightAlignRequest(startIndex: number, endIndex: number) {
  return {
    updateParagraphStyle: {
      range: { startIndex, endIndex },
      paragraphStyle: { alignment: 'END' },
      fields: 'alignment',
    },
  };
}

/** A thin solid black rule on all four sides — approximates the 検収印 box in the standard format. */
function boxBorderRequest(startIndex: number, endIndex: number) {
  const border = {
    color: { color: { rgbColor: {} } },
    width: { magnitude: 1, unit: 'PT' },
    padding: { magnitude: 4, unit: 'PT' },
    dashStyle: 'SOLID',
  };
  return {
    updateParagraphStyle: {
      range: { startIndex, endIndex },
      paragraphStyle: {
        alignment: 'END',
        borderTop: border,
        borderBottom: border,
        borderLeft: border,
        borderRight: border,
      },
      fields: 'alignment,borderTop,borderBottom,borderLeft,borderRight',
    },
  };
}

/**
 * Creates the actual Google Doc for a report, in two passes:
 *
 * 1. Insert all the plain-text paragraphs (header block) plus an empty
 *    table — insertTable only creates the grid, it can't seed cell text at
 *    creation time, so cells are filled in a second pass below. Column
 *    widths ARE set here, since they're a table-structure property (not a
 *    text run style) and don't have the inheritance risk described below.
 * 2. Read the document back to find where each table cell (and the
 *    paragraph Docs auto-inserts right after the table) actually landed,
 *    then insert the footer + all six cells' text, ordered from the largest
 *    index to the smallest (inserting at a later position never shifts the
 *    indices of the earlier ones still queued behind it), followed by every
 *    text/paragraph style change. Styling is applied LAST, after every
 *    insertion, because Docs makes newly inserted text inherit the style of
 *    whatever immediately precedes the insertion point — styling the header
 *    block before the table/footer existed made the table headers, table
 *    data, and the entire footer inherit that styling too (ISS-27/ISS-28).
 */
export async function generateReportDoc(
  deps: GenerateReportDocDeps,
  content: ReportDocContent,
  folderId: string,
): Promise<GeneratedReportDoc> {
  const { docs, drive } = deps;
  const { documentId } = await docs.create(content.title);

  // headerText has no trailing "\n", so without this, insertTable's location
  // would land mid-paragraph (merged into the still-open final paragraph of
  // the fresh document) instead of at a paragraph boundary — Docs rejects
  // that with a 400. The extra "\n" gives the table its own fresh paragraph
  // to start at; it isn't part of headerText itself, so none of the
  // style ranges computed against headerText's own length are affected.
  const headerBlock = content.headerText + '\n';
  const tableInsertIndex = 1 + headerBlock.length;
  await docs.batchUpdate(documentId, [
    { insertText: { location: { index: 1 }, text: headerBlock } },
    { insertTable: { location: { index: tableInsertIndex }, rows: 2, columns: 3 } },
    ...TABLE_COLUMN_WIDTHS_PT.map((widthPt, columnIndex) => ({
      updateTableColumnProperties: {
        tableStartLocation: { index: tableInsertIndex },
        columnIndices: [columnIndex],
        tableColumnProperties: {
          widthType: 'FIXED_WIDTH',
          width: { magnitude: widthPt, unit: 'PT' },
        },
        fields: 'widthType,width',
      },
    })),
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

  const insertions: Array<{ index: number; text: string; fontSizePt: number }> = [
    { index: trailingEl.startIndex, text: content.footerText, fontSizePt: BASE_FONT_PT },
  ];
  cells.forEach((cell, i) => {
    const cellStart = cell?.content[0]?.startIndex;
    if (cellStart === undefined) {
      throw new Error('作業報告書の表セルの取得に失敗しました（想定外のドキュメント構造）');
    }
    const fontSizePt = i < 3 ? TABLE_HEADER_FONT_PT : TABLE_DATA_FONT_PT;
    insertions.push({ index: cellStart, text: cellTexts[i], fontSizePt });
  });
  insertions.sort((a, b) => b.index - a.index);

  const footerBoxAbsolute = {
    start: trailingEl.startIndex + content.footerBoxRange.start,
    end: trailingEl.startIndex + content.footerBoxRange.end,
  };

  await docs.batchUpdate(documentId, [
    ...insertions.map((i) => ({ insertText: { location: { index: i.index }, text: i.text } })),
    // Base size for the whole header block first, then the narrower
    // title/total-line overrides after so they win where ranges overlap.
    fontSizeRequest(1, tableInsertIndex, BASE_FONT_PT),
    ...content.headerFontSizeRanges.map((r) =>
      fontSizeRequest(1 + r.range.start, 1 + r.range.end, r.pointSize),
    ),
    ...content.headerBoldRanges.map((r) => boldRequest(1 + r.start, 1 + r.end)),
    ...content.headerRightAlignRanges.map((r) => rightAlignRequest(1 + r.start, 1 + r.end)),
    ...insertions.map((i) => fontSizeRequest(i.index, i.index + i.text.length, i.fontSizePt)),
    boxBorderRequest(footerBoxAbsolute.start, footerBoxAbsolute.end),
  ]);

  if (folderId) {
    await drive.moveToFolder(documentId, folderId);
  }

  return { documentId, url: `https://docs.google.com/document/d/${documentId}/edit` };
}
