import { Calendar, Plus, Users, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore, type Tab } from '@/store/uiStore';
import { formatJst } from '@/lib/time/jst';

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

/**
 * Layout shell shared between mobile and desktop.
 * - mobile (<480px): full-width column, fixed bottom tabs that respect iOS safe area
 * - desktop: centred 480px column with subtle bg, tabs stay anchored at the column bottom
 */
export function AppShell({ children }: AppShellProps) {
  const currentTab = useUIStore((s) => s.currentTab);
  const setTab = useUIStore((s) => s.setTab);
  const today = new Date();
  const dateLabel = `${formatJst(today, 'yyyy年M月d日')}（${WEEKDAY[today.getDay()]}）`;

  return (
    <div className="min-h-dvh w-full bg-muted/30">
      <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-background shadow-sm sm:my-0 md:my-4 md:min-h-[calc(100dvh-2rem)] md:rounded-2xl md:shadow-lg">
        <header
          className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:rounded-t-2xl"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 0.75rem)' }}
        >
          <div>
            <h1 className="text-lg font-bold tracking-tight">⚡ Taskchute</h1>
            <p className="text-xs text-muted-foreground">{dateLabel}</p>
          </div>
        </header>

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
