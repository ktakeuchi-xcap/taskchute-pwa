import { gfetch, gfetchJson } from './fetcher';
import type { AuthClient } from './client';
import { formatJst } from '@/lib/time/jst';

const BASE = 'https://tasks.googleapis.com/tasks/v1';
const DEFAULT_LIST = '@default';

export type GoogleTaskStatus = 'needsAction' | 'completed';

export interface GoogleTask {
  id: string;
  title: string;
  notes: string | null;
  /** JST midnight Date, or null. Google Tasks only stores the date portion. */
  due: Date | null;
  status: GoogleTaskStatus;
}

export interface GoogleTaskInput {
  title: string;
  notes?: string;
  /** JST date. Time portion is dropped by Google Tasks. */
  due?: Date;
}

export interface GoogleTaskPatch {
  title?: string;
  notes?: string;
  due?: Date | null;
  status?: GoogleTaskStatus;
}

export interface TasksClient {
  list(): Promise<GoogleTask[]>;
  insert(input: GoogleTaskInput): Promise<GoogleTask>;
  patch(id: string, patch: GoogleTaskPatch): Promise<GoogleTask>;
  get(id: string): Promise<GoogleTask>;
  delete(id: string): Promise<void>;
}

interface ApiTask {
  id: string;
  title?: string;
  notes?: string;
  due?: string;
  status?: string;
}

/**
 * Google Tasks `due` only stores a date (the time component is dropped).
 * We send and read `YYYY-MM-DDT00:00:00.000Z` so the date round-trips
 * losslessly regardless of the user's locale or DST quirks.
 */
function dateToTasksDue(date: Date): string {
  // Use the JST date components so a "tomorrow" picked in JST stays tomorrow.
  return `${formatJst(date, 'yyyy-MM-dd')}T00:00:00.000Z`;
}

function tasksDueToDate(value: string | undefined): Date | null {
  if (!value) return null;
  const datePart = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  return new Date(`${datePart}T00:00:00+09:00`);
}

function toGoogleTask(raw: ApiTask): GoogleTask {
  return {
    id: raw.id,
    title: raw.title ?? '',
    notes: raw.notes ?? null,
    due: tasksDueToDate(raw.due),
    status: raw.status === 'completed' ? 'completed' : 'needsAction',
  };
}

function toApiPayload(input: GoogleTaskInput | GoogleTaskPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.title !== undefined) out.title = input.title;
  if (input.notes !== undefined) out.notes = input.notes;
  if ('status' in input && input.status !== undefined) out.status = input.status;
  if ('due' in input) {
    out.due = input.due ? dateToTasksDue(input.due) : null;
  }
  return out;
}

export function createTasksClient(auth: AuthClient): TasksClient {
  return {
    async list() {
      // showCompleted=true is the default; raise maxResults so we see the whole list.
      const url = `${BASE}/lists/${DEFAULT_LIST}/tasks?maxResults=100&showCompleted=true&showHidden=true`;
      const data = await gfetchJson<{ items?: ApiTask[] }>(auth, url);
      return (data.items ?? []).map(toGoogleTask);
    },
    async insert(input) {
      const url = `${BASE}/lists/${DEFAULT_LIST}/tasks`;
      const data = await gfetchJson<ApiTask>(auth, url, {
        method: 'POST',
        json: toApiPayload(input),
      });
      return toGoogleTask(data);
    },
    async patch(id, patch) {
      const url = `${BASE}/lists/${DEFAULT_LIST}/tasks/${encodeURIComponent(id)}`;
      const data = await gfetchJson<ApiTask>(auth, url, {
        method: 'PATCH',
        json: toApiPayload(patch),
      });
      return toGoogleTask(data);
    },
    async get(id) {
      const url = `${BASE}/lists/${DEFAULT_LIST}/tasks/${encodeURIComponent(id)}`;
      const data = await gfetchJson<ApiTask>(auth, url);
      return toGoogleTask(data);
    },
    async delete(id) {
      const url = `${BASE}/lists/${DEFAULT_LIST}/tasks/${encodeURIComponent(id)}`;
      await gfetch(auth, url, { method: 'DELETE' });
    },
  };
}

/** Title formatting for waiting tasks: `[WAIT] WaitingFor: TaskName` or `[WAIT] TaskName`. */
export function formatWaitingTitle(taskName: string, waitingFor: string | null): string {
  return waitingFor ? `[WAIT] ${waitingFor}: ${taskName}` : `[WAIT] ${taskName}`;
}

const WITH_DELEGATE_RE = /^\[WAIT\]\s*(.*?):\s*(.*)$/s;
const BARE_RE = /^\[WAIT\]\s*(.*)$/s;

export function parseWaitingTitle(title: string): {
  taskName: string;
  waitingFor: string | null;
} {
  const m = WITH_DELEGATE_RE.exec(title);
  if (m && m[1] !== undefined && m[2] !== undefined) {
    return { waitingFor: m[1], taskName: m[2] };
  }
  const m2 = BARE_RE.exec(title);
  if (m2 && m2[1] !== undefined) {
    return { waitingFor: null, taskName: m2[1] };
  }
  return { waitingFor: null, taskName: title };
}
