import { describe, expect, it } from 'vitest';
import { classifyMapError } from './mapErrors';

describe('map error handling', () => {
  it('a failed tile or source request is recoverable, before or after the map loads', () => {
    expect(classifyMapError({ sourceId: 'protomaps', error: { message: 'Failed to fetch' } }, true)).toBe('tile');
    expect(classifyMapError({ tile: {}, error: { status: 404 } }, false)).toBe('tile');
  });

  it('an error before the map ever loaded is fatal (style or basemap unusable)', () => {
    expect(classifyMapError({ error: { message: 'Failed to parse style' } }, false)).toBe('fatal');
  });

  it('other errors once the map is up are only logged', () => {
    expect(classifyMapError({ error: { message: 'Image "x" could not be loaded' } }, true)).toBe('ignore');
  });
});
