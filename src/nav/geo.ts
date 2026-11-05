/**
 * Small, dependency-free geometry helpers for walking-scale distances.
 *
 * Pure functions only: no clocks, no DOM, no `navigator`. This file is also
 * imported by the Node route build script, so it must not import anything.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

/** Planar metres in a local frame (x east, y north). */
export interface XY {
  x: number;
  y: number;
}

const EARTH_RADIUS_M = 6_371_008.8;
const RAD = Math.PI / 180;

/** Great-circle distance in metres (haversine). */
export function distanceM(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Initial bearing from a to b, in degrees clockwise from north, 0 ≤ b < 360. */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const φ1 = a.lat * RAD;
  const φ2 = b.lat * RAD;
  const Δλ = (b.lon - a.lon) * RAD;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return normalizeDeg(Math.atan2(y, x) / RAD);
}

export function normalizeDeg(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/** Signed change of heading from `from` to `to`, in (-180, 180]. Positive turns right. */
export function headingChange(from: number, to: number): number {
  const d = normalizeDeg(to - from);
  return d > 180 ? d - 360 : d;
}

/** Point `distance` metres from `origin` along `bearing` (fine for short distances). */
export function offsetPoint(origin: LatLon, bearing: number, distance: number): LatLon {
  const north = distance * Math.cos(bearing * RAD);
  const east = distance * Math.sin(bearing * RAD);
  return {
    lat: origin.lat + (north / EARTH_RADIUS_M) / RAD,
    lon: origin.lon + (east / (EARTH_RADIUS_M * Math.cos(origin.lat * RAD))) / RAD,
  };
}

/**
 * Equirectangular projection around an origin. Over a few kilometres the error
 * is well under a metre, which is far below GPS noise.
 */
export interface Projector {
  toXY(p: LatLon): XY;
  toLatLon(p: XY): LatLon;
}

export function createProjector(origin: LatLon): Projector {
  const kx = EARTH_RADIUS_M * RAD * Math.cos(origin.lat * RAD);
  const ky = EARTH_RADIUS_M * RAD;
  return {
    toXY: (p) => ({ x: (p.lon - origin.lon) * kx, y: (p.lat - origin.lat) * ky }),
    toLatLon: (p) => ({ lat: origin.lat + p.y / ky, lon: origin.lon + p.x / kx }),
  };
}

export interface SegmentProjection {
  /** 0..1 position along the segment. */
  t: number;
  /** Distance from the point to the segment, metres. */
  distM: number;
}

/** Closest point on segment a→b to p, in planar coordinates. */
export function projectOnSegment(p: XY, a: XY, b: XY): SegmentProjection {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return { t, distM: Math.hypot(p.x - cx, p.y - cy) };
}

/** Planar perpendicular distance from p to the infinite line through a and b. */
export function perpendicularDistance(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];

/** "northeast" etc. for a bearing in degrees. */
export function compassWord(bearing: number): string {
  return COMPASS[Math.round(normalizeDeg(bearing) / 45) % 8];
}
