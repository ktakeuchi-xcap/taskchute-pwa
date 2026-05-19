/**
 * Column header names used by the legacy GAS Taskchute schema.
 * Order in the sheet is not assumed — we always look up by name.
 */

export const TASKDB_SHEET = 'TaskDB';
export const SETTINGS_SHEET = 'Settings';

export const TASKDB_HEADERS = {
  TaskID: 'TaskID',
  TaskName: 'TaskName',
  Category: 'Category',
  EstimateMinutes: 'EstimateMinutes',
  ScheduledStartTime: 'ScheduledStartTime',
  ScheduledEndTime: 'ScheduledEndTime',
  ActualStartTime: 'ActualStartTime',
  ActualEndTime: 'ActualEndTime',
  Status: 'Status',
  CalendarEventID: 'CalendarEventID',
} as const;

export type TaskDbHeader = (typeof TASKDB_HEADERS)[keyof typeof TASKDB_HEADERS];

export class HeaderNotFoundError extends Error {
  constructor(header: string) {
    super(`Header "${header}" not found in sheet`);
    this.name = 'HeaderNotFoundError';
  }
}

/**
 * Build a `header name -> 0-based column index` map from a header row.
 * Throws if any required header is missing.
 */
export function buildHeaderIndex<T extends Record<string, string>>(
  row: unknown[],
  required: T,
): Record<keyof T, number> {
  const index = {} as Record<keyof T, number>;
  for (const key of Object.keys(required) as Array<keyof T>) {
    const headerName = required[key];
    const col = row.findIndex((cell) => cell === headerName);
    if (col === -1) throw new HeaderNotFoundError(headerName);
    index[key] = col;
  }
  return index;
}
