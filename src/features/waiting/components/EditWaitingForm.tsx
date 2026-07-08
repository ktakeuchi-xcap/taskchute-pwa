import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WaitingTaskInputSchema } from '@/features/waiting/validators';
import { useUpdateWaitingTask } from '@/features/waiting/hooks/useWaitingMutations';
import { parseDateInputValue, toDateInputValue } from '@/features/waiting/dateInput';
import type { WaitingTask } from '@/features/waiting/types';

interface EditWaitingFormProps {
  task: WaitingTask;
  onCancel: () => void;
  onSaved: () => void;
}

export function EditWaitingForm({ task, onCancel, onSaved }: EditWaitingFormProps) {
  const [name, setName] = useState(task.taskName);
  const [waitingFor, setWaitingFor] = useState(task.waitingFor ?? '');
  const [followUp, setFollowUp] = useState(
    task.followUpDate ? toDateInputValue(task.followUpDate) : '',
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const mutation = useUpdateWaitingTask();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerError(null);
    setFieldErrors({});
    const result = WaitingTaskInputSchema.safeParse({
      taskName: name,
      waitingFor: waitingFor || undefined,
      followUpDate: parseDateInputValue(followUp),
    });
    if (!result.success) {
      const errs: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const k = issue.path[0]?.toString() ?? '_';
        if (!errs[k]) errs[k] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }
    try {
      await mutation.mutateAsync({ systemTaskId: task.systemTaskId, input: result.data });
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
        <Label htmlFor="edit-waiting-name">
          何を待っていますか？ <span className="text-destructive">*</span>
        </Label>
        <Input
          id="edit-waiting-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        {fieldErrors.taskName ? (
          <p className="text-xs text-destructive">{fieldErrors.taskName}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="edit-waiting-for">依頼先</Label>
          <Input
            id="edit-waiting-for"
            value={waitingFor}
            onChange={(e) => setWaitingFor(e.target.value)}
            placeholder="例：〇〇さん"
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="edit-follow-up">フォローアップ日</Label>
          <Input
            id="edit-follow-up"
            type="date"
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
          />
        </div>
      </div>
      {fieldErrors.followUpDate ? (
        <p className="text-xs text-destructive">{fieldErrors.followUpDate}</p>
      ) : null}

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
