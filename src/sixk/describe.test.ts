import { describe, expect, it } from 'vitest';
import manifestJson from '../data/routes/manifest.json';
import type { RouteData, RouteManifest, RouteStats, RouteSummary } from '../nav/types';
import {
  availableFilters,
  nearestPace,
  sortRoutes,
  estimateTime,
  formatPace,
  matchesFilter,
  spokenPace,
  terrainText,
  DESCRIPTION_MAX,
  validateDescription,
  validateTagList,
  validateTags,
  ROUTE_TAGS,
  TAG_LABEL_MAX,
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

  it('keeps a saved pace to one of the listed ones (old ± step values snap to the nearest)', () => {
    expect(nearestPace(450)).toBe(450);
    expect(nearestPace(435)).toBe(450); // 7:15 → 7:30
    expect(nearestPace(480)).toBe(510); // 8:00, halfway → the slower 8:30
    expect(nearestPace(100)).toBe(360);
    expect(nearestPace(5000)).toBe(600);
  });

  it('sorts by name, distance or climbing, ties by name, without changing the input', () => {
    const r = (name: string, distanceM: number, gainM: number) =>
      ({ id: name, name, kind: 'loop', stats: { distanceM, gainM, lossM: gainM, minEleM: 0, maxEleM: 0 } }) as RouteSummary;
    const list = [r('pi Day', 4600, 40), r('Canal', 12400, 10), r('1st bday', 7000, 40), r('Apple', 4600, 90)];
    const names = (rs: RouteSummary[]) => rs.map((x) => x.name);
    expect(names(sortRoutes(list, 'name'))).toEqual(['1st bday', 'Apple', 'Canal', 'pi Day']);
    expect(names(sortRoutes(list, 'distance'))).toEqual(['Apple', 'pi Day', '1st bday', 'Canal']);
    expect(names(sortRoutes(list, 'gain'))).toEqual(['Canal', '1st bday', 'pi Day', 'Apple']);
    expect(names(list)).toEqual(['pi Day', 'Canal', '1st bday', 'Apple']);
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

describe('description', () => {
  it('accepts a short paragraph or nothing', () => {
    expect(validateDescription(undefined)).toEqual([]);
    expect(validateDescription('Flat along the canal, shaded most of the way.')).toEqual([]);
    expect(validateDescription('x'.repeat(DESCRIPTION_MAX))).toEqual([]);
  });

  it('rejects blank, padded, too long or non-text descriptions', () => {
    expect(validateDescription('   ')[0]).toMatch(/blank/);
    expect(validateDescription(' Flat. ')[0]).toMatch(/spaces/);
    expect(validateDescription('x'.repeat(DESCRIPTION_MAX + 1))[0]).toMatch(/at most 280/);
    expect(validateDescription(42)).toEqual(['description must be text']);
  });
});

describe('tag list', () => {
  it('the shipped tag list is valid (the route editor can add tags, so the list itself isn’t fixed here)', () => {
    expect(validateTagList(ROUTE_TAGS)).toEqual([]);
  });

  const base = {
    'shape-run': { label: 'Shape run', tone: 'green' },
    waterfront: { label: 'Waterfront', tone: 'gold' },
    testing: { label: 'Testing', tone: 'gold' },
  };

  it('accepts a new tag with a known tone', () => {
    expect(validateTagList({ ...base, 'hill-repeats': { label: 'Hill repeats', tone: 'blue' } })).toEqual([]);
  });

  it('rejects bad ids, labels and tones', () => {
    expect(validateTagList({ ...base, 'Hill Repeats': { label: 'Hill repeats', tone: 'blue' } })[0]).toMatch(/lowercase words/);
    expect(validateTagList({ ...base, hills: { label: ' Hills', tone: 'blue' } })[0]).toMatch(/spaces/);
    expect(validateTagList({ ...base, hills: { label: 'x'.repeat(TAG_LABEL_MAX + 1), tone: 'blue' } })[0]).toMatch(/at most 24/);
    expect(validateTagList({ ...base, hills: { label: 'Hills', tone: 'red' } })[0]).toMatch(/unknown tone "red"/);
    expect(validateTagList({ ...base, hills: { label: 'Hills', tone: 'blue', colour: '#f00' } })[0]).toMatch(/unknown field "colour"/);
    expect(validateTagList([])).toHaveLength(1);
  });

  it('rejects two tags with the same label, ignoring case', () => {
    expect(validateTagList({ ...base, 'water-front': { label: 'waterfront', tone: 'gold' } })).toEqual([
      'tags "waterfront" and "water-front" have the same label "waterfront"',
    ]);
  });

  it('keeps the tags the filters depend on', () => {
    expect(validateTagList({ waterfront: base.waterfront })).toEqual([
      'tag "shape-run" is used by a "Show routes" filter and can\'t be removed',
      'tag "testing" is used by a "Show routes" filter and can\'t be removed',
    ]);
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
      expect(validateDescription(data.description), file).toEqual([]);
      const entry = manifest.routes.find((r) => r.id === data.id);
      expect(entry?.tags, `${file}: run npm run routes`).toEqual(data.tags);
      expect(entry?.place, `${file}: run npm run routes`).toEqual(data.place);
    }
  });
});
