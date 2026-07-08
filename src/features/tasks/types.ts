export const TaskStatus = {
  NotStarted: 'Not Started',
  InProgress: 'In Progress',
  Done: 'Done',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

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
