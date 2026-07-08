import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { CategoryManager } from '@/features/tasks/components/CategoryManager';
import { RoutineManager } from '@/features/routines/components/RoutineManager';

export function SettingsRoute() {
  return (
    <div className="space-y-3 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">設定</h2>
      <CollapsibleSection title="案件マスタ">
        <CategoryManager />
      </CollapsibleSection>
      <CollapsibleSection title="ルーチンタスク">
        <RoutineManager />
      </CollapsibleSection>
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        同期設定・ログアウトは今後実装予定。
      </div>
    </div>
  );
}
