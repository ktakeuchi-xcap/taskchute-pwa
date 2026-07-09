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
