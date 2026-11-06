/**
 * Words for the Route Library: how a route feels, how long it takes at your
 * pace, its tags and the "Show routes" filters. Pure (no DOM, no storage).
 */
import type { RouteKind, RouteStats, RouteSummary } from '../nav/types';
import routeTagsJson from '../data/route-tags.json';

// ---------- Tags ----------

/** Chip colours a tag can use; each is styled (and contrast-checked) as `.tag--<tone>` in sixk.css. */
export const TAG_TONES = ['gold', 'green', 'blue'] as const;
export type TagTone = (typeof TAG_TONES)[number];

export interface TagDef {
  label: string;
  tone: TagTone;
}

/**
 * Tags a route can carry (`tags` in src/data/routes/<id>.json, hand-edited).
 * The list itself is data, `src/data/route-tags.json`, so the dev route editor
 * can add tags. Ids, not labels, so a typo can't silently break a filter: a
 * test checks every route file, and the list, with the validators below.
 */
export const ROUTE_TAGS = routeTagsJson as Record<string, TagDef>;

/** Tags the "Show routes" filters depend on (`matchesFilter`): they can't be removed from the list. */
export const FILTER_TAGS = ['shape-run', 'waterfront'] as const;

export const TAG_LABEL_MAX = 24;
const TAG_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Problems with the tag list itself ([] if it's fine). */
export function validateTagList(list: unknown): string[] {
  if (typeof list !== 'object' || list === null || Array.isArray(list)) return ['the tag list must be an object of id → { label, tone }'];
  const errors: string[] = [];
  const labels = new Map<string, string>();
  for (const [id, def] of Object.entries(list as Record<string, unknown>)) {
    if (!TAG_ID.test(id)) errors.push(`tag id "${id}" must be lowercase words joined by hyphens`);
    if (typeof def !== 'object' || def === null) {
      errors.push(`tag "${id}" must be { label, tone }`);
      continue;
    }
    const { label, tone, ...rest } = def as Record<string, unknown>;
    for (const k of Object.keys(rest)) errors.push(`tag "${id}" has an unknown field "${k}"`);
    if (typeof label !== 'string' || label.trim() === '' || label !== label.trim()) {
      errors.push(`tag "${id}" needs a label without spaces at the start or end`);
    } else {
      if (label.length > TAG_LABEL_MAX) errors.push(`tag "${id}" label is ${label.length} characters (at most ${TAG_LABEL_MAX})`);
      const key = label.toLowerCase();
      const other = labels.get(key);
      if (other) errors.push(`tags "${other}" and "${id}" have the same label "${label}"`);
      else labels.set(key, id);
    }
    if (!TAG_TONES.includes(tone as TagTone)) errors.push(`tag "${id}" has unknown tone "${String(tone)}" (known: ${TAG_TONES.join(', ')})`);
  }
  for (const id of FILTER_TAGS) {
    if (!(id in (list as object))) errors.push(`tag "${id}" is used by a "Show routes" filter and can't be removed`);
  }
  return errors;
}

// ---------- Description ----------

/** Longest route description, so it stays a quick read on a phone. */
export const DESCRIPTION_MAX = 280;

/** Problems with a route's description ([] if it's fine or absent). */
export function validateDescription(description: unknown): string[] {
  if (description === undefined) return [];
  if (typeof description !== 'string') return ['description must be text'];
  if (description.trim() === '') return ['description is blank (leave it out instead)'];
  if (description !== description.trim()) return ['description has spaces at the start or end'];
  if (description.length > DESCRIPTION_MAX) return [`description is ${description.length} characters (at most ${DESCRIPTION_MAX})`];
  return [];
}

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
      // Both are in FILTER_TAGS, so validateTagList keeps them in the tag list.
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
