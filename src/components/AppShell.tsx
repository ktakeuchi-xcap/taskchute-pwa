import { Calendar, Plus, Users, Settings, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useUIStore, type Tab } from '@/store/uiStore';
import { formatJst } from '@/lib/time/jst';
import { useSync } from '@/features/sync/useSync';

const TABS: ReadonlyArray<{ id: Tab; label: string; Icon: typeof Calendar }> = [
  { id: 'today', label: '今日', Icon: Calendar },
  { id: 'add', label: '追加', Icon: Plus },
  { id: 'waiting', label: '確認待ち', Icon: Users },
  { id: 'settings', label: '設定', Icon: Settings },
];

interface AppShellProps {
  children: React.ReactNode;
}

const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'] as const;

export function AppShell({ children }: AppShellProps) {
  const currentTab = useUIStore((s) => s.currentTab);
  const setTab = useUIStore((s) => s.setTab);
  const sync = useSync();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const today = new Date();
  const dateLabel = `${formatJst(today, 'yyyy年M月d日')}（${WEEKDAY[today.getDay()]}）`;

  const runSync = async () => {
    setSyncMessage(null);
    try {
      const result = await sync.mutateAsync();
      setSyncMessage(
        `同期完了: タスク ${result.tasksUpdated} 件 / 確認待ち ${result.waitingUpdated} 件更新` +
          (result.waitingCleared > 0 ? ` / ${result.waitingCleared} 件削除` : ''),
      );
      setTimeout(() => setSyncMessage(null), 3000);
    } catch (err) {
      setSyncMessage(`同期失敗: ${err instanceof Error ? err.message : err}`);
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
            <h1 className="text-lg font-bold tracking-tight">⚡ Taskchute</h1>
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

        {syncMessage ? (
          <div className="border-b border-border bg-muted/60 px-4 py-1.5 text-[11px] text-muted-foreground">
            {syncMessage}
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
