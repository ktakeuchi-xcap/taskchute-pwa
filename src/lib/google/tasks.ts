/**
 * Google Tasks API v1 wrapper.
 * Implemented in M4.
 */

export interface GoogleTaskInput {
  title: string;
  notes?: string;
  due?: Date;
}

export interface GoogleTask {
  id: string;
  title: string;
  notes: string | null;
  due: Date | null;
  status: 'needsAction' | 'completed';
}

export interface TasksClient {
  list(): Promise<GoogleTask[]>;
  insert(input: GoogleTaskInput): Promise<GoogleTask>;
  update(id: string, patch: Partial<GoogleTaskInput & { completed: boolean }>): Promise<void>;
  get(id: string): Promise<GoogleTask>;
}

export function createTasksClient(): TasksClient {
  throw new Error('TasksClient is not yet implemented (M4).');
}
