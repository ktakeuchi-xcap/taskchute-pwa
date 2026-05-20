export const WAITING_SHEET = 'WaitingList';

export const WAITING_HEADERS = {
  SystemTaskID: 'SystemTaskID',
  TaskName: 'TaskName',
  WaitingFor: 'WaitingFor',
  DelegatedDate: 'DelegatedDate',
  FollowUpDate: 'FollowUpDate',
  GoogleTaskID: 'GoogleTaskID',
} as const;

export type WaitingHeader = (typeof WAITING_HEADERS)[keyof typeof WAITING_HEADERS];
