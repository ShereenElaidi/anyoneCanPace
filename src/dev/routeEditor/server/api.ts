/**
 * The route editor's API, as plain functions over a repository folder, so the
 * tests run them against a temporary copy. The Vite plugin (plugin.ts) only
 * adapts HTTP requests to these. Dev only: never part of the app.
 *
 *   GET  /routes          the routes, their config and status, the tag list
 *   GET  /routes/:id      one route: config, route file, track, review report
 *   POST /routes          add a route from a GPX (cleaned first), then build
 *   PUT  /routes/:id      save hand-edited fields (edits.ts rules), then build offline
 *   PUT  /tags            replace the tag list (only removing unused tags)
 *   POST /build           run `npm run routes` (optionally --reset-turns)
 *
 * Builds run scripts/build-routes.ts unchanged, so every rule it enforces
 * (stale turns, verification resets, kept hand edits) still holds. A save
 * whose build fails is rolled back.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatJson } from '../../../../scripts/lib/json.ts';
import { sanitizeGpx } from '../../../../scripts/lib/sanitize-gpx.ts';
import type { RouteData, RouteSource } from '../../../nav/types';
import { validateTagList, type TagDef } from '../../../sixk/describe';
import { applyEdits, NAME_MAX, validateNewRouteId } from '../edits';

export interface RouteConfig {
  id: string;
  gpx: string;
  name: string;
  source?: RouteSource;
  /** Recorded on a run (not drawn on a map): its turns need a closer look. Build-time only. */
  recorded?: boolean;
}

export interface BuildResult {
  ok: boolean;
  log: string;
}

export interface BuildOptions {
  offline?: boolean;
  resetTurns?: boolean;
}

