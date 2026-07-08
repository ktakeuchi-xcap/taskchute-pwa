import { useState, type FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCategories } from '@/features/tasks/hooks/useCategories';
import { useRoutines } from '@/features/routines/hooks/useRoutines';
import { useAddRoutine, useDeleteRoutine } from '@/features/routines/hooks/useRoutineMutations';
import { buildScheduleRawList, type ScheduleKind } from '@/features/routines/api/scheduleFormat';
import { ScheduleFields } from './ScheduleFields';
import { EditRoutineForm } from './EditRoutineForm';

export function RoutineManager() {
  const [kind, setKind] = useState<ScheduleKind>('weekday');
  const [selectedWeekdays, setSelectedWeekdays] = useState<string[]>(['月']);
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [taskName, setTaskName] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [category, setCategory] = useState('');
  const [minutes, setMinutes] = useState('30');
  const [error, setError] = useState<string | null>(null);
  const [editingRowNumber, setEditingRowNumber] = useState<number | null>(null);

  const routinesQuery = useRoutines();
  const categoriesQuery = useCategories();
  const addMutation = useAddRoutine();
  const deleteMutation = useDeleteRoutine();

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
    if (kind === 'weekday' && selectedWeekdays.length === 0) {
      setError('曜日を1つ以上選択してください');
      return;
    }
    if (kind === 'dayOfMonth') {
      const d = Number(dayOfMonth);
      if (!Number.isInteger(d) || d < 1 || d > 31) {
        setError('日にちは1〜31の範囲で入力してください');
        return;
      }
    }

    const schedules = buildScheduleRawList(kind, selectedWeekdays, dayOfMonth);

    try {
      // 複数曜日を選んだ場合は、曜日ごとに1行ずつ登録する。
      for (const schedule of schedules) {
        await addMutation.mutateAsync({
          schedule,
          taskName: trimmedName,
          startTime,
          category: category || undefined,
          estimateMinutes,
        });
      }
      setTaskName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = (rowNumber: number, label: string) => {
    if (window.confirm(`ルーチン「${label}」を削除しますか？`)) {
      deleteMutation.mutate(rowNumber);
    }
  };

  return (
    <div className="space-y-3">
      <form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-lg border border-border bg-card/40 p-3"
      >
        <div className="space-y-1.5">
          <Label htmlFor="routine-name">タスク名</Label>
          <Input
            id="routine-name"
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
            placeholder="例：週報作成"
          />
        </div>

        <ScheduleFields
          idPrefix="routine"
          kind={kind}
          onKindChange={setKind}
          selectedWeekdays={selectedWeekdays}
          onWeekdaysChange={setSelectedWeekdays}
          allowMultipleWeekdays
          dayOfMonth={dayOfMonth}
          onDayOfMonthChange={setDayOfMonth}
        />

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="routine-start">開始時刻</Label>
            <Input
              id="routine-start"
              type="time"
              step={900}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="routine-estimate">見積（分）</Label>
            <Input
              id="routine-estimate"
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
          <Label htmlFor="routine-category">案件</Label>
          <select
            id="routine-category"
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

        <Button type="submit" className="w-full" disabled={addMutation.isPending}>
          {addMutation.isPending ? '追加中…' : '＋ ルーチンタスクを追加'}
        </Button>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </form>

      <div className="space-y-1.5">
        {(routinesQuery.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">まだ登録されていません</p>
        ) : (
          (routinesQuery.data ?? []).map((r) =>
            editingRowNumber === r.rowNumber ? (
              <EditRoutineForm
                key={r.rowNumber}
                routine={r}
                onCancel={() => setEditingRowNumber(null)}
                onSaved={() => setEditingRowNumber(null)}
              />
            ) : (
              <div
                key={r.rowNumber}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.taskName}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {r.schedule} ・ {r.startTime} ・ {r.estimateMinutes}分
                    {r.category ? ` ・ ${r.category}` : ''}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    aria-label="ルーチンを編集"
                    onClick={() => setEditingRowNumber(r.rowNumber)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    aria-label="ルーチンを削除"
                    onClick={() => handleDelete(r.rowNumber, r.taskName)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ),
          )
        )}
      </div>
    </div>
  );
}
