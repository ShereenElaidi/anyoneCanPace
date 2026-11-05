/**
 * Words for the Route Library: how a route feels, how long it takes at your
 * pace, its tags and the "Show routes" filters. Pure (no DOM, no storage).
 */
import type { RouteKind, RouteStats, RouteSummary } from '../nav/types';

// ---------- Tags ----------

export type TagTone = 'gold' | 'green' | 'blue';

/**
 * Tags a route can carry (`tags` in src/data/routes/<id>.json, hand-edited).
 * Ids, not labels, so a typo can't silently break a filter: a test checks
 * every route file against this list.
 */
export const ROUTE_TAGS: Record<string, { label: string; tone: TagTone }> = {
  'shape-run': { label: 'Shape run', tone: 'green' },
  'good-first-route': { label: 'Good first route', tone: 'blue' },
  waterfront: { label: 'Waterfront', tone: 'gold' },
  'canal-path': { label: 'Canal path', tone: 'gold' },
};

/** Problems with a route's tags ([] if they're fine). */
export function validateTags(tags: unknown): string[] {
  if (tags === undefined) return [];
  if (!Array.isArray(tags)) return ['tags must be a list'];
  const errors: string[] = [];
  for (const t of tags) {
    if (typeof t !== 'string' || !(t in ROUTE_TAGS)) {
      errors.push(`unknown tag "${String(t)}" (known: ${Object.keys(ROUTE_TAGS).join(', ')})`);
    }
  }
  if (new Set(tags).size !== tags.length) errors.push('a tag is listed twice');
  return errors;
}

// ---------- Route shape and terrain ----------

export const KIND_WORD: Record<RouteKind, string> = {
  loop: 'loop',
  'out-and-back': 'out and back',
  'point-to-point': 'point to point',
};

/** Climb per km, the one number behind both the terrain words and the "Flat" filter. */
export const climbPerKm = (s: RouteStats) => (s.distanceM > 0 ? s.gainM / (s.distanceM / 1000) : 0);

/** Below this climb per km a route counts as flat ("Flat all the way" or "Mostly flat"). */
export const FLAT_M_PER_KM = 6;

/** Plain words for the climb, from the bare-earth elevation (exact numbers are on the route page). */
export function terrainText(s: RouteStats): string {
  const perKm = climbPerKm(s);
  if (perKm < 2) return 'Flat all the way';
  if (perKm < FLAT_M_PER_KM) return 'Mostly flat';
  if (perKm < 12) return 'Some gentle hills';
  if (perKm < 20) return 'A few real climbs';
  return 'Hilly';
}

// ---------- Pace and time ----------

/** Seconds per km. */
export const PACE = { default: 450, min: 240, max: 720, step: 15 } as const;
export const PACE_PRESETS = [360, 405, 450, 510, 600] as const;

export const clampPace = (s: number) =>
  Math.min(PACE.max, Math.max(PACE.min, Math.round(s / PACE.step) * PACE.step));

/** 450 → "7:30". */
export function formatPace(secondsPerKm: number): string {
  const m = Math.floor(secondsPerKm / 60);
  const s = secondsPerKm % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 450 → "7 minutes 30 seconds per km", for screen readers. */
export function spokenPace(secondsPerKm: number): string {
  const m = Math.floor(secondsPerKm / 60);
  const s = secondsPerKm % 60;
  return `${m} minute${m === 1 ? '' : 's'}${s ? ` ${s} seconds` : ''} per km`;
}

/** Time to cover the route at a pace, rounded to the minute: "~48 min", "~1 h 33" (and spoken forms). */
export function estimateTime(distanceM: number, secondsPerKm: number): { text: string; spoken: string } {
  const min = Math.max(1, Math.round(((distanceM / 1000) * secondsPerKm) / 60));
  if (min < 60) return { text: `~${min} min`, spoken: `about ${min} minute${min === 1 ? '' : 's'}` };
  const h = Math.floor(min / 60);
  const m = min % 60;
  const hours = `${h} hour${h === 1 ? '' : 's'}`;
  return {
    text: m ? `~${h} h ${String(m).padStart(2, '0')}` : `~${h} h`,
    spoken: m ? `about ${hours} ${m} minute${m === 1 ? '' : 's'}` : `about ${hours}`,
  };
}

// ---------- Filters ----------

export type RouteFilter = 'all' | 'shape-run' | 'short' | 'flat' | 'waterfront' | 'long';

export const FILTERS: { id: RouteFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'shape-run', label: 'Shape runs' },
  { id: 'short', label: 'Under 5 km' },
  { id: 'flat', label: 'Flat' },
  { id: 'waterfront', label: 'Waterfront' },
  { id: 'long', label: '10 km+' },
];

export function matchesFilter(r: RouteSummary, f: RouteFilter): boolean {
  switch (f) {
    case 'all':
      return true;
    case 'shape-run':
    case 'waterfront':
      return !!r.tags?.includes(f);
    case 'short':
      return r.stats.distanceM < 5000;
    case 'flat':
      return climbPerKm(r.stats) < FLAT_M_PER_KM;
    case 'long':
      return r.stats.distanceM >= 10_000;
  }
}

/** The filters worth offering: "All", plus each one that matches at least one route. */
export const availableFilters = (routes: RouteSummary[]) =>
  FILTERS.filter((f) => f.id === 'all' || routes.some((r) => matchesFilter(r, f.id)));
