import { AddTaskForm } from '@/features/tasks/components/AddTaskForm';
import { AddWaitingForm } from '@/features/waiting/components/AddWaitingForm';

export function AddRoute() {
  return (
    <div className="space-y-6 p-4">
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-bold">＋ タスクを追加</h2>
          <p className="text-xs text-muted-foreground">
            Google Calendar にもイベントが自動作成されます
          </p>
        </div>
        <AddTaskForm />
      </section>

      <hr className="border-border" />

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-bold">🤝 確認待ちタスクを追加</h2>
          <p className="text-xs text-muted-foreground">
            Google ToDo にも自動で登録されます
          </p>
        </div>
        <AddWaitingForm />
      </section>
    </div>
  );
}
