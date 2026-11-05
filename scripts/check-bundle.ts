/**
 * Fails the build if the map libraries leak into the code the timer loads
 * first. Run after `vite build` (npm run build does this).
 *
 * "First load" = the entry script in dist/index.html plus every module and
 * stylesheet it preloads. MapLibre and PMTiles must only appear in lazy chunks.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

/** Strings that survive minification and only exist in these libraries. */
const SIGNATURES = [
  { lib: 'MapLibre GL', text: 'maplibre_preloaded_worker_pool' },
  { lib: 'MapLibre GL CSS', text: '.maplibregl-map' },
  { lib: 'PMTiles', text: 'Wrong magic number for PMTiles archive' },
];

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const firstLoad = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => m[1]);
if (!firstLoad.some((f) => f.endsWith('.js'))) throw new Error('No entry script found in dist/index.html');

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KiB`;
let failed = false;
let firstLoadBytes = 0;
console.log('\nFirst-load files (what the timer downloads):');
for (const ref of firstLoad) {
  const file = join(DIST, ref.replace(/^.*?assets\//, 'assets/'));
  const text = readFileSync(file, 'utf8');
  firstLoadBytes += text.length;
  console.log(`  ${ref.replace(/^.*?assets\//, 'assets/')}  ${kb(statSync(file).size)}`);
  for (const sig of SIGNATURES) {
    if (text.includes(sig.text)) {
      console.error(`  ✗ ${sig.lib} found in ${ref}: it must be lazy-loaded.`);
      failed = true;
    }
  }
}
console.log(`  total ${kb(firstLoadBytes)} (uncompressed)`);

console.log('\nLazy chunks:');
for (const f of readdirSync(join(DIST, 'assets')).sort()) {
  const ref = `assets/${f}`;
  if (firstLoad.some((r) => r.endsWith(ref))) continue;
  if (!/\.(m?js|css)$/.test(f)) continue;
  console.log(`  ${ref}  ${kb(statSync(join(DIST, ref)).size)}`);
}

if (failed) process.exit(1);
console.log('\n✓ Map libraries are not in the first-load bundle.');
