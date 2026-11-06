/**
 * Dev route editor: checking and merging the hand-edited fields of a route
 * file (src/data/routes/<id>.json). Pure, so the editor page and the dev-server
 * plugin that writes the files share exactly the same rules. Generated fields
 * (stats, profile, bbox, track, geometry, kind) can't be edited here: they
 * come from `npm run routes`.
 */
import { noticeProblems } from '../../advisories/notices';
import { validateVerification } from '../../nav/verification';
import type { Advisory, RouteData, Turn, TurnDir } from '../../nav/types';
import { validateDescription, type TagDef } from '../../sixk/describe';

export const EDITABLE_FIELDS = [
  'name',
  'place',
  'description',
  'tags',
  'notes',
  'startStreet',
  'turns',
  'advisories',
  'verification',
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];
export type RouteEdits = Partial<Pick<RouteData, EditableField>>;

/** Key order of a route file, as scripts/build-routes.ts writes it, so a save doesn't reorder the file. */
const KEY_ORDER: (keyof RouteData)[] = [
  'id', 'name', 'kind', 'stats', 'track', 'startStreet', 'place', 'description', 'tags', 'bbox',
  'profile', 'turns', 'notes', 'advisories', 'source', 'verification', 'geometry',
];

export const TURN_DIRS = [
  'left', 'right', 'slight-left', 'slight-right', 'sharp-left', 'sharp-right', 'u-turn', 'straight',
] as const satisfies readonly TurnDir[];
// Fails to compile if TurnDir gains a direction that isn't listed above.
const _allDirs: Exclude<TurnDir, (typeof TURN_DIRS)[number]> extends never ? true : never = true;
void _allDirs;

export const NAME_MAX = 60;
export const PLACE_MAX = 60;
export const ID_MAX = 40;

/** A route id from its name: "Lachine Canal à l'aube" → "lachine-canal-a-l-aube". */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, ID_MAX)
    .replace(/-+$/, '');
}

/** Problems with the id for a new route ([] if it's fine). */
export function validateNewRouteId(id: string, existingIds: readonly string[]): string[] {
  if (!id) return ['the route needs an id (lowercase letters, numbers and hyphens)'];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return [`id "${id}" must be lowercase words joined by hyphens`];
  if (id.length > ID_MAX) return [`id is longer than ${ID_MAX} characters`];
  if (id === 'manifest') return ['"manifest" is reserved'];
  if (existingIds.includes(id)) return [`there is already a route with the id "${id}"`];
  return [];
}

const isText = (v: unknown): v is string => typeof v === 'string';
const trimmed = (v: string) => v === v.trim();

/** Problems with a route's turns ([] if they're fine). Turns must be in order along the route. */
export function validateTurns(turns: unknown, distanceM: number): string[] {
  if (!Array.isArray(turns)) return ['turns must be a list'];
  const errors: string[] = [];
  let prev = -Infinity;
  turns.forEach((t: unknown, i) => {
    const where = `turn ${i + 1}`;
    if (!t || typeof t !== 'object') return void errors.push(`${where} must be an object`);
    const { atM, dir, street, note, ...rest } = t as Record<string, unknown>;
    for (const k of Object.keys(rest)) errors.push(`${where} has an unknown field "${k}"`);
    if (typeof atM !== 'number' || !Number.isFinite(atM) || atM < 0 || atM > distanceM) {
      errors.push(`${where}: atM must be a distance between 0 and ${distanceM} m`);
    } else {
      if (atM <= prev) errors.push(`${where} is not after turn ${i} along the route`);
      prev = atM;
    }
    if (!TURN_DIRS.includes(dir as TurnDir)) errors.push(`${where}: unknown direction "${String(dir)}"`);
    if (!isText(street) || !trimmed(street)) errors.push(`${where}: street must be text without spaces at the start or end (it may be empty)`);
    if (note !== undefined && (!isText(note) || note.trim() === '' || !trimmed(note))) {
      errors.push(`${where}: note must be text without spaces at the start or end (leave it out instead of empty)`);
    }
  });
  return errors;
}

/** Problems with a route's own advisories ([] if they're fine). Same rules as src/data/advisories.json, plus km ranges inside the route. */
export function validateAdvisories(advisories: unknown, routeId: string, distanceM: number, today: string): string[] {
  if (!Array.isArray(advisories)) return ['advisories must be a list'];
  const errors: string[] = [];
  const allowed = ['text', 'fromKm', 'toKm', 'start', 'end', 'source'];
  advisories.forEach((a: unknown, i) => {
    if (!a || typeof a !== 'object') return void errors.push(`advisory ${i + 1} must be an object`);
    for (const k of Object.keys(a)) if (!allowed.includes(k)) errors.push(`advisory ${i + 1} has an unknown field "${k}"`);
    const { fromKm, toKm } = a as Advisory;
    const km = distanceM / 1000;
    if (typeof fromKm === 'number' && fromKm > km) errors.push(`advisory ${i + 1}: fromKm is past the end of the route (${km.toFixed(1)} km)`);
    if (typeof toKm === 'number' && toKm > km) errors.push(`advisory ${i + 1}: toKm is past the end of the route (${km.toFixed(1)} km)`);
    if (typeof fromKm === 'number' && typeof toKm === 'number' && toKm < fromKm) errors.push(`advisory ${i + 1}: toKm is before fromKm`);
  });
  const notices = advisories.map((a, i) => ({ id: `${routeId}-${i}`, route: routeId, kind: 'manual', ...(a as object) }));
  // noticeProblems numbers them "Notice n (id)"; say "advisory n" instead.
  const problems = noticeProblems({ lastChecked: today, notices }, [routeId]).map((p) =>
    p.replace(/^Notice (\d+) \([^)]*\)/, 'advisory $1'),
  );
  return [...errors, ...problems];
}

