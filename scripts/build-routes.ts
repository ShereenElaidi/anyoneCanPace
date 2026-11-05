/**
 * Converts the source GPX files in routes/ into the small processed files the
 * app ships (src/data/routes/). Run with:  npm run routes
 *
 *   --offline      use only cached elevation and street data (fail if missing)
 *   --reset-turns  replace hand-edited turns with fresh proposals
 *
 * Hand-edited fields (name, turns, notes, advisories, startStreet) in an
 * existing processed file are kept unless --reset-turns is given.
 * Elevation and street lookups are cached in routes/cache/ so builds are
 * repeatable offline.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RouteData, RouteManifest, RouteSource, TrackFeature, Turn } from '../src/nav/types.ts';
import {
  bbox,
  classify,
  cumulative,
  dedupe,
  distanceToLine,
  outlinePath,
  parseGpx,
  PROCESS,
  proposeTurns,
  removeSpurs,
  resample,
  simplify,
  streetBetween,
  summariseElevation,
  type Street,
} from './lib/process-route.ts';

interface RouteConfig {
  id: string;
  gpx: string;
  name: string;
  source?: RouteSource;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'routes');
const CACHE_DIR = join(SRC_DIR, 'cache');
const OUT_DIR = join(ROOT, 'src', 'data', 'routes');
const OFFLINE = process.argv.includes('--offline');
const RESET_TURNS = process.argv.includes('--reset-turns');

const ELEVATION_API = 'https://api.open-meteo.com/v1/elevation';
const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

function readJson<T>(path: string): T | null {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : null;
}

/** Pretty JSON, but short number arrays stay on one line. */
function formatJson(value: unknown): string {
  return (
    JSON.stringify(value, null, 2).replace(/\[\s+(-?[\d.]+(?:,\s+-?[\d.]+)*)\s+\]/g, (_, inner: string) =>
      `[${inner.split(/,\s+/).join(', ')}]`,
    ) + '\n'
  );
}

// ---------- Elevation (Open-Meteo, Copernicus DEM GLO-90) ----------

interface ElevationCache {
  source: string;
  coords: [number, number][];
  elevations: number[];
}

