import { describe, expect, it } from 'vitest';
import manifestJson from '../data/routes/manifest.json';
import type { RouteData, RouteManifest, RouteStats, RouteSummary } from '../nav/types';
import {
  availableFilters,
  clampPace,
  estimateTime,
  formatPace,
  matchesFilter,
  spokenPace,
  terrainText,
  validateTags,
} from './describe';

const stats = (distanceM: number, gainM: number): RouteStats => ({ distanceM, gainM, lossM: gainM, minEleM: 0, maxEleM: gainM });
const route = (id: string, distanceM: number, gainM: number, tags?: string[]): RouteSummary => ({
  id,
  name: id,
  kind: 'loop',
  stats: stats(distanceM, gainM),
  outline: 'M0 0',
  verification: 'unverified',
  ...(tags ? { tags } : {}),
});

describe('terrainText', () => {
  it('describes climb per km in words', () => {
    expect(terrainText(stats(12_363, 11))).toBe('Flat all the way'); // Canal Test
    expect(terrainText(stats(4611, 25))).toBe('Mostly flat'); // Pi Day
    expect(terrainText(stats(6358, 44))).toBe('Some gentle hills'); // Sample Loop
    expect(terrainText(stats(5000, 75))).toBe('A few real climbs');
    expect(terrainText(stats(5000, 150))).toBe('Hilly');
    expect(terrainText(stats(0, 0))).toBe('Flat all the way');
  });
});

describe('pace and time', () => {
  it('formats pace', () => {
    expect(formatPace(450)).toBe('7:30');
    expect(formatPace(360)).toBe('6:00');
    expect(spokenPace(450)).toBe('7 minutes 30 seconds per km');
    expect(spokenPace(360)).toBe('6 minutes per km');
  });

  it('clamps pace to 4:00–12:00 in 15 s steps', () => {
    expect(clampPace(100)).toBe(240);
    expect(clampPace(5000)).toBe(720);
    expect(clampPace(452)).toBe(450);
  });

  it('estimates time at a pace, with a spoken form', () => {
    expect(estimateTime(6358, 450)).toEqual({ text: '~48 min', spoken: 'about 48 minutes' });
    expect(estimateTime(4611, 450).text).toBe('~35 min');
    expect(estimateTime(12_363, 450)).toEqual({ text: '~1 h 33', spoken: 'about 1 hour 33 minutes' });
    expect(estimateTime(8000, 450)).toEqual({ text: '~1 h', spoken: 'about 1 hour' });
    expect(estimateTime(16_000, 452)).toEqual({ text: '~2 h 01', spoken: 'about 2 hours 1 minute' });
    expect(estimateTime(10, 450).text).toBe('~1 min');
  });
});

describe('filters', () => {
  const loop = route('loop', 6358, 44, ['waterfront']);
  const pi = route('pi', 4611, 25, ['shape-run']);
  const canal = route('canal', 12_363, 11, ['waterfront', 'canal-path']);

  it('matches by tag, distance and climb', () => {
    const pick = (f: Parameters<typeof matchesFilter>[1]) =>
      [loop, pi, canal].filter((r) => matchesFilter(r, f)).map((r) => r.id);
    expect(pick('all')).toEqual(['loop', 'pi', 'canal']);
    expect(pick('shape-run')).toEqual(['pi']);
    expect(pick('short')).toEqual(['pi']);
    expect(pick('flat')).toEqual(['pi', 'canal']);
    expect(pick('waterfront')).toEqual(['loop', 'canal']);
    expect(pick('long')).toEqual(['canal']);
  });

  it('only offers filters that match something', () => {
    expect(availableFilters([loop]).map((f) => f.id)).toEqual(['all', 'waterfront']);
    expect(availableFilters([]).map((f) => f.id)).toEqual(['all']);
  });
});

describe('tags', () => {
  it('rejects unknown or repeated tags', () => {
    expect(validateTags(undefined)).toEqual([]);
    expect(validateTags(['waterfront', 'shape-run'])).toEqual([]);
    expect(validateTags(['Waterfront'])[0]).toMatch(/unknown tag "Waterfront"/);
    expect(validateTags(['waterfront', 'waterfront'])).toEqual(['a tag is listed twice']);
    expect(validateTags('waterfront')).toEqual(['tags must be a list']);
  });

  it('every shipped route uses known tags, and the manifest matches the route files', () => {
    const manifest = manifestJson as unknown as RouteManifest;
    const files = import.meta.glob<RouteData>(['../data/routes/*.json', '!../data/routes/manifest.json'], {
      eager: true,
      import: 'default',
    });
    expect(Object.keys(files).length).toBe(manifest.routes.length);
    for (const [file, data] of Object.entries(files)) {
      expect(validateTags(data.tags), file).toEqual([]);
      const entry = manifest.routes.find((r) => r.id === data.id);
      expect(entry?.tags, `${file}: run npm run routes`).toEqual(data.tags);
      expect(entry?.place, `${file}: run npm run routes`).toEqual(data.place);
    }
  });
});
