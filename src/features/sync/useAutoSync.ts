import { useEffect, useRef } from 'react';
import { useSync } from './useSync';

const AUTO_SYNC_INTERVAL_MS = 30_000;
// Randomized per-tick so two devices that happened to mount within moments
// of each other don't stay in lockstep forever, repeatedly hitting the
// sync lock (syncLock.ts) at the exact same moment every cycle.
const AUTO_SYNC_JITTER_MS = 5_000;

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

    let timeoutId: number;
    const scheduleNext = () => {
      const delay = AUTO_SYNC_INTERVAL_MS + Math.random() * AUTO_SYNC_JITTER_MS;
      timeoutId = window.setTimeout(() => {
        if (document.visibilityState === 'visible') {
          mutateRef.current();
        }
        scheduleNext();
      }, delay);
    };
    scheduleNext();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        mutateRef.current();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return sync;
}
