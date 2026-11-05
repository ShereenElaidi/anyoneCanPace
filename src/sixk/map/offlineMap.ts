/**
 * Keeps the whole street-map file on the phone for offline use.
 *
 * The map is a single PMTiles file read with HTTP range requests. Caching
 * individual ranges is unreliable, so instead the whole file is downloaded
 * once into Cache Storage and the map reads slices from that copy. The
 * status is shown to the pacer as it is: saved (with the date), saving,
 * not saved, or not possible in this browser.
 *
 * No map library is imported here, so the library list can show the status
 * without loading MapLibre.
 */
import { useEffect, useState } from 'react';

/** Bump when public/maps/montreal.pmtiles is re-cut, so phones fetch the new file. */
export const MAP_VERSION = '20261104-canal';
export const MAP_FILE = 'maps/montreal.pmtiles';
/** Shown before the first download. Keep roughly in line with the real file. */
export const MAP_SIZE_HINT_MB = 9.9;

const CACHE_NAME = 'anyonecanpace-map';
const META_KEY = 'anyonecanpace:map:v1';

export type MapStatus =
  | { state: 'checking' }
  | { state: 'unsupported' }
  | { state: 'missing' }
  | { state: 'saving'; fraction: number | null }
  | { state: 'saved'; savedAt: number; bytes: number }
  | { state: 'error'; message: string };

interface SavedMeta {
  version: string;
  savedAt: number;
  bytes: number;
}

export function mapUrl(): string {
  const base = typeof location === 'undefined' ? 'http://localhost/' : location.href;
  return new URL(`${import.meta.env.BASE_URL}${MAP_FILE}?v=${MAP_VERSION}`, base).href;
}

const supported = () => typeof caches !== 'undefined' && typeof fetch !== 'undefined';

function readMeta(): SavedMeta | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    const meta = raw ? (JSON.parse(raw) as SavedMeta) : null;
    return meta && meta.version === MAP_VERSION ? meta : null;
  } catch {
    return null;
  }
}

function writeMeta(meta: SavedMeta | null) {
  try {
    if (meta) localStorage.setItem(META_KEY, JSON.stringify(meta));
    else localStorage.removeItem(META_KEY);
  } catch {
    // The cached file still works; only the "saved on" date is lost.
  }
}

// ---------- A tiny shared store, so a download survives moving between screens ----------

let status: MapStatus = { state: 'checking' };
const listeners = new Set<(s: MapStatus) => void>();
let checked: Promise<void> | null = null;
let saving: Promise<void> | null = null;

function set(next: MapStatus) {
  status = next;
  for (const l of listeners) l(next);
}

export function getMapStatus(): MapStatus {
  return status;
}

/** Looks in Cache Storage once per page load. */
export function checkMap(): Promise<void> {
  checked ??= (async () => {
    if (!supported()) return set({ state: 'unsupported' });
    try {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(mapUrl());
      const meta = readMeta();
      if (hit) set({ state: 'saved', savedAt: meta?.savedAt ?? Date.now(), bytes: meta?.bytes ?? 0 });
      else set({ state: 'missing' });
    } catch {
      set({ state: 'unsupported' });
    }
  })();
  return checked;
}

/** Downloads the whole map file into Cache Storage. */
export function saveMap(): Promise<void> {
  if (saving) return saving;
  saving = (async () => {
    if (!supported()) return set({ state: 'unsupported' });
    set({ state: 'saving', fraction: 0 });
    try {
      const res = await fetch(mapUrl(), { cache: 'no-store' });
      if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
      const total = Number(res.headers.get('content-length')) || 0;
      const reader = res.body.getReader();
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value as Uint8Array<ArrayBuffer>);
        received += value.byteLength;
        set({ state: 'saving', fraction: total ? received / total : null });
      }
      const file = new Uint8Array(received);
      let offset = 0;
      for (const c of chunks) {
        file.set(c, offset);
        offset += c.byteLength;
      }
      const cache = await caches.open(CACHE_NAME);
      // Drop older versions of the file.
      for (const req of await cache.keys()) await cache.delete(req);
      await cache.put(
        mapUrl(),
        new Response(file, { headers: { 'Content-Type': 'application/vnd.pmtiles', 'Content-Length': String(received) } }),
      );
      // Ask the browser not to evict it (no prompt in most browsers; may be ignored).
      void navigator.storage?.persist?.().catch(() => false);
      const meta = { version: MAP_VERSION, savedAt: Date.now(), bytes: received };
      writeMeta(meta);
      set({ state: 'saved', savedAt: meta.savedAt, bytes: meta.bytes });
    } catch (err) {
      set({ state: 'error', message: err instanceof Error ? err.message : 'Download failed' });
    } finally {
      saving = null;
    }
  })();
  return saving;
}

/** The saved map file, or null (then the map streams from the network). */
export async function readSavedMap(): Promise<Blob | null> {
  if (!supported()) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(mapUrl());
    return hit ? await hit.blob() : null;
  } catch {
    return null;
  }
}

/** Should the map download on its own? Only when online and not in data-saver mode. */
export function shouldAutoSave(): boolean {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
  return navigator.onLine && !nav.connection?.saveData;
}

export function useOfflineMap(): MapStatus {
  const [s, setS] = useState(status);
  useEffect(() => {
    listeners.add(setS);
    setS(status);
    void checkMap();
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}

/** For tests. */
export function resetOfflineMapForTests() {
  status = { state: 'checking' };
  checked = null;
  saving = null;
  listeners.clear();
}

export function mapStatusText(s: MapStatus): string {
  switch (s.state) {
    case 'checking':
      return 'Checking the offline map…';
    case 'unsupported':
      return 'This browser can’t save the map. It loads while you’re online.';
    case 'missing':
      return `Map not saved for offline use (${MAP_SIZE_HINT_MB} MB).`;
    case 'saving':
      return s.fraction === null ? 'Saving the map for offline use…' : `Saving the map for offline use… ${Math.round(s.fraction * 100)} %`;
    case 'saved':
      return `Map saved for offline use on ${new Date(s.savedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}.`;
    case 'error':
      return `Couldn’t save the map (${s.message}). It loads while you’re online.`;
  }
}
