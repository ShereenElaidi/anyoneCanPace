/**
 * Cuts the self-hosted street map (public/maps/montreal.pmtiles) out of the
 * Protomaps daily planet build, using the `pmtiles` CLI (go-pmtiles).
 *
 *   npm run map                       default area: every route in the library + ~1.1 km
 *   npm run map -- --bbox=-73.98,45.40,-73.47,45.71   a fixed box, e.g. the whole island (~55 MB)
 *   npm run map -- --build=20261104   a specific Protomaps build
 *
 * The CLI is downloaded once into .cache/tools/ (git-ignored) if it isn't on
 * your PATH. Only the tiles inside the box are fetched (HTTP range requests).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { arch, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS = join(ROOT, '.cache', 'tools');
const OUT = join(ROOT, 'public', 'maps', 'montreal.pmtiles');
const PMTILES_VERSION = '1.31.2';

const ROUTES_DIR = join(ROOT, 'src', 'data', 'routes');
/** Map margin around the routes, so the area near the start and any detour shows. */
const BUFFER_M = 1100;
const MAX_ZOOM = 15;

/** West,south,east,north covering every processed route plus the buffer. */
function routesBbox(): string {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of readdirSync(ROUTES_DIR)) {
    if (!f.endsWith('.json') || f === 'manifest.json') continue;
    const { bbox } = JSON.parse(readFileSync(join(ROUTES_DIR, f), 'utf8')) as { bbox: [number, number, number, number] };
    [w, s, e, n] = [Math.min(w, bbox[0]), Math.min(s, bbox[1]), Math.max(e, bbox[2]), Math.max(n, bbox[3])];
  }
  if (!Number.isFinite(w)) throw new Error('No processed routes: run npm run routes first, or pass --bbox.');
  const dLat = BUFFER_M / 111_320;
  const dLon = BUFFER_M / (111_320 * Math.cos((((s + n) / 2) * Math.PI) / 180));
  return [w - dLon, s - dLat, e + dLon, n + dLat].map((v) => v.toFixed(4)).join(',');
}

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

function findCli(): string {
  try {
    execFileSync('pmtiles', ['version'], { stdio: 'ignore' });
    return 'pmtiles';
  } catch {
    // Not on PATH: use or fetch a local copy.
  }
  const local = join(TOOLS, 'pmtiles');
  if (existsSync(local)) return local;
  const os = platform() === 'darwin' ? 'Darwin' : platform() === 'linux' ? 'Linux' : null;
  const cpu = arch() === 'arm64' ? 'arm64' : arch() === 'x64' ? 'x86_64' : null;
  if (!os || !cpu) throw new Error('Install the pmtiles CLI from https://github.com/protomaps/go-pmtiles/releases');
  const ext = os === 'Darwin' ? 'zip' : 'tar.gz';
  const url = `https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/go-pmtiles_${PMTILES_VERSION}_${os}_${cpu}.${ext}`;
  const altUrl = url.replace('go-pmtiles_', 'go-pmtiles-');
  mkdirSync(TOOLS, { recursive: true });
  const archive = join(TOOLS, `pmtiles.${ext}`);
  console.log(`Downloading pmtiles CLI v${PMTILES_VERSION}…`);
  try {
    execFileSync('curl', ['-fsSL', '-o', archive, altUrl], { stdio: 'inherit' });
  } catch {
    execFileSync('curl', ['-fsSL', '-o', archive, url], { stdio: 'inherit' });
  }
  if (ext === 'zip') execFileSync('unzip', ['-o', '-q', archive, 'pmtiles', '-d', TOOLS]);
  else execFileSync('tar', ['-xzf', archive, '-C', TOOLS, 'pmtiles']);
  return local;
}

async function latestBuild(): Promise<string> {
  const res = await fetch('https://build-metadata.protomaps.dev/builds.json');
  if (!res.ok) throw new Error(`Could not list Protomaps builds (${res.status})`);
  const builds = (await res.json()) as { key: string }[];
  const latest = builds.map((b) => b.key).sort().at(-1);
  if (!latest) throw new Error('No Protomaps builds listed');
  return latest.replace(/\.pmtiles$/, '');
}

async function main() {
  const bbox = arg('bbox') ?? routesBbox();
  const build = arg('build') ?? (await latestBuild());
  const cli = findCli();
  mkdirSync(dirname(OUT), { recursive: true });
  console.log(`Extracting ${bbox} (z0–${MAX_ZOOM}) from Protomaps build ${build}…`);
  execFileSync(
    cli,
    ['extract', `https://build.protomaps.com/${build}.pmtiles`, OUT, `--bbox=${bbox}`, `--maxzoom=${MAX_ZOOM}`],
    { stdio: 'inherit' },
  );
  const mb = statSync(OUT).size / 1024 / 1024;
  console.log(`\nWrote public/maps/montreal.pmtiles (${mb.toFixed(1)} MB) from build ${build}.`);
  console.log('Bump MAP_VERSION in src/sixk/map/offlineMap.ts so phones fetch the new file.');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
