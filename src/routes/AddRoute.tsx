import { AddTaskForm } from '@/features/tasks/components/AddTaskForm';

export function AddRoute() {
  return (
    <div className="space-y-4 p-4">
      <div>
        <h2 className="text-base font-bold">＋ タスクを追加</h2>
        <p className="text-xs text-muted-foreground">
          Google Calendar にもイベントが自動作成されます
        </p>
      </div>
      <AddTaskForm />
    </div>
  );
}
