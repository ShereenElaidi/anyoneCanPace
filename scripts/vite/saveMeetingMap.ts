/**
 * Dev-server only (`apply: 'serve'`): lets the `?meeting-map` page save the
 * meeting-point picture into the repo. One fixed endpoint, two fixed files,
 * localhost requests only. Never part of a build.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'vite';

export const MEETING_MAP_ENDPOINT = '/__dev/meeting-map';
const IMAGE = 'src/assets/story/meeting-map.webp';
const META = 'src/data/meeting-map.json';
const MAX_BYTES = 5 * 1024 * 1024;

export function saveMeetingMap(root = process.cwd()): Plugin {
  return {
    name: 'dev-save-meeting-map',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(MEETING_MAP_ENDPOINT, (req, res) => {
        const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
        if (req.method !== 'POST' || !local) {
          res.statusCode = 403;
          res.end('Local POST only');
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        req.on('data', (c: Buffer) => {
          size += c.length;
          if (size <= MAX_BYTES) chunks.push(c);
        });
        req.on('end', () => {
          try {
            if (size > MAX_BYTES) throw new Error('Too big');
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { webp: string; meta: unknown };
            const image = Buffer.from(body.webp, 'base64');
            if (image.toString('ascii', 0, 4) !== 'RIFF' || image.toString('ascii', 8, 12) !== 'WEBP') throw new Error('Not a WebP');
            for (const [file, data] of [
              [IMAGE, image],
              [META, `${JSON.stringify(body.meta, null, 2)}\n`],
            ] as const) {
              const path = resolve(root, file);
              mkdirSync(dirname(path), { recursive: true });
              writeFileSync(path, data);
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ saved: [IMAGE, META], bytes: image.length }));
          } catch (err) {
            res.statusCode = 400;
            res.end(String(err));
          }
        });
      });
    },
  };
}
