/**
 * Conversions between Google Sheets' serial-number date representation and JS Date.
 *
 * Sheets stores dates as floating-point days since 1899-12-30 in the spreadsheet's
 * timezone. Our Taskchute spreadsheet is set to Asia/Tokyo (JST, UTC+9, no DST).
 *
 * For reads we request `dateTimeRenderOption=SERIAL_NUMBER` and convert here.
 * For writes we pass ISO strings with `valueInputOption=USER_ENTERED`, which lets
 * Sheets parse to its internal serial representation; no manual conversion needed.
 */

const SHEETS_EPOCH_OFFSET_DAYS = 25569;
const MS_PER_DAY = 86_400_000;
/** JST is fixed at UTC+9 — no DST, no historical exceptions in modern era. */
const JST_OFFSET_MS = 9 * 3_600_000;

export function sheetSerialToDate(serial: number): Date {
  // serial is fractional days in JST → ms in JST → subtract JST offset for UTC.
  // Round to whole milliseconds; floating-point math otherwise drifts by sub-ms.
  return new Date(Math.round((serial - SHEETS_EPOCH_OFFSET_DAYS) * MS_PER_DAY - JST_OFFSET_MS));
}

export function dateToSheetSerial(date: Date): number {
  return (date.getTime() + JST_OFFSET_MS) / MS_PER_DAY + SHEETS_EPOCH_OFFSET_DAYS;
}

export function parseSheetDateCell(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return sheetSerialToDate(value);
  if (typeof value === 'string') {
    // Try ISO first, then fall back to Sheets' typical "yyyy/M/d H:mm:ss" display format.
    const iso = new Date(value);
    if (!Number.isNaN(iso.getTime())) return iso;
    const normalized = value.replace(/\//g, '-').replace(' ', 'T');
    const fallback = new Date(`${normalized}+09:00`);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  return null;
}

/** Format a Date for `valueInputOption=USER_ENTERED` writes. */
export function formatDateForSheet(date: Date): string {
  return date.toISOString();
}
