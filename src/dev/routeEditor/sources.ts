/**
 * Where a route was drawn, as presets for the Add route form. Only the editor
 * uses these: each route file keeps its own full `source`, so changing a
 * preset never rewrites older routes. The route page adds the
 * OpenStreetMap credit for the map itself.
 */
import type { RouteSource } from '../../nav/types';

export interface SourcePreset {
  id: string;
  label: string;
  source: RouteSource;
}

export const SOURCE_PRESETS: SourcePreset[] = [
  {
    id: 'onthegomap',
    label: 'On The Go Map',
    source: {
      name: 'On The Go Map',
      url: 'https://onthegomap.com',
      attribution: 'Route drawn with On The Go Map · © OpenStreetMap contributors',
    },
  },
  { id: 'strava', label: 'Strava', source: { name: 'Strava', url: 'https://www.strava.com', attribution: 'Route from Strava' } },
  {
    id: 'garmin',
    label: 'Garmin',
    source: { name: 'Garmin Connect', url: 'https://connect.garmin.com', attribution: 'Route from Garmin Connect' },
  },
];

/** The credit line, with "drawn by <name>" when the person who made the route agreed to be named. */
export function withDrawnBy(source: RouteSource, drawnBy: string): RouteSource {
  const who = drawnBy.trim();
  return who ? { ...source, attribution: `${source.attribution} · drawn by ${who}` } : source;
}

/** The "Other" source: a name, an optional https link, and an editable credit. */
export function otherSource(name: string, url: string, attribution: string): RouteSource {
  const n = name.trim();
  const u = url.trim();
  return { name: n, ...(u ? { url: u } : {}), attribution: attribution.trim() || `Route from ${n}` };
}
