import { Calendar, CalendarDays, Plus, Users, Settings, RefreshCw, BarChart3 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useUIStore, type Tab } from '@/store/uiStore';
import { formatJst, WEEKDAY_JA } from '@/lib/time/jst';
import { useAutoSync } from '@/features/sync/useAutoSync';
import type { SyncSummary } from '@/features/sync/useSync';

function formatSyncSuccess(result: SyncSummary): string {
  return (
    `同期完了: タスク ${result.tasksUpdated} 件更新 / 確認待ち ${result.waitingUpdated} 件更新` +
    ` / 会議カレンダー取得 ${result.meetingEventsFetched} 件` +
    (result.tasksDeleted > 0 ? ` / タスク ${result.tasksDeleted} 件削除` : '') +
    (result.waitingCleared > 0 ? ` / 確認待ち ${result.waitingCleared} 件削除` : '') +
    (result.meetingsAdded > 0 ? ` / 会議 ${result.meetingsAdded} 件追加` : '') +
    (result.meetingsUpdated > 0 ? ` / 会議 ${result.meetingsUpdated} 件更新` : '') +
    (result.meetingsDeleted > 0 ? ` / 会議 ${result.meetingsDeleted} 件削除` : '')
  );
}

const TABS: ReadonlyArray<{ id: Tab; label: string; Icon: typeof Calendar }> = [
  { id: 'today', label: '今日', Icon: Calendar },
  { id: 'upcoming', label: '予定', Icon: CalendarDays },
  { id: 'add', label: '追加', Icon: Plus },
  { id: 'waiting', label: '確認待ち', Icon: Users },
  { id: 'dashboard', label: '実績', Icon: BarChart3 },
  { id: 'settings', label: '設定', Icon: Settings },
];

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const currentTab = useUIStore((s) => s.currentTab);
  const setTab = useUIStore((s) => s.setTab);
  const sync = useAutoSync();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const today = new Date();
  const dateLabel = `${formatJst(today, 'yyyy年M月d日')}（${WEEKDAY_JA[today.getDay()]}）`;

  // The 30s auto-sync loop (useAutoSync) triggers via a bare `.mutate()` with
  // no local try/catch anywhere, so a background failure used to be entirely
  // silent — the user would only ever see "同期失敗" if they happened to
  // press the button at the exact moment it failed. Deriving the banner from
  // the shared mutation's own error state (rather than only setting it from
  // this component's own try/catch below) surfaces a failure regardless of
  // which trigger — button or background timer — caused it.
  const errorMessage = sync.isError
    ? `同期失敗: ${sync.error instanceof Error ? sync.error.message : sync.error}`
    : null;
  // Persists (doesn't auto-clear like syncMessage) until a later sync
  // completes without tripping the safety net again — this should be rare
  // and always warrants a look, not a 3-second flash (see
  // MAX_SAFE_VANISHED_DELETE in syncCalendarToSheet.ts/syncMeetingsToSheet.ts).
  const safetyWarning =
    sync.data && sync.data.deletionsSkippedForSafety > 0
      ? `⚠️ 削除件数が異常に多かったため同期の削除処理をスキップしました（${sync.data.deletionsSkippedForSafety}件）。開発者に確認してください`
      : null;
  const displayMessage = safetyWarning ?? syncMessage ?? errorMessage;

  const runSync = async () => {
    setSyncMessage(null);
    try {
      const result = await sync.mutateAsync();
      setSyncMessage(formatSyncSuccess(result));
      setTimeout(() => setSyncMessage(null), 3000);
    } catch {
      // Surfaced via errorMessage above instead.
    }
  };

  return (
    <div className="min-h-dvh w-full bg-muted/30">
      <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-background shadow-sm sm:my-0 md:my-4 md:min-h-[calc(100dvh-2rem)] md:rounded-2xl md:shadow-lg">
        <header
          className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:rounded-t-2xl"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 0.75rem)' }}
        >
          <div className="min-w-0">
            <h1 className="font-display text-lg font-bold tracking-tight">⚡ Taskchute</h1>
            <p className="text-xs text-muted-foreground">{dateLabel}</p>
          </div>
          <button
            type="button"
            onClick={runSync}
            disabled={sync.isPending}
            className={cn(
              'flex h-9 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted',
              sync.isPending && 'opacity-60',
            )}
            aria-label="同期"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', sync.isPending && 'animate-spin')} />
            同期
          </button>
        </header>

        {displayMessage ? (
          <div
            className={cn(
              'border-b px-4 py-1.5 text-[11px]',
              safetyWarning
                ? 'border-destructive/40 bg-destructive/10 font-medium text-destructive'
                : 'border-border bg-muted/60 text-muted-foreground',
            )}
          >
            {displayMessage}
          </div>
        ) : null}

        <main
          className="flex-1 overflow-y-auto"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}
        >
          {children}
        </main>

        <nav
          className="fixed bottom-0 left-1/2 z-10 w-full max-w-[480px] -translate-x-1/2 border-t border-border bg-background/95 backdrop-blur md:rounded-b-2xl"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex">
            {TABS.map(({ id, label, Icon }) => {
              const active = currentTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors',
                    active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  {label}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
