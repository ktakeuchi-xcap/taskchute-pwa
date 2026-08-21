/** DOM id for a task's row in TaskList — lets callers (e.g. DayTimeline) scroll a specific row into view. */
export function taskRowElementId(taskId: string): string {
  return `task-row-${taskId}`;
}
