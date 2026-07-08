import { useEffect, useRef } from 'react';
import { useSync } from './useSync';

const AUTO_SYNC_INTERVAL_MS = 30_000;

/**
 * Runs the Calendar<->Sheet reconciliation automatically — on mount, on an
 * interval, and whenever the tab regains focus (e.g. the user just edited a
 * task in the Google Calendar app and switched back). The manual "同期"
 * button in AppShell still works and shares this same mutation instance.
 */
export function useAutoSync() {
  const sync = useSync();
  const mutateRef = useRef(sync.mutate);

  useEffect(() => {
    mutateRef.current = sync.mutate;
  }, [sync.mutate]);

  useEffect(() => {
    mutateRef.current();

    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        mutateRef.current();
      }
    }, AUTO_SYNC_INTERVAL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        mutateRef.current();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return sync;
}
