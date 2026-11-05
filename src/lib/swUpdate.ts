/**
 * Keeps app updates from interrupting a session.
 *
 * With `registerType: 'prompt'`, the PWA client reloads the page whenever a new
 * service worker takes control, including when the update was accepted in
 * another tab or window. A reload loses the in-memory timer session and route
 * progress, so every `useRegisterSW` call passes `SW_OPTIONS`: the page reloads
 * only when no session is running or paused. Otherwise it keeps running the
 * version it has, and the next launch gets the new one.
 */

const busy = new Set<string>();

/** Mark a session (e.g. 'timer', 'route') as running or paused, or as ended. */
export function setSessionBusy(key: string, isBusy: boolean): void {
  if (isBusy) busy.add(key);
  else busy.delete(key);
}

export const sessionBusy = (): boolean => busy.size > 0;

/** Reload to the new version only if that loses nothing. Returns whether it reloaded. */
export function reloadIfIdle(reload: () => void = () => window.location.reload()): boolean {
  if (sessionBusy()) return false;
  reload();
  return true;
}

/** Options for every `useRegisterSW()` call. */
export const SW_OPTIONS = {
  onNeedReload: () => {
    reloadIfIdle();
  },
};
