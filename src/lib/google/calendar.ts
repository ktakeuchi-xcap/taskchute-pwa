/**
 * Google Calendar API v3 wrapper.
 * Implemented in M3.
 */

export const CalendarColor = {
  Gray: '8',
  Yellow: '5',
  Green: '2',
} as const;
export type CalendarColor = (typeof CalendarColor)[keyof typeof CalendarColor];

export interface CalendarEventInput {
  summary: string;
  start: Date;
  end: Date;
  colorId?: CalendarColor;
}

export interface CalendarClient {
  insert(input: CalendarEventInput): Promise<{ id: string }>;
  patch(
    eventId: string,
    patch: Partial<CalendarEventInput & { colorId: CalendarColor }>,
  ): Promise<void>;
  delete(eventId: string): Promise<void>;
  list(rangeStart: Date, rangeEnd: Date): Promise<Array<{ id: string; summary: string; start: Date; end: Date }>>;
}

export function createCalendarClient(): CalendarClient {
  throw new Error('CalendarClient is not yet implemented (M3).');
}
