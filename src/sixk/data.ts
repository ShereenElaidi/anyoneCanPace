/**
 * Route data shipped with the app (built by scripts/build-routes.ts).
 * Each route's files become their own small chunks, precached by the
 * service worker, so they work offline.
 */
import manifestJson from '../data/routes/manifest.json';
import { prepareRoute, type PreparedRoute } from '../nav/route';
import type { RouteData, RouteManifest, TrackFeature } from '../nav/types';

export const manifest = manifestJson as unknown as RouteManifest;

const routeFiles = import.meta.glob<RouteData>(['../data/routes/*.json', '!../data/routes/manifest.json'], {
  import: 'default',
});
const trackFiles = import.meta.glob<string>('../data/routes/*.geojson', { query: '?raw', import: 'default' });

export interface LoadedRoute {
  data: RouteData;
  track: TrackFeature;
  prepared: PreparedRoute;
}

const cache = new Map<string, Promise<LoadedRoute>>();

export function loadRoute(id: string): Promise<LoadedRoute> {
  let p = cache.get(id);
  if (!p) {
    p = (async () => {
      const loadData = routeFiles[`../data/routes/${id}.json`];
      if (!loadData) throw new Error(`Unknown route: ${id}`);
      const data = await loadData();
      const loadTrack = trackFiles[`../data/routes/${data.track}`];
      if (!loadTrack) throw new Error(`Missing track file: ${data.track}`);
      const track = JSON.parse(await loadTrack()) as TrackFeature;
      return { data, track, prepared: prepareRoute(track.geometry.coordinates, data.turns) };
    })();
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}

/** Advisories still in force today (no dates means always). */
export function activeAdvisories(data: RouteData, today = new Date()) {
  const day = today.toISOString().slice(0, 10);
  return data.advisories.filter((a) => (!a.start || a.start <= day) && (!a.end || a.end >= day));
}
