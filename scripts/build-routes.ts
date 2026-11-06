/**
 * Converts the source GPX files in routes/ into the small processed files the
 * app ships (src/data/routes/). Run with:  npm run routes
 *
 *   --offline      use only cached elevation and street data (fail if missing)
 *   --reset-turns  replace the turns with fresh proposals (street names and
 *                  notes are carried over to proposals at the same place)
 *
 * Hand-edited fields (name, place, description, tags, notes, advisories, startStreet, verification) in
 * an existing processed file are always kept. Hand-edited turns are kept only
 * while the track geometry is unchanged: if the GPX changed, their distances
 * no longer fit, so the build stops and asks for --reset-turns. Changing the
 * geometry or the turns resets verification to "unverified".
 * Elevation and street lookups are cached in routes/cache/ so builds are
 * repeatable offline.
 *
 * Turns and the start street are suggestions. Every candidate, with the
 * decision and the reason, is written to routes/review/<id>.md (and .json,
 * with the elevation processing stages) for a person to check.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RouteData, RouteManifest, RouteSource, RouteVerification, TrackFeature, Turn } from '../src/nav/types.ts';
import {
  COPERNICUS_GLO90,
  GPX_ELEVATION,
  NRCAN_CDEM,
  processElevation,
  type ElevationResult,
  type ElevationSource,
} from './lib/elevation.ts';
import {
  bbox,
  classify,
  cumulative,
  dedupe,
  distanceToLine,
  outlinePath,
  parseGpx,
  removeSpurs,
  resample,
  simplify,
} from './lib/process-route.ts';
import { analyseTurns, turnReviewMarkdown, type Street, type TurnAnalysis } from './lib/turns.ts';
import { decideTurns, type TurnDecision } from './lib/turn-review.ts';

interface RouteConfig {
  id: string;
  gpx: string;
  name: string;
  source?: RouteSource;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'routes');
const CACHE_DIR = join(SRC_DIR, 'cache');
const REVIEW_DIR = join(SRC_DIR, 'review');
const OUT_DIR = join(ROOT, 'src', 'data', 'routes');
const OFFLINE = process.argv.includes('--offline');
const RESET_TURNS = process.argv.includes('--reset-turns');

const CDEM_PROFILE_API = 'https://geogratis.gc.ca/services/elevation/cdem/profile';
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

// ---------- Elevation (NRCan CDEM, bare earth) ----------

interface ElevationCache {
  source: string;
  coords: [number, number][];
  elevations: (number | null)[];
}

const CDEM_CACHE_SOURCE =
  'Natural Resources Canada, Canadian Digital Elevation Model (CDEM), via the GeoGratis elevation API. Contains information licensed under the Open Government Licence – Canada.';

/** Bare-earth elevations for [lat, lon] pairs, 100 per request, cached per route. */
async function lookupElevations(id: string, coords: [number, number][]): Promise<(number | null)[]> {
  const path = join(CACHE_DIR, `${id}.elevation.json`);
  const cached = readJson<ElevationCache>(path);
  if (cached && cached.source === CDEM_CACHE_SOURCE && JSON.stringify(cached.coords) === JSON.stringify(coords)) {
    return cached.elevations;
  }
  if (OFFLINE) throw new Error(`No cached elevation for ${id} matching the current track. Run without --offline.`);

  const elevations: (number | null)[] = [];
  for (let i = 0; i < coords.length; i += 100) {
    const batch = coords.slice(i, i + 100);
    // A single point isn't a line: repeat it and keep the first answer.
    const line = batch.length === 1 ? [batch[0], batch[0]] : batch;
    const wkt = `LINESTRING(${line.map(([lat, lon]) => `${lon} ${lat}`).join(',')})`;
    const url = `${CDEM_PROFILE_API}?path=${encodeURIComponent(wkt)}&steps=0`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Elevation lookup failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { altitude: number | null; vertex: boolean }[];
    const vertices = body.filter((p) => p.vertex);
    if (vertices.length !== line.length) throw new Error(`Elevation lookup returned ${vertices.length} points for ${line.length}`);
    // No-data comes back as null or a large negative fill value.
    elevations.push(
      ...vertices.slice(0, batch.length).map((p) => (typeof p.altitude === 'number' && p.altitude > -500 ? p.altitude : null)),
    );
  }
  const cache: ElevationCache = { source: CDEM_CACHE_SOURCE, coords, elevations };
  writeFileSync(path, formatJson(cache));
  return elevations;
}

