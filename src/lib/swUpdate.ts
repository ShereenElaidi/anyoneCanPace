/**
 * Keeps app updates from interrupting a session.
 *
 * With `registerType: 'prompt'`, the PWA client reloads the page whenever a new
 * service worker takes control, including when the update was accepted in
 * another tab or window. A reload loses the in-memory timer session and route
 * progress, so the one `useRegisterSW` call (in `Root`) passes `SW_OPTIONS`: the page reloads
 * only when no session is running or paused. Otherwise it keeps running the
 * version it has, and the next launch gets the new one.
 */

const busy = new Set<string>();
const listeners = new Set<() => void>();

/** Mark a session (e.g. 'timer', 'route') as running or paused, or as ended. */
export function setSessionBusy(key: string, isBusy: boolean): void {
  const was = busy.size > 0;
  if (isBusy) busy.add(key);
  else busy.delete(key);
  if (was !== busy.size > 0) listeners.forEach((l) => l());
}

export const sessionBusy = (): boolean => busy.size > 0;

/** For `useSyncExternalStore`: the update banner hides while a session is live. */
export function subscribeSessionBusy(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reload to the new version only if that loses nothing. Returns whether it reloaded. */
export function reloadIfIdle(reload: () => void = () => window.location.reload()): boolean {
  if (sessionBusy()) return false;
  reload();
  return true;
}

/** Options for the app's one `useRegisterSW()` call (in Root). */
export const SW_OPTIONS = {
  onNeedReload: () => {
    reloadIfIdle();
  },
};

/** A new version is looked for when the app comes back into view, at most this often (one small request for sw.js). */
export const UPDATE_CHECK_MS = 60_000;
