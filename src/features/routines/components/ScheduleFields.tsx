import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { WEEKDAY_JA } from '@/lib/time/jst';
import type { ScheduleKind } from '@/features/routines/api/scheduleFormat';

// 「毎週◯曜日」の生成処理は来週の月〜金しか対象にしないため（ISS-09）、
// 土・日はそもそも選択できないようにする。
const WEEKDAY_ROUTINE_OPTIONS = WEEKDAY_JA.filter((w) => w !== '日' && w !== '土');

interface ScheduleFieldsProps {
  idPrefix: string;
  kind: ScheduleKind;
  onKindChange: (kind: ScheduleKind) => void;
  selectedWeekdays: string[];
  onWeekdaysChange: (weekdays: string[]) => void;
  /** Add form allows picking several days at once; edit form only ever edits one row. */
  allowMultipleWeekdays?: boolean;
  dayOfMonth: string;
  onDayOfMonthChange: (value: string) => void;
}

export function ScheduleFields({
  idPrefix,
  kind,
  onKindChange,
  selectedWeekdays,
  onWeekdaysChange,
  allowMultipleWeekdays = false,
  dayOfMonth,
  onDayOfMonthChange,
}: ScheduleFieldsProps) {
  const toggleWeekday = (w: string) => {
    if (allowMultipleWeekdays) {
      onWeekdaysChange(
        selectedWeekdays.includes(w)
          ? selectedWeekdays.filter((x) => x !== w)
          : [...selectedWeekdays, w],
      );
    } else {
      onWeekdaysChange([w]);
    }
  };

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-kind`}>頻度</Label>
        <select
          id={`${idPrefix}-kind`}
          value={kind}
          onChange={(e) => onKindChange(e.target.value as ScheduleKind)}
          className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="businessDay">毎営業日</option>
          <option value="weekday">毎週◯曜日</option>
          <option value="monthFirst">毎月初日</option>
          <option value="monthLast">毎月末日</option>
          <option value="dayOfMonth">毎月◯日</option>
        </select>
        {kind === 'businessDay' ? (
          <p className="text-[11px] text-muted-foreground">土日祝は対象外です</p>
        ) : null}
      </div>

      {kind === 'weekday' ? (
        <div className="space-y-1.5">
          <Label>{allowMultipleWeekdays ? '曜日（複数選択可）' : '曜日'}</Label>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_ROUTINE_OPTIONS.map((w) => {
              const active = selectedWeekdays.includes(w);
              return (
                <button
                  key={w}
                  type="button"
                  onClick={() => toggleWeekday(w)}
                  className={cn(
                    'h-9 w-9 rounded-lg border text-sm font-medium transition-colors',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-background text-foreground hover:bg-accent',
                  )}
                  aria-pressed={active}
                >
                  {w}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            土・日は生成対象外のため選択できません
          </p>
        </div>
      ) : null}

      {kind === 'dayOfMonth' ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-day`}>日にち</Label>
          <Input
            id={`${idPrefix}-day`}
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={dayOfMonth}
            onChange={(e) => onDayOfMonthChange(e.target.value)}
          />
        </div>
      ) : null}
    </>
  );
}
