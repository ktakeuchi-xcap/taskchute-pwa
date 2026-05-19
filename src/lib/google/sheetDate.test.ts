import { describe, expect, it } from 'vitest';
import {
  sheetSerialToDate,
  dateToSheetSerial,
  parseSheetDateCell,
  formatDateForSheet,
} from './sheetDate';

describe('Sheets date conversion', () => {
  it('round-trips a JST midnight without drift', () => {
    const jstMidnight = new Date('2026-05-19T00:00:00+09:00');
    const serial = dateToSheetSerial(jstMidnight);
    const back = sheetSerialToDate(serial);
    expect(back.toISOString()).toBe(jstMidnight.toISOString());
  });

  it('converts a known sheet serial to the correct JST instant', () => {
    // 2026-05-19 10:00 JST in JST-anchored serial:
    // (2026-05-19 10:00 JST - 1899-12-30 00:00 JST) / 86400 days
    const known = new Date('2026-05-19T10:00:00+09:00');
    const serial = dateToSheetSerial(known);
    expect(sheetSerialToDate(serial).toISOString()).toBe(known.toISOString());
  });

  it('parseSheetDateCell handles serials, ISO strings, and slash-format strings', () => {
    const target = new Date('2026-05-19T10:00:00+09:00');
    const serial = dateToSheetSerial(target);

    expect(parseSheetDateCell(serial)?.toISOString()).toBe(target.toISOString());
    expect(parseSheetDateCell(target.toISOString())?.toISOString()).toBe(target.toISOString());
    expect(parseSheetDateCell('2026/05/19 10:00:00')?.toISOString()).toBe(target.toISOString());
  });

  it('parseSheetDateCell returns null for empty values', () => {
    expect(parseSheetDateCell('')).toBeNull();
    expect(parseSheetDateCell(null)).toBeNull();
    expect(parseSheetDateCell(undefined)).toBeNull();
  });

  it('formatDateForSheet emits ISO with timezone offset', () => {
    const date = new Date('2026-05-19T10:00:00+09:00');
    expect(formatDateForSheet(date)).toBe(date.toISOString());
  });
});
