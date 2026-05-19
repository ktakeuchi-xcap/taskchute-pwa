import Dexie, { type Table } from 'dexie';
import type { Task } from '@/features/tasks/types';
import type { WaitingTask } from '@/features/waiting/types';

export interface MutationRecord {
  id?: number;
  createdAt: number;
  kind:
    | 'addTask'
    | 'startTask'
    | 'endTask'
    | 'editTask'
    | 'deleteTask'
    | 'addWaiting'
    | 'editWaiting'
    | 'completeWaiting';
  payload: unknown;
  status: 'pending' | 'syncing' | 'failed';
  retries: number;
  lastError?: string;
}

export interface CategoryRecord {
  name: string;
  order: number;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

class TaskchuteDB extends Dexie {
  tasks!: Table<Task, string>;
  waitingTasks!: Table<WaitingTask, string>;
  categories!: Table<CategoryRecord, string>;
  mutationQueue!: Table<MutationRecord, number>;
  meta!: Table<MetaRecord, string>;

  constructor() {
    super('taskchute');
    this.version(1).stores({
      tasks: 'taskId, status, scheduledStartTime',
      waitingTasks: 'systemTaskId, completed, followUpDate',
      categories: 'name, order',
      mutationQueue: '++id, createdAt, status',
      meta: 'key',
    });
  }
}

export const db = new TaskchuteDB();
