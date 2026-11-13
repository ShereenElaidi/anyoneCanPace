import { bearingDeg, createProjector, projectOnSegment, type LatLon, type Projector, type XY } from './geo';
import type { Turn } from './types';

/**
 * A route ready for fast along-route queries: points in a local metric frame
 * plus cumulative distances. Pure data, built once per route.
 */
export interface PreparedRoute {
  points: LatLon[];
  xy: XY[];
  /** cum[i] = distance from the first point to point i. */
  cum: number[];
  lengthM: number;
  turns: Turn[];
  projector: Projector;
}

/** `coords` are GeoJSON [lon, lat] pairs. */
export function prepareRoute(coords: [number, number][], turns: Turn[] = []): PreparedRoute {
  if (coords.length < 2) throw new Error('A route needs at least two points');
  const points = coords.map(([lon, lat]) => ({ lat, lon }));
  const projector = createProjector(points[0]);
  const xy = points.map(projector.toXY);
  const cum = [0];
  for (let i = 1; i < xy.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(xy[i].x - xy[i - 1].x, xy[i].y - xy[i - 1].y));
  }
  const sorted = [...turns].sort((a, b) => a.atM - b.atM);
  return { points, xy, cum, lengthM: cum[cum.length - 1], turns: sorted, projector };
}

/** Index i of the segment (i → i+1) containing distance d. */
export function segmentIndexAt(route: PreparedRoute, d: number): number {
  const { cum } = route;
  if (d <= 0) return 0;
  if (d >= route.lengthM) return cum.length - 2;
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function pointAt(route: PreparedRoute, d: number): LatLon {
  const i = segmentIndexAt(route, d);
  const segLen = route.cum[i + 1] - route.cum[i];
  const t = segLen > 0 ? Math.max(0, Math.min(1, (d - route.cum[i]) / segLen)) : 0;
  const a = route.xy[i];
  const b = route.xy[i + 1];
  return route.projector.toLatLon({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}

/** Direction of travel at distance d (bearing of the segment there). */
export function bearingAt(route: PreparedRoute, d: number): number {
  let i = segmentIndexAt(route, d);
  // Skip zero-length segments.
  while (i < route.points.length - 2 && route.cum[i + 1] - route.cum[i] < 0.01) i++;
  return bearingDeg(route.points[i], route.points[i + 1]);
}

export interface RouteMatch {
  /** Distance along the route of the closest point. */
  alongM: number;
  /** Distance from the fix to that point. */
  distM: number;
}

/**
 * Closest point on each segment that overlaps [fromM, toM], clipped to that
 * range. One candidate per segment, so callers can score overlapping legs.
 */
export function candidatesBetween(route: PreparedRoute, p: LatLon, fromM: number, toM: number): RouteMatch[] {
  const from = Math.max(0, fromM);
  const to = Math.min(route.lengthM, toM);
  if (to < from) return [];
  const q = route.projector.toXY(p);
  const out: RouteMatch[] = [];
  const first = segmentIndexAt(route, from);
  const last = segmentIndexAt(route, to);
  for (let i = first; i <= last; i++) {
    const segStart = route.cum[i];
    const segLen = route.cum[i + 1] - segStart;
    if (segLen <= 0) continue;
    const { t } = projectOnSegment(q, route.xy[i], route.xy[i + 1]);
    const along = Math.max(from, Math.min(to, segStart + t * segLen));
    const tc = (along - segStart) / segLen;
    const a = route.xy[i];
    const b = route.xy[i + 1];
    const x = a.x + tc * (b.x - a.x);
    const y = a.y + tc * (b.y - a.y);
    out.push({ alongM: along, distM: Math.hypot(q.x - x, q.y - y) });
  }
  return out;
}

/** Plain closest point in a range (no scoring). */
export function nearestBetween(route: PreparedRoute, p: LatLon, fromM: number, toM: number): RouteMatch | null {
  let best: RouteMatch | null = null;
  for (const c of candidatesBetween(route, p, fromM, toM)) {
    if (!best || c.distM < best.distM) best = c;
  }
  return best;
}

/**
 * Splits the route at distance d into the covered part and the part still to
 * go, as GeoJSON [lon, lat] lines (both include the split point).
 */
export function splitAt(route: PreparedRoute, d: number): { covered: [number, number][]; remaining: [number, number][] } {
  const at = Math.max(0, Math.min(route.lengthM, d));
  const i = segmentIndexAt(route, at);
  const p = pointAt(route, at);
  const mid: [number, number] = [p.lon, p.lat];
  const toCoord = (q: LatLon): [number, number] => [q.lon, q.lat];
  const covered = [...route.points.slice(0, i + 1).map(toCoord), mid];
  const remaining = [mid, ...route.points.slice(i + 1).map(toCoord)];
  return { covered, remaining };
}