/** The earlier surface-model samples (Open-Meteo, Copernicus GLO-90), kept only to compare against. */
function copernicusComparison(id: string): ElevationResult | null {
  const old = readJson<{ coords: [number, number][]; elevations: number[] }>(join(CACHE_DIR, `${id}.elevation-copernicus.json`));
  if (!old) return null;
  const step = COPERNICUS_GLO90.sampleStepM;
  return processElevation(old.elevations.map((ele, i) => ({ d: i * step, ele })), COPERNICUS_GLO90);
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
  const fromGpx = gpx.points.every((p) => p.ele !== undefined);
  const eleSource: ElevationSource = fromGpx ? GPX_ELEVATION : NRCAN_CDEM;
  const samples = resample(track, cum, eleSource.sampleStepM);
  let elevations: (number | null)[];
  if (fromGpx) {
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
      return cleaned[best].ele ?? null;
    });
  } else {
    elevations = await lookupElevations(
      config.id,
      samples.map((s) => [round(s.p.lat, 5), round(s.p.lon, 5)]),
    );
  }
  const eleResult = processElevation(samples.map((s, i) => ({ d: s.d, ele: elevations[i] })), eleSource);
  const ele = eleResult.summary;
  if (!ele) throw new Error(`${config.id}: no elevation data along the route`);
  console.log(`  elevation (${eleSource.name}): +${ele.gainM} m / -${ele.lossM} m, ${ele.minEleM}–${ele.maxEleM} m`);
  if (eleResult.missingM) console.warn(`  ! ${eleResult.missingM} m of the route had no elevation; bridged with straight lines`);
  if (eleResult.spikes.length) console.log(`  elevation spikes replaced: ${eleResult.spikes.length}`);

  const streets = await lookupStreets(config.id, box, track);
  const analysis = analyseTurns(track, cum, streets);
  const proposed: Turn[] = analysis.turns.map((t) => ({ atM: t.atM, dir: t.dir, street: t.street }));
  writeFileSync(join(CACHE_DIR, `${config.id}.proposed-turns.json`), formatJson(proposed));
  const flagged = analysis.review.filter((r) => r.needsReview).length;
  console.log(`  proposed turns: ${proposed.length}, ${flagged} candidate(s) need review (see routes/review/${config.id}.md)`);

  const jsonPath = join(OUT_DIR, `${config.id}.json`);
  const existing = readJson<RouteData>(jsonPath);
  const oldTrack = readJson<TrackFeature>(join(OUT_DIR, `${config.id}.geojson`));
  const coords = track.map((p) => [round(p.lon, 6), round(p.lat, 6)] as [number, number]);
  const decision = decideTurns({
    existingTurns: existing?.turns ?? null,
    existingFingerprint: existing?.geometry,
    oldCoords: oldTrack?.geometry.coordinates ?? null,
    newCoords: coords,
    proposed,
    reset: RESET_TURNS,
  });
  if (decision.outcome === 'stale') {
    throw new Error(
      `${config.id}: the track geometry changed since its turns were written, so their distances (atM) no longer ` +
        `match the route. Rebuild with --reset-turns to regenerate them (street names and notes are carried over to ` +
        `turns within 25 m), then review routes/review/${config.id}.md.`,
    );
  }
  const keep = !!existing;
  if (decision.outcome === 'kept') console.log('  geometry unchanged: kept hand-edited turns');
  if (decision.outcome === 'regenerated') {
    console.log(`  turns regenerated; ${decision.carried} street/note edit(s) carried over by position`);
    for (const t of decision.dropped) console.warn(`  ! old turn at ${(t.atM / 1000).toFixed(2)} km (${t.street || t.dir}) matched no new turn: check it`);
  }
  if (decision.geometryChanged && existing?.advisories.some((a) => a.fromKm !== undefined)) {
    console.warn('  ! the geometry changed: check the km ranges of this route’s advisories');
  }
  // Any change to what the pacer is told means a person has to check it again.
  const changed = decision.geometryChanged || decision.outcome === 'regenerated';
  const verification: RouteVerification =
    existing?.verification && !changed
      ? existing.verification
      : {
          status: 'unverified',
          ...(existing?.verification && existing.verification.status !== 'unverified'
            ? { notes: `Was ${existing.verification.status}; geometry or turns changed since, so it needs checking again.` }
            : {}),
        };

  const data: RouteData = {
    id: config.id,
    name: keep ? existing!.name : config.name,
    kind,
    stats: {
      distanceM: Math.round(total),
      gainM: ele.gainM,
      lossM: ele.lossM,
      minEleM: ele.minEleM,
      maxEleM: ele.maxEleM,
    },
    track: `${config.id}.geojson`,
    startStreet:
      keep && !decision.geometryChanged && existing!.startStreet !== undefined ? existing!.startStreet : analysis.startStreet,
    ...(keep && existing!.place !== undefined ? { place: existing!.place } : {}),
    ...(keep && existing!.description !== undefined ? { description: existing!.description } : {}),
    ...(keep && existing!.tags !== undefined ? { tags: existing!.tags } : {}),
    bbox: box.map((v) => round(v, 6)) as RouteData['bbox'],
    profile: ele.profile,
    turns: decision.turns,
    notes: keep ? existing!.notes : [],
    advisories: keep ? existing!.advisories : [],
    source: config.source,
    verification,
    geometry: decision.fingerprint,
  };

  const feature: TrackFeature = {
    type: 'Feature',
    properties: { id: config.id, distancesM: cum.map((d) => round(d, 1)) },
    geometry: { type: 'LineString', coordinates: coords },
  };

  writeFileSync(jsonPath, formatJson(data));
  writeFileSync(join(OUT_DIR, `${config.id}.geojson`), JSON.stringify(feature) + '\n');
  writeReview(config, data, analysis, eleSource, eleResult, decision);
  return { data, outline: outlinePath(track) };
}

