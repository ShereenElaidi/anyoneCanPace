import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RouteData } from '../../../nav/types';
import { handleApi, type ApiContext, type BuildOptions, type RouteConfig } from './api';

const REPO = process.cwd(); // Vitest runs from the repository root
const TODAY = '2026-11-05';
/** The routes in the repository today (tests don't assume how many there are). */
const SHIPPED = JSON.parse(readFileSync(join(REPO, 'routes/routes.config.json'), 'utf8')) as RouteConfig[];

let root: string;
let ctx: ApiContext;
let build: ReturnType<typeof vi.fn<(o: BuildOptions) => Promise<{ ok: boolean; log: string }>>>;

const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const readJson = <T>(rel: string) => JSON.parse(read(rel)) as T;
const api = (method: string, path: string, body?: unknown) => handleApi(ctx, method, path, body);

const GPX = `<?xml version="1.0"?><gpx><metadata><author><name>Jane Doe</name></author></metadata><trk><name>Run from home</name><trkseg>
<trkpt lat="45.48" lon="-73.58"><ele>20</ele><time>2026-11-01T11:00:00Z</time></trkpt>
<trkpt lat="45.481" lon="-73.581"><ele>21</ele><time>2026-11-01T11:00:30Z</time></trkpt>
</trkseg></trk></gpx>`;
const SOURCE = { name: 'Strava', url: 'https://www.strava.com', attribution: 'Route from Strava' };

