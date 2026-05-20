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
  if (t === '毎日') return { kind: 'daily' };
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

export function matchesSchedule(schedule: Schedule, date: JstDateParts): boolean {
  switch (schedule.kind) {
    case 'daily':
      return true;
    case 'weekday':
      return date.weekday === schedule.day;
    case 'monthFirst':
      return date.day === 1;
    case 'monthLast':
      return date.day === lastDayOfMonth(date.year, date.monthOneBased);
    case 'dayOfMonth':
      return date.day === schedule.day;
  }
}

export interface ParsedRoutineRow {
  routine: RoutineTask;
  raw: { schedule: string };
}

function parseTime(raw: unknown): { hour: number; minute: number } | null {
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
