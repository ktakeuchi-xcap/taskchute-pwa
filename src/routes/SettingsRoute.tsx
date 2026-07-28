import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { ThemePicker } from '@/components/ThemePicker';
import { CategoryManager } from '@/features/tasks/components/CategoryManager';
import { RoutineManager } from '@/features/routines/components/RoutineManager';
import { AccountSection } from '@/features/auth/components/AccountSection';

export function SettingsRoute() {
  return (
    <div className="space-y-3 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">設定</h2>
      <CollapsibleSection title="デザイン" defaultOpen>
        <ThemePicker />
      </CollapsibleSection>
      <CollapsibleSection title="案件マスタ">
        <CategoryManager />
      </CollapsibleSection>
      <CollapsibleSection title="ルーチンタスク">
        <RoutineManager />
      </CollapsibleSection>
      <AccountSection />
    </div>
  );
}
