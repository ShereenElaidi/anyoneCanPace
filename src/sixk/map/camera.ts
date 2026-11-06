/** Pure camera maths for the route map (no MapLibre, no DOM). */

export interface LonLat {
  lon: number;
  lat: number;
}

/** Following off route: zoom out to keep your place on the route in view, but never past this. */
export const OFF_ROUTE_MIN_ZOOM = 14;
/** Following: never zoom in closer than this. */
export const FOLLOW_MAX_ZOOM = 16.5;

/**
 * Bounds centred on the duck that still reach `other` (mirrored around the duck),
 * so fitting them keeps the duck in the middle of the map.
 */
export function boundsCentredOn(duck: LonLat, other: LonLat): [[number, number], [number, number]] {
  const dLon = Math.abs(other.lon - duck.lon);
  const dLat = Math.abs(other.lat - duck.lat);
  return [
    [duck.lon - dLon, duck.lat - dLat],
    [duck.lon + dLon, duck.lat + dLat],
  ];
}

/** The zoom to use off route: what fits both points, clamped to [OFF_ROUTE_MIN_ZOOM, FOLLOW_MAX_ZOOM]. */
export function offRouteZoom(fitZoom: number | undefined): number {
  if (fitZoom === undefined || !Number.isFinite(fitZoom)) return OFF_ROUTE_MIN_ZOOM;
  return Math.min(FOLLOW_MAX_ZOOM, Math.max(OFF_ROUTE_MIN_ZOOM, fitZoom));
}
