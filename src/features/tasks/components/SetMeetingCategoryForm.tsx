import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useCategories } from '@/features/tasks/hooks/useCategories';
import { useSetMeetingCategory } from '@/features/tasks/hooks/useTaskMutations';
import { MeetingCategoryScope, type Task } from '@/features/tasks/types';

interface SetMeetingCategoryFormProps {
  task: Task;
  onCancel: () => void;
  onSaved: () => void;
}

const SCOPE_OPTIONS: Array<{ value: MeetingCategoryScope; label: string }> = [
  { value: MeetingCategoryScope.This, label: 'この予定' },
  { value: MeetingCategoryScope.FromThis, label: 'これ以降のすべての予定' },
  { value: MeetingCategoryScope.All, label: 'すべての予定' },
];

export function SetMeetingCategoryForm({ task, onCancel, onSaved }: SetMeetingCategoryFormProps) {
  const [category, setCategory] = useState(task.category ?? '');
  const [scope, setScope] = useState<MeetingCategoryScope>(MeetingCategoryScope.This);
  const [serverError, setServerError] = useState<string | null>(null);

  const categoriesQuery = useCategories();
  const mutation = useSetMeetingCategory();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerError(null);
    try {
      await mutation.mutateAsync({ taskId: task.taskId, category: category || null, scope });
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

      <div className="space-y-1.5">
        <Label htmlFor="meeting-category">案件</Label>
        <select
          id="meeting-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">（未選択）</option>
          {(categoriesQuery.data ?? []).map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label>反映範囲</Label>
        <div className="space-y-1.5">
          {SCOPE_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="meeting-category-scope"
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