export interface EditResult {
  /** The route file to write, or null when there are errors. */
  data: RouteData | null;
  errors: string[];
  /** True when the route was reviewed and the edit reset it to unverified. */
  verificationReset: boolean;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Merges `edits` into `existing` and checks the result.
 * - Only EDITABLE_FIELDS are accepted.
 * - Empty `place`, `description` and `tags` remove the field.
 * - Changing `turns` or `startStreet` (what the pacer is told along the way)
 *   resets a reviewed route to unverified, as `npm run routes` does when the
 *   geometry changes. Marking a route reviewed in the same save as such a
 *   change is refused: the review has to be of the saved turns.
 * `tags` is the current tag list (src/data/route-tags.json), passed in because
 * the editor may have just added a tag. `today` is YYYY-MM-DD.
 */
export function applyEdits(
  existing: RouteData,
  edits: unknown,
  { tags: tagList, today }: { tags: Record<string, TagDef>; today: string },
): EditResult {
  const fail = (errors: string[]): EditResult => ({ data: null, errors, verificationReset: false });
  if (!edits || typeof edits !== 'object' || Array.isArray(edits)) return fail(['edits must be an object']);
  const e = edits as Record<string, unknown>;
  const errors: string[] = [];
  for (const k of Object.keys(e)) {
    if (!(EDITABLE_FIELDS as readonly string[]).includes(k)) errors.push(`"${k}" can't be edited here (it comes from npm run routes)`);
  }
  const next: Record<string, unknown> = { ...existing };
  const distanceM = existing.stats.distanceM;

  if ('name' in e) {
    if (!isText(e.name) || !e.name.trim() || !trimmed(e.name)) errors.push('name must be text without spaces at the start or end');
    else if (e.name.length > NAME_MAX) errors.push(`name is longer than ${NAME_MAX} characters`);
    else next.name = e.name;
  }
  for (const [key, max] of [['place', PLACE_MAX]] as const) {
    if (!(key in e)) continue;
    const v = e[key];
    if (v === '' || v === undefined) delete next[key];
    else if (!isText(v) || !trimmed(v)) errors.push(`${key} must be text without spaces at the start or end`);
    else if (v.length > max) errors.push(`${key} is longer than ${max} characters`);
    else next[key] = v;
  }
  if ('description' in e) {
    if (e.description === '' || e.description === undefined) delete next.description;
    else {
      const problems = validateDescription(e.description);
      if (problems.length) errors.push(...problems);
      else next.description = e.description;
    }
  }
  if ('tags' in e) {
    const t = e.tags;
    if (t === undefined || (Array.isArray(t) && t.length === 0)) delete next.tags;
    else if (!Array.isArray(t)) errors.push('tags must be a list');
    else {
      for (const id of t) if (typeof id !== 'string' || !(id in tagList)) errors.push(`unknown tag "${String(id)}"`);
      if (new Set(t).size !== t.length) errors.push('a tag is listed twice');
      next.tags = t;
    }
  }
  if ('notes' in e) {
    if (!Array.isArray(e.notes) || e.notes.some((n) => !isText(n) || !n.trim() || !trimmed(n))) {
      errors.push('notes must be a list of non-empty lines without spaces at the start or end');
    } else next.notes = e.notes;
  }
  if ('startStreet' in e) {
    if (!isText(e.startStreet) || !trimmed(e.startStreet)) errors.push('startStreet must be text without spaces at the start or end (it may be empty)');
    else next.startStreet = e.startStreet;
  }
  if ('turns' in e) {
    const problems = validateTurns(e.turns, distanceM);
    if (problems.length) errors.push(...problems);
    else next.turns = (e.turns as Turn[]).map(({ atM, dir, street, note }) => (note === undefined ? { atM, dir, street } : { atM, dir, street, note }));
  }
  if ('advisories' in e) {
    const problems = validateAdvisories(e.advisories, existing.id, distanceM, today);
    if (problems.length) errors.push(...problems);
    else next.advisories = e.advisories;
  }
  if ('verification' in e) {
    const problems = validateVerification(e.verification, today);
    if (problems.length) errors.push(...problems);
    else next.verification = e.verification;
  }

  const directionsChanged = !same(next.turns, existing.turns) || !same(next.startStreet, existing.startStreet);
  const verification = next.verification as RouteData['verification'];
  let verificationReset = false;
  if (directionsChanged && verification.status !== 'unverified') {
    if ('verification' in e && !same(e.verification, existing.verification)) {
      errors.push('save the changed turns first, then mark the route reviewed: a review has to be of the saved turns');
    } else {
      next.verification = {
        status: 'unverified',
        notes: `Was ${verification.status}; the turns or start street changed since, so it needs checking again.`,
      };
      verificationReset = true;
    }
  }
  if (errors.length) return fail(errors);

  const ordered = Object.fromEntries(
    [...KEY_ORDER, ...Object.keys(next).filter((k) => !KEY_ORDER.includes(k as keyof RouteData))]
      .filter((k) => next[k] !== undefined)
      .map((k) => [k, next[k]]),
  );
  return { data: ordered as unknown as RouteData, errors: [], verificationReset };
}
