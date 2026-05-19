import { useUIStore } from '@/store/uiStore';
import { AppShell } from '@/components/AppShell';
import { TodayRoute } from '@/routes/TodayRoute';
import { AddRoute } from '@/routes/AddRoute';
import { WaitingRoute } from '@/routes/WaitingRoute';
import { SettingsRoute } from '@/routes/SettingsRoute';

const ROUTES = {
  today: TodayRoute,
  add: AddRoute,
  waiting: WaitingRoute,
  settings: SettingsRoute,
} as const;

export default function App() {
  const tab = useUIStore((s) => s.currentTab);
  const Route = ROUTES[tab];
  return (
    <AppShell>
      <Route />
    </AppShell>
  );
}
