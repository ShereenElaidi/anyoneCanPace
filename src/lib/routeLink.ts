/**
 * Shared route links: `<app address>?route=<route id>` opens the Route Library
 * straight on that route's page. Only the route id goes in the link, never a
 * position or anything about the person sharing it.
 *
 * Kept tiny and free of route data so the first-load bundle can read it.
 */
export const ROUTE_PARAM = 'route';

/** The link to share for a route, on this app's own address (live or beta). */
export function routeShareUrl(id: string, appUrl: string): string {
  const url = new URL(appUrl);
  url.search = '';
  url.hash = '';
  url.searchParams.set(ROUTE_PARAM, id);
  return url.toString();
}

/** The route id a shared link asks for, or null. */
export function sharedRouteId(search: string): string | null {
  const id = new URLSearchParams(search).get(ROUTE_PARAM)?.trim();
  return id ? id : null;
}

/** The same address without the shared-route part, so a reload or the back button doesn't reopen it. */
export function withoutRouteParam(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(ROUTE_PARAM);
  return url.toString();
}
