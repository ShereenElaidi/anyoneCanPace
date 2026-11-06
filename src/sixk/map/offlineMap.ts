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
export const MAP_VERSION = '20261106-1st-bday';
export const MAP_FILE = 'maps/montreal.pmtiles';
/** Shown before the first download. Keep roughly in line with the real file. */
export const MAP_SIZE_HINT_MB = 13.2;

/**
 * The live app (/anyoneCanPace/) and the beta (/anyoneCanPace-beta/) share one
 * origin, so Cache Storage and localStorage are shared too. Everything here is
 * namespaced by the deployment's base path, and only entries whose URL belongs
 * to this deployment are ever touched, so one install never deletes another's map.
 */
let deploymentBase: string = import.meta.env.BASE_URL;
let mapVersion: string = MAP_VERSION;
const cacheName = () => `anyonecanpace-map:${deploymentBase}`;
const metaKey = () => `anyonecanpace:map:v2:${deploymentBase}`;
/** Before namespacing (one cache and one key for every deployment on the origin). */
export const LEGACY_CACHE = 'anyonecanpace-map';
export const LEGACY_META_KEY = 'anyonecanpace:map:v1';

export type MapStatus =
  | { state: 'checking' }
  | { state: 'unsupported' }
  | { state: 'missing' }
  | { state: 'saving'; fraction: number | null }
  /** `outdated`: an older map version is saved (and used) while the current one isn't. */
  | { state: 'saved'; savedAt: number; bytes: number; outdated?: boolean }
  | { state: 'error'; message: string; keptOlder?: boolean };

interface SavedMeta {
  version: string;
  savedAt: number;
  bytes: number;
}

const origin = () => (typeof location === 'undefined' ? 'http://localhost' : location.origin);

export function mapUrl(): string {
  return new URL(`${deploymentBase}${MAP_FILE}?v=${mapVersion}`, origin() + '/').href;
}

/** Does this cached URL belong to this deployment (any map version)? */
const ours = (url: string) => {
  try {
    const u = new URL(url);
    return u.origin === origin() && u.pathname === `${deploymentBase}${MAP_FILE}`;
  } catch {
    return false;
  }
};

const supported = () => typeof caches !== 'undefined' && typeof fetch !== 'undefined';

function readMeta(): SavedMeta | null {
  try {
    const raw = localStorage.getItem(metaKey());
    return raw ? (JSON.parse(raw) as SavedMeta) : null;
  } catch {
    return null;
  }
}

function writeMeta(meta: SavedMeta | null) {
  try {
    if (meta) localStorage.setItem(metaKey(), JSON.stringify(meta));
    else localStorage.removeItem(metaKey());
  } catch {
    // The cached file still works; only the "saved on" date is lost.
  }
}

/**
 * One-time move out of the shared legacy cache: copy this deployment's current
 * map into its own cache (verified), then remove only this deployment's entries
 * from the legacy cache. Other deployments' entries stay; the legacy cache and
 * key are deleted only once nothing is left in them.
 */
async function migrateLegacy(): Promise<void> {
  if (!(await caches.has?.(LEGACY_CACHE))) return;
  const legacy = await caches.open(LEGACY_CACHE);
  const mine = (await legacy.keys()).filter((r) => ours(r.url));
  if (!mine.length) return;
  const current = mine.find((r) => r.url === mapUrl());
  if (current) {
    const res = await legacy.match(current);
    const target = await caches.open(cacheName());
    if (res && !(await target.match(mapUrl()))) {
      const bytes = await res.arrayBuffer();
      await target.put(mapUrl(), new Response(bytes, { headers: { 'Content-Type': 'application/vnd.pmtiles' } }));
      const check = await target.match(mapUrl());
      if (!check || (await check.arrayBuffer()).byteLength !== bytes.byteLength) return; // keep the legacy copy
      try {
        const old = JSON.parse(localStorage.getItem(LEGACY_META_KEY) ?? 'null') as SavedMeta | null;
        writeMeta({ version: mapVersion, savedAt: old?.version === mapVersion ? old.savedAt : Date.now(), bytes: bytes.byteLength });
      } catch {
        writeMeta({ version: mapVersion, savedAt: Date.now(), bytes: bytes.byteLength });
      }
    }
  }
  for (const r of mine) await legacy.delete(r);
  if (!(await legacy.keys()).length) {
    await caches.delete?.(LEGACY_CACHE);
    try {
      localStorage.removeItem(LEGACY_META_KEY);
    } catch {
      // Nothing else to clean up.
    }
  }
}

/** This deployment's saved map: the current version if present, else the newest older one. */
async function findSaved(): Promise<{ res: Response; current: boolean } | null> {
  const cache = await caches.open(cacheName());
  const hit = await cache.match(mapUrl());
  if (hit) return { res: hit, current: true };
  const older = (await cache.keys()).filter((r) => ours(r.url));
  const latest = older.at(-1);
  const res = latest ? await cache.match(latest) : undefined;
  return res ? { res, current: false } : null;
}

