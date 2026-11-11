/**
 * Stooopid Sunday link: `<app address>?sunday` opens the Stooopid Sunday mode
 * (the Sunday run's weather first) instead of the mode picker, for linking from
 * another website. The link carries nothing else.
 *
 * Kept tiny so the first-load bundle can read it.
 */
export const SUNDAY_PARAM = 'sunday';

/** The link to share, on this app's own address (live or beta). */
export function sundayShareUrl(appUrl: string): string {
  const url = new URL(appUrl);
  url.search = '';
  url.hash = '';
  url.searchParams.set(SUNDAY_PARAM, '');
  return url.toString().replace(`${SUNDAY_PARAM}=`, SUNDAY_PARAM);
}

/** True when the address asks for the Stooopid Sunday mode. */
export function isSundayLink(search: string): boolean {
  return new URLSearchParams(search).has(SUNDAY_PARAM);
}

/** The same address without the `?sunday` part, so a reload or HOME goes to the picker. */
export function withoutSundayParam(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(SUNDAY_PARAM);
  return url.toString();
}
