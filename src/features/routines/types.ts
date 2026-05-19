export type Schedule =
  | { kind: 'daily' }
  | { kind: 'weekday'; day: 0 | 1 | 2 | 3 | 4 | 5 | 6 }
  | { kind: 'monthFirst' }
  | { kind: 'monthLast' }
  | { kind: 'dayOfMonth'; day: number };

export interface RoutineTask {
  schedule: Schedule;
  taskName: string;
  startTime: { hour: number; minute: number };
  category: string;
  estimateMinutes: number;
}
