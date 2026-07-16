import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';
import { isSameDay, startOfDay, endOfDay, addDays } from 'date-fns';

export const JST_TZ = 'Asia/Tokyo';

export const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

/**
 * Construct a Date that represents the given JST wall-clock time.
 * Avoids the UTC-shift bug from the legacy GAS implementation.
 */
export function jstDate(
  year: number,
  monthOneBased: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  const isoLocal = `${year}-${String(monthOneBased).padStart(2, '0')}-${String(day).padStart(
    2,
    '0',
  )}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  return fromZonedTime(isoLocal, JST_TZ);
}

export function formatJst(date: Date, pattern: string): string {
  return formatInTimeZone(date, JST_TZ, pattern);
}

export function jstToday(): Date {
  return toZonedTime(new Date(), JST_TZ);
}

/** ISO day-of-week in JST: 1 (Monday) .. 7 (Sunday) — timezone-safe unlike `date.getDay()`. */
export function jstIsoDayOfWeek(date: Date): number {
  return Number(formatJst(date, 'i'));
}

/** The Monday (JST calendar date) of the week containing `date`. */
export function startOfJstWeek(date: Date): Date {
  return addDays(date, -(jstIsoDayOfWeek(date) - 1));
}

export { isSameDay, startOfDay, endOfDay, addDays };
