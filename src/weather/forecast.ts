/**
 * The one weather request the app makes, and pure parsing of its answer.
 *
 * Source: Open-Meteo's Environment Canada GEM endpoint, for fixed Montréal
 * coordinates (never the user's location). Times are requested as Unix
 * timestamps so nothing depends on the phone's time zone.
 */

export const MONTREAL = { lat: 45.5017, lon: -73.5673, timeZone: 'America/Toronto' } as const;

/**
 * Days of forecast fetched (today included). Five so the Sunday story can be made from
 * Wednesday; the dashboard's hour picker still only shows 3 days (PICKER_DAYS).
 */
export const FORECAST_DAYS = 5;

const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: MONTREAL.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Calendar days from `now`'s Montréal date to `at`'s (0 = same day). */
export function daysAhead(at: number, now: number): number {
  return Math.round((Date.parse(`${ymd.format(at)}T00:00Z`) - Date.parse(`${ymd.format(now)}T00:00Z`)) / 86_400_000);
}

/** True when a forecast downloaded at `now` reaches `at` (today plus FORECAST_DAYS − 1 days). */
export function freshForecastReaches(at: number, now: number): boolean {
  return daysAhead(at, now) <= FORECAST_DAYS - 1;
}

const HOURLY = [
  'temperature_2m',
  'apparent_temperature',
  'precipitation_probability',
  'precipitation',
  'rain',
  'showers',
  'snowfall',
  'snow_depth',
  'weather_code',
  'wind_speed_10m',
  'wind_gusts_10m',
  'is_day',
  'dew_point_2m',
] as const;

export function forecastUrl(): string {
  const q = new URLSearchParams({
    latitude: String(MONTREAL.lat),
    longitude: String(MONTREAL.lon),
    hourly: HOURLY.join(','),
    daily: 'sunrise,sunset',
    timezone: MONTREAL.timeZone,
    timeformat: 'unixtime',
    // Yesterday is for the refreeze check.
    forecast_days: String(FORECAST_DAYS),
    past_days: '1',
  });
  return `https://api.open-meteo.com/v1/gem?${q}`;
}

export interface HourWeather {
  /** Start of the hour, epoch ms. */
  at: number;
  tempC: number;
  feelsC: number;
  /** Dew point (°C), for humidex. Null if missing (also in forecasts saved before it was asked for). */
  dewPointC?: number | null;
  /** Chance of precipitation, %, or null if the model has none. */
  precipProb: number | null;
  /** Amounts in the hour. Null means unknown, never "none". */
  precipMm: number | null;
  rainMm: number | null;
  showersMm: number | null;
  snowCm: number | null;
  snowDepthM: number | null;
  /** WMO weather code, or null if missing. */
  code: number | null;
  windKmh: number | null;
  gustKmh: number | null;
  isDay: boolean;
}

export interface DaySun {
  /** Local midnight, epoch ms. */
  date: number;
  sunrise: number;
  sunset: number;
}

export interface Forecast {
  /** When it was downloaded, epoch ms. */
  fetchedAt: number;
  hours: HourWeather[];
  days: DaySun[];
}

export class ForecastError extends Error {}

type Raw = Record<string, unknown>;
const arr = (o: Raw, key: string): unknown[] => {
  const v = o[key];
  if (!Array.isArray(v)) throw new ForecastError(`Forecast is missing ${key}`);
  return v;
};
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Turns the API's JSON into a Forecast. Throws ForecastError on a broken shape. */
export function parseGem(json: unknown, fetchedAt: number): Forecast {
  if (!json || typeof json !== 'object') throw new ForecastError('Forecast is not an object');
  const root = json as Raw;
  if (root.error) throw new ForecastError(String(root.reason ?? 'Forecast error'));
  const hourly = root.hourly as Raw | undefined;
  const daily = root.daily as Raw | undefined;
  if (!hourly || !daily) throw new ForecastError('Forecast has no hourly or daily data');

  const times = arr(hourly, 'time');
  const col = (key: string) => arr(hourly, key);
  // Asked for later than the rest, so an older recording without it still parses.
  const dew = Array.isArray(hourly.dew_point_2m) ? hourly.dew_point_2m : [];
  const [temp, feels, prob, precip, rain, showers, snow, depth, code, wind, gust, isDay] = [
    'temperature_2m',
    'apparent_temperature',
    'precipitation_probability',
    'precipitation',
    'rain',
    'showers',
    'snowfall',
    'snow_depth',
    'weather_code',
    'wind_speed_10m',
    'wind_gusts_10m',
    'is_day',
  ].map(col);

  const hours: HourWeather[] = [];
  times.forEach((t, i) => {
    const at = num(t);
    const tempC = num(temp[i]);
    if (at === null || tempC === null) return; // an hour without a temperature is useless
    hours.push({
      at: at * 1000,
      tempC,
      feelsC: num(feels[i]) ?? tempC,
      dewPointC: num(dew[i]),
      precipProb: num(prob[i]),
      precipMm: num(precip[i]),
      rainMm: num(rain[i]),
      showersMm: num(showers[i]),
      snowCm: num(snow[i]),
      snowDepthM: num(depth[i]),
      code: num(code[i]),
      windKmh: num(wind[i]),
      gustKmh: num(gust[i]) ?? num(wind[i]),
      isDay: num(isDay[i]) === 1,
    });
  });
  if (!hours.length) throw new ForecastError('Forecast has no usable hours');

  const dTimes = arr(daily, 'time');
  const rises = arr(daily, 'sunrise');
  const sets = arr(daily, 'sunset');
  const days: DaySun[] = [];
  dTimes.forEach((t, i) => {
    const date = num(t);
    const sunrise = num(rises[i]);
    const sunset = num(sets[i]);
    if (date !== null && sunrise !== null && sunset !== null) {
      days.push({ date: date * 1000, sunrise: sunrise * 1000, sunset: sunset * 1000 });
    }
  });

  return { fetchedAt, hours, days };
}

/** The forecast hour containing `at`, if the forecast covers it. */
export function hourAt(f: Forecast, at: number): HourWeather | null {
  return f.hours.find((h) => at >= h.at && at < h.at + 3_600_000) ?? null;
}

/** Sunrise and sunset for the local day containing `at`. */
export function sunFor(f: Forecast, at: number): DaySun | null {
  return f.days.find((d) => at >= d.date && at < d.date + 86_400_000) ?? null;
}

const CODE_TEXT: [number[], string][] = [
  [[0], 'Clear'],
  [[1], 'Mostly clear'],
  [[2], 'Partly cloudy'],
  [[3], 'Overcast'],
  [[45, 48], 'Fog'],
  [[51, 53, 55], 'Drizzle'],
  [[56, 57], 'Freezing drizzle'],
  [[61, 63, 65], 'Rain'],
  [[66, 67], 'Freezing rain'],
  [[71, 73, 75], 'Snow'],
  [[77], 'Snow grains'],
  [[80, 81, 82], 'Rain showers'],
  [[85, 86], 'Snow showers'],
  [[95], 'Thunderstorm'],
  [[96, 99], 'Thunderstorm with hail'],
];

/** Plain words for a WMO weather code. */
export function weatherText(code: number | null): string {
  if (code === null) return 'Unknown';
  return CODE_TEXT.find(([codes]) => codes.includes(code))?.[1] ?? 'Unknown';
}
