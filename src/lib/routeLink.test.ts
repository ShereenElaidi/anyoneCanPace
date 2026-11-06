import { describe, expect, it } from 'vitest';
import { routeShareUrl, sharedRouteId, withoutRouteParam } from './routeLink';

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

  it('removes only the route part of the address', () => {
    expect(withoutRouteParam('https://x.test/?route=pi-day')).toBe('https://x.test/');
    expect(withoutRouteParam('http://localhost:5173/anyoneCanPace/?sim&route=pi-day')).toBe('http://localhost:5173/anyoneCanPace/?sim=');
  });
});
