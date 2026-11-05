/**
 * Last known forecast, in localStorage.
 * The forecast is for fixed Montréal coordinates, so nothing personal is stored.
 */
import type { Forecast } from './forecast';

const FORECAST_KEY = 'anyonecanpace:weather:v1';

/** A forecast younger than this is used as is; older ones are refreshed when online. */
export const FRESH_FOR_MS = 30 * 60_000;

export function loadForecast(): Forecast | null {
  try {
    const raw = localStorage.getItem(FORECAST_KEY);
    if (!raw) return null;
    const f = JSON.parse(raw) as Forecast;
    if (typeof f?.fetchedAt !== 'number' || !Array.isArray(f.hours) || !Array.isArray(f.days)) return null;
    return f;
  } catch {
    return null;
  }
}

export function saveForecast(f: Forecast): void {
  try {
    localStorage.setItem(FORECAST_KEY, JSON.stringify(f));
  } catch {
    // Storage full or blocked: the dashboard still shows this visit's forecast.
  }
}