async function lookupElevations(id: string, coords: [number, number][]): Promise<number[]> {
  const path = join(CACHE_DIR, `${id}.elevation.json`);
  const cached = readJson<ElevationCache>(path);
  if (cached && JSON.stringify(cached.coords) === JSON.stringify(coords)) return cached.elevations;
  if (OFFLINE) throw new Error(`No cached elevation for ${id} matching the current track. Run without --offline.`);

  const elevations: number[] = [];
  for (let i = 0; i < coords.length; i += 100) {
    const batch = coords.slice(i, i + 100);
    const url = `${ELEVATION_API}?latitude=${batch.map((c) => c[0]).join(',')}&longitude=${batch.map((c) => c[1]).join(',')}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Elevation lookup failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { elevation: number[] };
    elevations.push(...body.elevation);
  }
  const cache: ElevationCache = {
    source: 'Open-Meteo Elevation API (Copernicus DEM 2021 GLO-90), https://open-meteo.com',
    coords,
    elevations,
  };
  writeFileSync(path, formatJson(cache));
  return elevations;
}

// ---------- Street names (OpenStreetMap via Overpass) ----------

interface StreetCache {
  source: string;
  bbox: [number, number, number, number];
  streets: Street[];
}

async function lookupStreets(id: string, box: [number, number, number, number], track: { lat: number; lon: number }[]): Promise<Street[]> {
  const path = join(CACHE_DIR, `${id}.streets.json`);
  const pad = 0.002;
  const padded: [number, number, number, number] = [
    round(box[0] - pad, 4),
    round(box[1] - pad, 4),
    round(box[2] + pad, 4),
    round(box[3] + pad, 4),
  ];
  const cached = readJson<StreetCache>(path);
  if (cached && JSON.stringify(cached.bbox) === JSON.stringify(padded)) return cached.streets;
  if (OFFLINE) {
    console.warn(`  ! No cached street names for ${id}; turns will have empty street names.`);
    return [];
  }
  const [w, s, e, n] = padded;
  const query = `[out:json][timeout:60];way["highway"]["name"](${s},${w},${n},${e});out geom;`;
  const res = await fetch(OVERPASS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'AnyoneCanPace route builder' },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) {
    console.warn(`  ! Street lookup failed (${res.status}); turns will have empty street names.`);
    return [];
  }
  const body = (await res.json()) as {
    elements: { tags?: { name?: string }; geometry?: { lat: number; lon: number }[] }[];
  };
  // Keep only streets that come close to the route, to keep the cache small.
  const streets: Street[] = [];
  for (const el of body.elements) {
    const name = el.tags?.name;
    const geom = el.geometry;
    if (!name || !geom || geom.length < 2) continue;
    if (!geom.some((p) => distanceToLine(p, track) < 40)) continue;
    streets.push({ name, coords: geom.map((p) => [round(p.lon, 6), round(p.lat, 6)]) });
  }
  const cache: StreetCache = {
    source: 'OpenStreetMap contributors (ODbL), via the Overpass API',
    bbox: padded,
    streets,
  };
  writeFileSync(path, formatJson(cache));
  return streets;
}

// ---------- Main ----------

async function buildRoute(config: RouteConfig) {
  console.log(`\n${config.id}  (${config.gpx})`);
  const gpx = parseGpx(readFileSync(join(SRC_DIR, config.gpx), 'utf8'));
  if (gpx.points.length < 2) throw new Error(`${config.gpx} has no track points`);

  const deduped = dedupe(gpx.points);
  const spurs = removeSpurs(deduped);
  const cleaned = dedupe(spurs.points);
  const track = simplify(cleaned);
  const cum = cumulative(track);
  const total = cum[cum.length - 1];
  const kind = classify(track, cum);
  const box = bbox(track);

  console.log(`  points: ${gpx.points.length} → ${deduped.length} deduped → ${cleaned.length} without spurs → ${track.length} simplified`);
  for (const s of spurs.removed) console.log(`  removed spur: input points ${s.from}–${s.to} (${s.pathM.toFixed(1)} m out and back)`);
  console.log(`  distance: ${total.toFixed(0)} m, ${kind}`);

  // Elevation: from the GPX if every point has it, otherwise looked up.
  const samples = resample(track, cum, PROCESS.elevationStepM);
  let elevations: number[];
  if (gpx.points.every((p) => p.ele !== undefined)) {
    const denseCum = cumulative(cleaned);
    elevations = samples.map((s) => {
      let best = 0;
      let bestD = Infinity;
      cleaned.forEach((_, i) => {
        const d = Math.abs(denseCum[i] - s.d);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      return cleaned[best].ele ?? 0;
    });
  } else {
    elevations = await lookupElevations(
      config.id,
      samples.map((s) => [round(s.p.lat, 5), round(s.p.lon, 5)]),
    );
  }
  const ele = summariseElevation(samples.map((s, i) => ({ d: s.d, ele: elevations[i] })));
  console.log(`  elevation: +${ele.gainM} m / -${ele.lossM} m, ${ele.minEleM}–${ele.maxEleM} m`);

  const streets = await lookupStreets(config.id, box, track);
  const proposed: Turn[] = proposeTurns(track, cum).map((t) => ({
    atM: t.atM,
    dir: t.dir,
    street: streetBetween(track, cum, streets, t.atM + 10, t.atM + 60),
  }));
  writeFileSync(join(CACHE_DIR, `${config.id}.proposed-turns.json`), formatJson(proposed));
  console.log(`  proposed turns: ${proposed.length} (see routes/cache/${config.id}.proposed-turns.json)`);

  const jsonPath = join(OUT_DIR, `${config.id}.json`);
  const existing = readJson<RouteData>(jsonPath);
  const keep = existing && !RESET_TURNS;
  if (keep) console.log('  kept hand-edited name, turns, notes and advisories');

  const data: RouteData = {
    id: config.id,
    name: keep ? existing.name : config.name,
    kind,
    stats: {
      distanceM: Math.round(total),
      gainM: ele.gainM,
      lossM: ele.lossM,
      minEleM: ele.minEleM,
      maxEleM: ele.maxEleM,
    },
    track: `${config.id}.geojson`,
    startStreet: keep && existing.startStreet !== undefined ? existing.startStreet : streetBetween(track, cum, streets, 0, 60),
    bbox: box.map((v) => round(v, 6)) as RouteData['bbox'],
    profile: ele.profile,
    turns: keep ? existing.turns : proposed,
    notes: keep ? existing.notes : [],
    advisories: keep ? existing.advisories : [],
    source: config.source,
  };

  const feature: TrackFeature = {
    type: 'Feature',
    properties: { id: config.id, distancesM: cum.map((d) => round(d, 1)) },
    geometry: { type: 'LineString', coordinates: track.map((p) => [round(p.lon, 6), round(p.lat, 6)]) },
  };

  writeFileSync(jsonPath, formatJson(data));
  writeFileSync(join(OUT_DIR, `${config.id}.geojson`), JSON.stringify(feature) + '\n');
  return { data, outline: outlinePath(track) };
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const configs = readJson<RouteConfig[]>(join(SRC_DIR, 'routes.config.json'));
  if (!configs?.length) throw new Error('routes/routes.config.json lists no routes');

  const manifest: RouteManifest = { routes: [] };
  for (const config of configs) {
    const { data, outline } = await buildRoute(config);
    manifest.routes.push({ id: data.id, name: data.name, kind: data.kind, stats: data.stats, outline });
  }
  writeFileSync(join(OUT_DIR, 'manifest.json'), formatJson(manifest));
  console.log(`\nWrote ${manifest.routes.length} route(s) to src/data/routes/`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
