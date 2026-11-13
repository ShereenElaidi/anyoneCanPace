import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkMap,
  getMapStatus,
  LEGACY_CACHE,
  LEGACY_META_KEY,
  mapStatusText,
  mapUrl,
  MAP_VERSION,
  readSavedMap,
  resetOfflineMapForTests,
  saveMap,
} from './offlineMap';

const LIVE = '/anyoneCanPace/';
const BETA = '/anyoneCanPace-beta/';

/** In-memory Cache Storage with named caches, like the real one (shared by the whole origin). */
function fakeCaches() {
  const named = new Map<string, Map<string, ArrayBuffer>>();
  let failPut = false;
  const open = async (name: string) => {
    if (!named.has(name)) named.set(name, new Map());
    const store = named.get(name)!;
    const key = (r: string | { url: string }) => (typeof r === 'string' ? r : r.url);
    return {
      match: async (r: string | { url: string }) => {
        const b = store.get(key(r));
        return b ? new Response(b) : undefined;
      },
      put: async (r: string, res: Response) => {
        if (failPut) throw new DOMException('Quota exceeded', 'QuotaExceededError');
        store.set(r, await res.arrayBuffer());
      },
      keys: async () => [...store.keys()].map((url) => ({ url })),
      delete: async (r: string | { url: string }) => store.delete(key(r)),
    };
  };
  return {
    api: { open, has: async (n: string) => named.has(n), delete: async (n: string) => named.delete(n) },
    named,
    failPuts: (v: boolean) => (failPut = v),
  };
}

const file = (n: number) => new Response(new Uint8Array(n).fill(7), { headers: { 'content-length': String(n) } });
let c: ReturnType<typeof fakeCaches>;

beforeEach(() => {
  c = fakeCaches();
  Object.defineProperty(globalThis, 'caches', { value: c.api, configurable: true });
  localStorage.clear();
  resetOfflineMapForTests({ base: LIVE });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'caches');
  vi.unstubAllGlobals();
});

describe('offline street map', () => {
  it('reports honestly when the browser cannot save it', async () => {
    Reflect.deleteProperty(globalThis, 'caches');
    await checkMap();
    expect(getMapStatus().state).toBe('unsupported');
    expect(mapStatusText(getMapStatus())).toMatch(/can’t save the map/);
  });

  it('downloads the whole file once, then reads it back from the cache', async () => {
    const fetchMock = vi.fn(async () => file(1000));
    vi.stubGlobal('fetch', fetchMock);
    await checkMap();
    expect(getMapStatus().state).toBe('missing');
    await saveMap();
    const s = getMapStatus();
    expect(s.state === 'saved' && s.bytes).toBe(1000);
    expect(mapUrl()).toContain(`${LIVE}maps/montreal.pmtiles?v=${MAP_VERSION}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await readSavedMap())?.size).toBe(1000);
    expect(mapStatusText(getMapStatus())).toMatch(/Map saved for offline use on/);
  });

  it('a failed download says so and can be retried', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })));
    await saveMap();
    expect(getMapStatus().state).toBe('error');
    expect(mapStatusText(getMapStatus())).toMatch(/Couldn’t save the map/);
  });

  it('live and beta on the same origin keep separate maps; saving one never deletes the other', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => file(1000)));
    await saveMap(); // live
    resetOfflineMapForTests({ base: BETA, version: 'beta-newer' });
    await checkMap();
    expect(getMapStatus().state).toBe('missing'); // beta has its own storage
    vi.stubGlobal('fetch', vi.fn(async () => file(2000)));
    await saveMap(); // beta, a different version
    expect((await readSavedMap())?.size).toBe(2000);

    resetOfflineMapForTests({ base: LIVE });
    await checkMap();
    const live = getMapStatus();
    expect(live.state === 'saved' && live.bytes).toBe(1000);
    expect((await readSavedMap())?.size).toBe(1000);
    expect(c.named.size).toBe(2);
  });

  it('a replacement that fails to write keeps the last good map', async () => {
    resetOfflineMapForTests({ base: LIVE, version: 'old' });
    vi.stubGlobal('fetch', vi.fn(async () => file(1000)));
    await saveMap();
    resetOfflineMapForTests({ base: LIVE, version: 'new' });
    await checkMap();
    const before = getMapStatus();
    expect(before.state === 'saved' && before.outdated).toBe(true);
    expect(mapStatusText(before)).toMatch(/older map is saved/);

    c.failPuts(true);
    vi.stubGlobal('fetch', vi.fn(async () => file(1500)));
    await saveMap();
    const s = getMapStatus();
    expect(s.state === 'error' && s.keptOlder).toBe(true);
    expect(mapStatusText(s)).toMatch(/map saved earlier is still used/);
    expect((await readSavedMap())?.size).toBe(1000); // the old map still serves offline

    // Once it can be written, the new one replaces this deployment's old one.
    c.failPuts(false);
    await saveMap();
    expect((await readSavedMap())?.size).toBe(1500);
    const s2 = getMapStatus();
    expect(s2.state === 'saved' && !s2.outdated).toBe(true);
  });

  it('a download cut short is not saved', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(500), { headers: { 'content-length': '1000' } })));
    await saveMap();
    expect(getMapStatus().state).toBe('error');
    expect(await readSavedMap()).toBeNull();
  });

  it('a gzipped download (GitHub Pages) is saved: its Content-Length is the compressed size', async () => {
    // Real case: 11,185,558 bytes gzipped on the wire, 11,185,089 bytes once decoded.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array(1000), { headers: { 'content-length': '1003', 'content-encoding': 'gzip' } })),
    );
    await saveMap();
    expect(getMapStatus().state).toBe('saved');
    expect((await readSavedMap())?.size).toBe(1000);
  });

  it('eviction is noticed: rechecking (e.g. on returning to the app) stops saying "saved"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => file(1000)));
    await saveMap();
    c.named.clear(); // the browser evicted it
    await checkMap();
    expect(getMapStatus().state).toBe('missing');
  });

  it('reopening offline reads the saved copy without the network', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => file(1000)));
    await saveMap();
    resetOfflineMapForTests({ base: LIVE });
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    await checkMap();
    expect(getMapStatus().state).toBe('saved');
    expect((await readSavedMap())?.size).toBe(1000);
  });

  it('migrates from the shared legacy cache without deleting another deployment’s entry', async () => {
    const legacy = await c.api.open(LEGACY_CACHE);
    const liveUrl = mapUrl();
    const betaUrl = new URL(`${BETA}maps/montreal.pmtiles?v=${MAP_VERSION}`, location.origin).href;
    await legacy.put(liveUrl, file(1000));
    await legacy.put(betaUrl, file(1200));
    localStorage.setItem(LEGACY_META_KEY, JSON.stringify({ version: MAP_VERSION, savedAt: 123, bytes: 1000 }));

    await checkMap(); // live opens first
    const s = getMapStatus();
    expect(s.state === 'saved' && s.savedAt).toBe(123);
    expect((await readSavedMap())?.size).toBe(1000);
    // The beta's copy is still in the legacy cache for the beta to migrate.
    expect([...(c.named.get(LEGACY_CACHE)?.keys() ?? [])]).toEqual([betaUrl]);
    expect(localStorage.getItem(LEGACY_META_KEY)).not.toBeNull();

    resetOfflineMapForTests({ base: BETA });
    await checkMap();
    expect((await readSavedMap())?.size).toBe(1200);
    expect(c.named.has(LEGACY_CACHE)).toBe(false); // now empty, so removed
    expect(localStorage.getItem(LEGACY_META_KEY)).toBeNull();
  });
});
