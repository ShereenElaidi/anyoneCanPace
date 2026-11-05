import { useCallback, useEffect, useRef, useState } from 'react';
import { forecastUrl, parseGem, type Forecast } from '../weather/forecast';
import { FRESH_FOR_MS, loadForecast, saveForecast } from '../weather/cache';

export type FetchState = 'idle' | 'loading' | 'offline' | 'failed';

const TIMEOUT_MS = 10_000;

/**
 * The last known forecast, refreshed when the dashboard opens (or comes back
 * into view) and the saved copy is older than 30 minutes. One small request
 * for fixed Montréal coordinates; nothing about the user is sent.
 */
export function useForecast() {
  const [forecast, setForecast] = useState<Forecast | null>(loadForecast);
  const [state, setState] = useState<FetchState>('idle');
  const busy = useRef(false);
  const forecastRef = useRef(forecast);
  forecastRef.current = forecast;

  const refresh = useCallback(async () => {
    if (busy.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setState('offline');
      return;
    }
    busy.current = true;
    setState('loading');
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(forecastUrl(), { signal: ctrl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const next = parseGem(await res.json(), Date.now());
      saveForecast(next);
      setForecast(next);
      setState('idle');
    } catch {
      setState(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'failed');
    } finally {
      window.clearTimeout(timer);
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    const refreshIfStale = () => {
      const f = forecastRef.current;
      if (!f || Date.now() - f.fetchedAt > FRESH_FOR_MS) void refresh();
    };
    refreshIfStale();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshIfStale();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  return { forecast, state, refresh };
}
