import type { SheetsClient } from '@/lib/google/sheets';
import { formatDateForSheet, parseSheetDateCell } from '@/lib/google/sheetDate';

/**
 * A reserved, out-of-the-way cell (far from any data other code touches) used
 * as a cross-device/cross-tab sync lock. Sheets has no real compare-and-swap,
 * so this is a "soft" lock: there's still a brief race between one device's
 * read and its write, but that window is a single API round-trip instead of
 * an entire multi-second sync — orders of magnitude less likely to collide
 * than not locking at all.
 */
const LOCK_CELL = 'Settings!Z1';

/** Longer than a sync normally takes, shorter than the 30s auto-sync interval. */
const LOCK_TTL_MS = 20_000;

/**
 * Attempts to claim the lock. Returns false if another device/tab claimed it
 * recently (within LOCK_TTL_MS) — the caller should treat that as "someone
 * else is already syncing" and skip this run rather than proceeding.
 *
 * A stale lock (owner crashed / tab closed before releasing) self-heals once
 * LOCK_TTL_MS elapses — there's no permanent deadlock.
 */
export async function tryAcquireSyncLock(
  sheets: SheetsClient,
  spreadsheetId: string,
  now: Date,
): Promise<boolean> {
  const values = await sheets.getValues(spreadsheetId, LOCK_CELL);
  const lastLock = parseSheetDateCell(values[0]?.[0]);
  if (lastLock && now.getTime() - lastLock.getTime() < LOCK_TTL_MS) {
    return false;
  }
  await sheets.updateRange(spreadsheetId, LOCK_CELL, [[formatDateForSheet(now)]]);
  return true;
}

export async function releaseSyncLock(sheets: SheetsClient, spreadsheetId: string): Promise<void> {
  await sheets.updateRange(spreadsheetId, LOCK_CELL, [['']]);
}
