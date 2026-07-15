import { describe, expect, it } from 'vitest';
import { tryAcquireSyncLock, releaseSyncLock } from './syncLock';
import type { SheetsClient } from '@/lib/google/sheets';
import { dateToSheetSerial } from '@/lib/google/sheetDate';

function mockSheets(initialCell: unknown = ''): SheetsClient & { updateCalls: unknown[][][] } {
  let cell = initialCell;
  const updateCalls: unknown[][][] = [];
  return {
    updateCalls,
    async getValues() {
      return [[cell]];
    },
    async appendRows() {},
    async updateRange(_id, _range, values) {
      updateCalls.push(values);
      cell = values[0]![0];
    },
    async batchUpdateValues() {},
    async deleteRow() {},
    async deleteRows() {},
    async getSheetMetadata() {
      return [];
    },
  };
}

describe('tryAcquireSyncLock', () => {
  it('acquires the lock when the cell is empty', async () => {
    const sheets = mockSheets('');
    const acquired = await tryAcquireSyncLock(sheets, 'sid', new Date('2026-07-09T10:00:00+09:00'));
    expect(acquired).toBe(true);
    expect(sheets.updateCalls).toHaveLength(1);
  });

  it('fails to acquire when another lock was written recently', async () => {
    const lockedAt = new Date('2026-07-09T10:00:00+09:00');
    const sheets = mockSheets(dateToSheetSerial(lockedAt));
    const acquired = await tryAcquireSyncLock(sheets, 'sid', new Date(lockedAt.getTime() + 5_000));
    expect(acquired).toBe(false);
    expect(sheets.updateCalls).toHaveLength(0);
  });

  it('acquires again once the lock has gone stale (TTL elapsed)', async () => {
    const lockedAt = new Date('2026-07-09T10:00:00+09:00');
    const sheets = mockSheets(dateToSheetSerial(lockedAt));
    const acquired = await tryAcquireSyncLock(sheets, 'sid', new Date(lockedAt.getTime() + 21_000));
    expect(acquired).toBe(true);
  });
});

describe('releaseSyncLock', () => {
  it('clears the lock cell', async () => {
    const sheets = mockSheets(dateToSheetSerial(new Date()));
    await releaseSyncLock(sheets, 'sid');
    expect(sheets.updateCalls).toEqual([[['']]]);
  });
});
