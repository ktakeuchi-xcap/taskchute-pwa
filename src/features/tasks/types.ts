export const TaskStatus = {
  NotStarted: 'Not Started',
  InProgress: 'In Progress',
  Done: 'Done',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TaskSource = {
  Meeting: 'Meeting',
} as const;
export type TaskSource = (typeof TaskSource)[keyof typeof TaskSource];

export interface Task {
  taskId: string;
  taskName: string;
  category: string | null;
  estimateMinutes: number;
  scheduledStartTime: Date;
  scheduledEndTime: Date;
  actualStartTime: Date | null;
  actualEndTime: Date | null;
  status: TaskStatus;
  calendarEventId: string;
  /**
   * null for ordinary app-managed tasks. 'Meeting' for tasks synced in
   * read-only from the user's personal meeting calendar — those never get
   * manual start/end/edit/delete from the app (see meetingStatus.ts).
   */
  source: TaskSource | null;
  /**
   * Identifies the recurring series a meeting task belongs to (the master
   * event's id — a standalone meeting uses its own event id). null for
   * non-meeting tasks. Used to scope category tagging across occurrences
   * (see MeetingCategoryScope).
   */
  recurringEventId: string | null;
}

export interface TaskInput {
  taskName: string;
  estimateMinutes: number;
  category?: string;
  startTime?: Date;
}

export interface CategoryInfo {
  name: string;
  color: string | null;
}

/**
 * Which occurrences of a recurring meeting a category tag should apply to:
 * just this one, this one and every later occurrence, or the whole series
 * (past and future).
 */
export const MeetingCategoryScope = {
  This: 'this',
  FromThis: 'from-this',
  All: 'all',
} as const;
export type MeetingCategoryScope = (typeof MeetingCategoryScope)[keyof typeof MeetingCategoryScope];
