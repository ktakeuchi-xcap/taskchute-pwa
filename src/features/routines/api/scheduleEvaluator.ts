import { addDays } from 'date-fns';
import holidayJp from '@holiday-jp/holiday_jp';
import { jstDate, formatJst } from '@/lib/time/jst';
import type { RoutineTask, Schedule } from '@/features/routines/types';

const WEEKDAY_JP: Record<string, 0 | 1 | 2 | 3 | 4 | 5 | 6> = {
  日: 0,
  月: 1,
  火: 2,
  水: 3,
  木: 4,
  金: 5,
  土: 6,
};

export class InvalidScheduleError extends Error {
  readonly raw: string;
  constructor(raw: string) {
    super(`Unknown schedule: "${raw}"`);
    this.name = 'InvalidScheduleError';
    this.raw = raw;
  }
}

export function parseSchedule(raw: string): Schedule {
  const t = raw.trim();
  if (t === '毎営業日') return { kind: 'businessDay' };
  if (t in WEEKDAY_JP) return { kind: 'weekday', day: WEEKDAY_JP[t]! };
  if (t === '初日') return { kind: 'monthFirst' };
  if (t === '末日') return { kind: 'monthLast' };
  const m = /^(\d{1,2})日$/.exec(t);
  if (m) {
    const day = parseInt(m[1]!, 10);
    if (day >= 1 && day <= 31) return { kind: 'dayOfMonth', day };
  }
  throw new InvalidScheduleError(raw);
}

export interface JstDateParts {
  year: number;
  monthOneBased: number;
  day: number;
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

function lastDayOfMonth(year: number, monthOneBased: number): number {
  return new Date(Date.UTC(year, monthOneBased, 0)).getUTCDate();
}

/**
 * Look up the holiday table by plain "YYYY-MM-DD" string key rather than passing
 * a Date through holiday_jp's isHoliday (which reads local getFullYear/getMonth/
 * getDate) — avoids any dependency on the runtime's local timezone matching JST.
 */
function isJstHoliday(date: JstDateParts): boolean {
  const key = `${date.year}-${String(date.monthOneBased).padStart(2, '0')}-${String(
    date.day,
  ).padStart(2, '0')}`;
  return Object.prototype.hasOwnProperty.call(holidayJp.holidays, key);
}

/** Sat/Sun or a JST national holiday, checked against a real Date. */
function isWeekendOrHolidayDate(d: Date): boolean {
  const isoWeekday = formatJst(d, 'i'); // '1'..'7' Mon..Sun
  if (isoWeekday === '6' || isoWeekday === '7') return true;
  return Object.prototype.hasOwnProperty.call(holidayJp.holidays, formatJst(d, 'yyyy-MM-dd'));
}

/**
 * Walk backwards day by day until landing on a business day. Used for
 * month-anchored schedules (初日/末日/◯日): if the nominal day falls on a
 * weekend or holiday, the occurrence moves to the nearest preceding business
 * day (can cross a month boundary, e.g. May 1st being a holiday Monday
 * rolls back into the previous month).
 */
function previousBusinessDay(date: Date): Date {
  let d = date;
  while (isWeekendOrHolidayDate(d)) {
    d = addDays(d, -1);
  }
  return d;
}

/** True if `date` is the holiday-adjusted occurrence of `nominalDay` in its month. */
function matchesMonthAnchoredDay(date: JstDateParts, nominalDay: number): boolean {
  const nominal = jstDate(date.year, date.monthOneBased, nominalDay);
  const actual = previousBusinessDay(nominal);
  const candidate = jstDate(date.year, date.monthOneBased, date.day);
  return actual.getTime() === candidate.getTime();
}

export function matchesSchedule(schedule: Schedule, date: JstDateParts): boolean {
  switch (schedule.kind) {
    case 'businessDay':
      // 土日祝を除く平日のみ。
      return date.weekday !== 0 && date.weekday !== 6 && !isJstHoliday(date);
    case 'weekday':
      return date.weekday === schedule.day;
    case 'monthFirst':
      return matchesMonthAnchoredDay(date, 1);
    case 'monthLast':
      return matchesMonthAnchoredDay(date, lastDayOfMonth(date.year, date.monthOneBased));
    case 'dayOfMonth': {
      const lastDay = lastDayOfMonth(date.year, date.monthOneBased);
      if (schedule.day > lastDay) return false; // e.g. "31日" doesn't exist in February
      return matchesMonthAnchoredDay(date, schedule.day);
    }
  }
}

export interface ParsedRoutineRow {
  routine: RoutineTask;
  raw: { schedule: string };
}

export function parseTime(raw: unknown): { hour: number; minute: number } | null {
  if (raw === null || raw === undefined || raw === '') return null;
  // Sheets often stores time-only cells as a fraction of a day (e.g. 09:00 = 0.375).
  if (typeof raw === 'number') {
    if (raw < 0 || raw >= 1) return null;
    const totalMinutes = Math.round(raw * 24 * 60);
    return { hour: Math.floor(totalMinutes / 60), minute: totalMinutes % 60 };
  }
  if (typeof raw === 'string') {
    const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
    if (!m) return null;
    const hour = parseInt(m[1]!, 10);
    const minute = parseInt(m[2]!, 10);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return { hour, minute };
  }
  return null;
}

export function parseRoutineRows(values: unknown[][]): ParsedRoutineRow[] {
  if (values.length === 0) return [];
  const [headerRow, ...rows] = values;
  if (!headerRow) return [];
  const headers = headerRow.map((c) => (typeof c === 'string' ? c : String(c)));
  const idx = {
    schedule: headers.indexOf('Schedule'),
    taskName: headers.indexOf('TaskName'),
    startTime: headers.indexOf('StartTime'),
    category: headers.indexOf('Category'),
    estimateMinutes: headers.indexOf('EstimateMinutes'),
  };
  if (idx.schedule === -1 || idx.taskName === -1 || idx.startTime === -1) return [];

  const out: ParsedRoutineRow[] = [];
  for (const row of rows) {
    const rawSchedule = row[idx.schedule];
    const taskName = row[idx.taskName];
    if (typeof rawSchedule !== 'string' || rawSchedule.trim() === '') continue;
    if (typeof taskName !== 'string' || taskName.trim() === '') continue;
    let schedule: Schedule;
    try {
      schedule = parseSchedule(rawSchedule);
    } catch {
      continue;
    }
    const startTime = parseTime(row[idx.startTime]);
    if (!startTime) continue;
    const category = idx.category !== -1 ? String(row[idx.category] ?? '') : '';
    const rawEstimate = idx.estimateMinutes !== -1 ? row[idx.estimateMinutes] : 0;
    const estimateMinutes = typeof rawEstimate === 'number' ? rawEstimate : Number(rawEstimate);
    if (!Number.isFinite(estimateMinutes) || estimateMinutes <= 0) continue;

    out.push({
      routine: { schedule, taskName, startTime, category, estimateMinutes },
      raw: { schedule: rawSchedule },
    });
  }
  return out;
}
