import { useMemo, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGenerateRoutines } from '@/features/routines/hooks/useGenerateRoutines';
import { addDays, formatJst, startOfJstWeek } from '@/lib/time/jst';

function weekOffsetLabel(offset: number): string {
  if (offset === 0) return '今週';
  if (offset === 1) return '来週';
  return `${offset}週間後`;
}

/** Self-contained "ルーチンタスクを生成" action — week picker, button, and result feedback. */
export function GenerateRoutinesSection() {
  const routinesMutation = useGenerateRoutines();
  const [routineFeedback, setRoutineFeedback] = useState<string | null>(null);
  const [routineWeekOffset, setRoutineWeekOffset] = useState(1); // 1 = 来週 (default)

  const routineWeekMonday = useMemo(
    () => addDays(startOfJstWeek(new Date()), routineWeekOffset * 7),
    [routineWeekOffset],
  );
  const routineWeekLabel = `${weekOffsetLabel(routineWeekOffset)}（${formatJst(routineWeekMonday, 'M/d')}〜${formatJst(addDays(routineWeekMonday, 4), 'M/d')}）`;

  const handleGenerateRoutines = async () => {
    setRoutineFeedback(null);
    try {
      const result = await routinesMutation.mutateAsync(routineWeekOffset);
      if (result.addedCount === 0 && result.skippedCount === 0) {
        setRoutineFeedback('対象のルーチンタスクが見つかりませんでした');
      } else if (result.addedCount === 0) {
        setRoutineFeedback(
          `${routineWeekLabel}分はすでに生成済みです（${result.skippedCount}件スキップ）`,
        );
      } else {
        setRoutineFeedback(
          `${result.weekStartIso}〜${result.weekEndIso} に ${result.addedCount}件追加（${result.skippedCount}件スキップ）`,
        );
      }
    } catch (err) {
      setRoutineFeedback(`生成に失敗しました：${err instanceof Error ? err.message : err}`);
    }
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-center gap-1">
        <button
          type="button"
          aria-label="前の週へ"
          onClick={() => setRoutineWeekOffset((o) => Math.max(0, o - 1))}
          disabled={routineWeekOffset === 0}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs font-medium text-foreground">{routineWeekLabel}</span>
        <button
          type="button"
          aria-label="次の週へ"
          onClick={() => setRoutineWeekOffset((o) => o + 1)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <Button
        variant="secondary"
        className="w-full"
        onClick={handleGenerateRoutines}
        disabled={routinesMutation.isPending}
      >
        <CalendarPlus className="h-4 w-4" />
        {routinesMutation.isPending
          ? '生成中…'
          : `${weekOffsetLabel(routineWeekOffset)}のルーチンタスクを生成`}
      </Button>
      {routineFeedback ? (
        <p className="mt-2 text-xs text-muted-foreground">{routineFeedback}</p>
      ) : null}
    </div>
  );
}
