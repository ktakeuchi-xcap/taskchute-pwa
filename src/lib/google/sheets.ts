import { gfetch, gfetchJson } from './fetcher';
import type { AuthClient } from './client';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const VALUE_INPUT = 'USER_ENTERED';

export interface ValueRange {
  range: string;
  values: unknown[][];
}

export interface SheetMetadata {
  sheetId: number;
  title: string;
}

export interface SheetsClient {
  /** Read a range. Empty cells become empty strings. */
  getValues(spreadsheetId: string, range: string): Promise<unknown[][]>;
  /** Append rows to the bottom of a range. */
  appendRows(spreadsheetId: string, range: string, rows: unknown[][]): Promise<void>;
  /** Update a contiguous range. */
  updateRange(spreadsheetId: string, range: string, values: unknown[][]): Promise<void>;
  /** Update many disjoint ranges in one HTTP call. */
  batchUpdateValues(spreadsheetId: string, data: ValueRange[]): Promise<void>;
  /** Delete a single row by 0-based row index. Needs the numeric sheet ID. */
  deleteRow(spreadsheetId: string, sheetId: number, rowIndex: number): Promise<void>;
  /** Resolve numeric sheet IDs by name. */
  getSheetMetadata(spreadsheetId: string): Promise<SheetMetadata[]>;
}

function encodeRange(range: string): string {
  return encodeURIComponent(range);
}

export function createSheetsClient(auth: AuthClient): SheetsClient {
  return {
    async getValues(spreadsheetId, range) {
      const url =
        `${BASE}/${spreadsheetId}/values/${encodeRange(range)}` +
        `?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
      const data = await gfetchJson<{ values?: unknown[][] }>(auth, url);
      return data.values ?? [];
    },

    async appendRows(spreadsheetId, range, rows) {
      const url =
        `${BASE}/${spreadsheetId}/values/${encodeRange(range)}:append` +
        `?valueInputOption=${VALUE_INPUT}&insertDataOption=INSERT_ROWS`;
      await gfetch(auth, url, { method: 'POST', json: { values: rows } });
    },

    async updateRange(spreadsheetId, range, values) {
      const url =
        `${BASE}/${spreadsheetId}/values/${encodeRange(range)}` +
        `?valueInputOption=${VALUE_INPUT}`;
      await gfetch(auth, url, {
        method: 'PUT',
        json: { range, values, majorDimension: 'ROWS' },
      });
    },

    async batchUpdateValues(spreadsheetId, data) {
      const url = `${BASE}/${spreadsheetId}/values:batchUpdate`;
      await gfetch(auth, url, {
        method: 'POST',
        json: { valueInputOption: VALUE_INPUT, data },
      });
    },

    async deleteRow(spreadsheetId, sheetId, rowIndex) {
      const url = `${BASE}/${spreadsheetId}:batchUpdate`;
      await gfetch(auth, url, {
        method: 'POST',
        json: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId,
                  dimension: 'ROWS',
                  startIndex: rowIndex,
                  endIndex: rowIndex + 1,
                },
              },
            },
          ],
        },
      });
    },

    async getSheetMetadata(spreadsheetId) {
      const url = `${BASE}/${spreadsheetId}?fields=sheets(properties(sheetId,title))`;
      const data = await gfetchJson<{
        sheets: Array<{ properties: { sheetId: number; title: string } }>;
      }>(auth, url);
      return data.sheets.map((s) => s.properties);
    },
  };
}
