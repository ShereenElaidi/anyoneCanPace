/**
 * Pure route-processing steps used by scripts/build-routes.ts.
 * No file system or network access here, so every step is unit-tested.
 */
import { createProjector, distanceM, projectOnSegment, type LatLon } from '../../src/nav/geo.ts';
import type { RouteKind } from '../../src/nav/types.ts';

export interface GpxPoint extends LatLon {
  ele?: number;
}

export interface ParsedGpx {
  name: string;
  points: GpxPoint[];
}

/** Tuning for the build script, in one place. */
export const PROCESS = {
  /** Consecutive points closer than this are merged. */
  dedupeM: 2,
  /** An out-and-back excursion whose whole path is at most this long… */
  spurMaxPathM: 60,
  /** …and that returns to within this distance of where it left is a routing-tool spur. */
  spurCloseM: 4,
  /** Douglas–Peucker tolerance. */
  simplifyM: 5,
  /** Start and end closer than this: a loop. */
  loopCloseM: 100,
  /** Return half within this of the outbound half on average: out-and-back. */
  outAndBackM: 30,
};
// Elevation tunables live in elevation.ts, turn tunables in turns.ts.

// ---------- GPX ----------

const attr = (tag: string, name: string): number | undefined => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`));
  return m ? Number(m[1]) : undefined;
};

/**
 * Minimal GPX reader for track and route points. GPX from route planners is
 * simple and regular, so a regex reader avoids an XML dependency.
 */
export function parseGpx(xml: string): ParsedGpx {
  const name = xml.match(/<trk>[\s\S]*?<name>([^<]*)<\/name>/)?.[1] ?? xml.match(/<name>([^<]*)<\/name>/)?.[1] ?? '';
  const points: GpxPoint[] = [];
  const re = /<(trkpt|rtept)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g;
  for (const m of xml.matchAll(re)) {
    const lat = attr(m[2], 'lat');
    const lon = attr(m[2], 'lon');
    if (lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const eleText = m[4]?.match(/<ele>([^<]+)<\/ele>/)?.[1];
    const ele = eleText === undefined ? undefined : Number(eleText);
    points.push(ele !== undefined && Number.isFinite(ele) ? { lat, lon, ele } : { lat, lon });
  }
  return { name: name.trim(), points };
}

// ---------- Cleaning ----------

export function dedupe<T extends LatLon>(points: T[], minM = PROCESS.dedupeM): T[] {
  const out: T[] = [];
  for (const p of points) {
    if (out.length && distanceM(out[out.length - 1], p) < minM) continue;
    out.push(p);
  }
  // Keep the true last point so the route ends where the GPX ends.
  const last = points[points.length - 1];
  if (last && out[out.length - 1] !== last) out[out.length - 1] = last;
  return out;
}

export interface SpurResult<T> {
  points: T[];
  /** Index ranges (in the input) that were removed. */
  removed: { from: number; to: number; pathM: number }[];
}

/** The point at least `minM` of path before (dir -1) or after (dir 1) index i. */
function pointAway<T extends LatLon>(points: T[], i: number, dir: 1 | -1, minM: number): T | null {
  let path = 0;
  for (let k = i + dir; k >= 0 && k < points.length; k += dir) {
    path += distanceM(points[k - dir], points[k]);
    if (path >= minM) return points[k];
  }
  return null;
}

/**
 * Removes short dead-end excursions: the path leaves point i and comes back
 * to (almost) the same place within a short distance, then carries on
 * somewhere else. Route planners add these when a waypoint snaps onto a side
 * street. A real turnaround (the route then retraces the way it came) is kept.
 */
export function removeSpurs<T extends LatLon>(
  points: T[],
  maxPathM = PROCESS.spurMaxPathM,
  closeM = PROCESS.spurCloseM,
): SpurResult<T> {
  const out: T[] = [];
  const removed: SpurResult<T>['removed'] = [];
  let i = 0;
  while (i < points.length) {
    out.push(points[i]);
    let path = 0;
    let returnTo = -1;
    let returnPath = 0;
    for (let j = i + 1; j < points.length; j++) {
      path += distanceM(points[j - 1], points[j]);
      if (path > maxPathM) break;
      // The excursion has to go somewhere (further than the closing distance).
      if (j > i + 1 && distanceM(points[i], points[j]) <= closeM && path > closeM) {
        returnTo = j;
        returnPath = path;
      }
    }
    if (returnTo > 0 && !isTurnaround(points, i, returnTo, closeM)) {
      removed.push({ from: i + 1, to: returnTo, pathM: returnPath });
      i = returnTo + 1;
    } else {
      i++;
    }
  }
  return { points: out, removed };
}

/** True when the route continues back the way it came (an out-and-back's far end). */
function isTurnaround<T extends LatLon>(points: T[], i: number, j: number, closeM: number): boolean {
  const before = pointAway(points, i, -1, 15);
  const after = pointAway(points, j, 1, 15);
  if (!before || !after) return false;
  return distanceM(before, after) <= 2.5 * closeM;
}

/** Douglas–Peucker in a local metric frame. Keeps corners sharper than the tolerance. */
export function simplify<T extends LatLon>(points: T[], toleranceM = PROCESS.simplifyM): T[] {
  if (points.length <= 2) return [...points];
  const proj = createProjector(points[0]);
  const xy = points.map(proj.toXY);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    let maxD = 0;
    let idx = -1;
    for (let k = a + 1; k < b; k++) {
      // Segment distance, not line distance, so out-and-back shapes survive.
      const d =
        xy[a].x === xy[b].x && xy[a].y === xy[b].y
          ? Math.hypot(xy[k].x - xy[a].x, xy[k].y - xy[a].y)
          : projectOnSegment(xy[k], xy[a], xy[b]).distM;
      if (d > maxD) {
        maxD = d;
        idx = k;
      }
    }
    if (idx !== -1 && maxD > toleranceM) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, k) => keep[k]);
}

// ---------- Measuring ----------

export function cumulative(points: LatLon[]): number[] {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + distanceM(points[i - 1], points[i]));
  return cum;
}

/** Point at distance d along a polyline with cumulative distances `cum`. */
export function pointAlong(points: LatLon[], cum: number[], d: number): LatLon {
  if (d <= 0) return points[0];
  const total = cum[cum.length - 1];
  if (d >= total) return points[points.length - 1];
  let i = 1;
  while (cum[i] < d) i++;
  const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  const a = points[i - 1];
  const b = points[i];
  return { lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) };
}

/** Evenly spaced points every `stepM`, always including the last point. */
export function resample(points: LatLon[], cum: number[], stepM: number): { d: number; p: LatLon }[] {
  const total = cum[cum.length - 1];
  const out: { d: number; p: LatLon }[] = [];
  for (let d = 0; d < total; d += stepM) out.push({ d, p: pointAlong(points, cum, d) });
  out.push({ d: total, p: points[points.length - 1] });
  return out;
}

export function bbox(points: LatLon[]): [number, number, number, number] {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const p of points) {
    w = Math.min(w, p.lon);
    e = Math.max(e, p.lon);
    s = Math.min(s, p.lat);
    n = Math.max(n, p.lat);
  }
  return [w, s, e, n];
}

/** Nearest distance from p to a polyline. */
export function distanceToLine(p: LatLon, line: LatLon[]): number {
  if (line.length === 1) return distanceM(p, line[0]);
  const proj = createProjector(p);
  const q = { x: 0, y: 0 };
  let best = Infinity;
  let prev = proj.toXY(line[0]);
  for (let i = 1; i < line.length; i++) {
    const cur = proj.toXY(line[i]);
    best = Math.min(best, projectOnSegment(q, prev, cur).distM);
    prev = cur;
  }
  return best;
}

export function classify(points: LatLon[], cum: number[]): RouteKind {
  const total = cum[cum.length - 1];
  if (distanceM(points[0], points[points.length - 1]) <= PROCESS.loopCloseM) {
    // A route that goes out and comes back the same way also ends at its start.
    if (retracesItself(points, cum, total)) return 'out-and-back';
    return 'loop';
  }
  return retracesItself(points, cum, total) ? 'out-and-back' : 'point-to-point';
}

function retracesItself(points: LatLon[], cum: number[], total: number): boolean {
  const half = total / 2;
  const outbound = resample(points, cum, 25).filter((s) => s.d <= half).map((s) => s.p);
  const back = resample(points, cum, 50).filter((s) => s.d > half + 50 && s.d < total - 50);
  if (!back.length || outbound.length < 2) return false;
  const mean = back.reduce((sum, s) => sum + distanceToLine(s.p, outbound), 0) / back.length;
  return mean <= PROCESS.outAndBackM;
}

// ---------- Thumbnail ----------

/** SVG path for the route outline inside a 0..100 box, aspect ratio kept, north up. */
export function outlinePath(points: LatLon[], maxPoints = 60): string {
  const proj = createProjector(points[0]);
  const step = Math.max(1, Math.ceil(points.length / maxPoints));
  const sampled = points.filter((_, i) => i % step === 0 || i === points.length - 1).map(proj.toXY);
  const xs = sampled.map((p) => p.x);
  const ys = sampled.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxY = Math.max(...ys);
  const span = Math.max(Math.max(...xs) - minX, maxY - Math.min(...ys)) || 1;
  const pad = 6;
  const scale = (100 - 2 * pad) / span;
  const offX = pad + ((100 - 2 * pad) - (Math.max(...xs) - minX) * scale) / 2;
  const offY = pad + ((100 - 2 * pad) - (maxY - Math.min(...ys)) * scale) / 2;
  return sampled
    .map((p, i) => `${i ? 'L' : 'M'}${(offX + (p.x - minX) * scale).toFixed(1)} ${(offY + (maxY - p.y) * scale).toFixed(1)}`)
    .join('');
}
