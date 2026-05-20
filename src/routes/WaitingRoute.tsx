import { WaitingTaskList } from '@/features/waiting/components/WaitingTaskList';

export function WaitingRoute() {
  return (
    <div className="space-y-3 p-4">
      <div>
        <h2 className="text-base font-bold">🤝 確認待ち</h2>
        <p className="text-xs text-muted-foreground">
          Google ToDo と双方向同期しています
        </p>
      </div>
      <WaitingTaskList />
    </div>
  );
}
