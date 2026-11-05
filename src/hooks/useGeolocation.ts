import { useEffect, useState } from 'react';
import type { Fix } from '../nav/tracker';

export type GeoError = 'unsupported' | 'denied' | 'unavailable' | 'insecure';

export interface GeoState {
  fix: Fix | null;
  error: GeoError | null;
}

/**
 * Watches the GPS position while `enabled` (foreground only: browsers stop
 * reporting when the page is hidden or the phone is locked).
 *
 * Privacy: positions live only in React state for this session. They are
 * never stored, logged or sent anywhere.
 */
export function useGeolocation(enabled: boolean): GeoState {
  const [state, setState] = useState<GeoState>({ fix: null, error: null });

  useEffect(() => {
    if (!enabled) return;
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setState({ fix: null, error: 'insecure' });
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({ fix: null, error: 'unsupported' });
      return;
    }
    const geo = navigator.geolocation;
    const id = geo.watchPosition(
      (pos) =>
        setState({
          fix: {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracyM: pos.coords.accuracy,
            // Receipt time, not pos.timestamp: some phones stamp fixes with GPS time,
            // which can differ from the device clock and would make fresh cues look stale.
            at: Date.now(),
          },
          error: null,
        }),
      (err) =>
        setState((s) => ({
          fix: s.fix,
          error: err.code === 1 ? 'denied' : 'unavailable',
        })),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
    );
    return () => geo.clearWatch(id);
  }, [enabled]);

  return state;
}

export const GEO_ERROR_TEXT: Record<GeoError, string> = {
  unsupported: 'This browser has no GPS access.',
  denied: 'Location is blocked. Allow location for this site in your browser settings to follow the route.',
  unavailable: 'Can’t get a GPS fix right now. Try stepping out from under trees or buildings.',
  insecure: 'GPS needs a secure (https) page. Open the app from its https address.',
};
