import { describe, expect, it } from 'vitest';
import {
  parseSchedule,
  matchesSchedule,
  parseRoutineRows,
  InvalidScheduleError,
} from './scheduleEvaluator';

describe('parseSchedule', () => {
  it('parses 毎日 as daily', () => {
    expect(parseSchedule('毎日')).toEqual({ kind: 'daily' });
  });
  it('parses weekday kanji', () => {
    expect(parseSchedule('月')).toEqual({ kind: 'weekday', day: 1 });
    expect(parseSchedule('日')).toEqual({ kind: 'weekday', day: 0 });
    expect(parseSchedule('土')).toEqual({ kind: 'weekday', day: 6 });
  });
  it('parses 初日 / 末日', () => {
    expect(parseSchedule('初日')).toEqual({ kind: 'monthFirst' });
    expect(parseSchedule('末日')).toEqual({ kind: 'monthLast' });
  });
  it('parses day-of-month like 15日', () => {
    expect(parseSchedule('15日')).toEqual({ kind: 'dayOfMonth', day: 15 });
    expect(parseSchedule('1日')).toEqual({ kind: 'dayOfMonth', day: 1 });
  });
  it('rejects garbage', () => {
    expect(() => parseSchedule('hoge')).toThrow(InvalidScheduleError);
    expect(() => parseSchedule('32日')).toThrow(InvalidScheduleError);
  });
});

describe('matchesSchedule', () => {
  const wednesday20 = {
    year: 2026,
    monthOneBased: 5,
    day: 20,
    weekday: 3 as const,
  };

  it('matches daily', () => {
    expect(matchesSchedule({ kind: 'daily' }, wednesday20)).toBe(true);
  });
  it('matches weekday on the right day', () => {
    expect(matchesSchedule({ kind: 'weekday', day: 3 }, wednesday20)).toBe(true);
    expect(matchesSchedule({ kind: 'weekday', day: 1 }, wednesday20)).toBe(false);
  });
  it('matches monthFirst only on day 1', () => {
    expect(matchesSchedule({ kind: 'monthFirst' }, { ...wednesday20, day: 1 })).toBe(true);
    expect(matchesSchedule({ kind: 'monthFirst' }, wednesday20)).toBe(false);
  });
  it('matches monthLast on actual last day', () => {
    expect(
      matchesSchedule(
        { kind: 'monthLast' },
        { year: 2026, monthOneBased: 5, day: 31, weekday: 0 },
      ),
    ).toBe(true);
    expect(
      matchesSchedule(
        { kind: 'monthLast' },
        { year: 2026, monthOneBased: 4, day: 30, weekday: 4 },
      ),
    ).toBe(true);
    expect(
      matchesSchedule(
        { kind: 'monthLast' },
        { year: 2026, monthOneBased: 5, day: 30, weekday: 6 },
      ),
    ).toBe(false);
  });
  it('matches dayOfMonth', () => {
    expect(matchesSchedule({ kind: 'dayOfMonth', day: 15 }, { ...wednesday20, day: 15 })).toBe(
      true,
    );
    expect(matchesSchedule({ kind: 'dayOfMonth', day: 15 }, wednesday20)).toBe(false);
  });
});

describe('parseRoutineRows', () => {
  const HEADER = ['Schedule', 'TaskName', 'StartTime', 'Category', 'EstimateMinutes'];

  it('parses time as Sheets fraction-of-day', () => {
    const fraction = 9 / 24; // 09:00
    const parsed = parseRoutineRows([HEADER, ['毎日', '朝会', fraction, '管理', 15]]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.routine.startTime).toEqual({ hour: 9, minute: 0 });
  });

  it('parses time as HH:mm string', () => {
    const parsed = parseRoutineRows([HEADER, ['月', '週次', '10:30', '', 60]]);
    expect(parsed[0]!.routine.startTime).toEqual({ hour: 10, minute: 30 });
    expect(parsed[0]!.routine.schedule).toEqual({ kind: 'weekday', day: 1 });
  });

  it('skips rows with invalid schedule or missing fields', () => {
    const parsed = parseRoutineRows([
      HEADER,
      ['毎日', '', '09:00', '', 30], // missing task name
      ['unknown', 'task', '09:00', '', 30], // bad schedule
      ['毎日', 'task', '25:00', '', 30], // bad time
      ['毎日', 'task', '09:00', '', 0], // zero estimate
      ['毎日', '有効', '09:00', '管理', 30],
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.routine.taskName).toBe('有効');
  });
});
