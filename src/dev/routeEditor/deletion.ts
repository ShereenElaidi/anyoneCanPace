/**
 * Route editor: what deleting a route would remove, and what blocks it. Pure:
 * the dev server gathers the files, their text and `git status`, and this
 * decides. Removed files are moved to a trash folder (.cache/, ignored by git),
 * never destroyed, so even changes that were never committed can come back.
 */
import type { RouteConfig } from './types';

export interface SourceFile {
  /** Repository-relative path, with forward slashes. */
  path: string;
  text: string;
}

export interface Reference {
  path: string;
  line: number;
  text: string;
}

export interface DeletionPlan {
  id: string;
  name: string;
  /** Files that would be moved to the trash, repository-relative. */
  files: string[];
  /** routes/<gpx> stays because another route uses the same file. */
  sharedGpx: string | null;
  /** Code, tests or data outside the route's own files that name it. Deleting is blocked while there are any. */
  references: Reference[];
  /** Advisories in src/data/advisories.json for this route. Also block. */
  advisories: string[];
  /** Files to remove that have changes git doesn't have (or aren't in git at all): kept only in the trash. */
  uncommitted: string[];
  /** The route's review status, if reviewed: deleting loses that review. */
  reviewed: string | null;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The files that belong to route `id` (and nothing else), from the files that exist. */
export function routeFiles(id: string, gpx: string | null, existing: readonly string[]): string[] {
  const own = new Set([
    `src/data/routes/${id}.json`,
    `src/data/routes/${id}.geojson`,
    `routes/review/${id}.md`,
    `routes/review/${id}.json`,
    ...(gpx ? [`routes/${gpx}`] : []),
  ]);
  return existing.filter((p) => own.has(p) || p.startsWith(`routes/cache/${id}.`)).sort();
}

/**
 * Lines that name the route: the id in quotes ('pi-day', "pi-day", `pi-day`),
 * after "=" (a ?sim=pi-day link), or as a file name (pi-day.json). The route's
 * own files, the manifest and the config are not references.
 */
export function findReferences(id: string, sources: readonly SourceFile[], own: readonly string[]): Reference[] {
  const re = new RegExp(`(['"\`=])${escape(id)}(?![a-z0-9-])|(?<![a-z0-9-])${escape(id)}\\.(?:json|geojson|gpx|md)\\b`);
  const skip = new Set([...own, 'src/data/routes/manifest.json', 'routes/routes.config.json', 'src/data/advisories.json']);
  const out: Reference[] = [];
  for (const f of sources) {
    if (skip.has(f.path)) continue;
    f.text.split('\n').forEach((text, i) => {
      if (re.test(text)) out.push({ path: f.path, line: i + 1, text: text.trim().slice(0, 160) });
    });
  }
  return out;
}

export function planDeletion(input: {
  id: string;
  config: readonly RouteConfig[];
  existing: readonly string[];
  sources: readonly SourceFile[];
  advisories: unknown;
  /** `git status --porcelain` lines. */
  gitStatus: readonly string[];
  reviewed: string | null;
}): DeletionPlan | null {
  const entry = input.config.find((c) => c.id === input.id);
  if (!entry) return null;
  const shared = input.config.some((c) => c.id !== input.id && c.gpx === entry.gpx);
  const files = routeFiles(input.id, shared ? null : entry.gpx, input.existing);
  const notices = (input.advisories as { notices?: { id?: string; route?: string; text?: string }[] } | null)?.notices ?? [];
  const changed = new Set(input.gitStatus.map((l) => l.slice(3).trim().replace(/^"|"$/g, '')));
  return {
    id: input.id,
    name: entry.name,
    files,
    sharedGpx: shared ? `routes/${entry.gpx}` : null,
    references: findReferences(input.id, input.sources, files),
    advisories: notices.filter((n) => n.route === input.id).map((n) => `${n.id ?? '?'}: ${n.text ?? ''}`),
    // A changed config is expected (it's edited too); only the route's own files matter here.
    uncommitted: files.filter((f) => changed.has(f) || [...changed].some((c) => c.endsWith('/') && f.startsWith(c))),
    reviewed: input.reviewed && input.reviewed !== 'unverified' ? input.reviewed : null,
  };
}

/** Why the deletion can't go ahead ([] when it can). */
export function deletionBlockers(plan: DeletionPlan, confirmName: string): string[] {
  const out: string[] = [];
  if (plan.references.length) {
    out.push(`${plan.references.length} line(s) in the code still name "${plan.id}": change them first.`);
  }
  if (plan.advisories.length) out.push(`src/data/advisories.json has ${plan.advisories.length} advisory(ies) for this route.`);
  if (confirmName !== plan.name) out.push(`Type the route’s name exactly (“${plan.name}”) to confirm.`);
  return out;
}
