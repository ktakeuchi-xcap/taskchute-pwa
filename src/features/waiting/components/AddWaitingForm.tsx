import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WaitingTaskInputSchema } from '@/features/waiting/validators';
import { useAddWaitingTask } from '@/features/waiting/hooks/useWaitingMutations';
import { formatJst } from '@/lib/time/jst';

function parseDate(value: string): Date | undefined {
  if (!value) return undefined;
  // `<input type="date">` gives YYYY-MM-DD. Treat as JST midnight.
  const d = new Date(`${value}T00:00:00+09:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function todayDateValue(): string {
  return formatJst(new Date(), 'yyyy-MM-dd');
}

export function AddWaitingForm() {
  const [name, setName] = useState('');
  const [waitingFor, setWaitingFor] = useState('');
  const [followUp, setFollowUp] = useState(todayDateValue);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const mutation = useAddWaitingTask();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerError(null);
    setFieldErrors({});
    const result = WaitingTaskInputSchema.safeParse({
      taskName: name,
      waitingFor: waitingFor || undefined,
      followUpDate: parseDate(followUp),
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
      await mutation.mutateAsync(result.data);
      setName('');
      setWaitingFor('');
      setFollowUp(todayDateValue());
    } catch (err) {
      setServerError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="waiting-name">
          何を待っていますか？ <span className="text-destructive">*</span>
        </Label>
        <Input
          id="waiting-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例：提案書へのフィードバック"
          required
        />
        {fieldErrors.taskName ? (
          <p className="text-xs text-destructive">{fieldErrors.taskName}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="waiting-for">依頼先</Label>
          <Input
            id="waiting-for"
            type="text"
            value={waitingFor}
            onChange={(e) => setWaitingFor(e.target.value)}
            placeholder="例：〇〇さん"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="follow-up">フォローアップ日</Label>
          <Input
            id="follow-up"
            type="date"
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
          />
        </div>
      </div>
      {fieldErrors.followUpDate ? (
        <p className="text-xs text-destructive">{fieldErrors.followUpDate}</p>
      ) : null}

      <Button
        type="submit"
        variant="outline"
        size="lg"
        className="w-full"
        disabled={mutation.isPending}
      >
        {mutation.isPending ? '追加中…' : '＋ 確認待ちに追加'}
      </Button>

      {serverError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          {serverError}
        </div>
      ) : null}
      {mutation.isSuccess && !mutation.isPending ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-800">
          確認待ちに追加しました ✓
        </div>
      ) : null}
    </form>
  );
}
