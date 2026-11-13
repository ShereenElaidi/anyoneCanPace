/**
 * Sorting MapLibre's asynchronous errors. Pure, so it can be tested without
 * loading MapLibre.
 *
 * - 'tile': one tile or source request failed (offline, flaky network). The map
 *   keeps working with what it has; show a small notice with a retry.
 * - 'fatal': the map can't work at all (style or basemap never loaded, or the
 *   graphics context was lost). Hide it; directions keep working.
 * - 'ignore': anything else after the map is up (logged only).
 */
export type MapErrorKind = 'tile' | 'fatal' | 'ignore';

export interface MapErrorLike {
  sourceId?: string;
  tile?: unknown;
  error?: { message?: string; status?: number } | null;
}

export function classifyMapError(e: MapErrorLike, loaded: boolean): MapErrorKind {
  if (e.sourceId || e.tile) return 'tile';
  if (!loaded) return 'fatal';
  return 'ignore';
}
