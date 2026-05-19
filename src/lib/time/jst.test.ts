import { describe, expect, it } from 'vitest';
import { jstDate, formatJst } from './jst';

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
