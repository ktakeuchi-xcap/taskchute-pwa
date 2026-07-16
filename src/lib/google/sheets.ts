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
  /**
   * Delete several rows in one API call instead of one round trip per row.
   * Order doesn't matter — internally sorted descending so each deletion in
   * the same batchUpdate request doesn't shift the row indices still queued
   * behind it (Google applies a batch's requests in array order).
   */
  deleteRows(spreadsheetId: string, sheetId: number, rowIndexes: number[]): Promise<void>;
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
      // A bare sheet name (no "!") leaves it to Google's own "find the
      // table" heuristic to guess which column the data starts at, based on
      // the sheet's actual content — and that guess can drift over repeated
      // calls (confirmed in production: appends landing progressively
      // further right each sync cycle — e.g. columns M, then U, then AC,
      // each +8 further — instead of staying at column A, once optional
      // trailing columns like CountsTowardWorkload had inconsistent/sparse
      // data confusing the detection). Anchoring at column A removes the
      // ambiguity outright: the table always starts there, so appends
      // always land at A regardless of what the rest of the sheet looks
      // like.
      const anchoredRange = range.includes('!') ? range : `${range}!A1`;
      const url =
        `${BASE}/${spreadsheetId}/values/${encodeRange(anchoredRange)}:append` +
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

    async deleteRows(spreadsheetId, sheetId, rowIndexes) {
      if (rowIndexes.length === 0) return;
      const url = `${BASE}/${spreadsheetId}:batchUpdate`;
      const sortedDesc = [...rowIndexes].sort((a, b) => b - a);
      await gfetch(auth, url, {
        method: 'POST',
        json: {
          requests: sortedDesc.map((rowIndex) => ({
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex,
                endIndex: rowIndex + 1,
              },
            },
          })),
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
