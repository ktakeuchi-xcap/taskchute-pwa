export interface WaitingTask {
  systemTaskId: string;
  taskName: string;
  waitingFor: string | null;
  delegatedDate: Date;
  followUpDate: Date | null;
  googleTaskId: string;
  completed: boolean;
}

export interface WaitingTaskInput {
  taskName: string;
  waitingFor?: string;
  followUpDate?: Date;
}
