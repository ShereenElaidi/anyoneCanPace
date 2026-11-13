import { describe, expect, it } from 'vitest';
import { EVENT, mapsLink, montrealTime, nextRun, validateEvent, type RunEvent } from './event';
import meetingMap from '../data/meeting-map.json';
import mapImage from '../assets/story/meeting-map.webp?inline';
import { MAP_VERSION } from '../sixk/map/offlineMap';
import { MAP_PICTURE } from '../story/layout';

describe('event file', () => {
  it('is valid: Sunday, meet 10:00, run 10:15, Café Tranquille', () => {
    expect(validateEvent(EVENT)).toEqual([]);
    expect(EVENT).toMatchObject({ weekday: 'Sunday', meetTime: '10:00', startTime: '10:15' });
    expect(EVENT.place).toMatchObject({ name: 'Café Tranquille', lat: 45.50935, lon: -73.56488 });
  });

  it('catches mistakes', () => {
    const bad = { ...EVENT, weekday: 'Sun', meetTime: '10:30', place: { ...EVENT.place, lat: -73.5, lon: 45.5 } };
    expect(validateEvent(bad as unknown as RunEvent)).toEqual([
      'weekday must be one of Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday',
      'meetTime must be at or before startTime',
      'place lat/lon are not in Montréal',
    ]);
  });
});

describe('Montréal times', () => {
  it('handles daylight saving on both sides', () => {
    expect(montrealTime(2026, 11, 8, '10:15')).toBe(Date.UTC(2026, 10, 8, 15, 15)); // EST, UTC−5
    expect(montrealTime(2027, 3, 14, '10:15')).toBe(Date.UTC(2027, 2, 14, 14, 15)); // EDT, UTC−4
    expect(montrealTime(2026, 11, 1, '10:00')).toBe(Date.UTC(2026, 10, 1, 15, 0)); // the morning clocks fall back
  });
});

describe('next run', () => {
  const est = (d: number, h: number, min = 0) => Date.UTC(2026, 10, d, h + 5, min);

  it('from a Thursday: this Sunday', () => {
    expect(nextRun(est(5, 20))).toEqual({
      date: '2026-11-08',
      meetAt: est(8, 10),
      startAt: est(8, 10, 15),
    });
  });

  it('Saturday night and Sunday during the run: today’s; after it ends: next week', () => {
    expect(nextRun(est(7, 23, 59)).date).toBe('2026-11-08');
    expect(nextRun(est(8, 11, 0)).date).toBe('2026-11-08');
    expect(nextRun(est(8, 11, 15)).date).toBe('2026-11-15');
  });

  it('Saturday evening UTC is already Sunday in UTC but not in Montréal', () => {
    expect(nextRun(Date.UTC(2026, 10, 8, 2, 0)).date).toBe('2026-11-08'); // Sat 9 p.m. EST
  });
});

describe('map link', () => {
  it('opens the exact meeting point', () => {
    expect(mapsLink()).toBe('https://www.google.com/maps/search/?api=1&query=45.50935,-73.56488');
  });
});

describe('meeting-point picture for the story', () => {
  it('was made for this meeting place and map (re-make it with ?meeting-map when either changes)', () => {
    expect([meetingMap.lat, meetingMap.lon]).toEqual([EVENT.place.lat, EVENT.place.lon]);
    expect(meetingMap.mapVersion).toBe(MAP_VERSION);
  });

  it('is a small WebP', () => {
    const bytes = atob(mapImage.replace(/^data:[^,]*,/, ''));
    expect(bytes.slice(0, 4) + bytes.slice(8, 12)).toBe('RIFFWEBP');
    expect(bytes.length).toBeLessThan(200 * 1024);
    expect([meetingMap.width, meetingMap.height]).toEqual([MAP_PICTURE.width, MAP_PICTURE.height]);
  });
});