beforeEach(() => {
  // A copy of the real route files, so every test starts from what ships.
  root = mkdtempSync(join(tmpdir(), 'route-editor-'));
  for (const dir of ['routes/review', 'routes/cache', 'src/data/routes']) mkdirSync(join(root, dir), { recursive: true });
  cpSync(join(REPO, 'routes/routes.config.json'), join(root, 'routes/routes.config.json'));
  cpSync(join(REPO, 'routes/review/sample-loop.json'), join(root, 'routes/review/sample-loop.json'));
  cpSync(join(REPO, 'src/data/routes'), join(root, 'src/data/routes'), { recursive: true });
  cpSync(join(REPO, 'src/data/route-tags.json'), join(root, 'src/data/route-tags.json'));
  build = vi.fn(async () => ({ ok: true, log: 'Wrote 3 route(s)' }));
  ctx = { root, build, today: () => TODAY, gitStatus: async () => [], now: () => new Date('2026-11-05T12:00:00Z') };
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('reading', () => {
  it('lists the routes with their status and the tag list', async () => {
    const res = await api('GET', '/routes');
    const body = res.body as { routes: { id: string; built: boolean; verification: string }[]; tags: object; today: string };
    expect(res.status).toBe(200);
    expect(body.routes.map((r) => r.id)).toEqual(SHIPPED.map((c) => c.id));
    expect(body.routes.every((r) => r.built && r.verification)).toBe(true);
    expect(body.tags).toHaveProperty('waterfront');
    expect(body.today).toBe(TODAY);
  });

  it('gets one route with its track and review report (without the elevation samples)', async () => {
    const res = await api('GET', '/routes/sample-loop');
    const body = res.body as { data: RouteData; track: { type: string }; review: { turns: unknown[]; elevation: object } };
    expect(res.status).toBe(200);
    expect(body.data.id).toBe('sample-loop');
    expect(body.track.type).toBe('Feature');
    expect(body.review.turns.length).toBeGreaterThan(0);
    expect(body.review.elevation).not.toHaveProperty('samples');
  });

  it('answers 404 for unknown routes, paths and ids that could leave the folder', async () => {
    expect((await api('GET', '/routes/nope')).status).toBe(404);
    expect((await api('GET', '/routes/..')).status).toBe(404);
    expect((await api('GET', '/routes/sample-loop/extra')).status).toBe(404);
    expect((await api('PATCH', '/routes/sample-loop')).status).toBe(404);
    expect((await api('GET', '/routes/sample-loop/other')).status).toBe(404);
  });
});

describe('adding a route', () => {
  it('saves a cleaned GPX, adds it to the config and builds online', async () => {
    const res = await api('POST', '/routes', { id: 'canal-dawn', name: 'Canal Dawn', gpx: GPX, source: SOURCE, recorded: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'canal-dawn', points: 2 });
    expect((res.body as { removed: string[] }).removed).toContain('2 timestamps');
    const saved = read('routes/canal-dawn.gpx');
    expect(saved).not.toMatch(/Jane|home|<time/);
    expect(saved).toContain('<name>Canal Dawn</name>');
    const config = readJson<RouteConfig[]>('routes/routes.config.json');
    expect(config.at(-1)).toEqual({ id: 'canal-dawn', gpx: 'canal-dawn.gpx', name: 'Canal Dawn', source: SOURCE, recorded: true });
    expect(config).toHaveLength(SHIPPED.length + 1);
    expect(build).toHaveBeenCalledWith({});
  });

  it('refuses a taken id, a missing source, a bad link or no GPX, and writes nothing', async () => {
    const before = read('routes/routes.config.json');
    const res = await api('POST', '/routes', { id: 'pi-day', name: ' Pi', gpx: '', source: { ...SOURCE, url: 'http://x', attribution: '' } });
    expect(res.status).toBe(400);
    expect((res.body as { errors: string[] }).errors).toEqual([
      'there is already a route with the id "pi-day"',
      'The route needs a name, without spaces at the start or end.',
      'The source needs a credit line.',
      'The source link must start with https://.',
      'Choose a GPX file.',
    ]);
    expect(read('routes/routes.config.json')).toBe(before);
    expect(build).not.toHaveBeenCalled();
  });

  it('refuses a GPX without a track', async () => {
    const res = await api('POST', '/routes', { id: 'x', name: 'X', gpx: '<gpx><wpt lat="45" lon="-73"/></gpx>', source: SOURCE });
    expect((res.body as { errors: string[] }).errors[0]).toMatch(/no track/);
    expect(existsSync(join(root, 'routes/x.gpx'))).toBe(false);
  });

  it('never overwrites an existing GPX file', async () => {
    writeFileSync(join(root, 'routes/canal-dawn.gpx'), 'mine');
    const res = await api('POST', '/routes', { id: 'canal-dawn', name: 'Canal Dawn', gpx: GPX, source: SOURCE });
    expect(res.status).toBe(400);
    expect(read('routes/canal-dawn.gpx')).toBe('mine');
  });
});

describe('saving a route', () => {
  it('writes the merged file in the build\'s format and rebuilds offline', async () => {
    const res = await api('PUT', '/routes/pi-day', { description: 'Short and flat.', notes: ['Water at the park.'] });
    expect(res.status).toBe(200);
    const saved = read('src/data/routes/pi-day.json');
    expect(JSON.parse(saved)).toMatchObject({ description: 'Short and flat.', notes: ['Water at the park.'] });
    expect(saved).toMatch(/"bbox": \[-?[\d.]+, /); // short number arrays on one line, like npm run routes
    expect(build).toHaveBeenCalledWith({ offline: true });
  });

  it('reports a review reset when a turn changes', async () => {
    const data = readJson<RouteData>('src/data/routes/sample-loop.json');
    data.verification = { status: 'desk-reviewed', reviewer: 'A', date: TODAY };
    writeFileSync(join(root, 'src/data/routes/sample-loop.json'), JSON.stringify(data));
    const turns = data.turns.slice(1);
    const res = await api('PUT', '/routes/sample-loop', { turns });
    expect(res.body).toMatchObject({ verificationReset: true });
    expect(readJson<RouteData>('src/data/routes/sample-loop.json').verification.status).toBe('unverified');
  });

  it('puts the file back when the rebuild fails', async () => {
    const before = read('src/data/routes/pi-day.json');
    build.mockResolvedValueOnce({ ok: false, log: 'No cached elevation' });
    const res = await api('PUT', '/routes/pi-day', { description: 'Short and flat.' });
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ errors: ['The rebuild failed, so nothing was saved.'], build: { log: 'No cached elevation' } });
    expect(read('src/data/routes/pi-day.json')).toBe(before);
  });

  it('refuses invalid edits and writes nothing', async () => {
    const before = read('src/data/routes/pi-day.json');
    const res = await api('PUT', '/routes/pi-day', { geometry: 'x' });
    expect(res.status).toBe(400);
    expect(read('src/data/routes/pi-day.json')).toBe(before);
    expect(build).not.toHaveBeenCalled();
  });

  it('accepts a tag added to the tag list in an earlier request', async () => {
    const tags = { ...readJson<object>('src/data/route-tags.json'), 'hill-repeats': { label: 'Hill repeats', tone: 'blue' } };
    expect((await api('PUT', '/tags', tags)).status).toBe(200);
    expect((await api('PUT', '/routes/pi-day', { tags: ['hill-repeats'] })).status).toBe(200);
  });
});

describe('the tag list', () => {
  it('adds a tag', async () => {
    const tags = { ...readJson<object>('src/data/route-tags.json'), 'hill-repeats': { label: 'Hill repeats', tone: 'blue' } };
    const res = await api('PUT', '/tags', tags);
    expect(res.status).toBe(200);
    expect(read('src/data/route-tags.json')).toContain('"hill-repeats": {\n    "label": "Hill repeats",\n    "tone": "blue"\n  }');
  });

  it('refuses removing a tag a route still uses, or an invalid list', async () => {
    const { 'canal-path': _, ...tags } = readJson<Record<string, object>>('src/data/route-tags.json');
    expect((await api('PUT', '/tags', tags)).body).toEqual({ errors: ['"canal-path" is still used by Canal Test: remove it from that route first.'] });
    expect((await api('PUT', '/tags', { ...tags, 'canal-path': { label: 'Canal path', tone: 'red' } })).status).toBe(400);
  });
});

describe('building', () => {
  it('passes --reset-turns through only when asked', async () => {
    await api('POST', '/build', { resetTurns: true });
    await api('POST', '/build', {});
    expect(build.mock.calls).toEqual([[{ resetTurns: true }], [{ resetTurns: false }]]);
  });
});

describe('deleting a route', () => {
  const add = () => api('POST', '/routes', { id: 'canal-dawn', name: 'Canal Dawn', gpx: GPX, source: SOURCE });
  // The fake build doesn't write route files: give the new route the files a real build would.
  const fakeBuilt = () => {
    for (const rel of ['src/data/routes/canal-dawn.json', 'src/data/routes/canal-dawn.geojson', 'routes/review/canal-dawn.md', 'routes/cache/canal-dawn.streets.json']) {
      writeFileSync(join(root, rel), '{}');
    }
  };

  it('plans what would go, and blocks on code that names the route', async () => {
    await add();
    fakeBuilt();
    mkdirSync(join(root, 'src/nav'), { recursive: true });
    writeFileSync(join(root, 'src/nav/x.test.ts'), "replay('canal-dawn');\n");
    const plan = (await api('GET', '/routes/canal-dawn/delete-plan')).body as { files: string[]; references: { path: string }[] };
    expect(plan.files).toEqual([
      'routes/cache/canal-dawn.streets.json',
      'routes/canal-dawn.gpx',
      'routes/review/canal-dawn.md',
      'src/data/routes/canal-dawn.geojson',
      'src/data/routes/canal-dawn.json',
    ]);
    expect(plan.references.map((r) => r.path)).toEqual(['src/nav/x.test.ts']);
    const res = await api('DELETE', '/routes/canal-dawn', { confirmName: 'Canal Dawn' });
    expect(res.status).toBe(400);
    expect(existsSync(join(root, 'routes/canal-dawn.gpx'))).toBe(true);
  });

  it('needs the exact name, then moves the files to the trash and rebuilds offline', async () => {
    await add();
    fakeBuilt();
    build.mockClear();
    expect((await api('DELETE', '/routes/canal-dawn', { confirmName: 'canal dawn' })).status).toBe(400);
    expect(build).not.toHaveBeenCalled();
    const res = await api('DELETE', '/routes/canal-dawn', { confirmName: 'Canal Dawn' });
    expect(res.status).toBe(200);
    const trash = (res.body as { trash: string }).trash;
    expect(trash).toBe('.cache/route-editor-trash/canal-dawn-2026-11-05T12-00-00-000Z');
    expect(existsSync(join(root, 'routes/canal-dawn.gpx'))).toBe(false);
    expect(read(`${trash}/routes/canal-dawn.gpx`)).toContain('<name>Canal Dawn</name>');
    expect(readJson<RouteConfig[]>(`${trash}/routes/routes.config.json`).map((c) => c.id)).toContain('canal-dawn');
    expect(readJson<RouteConfig[]>('routes/routes.config.json').map((c) => c.id)).toEqual(SHIPPED.map((c) => c.id));
    expect(build).toHaveBeenCalledWith({ offline: true });
  });

  it('puts everything back when the rebuild fails', async () => {
    await add();
    fakeBuilt();
    const config = read('routes/routes.config.json');
    build.mockResolvedValueOnce({ ok: false, log: 'boom' });
    const res = await api('DELETE', '/routes/canal-dawn', { confirmName: 'Canal Dawn' });
    expect(res.status).toBe(500);
    expect(read('routes/routes.config.json')).toBe(config);
    expect(existsSync(join(root, 'routes/canal-dawn.gpx'))).toBe(true);
    expect(existsSync(join(root, 'src/data/routes/canal-dawn.json'))).toBe(true);
  });
});
