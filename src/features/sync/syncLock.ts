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

const LOCK_POLL_INTERVAL_MS = 750;
// Longer than LOCK_TTL_MS so a lock that's still held by the time this
// expires must belong to a genuinely stuck holder (crashed mid-sync without
// releasing), not just ordinary contention — that's the only case this
// throws for.
const LOCK_WAIT_TIMEOUT_MS = 25_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Like tryAcquireSyncLock, but waits (polling) for the lock instead of
 * giving up immediately. A sync run is fine to skip and retry on its own
 * next cycle if the lock is taken — but an ordinary task/meeting mutation
 * (start/end/edit/delete/tag) is user-initiated and must actually happen,
 * so it waits instead.
 *
 * This exists because ordinary mutations read a task's current row number
 * and later write back to that same row number — if a concurrent sync
 * deletes/inserts rows in between, that row number goes stale and the write
 * lands on the wrong physical row (confirmed in production: a "counts
 * toward workload" toggle landed on an unrelated row after row numbers
 * shifted underneath it). Holding this same lock for the mutation's entire
 * read-then-write span rules out a sync doing that shifting concurrently.
 */
export async function acquireSyncLockOrWait(
  sheets: SheetsClient,
  spreadsheetId: string,
): Promise<void> {
  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;
  for (;;) {
    if (await tryAcquireSyncLock(sheets, spreadsheetId, new Date())) return;
    if (Date.now() >= deadline) {
      throw new Error(
        '同期処理と競合しており、ロックを取得できませんでした。しばらくしてからもう一度お試しください。',
      );
    }
    await sleep(LOCK_POLL_INTERVAL_MS);
  }
}
