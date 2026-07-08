import { describe, expect, it } from 'vitest';
import {
  parseSchedule,
  matchesSchedule,
  parseRoutineRows,
  InvalidScheduleError,
} from './scheduleEvaluator';

describe('parseSchedule', () => {
  it('parses 毎営業日 as businessDay', () => {
    expect(parseSchedule('毎営業日')).toEqual({ kind: 'businessDay' });
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

  it('matches businessDay on an ordinary weekday', () => {
    expect(matchesSchedule({ kind: 'businessDay' }, wednesday20)).toBe(true);
  });
  it('excludes weekends from businessDay', () => {
    expect(matchesSchedule({ kind: 'businessDay' }, { ...wednesday20, day: 23, weekday: 6 })).toBe(
      false,
    );
    expect(matchesSchedule({ kind: 'businessDay' }, { ...wednesday20, day: 24, weekday: 0 })).toBe(
      false,
    );
  });
  it('excludes Japanese national holidays from businessDay', () => {
    // 2026-01-12 (Mon) is 成人の日 (Coming of Age Day).
    expect(
      matchesSchedule(
        { kind: 'businessDay' },
        { year: 2026, monthOneBased: 1, day: 12, weekday: 1 },
      ),
    ).toBe(false);
  });
  it('matches weekday on the right day', () => {
    expect(matchesSchedule({ kind: 'weekday', day: 3 }, wednesday20)).toBe(true);
    expect(matchesSchedule({ kind: 'weekday', day: 1 }, wednesday20)).toBe(false);
  });
  it('matches monthFirst only on day 1', () => {
    expect(matchesSchedule({ kind: 'monthFirst' }, { ...wednesday20, day: 1 })).toBe(true);
    expect(matchesSchedule({ kind: 'monthFirst' }, wednesday20)).toBe(false);
  });
  it('matches monthLast on actual last day (when it is a business day)', () => {
    // 2026-07-31 is a Friday, not a holiday.
    expect(
      matchesSchedule({ kind: 'monthLast' }, { year: 2026, monthOneBased: 7, day: 31, weekday: 5 }),
    ).toBe(true);
    expect(
      matchesSchedule({ kind: 'monthLast' }, { year: 2026, monthOneBased: 4, day: 30, weekday: 4 }),
    ).toBe(true);
    expect(
      matchesSchedule({ kind: 'monthLast' }, { year: 2026, monthOneBased: 7, day: 30, weekday: 4 }),
    ).toBe(false);
  });

  describe('holiday roll-back for month-anchored schedules (初日/末日/◯日)', () => {
    it('rolls monthLast back from Sunday to the preceding Friday', () => {
      // 2026-05-31 is a Sunday; 05-30 (Sat) is also a non-business day.
      expect(
        matchesSchedule(
          { kind: 'monthLast' },
          { year: 2026, monthOneBased: 5, day: 31, weekday: 0 },
        ),
      ).toBe(false);
      expect(
        matchesSchedule(
          { kind: 'monthLast' },
          { year: 2026, monthOneBased: 5, day: 30, weekday: 6 },
        ),
      ).toBe(false);
      expect(
        matchesSchedule(
          { kind: 'monthLast' },
          { year: 2026, monthOneBased: 5, day: 29, weekday: 5 },
        ),
      ).toBe(true);
    });

    it('rolls monthFirst back across a month boundary when the 1st is a holiday Monday', () => {
      // 2026-05-04 is a Monday and みどりの日 (national holiday);
      // 05-03 (Sun) and 05-02 (Sat) are also non-business — rolls back to 05-01 (Fri).
      expect(
        matchesSchedule(
          { kind: 'monthFirst' },
          { year: 2026, monthOneBased: 5, day: 4, weekday: 1 },
        ),
      ).toBe(false);
      expect(
        matchesSchedule(
          { kind: 'monthFirst' },
          { year: 2026, monthOneBased: 5, day: 1, weekday: 5 },
        ),
      ).toBe(true);
    });

    it('rolls dayOfMonth back to a business day', () => {
      // 2026-05-16 is a Saturday -> rolls back to 05-15 (Fri).
      expect(
        matchesSchedule(
          { kind: 'dayOfMonth', day: 16 },
          { year: 2026, monthOneBased: 5, day: 16, weekday: 6 },
        ),
      ).toBe(false);
      expect(
        matchesSchedule(
          { kind: 'dayOfMonth', day: 16 },
          { year: 2026, monthOneBased: 5, day: 15, weekday: 5 },
        ),
      ).toBe(true);
    });

    it('never matches a day-of-month that does not exist in the given month', () => {
      // February never has a 31st.
      expect(
        matchesSchedule(
          { kind: 'dayOfMonth', day: 31 },
          { year: 2026, monthOneBased: 2, day: 28, weekday: 6 },
        ),
      ).toBe(false);
    });
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
    const parsed = parseRoutineRows([HEADER, ['毎営業日', '朝会', fraction, '管理', 15]]);
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
      ['毎営業日', '', '09:00', '', 30], // missing task name
      ['unknown', 'task', '09:00', '', 30], // bad schedule
      ['毎営業日', 'task', '25:00', '', 30], // bad time
      ['毎営業日', 'task', '09:00', '', 0], // zero estimate
      ['毎営業日', '有効', '09:00', '管理', 30],
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.routine.taskName).toBe('有効');
  });
});
