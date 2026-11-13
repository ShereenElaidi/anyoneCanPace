import { describe, expect, it } from 'vitest';
import { matchSharedRoute, routeShareUrl, sharedRouteId, withoutRouteParam, withRouteParam } from './routeLink';

describe('shared route links', () => {
  it('names only the route, on the app’s own address', () => {
    expect(routeShareUrl('pi-day', 'https://anyonecanpace.pages.dev/')).toBe('https://anyonecanpace.pages.dev/?route=pi-day');
    expect(routeShareUrl('pi-day', 'https://anyonecanpacebeta.pages.dev/?sim&x=1#top')).toBe(
      'https://anyonecanpacebeta.pages.dev/?route=pi-day',
    );
    expect(routeShareUrl('a b&c', 'http://localhost:5173/anyoneCanPace/')).toBe('http://localhost:5173/anyoneCanPace/?route=a+b%26c');
  });

  it('reads the route back, and ignores an empty one', () => {
    expect(sharedRouteId('?route=pi-day')).toBe('pi-day');
    expect(sharedRouteId(new URL(routeShareUrl('a b&c', 'https://x.test/')).search)).toBe('a b&c');
    expect(sharedRouteId('?route=')).toBeNull();
    expect(sharedRouteId('?route=%20')).toBeNull();
    expect(sharedRouteId('')).toBeNull();
  });

  it('finds the route when the share text got pasted onto the link', () => {
    const ids = ['pi-day', '1st-bday-of-the-stooopidverse', 'sample-loop'];
    // The link and its text, copied from a share sheet and pasted into the address bar as one line.
    const pasted = 'https://anyonecanpacebeta.pages.dev/?route=1st-bday-of-the-stooopidverse1st bday of the Stooopid Run Crew (7.0 km) on AnyoneCanPace';
    expect(matchSharedRoute(sharedRouteId(new URL(pasted).search)!, ids)).toBe('1st-bday-of-the-stooopidverse');
    expect(matchSharedRoute('pi-day Pi Day (4.6 km) on AnyoneCanPace', ids)).toBe('pi-day');
    // A stray end of sentence, or capitals.
    expect(matchSharedRoute('pi-day).', ids)).toBe('pi-day');
    expect(matchSharedRoute('Sample-Loop', ids)).toBe('sample-loop');
    expect(matchSharedRoute('pi-day', ids)).toBe('pi-day');
  });

  it('doesn’t guess at other routes or typos', () => {
    const ids = ['pi-day', 'sample-loop'];
    expect(matchSharedRoute('pi-day-2', ids)).toBeNull(); // a different (removed) route, not Pi Day
    expect(matchSharedRoute('pi-dayy', ids)).toBeNull();
    expect(matchSharedRoute('pi-da', ids)).toBeNull();
    expect(matchSharedRoute('gone-route', ids)).toBeNull();
  });

  it('names the route in an address, keeping the rest', () => {
    expect(withRouteParam('https://x.test/', 'pi-day')).toBe('https://x.test/?route=pi-day');
    expect(withRouteParam('https://x.test/?route=old', 'pi-day')).toBe('https://x.test/?route=pi-day');
    expect(withRouteParam('http://localhost:5173/anyoneCanPace/?sim', 'pi-day')).toBe('http://localhost:5173/anyoneCanPace/?sim=&route=pi-day');
  });

  it('removes only the route part of the address', () => {
    expect(withoutRouteParam('https://x.test/?route=pi-day')).toBe('https://x.test/');
    expect(withoutRouteParam('http://localhost:5173/anyoneCanPace/?sim&route=pi-day')).toBe('http://localhost:5173/anyoneCanPace/?sim=');
  });
});
