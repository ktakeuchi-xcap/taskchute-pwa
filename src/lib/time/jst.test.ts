import { describe, expect, it } from 'vitest';
import { jstDate, formatJst, jstIsoDayOfWeek, startOfJstWeek } from './jst';

describe('jstDate', () => {
  it('builds a Date that represents 2026-05-19 00:00 JST regardless of host TZ', () => {
    const d = jstDate(2026, 5, 19, 0, 0);
    expect(formatJst(d, 'yyyy-MM-dd HH:mm')).toBe('2026-05-19 00:00');
  });

  it('does not drift across midnight (legacy UTC-bug regression)', () => {
    const d = jstDate(2026, 5, 19);
    expect(formatJst(d, 'yyyy-MM-dd')).toBe('2026-05-19');
  });

  it('preserves hour and minute', () => {
    const d = jstDate(2026, 12, 31, 23, 45);
    expect(formatJst(d, 'yyyy-MM-dd HH:mm')).toBe('2026-12-31 23:45');
  });
});

describe('jstIsoDayOfWeek', () => {
  it('returns 1 for Monday and 7 for Sunday', () => {
    // 2026-07-13 is a Monday, 2026-07-19 is the following Sunday.
    expect(jstIsoDayOfWeek(jstDate(2026, 7, 13))).toBe(1);
    expect(jstIsoDayOfWeek(jstDate(2026, 7, 19))).toBe(7);
  });

  it('is unaffected by the time-of-day component', () => {
    expect(jstIsoDayOfWeek(jstDate(2026, 7, 16, 23, 59))).toBe(4); // Thursday
  });
});

describe('startOfJstWeek', () => {
  it('returns the same Monday when given any day in that week', () => {
    const monday = jstDate(2026, 7, 13);
    for (const day of [13, 14, 15, 16, 17, 18, 19]) {
      expect(formatJst(startOfJstWeek(jstDate(2026, 7, day)), 'yyyy-MM-dd')).toBe(
        formatJst(monday, 'yyyy-MM-dd'),
      );
    }
  });

  it('rolls back across a month boundary', () => {
    // 2026-08-02 is a Sunday; the Monday of that week is 2026-07-27.
    expect(formatJst(startOfJstWeek(jstDate(2026, 8, 2)), 'yyyy-MM-dd')).toBe('2026-07-27');
  });
});
