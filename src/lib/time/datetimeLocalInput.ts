/** Helpers for `<input type="datetime-local">`, which works in naive (no-timezone) wall-clock strings. */

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

/** Round up to the nearest future 15-minute mark (e.g. 10:07 -> 10:15). */
export function ceilToNext15Minutes(date: Date): Date {
  return new Date(Math.ceil(date.getTime() / FIFTEEN_MINUTES_MS) * FIFTEEN_MINUTES_MS);
}

export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function parseDatetimeLocalValue(value: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