// ---------- Review report ----------

function writeReview(
  config: RouteConfig,
  data: RouteData,
  analysis: TurnAnalysis,
  eleSource: ElevationSource,
  ele: ElevationResult,
  decision: TurnDecision,
) {
  const s = ele.summary!;
  const surface = copernicusComparison(config.id)?.summary;
  const md = [
    `# ${data.name}: route review`,
    '',
    'Generated by `npm run routes`. Everything below is an automated suggestion, not a verified instruction:',
    'check each line marked "yes" against the map, or on the ground, before trusting it.',
    '',
    `**Verification: ${data.verification.status}**${data.verification.reviewer ? ` (${data.verification.reviewer}, ${data.verification.date})` : ''}. ` +
      'See "Reviewing and releasing a route" in the README before changing it.',
    '',
    decision.outcome === 'kept'
      ? `Geometry unchanged, so the app keeps the turns in \`src/data/routes/${config.id}.json\` (${decision.turns.length} turns). Compare them with these suggestions, or rebuild with \`--reset-turns\` to take the suggestions.`
      : decision.outcome === 'regenerated'
        ? `Turns regenerated from these suggestions (\`--reset-turns\`); ${decision.carried} street/note edit(s) carried over from turns at the same place.` +
          (decision.dropped.length
            ? ` Old turns that matched nothing (check by hand): ${decision.dropped.map((t) => `${(t.atM / 1000).toFixed(2)} km ${t.street || t.dir}${t.note ? ` ("${t.note}")` : ''}`).join('; ')}.`
            : '')
        : `The app uses these suggestions as they are (\`src/data/routes/${config.id}.json\`). Edit that file by hand to correct them.`,
    '',
    '## Turns',
    '',
    turnReviewMarkdown(analysis),
    '## Elevation',
    '',
    `Source: ${eleSource.name}, sampled every ${eleSource.sampleStepM} m. Climb and descent count changes over ${ele.thresholdM} m.`,
    '',
    '| | Climb | Descent | Lowest | Highest |',
    '| --- | --: | --: | --: | --: |',
    `| Used in the app | ${s.gainM} m | ${s.lossM} m | ${s.minEleM} m | ${s.maxEleM} m |`,
    `| Raw samples, same threshold | ${ele.rawGainM} m | ${ele.rawLossM} m | | |`,
    surface
      ? `| Surface model for comparison (Copernicus GLO-90, roofs and trees) | ${surface.gainM} m | ${surface.lossM} m | ${surface.minEleM} m | ${surface.maxEleM} m |`
      : '',
    '',
    ele.spikes.length
      ? `Spikes replaced: ${ele.spikes.map((p) => `${(p.d / 1000).toFixed(2)} km (${p.raw} → ${p.replacedBy} m)`).join(', ')}.`
      : 'No spikes replaced.',
    ele.missingM ? `No data for ${ele.missingM} m of the route (bridged with straight lines).` : '',
    '',
  ]
    .filter((line, i, all) => line !== '' || all[i - 1] !== '')
    .join('\n');
  writeFileSync(join(REVIEW_DIR, `${config.id}.md`), md);
  writeFileSync(
    join(REVIEW_DIR, `${config.id}.json`),
    formatJson({
      id: config.id,
      note: 'Automated suggestions for manual review. Nothing here has been verified.',
      startStreet: analysis.startStreet,
      startNote: analysis.startNote,
      turns: analysis.review,
      elevation: {
        source: eleSource,
        thresholdM: ele.thresholdM,
        summary: { gainM: s.gainM, lossM: s.lossM, minEleM: s.minEleM, maxEleM: s.maxEleM },
        raw: { gainM: ele.rawGainM, lossM: ele.rawLossM },
        missingM: ele.missingM,
        spikes: ele.spikes,
        samples: ele.stages,
      },
    }),
  );
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true });
  mkdirSync(REVIEW_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const configs = readJson<RouteConfig[]>(join(SRC_DIR, 'routes.config.json'));
  if (!configs?.length) throw new Error('routes/routes.config.json lists no routes');

  const manifest: RouteManifest = { routes: [] };
  for (const config of configs) {
    const { data, outline } = await buildRoute(config);
    manifest.routes.push({
      id: data.id,
      name: data.name,
      kind: data.kind,
      stats: data.stats,
      outline,
      verification: data.verification.status,
      ...(data.place !== undefined ? { place: data.place } : {}),
      ...(data.tags !== undefined ? { tags: data.tags } : {}),
    });
  }
  writeFileSync(join(OUT_DIR, 'manifest.json'), formatJson(manifest));
  console.log(`\nWrote ${manifest.routes.length} route(s) to src/data/routes/`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