// ---------- A tiny shared store, so a download survives moving between screens ----------

let status: MapStatus = { state: 'checking' };
const listeners = new Set<(s: MapStatus) => void>();
let checking: Promise<void> | null = null;
let saving: Promise<void> | null = null;

function set(next: MapStatus) {
  status = next;
  for (const l of listeners) l(next);
}

export function getMapStatus(): MapStatus {
  return status;
}

/**
 * Looks in Cache Storage. Runs again whenever asked (the library calls it on
 * open and when the app comes back into view), because the browser can evict
 * the file at any time and "saved" must not stay on screen after that.
 */
export function checkMap(): Promise<void> {
  if (saving) return saving;
  checking ??= (async () => {
    if (!supported()) return set({ state: 'unsupported' });
    try {
      await migrateLegacy().catch(() => undefined);
      const found = await findSaved();
      const meta = readMeta();
      if (found) {
        const bytes = meta?.bytes ?? 0;
        set({ state: 'saved', savedAt: meta?.savedAt ?? Date.now(), bytes, outdated: !found.current });
      } else {
        writeMeta(null);
        set({ state: 'missing' });
      }
    } catch {
      set({ state: 'unsupported' });
    }
  })().finally(() => {
    checking = null;
  });
  return checking;
}

/**
 * Downloads the whole map file into this deployment's cache. The new copy is
 * written and read back before any older copy is removed, so a failed or
 * partial replacement (no space, connection dropped) keeps the last good map.
 */
export function saveMap(): Promise<void> {
  if (saving) return saving;
  saving = (async () => {
    if (!supported()) return set({ state: 'unsupported' });
    const hadOlder = status.state === 'saved';
    set({ state: 'saving', fraction: 0 });
    try {
      const res = await fetch(mapUrl(), { cache: 'no-store' });
      if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
      // GitHub Pages gzips the file: Content-Length is then the compressed size while the
      // body arrives decompressed, so the length only says what to expect when uncompressed.
      const encoding = (res.headers.get('content-encoding') ?? 'identity').trim().toLowerCase();
      const total = encoding === 'identity' ? Number(res.headers.get('content-length')) || 0 : 0;
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
      if (total && received !== total) throw new Error('Download incomplete');
      const file = new Uint8Array(received);
      let offset = 0;
      for (const c of chunks) {
        file.set(c, offset);
        offset += c.byteLength;
      }
      const cache = await caches.open(cacheName());
      try {
        await cache.put(
          mapUrl(),
          new Response(file, { headers: { 'Content-Type': 'application/vnd.pmtiles', 'Content-Length': String(received) } }),
        );
      } catch {
        throw new Error('Not enough storage space');
      }
      const check = await cache.match(mapUrl());
      if (!check || (await check.arrayBuffer()).byteLength !== received) {
        await cache.delete(mapUrl());
        throw new Error('Saved copy could not be read back');
      }
      // Only now drop this deployment's older versions.
      for (const req of await cache.keys()) if (req.url !== mapUrl() && ours(req.url)) await cache.delete(req);
      // Ask the browser not to evict it (no prompt in most browsers; may be ignored).
      void navigator.storage?.persist?.().catch(() => false);
      const meta = { version: mapVersion, savedAt: Date.now(), bytes: received };
      writeMeta(meta);
      set({ state: 'saved', savedAt: meta.savedAt, bytes: meta.bytes });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Download failed';
      const kept = hadOlder && (await findSaved().catch(() => null)) !== null;
      set({ state: 'error', message, keptOlder: kept });
    } finally {
      saving = null;
    }
  })();
  return saving;
}

/** The saved map file (current version, or an older one), or null (then the map streams from the network). */
export async function readSavedMap(): Promise<Blob | null> {
  if (!supported()) return null;
  try {
    const found = await findSaved();
    if (found) return await found.res.blob();
    // Evicted since the status was checked: say so.
    if (status.state === 'saved') set({ state: 'missing' });
    return null;
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
    // Coming back to the app: the file may have been evicted meanwhile.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkMap();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      listeners.delete(setS);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return s;
}

/** For tests. */
export function resetOfflineMapForTests(opts: { base?: string; version?: string } = {}) {
  status = { state: 'checking' };
  checking = null;
  saving = null;
  listeners.clear();
  deploymentBase = opts.base ?? import.meta.env.BASE_URL;
  mapVersion = opts.version ?? MAP_VERSION;
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
    case 'saved': {
      const date = new Date(s.savedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
      return s.outdated
        ? `An older map is saved for offline use (${date}). A newer one is available.`
        : `Map saved for offline use on ${date}.`;
    }
    case 'error':
      return s.keptOlder
        ? `Couldn’t save the new map (${s.message}). The map saved earlier is still used offline.`
        : `Couldn’t save the map (${s.message}). It loads while you’re online.`;
  }
}
