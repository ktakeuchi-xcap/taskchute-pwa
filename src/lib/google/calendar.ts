import { gfetch, gfetchJson } from './fetcher';
import type { AuthClient } from './client';

const BASE = 'https://www.googleapis.com/calendar/v3/calendars';

export const CalendarColor = {
  Gray: '8',
  Yellow: '5',
  Green: '2',
} as const;
export type CalendarColorId = (typeof CalendarColor)[keyof typeof CalendarColor];

export interface CalendarEvent {
  id: string;
  summary: string;
  start: Date;
  end: Date;
  colorId: string | null;
  /** All-day events use a date-only start/end with no time-of-day. */
  isAllDay: boolean;
  /** The signed-in user's own RSVP, or null if they're not listed as an attendee (e.g. a solo event). */
  selfResponseStatus: string | null;
  /** Points to the master event's id for one instance of a recurring series; null for a standalone event. */
  recurringEventId: string | null;
}

export interface CalendarEventInput {
  summary: string;
  start: Date;
  end: Date;
  colorId?: string;
}

export interface CalendarEventPatch {
  summary?: string;
  start?: Date;
  end?: Date;
  colorId?: string;
}

export interface CalendarClient {
  list(calendarId: string, timeMin: Date, timeMax: Date): Promise<CalendarEvent[]>;
  insert(calendarId: string, input: CalendarEventInput): Promise<CalendarEvent>;
  patch(calendarId: string, eventId: string, patch: CalendarEventPatch): Promise<CalendarEvent>;
  delete(calendarId: string, eventId: string): Promise<void>;
}

interface ApiEvent {
  id: string;
  summary?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  colorId?: string;
  attendees?: Array<{ self?: boolean; responseStatus?: string }>;
  recurringEventId?: string;
}

function toEvent(raw: ApiEvent): CalendarEvent {
  const startStr = raw.start.dateTime ?? raw.start.date;
  const endStr = raw.end.dateTime ?? raw.end.date;
  if (!startStr || !endStr) throw new Error(`Calendar event ${raw.id} missing start/end`);
  return {
    id: raw.id,
    summary: raw.summary ?? '',
    start: new Date(startStr),
    end: new Date(endStr),
    colorId: raw.colorId ?? null,
    isAllDay: raw.start.dateTime === undefined,
    selfResponseStatus: raw.attendees?.find((a) => a.self)?.responseStatus ?? null,
    recurringEventId: raw.recurringEventId ?? null,
  };
}

function toApiPayload(input: CalendarEventInput | CalendarEventPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.summary !== undefined) out.summary = input.summary;
  if (input.colorId !== undefined) out.colorId = input.colorId;
  if (input.start) out.start = { dateTime: input.start.toISOString() };
  if (input.end) out.end = { dateTime: input.end.toISOString() };
  return out;
}

export function createCalendarClient(auth: AuthClient): CalendarClient {
  return {
    async list(calendarId, timeMin, timeMax) {
      const params = new URLSearchParams({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '2500',
      });
      const url = `${BASE}/${encodeURIComponent(calendarId)}/events?${params}`;
      const data = await gfetchJson<{ items?: ApiEvent[] }>(auth, url);
      return (data.items ?? []).map(toEvent);
    },

    async insert(calendarId, input) {
      const url = `${BASE}/${encodeURIComponent(calendarId)}/events`;
      const data = await gfetchJson<ApiEvent>(auth, url, {
        method: 'POST',
        json: toApiPayload(input),
      });
      return toEvent(data);
    },

    async patch(calendarId, eventId, patch) {
      const url = `${BASE}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
      const data = await gfetchJson<ApiEvent>(auth, url, {
        method: 'PATCH',
        json: toApiPayload(patch),
      });
      return toEvent(data);
    },

    async delete(calendarId, eventId) {
      const url = `${BASE}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
      await gfetch(auth, url, { method: 'DELETE' });
    },
  };
}
