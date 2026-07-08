export type ScheduleKind = 'businessDay' | 'weekday' | 'monthFirst' | 'monthLast' | 'dayOfMonth';

/**
 * Build the raw sheet schedule string(s) for a form selection.
 * `weekday` can produce multiple strings (one per selected day) — every other
 * kind always produces exactly one.
 */
export function buildScheduleRawList(
  kind: ScheduleKind,
  selectedWeekdays: string[],
  dayOfMonth: string,
): string[] {
  switch (kind) {
    case 'businessDay':
      return ['毎営業日'];
    case 'weekday':
      return selectedWeekdays;
    case 'monthFirst':
      return ['初日'];
    case 'monthLast':
      return ['末日'];
    case 'dayOfMonth':
      return [`${dayOfMonth}日`];
  }
}
