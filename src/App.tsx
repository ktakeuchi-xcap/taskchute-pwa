import { useUIStore } from '@/store/uiStore';
import { AppShell } from '@/components/AppShell';
import { AuthGate } from '@/features/auth/AuthGate';
import { TodayRoute } from '@/routes/TodayRoute';
import { UpcomingRoute } from '@/routes/UpcomingRoute';
import { AddRoute } from '@/routes/AddRoute';
import { WaitingRoute } from '@/routes/WaitingRoute';
import { DashboardRoute } from '@/routes/DashboardRoute';
import { SettingsRoute } from '@/routes/SettingsRoute';
import { FloatingTimer } from '@/features/tasks/components/FloatingTimer';

const ROUTES = {
  today: TodayRoute,
  upcoming: UpcomingRoute,
  add: AddRoute,
  waiting: WaitingRoute,
  dashboard: DashboardRoute,
  settings: SettingsRoute,
} as const;

export default function App() {
  const tab = useUIStore((s) => s.currentTab);
  const Route = ROUTES[tab];
  return (
    <AuthGate>
      <AppShell>
        <Route />
        <FloatingTimer />
      </AppShell>
    </AuthGate>
  );
}
