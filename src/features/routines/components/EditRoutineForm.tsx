import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WEEKDAY_JA } from '@/lib/time/jst';
import { useCategories } from '@/features/tasks/hooks/useCategories';
import { useUpdateRoutine } from '@/features/routines/hooks/useRoutineMutations';
import { parseSchedule } from '@/features/routines/api/scheduleEvaluator';
import { buildScheduleRawList, type ScheduleKind } from '@/features/routines/api/scheduleFormat';
import type { RoutineWithRow } from '@/features/routines/api/routinesRepository';
import { ScheduleFields } from './ScheduleFields';

interface EditRoutineFormState {
  kind: ScheduleKind;
  weekday: string;
  dayOfMonth: string;
}

function toFormState(schedule: string): EditRoutineFormState {
  try {
    const parsed = parseSchedule(schedule);
    switch (parsed.kind) {
      case 'businessDay':
        return { kind: 'businessDay', weekday: '月', dayOfMonth: '1' };
      case 'weekday':
        return { kind: 'weekday', weekday: WEEKDAY_JA[parsed.day], dayOfMonth: '1' };
      case 'monthFirst':
        return { kind: 'monthFirst', weekday: '月', dayOfMonth: '1' };
      case 'monthLast':
        return { kind: 'monthLast', weekday: '月', dayOfMonth: '1' };
      case 'dayOfMonth':
        return { kind: 'dayOfMonth', weekday: '月', dayOfMonth: String(parsed.day) };
    }
  } catch {
    // Unparseable manual entry — fall back to a sensible default so the user can fix it.
    return { kind: 'weekday', weekday: '月', dayOfMonth: '1' };
  }
}

interface EditRoutineFormProps {
  routine: RoutineWithRow;
  onCancel: () => void;
  onSaved: () => void;
}

export function EditRoutineForm({ routine, onCancel, onSaved }: EditRoutineFormProps) {
  const initial = toFormState(routine.schedule);
  const [kind, setKind] = useState<ScheduleKind>(initial.kind);
  const [selectedWeekdays, setSelectedWeekdays] = useState<string[]>([initial.weekday]);
  const [dayOfMonth, setDayOfMonth] = useState(initial.dayOfMonth);
  const [taskName, setTaskName] = useState(routine.taskName);
  const [startTime, setStartTime] = useState(routine.startTime);
  const [category, setCategory] = useState(routine.category);
  const [minutes, setMinutes] = useState(String(routine.estimateMinutes));
  const [error, setError] = useState<string | null>(null);

  const categoriesQuery = useCategories();
  const updateMutation = useUpdateRoutine();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const trimmedName = taskName.trim();
    if (!trimmedName) {
      setError('タスク名を入力してください');
      return;
    }
    const estimateMinutes = Number(minutes);
    if (!Number.isFinite(estimateMinutes) || estimateMinutes <= 0) {
      setError('見積は1分以上の数値で入力してください');
      return;
    }
    if (kind === 'dayOfMonth') {
      const d = Number(dayOfMonth);
      if (!Number.isInteger(d) || d < 1 || d > 31) {
        setError('日にちは1〜31の範囲で入力してください');
        return;
      }
    }

    const [schedule] = buildScheduleRawList(kind, selectedWeekdays, dayOfMonth);

    try {
      await updateMutation.mutateAsync({
        rowNumber: routine.rowNumber,
        input: {
          schedule: schedule!,
          taskName: trimmedName,
          startTime,
          category: category || undefined,
          estimateMinutes,
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-primary/40 bg-card p-3 shadow-sm"
    >
      <div className="space-y-1.5">
        <Label htmlFor="edit-routine-name">タスク名</Label>
        <Input
          id="edit-routine-name"
          value={taskName}
          onChange={(e) => setTaskName(e.target.value)}
        />
      </div>

      <ScheduleFields
        idPrefix="edit-routine"
        kind={kind}
        onKindChange={setKind}
        selectedWeekdays={selectedWeekdays}
        onWeekdaysChange={setSelectedWeekdays}
        dayOfMonth={dayOfMonth}
        onDayOfMonthChange={setDayOfMonth}
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="edit-routine-start">開始時刻</Label>
          <Input
            id="edit-routine-start"
            type="time"
            step={900}
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="edit-routine-estimate">見積（分）</Label>
          <Input
            id="edit-routine-estimate"
            type="number"
            inputMode="numeric"
            min={1}
            max={480}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-routine-category">案件</Label>
        <select
          id="edit-routine-category"
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

      <div className="flex gap-2 pt-1">
        <Button type="submit" className="flex-1" disabled={updateMutation.isPending}>
          {updateMutation.isPending ? '保存中…' : '保存'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onCancel}
          disabled={updateMutation.isPending}
        >
          キャンセル
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </form>
  );
}
