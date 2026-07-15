import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TaskInputSchema } from '@/features/tasks/validators';
import { useUpdateTask } from '@/features/tasks/hooks/useTaskMutations';
import { useCategories } from '@/features/tasks/hooks/useCategories';
import type { Task } from '@/features/tasks/types';
import { parseDatetimeLocalValue, toDatetimeLocalValue } from '@/lib/time/datetimeLocalInput';

interface EditTaskFormProps {
  task: Task;
  onCancel: () => void;
  onSaved: () => void;
}

export function EditTaskForm({ task, onCancel, onSaved }: EditTaskFormProps) {
  const [name, setName] = useState(task.taskName);
  const [minutes, setMinutes] = useState(String(task.estimateMinutes));
  const [category, setCategory] = useState(task.category ?? '');
  const [startTime, setStartTime] = useState(toDatetimeLocalValue(task.scheduledStartTime));
  const [countsTowardWorkload, setCountsTowardWorkload] = useState(task.countsTowardWorkload);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const categoriesQuery = useCategories();
  const mutation = useUpdateTask();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerError(null);
    setFieldErrors({});

    const result = TaskInputSchema.safeParse({
      taskName: name,
      estimateMinutes: Number(minutes),
      category: category || undefined,
      startTime: parseDatetimeLocalValue(startTime),
      countsTowardWorkload,
    });
    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const k = issue.path[0]?.toString() ?? '_';
        if (!errors[k]) errors[k] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    try {
      await mutation.mutateAsync({ taskId: task.taskId, input: result.data });
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
      <div className="space-y-1.5">
        <Label htmlFor="edit-task-name">
          タスク名 <span className="text-destructive">*</span>
        </Label>
        <Input
          id="edit-task-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        {fieldErrors.taskName ? (
          <p className="text-xs text-destructive">{fieldErrors.taskName}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="edit-estimate">
            見積（分） <span className="text-destructive">*</span>
          </Label>
          <Input
            id="edit-estimate"
            type="number"
            inputMode="numeric"
            min={1}
            max={480}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            required
          />
          {fieldErrors.estimateMinutes ? (
            <p className="text-xs text-destructive">{fieldErrors.estimateMinutes}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-category">案件</Label>
          <select
            id="edit-category"
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
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-start">開始時刻</Label>
        <Input
          id="edit-start"
          type="datetime-local"
          step={900}
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={countsTowardWorkload}
          onChange={(e) => setCountsTowardWorkload(e.target.checked)}
          className="h-4 w-4"
        />
        工数に計上する
      </label>

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
