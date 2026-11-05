import { describe, expect, it } from 'vitest';
import fixture from './fixtures/gem-2026-11-04.json';
import { forecastUrl, hourAt, MONTREAL, parseGem, sunFor, weatherText, ForecastError } from './forecast';
import { defaultRunTime, lightAt, localHour, outfitInputFor, runTimeChoices } from './runTime';
import { estimateUvIndex, solarElevationDeg } from './sun';
import { loadForecast, loadUsualHour, saveForecast, saveUsualHour } from './cache';

const f = parseGem(fixture, 1_793_800_000_000);

/** Epoch ms for a Montréal local time on 2026-11-04 (EST, UTC−5). */
const est = (day: number, hour: number, min = 0) => Date.UTC(2026, 10, day, hour + 5, min);

describe('weather request', () => {
  it('asks the GEM endpoint for fixed Montréal coordinates, never the user’s', () => {
    const url = new URL(forecastUrl());
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/gem');
    expect(url.searchParams.get('latitude')).toBe(String(MONTREAL.lat));
    expect(url.searchParams.get('longitude')).toBe(String(MONTREAL.lon));
    expect(url.searchParams.get('timeformat')).toBe('unixtime');
    expect(url.searchParams.get('hourly')).toContain('apparent_temperature');
  });
});

describe('parsing a recorded GEM forecast', () => {
  it('reads 48 hours and 2 days of sunrise/sunset', () => {
    expect(f.hours).toHaveLength(48);
    expect(f.days).toHaveLength(2);
    const h = f.hours[0];
    expect(h.at).toBe(fixture.hourly.time[0] * 1000);
    expect(h.tempC).toBe(fixture.hourly.temperature_2m[0]);
    expect(h.feelsC).toBe(fixture.hourly.apparent_temperature[0]);
    expect(typeof h.isDay).toBe('boolean');
    expect(localHour(h.at)).toBe(0); // midnight in Montréal
  });

  it('finds the hour and the day for a time', () => {
    const at = est(4, 9) + 20 * 60_000; // 9:20
    expect(hourAt(f, at)?.at).toBe(est(4, 9));
    const sun = sunFor(f, at)!;
    expect(localHour(sun.sunrise)).toBe(6);
    expect(localHour(sun.sunset)).toBe(16);
    expect(hourAt(f, est(7, 9))).toBeNull();
  });

  it('copes with nulls and rejects broken data', () => {
    const withNulls = structuredClone(fixture) as typeof fixture & { hourly: Record<string, unknown[]> };
    withNulls.hourly.precipitation_probability[3] = null as unknown as number;
    withNulls.hourly.temperature_2m[4] = null as unknown as number;
    const p = parseGem(withNulls, 0);
    expect(p.hours[3].precipProb).toBeNull();
    expect(p.hours).toHaveLength(47); // the hour without a temperature is dropped
    expect(() => parseGem({ error: true, reason: 'Bad' }, 0)).toThrow(ForecastError);
    expect(() => parseGem({ hourly: {} }, 0)).toThrow(ForecastError);
    expect(() => parseGem('nope', 0)).toThrow(ForecastError);
  });

  it('describes weather codes in words', () => {
    expect(weatherText(0)).toBe('Clear');
    expect(weatherText(63)).toBe('Rain');
    expect(weatherText(66)).toBe('Freezing rain');
    expect(weatherText(75)).toBe('Snow');
    expect(weatherText(123)).toBe('Unknown');
  });
});

describe('run time', () => {
  it('defaults to the next 10 a.m.: today before 10, tomorrow after', () => {
    expect(defaultRunTime(f, est(4, 7, 30), null)).toBe(est(4, 10));
    expect(defaultRunTime(f, est(4, 9, 59), null)).toBe(est(4, 10));
    expect(defaultRunTime(f, est(4, 10, 1), null)).toBe(est(5, 10));
    expect(defaultRunTime(f, est(4, 22, 1), null)).toBe(est(5, 10));
  });

  it('if the forecast no longer reaches 10 a.m., the next sensible hour', () => {
    expect(localHour(defaultRunTime(f, est(5, 11, 1), null)!)).toBe(12); // only today's afternoon is left
    expect(localHour(defaultRunTime(f, est(5, 22, 1), null)!)).toBe(23); // late: whatever is left
  });

  it('uses the pacer’s usual start hour when saved', () => {
    expect(defaultRunTime(f, est(4, 10) + 60_000, 9)).toBe(est(5, 9)); // tomorrow 9:00
    expect(defaultRunTime(f, est(4, 7), 9)).toBe(est(4, 9));
  });

  it('a forecast with no upcoming hours gives no default', () => {
    expect(defaultRunTime(f, est(9, 9), null)).toBeNull();
    expect(runTimeChoices(f, est(9, 9))).toHaveLength(0);
  });

  it('daylight: dark before sunrise and after sunset, dusk if it sets mid-run', () => {
    expect(lightAt(f, est(4, 5))).toBe('dark');
    expect(lightAt(f, est(4, 10))).toBe('day');
    expect(lightAt(f, est(4, 16))).toBe('dusk'); // sunset 16:37
    expect(lightAt(f, est(4, 18))).toBe('dark');
  });

  it('builds the outfit input from the forecast hour', () => {
    const input = outfitInputFor(f, est(4, 12))!;
    const h = hourAt(f, est(4, 12))!;
    expect(input.feelsC).toBe(h.feelsC);
    expect(input.rainMm).toBe(h.rainMm + h.showersMm);
    expect(input.light).toBe('day');
    expect(input.uvIndex).toBeGreaterThanOrEqual(0);
    expect(input.uvIndex).toBeLessThan(4); // November in Montréal: never strong sun
    expect(outfitInputFor(f, est(9, 12))).toBeNull();
  });
});

describe('sun and estimated UV (GEM has no UV)', () => {
  it('sun height in Montréal matches the almanac (±1°)', () => {
    // Solar noon is about 12:55 local in summer (EDT) and 11:55 in November (EST).
    expect(solarElevationDeg(Date.UTC(2026, 5, 21, 16, 55), MONTREAL.lat, MONTREAL.lon)).toBeCloseTo(67.9, 0);
    expect(solarElevationDeg(Date.UTC(2026, 10, 4, 16, 55), MONTREAL.lat, MONTREAL.lon)).toBeCloseTo(29.1, 0);
    expect(solarElevationDeg(Date.UTC(2026, 10, 5, 3), MONTREAL.lat, MONTREAL.lon)).toBeLessThan(0); // 10 p.m.
  });

  it('UV: about 9 at a clear June noon, low in November, cut by cloud, zero at night', () => {
    expect(estimateUvIndex(67.9, 0)).toBeGreaterThan(8);
    expect(estimateUvIndex(67.9, 0)).toBeLessThan(10);
    expect(estimateUvIndex(29.1, 0)).toBeLessThan(2.5);
    expect(estimateUvIndex(67.9, 100)).toBeLessThan(3);
    expect(estimateUvIndex(-5, 0)).toBe(0);
  });
});

describe('cache', () => {
  it('keeps the last forecast and the usual start hour', () => {
    expect(loadForecast()).toBeNull();
    saveForecast(f);
    expect(loadForecast()?.hours).toHaveLength(48);
    localStorage.setItem('anyonecanpace:weather:v1', '{broken');
    expect(loadForecast()).toBeNull();

    expect(loadUsualHour()).toBeNull();
    saveUsualHour(9);
    expect(loadUsualHour()).toBe(9);
    saveUsualHour(0);
    expect(loadUsualHour()).toBe(0);
    saveUsualHour(null);
    expect(loadUsualHour()).toBeNull();
  });
});
