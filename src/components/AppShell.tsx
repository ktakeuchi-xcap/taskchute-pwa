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

export function AppShell({ children }: AppShellProps) {
  const currentTab = useUIStore((s) => s.currentTab);
  const setTab = useUIStore((s) => s.setTab);
  const today = new Date();
  const dateLabel = `${formatJst(today, 'yyyy年M月d日')}（${WEEKDAY[today.getDay()]}）`;

  return (
    <div className="mx-auto flex h-full max-w-[480px] flex-col bg-muted/30">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-4 py-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight">⚡ Taskchute</h1>
          <p className="text-xs text-muted-foreground">{dateLabel}</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">{children}</main>

      <nav className="fixed bottom-0 left-1/2 z-10 flex w-full max-w-[480px] -translate-x-1/2 border-t border-border bg-background">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
              currentTab === id ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
