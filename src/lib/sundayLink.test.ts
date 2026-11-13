import { describe, expect, it } from 'vitest';
import { isSundayLink, sundayShareUrl, withoutSundayParam } from './sundayLink';

describe('sundayLink', () => {
  it('recognises ?sunday', () => {
    expect(isSundayLink('?sunday')).toBe(true);
    expect(isSundayLink('?sunday=')).toBe(true);
    expect(isSundayLink('')).toBe(false);
    expect(isSundayLink('?route=pi-day')).toBe(false);
  });
  it('builds the link on the app address', () => {
    expect(sundayShareUrl('https://anyonecanpace.pages.dev/?route=x#y')).toBe('https://anyonecanpace.pages.dev/?sunday');
  });
  it('removes the param and keeps the rest', () => {
    expect(withoutSundayParam('https://a.dev/p/?sunday&sim')).toBe('https://a.dev/p/?sim=');
  });
});
