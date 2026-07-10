import { Card } from '@/components/ui/card';

/**
 * Replaces the current/next spotlight on 今日 once every task for the day is
 * done — showing tomorrow's task there instead (the old behavior) read as
 * "today isn't really over yet", when the point of TodayRoute is to know
 * you're done.
 */
export function AllDoneCard() {
  return (
    <Card className="border-emerald-200 bg-emerald-50 p-6 text-center">
      <p className="text-2xl" aria-hidden>
        🎉
      </p>
      <p className="mt-2 text-sm font-semibold">今日のタスクは全部完了しました！</p>
      <p className="mt-1 text-xs text-muted-foreground">お疲れさまでした</p>
    </Card>
  );
}
