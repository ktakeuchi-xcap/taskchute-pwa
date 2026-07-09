import { registerSW } from 'virtual:pwa-register';

const UPDATE_CHECK_INTERVAL_MS = 60_000;

/**
 * registerType is 'autoUpdate', so once a new service worker activates this
 * reloads the page automatically — no manual tab-close/reopen needed on any
 * platform. The browser only checks sw.js for changes on navigation by
 * default, so we also poll registration.update() while the app is open to
 * pick up a new deploy within a minute instead of on the next visit.
 */
export function registerServiceWorker(): void {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(() => {
        registration.update().catch(() => {});
      }, UPDATE_CHECK_INTERVAL_MS);
    },
  });
}
