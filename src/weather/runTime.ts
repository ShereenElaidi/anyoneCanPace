/**
 * Picking the run hour and building the outfit input for it. Pure: `now` is
 * always passed in. Local times are Montréal's, whatever the phone's zone.
 */
import { hourAt, MONTREAL, sunFor, type Forecast } from './forecast';
import { RUN_DURATION_MIN, type Light, type OutfitInput, type Recent } from './outfit';

/** Default run start (local hour in Montréal). */
export const DEFAULT_RUN_HOUR = 10;

/** Earliest and latest start hours that count as "sensible" if 10:00 isn't in the forecast. */
export const EARLIEST_RUN_HOUR = 6;
export const LATEST_RUN_HOUR = 21;

const hourFmt = new Intl.DateTimeFormat('en-CA', { timeZone: MONTREAL.timeZone, hour: 'numeric', hourCycle: 'h23' });
const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: MONTREAL.timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Hour of day (0–23) in Montréal. */
export function localHour(at: number): number {
  return Number(hourFmt.format(at)) % 24;
}

/** YYYY-MM-DD in Montréal. */
export function localDate(at: number): string {
  return dateFmt.format(at);
}

/**
 * Default run start: the next 10:00. If the forecast doesn't reach it, the
 * next whole hour between 6:00 and 21:00. Returns null when the forecast has
 * no upcoming hours.
 */
export function defaultRunTime(f: Forecast, now: number): number | null {
  const upcoming = f.hours.map((h) => h.at).filter((at) => at >= now);
  if (!upcoming.length) return null;
  const next = upcoming.find((at) => localHour(at) === DEFAULT_RUN_HOUR);
  if (next !== undefined) return next;
  return upcoming.find((at) => localHour(at) >= EARLIEST_RUN_HOUR && localHour(at) <= LATEST_RUN_HOUR) ?? upcoming[0];
}

/** Hours the picker offers: every upcoming forecast hour. */
export function runTimeChoices(f: Forecast, now: number): number[] {
  return f.hours.map((h) => h.at).filter((at) => at >= now - 3_600_000 + 1);
}

/** Daylight during a run starting at `at`. */
export function lightAt(f: Forecast, at: number): Light {
  const sun = sunFor(f, at);
  if (!sun) return hourAt(f, at)?.isDay === false ? 'dark' : 'day';
  if (at < sun.sunrise || at >= sun.sunset) return 'dark';
  if (at + RUN_DURATION_MIN * 60_000 > sun.sunset) return 'dusk';
  return 'day';
}

/** Hours of the previous 24 the forecast must have before `recent` is trusted. */
const RECENT_MIN_HOURS = 18;

/** Rain, snow and thaw in the 24 h before `at`, or null if the forecast doesn't reach back that far. */
export function recentFor(f: Forecast, at: number): Recent | null {
  const past = f.hours.filter((h) => h.at < at && h.at >= at - 24 * 3_600_000);
  if (past.length < RECENT_MIN_HOURS) return null;
  return {
    wetMm: past.reduce((sum, h) => sum + (h.rainMm ?? 0) + (h.showersMm ?? 0), 0),
    snowCm: past.reduce((sum, h) => sum + (h.snowCm ?? 0), 0),
    wasAboveZero: past.some((h) => h.tempC > 0),
  };
}

/** Everything whatToWear needs for a run at `at`, or null if the forecast doesn't cover it. */
export function outfitInputFor(f: Forecast, at: number): OutfitInput | null {
  const h = hourAt(f, at);
  if (!h) return null;
  return {
    tempC: h.tempC,
    feelsC: h.feelsC,
    dewPointC: h.dewPointC ?? null,
    precipProb: h.precipProb,
    rainMm: h.rainMm === null && h.showersMm === null ? null : (h.rainMm ?? 0) + (h.showersMm ?? 0),
    snowCm: h.snowCm,
    precipMm: h.precipMm,
    snowDepthM: h.snowDepthM,
    code: h.code,
    windKmh: h.windKmh,
    gustKmh: h.gustKmh,
    light: lightAt(f, at),
    recent: recentFor(f, at),
  };
}
