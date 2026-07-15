import { describe, expect, it } from 'vitest';
import { jstDate } from '@/lib/time/jst';
import { DAILY_CAPACITY_MINUTES, expectedProgressPercent, WORKDAY_START_HOUR } from './workload';

describe('expectedProgressPercent', () => {
  it('is 0 before the workday starts', () => {
    const before = jstDate(2026, 7, 15, WORKDAY_START_HOUR - 1, 0);
    expect(expectedProgressPercent(before)).toBe(0);
  });

  it('is 50 halfway through the workday', () => {
    const halfwayMinutes = DAILY_CAPACITY_MINUTES / 2;
    const halfway = new Date(
      jstDate(2026, 7, 15, WORKDAY_START_HOUR, 0).getTime() + halfwayMinutes * 60_000,
    );
    expect(expectedProgressPercent(halfway)).toBeCloseTo(50, 5);
  });

  it('caps at 100 once the workday capacity has fully elapsed', () => {
    const after = new Date(
      jstDate(2026, 7, 15, WORKDAY_START_HOUR, 0).getTime() +
        (DAILY_CAPACITY_MINUTES + 60) * 60_000,
    );
    expect(expectedProgressPercent(after)).toBe(100);
  });
});
