/**
 * The route editor page's calls to the dev-server API (server/api.ts).
 * Every request carries the editor header the server insists on.
 */
import type { DeletionPlan } from './deletion';
import type { RouteEdits } from './edits';
import type { AddRouteResult, BuildResult, NewRoute, RouteDetail, RouteList, SaveRouteResult, TagList } from './types';

export const API = '/__route-editor/api';

/** A refused or failed request: the server's reasons, and the build log if a build ran. */
export class ApiError extends Error {
  constructor(
    readonly errors: string[],
    readonly build?: BuildResult,
  ) {
    super(errors.join(' '));
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: { 'x-route-editor': '1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(['The dev server isn’t answering. Is `npm run dev` still running?']);
  }
  const json = (await res.json().catch(() => ({}))) as { errors?: string[]; build?: BuildResult };
  if (!res.ok) throw new ApiError(json.errors ?? [`The server answered ${res.status}.`], json.build);
  return json as T;
}

export const api = {
  listRoutes: () => call<RouteList>('GET', '/routes'),
  getRoute: (id: string) => call<RouteDetail>('GET', `/routes/${id}`),
  addRoute: (route: NewRoute) => call<AddRouteResult>('POST', '/routes', route),
  saveRoute: (id: string, edits: RouteEdits) => call<SaveRouteResult>('PUT', `/routes/${id}`, edits),
  saveTags: (tags: TagList) => call<{ tags: TagList }>('PUT', '/tags', tags),
  build: (resetTurns = false) => call<{ build: BuildResult }>('POST', '/build', { resetTurns }),
  deletionPlan: (id: string) => call<DeletionPlan>('GET', `/routes/${id}/delete-plan`),
  deleteRoute: (id: string, confirmName: string) =>
    call<{ trash: string; moved: string[]; build: BuildResult }>('DELETE', `/routes/${id}`, { confirmName }),
};
