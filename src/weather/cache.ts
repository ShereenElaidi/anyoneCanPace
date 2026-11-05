/**
 * Last known forecast and the pacer's usual start hour, in localStorage.
 * The forecast is for fixed Montréal coordinates, so nothing personal is stored.
 */
import type { Forecast } from './forecast';

const FORECAST_KEY = 'anyonecanpace:weather:v1';
const USUAL_HOUR_KEY = 'anyonecanpace:runhour:v1';

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

export function loadUsualHour(): number | null {
  try {
    const v = Number(localStorage.getItem(USUAL_HOUR_KEY));
    return localStorage.getItem(USUAL_HOUR_KEY) !== null && Number.isInteger(v) && v >= 0 && v <= 23 ? v : null;
  } catch {
    return null;
  }
}

export function saveUsualHour(hour: number | null): void {
  try {
    if (hour === null) localStorage.removeItem(USUAL_HOUR_KEY);
    else localStorage.setItem(USUAL_HOUR_KEY, String(hour));
  } catch {
    // Not remembered; the picker still works.
  }
}
