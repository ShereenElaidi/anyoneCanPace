import { useSyncExternalStore } from 'react';
import { useAppUpdate } from '../lib/appUpdate';
import { sessionBusy, subscribeSessionBusy } from '../lib/swUpdate';

/**
 * "A new version is ready" with UPDATE, the same on the home screen and in
 * every mode. Hidden while a timer session is running or paused or a route is
 * being followed: updating reloads the page, which would lose it. It comes
 * back once the session ends.
 */
export function UpdateBanner() {
  const { ready, update } = useAppUpdate();
  const busy = useSyncExternalStore(subscribeSessionBusy, sessionBusy);
  if (!ready || busy) return null;
  return (
    <div className="update-banner" role="status">
      <p>A new version of the app is ready.</p>
      <button type="button" className="btn btn--secondary btn--small" onClick={update}>
        UPDATE
      </button>
    </div>
  );
}
