import { describe, expect, it } from 'vitest';
import { deletionBlockers, findReferences, planDeletion, routeFiles } from './deletion';
import type { RouteConfig } from './types';

const config: RouteConfig[] = [
  { id: 'pi-day', gpx: 'pi.gpx', name: 'Pi Day' },
  { id: 'canal-dawn', gpx: 'canal-dawn.gpx', name: 'Canal Dawn' },
  { id: 'canal-dusk', gpx: 'canal-dawn.gpx', name: 'Canal Dusk' }, // same GPX, other route
];
const existing = [
  'routes/canal-dawn.gpx',
  'routes/pi.gpx',
  'routes/cache/canal-dawn.streets.json',
  'routes/cache/canal-dawn.proposed-turns.json',
  'routes/cache/canal-dawn-old.streets.json',
  'routes/review/canal-dawn.md',
  'routes/review/canal-dawn.json',
  'src/data/routes/canal-dawn.json',
  'src/data/routes/canal-dawn.geojson',
  'src/data/routes/pi-day.json',
];

describe('routeFiles', () => {
  it('lists only the route’s own files', () => {
    expect(routeFiles('canal-dawn', 'canal-dawn.gpx', existing)).toEqual([
      'routes/cache/canal-dawn.proposed-turns.json',
      'routes/cache/canal-dawn.streets.json',
      'routes/canal-dawn.gpx',
      'routes/review/canal-dawn.json',
      'routes/review/canal-dawn.md',
      'src/data/routes/canal-dawn.geojson',
      'src/data/routes/canal-dawn.json',
    ]);
  });
});

describe('findReferences', () => {
  const sources = [
    { path: 'src/nav/tracker.test.ts', text: "const r = route('pi-day');\nconst piDay = 3.14;" },
    { path: 'src/dev/simulateGps.ts', text: 'open /?sim=pi-day to try it' },
    { path: 'scripts/x.ts', text: 'read("routes/review/pi-day.md")' },
    { path: 'src/other.ts', text: "const pi = 'pi-day-2'; // another id" },
    { path: 'src/data/routes/pi-day.json', text: '"id": "pi-day"' },
  ];
  it('finds quoted ids, ?sim= links and file names, but not longer ids or the route’s own files', () => {
    expect(findReferences('pi-day', sources, ['src/data/routes/pi-day.json'])).toEqual([
      { path: 'src/nav/tracker.test.ts', line: 1, text: "const r = route('pi-day');" },
      { path: 'src/dev/simulateGps.ts', line: 1, text: 'open /?sim=pi-day to try it' },
      { path: 'scripts/x.ts', line: 1, text: 'read("routes/review/pi-day.md")' },
    ]);
  });
});

describe('planDeletion', () => {
  const base = { config, existing, sources: [], advisories: { notices: [] }, gitStatus: [], reviewed: 'unverified' };

  it('keeps a GPX another route uses', () => {
    const plan = planDeletion({ ...base, id: 'canal-dusk' })!;
    expect(plan.sharedGpx).toBe('routes/canal-dawn.gpx');
    expect(plan.files).not.toContain('routes/canal-dawn.gpx');
  });

  it('lists advisories, uncommitted files and a lost review', () => {
    const plan = planDeletion({
      ...base,
      id: 'canal-dawn',
      config: config.slice(0, 2),
      advisories: { notices: [{ id: 'works', route: 'canal-dawn', text: 'Path closed' }, { id: 'x', route: 'global', text: 'y' }] },
      gitStatus: [' M src/data/routes/canal-dawn.json', '?? routes/canal-dawn.gpx', ' M routes/routes.config.json'],
      reviewed: 'field-verified',
    })!;
    expect(plan.advisories).toEqual(['works: Path closed']);
    expect(plan.uncommitted).toEqual(['routes/canal-dawn.gpx', 'src/data/routes/canal-dawn.json']);
    expect(plan.reviewed).toBe('field-verified');
  });

  it('treats an untracked folder in git status as covering the files in it', () => {
    const plan = planDeletion({ ...base, id: 'canal-dawn', gitStatus: ['?? routes/cache/'] })!;
    expect(plan.uncommitted).toEqual(['routes/cache/canal-dawn.proposed-turns.json', 'routes/cache/canal-dawn.streets.json']);
  });

  it('returns null for an unknown route', () => {
    expect(planDeletion({ ...base, id: 'nope' })).toBeNull();
  });
});

describe('deletionBlockers', () => {
  const plan = planDeletion({
    id: 'pi-day',
    config,
    existing,
    sources: [{ path: 'src/a.test.ts', text: "load('pi-day')" }],
    advisories: { notices: [] },
    gitStatus: [],
    reviewed: null,
  })!;
  it('blocks on references and needs the exact name', () => {
    expect(deletionBlockers(plan, 'pi day')).toEqual([
      '1 line(s) in the code still name "pi-day": change them first.',
      'Type the route’s name exactly (“Pi Day”) to confirm.',
    ]);
    expect(deletionBlockers({ ...plan, references: [] }, 'Pi Day')).toEqual([]);
  });
});
