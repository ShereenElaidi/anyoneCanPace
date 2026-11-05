/**
 * Advisories: short notices about a route (a closure, a detour) or about
 * every run (global). Pure logic, no clocks: `today` is passed in.
 *
 * Sources, merged by collectNotices():
 *  - src/data/advisories.json: hand-edited by the crew, changed by pull request.
 *  - each route's own `advisories` list in src/data/routes/<id>.json.
 *  - Extension point: an automated feed (e.g. a daily road-closures file, or
 *    Environment Canada weather warnings) can be added as another NoticeFile
 *    with its own `kind`; the UI already shows `kind` and `source`.
 */
import type { RouteData } from '../nav/types';

export type NoticeKind = 'manual' | 'closure' | 'weather-warning';

export interface Notice {
  /** Unique within its file, e.g. "commune-sewer-2026-11". */
  id: string;
  /** A route id, or "global" for every route and the dashboard. */
  route: string;
  text: string;
  /** Optional stretch of the route it affects, in km. */
  fromKm?: number;
  toKm?: number;
  /** First and last day it applies (YYYY-MM-DD, inclusive). Omit for "until removed". */
  start?: string;
  end?: string;
  /** Where the information comes from (a link). */
  source?: string;
  kind?: NoticeKind;
}

export interface NoticeFile {
  /** When someone last checked these notices are still right (YYYY-MM-DD). */
  lastChecked: string;
  notices: Notice[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Checks a hand-edited notices file and returns the problems in plain words (empty = fine). */
export function noticeProblems(file: unknown, routeIds: readonly string[]): string[] {
  const problems: string[] = [];
  if (!file || typeof file !== 'object') return ['The file must be an object with lastChecked and notices.'];
  const f = file as Partial<NoticeFile>;
  if (typeof f.lastChecked !== 'string' || !DATE.test(f.lastChecked)) problems.push('lastChecked must be a date like 2026-11-04.');
  if (!Array.isArray(f.notices)) return [...problems, 'notices must be a list.'];
  const ids = new Set<string>();
  f.notices.forEach((n, i) => {
    const where = `Notice ${i + 1}${n && typeof n.id === 'string' ? ` (${n.id})` : ''}`;
    if (!n || typeof n !== 'object') return problems.push(`${where} must be an object.`);
    if (typeof n.id !== 'string' || !n.id) problems.push(`${where}: id is missing.`);
    else if (ids.has(n.id)) problems.push(`${where}: id is used twice.`);
    else ids.add(n.id);
    if (typeof n.text !== 'string' || !n.text.trim()) problems.push(`${where}: text is missing.`);
    if (n.route !== 'global' && !routeIds.includes(n.route)) {
      problems.push(`${where}: route "${n.route}" is not "global" or a route id (${routeIds.join(', ')}).`);
    }
    for (const key of ['start', 'end'] as const) {
      if (n[key] !== undefined && (typeof n[key] !== 'string' || !DATE.test(n[key]))) {
        problems.push(`${where}: ${key} must be a date like 2026-11-04.`);
      }
    }
    if (n.start && n.end && n.end < n.start) problems.push(`${where}: end is before start.`);
    for (const key of ['fromKm', 'toKm'] as const) {
      if (n[key] !== undefined && (typeof n[key] !== 'number' || n[key] < 0)) problems.push(`${where}: ${key} must be a number of km.`);
    }
    if (n.source !== undefined && !/^https?:\/\//.test(String(n.source))) problems.push(`${where}: source must be a web link.`);
  });
  return problems;
}

/** A route's own advisories (from its JSON) as notices. */
export function routeNotices(data: RouteData): Notice[] {
  return data.advisories.map((a, i) => ({ id: `${data.id}-${i}`, route: data.id, kind: 'manual', ...a }));
}

/** All notices from every source, each tagged with a kind. */
export function collectNotices(...lists: Notice[][]): Notice[] {
  return lists.flat().map((n) => ({ kind: 'manual', ...n }));
}

/** In force today: started (or no start) and not ended (or no end). Expired notices disappear. */
export function isActive(n: Notice, today: string): boolean {
  return (!n.start || n.start <= today) && (!n.end || n.end >= today);
}

/**
 * Notices to show today. For a route page pass its id: that route's notices
 * plus global ones. For the dashboard pass null: every active notice.
 * Route-specific notices come before global ones.
 */
export function activeNotices(notices: readonly Notice[], routeId: string | null, today: string): Notice[] {
  const shown = notices.filter((n) => isActive(n, today) && (routeId === null || n.route === routeId || n.route === 'global'));
  return [...shown.filter((n) => n.route !== 'global'), ...shown.filter((n) => n.route === 'global')];
}
