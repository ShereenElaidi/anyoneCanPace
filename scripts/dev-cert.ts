/**
 * Makes a self-signed HTTPS certificate for testing on a phone over Wi-Fi
 * (GPS needs a secure page). Used by `npm run dev:https` / `preview:https`.
 * Needs `openssl` (built into macOS and most Linux). Nothing is installed.
 *
 * The certificate covers localhost and this machine's current LAN addresses,
 * lives in .cache/dev-cert/ (git-ignored) and is re-made after 30 days or
 * when the LAN address changes. Phones show a warning you must accept once.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, '.cache', 'dev-cert');
const KEY = join(DIR, 'key.pem');
const CERT = join(DIR, 'cert.pem');
const SAN_FILE = join(DIR, 'san.txt');

const lanIps = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => i!.address);
const san = ['DNS:localhost', 'IP:127.0.0.1', ...lanIps.map((ip) => `IP:${ip}`)].join(',');

const fresh =
  existsSync(CERT) &&
  existsSync(KEY) &&
  existsSync(SAN_FILE) &&
  readFileSync(SAN_FILE, 'utf8') === san &&
  Date.now() - statSync(CERT).mtimeMs < 29 * 24 * 3600 * 1000;

if (!fresh) {
  mkdirSync(DIR, { recursive: true });
  execFileSync(
    'openssl',
    ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '30', '-keyout', KEY, '-out', CERT, '-subj', '/CN=AnyoneCanPace dev', '-addext', `subjectAltName=${san}`],
    { stdio: 'ignore' },
  );
  writeFileSync(SAN_FILE, san);
  console.log('Made a new self-signed certificate in .cache/dev-cert/.');
}
for (const ip of lanIps) console.log(`On your phone (same Wi-Fi): https://${ip}:<port>/anyoneCanPace/  (accept the warning once)`);
