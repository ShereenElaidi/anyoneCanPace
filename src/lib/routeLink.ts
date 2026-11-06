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

/**
 * Which known route a shared link's `?route=` value means, or null.
 *
 * Share sheets often copy the link and its text together ("…?route=pi-day" then
 * "Pi Day (4.6 km) on AnyoneCanPace" on the next line), and pasting that into the
 * address bar glues them into one value: "pi-dayPi Day (4.6 km) on …". Route ids
 * never contain spaces, so a known id followed by text with a space is that route.
 * A stray `.` `,` `)` or quote at the end (from a sentence) is ignored too.
 * Anything else, like a real typo or "pi-day-2", is not guessed at.
 */
export function matchSharedRoute(value: string, ids: readonly string[]): string | null {
  const v = value.trim().replace(/[.,;:!?)\]}'"»”’]+$/u, '');
  const exact = ids.find((id) => id === v || id === v.toLowerCase());
  if (exact) return exact;
  const glued = ids
    .filter((id) => v.toLowerCase().startsWith(id) && /\s/u.test(v.slice(id.length)))
    .sort((a, b) => b.length - a.length);
  return glued[0] ?? null;
}

/** The same address without the shared-route part, so a reload or the back button doesn't reopen it. */
export function withoutRouteParam(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(ROUTE_PARAM);
  return url.toString();
}
