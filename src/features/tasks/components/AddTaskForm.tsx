import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TaskInputSchema } from '@/features/tasks/validators';
import { useAddTask } from '@/features/tasks/hooks/useTaskMutations';
import { useCategories } from '@/features/tasks/hooks/useCategories';
import {
  ceilToNext15Minutes,
  parseDatetimeLocalValue,
  toDatetimeLocalValue,
} from '@/lib/time/datetimeLocalInput';

function defaultStartTime(): string {
  return toDatetimeLocalValue(ceilToNext15Minutes(new Date()));
}

export function AddTaskForm() {
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState('30');
  const [category, setCategory] = useState('');
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [countsTowardWorkload, setCountsTowardWorkload] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const categoriesQuery = useCategories();
  const mutation = useAddTask();

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
      await mutation.mutateAsync(result.data);
      setName('');
      setMinutes('30');
      setStartTime(defaultStartTime());
      setCountsTowardWorkload(true);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="task-name">
          タスク名 <span className="text-destructive">*</span>
        </Label>
        <Input
          id="task-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例：提案書の修正"
          required
        />
        {fieldErrors.taskName ? (
          <p className="text-xs text-destructive">{fieldErrors.taskName}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="estimate">
            見積（分） <span className="text-destructive">*</span>
          </Label>
          <Input
            id="estimate"
            type="number"
            inputMode="numeric"
            min={1}
            max={480}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="30"
            required
          />
          {fieldErrors.estimateMinutes ? (
            <p className="text-xs text-destructive">{fieldErrors.estimateMinutes}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="category">案件</Label>
          <select
            id="category"
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
        <Label htmlFor="start">開始時刻（任意）</Label>
        <Input
          id="start"
          type="datetime-local"
          step={900}
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
        />
        <p className="text-[11px] text-muted-foreground">
          省略すると直前タスクの終了時刻、または現在時刻が使われます
        </p>
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

      <Button type="submit" size="lg" className="w-full" disabled={mutation.isPending}>
        {mutation.isPending ? '追加中…' : '＋ このタスクを追加'}
      </Button>

      {serverError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          {serverError}
        </div>
      ) : null}
      {mutation.isSuccess && !mutation.isPending ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-800">
          タスクを追加しました ✓
        </div>
      ) : null}
    </form>
  );
}
