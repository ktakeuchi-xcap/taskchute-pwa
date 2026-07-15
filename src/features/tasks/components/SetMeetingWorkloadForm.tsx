import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useSetCountsTowardWorkload } from '@/features/tasks/hooks/useTaskMutations';
import { MeetingCategoryScope, type Task } from '@/features/tasks/types';

interface SetMeetingWorkloadFormProps {
  task: Task;
  onCancel: () => void;
  onSaved: () => void;
}

const SCOPE_OPTIONS: Array<{ value: MeetingCategoryScope; label: string }> = [
  { value: MeetingCategoryScope.This, label: 'この予定' },
  { value: MeetingCategoryScope.FromThis, label: 'これ以降のすべての予定' },
  { value: MeetingCategoryScope.All, label: 'すべての予定' },
];

export function SetMeetingWorkloadForm({ task, onCancel, onSaved }: SetMeetingWorkloadFormProps) {
  const [counts, setCounts] = useState(task.countsTowardWorkload);
  const [scope, setScope] = useState<MeetingCategoryScope>(MeetingCategoryScope.This);
  const [serverError, setServerError] = useState<string | null>(null);

  const mutation = useSetCountsTowardWorkload();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerError(null);
    try {
      await mutation.mutateAsync({ taskId: task.taskId, counts, scope });
      onSaved();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-primary/40 bg-card p-3 shadow-sm"
    >
      <p className="truncate text-sm font-medium">{task.taskName}</p>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={counts}
          onChange={(e) => setCounts(e.target.checked)}
          className="h-4 w-4"
        />
        工数に計上する
      </label>

      <div className="space-y-1.5">
        <Label>反映範囲</Label>
        <div className="space-y-1.5">
          {SCOPE_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="meeting-workload-scope"
                value={opt.value}
                checked={scope === opt.value}
                onChange={() => setScope(opt.value)}
                className="h-4 w-4"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="submit" className="flex-1" disabled={mutation.isPending}>
          {mutation.isPending ? '保存中…' : '保存'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onCancel}
          disabled={mutation.isPending}
        >
          キャンセル
        </Button>
      </div>

      {serverError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          {serverError}
        </div>
      ) : null}
    </form>
  );
}
