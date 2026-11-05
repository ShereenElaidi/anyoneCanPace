import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkMap,
  getMapStatus,
  mapStatusText,
  mapUrl,
  MAP_VERSION,
  readSavedMap,
  resetOfflineMapForTests,
  saveMap,
} from './offlineMap';

/** Minimal in-memory Cache Storage. */
function fakeCaches() {
  const store = new Map<string, Response>();
  const cache = {
    match: async (url: string) => store.get(url)?.clone(),
    put: async (url: string, res: Response) => void store.set(url, res),
    keys: async () => [...store.keys()].map((u) => ({ url: u })),
    delete: async (req: { url: string }) => store.delete(req.url),
  };
  return { open: async () => cache, store };
}

const bytes = new Uint8Array(1000).fill(7);

beforeEach(() => {
  resetOfflineMapForTests();
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'caches');
  vi.unstubAllGlobals();
});

describe('offline street map', () => {
  it('reports honestly when the browser cannot save it', async () => {
    await checkMap();
    expect(getMapStatus().state).toBe('unsupported');
    expect(mapStatusText(getMapStatus())).toMatch(/can’t save the map/);
  });

  it('downloads the whole file once, then reads it back from the cache', async () => {
    const c = fakeCaches();
    Object.defineProperty(globalThis, 'caches', { value: c, configurable: true });
    const fetchMock = vi.fn(async () => new Response(bytes, { headers: { 'content-length': '1000' } }));
    vi.stubGlobal('fetch', fetchMock);

    await checkMap();
    expect(getMapStatus().state).toBe('missing');
    await saveMap();
    const s = getMapStatus();
    expect(s.state).toBe('saved');
    expect(s.state === 'saved' && s.bytes).toBe(1000);
    expect(mapUrl()).toContain(`v=${MAP_VERSION}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const blob = await readSavedMap();
    expect(blob?.size).toBe(1000);
    expect(mapStatusText(getMapStatus())).toMatch(/Map saved for offline use on/);
  });

  it('a failed download says so and can be retried', async () => {
    Object.defineProperty(globalThis, 'caches', { value: fakeCaches(), configurable: true });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })));
    await saveMap();
    expect(getMapStatus().state).toBe('error');
    expect(mapStatusText(getMapStatus())).toMatch(/Couldn’t save the map/);
  });
});
