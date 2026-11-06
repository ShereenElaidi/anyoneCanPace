/**
 * Dev-server only (`apply: 'serve'`): lets the `?story-sheet` page save its
 * example stories as PNG files in .cache/story-sheet/ (git-ignored), to look
 * at or send around. Localhost POSTs only, fixed folder, simple names.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

const DIR = '.cache/story-sheet';
const MAX_BYTES = 8 * 1024 * 1024;

export function saveStorySheet(root = process.cwd()): Plugin {
  return {
    name: 'dev-save-story-sheet',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/story-sheet', (req, res) => {
        const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
        const name = new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? '';
        if (req.method !== 'POST' || !local || !/^[a-z0-9-]{1,40}$/.test(name)) {
          res.statusCode = 403;
          res.end('Local POST with a simple ?name= only');
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        req.on('data', (c: Buffer) => {
          size += c.length;
          if (size <= MAX_BYTES) chunks.push(c);
        });
        req.on('end', () => {
          const png = Buffer.concat(chunks);
          if (size > MAX_BYTES || png.toString('ascii', 1, 4) !== 'PNG') {
            res.statusCode = 400;
            res.end('Not a PNG, or too big');
            return;
          }
          const dir = resolve(root, DIR);
          mkdirSync(dir, { recursive: true });
          writeFileSync(resolve(dir, `${name}.png`), png);
          res.end(`${DIR}/${name}.png`);
        });
      });
    },
  };
}