export interface ApiContext {
  root: string;
  /** Runs scripts/build-routes.ts in `root`. */
  build: (options: BuildOptions) => Promise<BuildResult>;
  /** Today, YYYY-MM-DD, local time. */
  today: () => string;
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

const ID_PARAM = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** A GPX upload larger than this is refused (watch exports of a long run are a few MB). */
export const MAX_GPX_BYTES = 8 * 1024 * 1024;

const paths = (root: string) => ({
  config: join(root, 'routes', 'routes.config.json'),
  gpx: (file: string) => join(root, 'routes', file),
  route: (id: string) => join(root, 'src', 'data', 'routes', `${id}.json`),
  track: (id: string) => join(root, 'src', 'data', 'routes', `${id}.geojson`),
  review: (id: string) => join(root, 'routes', 'review', `${id}.json`),
  tags: join(root, 'src', 'data', 'route-tags.json'),
});

const readJson = <T>(path: string): T | null => (existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : null);
const ok = (body: unknown): ApiResponse => ({ status: 200, body });
const bad = (errors: string[], status = 400): ApiResponse => ({ status, body: { errors } });

/** Every route a GPX in routes/ describes, in config order. */
function readConfig(root: string): RouteConfig[] {
  return readJson<RouteConfig[]>(paths(root).config) ?? [];
}

function listRoutes(ctx: ApiContext): ApiResponse {
  const p = paths(ctx.root);
  const routes = readConfig(ctx.root).map((c) => {
    const data = readJson<RouteData>(p.route(c.id));
    return {
      id: c.id,
      name: data?.name ?? c.name,
      gpx: c.gpx,
      source: c.source ?? null,
      recorded: c.recorded ?? false,
      built: !!data,
      verification: data?.verification.status ?? null,
      distanceM: data?.stats.distanceM ?? null,
      place: data?.place ?? null,
      tags: data?.tags ?? [],
    };
  });
  return ok({ today: ctx.today(), routes, tags: readJson(p.tags) });
}

function getRoute(ctx: ApiContext, id: string): ApiResponse {
  const p = paths(ctx.root);
  const config = readConfig(ctx.root).find((c) => c.id === id);
  if (!config) return bad([`No route "${id}" in routes/routes.config.json.`], 404);
  const review = readJson<{ elevation?: { samples?: unknown } }>(p.review(id));
  if (review?.elevation) delete review.elevation.samples; // large, and only for the report
  return ok({
    config,
    data: readJson<RouteData>(p.route(id)),
    track: readJson(p.track(id)),
    review,
    tags: readJson(p.tags),
    today: ctx.today(),
  });
}

function validSource(s: unknown): string[] {
  if (!s || typeof s !== 'object') return ['Pick where the route comes from.'];
  const { name, url, attribution, ...rest } = s as Record<string, unknown>;
  const errors = Object.keys(rest).map((k) => `source has an unknown field "${k}".`);
  if (typeof name !== 'string' || !name.trim()) errors.push('The source needs a name.');
  if (typeof attribution !== 'string' || !attribution.trim()) errors.push('The source needs a credit line.');
  if (url !== undefined && (typeof url !== 'string' || !/^https:\/\/[^\s]+$/.test(url))) errors.push('The source link must start with https://.');
  return errors;
}

async function addRoute(ctx: ApiContext, body: unknown): Promise<ApiResponse> {
  if (!body || typeof body !== 'object') return bad(['Send the route as JSON.']);
  const { id, name, gpx, source, recorded } = body as Record<string, unknown>;
  const config = readConfig(ctx.root);
  const errors = validateNewRouteId(typeof id === 'string' ? id : '', config.map((c) => c.id));
  if (typeof name !== 'string' || !name.trim() || name !== name.trim()) errors.push('The route needs a name, without spaces at the start or end.');
  else if (name.length > NAME_MAX) errors.push(`The name is longer than ${NAME_MAX} characters.`);
  errors.push(...validSource(source));
  if (recorded !== undefined && typeof recorded !== 'boolean') errors.push('Say whether the GPX was recorded on a run.');
  if (typeof gpx !== 'string' || !gpx.trim()) errors.push('Choose a GPX file.');
  else if (gpx.length > MAX_GPX_BYTES) errors.push('That GPX is too large (more than 8 MB).');
  if (errors.length) return bad(errors);

  const p = paths(ctx.root);
  const file = `${id as string}.gpx`;
  if (existsSync(p.gpx(file))) return bad([`routes/${file} already exists.`]);
  let cleaned;
  try {
    cleaned = sanitizeGpx(gpx as string, name as string);
  } catch (err) {
    return bad([err instanceof Error ? err.message : String(err)]);
  }
  const entry: RouteConfig = {
    id: id as string,
    gpx: file,
    name: name as string,
    source: source as RouteSource,
    ...(recorded ? { recorded: true } : {}),
  };
  writeFileSync(p.gpx(file), cleaned.gpx);
  writeFileSync(p.config, formatJson([...config, entry]));
  // The new route needs elevation and street lookups, so this build goes online.
  const build = await ctx.build({});
  return { status: build.ok ? 200 : 500, body: { id, points: cleaned.points, removed: cleaned.removed, build } };
}

async function saveRoute(ctx: ApiContext, id: string, body: unknown): Promise<ApiResponse> {
  const p = paths(ctx.root);
  const before = existsSync(p.route(id)) ? readFileSync(p.route(id), 'utf8') : null;
  if (!before) return bad([`Route "${id}" hasn't been built yet.`], 404);
  const tags = readJson<Record<string, TagDef>>(p.tags) ?? {};
  const result = applyEdits(JSON.parse(before) as RouteData, body, { tags, today: ctx.today() });
  if (!result.data) return bad(result.errors);
  writeFileSync(p.route(id), formatJson(result.data));
  // Offline: nothing new to look up, and it refreshes manifest.json (name, place, tags, status).
  const build = await ctx.build({ offline: true });
  if (!build.ok) {
    writeFileSync(p.route(id), before);
    return { status: 500, body: { errors: ['The rebuild failed, so nothing was saved.'], build } };
  }
  return ok({ data: readJson<RouteData>(p.route(id)), verificationReset: result.verificationReset, build });
}

function saveTags(ctx: ApiContext, body: unknown): ApiResponse {
  const errors = validateTagList(body);
  if (errors.length) return bad(errors);
  const next = body as Record<string, TagDef>;
  const p = paths(ctx.root);
  for (const c of readConfig(ctx.root)) {
    for (const t of readJson<RouteData>(p.route(c.id))?.tags ?? []) {
      if (!(t in next)) errors.push(`"${t}" is still used by ${c.name}: remove it from that route first.`);
    }
  }
  if (errors.length) return bad(errors);
  writeFileSync(p.tags, formatJson(next));
  return ok({ tags: next });
}

async function runBuild(ctx: ApiContext, body: unknown): Promise<ApiResponse> {
  const resetTurns = !!(body && typeof body === 'object' && (body as { resetTurns?: unknown }).resetTurns === true);
  const build = await ctx.build({ resetTurns });
  return { status: build.ok ? 200 : 500, body: { build } };
}

/** Routes one API request. `path` is relative to the API prefix, e.g. "/routes/pi-day". */
export async function handleApi(ctx: ApiContext, method: string, path: string, body: unknown): Promise<ApiResponse> {
  const parts = path.split('/').filter(Boolean);
  const [resource, id, extra] = parts;
  if (extra !== undefined || (id !== undefined && !ID_PARAM.test(id))) return bad(['Not found.'], 404);
  if (resource === 'routes' && id === undefined) {
    if (method === 'GET') return listRoutes(ctx);
    if (method === 'POST') return addRoute(ctx, body);
  }
  if (resource === 'routes' && id !== undefined) {
    if (method === 'GET') return getRoute(ctx, id);
    if (method === 'PUT') return saveRoute(ctx, id, body);
  }
  if (resource === 'tags' && id === undefined && method === 'PUT') return saveTags(ctx, body);
  if (resource === 'build' && id === undefined && method === 'POST') return runBuild(ctx, body);
  return bad(['Not found.'], 404);
}
