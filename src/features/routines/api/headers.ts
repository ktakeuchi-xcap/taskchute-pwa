export const ROUTINES_SHEET = 'RoutineTasks';

export const ROUTINE_HEADERS = {
  Schedule: 'Schedule',
  TaskName: 'TaskName',
  StartTime: 'StartTime',
  Category: 'Category',
  EstimateMinutes: 'EstimateMinutes',
} as const;

export type RoutineHeader = (typeof ROUTINE_HEADERS)[keyof typeof ROUTINE_HEADERS];
