/**
 * Google Sheets API v4 wrapper.
 * Implemented in M3.
 */

export interface SheetRange {
  spreadsheetId: string;
  sheetName: string;
  range?: string;
}

export interface SheetsClient {
  getValues(range: SheetRange): Promise<unknown[][]>;
  appendRow(range: SheetRange, row: unknown[]): Promise<void>;
  updateCell(range: SheetRange, row: number, col: number, value: unknown): Promise<void>;
  deleteRow(range: SheetRange, rowIndex: number): Promise<void>;
}

export function createSheetsClient(): SheetsClient {
  throw new Error('SheetsClient is not yet implemented (M3).');
}
